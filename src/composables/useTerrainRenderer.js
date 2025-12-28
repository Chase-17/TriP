/**
 * useTerrainRenderer - composable для рендеринга террейна
 * 
 * Три режима:
 * - primitive: плоские цвета (fallbackColor/averageColor)
 * - live: полный рендер через HexClusterRenderer
 * - cached: предрендеренный кеш с чанковой системой текстур
 */

import { ref, computed } from 'vue'
import { HexClusterRenderer, getHexVertices } from '@/utils/rendering/hexClusterRenderer'
import { TerrainLayerRenderer } from '@/utils/rendering/terrainLayerRenderer'
import { getGlobalChunkCache, CHUNK_SIZE, CHUNK_SIZE_PREVIEW, CHUNK_SIZE_FULL } from '@/utils/rendering/terrainChunkCache'

// Режимы рендеринга
export const RENDER_MODES = {
  PRIMITIVE: 'primitive',
  LIVE: 'live',
  CACHED: 'cached'
}

// LOD пороги
export const LOD_THRESHOLDS = {
  ULTRA_LOW: 0.3,   // только averageColor
  LOW: 0.5,         // базовые слои
  MEDIUM: 0.8,      // большинство эффектов
  HIGH: 1.2,        // мелкие детали
  ULTRA: 2.0        // всё
}

// Минимальный размер паттерна для текстур
const MIN_PATTERN_SIZE = 256
// Размер для быстрого превью при редактировании (маленький, быстрый)
export const PREVIEW_PATTERN_SIZE = 200
// Размер полного паттерна для карты (покрывает большую область без повторов)
export const FULL_PATTERN_SIZE = 1024

/**
 * @param {Object} options
 * @param {Function} options.getTerrainById - функция получения террейна по ID
 * @param {Function} options.getTransitionRule - функция получения правила перехода
 */
export function useTerrainRenderer(options = {}) {
  const {
    getTerrainById = () => null,
    getTransitionRule = () => null
  } = options

  // Текущий режим
  const mode = ref(RENDER_MODES.PRIMITIVE)
  
  // Режим превью паттернов (true = быстрый 200px, false = полный 1024px)
  const patternPreviewMode = ref(true)

  // Кеш для cached режима
  const cache = ref(null)
  const cacheValid = ref(false)
  const cacheVersion = ref(0)

  // Renderer для live режима
  let clusterRenderer = null
  
  // Кэш паттернов для текстур террейнов
  const patternCache = new Map()
  let layerRenderer = null
  
  /**
   * Генерировать хэш для слоёв террейна (для кэширования)
   */
  const getLayersHash = (layers, color) => {
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
  }
  
  /**
   * Получить паттерн/цвет для террейна (с кэшированием)
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} terrain
   * @param {number} targetSize - игнорируется, используем previewMode
   * @param {number} zoom - текущий zoom для фильтрации слоёв по minZoom
   * @param {boolean} previewMode - true = быстрый превью (200px), false = полный размер (1024px)
   */
  const getTerrainPattern = (ctx, terrain, targetSize = MIN_PATTERN_SIZE, zoom = 1, previewMode = true) => {
    if (!terrain) return '#888888'
    
    const allLayers = terrain.layers || []
    const color = terrain.fallbackColor || terrain.color || '#888888'
    
    // Фильтруем слои по minZoom
    const layers = allLayers.filter(layer => {
      if (layer.enabled === false) return false
      const minZoom = layer.minZoom ?? 0
      return zoom >= minZoom
    })
    
    // Если нет слоёв после фильтрации — возвращаем цвет
    if (layers.length === 0) {
      return color
    }
    
    // Определяем LOD уровень для кэширования (округляем zoom)
    const lodLevel = zoom < 0.5 ? 'low' : zoom < 1.0 ? 'medium' : 'high'
    // Режим превью влияет на размер паттерна
    const sizeMode = previewMode ? 'preview' : 'full'
    
    // Генерируем ключ кэша с учётом LOD и режима
    const cacheKey = `${terrain.id || 'unknown'}:${lodLevel}:${sizeMode}`
    
    // Хеш вычисляем от ВСЕХ слоёв (не фильтрованных), чтобы он был стабильным
    // Используем предвычисленный хеш если есть (для редактируемого террейна)
    const allLayersHash = terrain._cachedLayersHash || getLayersHash(allLayers, color)
    // Финальный ключ включает LOD для разных наборов слоёв по zoom
    const layersHash = `${allLayersHash}:${lodLevel}:${sizeMode}`
    
    // Определяем целевой размер паттерна
    const desiredSize = previewMode ? PREVIEW_PATTERN_SIZE : FULL_PATTERN_SIZE

    // Проверяем кэш
    const cached = patternCache.get(cacheKey)
    if (cached && cached.layersHash === layersHash && cached.pattern) {
      return cached.pattern
    }
    
    // Нужно сгенерировать новую текстуру
    const newSize = desiredSize
    
    // Создаём или обновляем рендерер
    if (!layerRenderer || layerRenderer.width !== newSize || layerRenderer.height !== newSize) {
      layerRenderer = new TerrainLayerRenderer(newSize, newSize)
    }
    
    layerRenderer.render(layers, { hexMask: false })
    
    // Создаём копию canvas для кэша
    const cachedCanvas = document.createElement('canvas')
    cachedCanvas.width = newSize
    cachedCanvas.height = newSize
    cachedCanvas.getContext('2d').drawImage(layerRenderer.canvas, 0, 0)
    
    // Создаём pattern
    const pattern = ctx.createPattern(cachedCanvas, 'repeat')
    
    // Сохраняем в кэш
    patternCache.set(cacheKey, {
      layersHash,
      size: newSize,
      canvas: cachedCanvas,
      pattern
    })
    
    return pattern
  }
  
  // Кэш для world-space паттернов (для cached режима)
  const worldSpacePatternCache = new Map()
  
  /**
   * Получить паттерн для террейна в world-space координатах (для cached режима)
   * Генерирует паттерн размером с bounding box карты — без повторов
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} terrain
   * @param {number} worldWidth - ширина карты в пикселях
   * @param {number} worldHeight - высота карты в пикселях
   * @param {number} offsetX - смещение карты по X (minX)
   * @param {number} offsetY - смещение карты по Y (minY)
   * @param {number} maxSize - максимальный размер паттерна (ограничение памяти)
   */
  const getTerrainPatternWorldSpace = (ctx, terrain, worldWidth, worldHeight, offsetX = 0, offsetY = 0, maxSize = 2048) => {
    if (!terrain) return '#888888'
    
    const layers = terrain.layers || []
    const color = terrain.fallbackColor || terrain.color || '#888888'
    
    // Если нет слоёв — возвращаем цвет
    if (layers.length === 0) {
      return color
    }
    
    // Фильтруем только включённые слои
    const enabledLayers = layers.filter(l => l.enabled !== false)
    if (enabledLayers.length === 0) {
      return color
    }
    
    // Вычисляем размер паттерна — либо размер карты, либо maxSize
    const patternWidth = Math.min(worldWidth, maxSize)
    const patternHeight = Math.min(worldHeight, maxSize)
    
    // Ключ кэша включает размер и смещение
    const cacheKey = `${terrain.id || 'unknown'}:worldspace:${patternWidth}x${patternHeight}:${offsetX.toFixed(0)},${offsetY.toFixed(0)}`
    const layersHash = getLayersHash(layers, color)
    
    // Проверяем кэш
    const cached = worldSpacePatternCache.get(cacheKey)
    if (cached && cached.layersHash === layersHash && cached.pattern) {
      // Возвращаем кэшированный паттерн — transform уже применён
      return cached.pattern
    }
    
    // Генерируем паттерн
    const renderer = new TerrainLayerRenderer(patternWidth, patternHeight)
    renderer.render(enabledLayers, { hexMask: false })
    
    // Создаём копию для кэша
    const cachedCanvas = document.createElement('canvas')
    cachedCanvas.width = patternWidth
    cachedCanvas.height = patternHeight
    cachedCanvas.getContext('2d').drawImage(renderer.canvas, 0, 0)
    
    // Создаём pattern
    const pattern = ctx.createPattern(cachedCanvas, 'repeat')
    
    // Смещаем паттерн чтобы он начинался с (offsetX, offsetY) — начала карты
    // Это гарантирует что шум совпадает с world-space координатами
    if (pattern && pattern.setTransform) {
      const matrix = new DOMMatrix()
      matrix.translateSelf(offsetX, offsetY)
      pattern.setTransform(matrix)
    }
    
    // Сохраняем в кэш (без смещения — смещение применяется при каждом вызове)
    worldSpacePatternCache.set(cacheKey, {
      layersHash,
      canvas: cachedCanvas,
      pattern,
      offsetX,
      offsetY
    })
    
    return pattern
  }
  
  // Кэш для averageColor
  const averageColorCache = new Map()
  
  /**
   * Получить или вычислить averageColor для террейна
   * Lazy вычисление с кэшированием
   */
  const getAverageColor = (terrain) => {
    if (!terrain) return '#888888'
    
    // Если уже есть в террейне — используем
    if (terrain.averageColor) return terrain.averageColor
    
    // Если нет слоёв — возвращаем цвет
    const layers = terrain.layers
    if (!layers || layers.length === 0) {
      return terrain.fallbackColor || terrain.color || '#888888'
    }
    
    // Проверяем кэш
    const cacheKey = terrain.id || 'unknown'
    const layersHash = getLayersHash(layers, terrain.color)
    const cached = averageColorCache.get(cacheKey)
    
    if (cached && cached.layersHash === layersHash) {
      return cached.color
    }
    
    // Вычисляем через маленький рендер
    const sampleSize = 32
    if (!layerRenderer || layerRenderer.width !== sampleSize) {
      layerRenderer = new TerrainLayerRenderer(sampleSize, sampleSize)
    }
    
    layerRenderer.render(layers, { hexMask: false })
    
    const ctx = layerRenderer.canvas.getContext('2d')
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
    
    let avgColor = terrain.color || '#888888'
    if (count > 0) {
      r = Math.round(r / count)
      g = Math.round(g / count)
      b = Math.round(b / count)
      avgColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    }
    
    // Кэшируем
    averageColorCache.set(cacheKey, { layersHash, color: avgColor })
    
    // Также сохраняем в террейн для будущего использования
    terrain.averageColor = avgColor
    
    return avgColor
  }

  /**
   * Получить цвет террейна для текущего zoom (с учётом LOD)
   */
  const getTerrainColor = (terrainId, zoom = 1) => {
    const terrain = getTerrainById(terrainId)
    if (!terrain) return '#0d1117' // void

    // При очень низком zoom — используем averageColor
    if (zoom < LOD_THRESHOLDS.ULTRA_LOW) {
      return getAverageColor(terrain)
    }

    // Иначе — fallbackColor (для primitive режима)
    return terrain.fallbackColor || terrain.color || '#888888'
  }

  /**
   * Отрисовать гекс в primitive режиме
   */
  const renderHexPrimitive = (ctx, centerX, centerY, radius, terrainId, zoom = 1) => {
    const color = getTerrainColor(terrainId, zoom)
    const vertices = getHexVertices(centerX, centerY, radius)

    ctx.beginPath()
    ctx.moveTo(vertices[0].x, vertices[0].y)
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(vertices[i].x, vertices[i].y)
    }
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
  }

  /**
   * Отрисовать все гексы в primitive режиме
   * @param {CanvasRenderingContext2D} ctx
   * @param {Map|Object} hexes - Map<key, {terrain}> или объект с итератором
   * @param {Object} hexGrid - HexGrid instance
   * @param {Object} camera - { x, y, zoom }
   */
  const renderPrimitive = (ctx, hexes, hexGrid, camera) => {
    if (!hexes || !hexGrid) return

    ctx.save()
    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.zoom, camera.zoom)

    const radius = hexGrid.hexSize

    // Итерируем по гексам
    const iterate = hexes.forEach ? hexes.forEach.bind(hexes) : 
                    hexes.entries ? () => hexes.entries() : null

    if (hexes instanceof Map || hexes.forEach) {
      hexes.forEach((data, key) => {
        const [q, r] = key.split(',').map(Number)
        const center = hexGrid.hexToPixel(q, r)
        const terrainId = data?.terrain || data
        renderHexPrimitive(ctx, center.x, center.y, radius, terrainId, camera.zoom)
      })
    } else if (Array.isArray(hexes)) {
      for (const hex of hexes) {
        const center = hexGrid.hexToPixel(hex.q, hex.r)
        renderHexPrimitive(ctx, center.x, center.y, radius, hex.terrain, camera.zoom)
      }
    }

    ctx.restore()
  }

  /**
   * Отрисовать сетку гексов
   */
  const renderGrid = (ctx, hexes, hexGrid, camera, options = {}) => {
    const {
      strokeColor = 'rgba(255, 255, 255, 0.2)',
      lineWidth = 1
    } = options

    if (!hexes || !hexGrid) return

    ctx.save()
    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.zoom, camera.zoom)

    ctx.strokeStyle = strokeColor
    ctx.lineWidth = lineWidth / camera.zoom // Компенсируем zoom

    const radius = hexGrid.hexSize

    const drawHexOutline = (q, r) => {
      const center = hexGrid.hexToPixel(q, r)
      const vertices = getHexVertices(center.x, center.y, radius)

      ctx.beginPath()
      ctx.moveTo(vertices[0].x, vertices[0].y)
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y)
      }
      ctx.closePath()
      ctx.stroke()
    }

    if (hexes instanceof Map || hexes.forEach) {
      hexes.forEach((_, key) => {
        const [q, r] = key.split(',').map(Number)
        drawHexOutline(q, r)
      })
    } else if (Array.isArray(hexes)) {
      for (const hex of hexes) {
        drawHexOutline(hex.q, hex.r)
      }
    }

    ctx.restore()
  }

  /**
   * Отрисовать террейн в live режиме (полный рендер)
   * Использует HexClusterRenderer.renderExtended для патчей с границами
   * С viewport culling — рисуем только видимые гексы + запас
   */
  const renderLive = (ctx, hexes, hexGrid, camera, lightingSettings = null) => {
    if (!hexes || !hexGrid) return
    
    const radius = hexGrid.hexSize
    const canvasWidth = ctx.canvas.width
    const canvasHeight = ctx.canvas.height
    const zoom = camera.zoom
    
    // При очень низком zoom — fallback на primitive (быстрее)
    if (zoom < LOD_THRESHOLDS.ULTRA_LOW) {
      renderPrimitive(ctx, hexes, hexGrid, camera)
      return
    }
    
    // === VIEWPORT CULLING ===
    // Вычисляем видимую область в мировых координатах
    const padding = radius * 3 // Запас в 3 гекса для плавного скролла и эффектов границ
    const viewLeft = -camera.x / zoom - padding
    const viewTop = -camera.y / zoom - padding
    const viewRight = (canvasWidth - camera.x) / zoom + padding
    const viewBottom = (canvasHeight - camera.y) / zoom + padding
    
    // Функция проверки попадания гекса в viewport
    const isInViewport = (cx, cy) => {
      return cx >= viewLeft && cx <= viewRight && cy >= viewTop && cy <= viewBottom
    }
    
    // Создаём renderer если ещё нет или изменился размер
    if (!clusterRenderer || clusterRenderer.width !== canvasWidth || clusterRenderer.height !== canvasHeight) {
      clusterRenderer = new HexClusterRenderer(canvasWidth, canvasHeight)
    }
    
    // Устанавливаем настройки освещения
    if (lightingSettings) {
      clusterRenderer.setLightingSettings(lightingSettings)
    }
    
    // Преобразуем гексы в формат для HexClusterRenderer
    // Только видимые гексы благодаря viewport culling
    const hexArray = []
    
    const processHex = (data, key) => {
      const [q, r] = key.split(',').map(Number)
      const center = hexGrid.hexToPixel(q, r)
      
      // Viewport culling — пропускаем гексы вне видимой области
      if (!isInViewport(center.x, center.y)) return
      
      const terrainId = data?.terrain || data
      const terrain = getTerrainById(terrainId)
      
      if (!terrain) return
      
      // LOD: выбираем fill в зависимости от zoom
      let fill
      if (zoom < LOD_THRESHOLDS.LOW) {
        // Низкий zoom — используем averageColor (вычисляем lazy если нет)
        fill = getAverageColor(terrain)
      } else if (zoom >= LOD_THRESHOLDS.MEDIUM) {
        // Высокий zoom — полные текстуры слоёв (с фильтрацией по minZoom)
        // Используем режим превью для редактируемого террейна (быстрая генерация)
        fill = getTerrainPattern(ctx, terrain, 0, zoom, patternPreviewMode.value)
      } else {
        // Средний zoom — averageColor (для плавного перехода)
        fill = getAverageColor(terrain)
      }
      
      // Получаем elevation из categoryTags
      const elevation = terrain.categoryTags?.elevation || 'flat'
      const elevationPriority = {
        'submerged': 0, 'low': 1, 'flat': 2, 'elevated': 3, 'high': 4, 'cliff': 5
      }[elevation] ?? 2
      
      hexArray.push({
        index: key,
        q,              // axial координаты для поиска соседей
        r,              // axial координаты для поиска соседей  
        cx: center.x,
        cy: center.y,
        terrain,
        fill,
        elevation: elevationPriority
      })
    }
    
    // Итерируем по гексам
    if (hexes instanceof Map || hexes.forEach) {
      hexes.forEach((data, key) => processHex(data, key))
    } else if (Array.isArray(hexes)) {
      for (const hex of hexes) {
        const key = `${hex.q},${hex.r}`
        processHex(hex, key)
      }
    }
    
    if (hexArray.length === 0) return
    
    // Сохраняем состояние и применяем трансформацию камеры
    ctx.save()
    ctx.translate(camera.x, camera.y)
    ctx.scale(camera.zoom, camera.zoom)
    
    // Функция получения правила перехода между террейнами
    const getTransitionForPair = (fromTerrain, toTerrain) => {
      if (!getTransitionRule) return null
      
      const rule = getTransitionRule(fromTerrain?.id, toTerrain?.id)
      if (!rule) return null
      
      // Фильтруем эффекты по LOD
      const filteredEffects = filterEffectsByZoom(rule.effects, zoom)
      if (filteredEffects.length === 0) return null
      
      return { ...rule, effects: filteredEffects }
    }
    
    // Рендерим через HexClusterRenderer
    clusterRenderer.renderExtended(ctx, {
      hexes: hexArray,
      getTransitionForPair,
      radius,
      showGrid: false, // Сетку рисуем отдельно
      transform: { x: camera.x, y: camera.y, zoom: camera.zoom }
    })
    
    ctx.restore()
  }

  /**
   * Отрисовать террейн из кеша
   */
  const renderCached = (ctx, hexes, hexGrid, camera, lightingSettings = null) => {
    if (!cacheValid.value || !cache.value) {
      // Кеш невалиден — запускаем асинхронную перестройку
      // Пока строится — показываем примитивный рендер
      rebuildCache(ctx, hexes, hexGrid, lightingSettings)
    }

    if (cache.value) {
      // Blitим кеш с учётом camera transform
      ctx.save()
      ctx.translate(camera.x, camera.y)
      ctx.scale(camera.zoom, camera.zoom)
      
      // Рисуем кеш со смещением на его origin
      ctx.drawImage(cache.value, cacheBounds.minX, cacheBounds.minY)
      
      ctx.restore()
    } else {
      // Fallback пока кеш строится
      renderPrimitive(ctx, hexes, hexGrid, camera)
    }
  }
  
  // Границы кеша в world coordinates
  let cacheBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  
  // Флаг что кеш строится
  let isBuildingCache = false

  /**
   * Перестроить кеш (асинхронно)
   * Рендерит все гексы в offscreen canvas в world coordinates
   */
  const rebuildCache = async (ctx, hexes, hexGrid, lightingSettings = null) => {
    if (!hexes || !hexGrid) {
      cacheValid.value = false
      return
    }
    
    // Предотвращаем параллельную сборку
    if (isBuildingCache) return
    isBuildingCache = true
    
    try {
      await rebuildCacheInternal(ctx, hexes, hexGrid, lightingSettings)
    } finally {
      isBuildingCache = false
    }
  }
  
  const rebuildCacheInternal = async (ctx, hexes, hexGrid, lightingSettings = null) => {
    const radius = hexGrid.hexSize
    
    // Первый проход: вычисляем bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const hexData = []
    
    const collectBounds = (data, key) => {
      const [q, r] = key.split(',').map(Number)
      const center = hexGrid.hexToPixel(q, r)
      const terrainId = data?.terrain || data
      const terrain = getTerrainById(terrainId)
      
      if (!terrain) return
      
      minX = Math.min(minX, center.x - radius * 1.5)
      minY = Math.min(minY, center.y - radius * 1.5)
      maxX = Math.max(maxX, center.x + radius * 1.5)
      maxY = Math.max(maxY, center.y + radius * 1.5)
      
      hexData.push({ key, q, r, center, terrain })
    }
    
    // Итерируем по гексам для сбора bounds
    if (hexes instanceof Map || hexes.forEach) {
      hexes.forEach((data, key) => collectBounds(data, key))
    } else if (Array.isArray(hexes)) {
      for (const hex of hexes) {
        const key = `${hex.q},${hex.r}`
        collectBounds(hex, key)
      }
    }
    
    if (hexData.length === 0) {
      cacheValid.value = false
      cache.value = null
      return
    }
    
    // Добавляем padding
    const padding = radius * 2
    minX -= padding
    minY -= padding
    maxX += padding
    maxY += padding
    
    const width = Math.ceil(maxX - minX)
    const height = Math.ceil(maxY - minY)
    
    // Ограничиваем максимальный размер кеша
    const maxCacheSize = 4096
    if (width > maxCacheSize || height > maxCacheSize) {
      console.warn('[TerrainRenderer] Cache too large, falling back to live render')
      cacheValid.value = false
      cache.value = null
      return
    }
    
    // Сохраняем bounds
    cacheBounds = { minX, minY, maxX, maxY, width, height }
    
    // Создаём offscreen canvas
    const offscreen = document.createElement('canvas')
    offscreen.width = width
    offscreen.height = height
    const offCtx = offscreen.getContext('2d')
    
    // Используем чанковую систему для эффективной генерации текстур
    const chunkCache = getGlobalChunkCache()
    
    // Для cached режима создаём паттерны из чанков
    // Собираем все нужные чанки для каждого террейна
    const terrainPatterns = new Map()
    
    // Собираем уникальные террейны и их bounding boxes
    const terrainBounds = new Map()
    for (const h of hexData) {
      const terrain = h.terrain
      if (!terrain) continue
      
      const layers = terrain.layers || []
      const enabledLayers = layers.filter(l => l.enabled !== false)
      if (enabledLayers.length === 0) continue
      
      const key = terrain.id || 'unknown'
      
      if (!terrainBounds.has(key)) {
        terrainBounds.set(key, { 
          terrain, 
          minX: Infinity, minY: Infinity, 
          maxX: -Infinity, maxY: -Infinity 
        })
      }
      
      const bounds = terrainBounds.get(key)
      bounds.minX = Math.min(bounds.minX, h.center.x - radius * 1.5)
      bounds.minY = Math.min(bounds.minY, h.center.y - radius * 1.5)
      bounds.maxX = Math.max(bounds.maxX, h.center.x + radius * 1.5)
      bounds.maxY = Math.max(bounds.maxY, h.center.y + radius * 1.5)
    }
    
    // Асинхронно предзагружаем чанки для всех террейнов
    // Используем zoom=1 для full quality (cached mode всегда рендерит в полном качестве)
    const preloadPromises = []
    for (const [key, bounds] of terrainBounds) {
      // Выравниваем по границам чанков
      const tMinX = Math.floor(bounds.minX / CHUNK_SIZE) * CHUNK_SIZE
      const tMinY = Math.floor(bounds.minY / CHUNK_SIZE) * CHUNK_SIZE
      const tMaxX = Math.ceil(bounds.maxX / CHUNK_SIZE) * CHUNK_SIZE
      const tMaxY = Math.ceil(bounds.maxY / CHUNK_SIZE) * CHUNK_SIZE
      
      preloadPromises.push(
        chunkCache.preloadChunksForArea(bounds.terrain, tMinX, tMinY, tMaxX, tMaxY, 1)
      )
    }
    
    // Ждём загрузки всех чанков
    await Promise.all(preloadPromises)
    
    // Теперь синхронно собираем паттерны из готовых чанков
    const getChunkedFill = (terrain, hexCenterX, hexCenterY, hexRadius) => {
      if (!terrain) return '#888888'
      
      const layers = terrain.layers || []
      const enabledLayers = layers.filter(l => l.enabled !== false)
      
      // Если нет слоёв — возвращаем цвет
      if (enabledLayers.length === 0) {
        return terrain.fallbackColor || terrain.color || '#888888'
      }
      
      const key = terrain.id || 'unknown'
      
      // Проверяем есть ли уже паттерн для этого террейна
      if (terrainPatterns.has(key)) {
        return terrainPatterns.get(key)
      }
      
      // Получаем bounds для этого террейна
      const bounds = terrainBounds.get(key)
      if (!bounds) {
        const color = terrain.fallbackColor || terrain.color || '#888888'
        terrainPatterns.set(key, color)
        return color
      }
      
      // Выравниваем bounding box по границам чанков
      const tMinX = Math.floor(bounds.minX / CHUNK_SIZE) * CHUNK_SIZE
      const tMinY = Math.floor(bounds.minY / CHUNK_SIZE) * CHUNK_SIZE
      const tMaxX = Math.ceil(bounds.maxX / CHUNK_SIZE) * CHUNK_SIZE
      const tMaxY = Math.ceil(bounds.maxY / CHUNK_SIZE) * CHUNK_SIZE
      
      // Получаем чанки (уже загружены, используем sync версию)
      const chunks = chunkCache.getChunksForAreaSync(terrain, tMinX, tMinY, tMaxX, tMaxY, 1)
      
      if (chunks.length === 0 || chunks.every(c => !c.bitmap)) {
        const color = terrain.fallbackColor || terrain.color || '#888888'
        terrainPatterns.set(key, color)
        return color
      }
      
      // Создаём canvas для составного паттерна
      const patternWidth = Math.ceil(tMaxX - tMinX)
      const patternHeight = Math.ceil(tMaxY - tMinY)
      
      // Ограничиваем размер паттерна
      const maxPatternSize = 4096
      if (patternWidth > maxPatternSize || patternHeight > maxPatternSize) {
        console.warn(`[TerrainRenderer] Pattern too large for ${key}: ${patternWidth}x${patternHeight}`)
      }
      
      const patternCanvas = document.createElement('canvas')
      patternCanvas.width = Math.min(patternWidth, maxPatternSize)
      patternCanvas.height = Math.min(patternHeight, maxPatternSize)
      const patternCtx = patternCanvas.getContext('2d')
      
      // Собираем чанки в единый паттерн
      for (const chunk of chunks) {
        if (!chunk.bitmap) continue
        
        const dx = chunk.worldX - tMinX
        const dy = chunk.worldY - tMinY
        
        // Preview чанки 128x128, full — 256x256
        // Масштабируем preview до full size при отрисовке
        if (chunk.size === 'preview') {
          patternCtx.drawImage(chunk.bitmap, dx, dy, CHUNK_SIZE_FULL, CHUNK_SIZE_FULL)
        } else {
          patternCtx.drawImage(chunk.bitmap, dx, dy)
        }
      }
      
      // Создаём pattern со смещением
      const pattern = offCtx.createPattern(patternCanvas, 'repeat')
      if (pattern && pattern.setTransform) {
        const matrix = new DOMMatrix()
        matrix.translateSelf(tMinX, tMinY)
        pattern.setTransform(matrix)
      }
      
      terrainPatterns.set(key, pattern)
      return pattern
    }
    
    // Второй проход: собираем гексы с patterns (используя offCtx)
    const hexArray = []
    
    for (const { key, q, r, center, terrain } of hexData) {
      // Используем чанковую систему для текстур
      const fill = getChunkedFill(terrain, center.x, center.y, radius)
      
      const elevation = terrain.categoryTags?.elevation || 'flat'
      const elevationPriority = {
        'submerged': 0, 'low': 1, 'flat': 2, 'elevated': 3, 'high': 4, 'cliff': 5
      }[elevation] ?? 2
      
      hexArray.push({
        index: key,
        q, r,
        cx: center.x,
        cy: center.y,
        terrain,
        fill,
        elevation: elevationPriority
      })
    }
    
    // Смещаем координаты чтобы (minX, minY) было в (0, 0)
    offCtx.translate(-minX, -minY)
    
    // Создаём или переиспользуем cluster renderer
    if (!clusterRenderer || clusterRenderer.width !== width || clusterRenderer.height !== height) {
      clusterRenderer = new HexClusterRenderer(width, height)
    }
    
    if (lightingSettings) {
      clusterRenderer.setLightingSettings(lightingSettings)
    }
    
    // Рендерим через HexClusterRenderer
    clusterRenderer.renderExtended(offCtx, {
      hexes: hexArray,
      getTransitionForPair: (fromTerrain, toTerrain) => {
        if (!getTransitionRule) return null
        const rule = getTransitionRule(fromTerrain?.id, toTerrain?.id)
        if (!rule) return null
        // Для кеша используем все эффекты (без LOD фильтрации)
        return rule
      },
      radius,
      showGrid: false,
      transform: { x: -minX, y: -minY, zoom: 1 }
    })
    
    // Сохраняем кеш
    cache.value = offscreen
    cacheValid.value = true
    cacheVersion.value++
    
    // Логируем статистику
    const chunkStats = chunkCache.getStats()
    console.log(`[TerrainRenderer] Cache rebuilt: ${width}x${height}, ${hexArray.length} hexes, version: ${cacheVersion.value}`)
    console.log(`[TerrainRenderer] Chunk cache - Preview: ${chunkStats.previewChunks}, Full: ${chunkStats.fullChunks}, Evictions: ${chunkStats.evictions}`)
    console.log(`[TerrainRenderer] Hit rates - Preview: ${(chunkStats.previewHitRate * 100).toFixed(1)}%, Full: ${(chunkStats.fullHitRate * 100).toFixed(1)}%`)
  }

  /**
   * Инвалидировать кеш
   */
  const invalidateCache = () => {
    cacheValid.value = false
  }

  /**
   * Главная функция рендеринга
   */
  const render = (ctx, hexes, hexGrid, camera, options = {}) => {
    const { lightingSettings = null } = options

    switch (mode.value) {
      case RENDER_MODES.LIVE:
        renderLive(ctx, hexes, hexGrid, camera, lightingSettings)
        break
      case RENDER_MODES.CACHED:
        renderCached(ctx, hexes, hexGrid, camera, lightingSettings)
        break
      case RENDER_MODES.PRIMITIVE:
      default:
        renderPrimitive(ctx, hexes, hexGrid, camera)
        break
    }
  }

  /**
   * Установить режим рендеринга
   */
  const setMode = (newMode) => {
    if (Object.values(RENDER_MODES).includes(newMode)) {
      mode.value = newMode
      invalidateCache()
    }
  }

  /**
   * Инвалидировать кэш паттернов
   * Вызывается при изменении слоёв террейнов или настроек переходов
   * @param {string} terrainId - ID конкретного террейна, или null для очистки всего кэша
   */
  const invalidatePatternCache = (terrainId = null) => {
    if (terrainId) {
      // Удаляем все записи для данного террейна (все LOD уровни)
      for (const key of patternCache.keys()) {
        if (key.startsWith(`${terrainId}:`)) {
          patternCache.delete(key)
        }
      }
      // Также очищаем world-space кэш для этого террейна
      for (const key of worldSpacePatternCache.keys()) {
        if (key.startsWith(`${terrainId}:`)) {
          worldSpacePatternCache.delete(key)
        }
      }
      // Также очищаем averageColor кэш
      averageColorCache.delete(terrainId)
      // Инвалидируем чанковый кэш для этого террейна
      getGlobalChunkCache().invalidate(terrainId)
    } else {
      // Очищаем весь кэш
      patternCache.clear()
      worldSpacePatternCache.clear()
      averageColorCache.clear()
      // Очищаем весь чанковый кэш
      getGlobalChunkCache().invalidate()
    }
  }

  /**
   * Фильтровать эффекты по zoom (LOD)
   */
  const filterEffectsByZoom = (effects, zoom) => {
    if (!effects) return []
    
    return effects.filter(effect => {
      const minZoom = effect.minZoom ?? 0
      const maxZoom = effect.maxZoom ?? Infinity
      return zoom >= minZoom && zoom <= maxZoom
    })
  }

  /**
   * Фильтровать слои террейна по zoom (LOD)
   */
  const filterLayersByZoom = (layers, zoom) => {
    if (!layers) return []
    
    return layers.filter(layer => {
      const minZoom = layer.minZoom ?? 0
      return zoom >= minZoom
    })
  }
  
  /**
   * Установить режим превью паттернов
   * @param {boolean} preview - true = быстрый превью (200px), false = полный размер (1024px)
   */
  const setPatternPreviewMode = (preview) => {
    patternPreviewMode.value = preview
  }
  
  /**
   * Сгенерировать полный паттерн для редактируемого террейна
   * Переключает в полный режим, очищает кэш 'editing' и запрашивает перерисовку
   */
  const generateFullPattern = () => {
    patternPreviewMode.value = false
    // Очищаем только кэш редактируемого террейна чтобы заставить регенерацию
    invalidatePatternCache('editing')
  }

  return {
    // Состояние
    mode,
    cacheValid,
    cacheVersion,
    patternPreviewMode,
    
    // Константы
    RENDER_MODES,
    LOD_THRESHOLDS,
    PREVIEW_PATTERN_SIZE,
    FULL_PATTERN_SIZE,
    
    // Методы
    render,
    renderPrimitive,
    renderLive,
    renderCached,
    renderGrid,
    setMode,
    setPatternPreviewMode,
    generateFullPattern,
    invalidateCache,
    invalidatePatternCache,
    rebuildCache,
    
    // LOD утилиты
    filterEffectsByZoom,
    filterLayersByZoom,
    getTerrainColor
  }
}
