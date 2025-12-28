<script setup>
/**
 * AssetManager - экран управления материалами мастера
 * 
 * Содержит:
 * - Террейны (тайлы) - базовые и кастомные
 * - Тайлсеты (наборы террейнов)
 * - В будущем: объекты, эффекты, токены
 */
import { ref, computed, watch, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { 
  useTerrainStore, 
  VISIBILITY_TYPES, 
  TERRAIN_LIMITS,
  LAYER_TYPES,
  NOISE_TYPES,
  PATTERN_TYPES,
  BLEND_MODES,
  createLayer,
  LayerPresets
} from '@/stores/terrain'
import { useUserPrefsStore } from '@/stores/userPrefs'
import { safeStoreToRefs, safeUseStore } from '@/utils/safeStoreRefs'
import TerrainPreview from '@/components/shared/TerrainPreview.vue'
import HexClusterPreview from '@/components/shared/HexClusterPreview.vue'
import HexMapCanvas from '@/components/shared/HexMapCanvas.vue'
import EffectsPipelineEditor from './EffectsPipelineEditor.vue'
import { generateShape, hexArrayToMap } from '@/utils/hex/hexShapes'

const terrainStore = safeUseStore(useTerrainStore, 'terrain')
const userPrefs = useUserPrefsStore()

const { 
  allTerrains = ref([]), 
  customTerrains = ref([]), 
  baseTerrains = ref([]),
  biomes = ref([]),
  visibilityTypes = ref([]),
  tagCategories = ref([]),
  transitionStyles = ref([]),
  lightingSettings = ref({ angle: 135, length: 5, enabled: true }),
  mapTemplates = ref([]),
  activeTemplateId = ref(null),
  activeTemplate = ref(null)
} = safeStoreToRefs(terrainStore, 'terrain')

// ===== UI STATE =====

// Активная вкладка материалов
const activeCategory = ref('terrains') // 'terrains' | 'tilesets' | 'objects'

const categories = [
  { id: 'terrains', label: 'Террейны', icon: 'mdi:texture-box', count: computed(() => allTerrains.value?.length || 0) },
  { id: 'tilesets', label: 'Тайлсеты', icon: 'mdi:folder-multiple-image', count: computed(() => 0), disabled: true },
  { id: 'objects', label: 'Объекты', icon: 'mdi:cube-outline', count: computed(() => 0), disabled: true }
]

// Фильтры для террейнов
const terrainFilter = ref('')
const showOnlyCustom = ref(false)
const selectedBiome = ref(null)

// Редактирование
const editingTerrain = ref(null)
const isCreatingNew = ref(false)

// Активная вкладка в редакторе (persist)
const editorTab = computed({
  get: () => userPrefs.assetManager?.editorTab ?? 'basic',
  set: (v) => userPrefs.updateAssetManager({ editorTab: v })
})

// Редактирование правила перехода
const editingTransitionRule = ref(null)
const isCreatingTransitionRule = ref(false)

// Форма редактирования
const terrainForm = ref({
  name: '',
  description: '',
  biome: 'plains',
  color: '#888888',
  visibility: 'open',
  movementCost: 1,
  meleeAdvantage: 0,
  tags: [],
  layers: []
})

// Редактируемый слой
const editingLayerIndex = ref(null)

// Соседние террейны для превью (6 соседей вокруг центрального)
const neighborTerrains = ref([null, null, null, null, null, null])
// Индекс выбранного соседа для редактирования (-1 = не выбран)
const selectedNeighborIndex = ref(-1)
// Флаг ручного открытия превью
const previewManuallyOpened = ref(false)
// Форма кластера для тестирования (устаревшее, для совместимости с HexClusterPreview)
const clusterShape = ref('cluster7')
// Доступные формы кластера
const clusterShapes = [
  { value: 'cluster7', label: '7 гексов' },
  { value: 'circle2', label: 'Круг (r=2)' },
  { value: 'circle3', label: 'Круг (r=3)' },
  { value: 'rect5x5', label: 'Квадрат 5×5' },
  { value: 'rect3x7', label: 'Прямоуг. 3×7' },
  { value: 'rect5x9', label: 'Прямоуг. 5×9' },
  { value: 'diamond', label: 'Ромб' },
  { value: 'line7', label: 'Линия 7' }
]
// Террейны для расширенных форм (индекс гекса -> террейн)
const extendedHexTerrains = ref(new Map())
// Выбранный террейн для рисования (кисть)
const paintBrushTerrain = ref(null)
// Флаг активного рисования (зажата мышь)
const isPainting = ref(false)

// Режим превью: 'cluster' (старый HexClusterPreview) или 'map' (новый HexMapCanvas)
// Связано с persist через userPrefs
const previewMode = computed({
  get: () => userPrefs.assetManager?.previewMode || 'map',
  set: (v) => userPrefs.updateAssetManager({ previewMode: v })
})

// Режим рендеринга для HexMapCanvas
const mapRenderMode = computed({
  get: () => userPrefs.assetManager?.renderMode || 'primitive',
  set: (v) => userPrefs.updateAssetManager({ renderMode: v })
})

// Ref на HexMapCanvas для прямого вызова методов
const hexMapCanvasRef = ref(null)

// Версия конфигурации террейна для реактивности live-режима
// Инкрементируется при изменении слоёв или переходов
const terrainConfigVersion = ref(0)

// Стабильный хеш слоёв редактируемого террейна для кэширования паттернов
// Вычисляется один раз при изменении layers, не пересчитывается при каждом getTerrainByIdForMap
const editingTerrainLayersHash = computed(() => {
  const layers = terrainForm.value.layers || []
  const color = terrainForm.value.color || '#888888'
  if (!layers || layers.length === 0) return `solid:${color}`
  return JSON.stringify(layers.map(l => ({
    type: l.type,
    color: l.color,
    opacity: l.opacity,
    noiseType: l.noiseType,
    noiseScale: l.noiseScale,
    noiseOctaves: l.noiseOctaves,
    noisePersistence: l.noisePersistence,
    noiseLacunarity: l.noiseLacunarity,
    noiseContrast: l.noiseContrast,
    noiseSeed: l.noiseSeed,
    patternType: l.patternType,
    patternSize: l.patternSize,
    patternSpacing: l.patternSpacing,
    patternAngle: l.patternAngle,
    blendMode: l.blendMode,
    enabled: l.enabled
  })))
})

// Следим за изменениями слоёв террейна (deep watch) и вызываем перерисовку
// При редактировании переключаемся в режим превью для быстрой обратной связи
watch(() => terrainForm.value.layers, () => {
  terrainConfigVersion.value++
  // Возвращаемся в режим превью при изменении слоёв
  hexMapCanvasRef.value?.setPreviewMode?.(true)
  // Прямой вызов инвалидации и перерисовки
  hexMapCanvasRef.value?.invalidateAndRedraw?.()
}, { deep: true })

/**
 * Сгенерировать полный паттерн (1024×1024px) для редактируемого террейна
 * Вызывается по кнопке когда пользователь хочет увидеть финальный результат
 */
const generateFullPattern = () => {
  hexMapCanvasRef.value?.generateFullPattern?.()
}

// Следим за изменениями правил переходов (сохранённых)
// Правила не влияют на паттерны террейнов — только forceRedraw, без изменения terrainConfigVersion
watch(() => terrainStore?.transitionRules, () => {
  hexMapCanvasRef.value?.forceRedraw?.()
}, { deep: true })

// Показывать сетку (persist)
const showHexGrid = computed({
  get: () => userPrefs.assetManager?.showGrid ?? true,
  set: (v) => userPrefs.updateAssetManager({ showGrid: v })
})

// Камера для HexMapCanvas (persist)
const mapCamera = computed({
  get: () => userPrefs.assetManager?.camera || { x: 150, y: 150, zoom: 1 },
  set: (v) => userPrefs.updateAssetManagerCamera(v)
})

// Режим редактирования (показывать центральную панель превью)
const isEditorMode = computed(() => editingTerrain.value !== null || isCreatingNew.value)

// Показывать превью (при редактировании слоёв/соседства/переходов, когда выбран сосед, или вручную открыто)
const showPreview = computed(() => {
  if (!isEditorMode.value) return false
  return editorTab.value === 'layers' || editorTab.value === 'adjacency' || editorTab.value === 'transitions' || selectedNeighborIndex.value >= 0 || previewManuallyOpened.value
})

// Переключить превью вручную
const togglePreview = () => {
  previewManuallyOpened.value = !previewManuallyOpened.value
}

// ===== COMPUTED =====

const filteredTerrains = computed(() => {
  let list = showOnlyCustom.value 
    ? (customTerrains.value || [])
    : (allTerrains.value || [])
  
  if (terrainFilter.value) {
    const search = terrainFilter.value.toLowerCase()
    list = list.filter(t => 
      t.name?.toLowerCase().includes(search) ||
      t.description?.toLowerCase().includes(search)
    )
  }
  
  if (selectedBiome.value) {
    list = list.filter(t => t.biome === selectedBiome.value)
  }
  
  return list
})

const customCount = computed(() => customTerrains.value?.length || 0)
const baseCount = computed(() => baseTerrains.value?.length || 0)

// ===== ACTIONS =====

// Хелпер для авто-заполнения соседей текущим террейном
const autoFillNeighborsWithCurrent = () => {
  // Создаём временный "псевдо-террейн" из текущей формы
  // Для neighborTerrainsForPreview - он автоматически будет обновлен через computed
  // Но нам нужен объект-ссылка, который будет распознаваться как "тот же террейн"
  const pseudoTerrain = editingTerrain.value || { 
    id: '__editing__', 
    ...terrainForm.value 
  }
  neighborTerrains.value = [pseudoTerrain, pseudoTerrain, pseudoTerrain, pseudoTerrain, pseudoTerrain, pseudoTerrain]
  selectedNeighborIndex.value = -1
}

const startCreateTerrain = () => {
  isCreatingNew.value = true
  editingTerrain.value = null
  editorTab.value = 'basic'
  editingLayerIndex.value = null
  terrainForm.value = {
    name: '',
    description: '',
    biome: 'plains',
    color: '#888888',
    visibility: 'open',
    movementCost: 1,
    meleeAdvantage: 0,
    tags: [],
    layers: [],
    categoryTags: {}  // { surface: 'grass', elevation: 'flat', ... }
  }
  // Авто-заполняем соседей создаваемым террейном
  autoFillNeighborsWithCurrent()
}

const startEditTerrain = (terrain) => {
  if (!terrain.isCustom) {
    // Для базовых террейнов - создаём копию
    isCreatingNew.value = true
    editingTerrain.value = null
    editorTab.value = 'basic'
    editingLayerIndex.value = null
    terrainForm.value = {
      name: `${terrain.name} (копия)`,
      description: terrain.description || '',
      biome: terrain.biome || 'plains',
      color: terrain.color || '#888888',
      visibility: terrain.visibility || 'open',
      movementCost: terrain.movementCost || 1,
      meleeAdvantage: terrain.meleeAdvantage || 0,
      tags: [...(terrain.tags || [])],
      layers: JSON.parse(JSON.stringify(terrain.layers || [])),
      categoryTags: JSON.parse(JSON.stringify(terrain.categoryTags || {}))
    }
    // Авто-заполняем соседей копируемым террейном
    autoFillNeighborsWithCurrent()
    return
  }
  
  isCreatingNew.value = false
  editingTerrain.value = terrain
  editorTab.value = 'basic'
  editingLayerIndex.value = null
  terrainForm.value = {
    name: terrain.name,
    description: terrain.description || '',
    biome: terrain.biome || 'plains',
    color: terrain.color || '#888888',
    visibility: terrain.visibility || 'open',
    movementCost: terrain.movementCost || 1,
    meleeAdvantage: terrain.meleeAdvantage || 0,
    tags: [...(terrain.tags || [])],
    layers: JSON.parse(JSON.stringify(terrain.layers || [])),
    categoryTags: JSON.parse(JSON.stringify(terrain.categoryTags || {}))
  }
  // Авто-заполняем соседей редактируемым террейном
  autoFillNeighborsWithCurrent()
}

const saveTerrain = () => {
  if (!terrainForm.value.name.trim()) return
  
  if (isCreatingNew.value) {
    terrainStore?.addCustomTerrain(terrainForm.value)
  } else if (editingTerrain.value) {
    terrainStore?.updateCustomTerrain(editingTerrain.value.id, terrainForm.value)
  }
  
  cancelEdit()
}

const deleteTerrain = (terrain) => {
  if (!terrain.isCustom) return
  if (!confirm(`Удалить террейн "${terrain.name}"?`)) return
  
  terrainStore?.removeCustomTerrain(terrain.id)
  
  if (editingTerrain.value?.id === terrain.id) {
    cancelEdit()
  }
}

const cancelEdit = () => {
  editingTerrain.value = null
  isCreatingNew.value = false
  previewManuallyOpened.value = false
  selectedNeighborIndex.value = -1
  neighborTerrains.value = [null, null, null, null, null, null]
}

const duplicateTerrain = (terrain) => {
  terrainStore?.addCustomTerrain({
    ...terrain,
    name: `${terrain.name} (копия)`,
    isCustom: true
  })
}

// Экспорт/Импорт
const exportTerrains = () => {
  const json = terrainStore?.exportCustomTerrains() || '[]'
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'custom-terrains.json'
  a.click()
  URL.revokeObjectURL(url)
}

const importTerrains = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    const text = await file.text()
    const success = terrainStore?.importCustomTerrains(text)
    if (success) {
      alert('Террейны успешно импортированы!')
    } else {
      alert('Ошибка импорта. Проверьте формат файла.')
    }
  }
  input.click()
}

// Теги
const newTag = ref('')
const addTag = () => {
  const tag = newTag.value.trim().toLowerCase()
  if (tag && !terrainForm.value.tags.includes(tag)) {
    terrainForm.value.tags.push(tag)
  }
  newTag.value = ''
}
const removeTag = (tag) => {
  terrainForm.value.tags = terrainForm.value.tags.filter(t => t !== tag)
}

// ===== LAYERS MANAGEMENT =====

const layerTypeOptions = [
  { id: 'solid', label: 'Сплошной цвет', icon: 'mdi:square' },
  { id: 'noise', label: 'Шум', icon: 'mdi:blur' },
  { id: 'pattern', label: 'Паттерн', icon: 'mdi:grid' },
  { id: 'gradient', label: 'Градиент', icon: 'mdi:gradient-vertical' }
]

const noiseTypeOptions = [
  { id: 'perlin', label: 'Perlin' },
  { id: 'simplex', label: 'Simplex' },
  { id: 'voronoi', label: 'Voronoi' }
]

const patternTypeOptions = [
  { id: 'dots', label: 'Точки' },
  { id: 'lines', label: 'Линии' },
  { id: 'grid', label: 'Сетка' },
  { id: 'stripes', label: 'Полосы' },
  { id: 'checker', label: 'Шашки' }
]

const blendModeOptions = [
  { id: 'source-over', label: 'Обычный' },
  { id: 'multiply', label: 'Умножение' },
  { id: 'screen', label: 'Экран' },
  { id: 'overlay', label: 'Наложение' },
  { id: 'soft-light', label: 'Мягкий свет' }
]

const presetOptions = [
  { id: 'grass', label: '🌿 Трава' },
  { id: 'dirt', label: '🟤 Земля' },
  { id: 'sand', label: '🏖️ Песок' },
  { id: 'water', label: '💧 Вода' },
  { id: 'stone', label: '🪨 Камень' },
  { id: 'snow', label: '❄️ Снег' },
  { id: 'woodFloor', label: '🪵 Деревянный пол' },
  { id: 'stoneTiles', label: '🧱 Каменная плитка' }
]

const addLayer = (type = 'solid') => {
  const newLayer = createLayer({ 
    type,
    color: terrainForm.value.color || '#888888',
    id: `layer_${Date.now()}`
  })
  terrainForm.value.layers.push(newLayer)
  editingLayerIndex.value = terrainForm.value.layers.length - 1
}

const removeLayer = (index) => {
  terrainForm.value.layers.splice(index, 1)
  if (editingLayerIndex.value === index) {
    editingLayerIndex.value = null
  } else if (editingLayerIndex.value > index) {
    editingLayerIndex.value--
  }
}

const moveLayerUp = (index) => {
  if (index <= 0) return
  const layers = terrainForm.value.layers
  ;[layers[index], layers[index - 1]] = [layers[index - 1], layers[index]]
  if (editingLayerIndex.value === index) editingLayerIndex.value--
  else if (editingLayerIndex.value === index - 1) editingLayerIndex.value++
}

const moveLayerDown = (index) => {
  if (index >= terrainForm.value.layers.length - 1) return
  const layers = terrainForm.value.layers
  ;[layers[index], layers[index + 1]] = [layers[index + 1], layers[index]]
  if (editingLayerIndex.value === index) editingLayerIndex.value++
  else if (editingLayerIndex.value === index + 1) editingLayerIndex.value--
}

const duplicateLayer = (index) => {
  const layer = terrainForm.value.layers[index]
  const newLayer = { ...JSON.parse(JSON.stringify(layer)), id: `layer_${Date.now()}` }
  terrainForm.value.layers.splice(index + 1, 0, newLayer)
}

const toggleLayer = (index) => {
  terrainForm.value.layers[index].enabled = !terrainForm.value.layers[index].enabled
}

const applyPreset = (presetId) => {
  const preset = LayerPresets[presetId]
  if (!preset) return
  
  terrainForm.value.layers = preset()
  editingLayerIndex.value = null
}

const clearLayers = () => {
  if (terrainForm.value.layers.length === 0) return
  if (!confirm('Удалить все слои?')) return
  terrainForm.value.layers = []
  editingLayerIndex.value = null
}

// Computed для текущего редактируемого слоя
const currentEditingLayer = computed(() => {
  if (editingLayerIndex.value === null) return null
  return terrainForm.value.layers[editingLayerIndex.value]
})

// Функции для управления seed шума
const toggleNoiseSeed = () => {
  if (!currentEditingLayer.value) return
  
  if (currentEditingLayer.value.noiseSeed === null) {
    // Закрепляем - генерируем seed
    currentEditingLayer.value.noiseSeed = Math.floor(Math.random() * 100000)
  } else {
    // Открепляем
    currentEditingLayer.value.noiseSeed = null
  }
}

const regenerateNoiseSeed = () => {
  if (!currentEditingLayer.value) return
  currentEditingLayer.value.noiseSeed = Math.floor(Math.random() * 100000)
}

const getLayerTypeName = (type) => {
  return layerTypeOptions.find(o => o.id === type)?.label || type
}

const getLayerTypeIcon = (type) => {
  return layerTypeOptions.find(o => o.id === type)?.icon || 'mdi:layers'
}

// ===== NEIGHBOR MANAGEMENT =====

// Позиции соседей в hex-сетке (flat-top)
const neighborPositions = [
  { angle: -30, label: 'СВ' },   // 0: верхний правый
  { angle: 30, label: 'В' },     // 1: правый
  { angle: 90, label: 'ЮВ' },    // 2: нижний правый
  { angle: 150, label: 'ЮЗ' },   // 3: нижний левый
  { angle: 210, label: 'З' },    // 4: левый
  { angle: 270, label: 'СЗ' }    // 5: верхний левый
]

// Поиск для селектора соседей (отдельный от основного)
const neighborSearchFilter = ref('')

// Данные центрального террейна для HexClusterPreview
// Добавляем маркер __isEditingTerrain для отслеживания в extended mode
const centerTerrainData = computed(() => ({
  id: editingTerrain.value?.id || terrainForm.value.id,
  layers: terrainForm.value.layers || [],
  color: terrainForm.value.color || '#888888',
  categoryTags: terrainForm.value.categoryTags || editingTerrain.value?.categoryTags || {},
  __isEditingTerrain: true // Маркер для идентификации редактируемого террейна
}))

// Есть ли хоть один сосед
const hasAnyNeighbor = computed(() => {
  return neighborTerrains.value.some(n => n !== null)
})

// Соседи для превью — если сосед === редактируемый террейн (или псевдо-террейн), подставляем текущую форму
const neighborTerrainsForPreview = computed(() => {
  const editingId = editingTerrain.value?.id
  
  return neighborTerrains.value.map(neighbor => {
    if (!neighbor) return null
    
    // Если это псевдо-террейн (при создании нового) или тот же террейн что редактируем
    if (neighbor.id === '__editing__' || (editingId && neighbor.id === editingId)) {
      return {
        ...neighbor,
        layers: terrainForm.value.layers || [],
        color: terrainForm.value.color || neighbor.color
      }
    }
    
    return neighbor
  })
})

// Альтернативный террейн для расширенного превью (первый не-null сосед)
const alternateTerrainForPreview = computed(() => {
  const neighbor = neighborTerrainsForPreview.value.find(n => n !== null)
  return neighbor || null
})

// Computed для extendedHexTerrains с подстановкой текущей формы вместо редактируемого террейна
// Это обеспечивает реактивность при редактировании слоёв/настроек для extended shapes
const extendedHexTerrainsForPreview = computed(() => {
  const result = new Map()
  const editingId = editingTerrain.value?.id
  const currentCenterData = centerTerrainData.value
  
  for (const [index, terrain] of extendedHexTerrains.value) {
    if (!terrain) {
      result.set(index, null)
      continue
    }
    
    // Если это редактируемый террейн — подставляем текущую форму
    // Проверяем по:
    // 1. Маркеру __isEditingTerrain (если был нарисован через centerTerrainData)
    // 2. id === editingId (если рисовали тем же террейном что редактируем)
    // 3. id === currentCenterData.id (для нового террейна)
    const isPaintedWithEditing = 
      terrain.__isEditingTerrain === true ||
      (editingId && terrain.id === editingId) ||
      (currentCenterData.id && terrain.id === currentCenterData.id)
    
    if (isPaintedWithEditing) {
      result.set(index, currentCenterData)
    } else {
      result.set(index, terrain)
    }
  }
  
  return result
})

// При смене формы автоматически выбираем основной террейн как кисть
watch(clusterShape, (newShape) => {
  if (newShape !== 'cluster7') {
    // Автоматически выбираем основной террейн
    paintBrushTerrain.value = centerTerrainData.value
    // Очищаем гексы при смене формы
    extendedHexTerrains.value = new Map()
    hexMapData.value = new Map() // Очищаем данные HexMapCanvas
  }
})

// Фильтрованные террейны для picker'а соседей
const filteredTerrainsForPicker = computed(() => {
  let list = allTerrains.value || []
  
  if (neighborSearchFilter.value) {
    const search = neighborSearchFilter.value.toLowerCase()
    list = list.filter(t => 
      t.name?.toLowerCase().includes(search) ||
      t.description?.toLowerCase().includes(search)
    )
  }
  
  return list
})

// ===== HexMapCanvas данные =====

// Данные гексов для HexMapCanvas (террейн на гекс)
const hexMapData = ref(new Map())

// Гексы для HexMapCanvas — генерируем форму и накладываем данные террейнов
const hexMapCanvasHexes = computed(() => {
  // Генерируем все гексы формы
  const shapeHexes = generateShape(clusterShape.value)
  const result = new Map()
  
  for (const hex of shapeHexes) {
    const key = `${hex.q},${hex.r}`
    
    // Проверяем есть ли террейн в данных
    if (hexMapData.value.has(key)) {
      const data = hexMapData.value.get(key)
      result.set(key, { terrain: data?.terrain || null })
    } else if (clusterShape.value === 'cluster7') {
      // Для cluster7 — совместимость со старой логикой
      if (hex.q === 0 && hex.r === 0) {
        // Центральный гекс — редактируемый террейн
        result.set(key, { terrain: centerTerrainData.value?.id || 'editing' })
      } else {
        // Соседи
        const dirs = [
          { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
          { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
        ]
        const neighborIdx = dirs.findIndex(d => d.q === hex.q && d.r === hex.r)
        const neighbor = neighborIdx >= 0 ? neighborTerrains.value[neighborIdx] : null
        if (neighbor) {
          result.set(key, { terrain: neighbor.id })
        } else {
          result.set(key, { terrain: null })
        }
      }
    } else {
      // Пустой гекс
      result.set(key, { terrain: null })
    }
  }
  
  return result
})

// Превью гексов под кистью для HexMapCanvas
const brushPreviewHexesForMap = ref([])

// Обработчики рисования для HexMapCanvas
const handleMapPaintStart = (hex) => {
  if (!paintBrushTerrain.value) return
  
  // Устанавливаем террейн на гекс
  hexMapData.value.set(hex.key, { terrain: paintBrushTerrain.value.id || 'editing' })
  hexMapData.value = new Map(hexMapData.value) // trigger reactivity
  
  // Сохраняем в активный шаблон
  saveHexesToActiveTemplate()
}

const handleMapPaintMove = (hex) => {
  if (!paintBrushTerrain.value) return
  
  // Продолжаем рисовать
  hexMapData.value.set(hex.key, { terrain: paintBrushTerrain.value.id || 'editing' })
  hexMapData.value = new Map(hexMapData.value)
  
  // Обновляем превью
  brushPreviewHexesForMap.value = [{ q: hex.q, r: hex.r }]
}

const handleMapPaintEnd = () => {
  // Сохраняем в активный шаблон
  saveHexesToActiveTemplate()
}

const handleMapHexHover = (hex) => {
  // Обновляем превью кисти
  if (paintBrushTerrain.value) {
    brushPreviewHexesForMap.value = [{ q: hex.q, r: hex.r }]
  }
}

// Обработчик изменения камеры
const handleMapCameraChange = (cam) => {
  userPrefs.updateAssetManagerCamera(cam)
}

// ===== Управление шаблонами карт =====

// Сохранить текущие гексы в активный шаблон
const saveHexesToActiveTemplate = () => {
  if (!activeTemplateId.value) return
  terrainStore.updateTemplateHexes?.(activeTemplateId.value, hexMapData.value)
}

// Загрузить гексы из шаблона
const loadHexesFromTemplate = (templateId) => {
  const hexes = terrainStore.getTemplateHexesAsMap?.(templateId)
  if (hexes) {
    hexMapData.value = hexes
  }
}

// Создать новый шаблон
const createNewTemplate = () => {
  const template = terrainStore.createMapTemplate?.('Новый шаблон')
  if (template) {
    hexMapData.value = new Map()
  }
}

// Удалить шаблон
const deleteTemplate = (id) => {
  if (confirm('Удалить шаблон карты?')) {
    terrainStore.removeMapTemplate?.(id)
    if (activeTemplateId.value === id) {
      hexMapData.value = new Map()
    }
  }
}

// Дублировать шаблон
const duplicateTemplate = (id) => {
  terrainStore.duplicateMapTemplate?.(id)
}

// Выбрать шаблон
const selectTemplate = (id) => {
  terrainStore.setActiveTemplate?.(id)
  loadHexesFromTemplate(id)
}

// Очистить текущий шаблон
const clearCurrentTemplate = () => {
  hexMapData.value = new Map()
  saveHexesToActiveTemplate()
}

// Переименовать текущий шаблон
const renameCurrentTemplate = () => {
  if (!activeTemplateId.value || !activeTemplate.value) return
  const newName = prompt('Введите новое имя шаблона:', activeTemplate.value.name || 'Шаблон')
  if (newName && newName.trim()) {
    terrainStore.renameMapTemplate?.(activeTemplateId.value, newName.trim())
  }
}

// Следим за активным шаблоном
watch(activeTemplateId, (newId) => {
  if (newId) {
    loadHexesFromTemplate(newId)
  }
}, { immediate: true })

// Функция получения террейна по ID для HexMapCanvas
const getTerrainByIdForMap = (id) => {
  if (!id) return null
  
  // Проверяем редактируемый террейн
  if (id === 'editing' || id === centerTerrainData.value?.id) {
    return {
      id: 'editing',
      name: terrainForm.value.name || 'Редактируемый',
      fallbackColor: terrainForm.value.color || '#888888',
      averageColor: terrainForm.value.color || '#888888',
      color: terrainForm.value.color || '#888888',
      layers: terrainForm.value.layers || [],
      categoryTags: terrainForm.value.categoryTags || {},
      effectsPipeline: terrainForm.value.effectsPipeline || [],
      // Предвычисленный хеш слоёв — избегает пересчёт в useTerrainRenderer при каждом вызове
      _cachedLayersHash: editingTerrainLayersHash.value
    }
  }
  
  // Ищем в списке террейнов - возвращаем полный объект
  const terrain = allTerrains.value?.find(t => t.id === id)
  if (terrain) {
    return terrain // Возвращаем полный объект с layers, categoryTags, effectsPipeline
  }
  
  return { id, fallbackColor: '#888888', averageColor: '#888888', color: '#888888' }
}

// Функция получения правила перехода для HexMapCanvas
// Принимает ID террейнов и возвращает правило перехода
// При редактировании правила — возвращает данные из формы для затронутых пар
const getTransitionRuleForMap = (fromTerrainId, toTerrainId) => {
  // Получаем полные объекты террейнов
  const fromTerrain = getTerrainByIdForMap(fromTerrainId)
  const toTerrain = getTerrainByIdForMap(toTerrainId)
  
  if (!fromTerrain || !toTerrain) return null
  
  // Если редактируем правило перехода — проверяем применяется ли к этой паре
  const isEditing = isCreatingTransitionRule.value || editingTransitionRule.value
  if (isEditing) {
    const form = transitionRuleForm.value
    let applies = false
    
    // Проверяем применимость формы к данной паре террейнов
    // fromTerrain должен быть редактируемым террейном (или соответствовать правилу)
    const isFromEditing = fromTerrainId === 'editing' || fromTerrainId === editingTerrain.value?.id
    
    if (isFromEditing) {
      if (form.level === 'tag-to-tag') {
        const fromTag = fromTerrain.categoryTags?.[form.fromCategory]
        const toTag = toTerrain.categoryTags?.[form.toCategory]
        const fromMatches = form.fromTag === '*' || fromTag === form.fromTag
        const toMatches = form.toTag === '*' || toTag === form.toTag
        applies = fromMatches && toMatches
      } else if (form.level === 'terrain-to-tag') {
        const toTag = toTerrain.categoryTags?.[form.toCategory]
        applies = form.toTag === '*' || toTag === form.toTag
      } else if (form.level === 'terrain-to-terrain') {
        applies = toTerrain.id === form.toTerrainId
      }
    }
    
    if (applies) {
      return {
        effects: form.effects,
        zPriority: form.zPriority
      }
    }
  }
  
  // Fallback на сохранённые правила
  if (!terrainStore?.getTransitionRule) return null
  return terrainStore.getTransitionRule(fromTerrain, toTerrain)
}

// Обработка клика/рисования по гексу в кластере
const handleHexSelect = (index) => {
  // Расширенные формы - режим кисти
  if (clusterShape.value !== 'cluster7') {
    if (paintBrushTerrain.value && index >= 0) {
      extendedHexTerrains.value.set(index, paintBrushTerrain.value)
      // Trigger reactivity
      extendedHexTerrains.value = new Map(extendedHexTerrains.value)
    }
    return
  }
  
  // Режим cluster7
  if (index === 6) {
    // Клик по центру - ничего не делаем (это редактируемый террейн)
    selectedNeighborIndex.value = -1
  } else if (index >= 0 && index < 6) {
    // Клик по соседу
    selectedNeighborIndex.value = index
    neighborSearchFilter.value = ''
  } else {
    // Клик мимо
    selectedNeighborIndex.value = -1
  }
}

// Обработка начала рисования (mousedown)
const handlePaintStart = (index) => {
  if (clusterShape.value !== 'cluster7' && paintBrushTerrain.value) {
    isPainting.value = true
    handleHexSelect(index)
  }
}

// Обработка рисования при движении (mousemove)
const handlePaintMove = (index) => {
  if (isPainting.value && paintBrushTerrain.value && index >= 0) {
    extendedHexTerrains.value.set(index, paintBrushTerrain.value)
    extendedHexTerrains.value = new Map(extendedHexTerrains.value)
  }
}

// Обработка завершения рисования (mouseup)
const handlePaintEnd = () => {
  isPainting.value = false
}

// Обработка клика по карточке террейна в левой панели
// Проверка, нужен ли выбор террейна для правила
const isPickingTargetTerrain = computed(() => {
  return isCreatingTransitionRule.value && transitionRuleForm.value.level === 'terrain-to-terrain'
})

// Текущее редактируемое правило для live preview (для расширенных форм)
const currentEditingRule = computed(() => {
  if (!isCreatingTransitionRule.value && !editingTransitionRule.value) {
    return null
  }
  
  const form = transitionRuleForm.value
  const currentTerrainId = editingTerrain.value?.id
  
  return {
    level: form.level,
    fromTerrainId: currentTerrainId,
    toTerrainId: form.toTerrainId,
    from: form.level === 'tag-to-tag' ? { category: form.fromCategory, tag: form.fromTag } : null,
    to: (form.level === 'tag-to-tag' || form.level === 'terrain-to-tag') 
      ? { category: form.toCategory, tag: form.toTag } 
      : null,
    effects: form.effects,
    zPriority: form.zPriority
  }
})

const handleTerrainCardClick = (terrain) => {
  if (!isEditorMode.value) {
    // Вне режима редактирования — открываем редактор
    startEditTerrain(terrain)
  } else if (isPickingTargetTerrain.value) {
    // При создании правила terrain-to-terrain — выбираем целевой террейн
    transitionRuleForm.value.toTerrainId = terrain.id
  } else if (previewMode.value === 'map' || clusterShape.value !== 'cluster7') {
    // HexMap режим или расширенная форма — выбираем как кисть
    paintBrushTerrain.value = terrain
  } else {
    // cluster7 — устанавливаем как сосед
    setNeighborTerrain(terrain)
  }
}

// Очистить все гексы расширенной формы
const clearExtendedHexes = () => {
  extendedHexTerrains.value = new Map()
}

const setNeighborTerrain = (terrain) => {
  if (selectedNeighborIndex.value >= 0 && selectedNeighborIndex.value < 6) {
    neighborTerrains.value[selectedNeighborIndex.value] = terrain
  }
}

const clearNeighbor = (index) => {
  neighborTerrains.value[index] = null
  if (selectedNeighborIndex.value === index) {
    selectedNeighborIndex.value = -1
  }
}

const fillAllNeighbors = (terrain) => {
  neighborTerrains.value = [terrain, terrain, terrain, terrain, terrain, terrain]
  selectedNeighborIndex.value = -1
}

const fillAllNeighborsWithSelected = () => {
  const current = neighborTerrains.value[selectedNeighborIndex.value]
  if (current) {
    fillAllNeighbors(current)
  }
}

const clearAllNeighbors = () => {
  neighborTerrains.value = [null, null, null, null, null, null]
  selectedNeighborIndex.value = -1
}

// ===== CATEGORY TAGS SYSTEM =====

// Установить тег для категории
const setCategoryTag = (categoryId, tagId) => {
  if (!terrainForm.value.categoryTags) {
    terrainForm.value.categoryTags = {}
  }
  if (tagId) {
    terrainForm.value.categoryTags[categoryId] = tagId
  } else {
    delete terrainForm.value.categoryTags[categoryId]
  }
}

// Получить текущий тег для категории
const getCategoryTag = (categoryId) => {
  return terrainForm.value.categoryTags?.[categoryId] || null
}

// Получить информацию о теге
const getTagInfo = (categoryId, tagId) => {
  const category = tagCategories.value?.find(c => c.id === categoryId)
  if (!category) return null
  return category.tags?.find(t => t.id === tagId) || null
}

// Получить правило перехода между текущим террейном и соседом
const getNeighborTransitionInfo = (neighborIndex) => {
  const neighbor = neighborTerrains.value[neighborIndex]
  if (!neighbor) return null
  
  // Создаём временный объект террейна с текущими categoryTags
  const currentTerrain = {
    id: editingTerrain.value?.id || '__editing__',
    categoryTags: terrainForm.value.categoryTags || {}
  }
  
  return terrainStore?.getTransitionRule(currentTerrain, neighbor)
}

/**
 * Проверить, применяется ли редактируемое правило к данному соседу
 */
const doesFormRuleApplyToNeighbor = (neighbor) => {
  if (!neighbor) return false
  const form = transitionRuleForm.value
  const currentTerrain = {
    id: editingTerrain.value?.id || '__editing__',
    categoryTags: terrainForm.value.categoryTags || {}
  }
  
  // Проверяем по уровню правила
  if (form.level === 'tag-to-tag') {
    const fromTag = currentTerrain.categoryTags?.[form.fromCategory]
    const toTag = neighbor.categoryTags?.[form.toCategory]
    
    const fromMatches = form.fromTag === '*' || fromTag === form.fromTag
    const toMatches = form.toTag === '*' || toTag === form.toTag
    
    return fromMatches && toMatches
  } else if (form.level === 'terrain-to-tag') {
    const toTag = neighbor.categoryTags?.[form.toCategory]
    return form.toTag === '*' || toTag === form.toTag
  } else if (form.level === 'terrain-to-terrain') {
    return neighbor.id === form.toTerrainId
  }
  
  return false
}

// Информация о переходах для всех соседей
// При редактировании правила — использует параметры из формы для затронутых соседей
const neighborTransitions = computed(() => {
  const isEditing = isCreatingTransitionRule.value || editingTransitionRule.value
  
  // Триггер реактивности на изменения формы
  const formEffects = transitionRuleForm.value.effects
  const formZPriority = transitionRuleForm.value.zPriority
  
  return neighborTerrains.value.map((neighbor, idx) => {
    if (!neighbor) return null
    
    // Если редактируем правило и оно применяется к этому соседу — показываем превью
    if (isEditing && doesFormRuleApplyToNeighbor(neighbor)) {
      return {
        effects: formEffects,
        zPriority: formZPriority
      }
    }
    
    return getNeighborTransitionInfo(idx)
  })
})


// Получить имя стиля перехода
const getTransitionStyleName = (styleId) => {
  const style = transitionStyles.value?.find(s => s.id === styleId)
  return style?.name || styleId
}

// Получить имя террейна по ID
const getTerrainName = (terrainId) => {
  const terrain = allTerrains.value?.find(t => t.id === terrainId)
  return terrain?.name || terrainId
}

// Получить название цели для кнопки приоритета
const getPriorityTargetName = () => {
  const form = transitionRuleForm.value
  if (form.level === 'terrain-to-terrain') {
    if (form.toTerrainId) {
      return getTerrainName(form.toTerrainId)
    }
    return 'Цель'
  } else if (form.level === 'terrain-to-tag') {
    // Для тега показываем имя тега
    const tag = getTagInfo(form.toCategory, form.toTag)
    return tag?.name || form.toTag || 'Тег'
  } else {
    // tag-to-tag
    const tag = getTagInfo(form.toCategory, form.toTag)
    return tag?.name || form.toTag || 'Тег'
  }
}

// ===== TRANSITION RULES EDITING =====

// Форма для редактирования правила перехода
const transitionRuleForm = ref({
  level: 'terrain-to-tag', // 'tag-to-tag' | 'terrain-to-tag' | 'terrain-to-terrain'
  // Для tag-to-tag
  fromCategory: 'surface',
  fromTag: '',
  toCategory: 'surface', 
  toTag: '',
  // Для terrain-to-tag / terrain-to-terrain
  toTerrainId: null,
  // Приоритет отрисовки: 'from' = "от" рисуется выше, 'to' = "к" рисуется выше, 'auto' = по elevation
  zPriority: 'auto',
  // Pipeline эффектов
  effects: []
})

// Следим за изменениями эффектов в форме редактирования перехода
// НЕ инвалидируем кэш паттернов — они не меняются при изменении переходов, не меняем terrainConfigVersion
watch(() => transitionRuleForm.value.effects, () => {
  hexMapCanvasRef.value?.forceRedraw?.()
}, { deep: true })

// Следим за изменениями zPriority в форме редактирования перехода
watch(() => transitionRuleForm.value.zPriority, () => {
  hexMapCanvasRef.value?.forceRedraw?.()
})

// Правила, связанные с текущим террейном или его тегами
const relatedTransitionRules = computed(() => {
  if (!terrainStore) return []
  
  // Pinia computed не требует .value при обращении из компонента
  const allRules = terrainStore.allTransitionRules || []
  const currentId = editingTerrain.value?.id
  const currentTags = terrainForm.value.categoryTags || {}
  
  return allRules.filter(rule => {
    // Правила где текущий террейн — источник
    if (rule.level === 'terrain-to-terrain' && rule.fromTerrainId === currentId) return true
    if (rule.level === 'terrain-to-tag' && rule.fromTerrainId === currentId) return true
    
    // Правила где текущий террейн — цель
    if (rule.level === 'terrain-to-terrain' && rule.toTerrainId === currentId) return true
    
    // Правила tag-to-tag где теги совпадают
    if (rule.level === 'tag-to-tag') {
      const fromTagValue = currentTags[rule.from?.category]
      const toTagValue = currentTags[rule.to?.category]
      if (fromTagValue === rule.from?.tag || rule.from?.tag === '*') return true
      if (toTagValue === rule.to?.tag || rule.to?.tag === '*') return true
    }
    
    return false
  })
})

// Количество связанных правил для бейджа
const relatedTransitionRulesCount = computed(() => relatedTransitionRules.value.length)

// Начать создание нового правила
const startCreateTransitionRule = () => {
  isCreatingTransitionRule.value = true
  editingTransitionRule.value = null
  transitionRuleForm.value = {
    level: 'terrain-to-tag',
    fromCategory: 'surface',
    fromTag: terrainForm.value.categoryTags?.surface || '',
    toCategory: 'surface',
    toTag: '',
    toTerrainId: null,
    zPriority: 'auto',
    effects: []
  }
}

// Начать редактирование правила
const startEditTransitionRule = (rule) => {
  isCreatingTransitionRule.value = false
  editingTransitionRule.value = rule
  
  transitionRuleForm.value = {
    level: rule.level,
    fromCategory: rule.from?.category || 'surface',
    fromTag: rule.from?.tag || '',
    toCategory: rule.to?.category || 'surface',
    toTag: rule.to?.tag || '',
    toTerrainId: rule.toTerrainId || null,
    zPriority: rule.zPriority || 'auto',
    effects: rule.effects || []
  }
}

// Сохранить правило
const saveTransitionRule = () => {
  const form = transitionRuleForm.value
  const currentTerrainId = editingTerrain.value?.id || '__new__'
  
  const rule = {
    level: form.level,
    zPriority: form.zPriority || 'auto',
    effects: [...form.effects]
  }
  
  // Заполняем from/to в зависимости от уровня
  if (form.level === 'tag-to-tag') {
    rule.from = { category: form.fromCategory, tag: form.fromTag }
    rule.to = { category: form.toCategory, tag: form.toTag }
  } else if (form.level === 'terrain-to-tag') {
    rule.fromTerrainId = currentTerrainId
    rule.to = { category: form.toCategory, tag: form.toTag }
  } else if (form.level === 'terrain-to-terrain') {
    rule.fromTerrainId = currentTerrainId
    rule.toTerrainId = form.toTerrainId
  }
  
  if (editingTransitionRule.value?.id) {
    terrainStore?.updateTransitionRule(editingTransitionRule.value.id, rule)
  } else {
    terrainStore?.addTransitionRule(rule)
  }
  
  cancelTransitionRuleEdit()
}

// Отменить редактирование правила
const cancelTransitionRuleEdit = () => {
  isCreatingTransitionRule.value = false
  editingTransitionRule.value = null
}

// Удалить правило
const deleteTransitionRule = (rule) => {
  if (!rule.id) return // Дефолтные правила нельзя удалить
  if (!confirm('Удалить это правило перехода?')) return
  terrainStore?.removeTransitionRule(rule.id)
}

// Получить описание правила
const getTransitionRuleDescription = (rule) => {
  if (rule.level === 'tag-to-tag') {
    const fromTag = getTagInfo(rule.from?.category, rule.from?.tag)
    const toTag = getTagInfo(rule.to?.category, rule.to?.tag)
    return `${fromTag?.name || rule.from?.tag || '*'} → ${toTag?.name || rule.to?.tag || '*'}`
  } else if (rule.level === 'terrain-to-tag') {
    const toTag = getTagInfo(rule.to?.category, rule.to?.tag)
    return `Этот террейн → ${toTag?.name || rule.to?.tag || '*'}`
  } else if (rule.level === 'terrain-to-terrain') {
    const toTerrain = terrainStore?.getTerrainById(rule.toTerrainId)
    return `Этот террейн → ${toTerrain?.name || rule.toTerrainId}`
  }
  return 'Неизвестное правило'
}

// Получить уровень правила на русском
const getRuleLevelName = (level) => {
  const names = {
    'tag-to-tag': 'Тег → Тег',
    'terrain-to-tag': 'Террейн → Тег',
    'terrain-to-terrain': 'Террейн → Террейн'
  }
  return names[level] || level
}

// Получить дефолтные параметры для стиля
const getStyleDefaults = (styleId) => {
  const style = transitionStyles.value?.find(s => s.id === styleId)
  return style?.defaults || {}
}

// При смене стиля — обновить параметры на дефолтные
const onStyleChange = () => {
  transitionRuleForm.value.params = { ...getStyleDefaults(transitionRuleForm.value.style) }
}

// Конфигурация параметров стилей (для UI)
const paramConfig = {
  amplitude: { label: 'Амплитуда', min: 0, max: 30, step: 1 },
  frequency: { label: 'Частота', min: 0.01, max: 0.5, step: 0.01 },
  width: { label: 'Ширина', min: 1, max: 50, step: 1 },
  offset: { label: 'Смещение', min: -30, max: 30, step: 1 },
  opacity: { label: 'Прозрачность', min: 0, max: 1, step: 0.05 },
  roughness: { label: 'Шероховатость', min: 0, max: 1, step: 0.05 },
  sharpness: { label: 'Резкость', min: 0.1, max: 1, step: 0.05 },
  segments: { label: 'Сегменты', min: 4, max: 24, step: 1 },
  noiseScale: { label: 'Масштаб шума', min: 0.01, max: 0.5, step: 0.01 },
  threshold: { label: 'Порог', min: 0, max: 1, step: 0.05 },
  density: { label: 'Плотность', min: 0, max: 1, step: 0.05 },
  fadeWidth: { label: 'Ширина затухания', min: 5, max: 40, step: 1 },
  softEdge: { label: 'Мягкий край', isBoolean: true },
  smoothness: { label: 'Сглаживание линии', min: 0, max: 1, step: 0.05 }
}

// Получить конфигурацию для параметра
const getParamConfig = (key) => {
  return paramConfig[key] || { label: key, min: 0, max: 10, step: 1 }
}

// Видимость для UI
const visibilityOptions = [
  { id: 'open', label: 'Открытая', icon: 'mdi:eye', description: 'Полностью видно сквозь' },
  { id: 'partial', label: 'Маскирующая', icon: 'mdi:eye-outline', description: 'Частично скрывает' },
  { id: 'blocking', label: 'Блокирующая', icon: 'mdi:eye-off', description: 'Полностью блокирует обзор' }
]

// ===== PERSIST EDITING STATE =====

// Следим за изменением редактируемого террейна и сохраняем его ID
watch(editingTerrain, (terrain) => {
  userPrefs.updateAssetManager({ editingTerrainId: terrain?.id || null })
})

// Восстанавливаем состояние при загрузке
onMounted(() => {
  const savedTerrainId = userPrefs.assetManager?.editingTerrainId
  if (savedTerrainId && terrainStore) {
    const terrain = terrainStore.getTerrainById?.(savedTerrainId)
    if (terrain) {
      // Восстанавливаем редактирование
      editingTerrain.value = terrain
      // Заполняем форму
      terrainForm.value = {
        name: terrain.name || '',
        description: terrain.description || '',
        biome: terrain.biome || 'plains',
        color: terrain.layers?.[0]?.fill || terrain.color || '#888888',
        visibility: terrain.visibility || 'open',
        movementCost: terrain.movementCost || 1,
        meleeAdvantage: terrain.meleeAdvantage || 0,
        tags: Array.isArray(terrain.tags) ? [...terrain.tags] : [],
        layers: Array.isArray(terrain.layers) ? JSON.parse(JSON.stringify(terrain.layers)) : [],
        categoryTags: terrain.categoryTags ? JSON.parse(JSON.stringify(terrain.categoryTags)) : {},
        effectsPipeline: terrain.effectsPipeline ? JSON.parse(JSON.stringify(terrain.effectsPipeline)) : []
      }
    }
  }
})
</script>

<template>
  <div class="asset-manager">
    <!-- Заголовок -->
    <div class="manager-header">
      <h2 class="manager-title">
        <Icon icon="mdi:folder-cog" />
        <span>Материалы</span>
      </h2>
      
      <!-- Категории -->
      <div class="category-tabs">
        <button
          v-for="cat in categories"
          :key="cat.id"
          class="category-tab"
          :class="{ active: activeCategory === cat.id, disabled: cat.disabled }"
          :disabled="cat.disabled"
          @click="activeCategory = cat.id"
        >
          <Icon :icon="cat.icon" />
          <span>{{ cat.label }}</span>
          <span class="count">{{ cat.count.value }}</span>
        </button>
      </div>
    </div>
    
    <!-- Контент категории -->
    <div class="manager-content">
      <!-- Террейны -->
      <template v-if="activeCategory === 'terrains'">
        <div class="terrains-layout" :class="{ 'editor-active': isEditorMode, 'preview-visible': showPreview }">
          
          <!-- Левая панель: список террейнов (всегда видна) -->
          <div class="left-panel">
            <div class="panel-header">
              <h3 v-if="!isEditorMode">
                <Icon icon="mdi:texture-box" />
                Террейны
              </h3>
              <h3 v-else>
                <Icon icon="mdi:hexagon-multiple" />
                {{ selectedNeighborIndex >= 0 ? `Сосед: ${neighborPositions[selectedNeighborIndex]?.label}` : 'Выбор соседа' }}
              </h3>
              
              <!-- Кнопка закрыть выбор соседа -->
              <button 
                v-if="isEditorMode && selectedNeighborIndex >= 0" 
                class="btn-close-selector"
                @click="selectedNeighborIndex = -1"
                title="Закрыть"
              >
                <Icon icon="mdi:close" />
              </button>
            </div>
            
            <!-- Тулбар (только когда не в режиме редактирования) -->
            <div class="list-toolbar" v-if="!isEditorMode">
              <div class="search-box">
                <Icon icon="mdi:magnify" />
                <input 
                  v-model="terrainFilter" 
                  type="text" 
                  placeholder="Поиск террейнов..."
                />
              </div>
              
              <div class="toolbar-actions">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="showOnlyCustom" />
                  <span>Только свои ({{ customCount }})</span>
                </label>
                
                <select v-model="selectedBiome" class="biome-filter">
                  <option :value="null">Все биомы</option>
                  <option v-for="biome in biomes" :key="biome.id" :value="biome.id">
                    {{ biome.name }}
                  </option>
                </select>
              </div>
              
              <div class="toolbar-buttons">
                <button class="btn-action" @click="startCreateTerrain" title="Создать террейн">
                  <Icon icon="mdi:plus" />
                  <span>Создать</span>
                </button>
                <button class="btn-action secondary" @click="importTerrains" title="Импорт">
                  <Icon icon="mdi:upload" />
                </button>
                <button 
                  class="btn-action secondary" 
                  @click="exportTerrains" 
                  :disabled="customCount === 0"
                  title="Экспорт своих террейнов"
                >
                  <Icon icon="mdi:download" />
                </button>
              </div>
            </div>
            
            <!-- Тулбар для режима редактирования (упрощённый) -->
            <div class="list-toolbar compact" v-else>
              <div class="search-box">
                <Icon icon="mdi:magnify" />
                <input 
                  v-model="neighborSearchFilter" 
                  type="text" 
                  placeholder="Найти террейн..."
                />
              </div>
              
              <!-- Быстрые действия для соседа -->
              <div class="neighbor-quick-actions" v-if="selectedNeighborIndex >= 0">
                <button 
                  v-if="neighborTerrains[selectedNeighborIndex]"
                  class="btn-action secondary small"
                  @click="clearNeighbor(selectedNeighborIndex)"
                  title="Убрать"
                >
                  <Icon icon="mdi:close" />
                </button>
                <button 
                  class="btn-action secondary small"
                  @click="fillAllNeighborsWithSelected"
                  :disabled="!neighborTerrains[selectedNeighborIndex]"
                  title="Заполнить все"
                >
                  <Icon icon="mdi:hexagon-multiple" />
                </button>
              </div>
            </div>
            
            <!-- Сетка террейнов (карточки плиткой - всегда) -->
            <div class="terrains-grid" :class="{ 'picker-mode': isEditorMode, 'target-picking-mode': isPickingTargetTerrain }">
              <div
                v-for="terrain in (isEditorMode ? filteredTerrainsForPicker : filteredTerrains)"
                :key="terrain.id"
                class="terrain-card"
                :class="{ 
                  selected: !isEditorMode && editingTerrain?.id === terrain.id,
                  'neighbor-selected': isEditorMode && selectedNeighborIndex >= 0 && neighborTerrains[selectedNeighborIndex]?.id === terrain.id,
                  'brush-selected': isEditorMode && clusterShape !== 'cluster7' && paintBrushTerrain?.id === terrain.id,
                  'target-selected': isPickingTargetTerrain && transitionRuleForm.toTerrainId === terrain.id,
                  'target-picking': isPickingTargetTerrain && !transitionRuleForm.toTerrainId,
                  custom: terrain.isCustom 
                }"
                @click="handleTerrainCardClick(terrain)"
              >
                <div 
                  class="terrain-preview"
                  :style="{ backgroundColor: terrain.color || '#888' }"
                >
                  <TerrainPreview 
                    v-if="terrain.layers?.length > 0"
                    :layers="terrain.layers"
                    :color="terrain.color"
                    :size="80"
                    :hex-mask="false"
                  />
                </div>
                <div class="terrain-info">
                  <div class="terrain-name">
                    {{ terrain.name }}
                    <Icon v-if="terrain.isCustom" icon="mdi:account" class="custom-badge" title="Свой" />
                  </div>
                  <div class="terrain-meta" v-if="!isEditorMode">
                    <span class="meta-item" :title="`Стоимость: ${terrain.movementCost}`">
                      <Icon icon="mdi:walk" />
                      {{ terrain.movementCost }}
                    </span>
                    <span class="meta-item" :title="terrain.visibility">
                      <Icon :icon="terrain.visibility === 'blocking' ? 'mdi:eye-off' : terrain.visibility === 'partial' ? 'mdi:eye-outline' : 'mdi:eye'" />
                    </span>
                  </div>
                </div>
                
                <!-- Быстрые действия (только вне режима редактирования) -->
                <div class="terrain-actions" v-if="!isEditorMode" @click.stop>
                  <button v-if="terrain.isCustom" @click="duplicateTerrain(terrain)" title="Дублировать">
                    <Icon icon="mdi:content-copy" />
                  </button>
                  <button v-if="terrain.isCustom" @click="deleteTerrain(terrain)" title="Удалить" class="delete">
                    <Icon icon="mdi:delete" />
                  </button>
                  <button v-if="!terrain.isCustom" @click="startEditTerrain(terrain)" title="Создать копию">
                    <Icon icon="mdi:content-copy" />
                  </button>
                </div>
              </div>
              
              <!-- Пустое состояние -->
              <div v-if="(isEditorMode ? filteredTerrainsForPicker : filteredTerrains).length === 0" class="empty-state">
                <Icon icon="mdi:texture-box" />
                <p>Террейны не найдены</p>
                <button v-if="!isEditorMode" class="btn-action" @click="startCreateTerrain">
                  Создать первый террейн
                </button>
              </div>
            </div>
          </div>
          
          <!-- Центральная панель: превью (появляется при редактировании) -->
          <div class="center-panel" v-if="showPreview">
            <div class="panel-header">
              <h3>
                <Icon icon="mdi:hexagon-multiple" />
                Превью
              </h3>
              <div class="preview-actions">
                <!-- Переключатель режима превью -->
                <select v-model="previewMode" class="preview-mode-select" title="Режим превью">
                  <option value="cluster">Cluster</option>
                  <option value="map">HexMap</option>
                </select>
                
                <!-- Режим рендера (только для HexMap) -->
                <select 
                  v-if="previewMode === 'map'" 
                  v-model="mapRenderMode" 
                  class="render-mode-select"
                  title="Режим рендера"
                >
                  <option value="primitive">Primitive</option>
                  <option value="live">Live</option>
                  <option value="cached">Cached</option>
                </select>
                
                <button 
                  class="btn-small" 
                  @click="clearAllNeighbors" 
                  title="Очистить соседей"
                  :disabled="!hasAnyNeighbor"
                >
                  <Icon icon="mdi:eraser" />
                </button>
              </div>
            </div>
            
            <!-- Canvas с гексами -->
            <div class="hex-cluster-container">
              <!-- Старый режим: HexClusterPreview -->
              <HexClusterPreview
                v-if="previewMode === 'cluster'"
                :key="clusterShape"
                :center-terrain="centerTerrainData"
                :neighbors="neighborTerrainsForPreview"
                :hex-radius="clusterShape === 'cluster7' ? 55 : 35"
                :selected-index="clusterShape === 'cluster7' ? selectedNeighborIndex : -1"
                :transitions="neighborTransitions"
                :show-grid="showHexGrid"
                :cluster-shape="clusterShape"
                :alternate-terrain="alternateTerrainForPreview"
                :hex-terrains="clusterShape !== 'cluster7' ? extendedHexTerrainsForPreview : null"
                :editing-rule="currentEditingRule"
                @select="handleHexSelect"
                @paintstart="handlePaintStart"
                @paintmove="handlePaintMove"
                @paintend="handlePaintEnd"
              />
              
              <!-- Новый режим: HexMapCanvas -->
              <HexMapCanvas
                v-if="previewMode === 'map'"
                ref="hexMapCanvasRef"
                :hexes="hexMapData"
                :hex-size="30"
                :render-mode="mapRenderMode"
                :show-grid="showHexGrid"
                :interactive="true"
                :editable="true"
                :expandable="true"
                :get-terrain-by-id="getTerrainByIdForMap"
                :get-transition-rule="getTransitionRuleForMap"
                :initial-camera="mapCamera"
                :lighting-settings="lightingSettings"
                :brush-preview-hexes="brushPreviewHexesForMap"
                :terrain-version="terrainConfigVersion"
                class="hex-map-canvas-preview"
                @hex-click="handleMapPaintStart"
                @hex-hover="handleMapHexHover"
                @paint-start="handleMapPaintStart"
                @paint-move="handleMapPaintMove"
                @paint-end="handleMapPaintEnd"
                @camera-change="handleMapCameraChange"
              />
              
              <!-- Управление превью -->
              <div class="preview-controls">
                <label class="grid-toggle">
                  <input type="checkbox" v-model="showHexGrid" />
                  <span>Сетка</span>
                </label>
                
                <!-- Режим Cluster: выбор формы -->
                <template v-if="previewMode === 'cluster'">
                  <select v-model="clusterShape" class="shape-select">
                    <option v-for="shape in clusterShapes" :key="shape.value" :value="shape.value">
                      {{ shape.label }}
                    </option>
                  </select>
                  
                  <button 
                    v-if="clusterShape !== 'cluster7'"
                    class="btn-small"
                    @click="clearExtendedHexes"
                    title="Очистить все гексы"
                  >
                    <Icon icon="mdi:eraser" />
                  </button>
                </template>
                
                <!-- Режим HexMap: выбор шаблона -->
                <template v-if="previewMode === 'map'">
                  <select 
                    :value="activeTemplateId" 
                    @change="selectTemplate($event.target.value)"
                    class="shape-select"
                  >
                    <option value="" disabled>Выберите шаблон...</option>
                    <option 
                      v-for="template in mapTemplates" 
                      :key="template.id" 
                      :value="template.id"
                    >
                      {{ template.name }}
                    </option>
                  </select>
                  
                  <button 
                    class="btn-small"
                    @click="createNewTemplate"
                    title="Создать новый шаблон"
                  >
                    <Icon icon="mdi:plus" />
                  </button>
                  
                  <button 
                    class="btn-small"
                    @click="clearCurrentTemplate"
                    title="Очистить шаблон"
                    :disabled="!activeTemplateId"
                  >
                    <Icon icon="mdi:eraser" />
                  </button>
                  
                  <button 
                    v-if="activeTemplateId"
                    class="btn-small"
                    @click="renameCurrentTemplate"
                    title="Переименовать шаблон"
                  >
                    <Icon icon="mdi:pencil" />
                  </button>
                  
                  <button 
                    v-if="activeTemplateId"
                    class="btn-small"
                    @click="deleteTemplate(activeTemplateId)"
                    title="Удалить шаблон"
                  >
                    <Icon icon="mdi:delete" />
                  </button>
                </template>
              </div>
            </div>
            
            <!-- Подпись: текущая кисть или название террейна -->
            <div class="center-terrain-label">
              <template v-if="previewMode === 'map' && paintBrushTerrain">
                <Icon icon="mdi:brush" class="brush-icon" />
                {{ paintBrushTerrain.name || 'Кисть' }}
              </template>
              <template v-else-if="previewMode === 'cluster' && clusterShape !== 'cluster7' && paintBrushTerrain">
                <Icon icon="mdi:brush" class="brush-icon" />
                {{ paintBrushTerrain.name || 'Кисть' }}
              </template>
              <template v-else>
                {{ terrainForm.name || 'Новый террейн' }}
              </template>
            </div>
            
            <!-- Подсказка -->
            <div class="hex-hint">
              <Icon icon="mdi:gesture-tap" />
              <template v-if="previewMode === 'map'">
                <span v-if="!paintBrushTerrain">Выберите террейн слева для рисования</span>
                <span v-else>ЛКМ — рисовать, СКМ/ПКМ — двигать карту, колёсико — зум</span>
              </template>
              <template v-else>
                <span v-if="clusterShape === 'cluster7'">Кликните на гекс для выбора террейна</span>
                <span v-else-if="!paintBrushTerrain">Выберите террейн слева для рисования</span>
                <span v-else>Рисуйте мышью на превью</span>
              </template>
            </div>
          </div>
          
          <!-- Правая панель: редактор -->
          <div class="right-panel" :class="{ active: editingTerrain || isCreatingNew }">
            <template v-if="editingTerrain || isCreatingNew">
              <div class="panel-header">
                <h3>{{ isCreatingNew ? 'Новый террейн' : 'Редактирование' }}</h3>
                <button class="btn-close" @click="cancelEdit">
                  <Icon icon="mdi:close" />
                </button>
              </div>
              
              <div class="editor-content">
                <!-- Вкладки редактора (только иконки) -->
                <div class="editor-tabs">
                  <button 
                    class="editor-tab" 
                    :class="{ active: editorTab === 'basic' }"
                    @click="editorTab = 'basic'"
                    title="Основное"
                  >
                    <Icon icon="mdi:cog" />
                  </button>
                  <button 
                    class="editor-tab" 
                    :class="{ active: editorTab === 'layers' }"
                    @click="editorTab = 'layers'"
                    title="Слои"
                  >
                    <Icon icon="mdi:layers" />
                    <span class="tab-badge" v-if="terrainForm.layers.length">{{ terrainForm.layers.length }}</span>
                  </button>
                  <button 
                    class="editor-tab" 
                    :class="{ active: editorTab === 'adjacency' }"
                    @click="editorTab = 'adjacency'"
                    title="Теги"
                  >
                    <Icon icon="mdi:hexagon-multiple-outline" />
                  </button>
                  <button 
                    class="editor-tab" 
                    :class="{ active: editorTab === 'transitions' }"
                    @click="editorTab = 'transitions'"
                    title="Правила переходов"
                  >
                    <Icon icon="mdi:transition" />
                    <span class="tab-badge" v-if="relatedTransitionRulesCount">{{ relatedTransitionRulesCount }}</span>
                  </button>
                  
                  <!-- Кнопка превью (когда не в режиме слоёв) -->
                  <button 
                    v-if="editorTab === 'basic'"
                    class="editor-tab preview-toggle"
                    :class="{ active: previewManuallyOpened }"
                    @click="togglePreview"
                    title="Показать превью соседства"
                  >
                    <Icon icon="mdi:hexagon-multiple" />
                  </button>
                </div>
                
                <!-- Tab: Основное -->
                <template v-if="editorTab === 'basic'">
                <div class="tab-header">
                  <Icon icon="mdi:cog" />
                  <span>Основное</span>
                </div>
                <!-- Основные поля -->
                <div class="form-section">
                  <label class="form-label">
                    Название
                    <input 
                      v-model="terrainForm.name" 
                      type="text" 
                      placeholder="Название террейна"
                      class="form-input"
                    />
                  </label>
                  
                  <label class="form-label">
                    Описание
                    <textarea 
                      v-model="terrainForm.description" 
                      placeholder="Описание..."
                      class="form-textarea"
                      rows="2"
                    ></textarea>
                  </label>
                </div>
                
                <!-- Визуальные настройки -->
                <div class="form-section">
                  <div class="section-title">Внешний вид</div>
                  
                  <div class="form-row">
                    <label class="form-label color-label">
                      Цвет
                      <input 
                        v-model="terrainForm.color" 
                        type="color" 
                        class="form-color"
                      />
                    </label>
                    
                    <label class="form-label">
                      Биом
                      <select v-model="terrainForm.biome" class="form-select">
                        <option v-for="biome in biomes" :key="biome.id" :value="biome.id">
                          {{ biome.name }}
                        </option>
                      </select>
                    </label>
                  </div>
                </div>
                
                <!-- Механические настройки -->
                <div class="form-section">
                  <div class="section-title">Механика</div>
                  
                  <label class="form-label">
                    Видимость
                    <div class="visibility-options">
                      <button
                        v-for="opt in visibilityOptions"
                        :key="opt.id"
                        class="visibility-btn"
                        :class="{ active: terrainForm.visibility === opt.id }"
                        :title="opt.description"
                        @click="terrainForm.visibility = opt.id"
                      >
                        <Icon :icon="opt.icon" />
                        <span>{{ opt.label }}</span>
                      </button>
                    </div>
                  </label>
                  
                  <div class="form-row">
                    <label class="form-label">
                      Стоимость движения
                      <div class="range-input">
                        <input 
                          v-model.number="terrainForm.movementCost" 
                          type="range" 
                          min="1" 
                          max="5"
                        />
                        <span class="range-value">{{ terrainForm.movementCost }}</span>
                      </div>
                    </label>
                    
                    <label class="form-label">
                      Преимущество в ближнем бою
                      <div class="range-input">
                        <input 
                          v-model.number="terrainForm.meleeAdvantage" 
                          type="range" 
                          min="-2" 
                          max="2"
                        />
                        <span class="range-value">{{ terrainForm.meleeAdvantage > 0 ? '+' : '' }}{{ terrainForm.meleeAdvantage }}</span>
                      </div>
                    </label>
                  </div>
                </div>
                
                <!-- Теги -->
                <div class="form-section">
                  <div class="section-title">Теги</div>
                  <div class="tags-input">
                    <div class="tags-list">
                      <span 
                        v-for="tag in terrainForm.tags" 
                        :key="tag" 
                        class="tag"
                      >
                        {{ tag }}
                        <button @click="removeTag(tag)">×</button>
                      </span>
                    </div>
                    <input 
                      v-model="newTag" 
                      type="text" 
                      placeholder="Добавить тег..."
                      @keydown.enter.prevent="addTag"
                    />
                  </div>
                </div>
                </template>
                
                <!-- Tab: Слои -->
                <template v-if="editorTab === 'layers'">
                  <div class="tab-header">
                    <Icon icon="mdi:layers" />
                    <span>Слои</span>
                  </div>
                  
                  <!-- Пресеты -->
                  <div class="form-section">
                    <div class="section-title">Быстрые пресеты</div>
                    <div class="preset-buttons">
                      <button 
                        v-for="preset in presetOptions"
                        :key="preset.id"
                        class="preset-btn"
                        @click="applyPreset(preset.id)"
                        :title="preset.label"
                      >
                        {{ preset.label }}
                      </button>
                    </div>
                  </div>
                  
                  <!-- Список слоёв -->
                  <div class="form-section">
                    <div class="section-header">
                      <div class="section-title">Слои</div>
                      <div class="section-actions">
                        <button 
                          class="btn-small" 
                          @click="clearLayers" 
                          :disabled="terrainForm.layers.length === 0"
                          title="Очистить все"
                        >
                          <Icon icon="mdi:delete-sweep" />
                        </button>
                      </div>
                    </div>
                    
                    <div class="layers-list" v-if="terrainForm.layers.length > 0">
                      <div 
                        v-for="(layer, index) in terrainForm.layers"
                        :key="layer.id || index"
                        class="layer-item"
                        :class="{ 
                          selected: editingLayerIndex === index,
                          disabled: !layer.enabled 
                        }"
                        @click="editingLayerIndex = index"
                      >
                        <div class="layer-drag">
                          <Icon icon="mdi:drag-vertical" />
                        </div>
                        <div 
                          class="layer-color-preview"
                          :style="{ backgroundColor: layer.color }"
                        ></div>
                        <div class="layer-info">
                          <span class="layer-type">{{ getLayerTypeName(layer.type) }}</span>
                          <span class="layer-opacity">{{ Math.round(layer.opacity * 100) }}%</span>
                        </div>
                        <div class="layer-actions" @click.stop>
                          <button @click="toggleLayer(index)" :title="layer.enabled ? 'Скрыть' : 'Показать'">
                            <Icon :icon="layer.enabled ? 'mdi:eye' : 'mdi:eye-off'" />
                          </button>
                          <button @click="moveLayerUp(index)" :disabled="index === 0" title="Вверх">
                            <Icon icon="mdi:arrow-up" />
                          </button>
                          <button @click="moveLayerDown(index)" :disabled="index === terrainForm.layers.length - 1" title="Вниз">
                            <Icon icon="mdi:arrow-down" />
                          </button>
                          <button @click="duplicateLayer(index)" title="Дублировать">
                            <Icon icon="mdi:content-copy" />
                          </button>
                          <button @click="removeLayer(index)" class="delete" title="Удалить">
                            <Icon icon="mdi:delete" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div v-else class="layers-empty">
                      <p>Нет слоёв</p>
                      <p class="hint">Добавьте слой или примените пресет</p>
                    </div>
                    
                    <!-- Добавить слой -->
                    <div class="add-layer-row">
                      <button 
                        v-for="lt in layerTypeOptions"
                        :key="lt.id"
                        class="add-layer-btn"
                        @click="addLayer(lt.id)"
                        :title="lt.label"
                      >
                        <Icon :icon="lt.icon" />
                        <span>{{ lt.label }}</span>
                      </button>
                    </div>
                    
                    <!-- Генерация полного паттерна -->
                    <div class="pattern-generation" v-if="terrainForm.layers.some(l => l.type === 'noise')">
                      <div class="pattern-info">
                        <Icon icon="mdi:information-outline" />
                        <span>Превью: быстрый режим (200×200px)</span>
                      </div>
                      <button 
                        class="btn-generate-full"
                        @click="generateFullPattern"
                        title="Сгенерировать паттерн полного размера (1024×1024px)"
                      >
                        <Icon icon="mdi:image-size-select-large" />
                        Сгенерировать полностью
                      </button>
                    </div>
                  </div>
                  
                  <!-- Редактор выбранного слоя -->
                  <div class="form-section layer-editor" v-if="currentEditingLayer">
                    <div class="section-title">
                      Настройки слоя
                      <span class="layer-number">#{{ editingLayerIndex + 1 }}</span>
                    </div>
                    
                    <!-- Тип слоя -->
                    <label class="form-label">
                      Тип
                      <select v-model="currentEditingLayer.type" class="form-select">
                        <option v-for="lt in layerTypeOptions" :key="lt.id" :value="lt.id">
                          {{ lt.label }}
                        </option>
                      </select>
                    </label>
                    
                    <!-- Общие настройки -->
                    <div class="form-row">
                      <label class="form-label color-label">
                        Цвет
                        <input v-model="currentEditingLayer.color" type="color" class="form-color" />
                      </label>
                      <label class="form-label">
                        Непрозрачность
                        <div class="range-input">
                          <input 
                            v-model.number="currentEditingLayer.opacity" 
                            type="range" 
                            min="0" 
                            max="1" 
                            step="0.05"
                          />
                          <span class="range-value">{{ Math.round(currentEditingLayer.opacity * 100) }}%</span>
                        </div>
                      </label>
                    </div>
                    
                    <!-- Режим наложения -->
                    <label class="form-label">
                      Режим наложения
                      <select v-model="currentEditingLayer.blendMode" class="form-select">
                        <option v-for="bm in blendModeOptions" :key="bm.id" :value="bm.id">
                          {{ bm.label }}
                        </option>
                      </select>
                    </label>
                    
                    <!-- Настройки шума -->
                    <template v-if="currentEditingLayer.type === 'noise'">
                      <div class="subsection-title">Параметры шума</div>
                      
                      <label class="form-label">
                        Тип шума
                        <select v-model="currentEditingLayer.noiseType" class="form-select">
                          <option v-for="nt in noiseTypeOptions" :key="nt.id" :value="nt.id">
                            {{ nt.label }}
                          </option>
                        </select>
                      </label>
                      
                      <label class="form-label">
                        Масштаб
                        <div class="range-input">
                          <input 
                            v-model.number="currentEditingLayer.noiseScale" 
                            type="range" 
                            min="0.01" 
                            max="0.5" 
                            step="0.01"
                          />
                          <span class="range-value">{{ currentEditingLayer.noiseScale.toFixed(2) }}</span>
                        </div>
                      </label>
                      
                      <label class="form-label">
                        Октавы (детализация)
                        <div class="range-input">
                          <input 
                            v-model.number="currentEditingLayer.noiseOctaves" 
                            type="range" 
                            min="1" 
                            max="6" 
                            step="1"
                          />
                          <span class="range-value">{{ currentEditingLayer.noiseOctaves }}</span>
                        </div>
                      </label>
                      
                      <label class="form-label">
                        Контраст
                        <div class="range-input">
                          <input 
                            v-model.number="currentEditingLayer.noiseContrast" 
                            type="range" 
                            min="0.5" 
                            max="3" 
                            step="0.1"
                          />
                          <span class="range-value">{{ currentEditingLayer.noiseContrast.toFixed(1) }}</span>
                        </div>
                      </label>
                      
                      <!-- Seed управление -->
                      <div class="seed-control">
                        <label class="checkbox-inline">
                          <input 
                            type="checkbox" 
                            :checked="currentEditingLayer.noiseSeed !== null"
                            @change="toggleNoiseSeed"
                          />
                          <span>Закрепить шум</span>
                        </label>
                        <button 
                          v-if="currentEditingLayer.noiseSeed !== null"
                          class="btn-small"
                          @click="regenerateNoiseSeed"
                          title="Сгенерировать новый seed"
                        >
                          <Icon icon="mdi:refresh" />
                        </button>
                      </div>
                    </template>
                    
                    <!-- Настройки паттерна -->
                    <template v-if="currentEditingLayer.type === 'pattern'">
                      <div class="subsection-title">Параметры паттерна</div>
                      
                      <label class="form-label">
                        Тип паттерна
                        <select v-model="currentEditingLayer.patternType" class="form-select">
                          <option v-for="pt in patternTypeOptions" :key="pt.id" :value="pt.id">
                            {{ pt.label }}
                          </option>
                        </select>
                      </label>
                      
                      <label class="form-label">
                        Размер
                        <div class="range-input">
                          <input 
                            v-model.number="currentEditingLayer.patternSize" 
                            type="range" 
                            min="1" 
                            max="20" 
                            step="1"
                          />
                          <span class="range-value">{{ currentEditingLayer.patternSize }}px</span>
                        </div>
                      </label>
                      
                      <label class="form-label">
                        Интервал
                        <div class="range-input">
                          <input 
                            v-model.number="currentEditingLayer.patternSpacing" 
                            type="range" 
                            min="2" 
                            max="40" 
                            step="1"
                          />
                          <span class="range-value">{{ currentEditingLayer.patternSpacing }}px</span>
                        </div>
                      </label>
                      
                      <label class="form-label" v-if="currentEditingLayer.patternType === 'lines' || currentEditingLayer.patternType === 'stripes'">
                        Угол
                        <div class="range-input">
                          <input 
                            v-model.number="currentEditingLayer.patternAngle" 
                            type="range" 
                            min="0" 
                            max="180" 
                            step="15"
                          />
                          <span class="range-value">{{ currentEditingLayer.patternAngle }}°</span>
                        </div>
                      </label>
                    </template>
                    
                    <!-- Gradient end color -->
                    <template v-if="currentEditingLayer.type === 'gradient'">
                      <label class="form-label color-label">
                        Конечный цвет
                        <input v-model="currentEditingLayer.colorEnd" type="color" class="form-color" />
                      </label>
                    </template>
                    
                    <!-- LOD: минимальный zoom для отображения слоя -->
                    <div class="subsection-title">LOD (Level of Detail)</div>
                    <label class="form-label">
                      Мин. zoom для отображения
                      <div class="range-input">
                        <input 
                          v-model.number="currentEditingLayer.minZoom" 
                          type="range" 
                          min="0" 
                          max="2" 
                          step="0.1"
                        />
                        <span class="range-value">{{ (currentEditingLayer.minZoom || 0).toFixed(1) }}</span>
                      </div>
                      <span class="hint">Слой скрывается при zoom меньше этого значения</span>
                    </label>
                  </div>
                  
                  <!-- Нет выбранного слоя -->
                  <div v-else-if="terrainForm.layers.length > 0" class="layer-editor-placeholder">
                    <Icon icon="mdi:gesture-tap" />
                    <p>Выберите слой для редактирования</p>
                  </div>
                </template>
                
                <!-- Tab: Соседство -->
                <template v-if="editorTab === 'adjacency'">
                  <div class="tab-header">
                    <Icon icon="mdi:hexagon-multiple-outline" />
                    <span>Теги и категории</span>
                  </div>
                  
                  <div class="form-section">
                    <p class="section-hint">
                      Выберите один тег из каждой категории для определения типа террейна.
                      Правила переходов между террейнами определяются на основе этих тегов.
                    </p>
                  </div>
                  
                  <!-- Категории тегов -->
                  <div 
                    v-for="category in tagCategories" 
                    :key="category.id"
                    class="form-section category-section"
                  >
                    <div class="section-header">
                      <div class="section-title category-title">
                        {{ category.name }}
                        <span v-if="category.required" class="required-mark">*</span>
                      </div>
                    </div>
                    <p class="section-hint">{{ category.description }}</p>
                    
                    <div class="category-tags">
                      <button
                        v-for="tag in category.tags"
                        :key="tag.id"
                        class="category-tag-btn"
                        :class="{ 
                          selected: getCategoryTag(category.id) === tag.id 
                        }"
                        :style="{ 
                          '--tag-color': tag.color,
                          '--tag-color-light': tag.color + '33'
                        }"
                        @click="setCategoryTag(category.id, getCategoryTag(category.id) === tag.id ? null : tag.id)"
                      >
                        <span 
                          class="tag-color-dot"
                          :style="{ backgroundColor: tag.color }"
                        ></span>
                        <span>{{ tag.name }}</span>
                      </button>
                    </div>
                  </div>
                  
                  <!-- Активные правила переходов -->
                  <div class="form-section" v-if="neighborTransitions.some(t => t)">
                    <div class="section-title">
                      <Icon icon="mdi:transition" />
                      Активные правила переходов
                    </div>
                    <p class="section-hint">
                      Правила для текущих соседей в превью (на основе тегов)
                    </p>
                    
                    <div class="transition-rules-list">
                      <div 
                        v-for="(rule, idx) in neighborTransitions" 
                        :key="idx"
                        v-if="rule && neighborTerrains[idx]"
                        class="transition-rule-item"
                      >
                        <span class="neighbor-index">{{ idx + 1 }}</span>
                        <span class="neighbor-name">{{ neighborTerrains[idx]?.name }}</span>
                        <span class="transition-arrow">→</span>
                        <span class="transition-style">{{ getTransitionStyleName(rule.style) }}</span>
                      </div>
                    </div>
                    
                    <div v-if="!neighborTransitions.some(t => t)" class="transition-empty">
                      Нет активных правил (будет использован стиль по умолчанию)
                    </div>
                  </div>
                  
                  <!-- Стили переходов (справка) -->
                  <div class="form-section">
                    <div class="section-title">
                      <Icon icon="mdi:palette-outline" />
                      Доступные стили переходов
                    </div>
                    <div class="transition-styles-grid">
                      <div 
                        v-for="style in transitionStyles" 
                        :key="style.id"
                        class="transition-style-card"
                      >
                        <div class="style-name">{{ style.name }}</div>
                        <div class="style-desc">{{ style.description }}</div>
                      </div>
                    </div>
                  </div>
                </template>
                
                <!-- Tab: Переходы (редактор правил) -->
                <template v-if="editorTab === 'transitions'">
                  <div class="tab-header">
                    <Icon icon="mdi:transition" />
                    <span>Правила переходов</span>
                  </div>
                  
                  <div class="form-section">
                    <div class="section-header">
                      <button 
                        class="btn-small btn-primary"
                        @click="startCreateTransitionRule"
                        v-if="!isCreatingTransitionRule && !editingTransitionRule"
                      >
                        <Icon icon="mdi:plus" />
                        Добавить
                      </button>
                    </div>
                    <p class="section-hint">
                      Правила определяют как рисуется граница между террейнами.
                      Более специфичные правила имеют приоритет.
                    </p>
                  </div>
                  
                  <!-- Глобальные настройки освещения -->
                  <div class="form-section lighting-settings">
                    <div class="section-header">
                      <Icon icon="mdi:lightbulb-outline" />
                      <span>Освещение теней</span>
                      <label class="toggle-switch small">
                        <input 
                          type="checkbox" 
                          :checked="lightingSettings.enabled"
                          @change="terrainStore.updateLightingSettings({ enabled: $event.target.checked })"
                        />
                        <span class="toggle-slider"></span>
                      </label>
                    </div>
                    
                    <div class="lighting-controls" v-if="lightingSettings.enabled">
                      <div class="lighting-row">
                        <label>Направление</label>
                        <div class="angle-control">
                          <input 
                            type="range"
                            :value="lightingSettings.angle"
                            min="0" max="359" step="1"
                            @input="terrainStore.updateLightingSettings({ angle: +$event.target.value })"
                          />
                          <span class="angle-value">{{ lightingSettings.angle }}°</span>
                          <div 
                            class="angle-preview"
                            :style="{ transform: `rotate(${lightingSettings.angle}deg)` }"
                          >
                            <Icon icon="mdi:arrow-right" />
                          </div>
                        </div>
                      </div>
                      
                      <div class="lighting-row">
                        <label>Длина тени</label>
                        <div class="length-control">
                          <input 
                            type="range"
                            :value="lightingSettings.length"
                            min="0" max="20" step="1"
                            @input="terrainStore.updateLightingSettings({ length: +$event.target.value })"
                          />
                          <span class="length-value">{{ lightingSettings.length }}px</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <!-- Форма создания/редактирования правила -->
                  <template v-if="isCreatingTransitionRule || editingTransitionRule">
                    <div class="rule-editor">
                      <div class="rule-editor-header">
                        <span class="rule-editor-title">
                          {{ editingTransitionRule ? 'Редактировать правило' : 'Новое правило' }}
                        </span>
                      </div>
                      
                      <!-- Тип правила: кнопки-переключатели -->
                      <div class="rule-field">
                        <label class="rule-field-label">Тип</label>
                        <div class="rule-type-buttons">
                          <button 
                            class="type-btn"
                            :class="{ active: transitionRuleForm.level === 'terrain-to-tag' }"
                            @click="transitionRuleForm.level = 'terrain-to-tag'"
                            title="Этот террейн → Теги с определённым значением"
                          >
                            <Icon icon="mdi:tag-arrow-right" />
                            <span>→ Тег</span>
                          </button>
                          <button 
                            class="type-btn"
                            :class="{ active: transitionRuleForm.level === 'terrain-to-terrain' }"
                            @click="transitionRuleForm.level = 'terrain-to-terrain'"
                            title="Этот террейн → Конкретный террейн (высший приоритет)"
                          >
                            <Icon icon="mdi:arrow-right-bold" />
                            <span>→ Террейн</span>
                          </button>
                          <button 
                            class="type-btn"
                            :class="{ active: transitionRuleForm.level === 'tag-to-tag' }"
                            @click="transitionRuleForm.level = 'tag-to-tag'"
                            title="Тег → Тег (глобальное правило)"
                          >
                            <Icon icon="mdi:tag-multiple" />
                            <span>Тег → Тег</span>
                          </button>
                        </div>
                      </div>
                      
                      <!-- Для tag-to-tag: выбор исходного тега -->
                      <template v-if="transitionRuleForm.level === 'tag-to-tag'">
                        <div class="rule-field">
                          <label class="rule-field-label">От (категория / тег)</label>
                          <div class="tag-selector">
                            <div class="tag-buttons">
                              <button 
                                v-for="cat in tagCategories" 
                                :key="cat.id"
                                class="cat-btn"
                                :class="{ active: transitionRuleForm.fromCategory === cat.id }"
                                @click="transitionRuleForm.fromCategory = cat.id"
                              >
                                {{ cat.name }}
                              </button>
                            </div>
                            <div class="tag-buttons">
                              <button 
                                class="tag-btn"
                                :class="{ active: transitionRuleForm.fromTag === '*' }"
                                @click="transitionRuleForm.fromTag = '*'"
                              >*</button>
                              <button 
                                v-for="tag in tagCategories?.find(c => c.id === transitionRuleForm.fromCategory)?.tags" 
                                :key="tag.id"
                                class="tag-btn"
                                :class="{ active: transitionRuleForm.fromTag === tag.id }"
                                @click="transitionRuleForm.fromTag = tag.id"
                              >
                                {{ tag.name }}
                              </button>
                            </div>
                          </div>
                        </div>
                      </template>
                      
                      <!-- Цель: тег -->
                      <template v-if="transitionRuleForm.level === 'terrain-to-tag' || transitionRuleForm.level === 'tag-to-tag'">
                        <div class="rule-field">
                          <label class="rule-field-label">К (категория / тег)</label>
                          <div class="tag-selector">
                            <div class="tag-buttons">
                              <button 
                                v-for="cat in tagCategories" 
                                :key="cat.id"
                                class="cat-btn"
                                :class="{ active: transitionRuleForm.toCategory === cat.id }"
                                @click="transitionRuleForm.toCategory = cat.id"
                              >
                                {{ cat.name }}
                              </button>
                            </div>
                            <div class="tag-buttons">
                              <button 
                                class="tag-btn"
                                :class="{ active: transitionRuleForm.toTag === '*' }"
                                @click="transitionRuleForm.toTag = '*'"
                              >*</button>
                              <button 
                                v-for="tag in tagCategories?.find(c => c.id === transitionRuleForm.toCategory)?.tags" 
                                :key="tag.id"
                                class="tag-btn"
                                :class="{ active: transitionRuleForm.toTag === tag.id }"
                                @click="transitionRuleForm.toTag = tag.id"
                              >
                                {{ tag.name }}
                              </button>
                            </div>
                          </div>
                        </div>
                      </template>
                      
                      <!-- Для terrain-to-terrain: подсказка про выбор в списке -->
                      <template v-if="transitionRuleForm.level === 'terrain-to-terrain'">
                        <div class="rule-field">
                          <label class="rule-field-label">Целевой террейн</label>
                          <div class="terrain-target-hint" v-if="!transitionRuleForm.toTerrainId">
                            <Icon icon="mdi:arrow-left" />
                            <span>Выберите террейн в списке слева</span>
                          </div>
                          <div class="terrain-target-selected" v-else>
                            <span class="target-name">{{ getTerrainName(transitionRuleForm.toTerrainId) }}</span>
                            <button class="clear-btn" @click="transitionRuleForm.toTerrainId = null" title="Очистить">
                              <Icon icon="mdi:close" />
                            </button>
                          </div>
                        </div>
                      </template>
                      
                      <!-- Приоритет отрисовки: компактные кнопки -->
                      <div class="rule-field">
                        <label class="rule-field-label">Кто выше</label>
                        <div class="priority-buttons">
                          <button 
                            class="prio-btn"
                            :class="{ active: transitionRuleForm.zPriority === 'auto' }"
                            @click="transitionRuleForm.zPriority = 'auto'"
                            title="Определяется по elevation террейнов"
                          >
                            <Icon icon="mdi:auto-fix" />
                            Авто
                          </button>
                          <button 
                            class="prio-btn"
                            :class="{ active: transitionRuleForm.zPriority === 'from' }"
                            @click="transitionRuleForm.zPriority = 'from'"
                            :title="`${editingTerrain?.name || 'Источник'} рисуется поверх`"
                          >
                            <Icon icon="mdi:arrow-up-bold" />
                            {{ editingTerrain?.name || 'Этот' }}
                          </button>
                          <button 
                            class="prio-btn"
                            :class="{ active: transitionRuleForm.zPriority === 'to' }"
                            @click="transitionRuleForm.zPriority = 'to'"
                            :title="`${getPriorityTargetName()} рисуется поверх`"
                          >
                            <Icon icon="mdi:arrow-down-bold" />
                            {{ getPriorityTargetName() }}
                          </button>
                        </div>
                      </div>
                      
                      <!-- Редактор эффектов -->
                      <EffectsPipelineEditor v-model="transitionRuleForm.effects" />
                      
                      <!-- Кнопки -->
                      <div class="rule-actions">
                        <button class="btn-cancel" @click="cancelTransitionRuleEdit">Отмена</button>
                        <button class="btn-save" @click="saveTransitionRule">
                          {{ editingTransitionRule ? 'Сохранить' : 'Создать' }}
                        </button>
                      </div>
                    </div>
                  </template>
                  
                  <!-- Список существующих правил -->
                  <template v-else>
                    <div class="form-section" v-if="relatedTransitionRules.length">
                      <div class="section-title">Связанные правила</div>
                      
                      <div class="rules-list">
                        <div 
                          v-for="rule in relatedTransitionRules" 
                          :key="rule.id || rule.comment"
                          class="rule-item"
                          :class="{ 'is-default': !rule.id }"
                        >
                          <div class="rule-info">
                            <span class="rule-level">{{ getRuleLevelName(rule.level) }}</span>
                            <span class="rule-desc">{{ getTransitionRuleDescription(rule) }}</span>
                          </div>
                          <div class="rule-style">
                            {{ getTransitionStyleName(rule.style) }}
                          </div>
                          <div class="rule-actions" v-if="rule.id">
                            <button @click="startEditTransitionRule(rule)" title="Редактировать">
                              <Icon icon="mdi:pencil" />
                            </button>
                            <button @click="deleteTransitionRule(rule)" class="delete" title="Удалить">
                              <Icon icon="mdi:delete" />
                            </button>
                          </div>
                          <div class="rule-badge" v-else title="Дефолтное правило">
                            <Icon icon="mdi:lock" />
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div class="form-section" v-else>
                      <div class="empty-rules">
                        <Icon icon="mdi:transition" />
                        <p>Нет связанных правил переходов</p>
                        <p class="hint">Добавьте правило чтобы настроить границы с другими террейнами</p>
                      </div>
                    </div>
                  </template>
                </template>
              </div>
              
              <!-- Кнопки сохранения -->
              <div class="editor-footer">
                <button class="btn-cancel" @click="cancelEdit">Отмена</button>
                <button 
                  class="btn-save" 
                  :disabled="!terrainForm.name.trim()"
                  @click="saveTerrain"
                >
                  {{ isCreatingNew ? 'Создать' : 'Сохранить' }}
                </button>
              </div>
            </template>
            
            <template v-else>
              <div class="editor-placeholder">
                <Icon icon="mdi:texture-box" />
                <p>Выберите террейн для редактирования</p>
                <p class="hint">или создайте новый</p>
              </div>
            </template>
          </div>
        </div>
      </template>
      
      <!-- Тайлсеты (заглушка) -->
      <template v-else-if="activeCategory === 'tilesets'">
        <div class="coming-soon">
          <Icon icon="mdi:folder-multiple-image" />
          <h3>Тайлсеты</h3>
          <p>Группировка террейнов в наборы — скоро!</p>
        </div>
      </template>
      
      <!-- Объекты (заглушка) -->
      <template v-else-if="activeCategory === 'objects'">
        <div class="coming-soon">
          <Icon icon="mdi:cube-outline" />
          <h3>Объекты</h3>
          <p>Деревья, камни, здания — скоро!</p>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.asset-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: rgb(15, 23, 42);
  color: white;
}

/* Header */
.manager-header {
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.manager-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}

.category-tabs {
  display: flex;
  gap: 0.5rem;
}

.category-tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.15s;
}

.category-tab:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.category-tab.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
  color: white;
}

.category-tab.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.category-tab .count {
  padding: 0.125rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  font-size: 0.75rem;
}

/* Content */
.manager-content {
  flex: 1;
  overflow: hidden;
}

/* ===== 3-Panel Terrains Layout ===== */
.terrains-layout {
  display: flex;
  height: 100%;
  gap: 0;
}

/* Left Panel - Terrain List (takes remaining space) */
.left-panel {
  flex: 1;
  min-width: 250px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.1);
}

/* Center Panel - Preview (30% width, max 500px) */
.center-panel {
  width: 50%;
  max-width: 800px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.3);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

/* Right Panel - Editor (30% width, max 400px) */
.right-panel {
  width: 30%;
  max-width: 400px;
  min-width: 300px;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.2);
}

.right-panel:not(.active) {
  width: 280px;
  min-width: 280px;
}

/* Panel Headers */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
}

.panel-header h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 0.9rem;
  font-weight: 500;
}

.btn-close-selector {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 0.25rem;
}

.btn-close-selector:hover {
  color: white;
}

/* Toolbar */
.list-toolbar {
  padding: 0.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.list-toolbar.compact {
  padding: 0.5rem;
  gap: 0.5rem;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  flex: 1;
  min-width: 150px;
}

.search-box input {
  flex: 1;
  background: none;
  border: none;
  color: white;
  outline: none;
}

.search-box input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.7);
}

.checkbox-label:hover {
  color: white;
}

.biome-filter {
  padding: 0.375rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: white;
  font-size: 0.875rem;
}

.toolbar-buttons {
  display: flex;
  gap: 0.375rem;
}

.btn-action {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 0.375rem;
  color: white;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-action:hover {
  background: rgba(59, 130, 246, 0.3);
}

.btn-action.secondary {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.1);
}

.btn-action.secondary:hover {
  background: rgba(255, 255, 255, 0.1);
}

.btn-action.small {
  padding: 0.375rem 0.5rem;
  font-size: 0.8rem;
}

.btn-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.neighbor-quick-actions {
  display: flex;
  gap: 0.25rem;
}

/* Terrains Grid - tile cards */
.terrains-grid {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
  align-content: start;
}

/* Picker mode - smaller cards */
.terrains-grid.picker-mode {
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 0.375rem;
  padding: 0.375rem;
}

.terrain-card {
  position: relative;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.15s;
}

.terrain-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.terrain-card.selected {
  border-color: rgba(59, 130, 246, 0.6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.terrain-card.neighbor-selected {
  border-color: rgba(16, 185, 129, 0.6);
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}

.terrain-card.brush-selected {
  border-color: rgba(59, 130, 246, 0.8);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3), inset 0 0 0 1px rgba(59, 130, 246, 0.4);
}

/* Режим выбора целевого террейна */
.terrain-card.target-picking {
  border-color: rgba(249, 115, 22, 0.3);
  cursor: crosshair;
}

.terrain-card.target-picking:hover {
  border-color: rgba(249, 115, 22, 0.6);
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.2);
  transform: translateY(-2px);
}

.terrain-card.target-selected {
  border-color: rgba(249, 115, 22, 0.8);
  box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.3);
}

.target-picking-mode .terrain-card:not(.target-selected):not(.target-picking) {
  opacity: 0.5;
}

.terrain-card.brush-selected::after {
  content: '';
  position: absolute;
  top: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  background: #3b82f6;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.terrain-card.target-selected {
  border-color: rgba(245, 158, 11, 0.8);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.3);
}

.terrain-card.target-picking {
  cursor: pointer;
}

.terrain-card.target-picking:hover {
  border-color: rgba(245, 158, 11, 0.6);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.terrain-card.custom {
  border-color: rgba(16, 185, 129, 0.3);
}

.terrain-preview {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}


.picker-mode .terrain-preview {
  height: 50px;
}

.terrain-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.terrain-info {
  padding: 0.375rem 0.5rem;
}

.picker-mode .terrain-info {
  padding: 0.25rem 0.375rem;
}

.terrain-name {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker-mode .terrain-name {
  font-size: 0.7rem;
}

.custom-badge {
  color: rgb(16, 185, 129);
  font-size: 0.75rem;
}

.terrain-meta {
  display: flex;
  gap: 0.375rem;
  margin-top: 0.125rem;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.5);
}

.terrain-actions {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  display: flex;
  gap: 0.125rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.terrain-card:hover .terrain-actions {
  opacity: 1;
}

.terrain-actions button {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  border: none;
  border-radius: 0.25rem;
  color: white;
  cursor: pointer;
  font-size: 0.75rem;
  transition: background 0.15s;
}

.terrain-actions button:hover {
  background: rgba(0, 0, 0, 0.8);
}

.terrain-actions button.delete:hover {
  background: rgba(239, 68, 68, 0.8);
}

/* Empty State */
.empty-state {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: rgba(255, 255, 255, 0.4);
}

.empty-state :deep(svg) {
  font-size: 3rem;
  margin-bottom: 1rem;
}

/* Editor Panel */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.editor-header h3 {
  margin: 0;
  font-size: 1rem;
}

.btn-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  border-radius: 0.25rem;
}

.btn-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
}

.preview-section {
  margin-bottom: 1rem;
}

.terrain-large-preview {
  height: 120px;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-label {
  padding: 0.25rem 0.75rem;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 1rem;
  font-size: 0.75rem;
}

.form-section {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.section-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 0.75rem;
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 0.75rem;
}

.form-input,
.form-textarea,
.form-select {
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: white;
  font-size: 0.875rem;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.5);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.color-label {
  flex-direction: row;
  align-items: center;
}

.form-color {
  width: 40px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
}

.visibility-options {
  display: flex;
  gap: 0.375rem;
}

.visibility-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 0.75rem;
  transition: all 0.15s;
}

.visibility-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.visibility-btn.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
  color: white;
}

.range-input {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.range-input input[type="range"] {
  flex: 1;
  accent-color: rgb(59, 130, 246);
}

.range-value {
  min-width: 2rem;
  text-align: center;
  font-weight: 600;
}

.tags-input {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
}

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.tag {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(59, 130, 246, 0.2);
  border-radius: 1rem;
  font-size: 0.75rem;
}

.tag button {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.tag button:hover {
  color: white;
}

.tags-input input {
  flex: 1;
  min-width: 100px;
  background: none;
  border: none;
  color: white;
  font-size: 0.875rem;
  outline: none;
}

.tags-input input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.editor-footer {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-cancel,
.btn-save {
  flex: 1;
  padding: 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.btn-save {
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: white;
}

.btn-save:hover {
  background: rgba(16, 185, 129, 0.3);
}

.btn-save:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.editor-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.3);
}

.editor-placeholder :deep(svg) {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.editor-placeholder .hint {
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

/* Coming Soon */
.coming-soon {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.4);
}

.coming-soon :deep(svg) {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.coming-soon h3 {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
  color: rgba(255, 255, 255, 0.6);
}

/* Editor Tabs */
.editor-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0 0.75rem;
  margin-bottom: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.editor-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.5rem 0.5rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: -1px;
  font-size: 1.1rem;
}

.editor-tab:hover {
  color: rgba(255, 255, 255, 0.8);
}

/* Tab header inside content */
.tab-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.editor-tab.active {
  color: white;
  border-bottom-color: rgb(59, 130, 246);
}

.editor-tab.preview-toggle {
  margin-left: auto;
  padding: 0.5rem;
  border-radius: 0.25rem;
  border-bottom: none;
}

.editor-tab.preview-toggle.active {
  background: rgba(59, 130, 246, 0.2);
  border-bottom: none;
}

.tab-badge {
  padding: 0.125rem 0.375rem;
  background: rgba(59, 130, 246, 0.3);
  border-radius: 0.75rem;
  font-size: 0.75rem;
}

/* Preview Info */
.preview-info {
  text-align: center;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 0.375rem;
}

/* Preset Buttons */
.preset-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.preset-btn {
  padding: 0.375rem 0.625rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.preset-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

/* Section Header */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.section-actions {
  display: flex;
  gap: 0.25rem;
}

.btn-small {
  padding: 0.25rem;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  border-radius: 0.25rem;
  transition: all 0.15s;
}

.btn-small:hover:not(:disabled) {
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.1);
}

.btn-small:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Layers List */
.layers-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 0.75rem;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.layer-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.layer-item.selected {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
}

.layer-item.disabled {
  opacity: 0.5;
}

.layer-drag {
  color: rgba(255, 255, 255, 0.3);
  cursor: grab;
}

.layer-color-preview {
  width: 20px;
  height: 20px;
  border-radius: 0.25rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.layer-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.layer-type {
  font-size: 0.8rem;
  font-weight: 500;
}

.layer-opacity {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
}

.layer-actions {
  display: flex;
  gap: 0.125rem;
}

.layer-actions button {
  padding: 0.25rem;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  transition: all 0.15s;
}

.layer-actions button:hover:not(:disabled) {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.layer-actions button.delete:hover {
  color: rgb(239, 68, 68);
  background: rgba(239, 68, 68, 0.1);
}

.layer-actions button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Layers Empty */
.layers-empty {
  padding: 1.5rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.02);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  margin-bottom: 0.75rem;
}

.layers-empty p {
  margin: 0;
}

.layers-empty .hint {
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

/* Add Layer Row */
.add-layer-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.add-layer-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.add-layer-btn:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
}

/* Pattern Generation */
.pattern-generation {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: rgba(255, 193, 7, 0.05);
  border: 1px solid rgba(255, 193, 7, 0.2);
  border-radius: 0.5rem;
}

.pattern-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: rgba(255, 193, 7, 0.8);
}

.btn-generate-full {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 193, 7, 0.15);
  border: 1px solid rgba(255, 193, 7, 0.4);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-generate-full:hover {
  background: rgba(255, 193, 7, 0.25);
  border-color: rgba(255, 193, 7, 0.6);
}

/* Layer Editor */
.layer-editor {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 0.75rem !important;
}

.layer-number {
  font-weight: normal;
  color: rgba(255, 255, 255, 0.4);
  margin-left: 0.5rem;
}

.subsection-title {
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  margin: 0.75rem 0 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

/* Seed Control */
.seed-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.375rem;
}

.checkbox-inline {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
}

.checkbox-inline:hover {
  color: white;
}

.checkbox-inline input[type="checkbox"] {
  accent-color: rgb(59, 130, 246);
}

/* Layer Editor Placeholder */
.layer-editor-placeholder {
  padding: 2rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
}

.layer-editor-placeholder :deep(svg) {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

/* Terrain Large Preview - update for TerrainPreview component */
.preview-section {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.terrain-large-preview {
  width: 140px;
  height: 140px;
  border-radius: 0.5rem;
  overflow: hidden;
}

/* ===== Center Panel - Hex Cluster Preview ===== */

.preview-actions {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.preview-mode-select,
.render-mode-select {
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.75rem;
  cursor: pointer;
}

.preview-mode-select:hover,
.render-mode-select:hover {
  background: rgba(255, 255, 255, 0.1);
}

.btn-small {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s;
}

.btn-small:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.btn-small:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Hex Cluster Container - занимает всё пространство */
.hex-cluster-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
  position: relative;
}

/* HexMapCanvas preview */
.hex-map-canvas-preview {
  width: 100%;
  height: 100%;
  min-height: 300px;
  background: #0d1117;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Переключатель сетки */
.grid-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  user-select: none;
}

.grid-toggle input {
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.grid-toggle:hover {
  color: rgba(255, 255, 255, 0.9);
}

/* Управление превью */
.preview-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  margin-top: 4px;
}

.shape-select {
  padding: 2px 6px;
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}

.shape-select:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.shape-select:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.5);
}

/* Иконка кисти в подписи */
.brush-icon {
  margin-right: 4px;
  color: #3b82f6;
}

/* Название террейна под канвасом */
.center-terrain-label {
  padding: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
  text-align: center;
  background: rgba(0, 0, 0, 0.2);
}

/* Hint */
.hex-hint {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.7rem;
  text-align: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.hex-hint :deep(svg) {
  font-size: 0.75rem;
  flex-shrink: 0;
}

/* ===== ADJACENCY TAB STYLES ===== */

.section-hint {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  margin: -0.25rem 0 0.5rem 0;
  line-height: 1.4;
}

.compatible-title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: rgb(34, 197, 94);
}

.incompatible-title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: rgb(239, 68, 68);
}

.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  min-height: 2rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.375rem;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.tags-empty {
  color: rgba(255, 255, 255, 0.3);
  font-size: 0.75rem;
  font-style: italic;
}

.tag-chip {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.tag-chip.compatible {
  background: rgba(34, 197, 94, 0.2);
  color: rgb(134, 239, 172);
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.tag-chip.incompatible {
  background: rgba(239, 68, 68, 0.2);
  color: rgb(252, 165, 165);
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.tag-remove {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  transition: opacity 0.15s;
  color: inherit;
}

.tag-remove:hover {
  opacity: 1;
}

.tag-remove :deep(svg) {
  font-size: 0.875rem;
}

.tag-input-row {
  margin-top: 0.5rem;
}

.tag-select {
  width: 100%;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.btn-action {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 0.375rem;
  color: rgb(147, 197, 253);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-action:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.5);
}

.btn-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-action :deep(svg) {
  font-size: 0.875rem;
}

/* ===== CATEGORY TAGS STYLES ===== */

.category-section {
  border-left: 3px solid rgba(59, 130, 246, 0.3);
  padding-left: 0.75rem;
}

.category-title {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.required-mark {
  color: rgb(239, 68, 68);
  font-weight: bold;
}

.category-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.category-tag-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 1rem;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.category-tag-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.25);
}

.category-tag-btn.selected {
  background: var(--tag-color-light);
  border-color: var(--tag-color);
  color: white;
}

.tag-color-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Transition rules list */
.transition-rules-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.transition-rule-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.25rem;
  font-size: 0.75rem;
}

.neighbor-index {
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.3);
  border-radius: 50%;
  font-weight: 600;
  font-size: 0.625rem;
}

.neighbor-name {
  flex: 1;
  color: rgba(255, 255, 255, 0.8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.transition-arrow {
  color: rgba(255, 255, 255, 0.3);
}

.transition-style {
  padding: 0.125rem 0.375rem;
  background: rgba(168, 85, 247, 0.2);
  border-radius: 0.25rem;
  color: rgb(192, 132, 252);
  font-weight: 500;
}

.transition-empty {
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.25rem;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.75rem;
  font-style: italic;
  text-align: center;
}

/* Transition styles grid */
.transition-styles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}

.transition-style-card {
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.375rem;
}

.style-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: white;
  margin-bottom: 0.25rem;
}

.style-desc {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.3;
}

/* ===== TRANSITION RULES EDITOR ===== */

.rule-editor {
  margin-bottom: 1rem;
}

.rule-editor-header {
  margin-bottom: 0.75rem;
}

.rule-editor-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.5);
}

.rule-field {
  margin-bottom: 0.75rem;
}

.rule-field-label {
  display: block;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 0.375rem;
}

/* Кнопки типа правила */
.rule-type-buttons {
  display: flex;
  gap: 0.375rem;
}

.type-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.type-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.type-btn.active {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.4);
  color: rgb(165, 180, 252);
}

/* Селектор тегов */
.tag-selector {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.tag-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.cat-btn, .tag-btn {
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.cat-btn:hover, .tag-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.cat-btn.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
  color: rgb(147, 197, 253);
}

.tag-btn.active {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.4);
  color: rgb(110, 231, 183);
}

/* Выбор террейна */
.terrain-target-hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.8rem;
}

.terrain-target-selected {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 0.375rem;
}

.target-name {
  font-size: 0.85rem;
  font-weight: 500;
  color: white;
}

.clear-btn {
  padding: 0.125rem;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  border-radius: 0.25rem;
  transition: all 0.15s;
}

.clear-btn:hover {
  color: rgb(239, 68, 68);
  background: rgba(239, 68, 68, 0.1);
}

/* Кнопки приоритета */
.priority-buttons {
  display: flex;
  gap: 0.375rem;
}

.prio-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.625rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.prio-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.prio-btn.active {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.4);
  color: rgb(165, 180, 252);
}

/* Кнопки действий */
.rule-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

/* Старые стили - можно удалить позже */
.rule-edit-form {
  background: rgba(59, 130, 246, 0.05);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 0.5rem;
  padding: 1rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.style-params {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  flex-direction: row;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.extra-params {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

/* Rules list */
.rules-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rule-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.375rem;
  transition: all 0.15s;
}

.rule-item:hover {
  background: rgba(0, 0, 0, 0.3);
  border-color: rgba(255, 255, 255, 0.1);
}

.rule-item.is-default {
  opacity: 0.7;
}

.rule-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  overflow: hidden;
}

.rule-level {
  font-size: 0.625rem;
  color: rgba(255, 255, 255, 0.4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.rule-desc {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rule-style {
  padding: 0.25rem 0.5rem;
  background: rgba(168, 85, 247, 0.2);
  border-radius: 0.25rem;
  color: rgb(192, 132, 252);
  font-size: 0.7rem;
  font-weight: 500;
  white-space: nowrap;
}

.rule-actions {
  display: flex;
  gap: 0.25rem;
}

.rule-actions button {
  padding: 0.25rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s;
}

.rule-actions button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.rule-actions button.delete:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
  color: rgb(252, 165, 165);
}

.rule-badge {
  padding: 0.25rem;
  color: rgba(255, 255, 255, 0.3);
}

.empty-rules {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
}

.empty-rules :deep(svg) {
  font-size: 2rem;
  margin-bottom: 0.5rem;
  opacity: 0.5;
}

.empty-rules p {
  margin: 0;
}

.empty-rules .hint {
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

.btn-primary {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.5);
  color: rgb(147, 197, 253);
}

.btn-primary:hover {
  background: rgba(59, 130, 246, 0.4);
}

/* Секция настроек освещения */
.lighting-settings {
  background: rgba(255, 200, 50, 0.05);
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 1rem;
}

.lighting-settings .section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  color: rgba(255, 200, 50, 0.9);
  font-weight: 500;
}

.lighting-settings .section-header span {
  flex: 1;
}

.lighting-controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.lighting-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.lighting-row > label {
  min-width: 6rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.angle-control,
.length-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}

.angle-control input[type="range"],
.length-control input[type="range"] {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  appearance: none;
  cursor: pointer;
}

.angle-control input[type="range"]::-webkit-slider-thumb,
.length-control input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  background: rgba(255, 200, 50, 0.9);
  border-radius: 50%;
  cursor: pointer;
}

.angle-value,
.length-value {
  min-width: 3rem;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.7);
  text-align: right;
  font-family: monospace;
}

.angle-preview {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 200, 50, 0.9);
  transition: transform 0.2s;
}

/* Toggle switch базовые стили */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 22px;
  transition: 0.2s;
}

.toggle-slider::before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  border-radius: 50%;
  transition: 0.2s;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: rgba(255, 200, 50, 0.6);
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(18px);
}

.toggle-switch.small {
  width: 32px;
  height: 18px;
}

.toggle-switch.small .toggle-slider {
  width: 32px;
  height: 18px;
}

.toggle-switch.small .toggle-slider::before {
  width: 14px;
  height: 14px;
  left: 2px;
  bottom: 2px;
}

.toggle-switch.small input:checked + .toggle-slider::before {
  transform: translateX(14px);
}
</style>
