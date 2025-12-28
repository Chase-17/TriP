/**
 * TerrainLayerRenderer - рендеринг слоёв террейна на Canvas
 * 
 * Поддерживает:
 * - Сплошной цвет (base)
 * - Шум (Perlin, Simplex, Voronoi)
 * - Паттерны (линии, точки, сетка)
 * - Смешивание слоёв с разной непрозрачностью
 */

import { PerlinNoise, SimplexNoise, VoronoiNoise, NoiseUtils } from './noise.js'

/**
 * Типы слоёв
 */
export const LAYER_TYPES = {
  SOLID: 'solid',       // Сплошной цвет
  NOISE: 'noise',       // Шум
  PATTERN: 'pattern',   // Геометрический паттерн
  GRADIENT: 'gradient'  // Градиент
}

/**
 * Типы шума
 */
export const NOISE_TYPES = {
  PERLIN: 'perlin',
  SIMPLEX: 'simplex',
  VORONOI: 'voronoi'
}

/**
 * Типы паттернов
 */
export const PATTERN_TYPES = {
  DOTS: 'dots',
  LINES: 'lines',
  GRID: 'grid',
  STRIPES: 'stripes',
  CHECKER: 'checker'
}

/**
 * Режимы наложения
 */
export const BLEND_MODES = {
  NORMAL: 'source-over',
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  OVERLAY: 'overlay',
  SOFT_LIGHT: 'soft-light',
  HARD_LIGHT: 'hard-light'
}

/**
 * Дефолтная конфигурация слоя
 */
export const DEFAULT_LAYER = {
  type: LAYER_TYPES.SOLID,
  enabled: true,
  opacity: 1,
  color: '#888888',
  
  // LOD - минимальный zoom для отображения слоя
  minZoom: 0,
  
  // Для noise
  noiseType: NOISE_TYPES.PERLIN,
  noiseScale: 0.1,
  noiseOctaves: 3,
  noisePersistence: 0.5,
  noiseLacunarity: 2.0,
  noiseContrast: 1.0,
  noiseSeed: null, // null = случайный
  
  // Для pattern
  patternType: PATTERN_TYPES.DOTS,
  patternSize: 4,
  patternSpacing: 8,
  patternAngle: 0,
  
  // Общее
  blendMode: BLEND_MODES.NORMAL
}

/**
 * Создать пустую конфигурацию слоя
 */
export function createLayer(overrides = {}) {
  return { ...DEFAULT_LAYER, ...overrides }
}

/**
 * Кэш noise генераторов (чтобы не создавать заново)
 */
const noiseCache = new Map()

function getNoiseGenerator(type, seed) {
  const key = `${type}_${seed}`
  if (!noiseCache.has(key)) {
    switch (type) {
      case NOISE_TYPES.SIMPLEX:
        noiseCache.set(key, new SimplexNoise(seed))
        break
      case NOISE_TYPES.VORONOI:
        noiseCache.set(key, new VoronoiNoise(seed))
        break
      case NOISE_TYPES.PERLIN:
      default:
        noiseCache.set(key, new PerlinNoise(seed))
    }
  }
  return noiseCache.get(key)
}

/**
 * Основной класс рендерера
 */
export class TerrainLayerRenderer {
  /**
   * @param {number} width - ширина в пикселях
   * @param {number} height - высота в пикселях
   */
  constructor(width = 128, height = 128) {
    this.width = width
    this.height = height
    
    // Основной canvas
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d')
    
    // Временный canvas для слоёв
    this.tempCanvas = document.createElement('canvas')
    this.tempCanvas.width = width
    this.tempCanvas.height = height
    this.tempCtx = this.tempCanvas.getContext('2d')
  }

  /**
   * Очистить canvas
   */
  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height)
  }

  /**
   * Простая хэш-функция для строки → число
   * Используется для генерации детерминированного seed
   */
  hashString(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Рендерить все слои
   * @param {Array} layers - массив конфигураций слоёв
   * @param {Object} options - дополнительные опции
   * @returns {HTMLCanvasElement}
   */
  render(layers, options = {}) {
    this.clear()
    
    const { 
      hexMask = false, 
      centerX = this.width / 2, 
      centerY = this.height / 2, 
      radius = this.width / 2 - 2,
      // World-space offset для генерации шума по глобальным координатам
      worldOffsetX = 0,
      worldOffsetY = 0,
      // Масштаб для LOD (0.5 = preview, 1.0 = full)
      scale = 1
    } = options
    
    // Сохраняем offset и scale для использования в renderNoise
    this._worldOffsetX = worldOffsetX
    this._worldOffsetY = worldOffsetY
    this._scale = scale
    
    // Создаём hex маску если нужно
    if (hexMask) {
      this.createHexClip(centerX, centerY, radius)
    }
    
    // Рендерим каждый слой
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]
      if (!layer.enabled) continue
      this.renderLayer(layer, i)
    }
    
    // Сбрасываем clip
    if (hexMask) {
      this.ctx.restore()
    }
    
    return this.canvas
  }

  /**
   * Создать hex clip path
   */
  createHexClip(centerX, centerY, radius) {
    this.ctx.save()
    this.ctx.beginPath()
    
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2
      const x = centerX + radius * Math.cos(angle)
      const y = centerY + radius * Math.sin(angle)
      
      if (i === 0) {
        this.ctx.moveTo(x, y)
      } else {
        this.ctx.lineTo(x, y)
      }
    }
    
    this.ctx.closePath()
    this.ctx.clip()
  }

  /**
   * Рендерить один слой
   * @param {Object} layer - конфигурация слоя
   * @param {number} layerIndex - индекс слоя (для детерминированного seed)
   */
  renderLayer(layer, layerIndex = 0) {
    // Очищаем temp canvas
    this.tempCtx.clearRect(0, 0, this.width, this.height)
    
    switch (layer.type) {
      case LAYER_TYPES.SOLID:
        this.renderSolid(layer)
        break
      case LAYER_TYPES.NOISE:
        this.renderNoise(layer, layerIndex)
        break
      case LAYER_TYPES.PATTERN:
        this.renderPattern(layer)
        break
      case LAYER_TYPES.GRADIENT:
        this.renderGradient(layer)
        break
    }
    
    // Применяем слой к основному canvas
    this.ctx.globalAlpha = layer.opacity
    this.ctx.globalCompositeOperation = layer.blendMode || 'source-over'
    this.ctx.drawImage(this.tempCanvas, 0, 0)
    this.ctx.globalAlpha = 1
    this.ctx.globalCompositeOperation = 'source-over'
  }

  /**
   * Рендер сплошного цвета
   */
  renderSolid(layer) {
    this.tempCtx.fillStyle = layer.color
    this.tempCtx.fillRect(0, 0, this.width, this.height)
  }

  /**
   * Рендер шума
   */
  renderNoise(layer, layerIndex = 0) {
    // Если noiseSeed не задан, генерируем детерминированный seed на основе параметров слоя
    // Это позволяет получать одинаковый шум при одинаковых настройках
    let seed = layer.noiseSeed
    if (seed === null || seed === undefined) {
      // Создаём seed из параметров слоя для детерминированности
      const seedStr = `${layer.noiseType}_${layer.noiseScale}_${layer.noiseOctaves}_${layerIndex}_${layer.color}`
      seed = this.hashString(seedStr)
    }
    const noise = getNoiseGenerator(layer.noiseType, seed)
    
    const imageData = this.tempCtx.createImageData(this.width, this.height)
    const data = imageData.data
    
    // Парсим цвет
    const color = this.parseColor(layer.color)
    
    // World-space offset и scale для генерации шума по глобальным координатам
    // Это позволяет чанкам идеально стыковаться
    const offsetX = this._worldOffsetX || 0
    const offsetY = this._worldOffsetY || 0
    const scale = this._scale || 1
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Используем world-space координаты для шума
        // При scale=0.5 (preview), координаты растягиваем чтобы покрыть ту же область
        const worldX = (x / scale) + offsetX
        const worldY = (y / scale) + offsetY
        
        let value
        
        if (layer.noiseType === NOISE_TYPES.VORONOI) {
          value = noise.noise2D(worldX, worldY, layer.noiseScale)
        } else {
          value = noise.fbm(
            worldX * layer.noiseScale,
            worldY * layer.noiseScale,
            layer.noiseOctaves,
            layer.noisePersistence,
            layer.noiseLacunarity
          )
          value = NoiseUtils.normalize(value)
        }
        
        // Применяем контраст
        if (layer.noiseContrast !== 1) {
          value = NoiseUtils.contrast(value, layer.noiseContrast)
        }
        
        const i = (y * this.width + x) * 4
        data[i] = color.r
        data[i + 1] = color.g
        data[i + 2] = color.b
        data[i + 3] = Math.floor(value * 255 * color.a)
      }
    }
    
    this.tempCtx.putImageData(imageData, 0, 0)
  }

  /**
   * Рендер паттерна
   */
  renderPattern(layer) {
    const color = layer.color
    this.tempCtx.fillStyle = color
    this.tempCtx.strokeStyle = color
    
    const size = layer.patternSize
    const spacing = layer.patternSpacing
    
    switch (layer.patternType) {
      case PATTERN_TYPES.DOTS:
        this.renderDots(size, spacing)
        break
      case PATTERN_TYPES.LINES:
        this.renderLines(size, spacing, layer.patternAngle)
        break
      case PATTERN_TYPES.GRID:
        this.renderGrid(size, spacing)
        break
      case PATTERN_TYPES.STRIPES:
        this.renderStripes(size, spacing, layer.patternAngle)
        break
      case PATTERN_TYPES.CHECKER:
        this.renderChecker(spacing)
        break
    }
  }

  renderDots(size, spacing) {
    for (let y = spacing / 2; y < this.height; y += spacing) {
      for (let x = spacing / 2; x < this.width; x += spacing) {
        this.tempCtx.beginPath()
        this.tempCtx.arc(x, y, size / 2, 0, Math.PI * 2)
        this.tempCtx.fill()
      }
    }
  }

  renderLines(lineWidth, spacing, angle = 0) {
    this.tempCtx.lineWidth = lineWidth
    this.tempCtx.save()
    this.tempCtx.translate(this.width / 2, this.height / 2)
    this.tempCtx.rotate((angle * Math.PI) / 180)
    
    const diagonal = Math.sqrt(this.width ** 2 + this.height ** 2)
    
    for (let i = -diagonal; i < diagonal; i += spacing) {
      this.tempCtx.beginPath()
      this.tempCtx.moveTo(i, -diagonal)
      this.tempCtx.lineTo(i, diagonal)
      this.tempCtx.stroke()
    }
    
    this.tempCtx.restore()
  }

  renderGrid(lineWidth, spacing) {
    this.tempCtx.lineWidth = lineWidth
    
    // Вертикальные
    for (let x = 0; x < this.width; x += spacing) {
      this.tempCtx.beginPath()
      this.tempCtx.moveTo(x, 0)
      this.tempCtx.lineTo(x, this.height)
      this.tempCtx.stroke()
    }
    
    // Горизонтальные
    for (let y = 0; y < this.height; y += spacing) {
      this.tempCtx.beginPath()
      this.tempCtx.moveTo(0, y)
      this.tempCtx.lineTo(this.width, y)
      this.tempCtx.stroke()
    }
  }

  renderStripes(stripeWidth, spacing, angle = 0) {
    this.tempCtx.save()
    this.tempCtx.translate(this.width / 2, this.height / 2)
    this.tempCtx.rotate((angle * Math.PI) / 180)
    
    const diagonal = Math.sqrt(this.width ** 2 + this.height ** 2)
    
    for (let i = -diagonal; i < diagonal; i += spacing) {
      this.tempCtx.fillRect(i, -diagonal, stripeWidth, diagonal * 2)
    }
    
    this.tempCtx.restore()
  }

  renderChecker(size) {
    for (let y = 0; y < this.height; y += size) {
      for (let x = 0; x < this.width; x += size) {
        if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) {
          this.tempCtx.fillRect(x, y, size, size)
        }
      }
    }
  }

  /**
   * Рендер градиента
   */
  renderGradient(layer) {
    const gradient = this.tempCtx.createLinearGradient(
      0, 0,
      this.width, this.height
    )
    gradient.addColorStop(0, layer.color)
    gradient.addColorStop(1, layer.colorEnd || 'transparent')
    
    this.tempCtx.fillStyle = gradient
    this.tempCtx.fillRect(0, 0, this.width, this.height)
  }

  /**
   * Парсинг цвета в RGB(A)
   */
  parseColor(colorString) {
    // Временный canvas для парсинга
    const ctx = this.tempCtx
    ctx.fillStyle = colorString
    ctx.fillRect(0, 0, 1, 1)
    const data = ctx.getImageData(0, 0, 1, 1).data
    ctx.clearRect(0, 0, 1, 1)
    
    return {
      r: data[0],
      g: data[1],
      b: data[2],
      a: data[3] / 255
    }
  }

  /**
   * Получить data URL картинки
   */
  toDataURL(type = 'image/png') {
    return this.canvas.toDataURL(type)
  }

  /**
   * Получить ImageData
   */
  getImageData() {
    return this.ctx.getImageData(0, 0, this.width, this.height)
  }

  /**
   * Изменить размер
   */
  resize(width, height) {
    this.width = width
    this.height = height
    this.canvas.width = width
    this.canvas.height = height
    this.tempCanvas.width = width
    this.tempCanvas.height = height
  }
}

/**
 * Кэш отрендеренных террейнов
 * Ключ = hash от конфигурации слоёв, значение = dataURL
 */
const renderCache = new Map()
const MAX_CACHE_SIZE = 100

/**
 * Создать уникальный ключ для конфигурации
 */
function createCacheKey(layers, options) {
  return JSON.stringify({ layers, options })
}

/**
 * Рендерить террейн с кэшированием
 */
export function renderTerrainCached(layers, options = {}, renderer = null) {
  const key = createCacheKey(layers, options)
  
  if (renderCache.has(key)) {
    return renderCache.get(key)
  }
  
  // Создаём renderer если не передан
  const r = renderer || new TerrainLayerRenderer(options.width || 128, options.height || 128)
  const canvas = r.render(layers, options)
  const dataURL = canvas.toDataURL()
  
  // Добавляем в кэш
  if (renderCache.size >= MAX_CACHE_SIZE) {
    // Удаляем первый (самый старый)
    const firstKey = renderCache.keys().next().value
    renderCache.delete(firstKey)
  }
  renderCache.set(key, dataURL)
  
  return dataURL
}

/**
 * Очистить кэш
 */
export function clearRenderCache() {
  renderCache.clear()
}

/**
 * Пресеты слоёв для быстрого создания
 */
export const LayerPresets = {
  // Базовые природные
  grass: () => [
    createLayer({ type: 'solid', color: '#4a7c23' }),
    createLayer({ type: 'noise', color: '#2d5a1a', noiseScale: 0.08, opacity: 0.4 }),
    createLayer({ type: 'noise', color: '#6b9c3a', noiseScale: 0.15, opacity: 0.3, noiseType: 'simplex' })
  ],
  
  dirt: () => [
    createLayer({ type: 'solid', color: '#8b6b4a' }),
    createLayer({ type: 'noise', color: '#6b4a2a', noiseScale: 0.12, opacity: 0.5 }),
    createLayer({ type: 'noise', color: '#4a3520', noiseScale: 0.2, opacity: 0.2 })
  ],
  
  sand: () => [
    createLayer({ type: 'solid', color: '#e8d5a3' }),
    createLayer({ type: 'noise', color: '#d4c090', noiseScale: 0.05, opacity: 0.3, noiseType: 'simplex' }),
    createLayer({ type: 'pattern', color: '#c9b580', patternType: 'dots', patternSize: 1, patternSpacing: 3, opacity: 0.2 })
  ],
  
  water: () => [
    createLayer({ type: 'solid', color: '#2878a8' }),
    createLayer({ type: 'noise', color: '#1a5a8a', noiseScale: 0.1, opacity: 0.4, noiseType: 'simplex' }),
    createLayer({ type: 'noise', color: '#4a98c8', noiseScale: 0.06, opacity: 0.3 })
  ],
  
  stone: () => [
    createLayer({ type: 'solid', color: '#6a6a6a' }),
    createLayer({ type: 'noise', color: '#4a4a4a', noiseScale: 0.15, opacity: 0.5, noiseContrast: 1.3 }),
    createLayer({ type: 'noise', color: '#8a8a8a', noiseScale: 0.3, opacity: 0.2 })
  ],
  
  snow: () => [
    createLayer({ type: 'solid', color: '#f0f5ff' }),
    createLayer({ type: 'noise', color: '#d8e8ff', noiseScale: 0.1, opacity: 0.3, noiseType: 'simplex' }),
    createLayer({ type: 'pattern', color: '#c0d8f0', patternType: 'dots', patternSize: 1, patternSpacing: 6, opacity: 0.15 })
  ],
  
  // Полы
  woodFloor: () => [
    createLayer({ type: 'solid', color: '#8b6b4a' }),
    createLayer({ type: 'pattern', color: '#6b4a30', patternType: 'lines', patternSpacing: 12, patternAngle: 90, opacity: 0.4 }),
    createLayer({ type: 'noise', color: '#5a3a20', noiseScale: 0.02, opacity: 0.2 })
  ],
  
  stoneTiles: () => [
    createLayer({ type: 'solid', color: '#7a7a7a' }),
    createLayer({ type: 'pattern', color: '#5a5a5a', patternType: 'grid', patternSpacing: 20, patternSize: 1, opacity: 0.6 }),
    createLayer({ type: 'noise', color: '#4a4a4a', noiseScale: 0.2, opacity: 0.3 })
  ]
}
