import { defineStore } from 'pinia'
import { HEX_ORIENTATIONS } from '@/utils/hexGrid'
import { SELECTION_SHAPES, SELECTION_MODES, SELECTION_BEHAVIORS } from '@/utils/selection'

/**
 * Типы масштабов карт
 */
export const MAP_SCALES = {
  BATTLE: 'battle',         // 1 гекс = 1-2 метра (боевая сцена)
  LOCATION: 'location',     // 1 гекс = 10-50 метров (здание, двор)
  DISTRICT: 'district',     // 1 гекс = 100-500 метров (район города)
  CITY: 'city',             // 1 гекс = 1-5 км (город, крепость)
  REGION: 'region',         // 1 гекс = 10-50 км (регион)
  WORLD: 'world'            // 1 гекс = 100+ км (континент)
}

/**
 * Типы слоёв карты
 */
export const LAYER_TYPES = {
  TERRAIN: 'terrain',       // Базовый ландшафт (трава, вода, камень)
  FEATURES: 'features',     // Природные объекты (деревья, скалы)
  STRUCTURES: 'structures', // Постройки (здания, мосты, стены)
  TOKENS: 'tokens',         // Игровые токены (персонажи, NPC)
  FOG: 'fog',               // Туман войны
  GM_NOTES: 'gm_notes'      // Заметки мастера (невидимы игрокам)
}

/**
 * DEPRECATED: Старые типы террейна - используются как фоллбэк
 * Новая система террейнов в src/data/terrains.json и stores/terrain.js
 */
export const TERRAIN_TYPES = {
  void: { name: 'Пустота', color: '#0d1117', passable: false },
  grass: { name: 'Трава', color: '#4caf50', passable: true },
  tall_grass: { name: 'Высокая трава', color: '#7cb342', passable: true },
  forest_light: { name: 'Редколесье', color: '#66bb6a', passable: true },
  forest_dense: { name: 'Густой лес', color: '#2e7d32', passable: true },
  sand: { name: 'Песок', color: '#ffd54f', passable: true },
  dunes: { name: 'Дюны', color: '#ffc107', passable: true },
  shallow_water: { name: 'Мелководье', color: '#4fc3f7', passable: true },
  deep_water: { name: 'Глубокая вода', color: '#1565c0', passable: false },
  swamp: { name: 'Болото', color: '#6d4c41', passable: true },
  rocks: { name: 'Камни', color: '#90a4ae', passable: true },
  cliff: { name: 'Утёс', color: '#607d8b', passable: false },
  snow: { name: 'Снег', color: '#eceff1', passable: true },
  ice: { name: 'Лёд', color: '#b3e5fc', passable: true },
  lava: { name: 'Лава', color: '#ff5722', passable: false },
  volcanic_rock: { name: 'Вулканический камень', color: '#3e2723', passable: true },
  road_dirt: { name: 'Грунтовая дорога', color: '#a1887f', passable: true },
  road_stone: { name: 'Каменная дорога', color: '#9e9e9e', passable: true },
  floor_wood: { name: 'Деревянный пол', color: '#8d6e63', passable: true },
  floor_stone: { name: 'Каменный пол', color: '#757575', passable: true },
  wall: { name: 'Стена', color: '#424242', passable: false },
  dungeon_floor: { name: 'Пол подземелья', color: '#455a64', passable: true },
  dungeon_wall: { name: 'Стена подземелья', color: '#263238', passable: false }
}

/**
 * Генератор уникальных ID
 */
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * Создать пустой слой
 */
const createLayer = (type, options = {}) => ({
  id: generateId(),
  type,
  name: options.name || LAYER_TYPES[type] || type,
  visible: options.visible !== false,
  locked: options.locked || false,
  opacity: options.opacity ?? 1,
  data: new Map() // hexKey -> объект слоя
})

/**
 * Создать пустую карту
 */
const createEmptyMap = (options = {}) => ({
  id: generateId(),
  name: options.name || 'Новая карта',
  description: options.description || '',
  scale: options.scale || MAP_SCALES.BATTLE,
  orientation: options.orientation || HEX_ORIENTATIONS.FLAT,
  hexSize: options.hexSize || 32,
  // Карта бесконечная - размеры определяются наличием гексов
  // Центр карты - координаты (0, 0)
  
  // Слои карты
  layers: [
    createLayer(LAYER_TYPES.TERRAIN, { name: 'Ландшафт' }),
    createLayer(LAYER_TYPES.FEATURES, { name: 'Объекты' }),
    createLayer(LAYER_TYPES.STRUCTURES, { name: 'Постройки' }),
    createLayer(LAYER_TYPES.TOKENS, { name: 'Токены' }),
    createLayer(LAYER_TYPES.FOG, { name: 'Туман войны', visible: false }),
    createLayer(LAYER_TYPES.GM_NOTES, { name: 'Заметки ГМ', visible: false })
  ],
  
  // Метаданные
  createdAt: Date.now(),
  updatedAt: Date.now(),
  createdBy: options.createdBy || null,
  
  // Настройки видимости для игроков
  visibility: {
    published: false,          // Опубликована ли карта для игроков
    showGrid: true,            // Показывать сетку
    showCoordinates: false,    // Показывать координаты гексов
    allowPlayerTokenMove: true // Разрешить игрокам двигать свои токены
  },
  
  // Кэшированное изображение (base64 или null)
  bakedImage: null,
  bakedAt: null
})

/**
 * Сериализация Map в массив для JSON
 */
const serializeLayerData = (layerDataMap) => {
  if (!(layerDataMap instanceof Map)) return []
  return Array.from(layerDataMap.entries())
}

/**
 * Десериализация массива обратно в Map
 */
const deserializeLayerData = (layerDataArray) => {
  if (!Array.isArray(layerDataArray)) return new Map()
  return new Map(layerDataArray)
}

/**
 * Сериализация карты для сохранения/передачи
 */
const serializeMap = (map) => {
  return {
    ...map,
    layers: map.layers.map(layer => ({
      ...layer,
      data: serializeLayerData(layer.data)
    }))
  }
}

/**
 * Десериализация карты
 */
const deserializeMap = (mapData) => {
  return {
    ...mapData,
    layers: mapData.layers.map(layer => ({
      ...layer,
      data: deserializeLayerData(layer.data)
    }))
  }
}

export const useBattleMapStore = defineStore('battleMap', {
  state: () => ({
    // Все карты
    maps: [],
    
    // ID текущей активной карты
    activeMapId: null,
    
    // ID карты, открытой для редактирования (для мастера)
    editingMapId: null,
    
    // Режим редактора
    editorMode: 'select', // select, paint, erase
    
    // Выбранный инструмент/террейн для рисования
    selectedTerrain: 'grass',
    selectedObject: null,
    
    // ID активного слоя для редактирования
    activeLayerId: null,
    
    // === Настройки инструмента выделения ===
    selection: {
      shape: SELECTION_SHAPES.RECTANGLE,      // Форма выделения
      mode: SELECTION_MODES.REPLACE,          // Режим применения
      behavior: SELECTION_BEHAVIORS.STANDARD, // Поведение захвата гексов
      lineWidth: 2                            // Ширина линии (в гексах)
    },
    
    // Кастомные ассеты (загруженные мастером)
    customAssets: new Map(), // id -> { id, name, type, dataUrl, thumbnail }
    
    // Позиция камеры (для pan/zoom)
    camera: {
      x: 0,
      y: 0,
      zoom: 1
    }
  }),
  
  persist: {
    key: 'trip-battlemap-v1',
    paths: ['maps', 'activeMapId', 'customAssets'],
    serializer: {
      serialize: (state) => {
        return JSON.stringify({
          maps: state.maps.map(serializeMap),
          activeMapId: state.activeMapId,
          customAssets: Array.from(state.customAssets?.entries?.() || [])
        })
      },
      deserialize: (stored) => {
        const data = JSON.parse(stored)
        return {
          maps: (data.maps || []).map(deserializeMap),
          activeMapId: data.activeMapId,
          customAssets: new Map(data.customAssets || [])
        }
      }
    }
  },
  
  getters: {
    /**
     * Текущая активная карта
     */
    activeMap: (state) => {
      return state.maps.find(m => m.id === state.activeMapId) || null
    },
    
    /**
     * Карта в режиме редактирования
     */
    editingMap: (state) => {
      return state.maps.find(m => m.id === state.editingMapId) || null
    },
    
    /**
     * Активный слой текущей карты
     */
    activeLayer: (state) => {
      const map = state.maps.find(m => m.id === state.activeMapId)
      if (!map) return null
      return map.layers.find(l => l.id === state.activeLayerId) || map.layers[0]
    },
    
    /**
     * Карты, опубликованные для игроков
     */
    publishedMaps: (state) => {
      return state.maps.filter(m => m.visibility?.published)
    },
    
    /**
     * Карты по масштабу
     */
    mapsByScale: (state) => (scale) => {
      return state.maps.filter(m => m.scale === scale)
    },
    
    /**
     * Все типы террейна (встроенные + кастомные из ассетов)
     * DEPRECATED: Для полной системы используй useTerrainStore
     */
    allTerrainTypes: (state) => {
      const custom = {}
      state.customAssets.forEach((asset, id) => {
        if (asset.type === 'terrain') {
          custom[id] = { name: asset.name, color: '#888888', custom: true, dataUrl: asset.dataUrl }
        }
      })
      return { ...TERRAIN_TYPES, ...custom }
    },
    
    /**
     * Получить данные о террейне по ID (совместимость со старой и новой системой)
     */
    getTerrainInfo: (state) => (terrainId) => {
      // Сначала проверяем старые TERRAIN_TYPES
      if (TERRAIN_TYPES[terrainId]) {
        return {
          id: terrainId,
          ...TERRAIN_TYPES[terrainId],
          fallbackColor: TERRAIN_TYPES[terrainId].color
        }
      }
      
      // Проверяем кастомные ассеты
      const customAsset = state.customAssets.get(terrainId)
      if (customAsset && customAsset.type === 'terrain') {
        return {
          id: terrainId,
          name: customAsset.name,
          fallbackColor: '#888888',
          image: customAsset.dataUrl,
          custom: true
        }
      }
      
      // Возвращаем void как дефолт
      return {
        id: 'void',
        name: 'Пустота',
        fallbackColor: '#0d1117',
        passable: false
      }
    }
  },
  
  actions: {
    /**
     * Создать новую карту
     */
    createMap(options = {}) {
      const map = createEmptyMap(options)
      this.maps.push(map)
      this.activeMapId = map.id
      this.activeLayerId = map.layers[0]?.id
      return map
    },
    
    /**
     * Удалить карту
     */
    deleteMap(mapId) {
      const index = this.maps.findIndex(m => m.id === mapId)
      if (index !== -1) {
        this.maps.splice(index, 1)
        if (this.activeMapId === mapId) {
          this.activeMapId = this.maps[0]?.id || null
        }
        if (this.editingMapId === mapId) {
          this.editingMapId = null
        }
      }
    },
    
    /**
     * Дублировать карту
     */
    duplicateMap(mapId) {
      const source = this.maps.find(m => m.id === mapId)
      if (!source) return null
      
      const copy = deserializeMap(serializeMap(source))
      copy.id = generateId()
      copy.name = `${source.name} (копия)`
      copy.createdAt = Date.now()
      copy.updatedAt = Date.now()
      copy.visibility.published = false
      copy.bakedImage = null
      
      // Генерируем новые ID для слоёв
      copy.layers = copy.layers.map(layer => ({
        ...layer,
        id: generateId()
      }))
      
      this.maps.push(copy)
      return copy
    },
    
    /**
     * Установить активную карту
     */
    setActiveMap(mapId) {
      this.activeMapId = mapId
      const map = this.maps.find(m => m.id === mapId)
      if (map) {
        this.activeLayerId = map.layers[0]?.id
      }
    },
    
    /**
     * Войти в режим редактирования карты
     */
    startEditing(mapId) {
      this.editingMapId = mapId
      this.setActiveMap(mapId)
    },
    
    /**
     * Выйти из режима редактирования
     */
    stopEditing() {
      this.editingMapId = null
    },
    
    /**
     * Обновить данные карты
     */
    updateMap(mapId, updates) {
      const map = this.maps.find(m => m.id === mapId)
      if (map) {
        Object.assign(map, updates, { updatedAt: Date.now() })
      }
    },
    
    /**
     * Установить террейн в гексе
     */
    setHexTerrain(mapId, q, r, terrainType) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return
      
      const terrainLayer = map.layers.find(l => l.type === LAYER_TYPES.TERRAIN)
      if (!terrainLayer) return
      
      const key = `${q},${r}`
      terrainLayer.data.set(key, { terrain: terrainType })
      map.updatedAt = Date.now()
      map.bakedImage = null // Инвалидируем кэш
    },
    
    /**
     * Получить террейн гекса
     */
    getHexTerrain(mapId, q, r) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return 'void'
      
      const terrainLayer = map.layers.find(l => l.type === LAYER_TYPES.TERRAIN)
      if (!terrainLayer) return 'void'
      
      const key = `${q},${r}`
      return terrainLayer.data.get(key)?.terrain || 'void'
    },
    
    /**
     * Добавить объект в гекс (на слой features/structures)
     */
    addHexObject(mapId, layerType, q, r, objectData) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return
      
      const layer = map.layers.find(l => l.type === layerType)
      if (!layer) return
      
      const key = `${q},${r}`
      const existing = layer.data.get(key) || { objects: [] }
      existing.objects = existing.objects || []
      existing.objects.push({
        id: generateId(),
        ...objectData
      })
      layer.data.set(key, existing)
      map.updatedAt = Date.now()
      map.bakedImage = null
    },
    
    /**
     * Удалить объект из гекса
     */
    removeHexObject(mapId, layerType, q, r, objectId) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return
      
      const layer = map.layers.find(l => l.type === layerType)
      if (!layer) return
      
      const key = `${q},${r}`
      const data = layer.data.get(key)
      if (data?.objects) {
        data.objects = data.objects.filter(obj => obj.id !== objectId)
        layer.data.set(key, data)
        map.updatedAt = Date.now()
        map.bakedImage = null
      }
    },
    
    // ========== ТОКЕНЫ ПЕРСОНАЖЕЙ ==========
    
    /**
     * Разместить токен персонажа на карте
     * @param {string} mapId - ID карты
     * @param {string} characterId - ID персонажа
     * @param {number} q - координата q гекса
     * @param {number} r - координата r гекса
     * @param {number} facing - направление взгляда (0-5, 0 = вправо для flat-top)
     */
    placeToken(mapId, characterId, q, r, facing = 0) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return false
      
      const tokensLayer = map.layers.find(l => l.type === LAYER_TYPES.TOKENS)
      if (!tokensLayer) return false
      
      // Проверяем, не занят ли гекс другим токеном
      const key = `${q},${r}`
      if (tokensLayer.data.has(key)) {
        console.warn(`Hex ${key} already has a token`)
        return false
      }
      
      // Удаляем токен этого персонажа с других позиций (если есть)
      this.removeTokenByCharacterId(mapId, characterId)
      
      // Размещаем токен
      tokensLayer.data.set(key, {
        characterId,
        facing,
        placedAt: Date.now()
      })
      
      map.updatedAt = Date.now()
      return true
    },
    
    /**
     * Переместить токен в другой гекс
     */
    moveToken(mapId, fromQ, fromR, toQ, toR) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return false
      
      const tokensLayer = map.layers.find(l => l.type === LAYER_TYPES.TOKENS)
      if (!tokensLayer) return false
      
      const fromKey = `${fromQ},${fromR}`
      const toKey = `${toQ},${toR}`
      
      // Проверяем что есть токен на исходной позиции
      const tokenData = tokensLayer.data.get(fromKey)
      if (!tokenData) return false
      
      // Проверяем что целевая позиция свободна
      if (tokensLayer.data.has(toKey)) {
        console.warn(`Target hex ${toKey} already has a token`)
        return false
      }
      
      // Перемещаем
      tokensLayer.data.delete(fromKey)
      tokensLayer.data.set(toKey, {
        ...tokenData,
        movedAt: Date.now()
      })
      
      map.updatedAt = Date.now()
      return true
    },
    
    /**
     * Повернуть токен (изменить направление взгляда)
     */
    rotateToken(mapId, q, r, newFacing) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return false
      
      const tokensLayer = map.layers.find(l => l.type === LAYER_TYPES.TOKENS)
      if (!tokensLayer) return false
      
      const key = `${q},${r}`
      const tokenData = tokensLayer.data.get(key)
      if (!tokenData) return false
      
      tokenData.facing = ((newFacing % 6) + 6) % 6 // Нормализуем 0-5
      map.updatedAt = Date.now()
      return true
    },
    
    /**
     * Удалить токен из гекса
     */
    removeToken(mapId, q, r) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return false
      
      const tokensLayer = map.layers.find(l => l.type === LAYER_TYPES.TOKENS)
      if (!tokensLayer) return false
      
      const key = `${q},${r}`
      if (tokensLayer.data.has(key)) {
        tokensLayer.data.delete(key)
        map.updatedAt = Date.now()
        return true
      }
      return false
    },
    
    /**
     * Удалить токен персонажа по его ID (откуда бы он ни был)
     */
    removeTokenByCharacterId(mapId, characterId) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return false
      
      const tokensLayer = map.layers.find(l => l.type === LAYER_TYPES.TOKENS)
      if (!tokensLayer) return false
      
      for (const [key, data] of tokensLayer.data.entries()) {
        if (data.characterId === characterId) {
          tokensLayer.data.delete(key)
          map.updatedAt = Date.now()
          return true
        }
      }
      return false
    },
    
    /**
     * Переместить токен персонажа по его ID в новые координаты
     * Используется для синхронизации от мастера к игрокам
     */
    moveTokenByCharacterId(mapId, characterId, toQ, toR) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return false
      
      const tokensLayer = map.layers.find(l => l.type === LAYER_TYPES.TOKENS)
      if (!tokensLayer) return false
      
      // Находим токен по characterId
      let fromKey = null
      let tokenData = null
      for (const [key, data] of tokensLayer.data.entries()) {
        if (data.characterId === characterId) {
          fromKey = key
          tokenData = data
          break
        }
      }
      
      if (!fromKey || !tokenData) return false
      
      const toKey = `${toQ},${toR}`
      
      // Если уже на нужной позиции - ничего не делаем
      if (fromKey === toKey) return true
      
      // Проверяем что целевая позиция свободна
      if (tokensLayer.data.has(toKey)) {
        console.warn(`Target hex ${toKey} already has a token`)
        return false
      }
      
      // Перемещаем
      tokensLayer.data.delete(fromKey)
      tokensLayer.data.set(toKey, {
        ...tokenData,
        movedAt: Date.now()
      })
      
      map.updatedAt = Date.now()
      return true
    },
    
    /**
     * Получить токен в гексе
     */
    getToken(mapId, q, r) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return null
      
      const tokensLayer = map.layers.find(l => l.type === LAYER_TYPES.TOKENS)
      if (!tokensLayer) return null
      
      const key = `${q},${r}`
      return tokensLayer.data.get(key) || null
    },
    
    /**
     * Получить все токены на карте
     * @returns {Array<{q, r, characterId, facing}>}
     */
    getAllTokens(mapId) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return []
      
      const tokensLayer = map.layers.find(l => l.type === LAYER_TYPES.TOKENS)
      if (!tokensLayer) return []
      
      const tokens = []
      for (const [key, data] of tokensLayer.data.entries()) {
        const [q, r] = key.split(',').map(Number)
        tokens.push({
          q,
          r,
          ...data
        })
      }
      return tokens
    },
    
    /**
     * Найти позицию токена персонажа
     * @returns {{q, r, facing} | null}
     */
    findTokenPosition(mapId, characterId) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return null
      
      const tokensLayer = map.layers.find(l => l.type === LAYER_TYPES.TOKENS)
      if (!tokensLayer) return null
      
      for (const [key, data] of tokensLayer.data.entries()) {
        if (data.characterId === characterId) {
          const [q, r] = key.split(',').map(Number)
          return { q, r, facing: data.facing }
        }
      }
      return null
    },
    
    /**
     * Переключить видимость слоя
     */
    toggleLayerVisibility(mapId, layerId) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return
      
      const layer = map.layers.find(l => l.id === layerId)
      if (layer) {
        layer.visible = !layer.visible
      }
    },
    
    /**
     * Установить активный слой
     */
    setActiveLayer(layerId) {
      this.activeLayerId = layerId
    },
    
    /**
     * Опубликовать/скрыть карту для игроков
     */
    toggleMapPublished(mapId) {
      const map = this.maps.find(m => m.id === mapId)
      if (map) {
        map.visibility.published = !map.visibility.published
        map.updatedAt = Date.now()
      }
    },
    
    /**
     * Добавить кастомный ассет
     */
    addCustomAsset(asset) {
      this.customAssets.set(asset.id, asset)
    },
    
    /**
     * Удалить кастомный ассет
     */
    removeCustomAsset(assetId) {
      this.customAssets.delete(assetId)
    },
    
    /**
     * Сохранить запечённое изображение карты
     */
    setBakedImage(mapId, dataUrl) {
      const map = this.maps.find(m => m.id === mapId)
      if (map) {
        map.bakedImage = dataUrl
        map.bakedAt = Date.now()
      }
    },
    
    /**
     * Сбросить камеру
     */
    resetCamera() {
      this.camera = { x: 0, y: 0, zoom: 1 }
    },
    
    /**
     * Изменить масштаб камеры
     */
    setZoom(zoom) {
      this.camera.zoom = Math.max(0.25, Math.min(4, zoom))
    },
    
    /**
     * Сдвинуть камеру
     */
    panCamera(dx, dy) {
      this.camera.x += dx
      this.camera.y += dy
    },
    
    /**
     * Сериализовать карту для передачи по сети
     */
    exportMapForNetwork(mapId) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return null
      
      // Отправляем только нужные данные (без GM-заметок и т.п.)
      const exportData = serializeMap(map)
      
      // Фильтруем слои, невидимые для игроков
      exportData.layers = exportData.layers.filter(l => 
        l.type !== LAYER_TYPES.GM_NOTES
      )
      
      return exportData
    },
    
    /**
     * Импортировать карту из сетевых данных
     */
    importMapFromNetwork(mapData) {
      const map = deserializeMap(mapData)
      
      // Проверяем, есть ли уже такая карта
      const existingIndex = this.maps.findIndex(m => m.id === map.id)
      if (existingIndex !== -1) {
        // Обновляем существующую
        this.maps[existingIndex] = map
      } else {
        // Добавляем новую
        this.maps.push(map)
      }
      
      return map
    },
    
    /**
     * Установить режим редактора
     */
    setEditorMode(mode) {
      this.editorMode = mode
    },
    
    /**
     * Выбрать террейн для рисования
     */
    selectTerrain(terrainType) {
      this.selectedTerrain = terrainType
    },
    
    // === Методы для инструмента выделения ===
    
    /**
     * Установить форму выделения
     */
    setSelectionShape(shape) {
      this.selection.shape = shape
    },
    
    /**
     * Установить режим выделения
     */
    setSelectionMode(mode) {
      this.selection.mode = mode
    },
    
    /**
     * Установить поведение захвата
     */
    setSelectionBehavior(behavior) {
      this.selection.behavior = behavior
    },
    
    /**
     * Установить ширину линии
     */
    setSelectionLineWidth(width) {
      this.selection.lineWidth = Math.max(0, Math.min(10, width))
    },
    
    /**
     * Заполнить выбранные гексы террейном
     */
    fillSelectedHexes(hexKeys, terrainType) {
      const mapId = this.activeMapId
      if (!mapId) return
      
      for (const key of hexKeys) {
        const [q, r] = key.split(',').map(Number)
        this.setHexTerrain(mapId, q, r, terrainType)
      }
    },
    
    /**
     * Удалить выбранные гексы
     */
    deleteSelectedHexes(hexKeys) {
      const map = this.maps.find(m => m.id === this.activeMapId)
      if (!map) return
      
      const terrainLayer = map.layers.find(l => l.type === LAYER_TYPES.TERRAIN)
      if (!terrainLayer) return
      
      for (const key of hexKeys) {
        terrainLayer.data.delete(key)
      }
      
      map.updatedAt = Date.now()
      map.bakedImage = null
    },
    
    // ============= СИНХРОНИЗАЦИЯ =============
    
    /**
     * Получить сериализованную карту для передачи
     */
    getSerializedMap(mapId = null) {
      const id = mapId || this.activeMapId
      const map = this.maps.find(m => m.id === id)
      if (!map) return null
      return serializeMap(map)
    },
    
    /**
     * Применить полученную карту (для игроков)
     */
    applyReceivedMap(serializedMap) {
      if (!serializedMap || !serializedMap.id) return
      
      const deserialized = deserializeMap(serializedMap)
      
      // Ищем существующую карту с таким ID
      const existingIndex = this.maps.findIndex(m => m.id === deserialized.id)
      
      if (existingIndex !== -1) {
        // Обновляем существующую
        this.maps[existingIndex] = deserialized
      } else {
        // Добавляем новую
        this.maps.push(deserialized)
      }
      
      // Устанавливаем как активную
      this.activeMapId = deserialized.id
      this.activeLayerId = deserialized.layers[0]?.id
    },
    
    /**
     * Применить инкрементальное обновление террейна
     */
    applyTerrainUpdate(mapId, updates) {
      const map = this.maps.find(m => m.id === mapId)
      if (!map) return
      
      const terrainLayer = map.layers.find(l => l.type === LAYER_TYPES.TERRAIN)
      if (!terrainLayer) return
      
      for (const { key, terrain } of updates) {
        if (terrain === null) {
          terrainLayer.data.delete(key)
        } else {
          terrainLayer.data.set(key, { terrain })
        }
      }
      
      map.updatedAt = Date.now()
      map.bakedImage = null
    }
  }
})
