/**
 * Store для управления террейнами карты
 * Базовые террейны + кастомные от мастера
 * 
 * v2: Поддержка слоёв для процедурной генерации текстур
 * v3: Категории тегов и правила переходов
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import terrainsData from '@/data/terrains.json'
import terrainCategoriesData from '@/data/terrainCategories.json'
import { 
  TerrainLayerRenderer, 
  renderTerrainCached, 
  createLayer,
  LayerPresets,
  LAYER_TYPES,
  NOISE_TYPES,
  PATTERN_TYPES,
  BLEND_MODES
} from '@/utils/rendering/terrainLayerRenderer.js'
import { convertLegacyStyle } from '@/utils/rendering/boundaryEffects.js'

/**
 * Типы видимости
 */
export const VISIBILITY_TYPES = {
  OPEN: 'open',           // Полностью открытая
  PARTIAL: 'partial',     // Маскирующая (частичная)
  BLOCKING: 'blocking'    // Блокирующая
}

/**
 * Диапазоны значений
 */
export const TERRAIN_LIMITS = {
  MOVEMENT_COST: { min: 1, max: 5 },
  MELEE_ADVANTAGE: { min: -2, max: 2 }
}

// Re-export layer types для использования в компонентах
export { LAYER_TYPES, NOISE_TYPES, PATTERN_TYPES, BLEND_MODES, createLayer, LayerPresets }

/**
 * Дефолтная визуальная конфигурация для нового террейна
 */
export const DEFAULT_TERRAIN_VISUALS = {
  // Используем слои вместо просто цвета
  layers: [],
  // Закэшированное изображение (dataURL)
  cachedImage: null,
  // Версия кэша (инкрементится при изменении слоёв)
  cacheVersion: 0
}

export const useTerrainStore = defineStore('terrain', () => {
  // ===== STATE =====
  
  // Базовые террейны (из JSON, неизменяемые)
  const baseTerrains = ref(terrainsData.terrains)
  
  // Кастомные террейны мастера (сохраняются)
  const customTerrains = ref([])
  
  // Биомы
  const biomes = ref(terrainsData.biomes)
  
  // Типы видимости
  const visibilityTypes = ref(terrainsData.visibility)
  
  // Загруженные изображения (кэш)
  const imageCache = ref(new Map())
  
  // Глобальные настройки освещения для карты
  const lightingSettings = ref({
    shadowAngle: 135,      // Угол тени в градусах (0 = вправо, 90 = вниз, 180 = влево, 270 = вверх)
    shadowLength: 5,       // Базовая длина тени в пикселях
    shadowOpacity: 0.4,    // Базовая непрозрачность теней
    enabled: true          // Включены ли тени глобально
  })
  
  // ===== ШАБЛОНЫ КАРТ =====
  
  // Сохранённые шаблоны карт
  // Каждый шаблон: { id, name, hexes: Map<key, {terrain}>, createdAt, updatedAt }
  const mapTemplates = ref([])
  
  // ID выбранного шаблона для редактирования
  const activeTemplateId = ref(null)
  
  // Фильтры
  const filters = ref({
    search: '',
    biome: null,
    visibility: null,
    movementCostMin: 1,
    movementCostMax: 5,
    meleeAdvantageMin: -2,
    meleeAdvantageMax: 2,
    tags: []
  })
  
  // ===== КАТЕГОРИИ И ПРАВИЛА ПЕРЕХОДОВ =====
  
  // Категории тегов (из JSON)
  const tagCategories = ref(terrainCategoriesData.categories)
  
  // Стили переходов (из JSON)
  const transitionStyles = ref(terrainCategoriesData.transitionStyles)
  
  // Кастомные правила переходов (3 уровня приоритета):
  // 1. tag-to-tag — от тега к тегу (самый общий)
  // 2. terrain-to-tag — от конкретного террейна к тегу
  // 3. terrain-to-terrain — от террейна к террейну (самый приоритетный)
  const customTransitionRules = ref([])
  
  // Дефолтные правила (из JSON)
  const defaultTransitionRules = ref(terrainCategoriesData.defaultTransitionRules)
  
  // ===== GETTERS =====
  
  /**
   * Все террейны (базовые + кастомные)
   */
  const allTerrains = computed(() => {
    return [...baseTerrains.value, ...customTerrains.value]
  })
  
  /**
   * Все уникальные теги
   */
  const allTags = computed(() => {
    const tagSet = new Set()
    allTerrains.value.forEach(t => {
      t.tags?.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  })
  
  /**
   * Отфильтрованные террейны
   */
  const filteredTerrains = computed(() => {
    return allTerrains.value.filter(terrain => {
      // Поиск по имени/описанию
      if (filters.value.search) {
        const search = filters.value.search.toLowerCase()
        const nameMatch = terrain.name.toLowerCase().includes(search)
        const descMatch = terrain.description?.toLowerCase().includes(search)
        if (!nameMatch && !descMatch) return false
      }
      
      // Фильтр по биому
      if (filters.value.biome && terrain.biome !== filters.value.biome) {
        return false
      }
      
      // Фильтр по видимости
      if (filters.value.visibility && terrain.visibility !== filters.value.visibility) {
        return false
      }
      
      // Фильтр по стоимости передвижения
      if (terrain.movementCost < filters.value.movementCostMin ||
          terrain.movementCost > filters.value.movementCostMax) {
        return false
      }
      
      // Фильтр по преимуществу ближнего боя
      if (terrain.meleeAdvantage < filters.value.meleeAdvantageMin ||
          terrain.meleeAdvantage > filters.value.meleeAdvantageMax) {
        return false
      }
      
      // Фильтр по тегам (все выбранные теги должны присутствовать)
      if (filters.value.tags.length > 0) {
        const terrainTags = new Set(terrain.tags || [])
        const hasAllTags = filters.value.tags.every(tag => terrainTags.has(tag))
        if (!hasAllTags) return false
      }
      
      return true
    })
  })
  
  /**
   * Террейны сгруппированные по биому
   */
  const terrainsByBiome = computed(() => {
    const groups = {}
    biomes.value.forEach(biome => {
      groups[biome.id] = {
        biome,
        terrains: filteredTerrains.value.filter(t => t.biome === biome.id)
      }
    })
    return groups
  })
  
  // ===== ACTIONS =====
  
  /**
   * Получить террейн по ID
   */
  function getTerrainById(id) {
    return allTerrains.value.find(t => t.id === id) || null
  }
  
  /**
   * Получить отфильтрованные террейны с внешними параметрами
   */
  function getFilteredTerrains(options = {}) {
    const {
      biome = null,
      visibility = null,
      passabilityMin = 0,
      passabilityMax = 5,
      meleeAdvantageMin = -2,
      meleeAdvantageMax = 2,
      search = '',
      tags = []
    } = options
    
    return allTerrains.value.filter(terrain => {
      // Поиск по имени/описанию
      if (search) {
        const searchLower = search.toLowerCase()
        const nameMatch = terrain.name.toLowerCase().includes(searchLower)
        const descMatch = terrain.description?.toLowerCase().includes(searchLower)
        if (!nameMatch && !descMatch) return false
      }
      
      // Фильтр по биому
      if (biome && terrain.biome !== biome) return false
      
      // Фильтр по видимости
      if (visibility && terrain.visibility !== visibility) return false
      
      // Фильтр по стоимости передвижения (passability = movementCost)
      const cost = terrain.movementCost ?? 1
      if (cost < passabilityMin || cost > passabilityMax) return false
      
      // Фильтр по преимуществу ближнего боя
      const melee = terrain.meleeAdvantage ?? 0
      if (melee < meleeAdvantageMin || melee > meleeAdvantageMax) return false
      
      // Фильтр по тегам
      if (tags.length > 0) {
        const terrainTags = new Set(terrain.tags || [])
        if (!tags.every(tag => terrainTags.has(tag))) return false
      }
      
      return true
    })
  }
  
  /**
   * Получить биом по ID
   */
  function getBiomeById(id) {
    return biomes.value.find(b => b.id === id) || null
  }
  
  /**
   * Получить цвет террейна (с фоллбэком на цвет биома)
   */
  function getTerrainColor(terrainId) {
    const terrain = getTerrainById(terrainId)
    if (!terrain) return '#888888'
    
    if (terrain.color) return terrain.color
    
    const biome = getBiomeById(terrain.biome)
    return biome?.color || '#888888'
  }
  
  /**
   * Получить изображение террейна
   */
  function getTerrainImage(terrainId) {
    const terrain = getTerrainById(terrainId)
    return terrain?.image || null
  }
  
  /**
   * Загрузить изображение в кэш
   */
  async function loadImage(src) {
    if (imageCache.value.has(src)) {
      return imageCache.value.get(src)
    }
    
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        imageCache.value.set(src, img)
        resolve(img)
      }
      img.onerror = reject
      img.src = src
    })
  }
  
  /**
   * Добавить кастомный террейн
   */
  function addCustomTerrain(terrain) {
    // Генерируем уникальный ID
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const newTerrain = {
      id,
      name: terrain.name || 'Новый террейн',
      description: terrain.description || '',
      biome: terrain.biome || 'plains',
      color: terrain.color || '#888888',
      image: terrain.image || null,
      visibility: terrain.visibility || 'open',
      movementCost: Math.max(1, Math.min(5, terrain.movementCost || 1)),
      meleeAdvantage: Math.max(-2, Math.min(2, terrain.meleeAdvantage || 0)),
      tags: terrain.tags || [],
      isCustom: true,
      createdAt: Date.now(),
      // v2: Слои для процедурной генерации
      layers: terrain.layers || [],
      cachedImage: terrain.cachedImage || null,
      cacheVersion: terrain.cacheVersion || 0,
      // Копируем categoryTags и fallbackColor если есть
      categoryTags: terrain.categoryTags || {},
      fallbackColor: terrain.fallbackColor || terrain.color || '#888888'
    }
    
    customTerrains.value.push(newTerrain)
    
    // Вычисляем averageColor если есть слои
    if (newTerrain.layers && newTerrain.layers.length > 0) {
      setTimeout(() => {
        updateTerrainAverageColor(id)
      }, 0)
    }
    
    return newTerrain
  }
  
  /**
   * Обновить кастомный террейн
   */
  function updateCustomTerrain(id, updates) {
    const index = customTerrains.value.findIndex(t => t.id === id)
    if (index === -1) return false
    
    const current = customTerrains.value[index]
    
    // Если слои изменились, сбрасываем кэш
    const layersChanged = updates.layers && 
      JSON.stringify(updates.layers) !== JSON.stringify(current.layers)
    
    customTerrains.value[index] = {
      ...current,
      ...updates,
      updatedAt: Date.now(),
      // Сброс кэша при изменении слоёв
      ...(layersChanged ? { 
        cachedImage: null, 
        cacheVersion: (current.cacheVersion || 0) + 1 
      } : {})
    }
    
    // Пересчитываем averageColor при изменении слоёв
    if (layersChanged) {
      // Используем nextTick чтобы дать Vue обновить реактивность
      setTimeout(() => {
        updateTerrainAverageColor(id)
      }, 0)
    }
    
    return true
  }
  
  /**
   * Удалить кастомный террейн
   */
  function removeCustomTerrain(id) {
    const index = customTerrains.value.findIndex(t => t.id === id)
    if (index === -1) return false
    
    customTerrains.value.splice(index, 1)
    return true
  }
  
  /**
   * Установить фильтры
   */
  function setFilters(newFilters) {
    filters.value = { ...filters.value, ...newFilters }
  }
  
  /**
   * Сбросить фильтры
   */
  function resetFilters() {
    filters.value = {
      search: '',
      biome: null,
      visibility: null,
      movementCostMin: 1,
      movementCostMax: 5,
      meleeAdvantageMin: -2,
      meleeAdvantageMax: 2,
      tags: []
    }
  }
  
  /**
   * Экспорт кастомных террейнов
   */
  function exportCustomTerrains() {
    return JSON.stringify(customTerrains.value, null, 2)
  }
  
  /**
   * Импорт кастомных террейнов
   */
  function importCustomTerrains(jsonString) {
    try {
      const imported = JSON.parse(jsonString)
      if (!Array.isArray(imported)) throw new Error('Invalid format')
      
      // Добавляем с новыми ID чтобы избежать конфликтов
      imported.forEach(terrain => {
        addCustomTerrain(terrain)
      })
      
      return true
    } catch (e) {
      console.error('Failed to import terrains:', e)
      return false
    }
  }

  // ===== LAYER MANAGEMENT =====
  
  // Общий рендерер для превью (переиспользуется)
  let sharedRenderer = null
  
  function getRenderer(size = 128) {
    if (!sharedRenderer || sharedRenderer.width !== size) {
      sharedRenderer = new TerrainLayerRenderer(size, size)
    }
    return sharedRenderer
  }

  /**
   * Обновить слои террейна
   */
  function updateTerrainLayers(terrainId, layers) {
    const terrain = customTerrains.value.find(t => t.id === terrainId)
    if (!terrain) return false
    
    terrain.layers = layers
    terrain.cacheVersion = (terrain.cacheVersion || 0) + 1
    terrain.cachedImage = null // Сбрасываем кэш
    terrain.updatedAt = Date.now()
    
    return true
  }

  /**
   * Добавить слой к террейну
   */
  function addLayerToTerrain(terrainId, layerConfig = {}) {
    const terrain = customTerrains.value.find(t => t.id === terrainId)
    if (!terrain) return null
    
    if (!terrain.layers) terrain.layers = []
    
    const newLayer = createLayer({
      ...layerConfig,
      id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`
    })
    
    terrain.layers.push(newLayer)
    terrain.cacheVersion = (terrain.cacheVersion || 0) + 1
    terrain.cachedImage = null
    terrain.updatedAt = Date.now()
    
    return newLayer
  }

  /**
   * Удалить слой
   */
  function removeLayerFromTerrain(terrainId, layerIndex) {
    const terrain = customTerrains.value.find(t => t.id === terrainId)
    if (!terrain || !terrain.layers) return false
    
    if (layerIndex < 0 || layerIndex >= terrain.layers.length) return false
    
    terrain.layers.splice(layerIndex, 1)
    terrain.cacheVersion = (terrain.cacheVersion || 0) + 1
    terrain.cachedImage = null
    terrain.updatedAt = Date.now()
    
    return true
  }

  /**
   * Обновить один слой
   */
  function updateLayer(terrainId, layerIndex, updates) {
    const terrain = customTerrains.value.find(t => t.id === terrainId)
    if (!terrain || !terrain.layers) return false
    
    if (layerIndex < 0 || layerIndex >= terrain.layers.length) return false
    
    terrain.layers[layerIndex] = { ...terrain.layers[layerIndex], ...updates }
    terrain.cacheVersion = (terrain.cacheVersion || 0) + 1
    terrain.cachedImage = null
    terrain.updatedAt = Date.now()
    
    return true
  }

  /**
   * Переместить слой вверх/вниз
   */
  function moveLayer(terrainId, layerIndex, direction) {
    const terrain = customTerrains.value.find(t => t.id === terrainId)
    if (!terrain || !terrain.layers) return false
    
    const newIndex = layerIndex + direction
    if (newIndex < 0 || newIndex >= terrain.layers.length) return false
    
    const layers = terrain.layers
    ;[layers[layerIndex], layers[newIndex]] = [layers[newIndex], layers[layerIndex]]
    
    terrain.cacheVersion = (terrain.cacheVersion || 0) + 1
    terrain.cachedImage = null
    terrain.updatedAt = Date.now()
    
    return true
  }

  /**
   * Применить пресет слоёв
   */
  function applyLayerPreset(terrainId, presetName) {
    const preset = LayerPresets[presetName]
    if (!preset) return false
    
    return updateTerrainLayers(terrainId, preset())
  }

  /**
   * Рендерить террейн и получить dataURL
   * @param {Object} terrain - объект террейна или его layers
   * @param {Object} options - опции рендеринга
   * @returns {string} dataURL изображения
   */
  function renderTerrainImage(terrain, options = {}) {
    const { size = 128, hexMask = true, useCache = true } = options
    
    // Если это массив слоёв, используем напрямую
    const layers = Array.isArray(terrain) ? terrain : terrain.layers
    
    // Если нет слоёв, рендерим простой цвет
    if (!layers || layers.length === 0) {
      const color = terrain.color || '#888888'
      return renderSolidColor(color, size, hexMask)
    }
    
    // Проверяем кэш террейна
    if (useCache && terrain.cachedImage && !Array.isArray(terrain)) {
      return terrain.cachedImage
    }
    
    // Рендерим
    const renderer = getRenderer(size)
    const dataURL = renderTerrainCached(layers, { 
      width: size, 
      height: size, 
      hexMask,
      centerX: size / 2,
      centerY: size / 2,
      radius: size / 2 - 2
    }, renderer)
    
    // Сохраняем в кэш террейна
    if (!Array.isArray(terrain) && terrain.isCustom) {
      terrain.cachedImage = dataURL
    }
    
    return dataURL
  }

  /**
   * Рендерить сплошной цвет (для террейнов без слоёв)
   */
  function renderSolidColor(color, size = 128, hexMask = true) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    
    ctx.fillStyle = color
    
    if (hexMask) {
      ctx.beginPath()
      const centerX = size / 2
      const centerY = size / 2
      const radius = size / 2 - 2
      
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2
        const x = centerX + radius * Math.cos(angle)
        const y = centerY + radius * Math.sin(angle)
        
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillRect(0, 0, size, size)
    }
    
    return canvas.toDataURL()
  }

  /**
   * Получить изображение для отображения террейна
   * Приоритет: cachedImage > layers rendering > image > solid color
   */
  function getTerrainDisplayImage(terrainId, size = 64) {
    const terrain = getTerrainById(terrainId)
    if (!terrain) return null
    
    // Если есть слои - рендерим их
    if (terrain.layers && terrain.layers.length > 0) {
      return renderTerrainImage(terrain, { size })
    }
    
    // Если есть загруженное изображение
    if (terrain.image) {
      return terrain.image
    }
    
    // Фоллбэк - сплошной цвет
    return renderSolidColor(terrain.color || '#888888', size)
  }

  /**
   * Вычислить средний цвет террейна на основе его слоёв
   * Используется для LOD при низком zoom
   * @param {Object} terrain - объект террейна
   * @param {number} sampleSize - размер sample для рендеринга (меньше = быстрее)
   * @returns {string} hex-цвет
   */
  function computeAverageColor(terrain, sampleSize = 32) {
    if (!terrain) return '#888888'
    
    // Если нет слоёв, возвращаем основной цвет
    const layers = terrain.layers
    if (!layers || layers.length === 0) {
      return terrain.color || terrain.fallbackColor || '#888888'
    }
    
    try {
      // Рендерим маленький sample
      const renderer = getRenderer(sampleSize)
      const canvas = renderer.render(layers, {
        width: sampleSize,
        height: sampleSize,
        hexMask: false // Без маски для более точного среднего
      })
      
      const ctx = canvas.getContext('2d')
      const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize)
      const data = imageData.data
      
      // Суммируем все пиксели
      let r = 0, g = 0, b = 0, count = 0
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3]
        if (alpha > 0) {
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          count++
        }
      }
      
      if (count === 0) return terrain.color || '#888888'
      
      // Вычисляем средний цвет
      r = Math.round(r / count)
      g = Math.round(g / count)
      b = Math.round(b / count)
      
      // Конвертируем в hex
      const toHex = (n) => n.toString(16).padStart(2, '0')
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`
    } catch (e) {
      console.warn('[terrain] Failed to compute average color:', e)
      return terrain.color || terrain.fallbackColor || '#888888'
    }
  }

  /**
   * Обновить averageColor террейна
   * Вызывать после изменения слоёв
   */
  function updateTerrainAverageColor(terrainId) {
    const terrain = getTerrainById(terrainId)
    if (!terrain) return
    
    terrain.averageColor = computeAverageColor(terrain)
    terrain.fallbackColor = terrain.averageColor
  }

  // ===== TRANSITION RULES =====
  
  /**
   * Получить все правила переходов (кастомные имеют приоритет над дефолтными)
   */
  const allTransitionRules = computed(() => {
    return [...customTransitionRules.value, ...defaultTransitionRules.value]
  })
  
  /**
   * Найти правило перехода между двумя террейнами
   * Приоритет: terrain-to-terrain > terrain-to-tag > tag-to-tag
   * Правила двунаправленные: A→B = B→A
   * 
   * @returns {Object|null} Правило с полем `effects` (массив эффектов)
   */
  function getTransitionRule(fromTerrain, toTerrain) {
    if (!fromTerrain || !toTerrain) return null
    
    const rules = allTransitionRules.value
    const fromTags = fromTerrain.categoryTags || {}
    const toTags = toTerrain.categoryTags || {}
    
    let foundRule = null
    
    // 1. Ищем terrain-to-terrain(самый приоритетный)
    // Двунаправленно: A→B или B→A
    const t2t = rules.find(r => 
      r.level === 'terrain-to-terrain' && (
        (r.fromTerrainId === fromTerrain.id && r.toTerrainId === toTerrain.id) ||
        (r.fromTerrainId === toTerrain.id && r.toTerrainId === fromTerrain.id)
      )
    )
    if (t2t) foundRule = t2t
    
    // 2. Ищем terrain-to-tag
    if (!foundRule) {
      for (const rule of rules) {
        if (rule.level !== 'terrain-to-tag') continue
        
        // Прямое направление: from = конкретный террейн, to = тег
        if (rule.fromTerrainId === fromTerrain.id) {
          const toTagValue = toTags[rule.to.category]
          if (toTagValue === rule.to.tag || rule.to.tag === '*') {
            foundRule = rule
            break
          }
        }
        // Обратное направление: toTerrain — конкретный террейн из правила
        if (rule.fromTerrainId === toTerrain.id) {
          const fromTagValue = fromTags[rule.to.category]
          if (fromTagValue === rule.to.tag || rule.to.tag === '*') {
            foundRule = rule
            break
          }
        }
      }
    }
    
    // 3. Ищем tag-to-tag (самый общий)
    // Двунаправленно: проверяем оба порядка
    if (!foundRule) {
      for (const rule of rules) {
        if (rule.level !== 'tag-to-tag') continue
        
        const fromTagValue = fromTags[rule.from.category]
        const toTagValue = toTags[rule.to.category]
        
        // Прямое направление
        const fromMatch = fromTagValue === rule.from.tag || rule.from.tag === '*'
        const toMatch = toTagValue === rule.to.tag || rule.to.tag === '*'
        
        if (fromMatch && toMatch) {
          foundRule = rule
          break
        }
        
        // Обратное направление (swap from/to)
        const fromMatchRev = toTags[rule.from.category] === rule.from.tag || rule.from.tag === '*'
        const toMatchRev = fromTags[rule.to.category] === rule.to.tag || rule.to.tag === '*'
        
        if (fromMatchRev && toMatchRev) {
          foundRule = rule
          break
        }
      }
    }
    
    // Нет правила - дефолтный стиль
    if (!foundRule) return null
    
    // Конвертируем старый формат если нужно
    if (foundRule.effects) {
      return foundRule
    }
    
    // Legacy: конвертируем style + params в effects
    if (foundRule.style) {
      return {
        ...foundRule,
        effects: convertLegacyStyle(foundRule.style, foundRule.params || {})
      }
    }
    
    return foundRule
  }
  
  /**
   * Получить стиль перехода по ID
   */
  function getTransitionStyle(styleId) {
    return transitionStyles.value.find(s => s.id === styleId) || null
  }
  
  /**
   * Добавить кастомное правило перехода
   */
  function addTransitionRule(rule) {
    const newRule = {
      id: `rule_${Date.now()}`,
      ...rule
    }
    customTransitionRules.value.push(newRule)
    return newRule
  }
  
  /**
   * Обновить правило перехода
   */
  function updateTransitionRule(ruleId, updates) {
    const idx = customTransitionRules.value.findIndex(r => r.id === ruleId)
    if (idx >= 0) {
      customTransitionRules.value[idx] = { 
        ...customTransitionRules.value[idx], 
        ...updates 
      }
    }
  }
  
  /**
   * Удалить правило перехода
   */
  function removeTransitionRule(ruleId) {
    const idx = customTransitionRules.value.findIndex(r => r.id === ruleId)
    if (idx >= 0) {
      customTransitionRules.value.splice(idx, 1)
    }
  }
  
  /**
   * Получить тег террейна по категории
   */
  function getTerrainCategoryTag(terrain, categoryId) {
    return terrain?.categoryTags?.[categoryId] || null
  }
  
  /**
   * Получить информацию о теге
   */
  function getTagInfo(categoryId, tagId) {
    const category = tagCategories.value.find(c => c.id === categoryId)
    if (!category) return null
    return category.tags.find(t => t.id === tagId) || null
  }

  // ===== ШАБЛОНЫ КАРТ =====
  
  /**
   * Получить шаблон по ID
   */
  function getMapTemplate(id) {
    return mapTemplates.value.find(t => t.id === id) || null
  }
  
  /**
   * Получить активный шаблон
   */
  const activeTemplate = computed(() => {
    if (!activeTemplateId.value) return null
    return getMapTemplate(activeTemplateId.value)
  })
  
  /**
   * Создать новый шаблон карты
   */
  function createMapTemplate(name = 'Новый шаблон') {
    const id = `template_${Date.now()}`
    const template = {
      id,
      name,
      hexes: {}, // Сериализуемый объект вместо Map
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    mapTemplates.value.push(template)
    activeTemplateId.value = id
    return template
  }
  
  /**
   * Обновить шаблон карты
   */
  function updateMapTemplate(id, updates) {
    const index = mapTemplates.value.findIndex(t => t.id === id)
    if (index === -1) return false
    
    mapTemplates.value[index] = {
      ...mapTemplates.value[index],
      ...updates,
      updatedAt: Date.now()
    }
    return true
  }
  
  /**
   * Обновить гексы шаблона
   */
  function updateTemplateHexes(id, hexes) {
    const index = mapTemplates.value.findIndex(t => t.id === id)
    if (index === -1) return false
    
    // Конвертируем Map в объект для сериализации
    const hexObj = {}
    if (hexes instanceof Map) {
      hexes.forEach((data, key) => {
        hexObj[key] = data
      })
    } else {
      Object.assign(hexObj, hexes)
    }
    
    mapTemplates.value[index].hexes = hexObj
    mapTemplates.value[index].updatedAt = Date.now()
    return true
  }
  
  /**
   * Удалить шаблон карты
   */
  function removeMapTemplate(id) {
    const index = mapTemplates.value.findIndex(t => t.id === id)
    if (index === -1) return false
    
    mapTemplates.value.splice(index, 1)
    
    if (activeTemplateId.value === id) {
      activeTemplateId.value = mapTemplates.value[0]?.id || null
    }
    return true
  }
  
  /**
   * Переименовать шаблон карты
   */
  function renameMapTemplate(id, newName) {
    const template = getMapTemplate(id)
    if (!template) return false
    
    template.name = newName
    template.updatedAt = Date.now()
    return true
  }
  
  /**
   * Дублировать шаблон
   */
  function duplicateMapTemplate(id) {
    const source = getMapTemplate(id)
    if (!source) return null
    
    const newId = `template_${Date.now()}`
    const duplicate = {
      ...source,
      id: newId,
      name: `${source.name} (копия)`,
      hexes: { ...source.hexes },
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    mapTemplates.value.push(duplicate)
    return duplicate
  }
  
  /**
   * Установить активный шаблон
   */
  function setActiveTemplate(id) {
    activeTemplateId.value = id
  }
  
  /**
   * Получить гексы шаблона как Map
   */
  function getTemplateHexesAsMap(id) {
    const template = getMapTemplate(id)
    if (!template) return new Map()
    
    const map = new Map()
    for (const [key, data] of Object.entries(template.hexes || {})) {
      map.set(key, data)
    }
    return map
  }

  return {
    // State
    baseTerrains,
    customTerrains,
    biomes,
    visibilityTypes,
    imageCache,
    filters,
    lightingSettings,
    
    // Map Templates
    mapTemplates,
    activeTemplateId,
    activeTemplate,
    
    // Categories & Transitions
    tagCategories,
    transitionStyles,
    customTransitionRules,
    defaultTransitionRules,
    allTransitionRules,
    
    // Getters
    allTerrains,
    allTags,
    filteredTerrains,
    terrainsByBiome,
    
    // Actions
    getTerrainById,
    getFilteredTerrains,
    getBiomeById,
    getTerrainColor,
    getTerrainImage,
    loadImage,
    addCustomTerrain,
    updateCustomTerrain,
    removeCustomTerrain,
    setFilters,
    resetFilters,
    exportCustomTerrains,
    importCustomTerrains,
    
    // Layer management
    updateTerrainLayers,
    addLayerToTerrain,
    removeLayerFromTerrain,
    updateLayer,
    moveLayer,
    applyLayerPreset,
    
    // Rendering
    renderTerrainImage,
    renderSolidColor,
    getTerrainDisplayImage,
    computeAverageColor,
    updateTerrainAverageColor,
    
    // Transition rules
    getTransitionRule,
    getTransitionStyle,
    addTransitionRule,
    updateTransitionRule,
    removeTransitionRule,
    getTerrainCategoryTag,
    getTagInfo,
    
    // Map Templates
    getMapTemplate,
    createMapTemplate,
    updateMapTemplate,
    updateTemplateHexes,
    removeMapTemplate,
    renameMapTemplate,
    duplicateMapTemplate,
    setActiveTemplate,
    getTemplateHexesAsMap
  }
}, {
  persist: {
    key: 'trip-terrains',
    paths: ['customTerrains', 'customTransitionRules', 'lightingSettings', 'mapTemplates', 'activeTemplateId']
  }
})
