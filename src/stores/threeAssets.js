/**
 * Three.js Asset Manager Store
 * Manages terrains, structures, objects, rules, and profiles for 3D rendering
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// === Layer Templates ===

// Solid color layer
const createColorLayer = (color = '#808080') => ({
  type: 'color',
  enabled: true,
  opacity: 1.0,
  blendMode: 'normal', // normal | multiply | overlay | screen | add
  color,
})

// Noise layer (Perlin, Simplex, Voronoi, etc.)
const createNoiseLayer = (noiseType = 'perlin') => ({
  type: 'noise',
  enabled: true,
  opacity: 0.5,
  blendMode: 'overlay',
  noiseType, // perlin | simplex | voronoi | cellular | fbm | worley | white | warped | fibrous
  seed: Math.floor(Math.random() * 10000),
  scale: 1.0,          // размер шума
  octaves: 4,          // количество октав (для fbm, warped, fibrous)
  persistence: 0.5,    // затухание (для fbm, warped, fibrous)
  lacunarity: 2.0,     // частотный множитель (для fbm, warped, fibrous)
  amplitude: 1.0,      // сила эффекта
  offset: { x: 0, y: 0 },
  colorA: '#000000',   // цвет в минимуме
  colorB: '#ffffff',   // цвет в максимуме
  invert: false,
  threshold: 0,        // порог отсечения (0 = нет)
  smoothness: 0.5,     // плавность (для voronoi)
  warpStrength: 1.0,   // сила искажения (для warped, fibrous)
  direction: 0,        // направление волокон (для fibrous), градусы
})

// Pattern layer (geometric patterns)
const createPatternLayer = (patternType = 'hexgrid') => ({
  type: 'pattern',
  enabled: true,
  opacity: 0.3,
  blendMode: 'overlay',
  patternType, // hexgrid | grid | stripes | dots | checker | rings | waves | crosshatch | triangles
  scale: 1.0,
  rotation: 0,
  lineWidth: 0.1,
  spacing: 1.0,
  color: '#000000',    // background color
  color2: '#ffffff',   // pattern color
  offset: { x: 0, y: 0 },
  invert: false,
  // Pattern-specific
  waveFrequency: 2.0,  // для waves
  dotSize: 0.2,        // для dots
  ringCount: 3,        // для rings
})

// Gradient layer
const createGradientLayer = (gradientType = 'linear') => ({
  type: 'gradient',
  enabled: true,
  opacity: 0.5,
  blendMode: 'overlay',
  gradientType, // linear | radial | angular | diamond
  angle: 0,           // для linear
  centerX: 0.5,       // для radial/angular
  centerY: 0.5,
  scale: 1.0,
  colors: [
    { stop: 0, color: '#000000' },
    { stop: 1, color: '#ffffff' },
  ],
  invert: false,
})

// Texture layer
const createTextureLayer = (textureUrl = null) => ({
  type: 'texture',
  enabled: true,
  opacity: 1.0,
  blendMode: 'normal',
  textureUrl,
  tiling: { x: 1, y: 1 },
  offset: { x: 0, y: 0 },
  rotation: 0,
  filtering: 'linear', // nearest | linear
  // Color adjustments
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
})

// Height/elevation modulation layer
const createHeightLayer = () => ({
  type: 'height',
  enabled: true,
  opacity: 1.0,
  blendMode: 'normal',
  noiseType: 'perlin',
  seed: Math.floor(Math.random() * 10000),
  scale: 2.0,
  amplitude: 0.5,     // высота вариации
  octaves: 3,
  baseHeight: 0,      // базовая высота
  minHeight: -1,
  maxHeight: 1,
})

// Edge/border layer
const createEdgeLayer = () => ({
  type: 'edge',
  enabled: false,
  opacity: 1.0,
  blendMode: 'normal',
  color: '#000000',
  width: 0.05,
  style: 'solid',     // solid | dashed | dotted | glow
  inset: true,        // внутри или снаружи
  glowSize: 0.1,      // для glow стиля
  glowColor: '#ffffff',
})

// Factory function to create a layer by type
const createLayer = (layerType, options = {}) => {
  const factories = {
    color: createColorLayer,
    noise: createNoiseLayer,
    pattern: createPatternLayer,
    gradient: createGradientLayer,
    texture: createTextureLayer,
    height: createHeightLayer,
    edge: createEdgeLayer,
  }
  const factory = factories[layerType]
  if (!factory) return null
  return { ...factory(options.preset), ...options, id: `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }
}

// Default terrain template with layers
const createDefaultTerrain = (id = null) => ({
  id: id || `terrain_${Date.now()}`,
  name: 'Новый террейн',
  // Basic properties
  passable: true,
  liquid: false,
  movementCost: 1.0,
  // Layer stack (rendered bottom to top)
  layers: [
    { ...createColorLayer('#808080'), id: 'base_color' },
  ],
  // Elevation settings
  elevation: {
    base: 0,
    variation: 0,
    noiseScale: 1.0,
  },
  // HSLA modifier (applied on top of layer stack)
  hsla: {
    hue: 0,        // -180 to 180 degree shift
    saturation: 0, // -100 to 100% adjustment  
    lightness: 0,  // -100 to 100% adjustment
    alpha: 1.0,    // 0 to 1 opacity
  },
  // Preview color (computed from layers or manual)
  previewColor: '#808080',
})

// Default structure template
const createDefaultStructure = (id = null) => ({
  id: id || `structure_${Date.now()}`,
  name: 'Новая структура',
  type: 'path', // path | area | point
  terrainId: null,
  width: 1,
  rules: {
    canCross: [],
    snapToGrid: true,
  },
})

// Default object template
const createDefaultObject = (id = null) => ({
  id: id || `object_${Date.now()}`,
  name: 'Новый объект',
  type: 'sprite', // sprite | model
  asset: null,
  scale: 1.0,
  billboard: true,
})

// === Transition Rule Effects ===

// Line Effects - modify the boundary shape
export const LINE_EFFECTS = {
  subdivide: {
    name: 'Разбиение',
    description: 'Добавляет промежуточные точки для детализации',
    icon: '⋯',
    defaults: { segments: 8 },
  },
  wave: {
    name: 'Волна',
    description: 'Шумовые волны вдоль линии',
    icon: '∿',
    defaults: { 
      amplitude: 0.15,      // max displacement
      scale: 0.3,           // noise spatial scale
      frequency: 4.0,       // wave frequency along line
      sharpness: 0,         // 0 = smooth waves, 1 = sharp peaks
      maxInward: 0.5,       // max displacement inward (0 = unlimited)
      maxOutward: 0.5,      // max displacement outward (0 = unlimited)
      seed: 0,
      noiseType: 'perlin',  // perlin | simplex | voronoi
      octaves: 1,           // FBM octaves (1 = simple noise)
      persistence: 0.5,     // FBM amplitude decay
      lacunarity: 2.0,      // FBM frequency growth
    },
  },
  noise: {
    name: 'Шум',
    description: 'Хаотичные смещения по X и Z',
    icon: '░',
    defaults: { 
      amplitude: 0.08, 
      scale: 0.2, 
      sharpness: 0,         // 0 = smooth, 1 = sharp
      maxInward: 0.3,       // max displacement inward
      maxOutward: 0.3,      // max displacement outward
      seed: 0,
      noiseType: 'perlin',
      octaves: 1,
      persistence: 0.5,
      lacunarity: 2.0,
    },
  },
  sine: {
    name: 'Синусоида',
    description: 'Регулярная волна',
    icon: '∿',
    defaults: { amplitude: 0.1, wavelength: 0.4, phase: 0 },
  },
  zigzag: {
    name: 'Зигзаг',
    description: 'Острые углы туда-сюда',
    icon: '⋀',
    defaults: { amplitude: 0.12, wavelength: 0.3, phase: 0 },
  },
  straighten: {
    name: 'Спрямление',
    description: 'Сглаживает линию, убирая изгибы',
    icon: '─',
    defaults: { strength: 0.5 },
  },
  smooth: {
    name: 'Скругление',
    description: 'Скругляет углы (Chaikin)',
    icon: '◠',
    defaults: { iterations: 2 },
  },
}

// Mask Effects - affect alpha/transparency
export const MASK_EFFECTS = {
  blend: {
    name: 'Градиент',
    description: 'Плавный градиент прозрачности',
    icon: '▓',
    defaults: { width: 0.15, curve: 'smooth' }, // curve: linear | smooth | sharp
  },
  scatter: {
    name: 'Сыпучая',
    description: 'Шумовая маска для песка/гравия',
    icon: '⁙',
    defaults: { width: 0.12, density: 0.6, noiseScale: 0.2 },
  },
  noiseBlend: {
    name: 'Шумовое смешение',
    description: 'Смешение с шумовой маской',
    icon: '▒',
    defaults: { width: 0.1, noiseScale: 0.15, contrast: 0.5 },
  },
}

// Noise types for line effects
export const NOISE_TYPES = {
  perlin: { name: 'Perlin', description: 'Классический плавный шум', icon: '≋' },
  simplex: { name: 'Simplex', description: 'Более равномерный шум', icon: '◇' },
  voronoi: { name: 'Voronoi', description: 'Ячеистый шум', icon: '⬡' },
}

// Draw Effects - visual decorations
export const DRAW_EFFECTS = {
  shadow: {
    name: 'Тень',
    description: 'Отбрасываемая тень',
    icon: '◢',
    defaults: { width: 0.06, opacity: 0.4, offset: 0.02 },
  },
  glow: {
    name: 'Свечение',
    description: 'Мягкое свечение вдоль границы',
    icon: '✧',
    defaults: { width: 0.1, color: '#ffcc66', opacity: 0.5 },
  },
  stroke: {
    name: 'Обводка',
    description: 'Линия обводки',
    icon: '▬',
    defaults: { width: 0.03, color: '#3d2817', opacity: 0.8 },
  },
  highlight: {
    name: 'Блик',
    description: 'Светлая подсветка края',
    icon: '╱',
    defaults: { width: 0.04, color: '#ffffff', opacity: 0.5, offset: -0.01 },
  },
}

// Side values for mask/draw effects
export const EFFECT_SIDES = {
  from: { name: 'От', description: 'Со стороны первого террейна' },
  to: { name: 'К', description: 'Со стороны второго террейна' },
  both: { name: 'Оба', description: 'Симметрично с обеих сторон' },
  center: { name: 'Центр', description: 'По линии границы' },
}

// Match level priorities (higher = more specific)
export const MATCH_LEVELS = {
  'any-to-any': { priority: 0, name: 'Любой → Любой' },
  'tag-to-tag': { priority: 10, name: 'Тег → Тег' },
  'id-to-tag': { priority: 20, name: 'ID → Тег' },
  'id-to-any': { priority: 25, name: 'ID → Любой' },
  'id-to-id': { priority: 30, name: 'ID → ID' },
}

// Create a line effect
const createLineEffect = (type) => {
  const def = LINE_EFFECTS[type]
  if (!def) return null
  return {
    type,
    enabled: true,
    ...JSON.parse(JSON.stringify(def.defaults)),
  }
}

// Create a mask effect
const createMaskEffect = (type, side = 'from') => {
  const def = MASK_EFFECTS[type]
  if (!def) return null
  return {
    type,
    enabled: true,
    side,
    ...JSON.parse(JSON.stringify(def.defaults)),
  }
}

// Create a draw effect
const createDrawEffect = (type, side = 'to') => {
  const def = DRAW_EFFECTS[type]
  if (!def) return null
  return {
    type,
    enabled: true,
    side,
    ...JSON.parse(JSON.stringify(def.defaults)),
  }
}

// Default rule template
const createDefaultRule = (id = null) => ({
  id: id || `rule_${Date.now()}`,
  name: 'Новое правило',
  
  // Match configuration
  match: {
    level: 'id-to-id', // any-to-any | tag-to-tag | id-to-tag | id-to-any | id-to-id
    from: null,        // terrain ID or { category, tag }
    to: null,          // terrain ID or { category, tag }
  },
  
  // Priority within same match level (higher wins)
  priority: 100,
  
  // Z-order when elevations are equal
  zPriority: 'auto', // 'from' | 'to' | 'auto'
  
  // === STAGE 1: Line Effects ===
  // Modify the boundary geometry, applied sequentially
  lineEffects: [
    createLineEffect('subdivide'),
  ],
  
  // === STAGE 2: Mask Effects ===
  // Modify alpha/transparency, applied sequentially
  maskEffects: [],
  
  // === STAGE 3: Draw Effects ===
  // Visual decorations, applied sequentially
  drawEffects: [],
})

// Export effect factories
export { createLineEffect, createMaskEffect, createDrawEffect }

// Default profile template
const createDefaultProfile = (id = null) => ({
  id: id || `profile_${Date.now()}`,
  name: 'Новый профиль',
  terrains: {},
  structures: {},
  objects: {},
})

// Export layer factory for use in components
export { createLayer }

export const useThreeAssetsStore = defineStore('threeAssets', () => {
  // State
  const terrains = ref([
    {
      id: 'grass',
      name: 'Трава',
      passable: true,
      liquid: false,
      movementCost: 1.0,
      layers: [
        { ...createColorLayer('#4a7c23'), id: 'grass_base' },
        { ...createNoiseLayer('perlin'), id: 'grass_noise', opacity: 0.2, colorA: '#3a6a18', colorB: '#5a8c33', scale: 3.0 },
        { ...createPatternLayer('dots'), id: 'grass_dots', opacity: 0.1, scale: 0.5, dotSize: 0.05, color: '#2a5a10' },
      ],
      elevation: { base: 0, variation: 0.1, noiseScale: 2.0 },
      previewColor: '#4a7c23',
    },
    {
      id: 'water',
      name: 'Вода',
      passable: false,
      liquid: true,
      movementCost: 3.0,
      layers: [
        { ...createColorLayer('#2d5a7b'), id: 'water_base' },
        { ...createNoiseLayer('simplex'), id: 'water_waves', opacity: 0.3, colorA: '#1d4a6b', colorB: '#4d7a9b', scale: 2.0 },
        { ...createPatternLayer('waves'), id: 'water_pattern', opacity: 0.2, scale: 1.5, color: '#ffffff', waveFrequency: 3.0 },
      ],
      elevation: { base: -0.5, variation: 0.05, noiseScale: 1.0 },
      previewColor: '#2d5a7b',
    },
    {
      id: 'stone',
      name: 'Камень',
      passable: true,
      liquid: false,
      movementCost: 1.0,
      layers: [
        { ...createColorLayer('#6b6b6b'), id: 'stone_base' },
        { ...createNoiseLayer('voronoi'), id: 'stone_cracks', opacity: 0.4, colorA: '#4b4b4b', colorB: '#8b8b8b', scale: 2.0, smoothness: 0.3 },
      ],
      elevation: { base: 0.2, variation: 0.3, noiseScale: 3.0 },
      previewColor: '#6b6b6b',
    },
    {
      id: 'sand',
      name: 'Песок',
      passable: true,
      liquid: false,
      movementCost: 1.5,
      layers: [
        { ...createColorLayer('#c4a747'), id: 'sand_base' },
        { ...createNoiseLayer('perlin'), id: 'sand_texture', opacity: 0.15, colorA: '#b49737', colorB: '#d4b757', scale: 5.0, octaves: 2 },
        { ...createPatternLayer('waves'), id: 'sand_dunes', opacity: 0.1, scale: 0.3, color: '#a48727', waveFrequency: 1.0, rotation: 45 },
      ],
      elevation: { base: 0, variation: 0.15, noiseScale: 2.5 },
      previewColor: '#c4a747',
    },
  ])

  const structures = ref([
    {
      id: 'road',
      name: 'Дорога',
      type: 'path',
      terrainId: 'stone',
      width: 1,
      rules: {
        canCross: ['water'],
        snapToGrid: true,
      },
    },
    {
      id: 'river',
      name: 'Река',
      type: 'path',
      terrainId: 'water',
      width: 2,
      rules: {
        canCross: [],
        snapToGrid: true,
      },
    },
  ])

  const objects = ref([
    {
      id: 'tree_oak',
      name: 'Дуб',
      type: 'sprite',
      asset: null,
      scale: 1.0,
      billboard: true,
    },
  ])

  const rules = ref([
    {
      id: 'grass_water',
      name: 'Трава → Вода',
      match: {
        level: 'id-to-id',
        from: 'grass',
        to: 'water',
      },
      priority: 100,
      zPriority: 'auto',
      lineEffects: [
        { type: 'subdivide', enabled: true, segments: 8 },
        { type: 'wave', enabled: true, amplitude: 0.06, frequency: 2.5, seed: 0 },
        { type: 'smooth', enabled: true, iterations: 2 },
      ],
      maskEffects: [
        { type: 'blend', enabled: true, side: 'from', width: 0.12, curve: 'smooth' },
      ],
      drawEffects: [
        { type: 'shadow', enabled: true, side: 'to', width: 0.04, opacity: 0.25, offsetX: 0.02, offsetY: 0.02 },
      ],
    },
    {
      id: 'sand_water',
      name: 'Песок → Вода',
      match: {
        level: 'id-to-id',
        from: 'sand',
        to: 'water',
      },
      priority: 100,
      zPriority: 'auto',
      lineEffects: [
        { type: 'subdivide', enabled: true, segments: 10 },
        { type: 'wave', enabled: true, amplitude: 0.08, frequency: 2.0, seed: 42 },
        { type: 'smooth', enabled: true, iterations: 3 },
      ],
      maskEffects: [
        { type: 'scatter', enabled: true, side: 'from', width: 0.15, density: 0.5, noiseScale: 0.2 },
        { type: 'blend', enabled: true, side: 'to', width: 0.1, curve: 'smooth' },
      ],
      drawEffects: [],
    },
    {
      id: 'stone_any',
      name: 'Камень → Любой',
      match: {
        level: 'id-to-any',
        from: 'stone',
        to: null,
      },
      priority: 50,
      zPriority: 'from',
      lineEffects: [
        { type: 'subdivide', enabled: true, segments: 12 },
        { type: 'jagged', enabled: true, amplitude: 0.1, sharpness: 0.3 },
      ],
      maskEffects: [],
      drawEffects: [
        { type: 'shadow', enabled: true, side: 'to', width: 0.06, opacity: 0.35, offsetX: 0.03, offsetY: 0.03 },
        { type: 'highlight', enabled: true, side: 'from', width: 0.02, color: '#ffffff', opacity: 0.3, offset: -0.01 },
      ],
    },
  ])

  const profiles = ref([
    {
      id: 'forest',
      name: 'Лес',
      terrains: { grass: 0.7, dirt: 0.2, water: 0.1 },
      structures: { road: 0.1 },
      objects: { tree_oak: 0.3 },
    },
  ])

  // Current selection
  const activeTab = ref('terrains') // terrains | structures | objects | rules | profiles
  const selectedItemId = ref(null)

  // Getters
  const currentCollection = computed(() => {
    switch (activeTab.value) {
      case 'terrains': return terrains.value
      case 'structures': return structures.value
      case 'objects': return objects.value
      case 'rules': return rules.value
      case 'profiles': return profiles.value
      default: return []
    }
  })

  const selectedItem = computed(() => {
    if (!selectedItemId.value) return null
    return currentCollection.value.find(item => item.id === selectedItemId.value) || null
  })

  const terrainById = computed(() => {
    const map = {}
    terrains.value.forEach(t => { map[t.id] = t })
    return map
  })

  // Actions
  function setActiveTab(tab) {
    activeTab.value = tab
    selectedItemId.value = null
  }

  function selectItem(id) {
    selectedItemId.value = id
  }

  function addItem() {
    let newItem
    switch (activeTab.value) {
      case 'terrains':
        newItem = createDefaultTerrain()
        terrains.value.push(newItem)
        break
      case 'structures':
        newItem = createDefaultStructure()
        structures.value.push(newItem)
        break
      case 'objects':
        newItem = createDefaultObject()
        objects.value.push(newItem)
        break
      case 'rules':
        newItem = createDefaultRule()
        rules.value.push(newItem)
        break
      case 'profiles':
        newItem = createDefaultProfile()
        profiles.value.push(newItem)
        break
    }
    if (newItem) {
      selectedItemId.value = newItem.id
    }
    return newItem
  }

  function updateItem(id, updates) {
    let collection
    switch (activeTab.value) {
      case 'terrains': collection = terrains; break
      case 'structures': collection = structures; break
      case 'objects': collection = objects; break
      case 'rules': collection = rules; break
      case 'profiles': collection = profiles; break
    }
    
    const index = collection.value.findIndex(item => item.id === id)
    if (index !== -1) {
      // Create new object to trigger reactivity
      collection.value[index] = { ...collection.value[index], ...updates }
      
      // If ID was changed, update selectedItemId to track the renamed item
      if (updates.id && updates.id !== id && selectedItemId.value === id) {
        selectedItemId.value = updates.id
      }
    }
  }

  function deleteItem(id) {
    let collection
    switch (activeTab.value) {
      case 'terrains': collection = terrains; break
      case 'structures': collection = structures; break
      case 'objects': collection = objects; break
      case 'rules': collection = rules; break
      case 'profiles': collection = profiles; break
    }
    
    const index = collection.value.findIndex(item => item.id === id)
    if (index !== -1) {
      collection.value.splice(index, 1)
      if (selectedItemId.value === id) {
        selectedItemId.value = null
      }
    }
  }

  function duplicateItem(id) {
    const item = currentCollection.value.find(i => i.id === id)
    if (!item) return null

    const newItem = {
      ...JSON.parse(JSON.stringify(item)),
      id: `${item.id}_copy_${Date.now()}`,
      name: `${item.name} (копия)`,
    }

    switch (activeTab.value) {
      case 'terrains': terrains.value.push(newItem); break
      case 'structures': structures.value.push(newItem); break
      case 'objects': objects.value.push(newItem); break
      case 'rules': rules.value.push(newItem); break
      case 'profiles': profiles.value.push(newItem); break
    }

    selectedItemId.value = newItem.id
    return newItem
  }

  // Export/Import
  function exportAll() {
    return JSON.stringify({
      version: 1,
      terrains: terrains.value,
      structures: structures.value,
      objects: objects.value,
      rules: rules.value,
      profiles: profiles.value,
    }, null, 2)
  }

  function importAll(jsonString) {
    try {
      const data = JSON.parse(jsonString)
      if (data.version !== 1) {
        console.warn('Unknown version, attempting import anyway')
      }
      if (data.terrains) terrains.value = data.terrains
      if (data.structures) structures.value = data.structures
      if (data.objects) objects.value = data.objects
      if (data.rules) rules.value = data.rules
      if (data.profiles) profiles.value = data.profiles
      return true
    } catch (e) {
      console.error('Import failed:', e)
      return false
    }
  }

  // Persist to localStorage
  const STORAGE_KEY = 'threeAssets'
  
  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, exportAll())
      console.log('Assets saved to localStorage')
      return true
    } catch (e) {
      console.error('Failed to save to localStorage:', e)
      return false
    }
  }
  
  function loadFromStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (data) {
        return importAll(data)
      }
      return false
    } catch (e) {
      console.error('Failed to load from localStorage:', e)
      return false
    }
  }
  
  // Auto-load on store creation
  loadFromStorage()

  return {
    // State
    terrains,
    structures,
    objects,
    rules,
    profiles,
    activeTab,
    selectedItemId,

    // Getters
    currentCollection,
    selectedItem,
    terrainById,

    // Actions
    setActiveTab,
    selectItem,
    addItem,
    updateItem,
    deleteItem,
    duplicateItem,
    exportAll,
    importAll,
    saveToStorage,
    loadFromStorage,
  }
})
