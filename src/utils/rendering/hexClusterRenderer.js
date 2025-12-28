/**
 * HexClusterRenderer - Рендеринг кластера гексов
 * 
 * АРХИТЕКТУРА:
 * 1. Группируем гексы по типу террейна → получаем "пятна" (patches)
 * 2. Для каждого пятна строим внешний контур (объединённая фигура)
 * 3. Границы между пятнами разных типов — кривые с деформациями
 * 4. Рисуем пятна в порядке elevation (нижние первыми)
 * 5. Верхние пятна "наползают" на нижние благодаря деформированным границам
 */

import { PerlinNoise } from './noise.js'
import { applyEffectsPipeline, EFFECTS } from './boundaryEffects.js'

const noise = new PerlinNoise(42)

// Категории эффектов, которые являются маск-эффектами (влияют на прозрачность)
const MASK_EFFECT_TYPES = ['alphaBlur', 'scatter', 'noiseBlend', 'stroke', 'glow', 'shadow']

// Визуальные эффекты (рисуются поверх патча)
const VISUAL_EFFECT_TYPES = ['glow', 'shadow', 'stroke']

/**
 * Извлечь маск-эффекты из pipeline
 * @param {Array} effects - массив эффектов
 * @returns {Array} - только маск-эффекты с их параметрами
 */
function extractMaskEffects(effects) {
  if (!effects || effects.length === 0) return []
  return effects.filter(e => MASK_EFFECT_TYPES.includes(e.type) && e.enabled !== false)
}

/**
 * Вычислить общую ширину fade для маск-эффектов
 */
function getMaskFadeWidth(maskEffects) {
  if (!maskEffects || maskEffects.length === 0) return 0
  
  let maxWidth = 0
  for (const effect of maskEffects) {
    const params = effect.params || {}
    const width = params.width ?? EFFECTS[effect.type]?.defaults?.width ?? 0
    maxWidth = Math.max(maxWidth, width)
  }
  return maxWidth
}

// Приоритеты высот
const ELEVATION_PRIORITY = {
  'submerged': 0,
  'low': 1,
  'flat': 2,
  'elevated': 3,
  'high': 4,
  'cliff': 5
}

export function getElevationPriority(terrain) {
  if (!terrain?.categoryTags?.elevation) return 2
  return ELEVATION_PRIORITY[terrain.categoryTags.elevation] ?? 2
}

/**
 * Вершины flat-top гексагона (начиная с -60°)
 */
export function getHexVertices(cx, cy, radius) {
  const vertices = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 3
    vertices.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
    })
  }
  return vertices
}

export function getHexPath(cx, cy, radius) {
  const vertices = getHexVertices(cx, cy, radius)
  const path = new Path2D()
  path.moveTo(vertices[0].x, vertices[0].y)
  for (let i = 1; i < 6; i++) {
    path.lineTo(vertices[i].x, vertices[i].y)
  }
  path.closePath()
  return path
}

/**
 * Смещения соседей для flat-top гексов
 */
export function getNeighborOffsets(radius) {
  const h = radius * Math.sqrt(3)
  return [
    { dx: radius * 1.5, dy: -h / 2 },   // 0: СВ
    { dx: radius * 1.5, dy: h / 2 },    // 1: ЮВ
    { dx: 0, dy: h },                    // 2: Ю
    { dx: -radius * 1.5, dy: h / 2 },   // 3: ЮЗ
    { dx: -radius * 1.5, dy: -h / 2 },  // 4: СЗ
    { dx: 0, dy: -h }                    // 5: С
  ]
}

/**
 * Получить ключ для группировки террейнов
 * Приоритет: id террейна, иначе surface категория
 */
function getTerrainKey(terrain) {
  if (!terrain) return null
  // Используем id если есть, иначе surface
  if (terrain.id) return `id:${terrain.id}`
  if (terrain.categoryTags?.surface) return `surface:${terrain.categoryTags.surface}`
  return 'unknown'
}

/**
 * Проверить, одинаковые ли террейны
 */
function isSameTerrain(t1, t2) {
  if (!t1 || !t2) return false
  return getTerrainKey(t1) === getTerrainKey(t2)
}

/**
 * Применить деформацию к линии
 */
function deformLine(points, style, params = {}) {
  if (!style || style === 'sharp') return points
  
  const result = []
  
  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    
    // Вычисляем нормаль
    let nx = 0, ny = 0
    if (points.length > 1) {
      let prev = points[Math.max(0, i - 1)]
      let next = points[Math.min(points.length - 1, i + 1)]
      const dx = next.x - prev.x
      const dy = next.y - prev.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      nx = -dy / len
      ny = dx / len
    }
    
    let offset = 0
    
    switch (style) {
      case 'smooth-wave': {
        const amplitude = params.amplitude ?? 8
        const frequency = params.frequency ?? 0.12
        offset = noise.noise2D(point.x * frequency, point.y * frequency) * amplitude
        break
      }
      
      case 'jagged': {
        const amplitude = params.amplitude ?? 10
        const frequency = params.frequency ?? 0.18
        const sharpness = params.sharpness ?? 0.4
        let n = noise.noise2D(point.x * frequency, point.y * frequency)
        n = Math.sign(n) * Math.pow(Math.abs(n), sharpness)
        offset = n * amplitude
        break
      }
      
      case 'noise': {
        const amplitude = params.amplitude ?? 6
        const noiseScale = params.noiseScale ?? 0.1
        offset = noise.noise2D(point.x * noiseScale, point.y * noiseScale) * amplitude
        break
      }
      
      case 'blend':
      case 'gradient': {
        offset = params.offset ?? 0
        break
      }
      
      case 'sawtooth': {
        // Зубчатая граница — пилообразная волна
        const amplitude = params.amplitude ?? 8
        const frequency = params.frequency ?? 0.15
        const t = (point.x + point.y) * frequency
        // Пилообразная функция: от -1 до 1
        offset = ((t % 1) * 2 - 1) * amplitude
        break
      }
      
      case 'steps': {
        // Ступенчатая граница — квадратная волна
        const amplitude = params.amplitude ?? 6
        const frequency = params.frequency ?? 0.1
        const t = (point.x + point.y) * frequency
        // Квадратная волна: чередование -1 и 1
        offset = (Math.floor(t) % 2 === 0 ? 1 : -1) * amplitude
        break
      }
      
      case 'dither': {
        // Дизеринг — случайные точки
        const amplitude = params.amplitude ?? 4
        const density = params.density ?? 0.5
        // Псевдослучайное значение на основе позиции
        const hash = Math.sin(point.x * 12.9898 + point.y * 78.233) * 43758.5453
        const rand = hash - Math.floor(hash)
        offset = rand < density ? amplitude : -amplitude
        break
      }
    }
    
    result.push({
      x: point.x + nx * offset,
      y: point.y + ny * offset
    })
  }
  
  return result
}

/**
 * Обработать сегмент границы через pipeline эффектов
 * 
 * @param {Array} vertices - исходные вершины сегмента
 * @param {Object} transition - правило перехода с массивом effects
 * @returns {Array} - обработанные точки
 */
function processBoundarySegment(vertices, transition = {}) {
  if (vertices.length < 2) return vertices
  
  // Если есть эффекты — применяем pipeline
  if (transition.effects && transition.effects.length > 0) {
    return applyEffectsPipeline(vertices, transition.effects)
  }
  
  // Нет эффектов — просто интерполируем для гладкости
  let result = []
  for (let i = 0; i < vertices.length - 1; i++) {
    const linePoints = interpolateLine(vertices[i], vertices[i + 1], 4)
    if (i === 0) {
      result = result.concat(linePoints)
    } else {
      result = result.concat(linePoints.slice(1))
    }
  }
  return result
}

/**
 * Интерполировать линию (добавить промежуточные точки)
 */
function interpolateLine(start, end, segments = 12) {
  const points = []
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    points.push({
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t
    })
  }
  return points
}

/**
 * Сглаживание линии алгоритмом Chaikin (corner cutting)
 * @param points - массив точек [{x, y}, ...]
 * @param iterations - количество итераций сглаживания (больше = глаже)
 * @param preserveEnds - сохранять ли крайние точки (false = скруглять и их)
 */
function smoothLineChaikin(points, iterations = 2, preserveEnds = false) {
  if (points.length < 3) return points
  
  let result = [...points]
  
  for (let iter = 0; iter < iterations; iter++) {
    const newPoints = []
    
    // Если сохраняем концы — добавляем первую точку
    if (preserveEnds) {
      newPoints.push(result[0])
    }
    
    for (let i = 0; i < result.length - 1; i++) {
      const p0 = result[i]
      const p1 = result[i + 1]
      
      // Chaikin делит каждый сегмент на 2 точки в соотношении 1:4 и 3:4
      newPoints.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        y: p0.y * 0.75 + p1.y * 0.25
      })
      
      newPoints.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        y: p0.y * 0.25 + p1.y * 0.75
      })
    }
    
    // Если сохраняем концы — добавляем последнюю точку
    if (preserveEnds) {
      newPoints.push(result[result.length - 1])
    }
    
    result = newPoints
  }
  
  return result
}

/**
 * Сглаживание с движением опорных точек к "идеальной" линии
 * Используется когда нужно сильно выпрямить границу
 * @param points - массив точек
 * @param straightness - степень выпрямления 0-1 (1 = почти прямая линия)
 */
function straightenLine(points, straightness = 0) {
  if (points.length < 3 || straightness <= 0) return points
  
  // Новый подход: усреднение позиций (Laplacian smoothing)
  // Каждая внутренняя точка двигается к середине между соседями
  // Это работает и для выпуклых, и для вогнутых участков
  
  const iterations = Math.ceil(straightness * 5) // Больше straightness = больше итераций
  const factor = Math.min(straightness, 0.8) // Сила сдвига за итерацию
  
  let result = [...points]
  
  for (let iter = 0; iter < iterations; iter++) {
    const newPoints = [result[0]] // Первую точку сохраняем
    
    for (let i = 1; i < result.length - 1; i++) {
      const prev = result[i - 1]
      const curr = result[i]
      const next = result[i + 1]
      
      // Середина между соседями
      const midX = (prev.x + next.x) / 2
      const midY = (prev.y + next.y) / 2
      
      // Двигаем текущую точку к середине
      newPoints.push({
        x: curr.x + (midX - curr.x) * factor,
        y: curr.y + (midY - curr.y) * factor
      })
    }
    
    newPoints.push(result[result.length - 1]) // Последнюю точку сохраняем
    result = newPoints
  }
  
  return result
}

/**
 * Сглаживание границы (открытой полилинии)
 * @param points - массив точек
 * @param smoothness - степень сглаживания 0-1
 * @param mode - режим: 'chaikin' (скругление) или 'laplacian' (спрямление)
 */
function smoothBoundaryLine(points, smoothness = 0.5, mode = 'chaikin') {
  if (points.length < 3 || smoothness <= 0) return points
  
  if (mode === 'chaikin') {
    // Chaikin: скругляет углы, создаёт плавные кривые
    // smoothness 0-1 → 1-4 итерации
    const iterations = Math.ceil(smoothness * 4)
    // Сохраняем концы чтобы сегменты стыковались
    return smoothLineChaikin(points, iterations, true)
  } else {
    // Laplacian: спрямляет линию, убирая изломы
    return straightenLine(points, smoothness)
  }
}

/**
 * Сглаживание замкнутого контура (все углы скругляются)
 * @param points - массив точек замкнутого контура
 * @param smoothness - степень сглаживания 0-1
 * @param mode - режим: 'chaikin' или 'laplacian'
 */
function smoothClosedContour(points, smoothness = 0.5, mode = 'chaikin') {
  if (points.length < 4 || smoothness <= 0) return points
  
  if (mode === 'chaikin') {
    // Chaikin для замкнутого контура — не сохраняем концы
    const iterations = Math.ceil(smoothness * 3)
    return smoothLineChaikinClosed(points, iterations)
  } else {
    // Laplacian для замкнутого контура
    return straightenLineClosed(points, smoothness)
  }
}

/**
 * Chaikin для замкнутого контура
 */
function smoothLineChaikinClosed(points, iterations = 2) {
  if (points.length < 3) return points
  
  let result = [...points]
  
  for (let iter = 0; iter < iterations; iter++) {
    const newPoints = []
    
    for (let i = 0; i < result.length; i++) {
      const p0 = result[i]
      const p1 = result[(i + 1) % result.length]
      
      // Chaikin делит каждый сегмент на 2 точки
      newPoints.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        y: p0.y * 0.75 + p1.y * 0.25
      })
      
      newPoints.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        y: p0.y * 0.25 + p1.y * 0.75
      })
    }
    
    result = newPoints
  }
  
  return result
}

/**
 * Laplacian smoothing для замкнутого контура
 */
function straightenLineClosed(points, straightness = 0.5) {
  if (points.length < 4 || straightness <= 0) return points
  
  const iterations = Math.ceil(straightness * 5)
  const factor = Math.min(straightness, 0.8)
  
  let result = [...points]
  
  for (let iter = 0; iter < iterations; iter++) {
    const newPoints = []
    
    for (let i = 0; i < result.length; i++) {
      const prev = result[(i - 1 + result.length) % result.length]
      const curr = result[i]
      const next = result[(i + 1) % result.length]
      
      // Середина между соседями
      const midX = (prev.x + next.x) / 2
      const midY = (prev.y + next.y) / 2
      
      // Двигаем к середине
      newPoints.push({
        x: curr.x + (midX - curr.x) * factor,
        y: curr.y + (midY - curr.y) * factor
      })
    }
    
    result = newPoints
  }
  
  return result
}

/**
 * Главный класс рендерера
 */
export class HexClusterRenderer {
  constructor(width, height) {
    this.width = width
    this.height = height
    this.offscreenCanvas = null
    this.offscreenCtx = null
    // Глобальные настройки освещения для теней
    this.lightingSettings = {
      angle: 135,   // угол в градусах (0 = вправо, 90 = вниз)
      length: 5,    // базовая длина тени в пикселях
      enabled: true // включено ли освещение
    }
    // Пул временных canvas'ов для переиспользования
    this._canvasPool = []
    this._poolIndex = 0
  }
  
  /**
   * Получить временный canvas из пула (или создать новый)
   */
  _getPooledCanvas(width, height) {
    // Ищем подходящий canvas в пуле
    for (let i = this._poolIndex; i < this._canvasPool.length; i++) {
      const c = this._canvasPool[i]
      if (c.width >= width && c.height >= height) {
        this._poolIndex = i + 1
        // Очищаем перед использованием
        const ctx = c.getContext('2d')
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.clearRect(0, 0, c.width, c.height)
        return c
      }
    }
    // Создаём новый canvas
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(width, 256) // Минимальный размер для переиспользования
    canvas.height = Math.max(height, 256)
    this._canvasPool.push(canvas)
    this._poolIndex = this._canvasPool.length
    return canvas
  }
  
  /**
   * Сбросить индекс пула (вызывать в начале каждого рендера)
   */
  _resetPool() {
    this._poolIndex = 0
  }
  
  /**
   * Установить настройки освещения
   */
  setLightingSettings(settings) {
    if (settings) {
      this.lightingSettings = { ...this.lightingSettings, ...settings }
    }
  }
  
  initOffscreen() {
    if (!this.offscreenCanvas || this.offscreenCanvas.width !== this.width) {
      this.offscreenCanvas = document.createElement('canvas')
      this.offscreenCanvas.width = this.width
      this.offscreenCanvas.height = this.height
      this.offscreenCtx = this.offscreenCanvas.getContext('2d')
    }
  }
  
  /**
   * Группируем гексы по типу террейна → получаем "пятна" (patches)
   */
  groupHexesIntoPatches(hexes) {
    const groups = new Map()
    
    for (const hex of hexes) {
      const key = getTerrainKey(hex.terrain)
      if (!key) continue
      
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          terrain: hex.terrain,
          elevation: hex.elevation,
          fill: hex.fill,
          hexes: []
        })
      }
      
      groups.get(key).hexes.push(hex)
    }
    
    return Array.from(groups.values())
  }
  
  /**
   * Отрендерить кластер
   */
  render(ctx, options) {
    const {
      centerTerrain,
      neighbors,
      transitions = [],
      cx, cy,
      radius,
      getFill,
      showGrid = true
    } = options
    
    // Сбрасываем пул canvas'ов для этого рендера
    this._resetPool()
    
    const offsets = getNeighborOffsets(radius)
    
    // Собираем все гексы с позициями
    const hexes = []
    
    if (centerTerrain) {
      hexes.push({
        index: 6,
        cx, cy,
        terrain: centerTerrain,
        fill: getFill(centerTerrain),
        elevation: getElevationPriority(centerTerrain),
        radius
      })
    }
    
    for (let i = 0; i < 6; i++) {
      const neighbor = neighbors[i]
      if (!neighbor) continue
      
      const { dx, dy } = offsets[i]
      hexes.push({
        index: i,
        cx: cx + dx,
        cy: cy + dy,
        terrain: neighbor,
        fill: getFill(neighbor),
        elevation: getElevationPriority(neighbor),
        radius
      })
    }
    
    // Группируем гексы по типу террейна
    const patches = this.groupHexesIntoPatches(hexes)
    
    // Сортируем пятна по elevation (нижние первыми)
    patches.sort((a, b) => a.elevation - b.elevation)
    
    // Находим все границы между гексами разных типов
    const boundaries = this.findAllBoundaries(hexes, transitions)
    
    // ОДИН ПРОХОД: рисуем патчи от низких к высоким
    for (let patchIdx = 0; patchIdx < patches.length; patchIdx++) {
      const patch = patches[patchIdx]
      
      // 1. Находим верхние гексы, граничащие с этим патчем (подкладка)
      // и ДОБАВЛЯЕМ их в патч как полноправные гексы
      for (const boundary of boundaries) {
        if (patch.hexes.some(h => h.index === boundary.lowerHex.index)) {
          // Этот патч нижний — добавляем верхний гекс в патч
          if (!patch.hexes.find(h => h.index === boundary.upperHex.index)) {
            patch.hexes.push(boundary.upperHex)
          }
        }
      }
      
      // 2. Теперь ищем ВСЕ границы для расширенного патча (включая подкладочные гексы)
      // Граница = где гекс патча соседствует с гексом ДРУГОГО патча
      const patchBoundaries = []
      for (const hex of patch.hexes) {
        for (const boundary of boundaries) {
          // Этот гекс — верхний в границе
          if (boundary.upperHex.index === hex.index) {
            // Проверяем что нижний гекс НЕ в этом патче (т.е. это граница патча)
            if (!patch.hexes.find(h => h.index === boundary.lowerHex.index)) {
              patchBoundaries.push(boundary)
            }
          }
        }
      }
      
      // 3. Рисуем патч
      if (patchBoundaries.length > 0) {
        // Есть деформированные границы
        const { path, fadeSegments } = this.buildPatchOutlineWithFade(patch, patchBoundaries, radius)
        const hasFade = fadeSegments.some(s => s.fadeWidth > 0)
        
        if (hasFade) {
          this.drawPatchWithFade(ctx, path, patch.fill, fadeSegments)
        } else {
          ctx.save()
          ctx.fillStyle = patch.fill
          ctx.fill(path, 'nonzero')
          ctx.restore()
        }
      } else {
        // Нет деформированных границ — просто гексы патча
        const simplePath = this.buildExtendedPatchOutline(patch, [], radius)
        ctx.save()
        ctx.fillStyle = patch.fill
        ctx.fill(simplePath, 'nonzero')
        ctx.restore()
      }
    }
    
    // Сетка
    if (showGrid) {
      this.drawGrid(ctx, cx, cy, radius, offsets, neighbors)
    }
  }
  
  /**
   * Расширенный рендер для произвольного набора гексов (не только 7)
   * Используется для больших кластеров и тестирования
   */
  renderExtended(ctx, options) {
    const PROFILE = false // Включить профилирование
    const timings = PROFILE ? {} : null
    const startTotal = PROFILE ? performance.now() : 0
    
    const {
      hexes,
      getTransitionForPair = null, // Функция (fromTerrain, toTerrain) => transition
      radius,
      getFill,
      showGrid = true,
      transform = null // { x, y, zoom } - camera transform для корректной работы масок
    } = options
    
    // Сохраняем transform для использования в drawPatchWithFade
    this._currentTransform = transform
    
    // Сбрасываем пул canvas'ов для этого рендера
    this._resetPool()
    
    if (!hexes || hexes.length === 0) return
    
    // Группируем гексы по типу террейна
    let t0 = PROFILE ? performance.now() : 0
    const patches = this.groupHexesIntoPatches(hexes)
    if (PROFILE) timings.groupPatches = performance.now() - t0
    
    // Сортируем пятна по elevation (нижние первыми)
    patches.sort((a, b) => a.elevation - b.elevation)
    
    // Находим все границы между гексами разных типов
    t0 = PROFILE ? performance.now() : 0
    const boundaries = this.findAllBoundariesExtended(hexes, getTransitionForPair, radius)
    if (PROFILE) timings.findBoundaries = performance.now() - t0
    
    // Счётчики для профилирования
    let patchesWithFade = 0
    let patchesSimple = 0
    let totalFadeSegments = 0
    let buildOutlineTime = 0
    let drawPatchTime = 0
    
    // ОДИН ПРОХОД: рисуем патчи от низких к высоким
    for (let patchIdx = 0; patchIdx < patches.length; patchIdx++) {
      const patch = patches[patchIdx]
      
      // 1. Находим верхние гексы, граничащие с этим патчем (подкладка)
      // и ДОБАВЛЯЕМ их в патч как полноправные гексы
      for (const boundary of boundaries) {
        if (patch.hexes.some(h => h.index === boundary.lowerHex.index)) {
          // Этот патч нижний — добавляем верхний гекс в патч
          if (!patch.hexes.find(h => h.index === boundary.upperHex.index)) {
            patch.hexes.push(boundary.upperHex)
          }
        }
      }
      
      // 2. Теперь ищем ВСЕ границы для расширенного патча (включая подкладочные гексы)
      // Граница = где гекс патча соседствует с гексом ДРУГОГО патча, который уже нарисован (ниже по elevation)
      const patchBoundaries = []
      for (const hex of patch.hexes) {
        for (const boundary of boundaries) {
          // Этот гекс — верхний в границе
          if (boundary.upperHex.index === hex.index) {
            // Проверяем что нижний гекс НЕ в этом патче (т.е. это граница патча)
            if (!patch.hexes.find(h => h.index === boundary.lowerHex.index)) {
              patchBoundaries.push(boundary)
            }
          }
        }
      }
      
      // 3. Рисуем патч
      if (patchBoundaries.length > 0) {
        // Есть деформированные границы
        let t1 = PROFILE ? performance.now() : 0
        const { path, fadeSegments } = this.buildPatchOutlineWithFade(patch, patchBoundaries, radius)
        if (PROFILE) buildOutlineTime += performance.now() - t1
        
        const hasFade = fadeSegments.some(s => s.fadeWidth > 0)
        
        if (hasFade) {
          patchesWithFade++
          totalFadeSegments += fadeSegments.filter(s => s.fadeWidth > 0).length
          t1 = PROFILE ? performance.now() : 0
          this.drawPatchWithFade(ctx, path, patch.fill, fadeSegments)
          if (PROFILE) drawPatchTime += performance.now() - t1
        } else {
          patchesSimple++
          ctx.save()
          ctx.fillStyle = patch.fill
          ctx.fill(path, 'nonzero')
          ctx.restore()
        }
      } else {
        patchesSimple++
        // Нет деформированных границ — просто гексы патча
        const simplePath = this.buildExtendedPatchOutline(patch, [], radius)
        ctx.save()
        ctx.fillStyle = patch.fill
        ctx.fill(simplePath, 'nonzero')
        ctx.restore()
      }
    }
    
    // Сетка
    if (showGrid) {
      this.drawGridExtended(ctx, hexes, radius)
    }
    
    // Выводим профилирование
    if (PROFILE) {
      const totalTime = performance.now() - startTotal
      console.log(`[HexClusterRenderer] renderExtended: ${totalTime.toFixed(1)}ms total`)
      console.log(`  - hexes: ${hexes.length}, patches: ${patches.length}, boundaries: ${boundaries.length}`)
      console.log(`  - groupPatches: ${timings.groupPatches?.toFixed(1)}ms`)
      console.log(`  - findBoundaries: ${timings.findBoundaries?.toFixed(1)}ms`)
      console.log(`  - buildOutline: ${buildOutlineTime.toFixed(1)}ms`)
      console.log(`  - drawPatchWithFade: ${drawPatchTime.toFixed(1)}ms (${patchesWithFade} patches, ${totalFadeSegments} fade segments)`)
      console.log(`  - simple patches: ${patchesSimple}`)
      console.log(`  - canvas pool size: ${this._canvasPool.length}`)
    }
  }
  
  /**
   * Найти все границы между разными террейнами для расширенного режима
   */
  findAllBoundariesExtended(hexes, getTransitionForPair, radius) {
    const boundaries = []
    
    // Создаём lookup по q,r координатам
    const hexMap = new Map()
    for (const hex of hexes) {
      if (hex.q !== undefined && hex.r !== undefined) {
        hexMap.set(`${hex.q},${hex.r}`, hex)
      }
    }
    
    // Смещения соседей в axial координатах для flat-top гексов
    // Порядок соответствует рёбрам (edge index) и направлениям из getNeighborOffsets:
    // Edge 0 → NE, Edge 1 → SE, Edge 2 → S, Edge 3 → SW, Edge 4 → NW, Edge 5 → N
    const neighborOffsets = [
      { dq: 1, dr: -1 },  // NE (edge 0) - shares edge 0 with neighbor at q+1,r-1
      { dq: 1, dr: 0 },   // SE (edge 1) - shares edge 1 with neighbor at q+1,r
      { dq: 0, dr: 1 },   // S  (edge 2) - shares edge 2 with neighbor at q,r+1
      { dq: -1, dr: 1 },  // SW (edge 3) - shares edge 3 with neighbor at q-1,r+1
      { dq: -1, dr: 0 },  // NW (edge 4) - shares edge 4 with neighbor at q-1,r
      { dq: 0, dr: -1 }   // N  (edge 5) - shares edge 5 with neighbor at q,r-1
    ]
    
    // Для каждого гекса проверяем соседей
    for (const hex of hexes) {
      if (hex.q === undefined || hex.r === undefined) continue
      
      for (let edgeIdx = 0; edgeIdx < 6; edgeIdx++) {
        const offset = neighborOffsets[edgeIdx]
        const neighborKey = `${hex.q + offset.dq},${hex.r + offset.dr}`
        const neighbor = hexMap.get(neighborKey)
        
        if (!neighbor) continue
        
        // Проверяем что это разные террейны
        const hexKey = getTerrainKey(hex.terrain)
        const neighborKey2 = getTerrainKey(neighbor.terrain)
        
        if (hexKey === neighborKey2) continue
        
        // Определяем верхний и нижний по elevation
        const hexElevation = hex.elevation ?? 2
        const neighborElevation = neighbor.elevation ?? 2
        
        // Получаем правило перехода для определения zPriority
        let isHexUpper = hexElevation > neighborElevation
        
        if (hexElevation === neighborElevation) {
          // При равном elevation — смотрим zPriority из правила
          let zPriority = 'auto'
          if (getTransitionForPair) {
            const rule = getTransitionForPair(hex.terrain, neighbor.terrain)
            zPriority = rule?.zPriority || 'auto'
          }
          
          if (zPriority === 'from') {
            isHexUpper = hexKey > neighborKey2
          } else if (zPriority === 'to') {
            isHexUpper = hexKey < neighborKey2
          } else {
            // 'auto' — используем лексикографическое сравнение для консистентности
            isHexUpper = hexKey > neighborKey2
          }
        }
        
        // Добавляем границу только с верхней стороны (чтобы не дублировать)
        if (!isHexUpper) continue
        
        // Получаем вершины ребра
        const vertices = getHexVertices(hex.cx, hex.cy, radius)
        const v1 = vertices[edgeIdx]
        const v2 = vertices[(edgeIdx + 1) % 6]
        
        // Ищем transition правило через функцию
        let transition = { effects: [] }
        
        if (getTransitionForPair) {
          const rule = getTransitionForPair(hex.terrain, neighbor.terrain)
          if (rule) {
            transition = rule
          }
        }
        
        boundaries.push({
          upperHex: hex,
          lowerHex: neighbor,
          edgeIdx,
          upperEdge: edgeIdx,
          lowerEdge: (edgeIdx + 3) % 6,
          v1, v2,
          transition
        })
      }
    }
    
    return boundaries
  }
  
  /**
   * Нарисовать сетку для расширенного режима
   */
  drawGridExtended(ctx, hexes, radius) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = 1
    
    for (const hex of hexes) {
      ctx.beginPath()
      const vertices = getHexVertices(hex.cx, hex.cy, radius)
      ctx.moveTo(vertices[0].x, vertices[0].y)
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y)
      }
      ctx.closePath()
      ctx.stroke()
    }
  }
  
  /**
   * Построить расширенный контур патча, включая смежные верхние гексы
   * Это нужно чтобы нижний террейн заполнял область под деформациями верхнего
   * 
   * Патчи рисуются в порядке elevation, поэтому более высокие патчи
   * автоматически перекроют более низкие в области "подкладки"
   */
  buildExtendedPatchOutline(patch, adjacentUpperHexes, radius) {
    const path = new Path2D()
    
    // Добавляем все гексы патча
    for (const hex of patch.hexes) {
      const vertices = getHexVertices(hex.cx, hex.cy, radius)
      path.moveTo(vertices[0].x, vertices[0].y)
      for (let i = 1; i < 6; i++) {
        path.lineTo(vertices[i].x, vertices[i].y)
      }
      path.closePath()
    }
    
    // Добавляем смежные верхние гексы целиком
    // Порядок elevation гарантирует правильное перекрытие
    for (const hex of adjacentUpperHexes) {
      const vertices = getHexVertices(hex.cx, hex.cy, radius)
      path.moveTo(vertices[0].x, vertices[0].y)
      for (let i = 1; i < 6; i++) {
        path.lineTo(vertices[i].x, vertices[i].y)
      }
      path.closePath()
    }
    
    return path
  }
  
  /**
   * Построить единый контур патча с деформированными внешними рёбрами
   * 
   * Новая логика сглаживания:
   * 1. Собираем все граничные рёбра в цепочки смежных рёбер
   * 2. Сглаживаем каждую цепочку вершин целиком
   * 3. Применяем деформацию к сглаженной линии
   */
  /**
   * Построить единый контур патча с учётом сглаживания границ между патчами
   * 
   * Новая архитектура:
   * 1. Собираем ВСЕ внешние рёбра патча (на границе с другими патчами или пустотой)
   * 2. Группируем рёбра в непрерывные сегменты по соседнему патчу
   * 3. Сглаживаем каждый сегмент целиком (через все гексы)
   * 4. Применяем деформацию к сглаженной полилинии
   */
  buildPatchOutline(patch, boundaries, radius) {
    // Шаг 1: Собираем все внешние рёбра патча
    // Внешнее ребро = ребро гекса, которое не делится с другим гексом этого же патча
    const patchHexIndices = new Set(patch.hexes.map(h => h.index))
    
    // Структура: { hex, edgeIdx, vertex1, vertex2, boundary, neighborPatchKey }
    const externalEdges = []
    
    for (const hex of patch.hexes) {
      const vertices = getHexVertices(hex.cx, hex.cy, radius)
      
      for (let edgeIdx = 0; edgeIdx < 6; edgeIdx++) {
        // Ищем границу где текущий гекс — upper
        let boundary = boundaries.find(b => 
          b.upperHex.index === hex.index && b.upperEdge === edgeIdx
        )
        
        // Также ищем границу где текущий гекс — lower
        if (!boundary) {
          boundary = boundaries.find(b => 
            b.lowerHex.index === hex.index && b.lowerEdge === edgeIdx
          )
        }
        
        // Если это граница — ребро внешнее
        // Также ребро внешнее если оно на краю кластера (нет соседа)
        const isExternalEdge = boundary || !this.hasNeighborInPatch(hex, edgeIdx, patch, radius)
        
        if (isExternalEdge) {
          // Определяем ключ соседнего патча
          let neighborPatchKey = 'edge'
          if (boundary) {
            const isCurrentUpper = boundary.upperHex.index === hex.index
            neighborPatchKey = isCurrentUpper 
              ? getTerrainKey(boundary.lowerHex.terrain)
              : getTerrainKey(boundary.upperHex.terrain)
          }
          
          externalEdges.push({
            hex,
            edgeIdx,
            v1: vertices[edgeIdx],
            v2: vertices[(edgeIdx + 1) % 6],
            boundary,
            neighborPatchKey
          })
        }
      }
    }
    
    // Шаг 2: Упорядочиваем рёбра в контуры (поддержка несвязанных патчей)
    const contours = this.orderEdgesIntoContours(externalEdges)
    
    const path = new Path2D()
    
    // Обрабатываем каждый контур отдельно
    for (const contourEdges of contours) {
      if (contourEdges.length === 0) continue
      
      // Шаг 3: Группируем последовательные рёбра с одинаковым соседом
      const segments = this.groupContourByNeighbor(contourEdges)
      
      // Шаг 4: Обрабатываем каждый сегмент отдельно, сохраняя концы для стыковки
      const processedSegments = []
      
      for (const segment of segments) {
        // Получаем transition из первого ребра с boundary
        const boundaryEdge = segment.edges.find(e => e.boundary)
        const transition = boundaryEdge?.boundary?.transition || { style: 'sharp', params: {} }
        const params = transition.params || {}

        // Собираем все вершины сегмента
        const segmentVertices = []
        for (const edge of segment.edges) {
          segmentVertices.push(edge.v1)
        }
        // Добавляем последнюю вершину
        segmentVertices.push(segment.edges[segment.edges.length - 1].v2)
        
        // Обрабатываем через pipeline эффектов
        const segmentPoints = processBoundarySegment(segmentVertices, transition)
        
        processedSegments.push({
          points: segmentPoints,
          hasBoundary: !!boundaryEdge,
          fadeWidth: params.fadeWidth ?? 0,
          softEdge: params.softEdge ?? false
        })
      }
      
      // Шаг 5: Собираем все точки в контур
      let contourPoints = []
      for (const segment of processedSegments) {
        if (contourPoints.length === 0) {
          contourPoints = contourPoints.concat(segment.points)
        } else {
          contourPoints = contourPoints.concat(segment.points.slice(1))
        }
      }
      
      // Добавляем контур в path
      if (contourPoints.length > 0) {
        path.moveTo(contourPoints[0].x, contourPoints[0].y)
        for (let i = 1; i < contourPoints.length; i++) {
          path.lineTo(contourPoints[i].x, contourPoints[i].y)
        }
        path.closePath()
      }
    }
    
    return path
  }
  
  /**
   * Построить контур патча с информацией о fade-сегментах
   * Поддерживает несвязанные патчи (множественные контуры)
   */
  buildPatchOutlineWithFade(patch, boundaries, radius) {
    // Шаг 1: Собираем все внешние рёбра патча
    const externalEdges = []
    
    for (const hex of patch.hexes) {
      const vertices = getHexVertices(hex.cx, hex.cy, radius)
      
      for (let edgeIdx = 0; edgeIdx < 6; edgeIdx++) {
        // Ищем границу где текущий гекс — upper
        let boundary = boundaries.find(b => 
          b.upperHex.index === hex.index && b.upperEdge === edgeIdx
        )
        
        // Также ищем границу где текущий гекс — lower
        if (!boundary) {
          boundary = boundaries.find(b => 
            b.lowerHex.index === hex.index && b.lowerEdge === edgeIdx
          )
        }
        
        const isExternalEdge = boundary || !this.hasNeighborInPatch(hex, edgeIdx, patch, radius)
        
        if (isExternalEdge) {
          // Определяем ключ соседнего патча
          let neighborPatchKey = 'edge'
          if (boundary) {
            // Если текущий гекс — upper, сосед — lower; и наоборот
            const isCurrentUpper = boundary.upperHex.index === hex.index
            neighborPatchKey = isCurrentUpper 
              ? getTerrainKey(boundary.lowerHex.terrain)
              : getTerrainKey(boundary.upperHex.terrain)
          }
          
          externalEdges.push({
            hex,
            edgeIdx,
            v1: vertices[edgeIdx],
            v2: vertices[(edgeIdx + 1) % 6],
            boundary,
            neighborPatchKey
          })
        }
      }
    }
    
    // Шаг 2: Упорядочиваем в отдельные контуры (поддержка несвязанных патчей)
    const contours = this.orderEdgesIntoContours(externalEdges)
    
    const path = new Path2D()
    const fadeSegments = []
    
    // Обрабатываем каждый контур отдельно
    for (const contourEdges of contours) {
      if (contourEdges.length === 0) continue
      
      // Группируем рёбра контура по соседнему патчу
      const segments = this.groupContourByNeighbor(contourEdges)
      
      // Обрабатываем сегменты
      const processedSegments = []
      
      for (const segment of segments) {
        const boundaryEdge = segment.edges.find(e => e.boundary)
        const transition = boundaryEdge?.boundary?.transition || { effects: [] }
        
        // Извлекаем маск-эффекты для определения fade
        const maskEffects = extractMaskEffects(transition.effects || [])
        const fadeWidth = getMaskFadeWidth(maskEffects)
        
        // Собираем вершины сегмента
        const segmentVertices = []
        for (const edge of segment.edges) {
          segmentVertices.push(edge.v1)
        }
        segmentVertices.push(segment.edges[segment.edges.length - 1].v2)
        
        // Обрабатываем через pipeline эффектов
        const segmentPoints = processBoundarySegment(segmentVertices, transition)
        
        processedSegments.push({ points: segmentPoints })
        
        // Сохраняем информацию о fade для этого сегмента
        if (fadeWidth > 0) {
          fadeSegments.push({
            points: segmentPoints,
            fadeWidth,
            maskEffects // Передаём маск-эффекты для продвинутого рендеринга
          })
        }
      }
      
      // Собираем точки контура
      let contourPoints = []
      for (const segment of processedSegments) {
        if (contourPoints.length === 0) {
          contourPoints = contourPoints.concat(segment.points)
        } else {
          contourPoints = contourPoints.concat(segment.points.slice(1))
        }
      }
      
      // Добавляем контур в path
      if (contourPoints.length > 0) {
        path.moveTo(contourPoints[0].x, contourPoints[0].y)
        for (let i = 1; i < contourPoints.length; i++) {
          path.lineTo(contourPoints[i].x, contourPoints[i].y)
        }
        path.closePath()
      }
    }
    
    return { path, fadeSegments }
  }
  
  /**
   * Нарисовать патч с маск-эффектами (alpha blur, scatter, noise blend, stroke)
   * 
   * Подход:
   * 1. Базовая маска: белая фигура на чёрном фоне (чёткие края)
   * 2. Для каждого fade-сегмента:
   *    - Создаём локальную маску с эффектом (blur, noise, etc.)
   *    - Заменяем соответствующую область в базовой маске
   * 3. Используем финальную маску как альфа-канал
   * 4. Рисуем обводку если есть stroke эффект
   * 5. Рисуем визуальные эффекты (glow, shadow)
   */
  drawPatchWithFade(ctx, path, fill, fadeSegments) {
    const PROFILE_DETAIL = false // Детальное профилирование (замедляет!)
    const dt = PROFILE_DETAIL ? {} : null
    const t0 = PROFILE_DETAIL ? performance.now() : 0
    
    // Проверяем наличие fade-сегментов
    const validFadeSegments = fadeSegments.filter(s => s.fadeWidth > 0 && s.points.length >= 2)
    
    if (validFadeSegments.length === 0) {
      ctx.fillStyle = fill
      ctx.fill(path, 'nonzero')
      return
    }
    
    // Собираем эффекты для отрисовки после
    const strokeEffects = []
    const glowEffects = []
    const shadowEffects = []
    
    // Получаем transform для корректной работы с world координатами
    const transform = this._currentTransform || { x: 0, y: 0, zoom: 1 }
    
    let t1 = PROFILE_DETAIL ? performance.now() : 0
    
    // === Шаг 1: Базовая маска — белая фигура на чёрном фоне ===
    const maskCanvas = this._getPooledCanvas(this.width, this.height)
    const maskCtx = maskCanvas.getContext('2d')
    
    // Применяем тот же transform что и основной контекст
    maskCtx.translate(transform.x, transform.y)
    maskCtx.scale(transform.zoom, transform.zoom)
    
    // Чёрный фон (рисуем в экранных координатах)
    maskCtx.save()
    maskCtx.setTransform(1, 0, 0, 1, 0, 0)
    maskCtx.fillStyle = 'black'
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height)
    maskCtx.restore()
    
    // Белая фигура
    maskCtx.fillStyle = 'white'
    maskCtx.fill(path, 'nonzero')
    
    // === Шаг 2: Для каждого fade-сегмента создаём размытую границу ===
    for (const segment of validFadeSegments) {
      const { points, fadeWidth, maskEffects = [] } = segment
      
      // Вычисляем максимальную ширину из всех маск-эффектов
      let maxEffectWidth = fadeWidth
      for (const effect of maskEffects) {
        const effectWidth = effect.params?.width ?? 0
        maxEffectWidth = Math.max(maxEffectWidth, effectWidth)
      }
      
      // Вычисляем bounding box сегмента в SCREEN координатах
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of points) {
        // Преобразуем world -> screen
        const screenX = transform.x + p.x * transform.zoom
        const screenY = transform.y + p.y * transform.zoom
        minX = Math.min(minX, screenX)
        minY = Math.min(minY, screenY)
        maxX = Math.max(maxX, screenX)
        maxY = Math.max(maxY, screenY)
      }
      // Расширяем на максимальную ширину эффекта + запас (в screen space)
      const margin = maxEffectWidth * 2.5 * transform.zoom
      minX = Math.max(0, minX - margin)
      minY = Math.max(0, minY - margin)
      maxX = Math.min(this.width, maxX + margin)
      maxY = Math.min(this.height, maxY + margin)
      
      const regionW = maxX - minX
      const regionH = maxY - minY
      // Минимальный размер региона для избежания ошибок canvas
      if (regionW < 1 || regionH < 1) continue
      
      // Округляем размеры до целых
      const safeWidth = Math.max(1, Math.ceil(regionW))
      const safeHeight = Math.max(1, Math.ceil(regionH))
      
      // --- Создаём базовую маску сегмента (в screen space) ---
      const segmentMask = this._getPooledCanvas(safeWidth, safeHeight)
      const segCtx = segmentMask.getContext('2d')
      
      segCtx.fillStyle = 'black'
      segCtx.fillRect(0, 0, segmentMask.width, segmentMask.height)
      // Смещаем на позицию региона, затем применяем camera transform
      segCtx.translate(-minX, -minY)
      segCtx.translate(transform.x, transform.y)
      segCtx.scale(transform.zoom, transform.zoom)
      segCtx.fillStyle = 'white'
      segCtx.fill(path, 'nonzero')
      segCtx.setTransform(1, 0, 0, 1, 0, 0)
      
      // --- Применяем маск-эффекты ---
      let processedMask = segmentMask
      
      for (const effect of maskEffects) {
        if (effect.type === 'stroke') {
          strokeEffects.push({ points, params: effect.params || {} })
          continue
        }
        if (effect.type === 'glow') {
          glowEffects.push({ points, params: effect.params || {} })
          continue
        }
        if (effect.type === 'shadow') {
          shadowEffects.push({ points, params: effect.params || {} })
          continue
        }
        
        processedMask = this.applyMaskEffect(processedMask, effect, points, fadeWidth, safeWidth, safeHeight)
      }
      
      // Если нет маск-эффектов, применяем стандартный blur
      if (maskEffects.length === 0 || maskEffects.every(e => ['stroke', 'glow', 'shadow'].includes(e.type))) {
        processedMask = this.applyAlphaBlur(processedMask, fadeWidth, safeWidth, safeHeight)
      }
      
      // --- Создаём маску области применения с учётом максимальной ширины эффекта ---
      const applyMask = this.createApplyMask(points, maxEffectWidth, safeWidth, safeHeight, minX, minY)
      
      // --- Комбинируем с основной маской ---
      maskCtx.save()
      maskCtx.globalCompositeOperation = 'destination-out'
      maskCtx.drawImage(applyMask, minX, minY)
      maskCtx.restore()
      
      const finalSegment = this._getPooledCanvas(safeWidth, safeHeight)
      const finalCtx = finalSegment.getContext('2d')
      
      finalCtx.drawImage(processedMask, 0, 0, safeWidth, safeHeight, 0, 0, safeWidth, safeHeight)
      finalCtx.globalCompositeOperation = 'destination-in'
      finalCtx.drawImage(applyMask, 0, 0)
      
      maskCtx.save()
      maskCtx.globalCompositeOperation = 'lighter'
      maskCtx.drawImage(finalSegment, minX, minY)
      maskCtx.restore()
    }
    
    // === Шаг 3: Конвертируем яркость маски в альфа-канал ===
    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
    const data = maskData.data
    for (let i = 0; i < data.length; i += 4) {
      const luminance = data[i]
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = luminance
    }
    maskCtx.putImageData(maskData, 0, 0)
    
    // === Шаг 4: Рисуем патч на offscreen с учётом transform ===
    const offscreen = this._getPooledCanvas(this.width, this.height)
    const offCtx = offscreen.getContext('2d')
    
    offCtx.translate(transform.x, transform.y)
    offCtx.scale(transform.zoom, transform.zoom)
    offCtx.fillStyle = fill
    offCtx.fill(path, 'nonzero')
    offCtx.setTransform(1, 0, 0, 1, 0, 0)
    
    // === Шаг 5: Применяем маску ===
    offCtx.globalCompositeOperation = 'destination-in'
    offCtx.drawImage(maskCanvas, 0, 0, maskCanvas.width, maskCanvas.height, 0, 0, offscreen.width, offscreen.height)
    offCtx.globalCompositeOperation = 'source-over'
    
    // === Шаг 6: Рисуем тени (до патча, чтобы были под ним) ===
    for (const shadow of shadowEffects) {
      this.drawShadow(ctx, shadow.points, shadow.params)
    }
    
    // === Шаг 7: Копируем патч на основной canvas (offscreen уже в screen space) ===
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(offscreen, 0, 0)
    ctx.restore()
    
    // === Шаг 8: Рисуем свечение (после патча, чтобы было поверх) ===
    for (const glow of glowEffects) {
      this.drawGlow(ctx, glow.points, glow.params)
    }
    
    // === Шаг 9: Рисуем обводки ===
    for (const stroke of strokeEffects) {
      this.drawStroke(ctx, stroke.points, stroke.params)
    }
  }
  
  /**
   * Применить маск-эффект к маске сегмента
   */
  applyMaskEffect(maskCanvas, effect, points, fadeWidth, width, height) {
    const params = effect.params || {}
    
    switch (effect.type) {
      case 'alphaBlur':
        return this.applyAlphaBlur(maskCanvas, params.width ?? fadeWidth, width, height, params)
      
      case 'scatter':
        return this.applyScatter(maskCanvas, points, params, width, height)
      
      case 'noiseBlend':
        return this.applyNoiseBlend(maskCanvas, points, params, width, height)
      
      default:
        return maskCanvas
    }
  }
  
  /**
   * Альфа-размытие с контролем непрозрачности
   * Использует CSS blur + пост-обработка для контроля диапазона
   */
  applyAlphaBlur(maskCanvas, blurWidth, width, height, params = {}) {
    // Поддержка старого API (string falloff)
    if (typeof params === 'string') {
      params = { falloff: params }
    }
    
    const falloff = params.falloff ?? 'linear'
    const opacityStart = (params.opacityStart ?? 100) / 100 // на границе
    const opacityEnd = (params.opacityEnd ?? 0) / 100 // на краю fade
    
    const result = this._getPooledCanvas(width, height)
    const ctx = result.getContext('2d')
    
    // Шаг 1: Применяем blur
    // Чем больше blur, тем мягче переход
    const blurRadius = Math.max(1, blurWidth * 0.7)
    ctx.filter = `blur(${blurRadius}px)`
    ctx.drawImage(maskCanvas, 0, 0, width, height, 0, 0, width, height)
    ctx.filter = 'none'
    
    // Шаг 2: Ремапим значения яркости для контроля непрозрачности
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    
    for (let i = 0; i < data.length; i += 4) {
      // Текущая яркость (0-255) после blur
      // 255 = полностью внутри, 0 = полностью снаружи
      const brightness = data[i] / 255 // 0..1
      
      // Применяем функцию затухания
      let t
      switch (falloff) {
        case 'smooth':
          t = brightness * brightness * (3 - 2 * brightness)
          break
        case 'sharp':
          t = brightness * brightness * brightness
          break
        default: // linear
          t = brightness
      }
      
      // Ремапим: t=0 -> opacityEnd, t=1 -> 1 (полная непрозрачность внутри)
      // Но на границе (t ≈ 0.5) должна быть opacityStart
      // 
      // Новая логика:
      // - t < 0.5: интерполяция от opacityEnd (t=0) до opacityStart (t=0.5)
      // - t >= 0.5: интерполяция от opacityStart (t=0.5) до 1 (t=1)
      
      let alpha
      if (t < 0.5) {
        // Снаружи границы: от opacityEnd до opacityStart
        const localT = t / 0.5 // 0..1
        alpha = opacityEnd + localT * (opacityStart - opacityEnd)
      } else {
        // Внутри границы: от opacityStart до 1
        const localT = (t - 0.5) / 0.5 // 0..1
        alpha = opacityStart + localT * (1 - opacityStart)
      }
      
      const value = Math.round(alpha * 255)
      data[i] = value
      data[i + 1] = value
      data[i + 2] = value
    }
    
    ctx.putImageData(imageData, 0, 0)
    return result
  }
  
  /**
   * Сыпучая граница (scatter) - шум на краю маски
   * Создаёт эффект рассыпающейся границы (песок, гравий)
   * 
   * РАСШИРЕННЫЕ ПАРАМЕТРЫ ДЛЯ ТЕСТИРОВАНИЯ:
   */
  applyScatter(maskCanvas, points, params, width, height) {
    // Основные параметры
    const scatterWidth = params.width ?? 20           // Ширина зоны эффекта
    const density = params.density ?? 0.5             // Плотность частиц (0-1)
    const noiseScale = params.noiseScale ?? 0.15      // Масштаб шума (меньше = крупнее)
    
    // Новые параметры для тестирования
    const strength = params.strength ?? 1.0           // Сила эффекта (0-3)
    const particleSize = params.particleSize ?? 1.0   // Размер "частиц" (0.5-3)
    const erosion = params.erosion ?? 0.5             // Эрозия краёв (0-1) - насколько "съедает"
    const roughness = params.roughness ?? 0.5         // Шероховатость (0-1)
    const seed = params.seed ?? 0                     // Сид для вариации
    
    const result = this._getPooledCanvas(width, height)
    const ctx = result.getContext('2d')
    
    // Копируем исходную маску
    ctx.drawImage(maskCanvas, 0, 0, width, height, 0, 0, width, height)
    
    // Вычисляем offset региона из bounding box points
    let minX = Infinity, minY = Infinity
    for (const p of points) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
    }
    // Offset = points минус margin (margin = scatterWidth * 2.5)
    const margin = scatterWidth * 2.5
    const offsetX = Math.max(0, minX - margin)
    const offsetY = Math.max(0, minY - margin)
    
    // Создаём карту расстояний до линии границы
    const distanceData = new Float32Array(width * height)
    
    // Для каждого пикселя вычисляем расстояние до ближайшей точки линии
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Координаты в глобальной системе
        const globalX = x + offsetX
        const globalY = y + offsetY
        
        // Находим минимальное расстояние до линии
        let minDist = Infinity
        for (let i = 0; i < points.length - 1; i++) {
          const dist = this.pointToSegmentDistance(globalX, globalY, points[i], points[i + 1])
          minDist = Math.min(minDist, dist)
        }
        
        distanceData[y * width + x] = minDist
      }
    }
    
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    
    // Обрабатываем каждый пиксель
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const origValue = data[idx] / 255 // 0..1
        
        // Расстояние до линии границы
        const dist = distanceData[y * width + x]
        
        // Нормализуем расстояние (0 = на границе, 1 = на краю зоны влияния)
        const normalizedDist = Math.min(1, dist / scatterWidth)
        
        // Зона влияния уменьшается с расстоянием от границы
        if (normalizedDist >= 1) continue
        
        const falloff = Math.pow(1 - normalizedDist, 0.5 + roughness)
        
        // Многослойный шум для более интересного эффекта
        const globalX = x + offsetX
        const globalY = y + offsetY
        const scale1 = noiseScale * particleSize
        const scale2 = noiseScale * particleSize * 2.5
        const scale3 = noiseScale * particleSize * 0.4
        
        const n1 = noise.noise2D(globalX * scale1 + seed, globalY * scale1) * 0.5 + 0.5
        const n2 = noise.noise2D(globalX * scale2 + seed * 2, globalY * scale2) * 0.5 + 0.5
        const n3 = noise.noise2D(globalX * scale3 + seed * 3, globalY * scale3) * 0.5 + 0.5
        
        // Комбинируем шумы
        const combinedNoise = (n1 * 0.5 + n2 * 0.3 + n3 * 0.2)
        
        // Порог определяет где "частицы" а где "пустота"
        const threshold = 0.5 - (density - 0.5) * 0.6
        
        let newValue = origValue
        
        if (combinedNoise > threshold + 0.1 * (1 - roughness)) {
          // Добавляем "частицы" - увеличиваем непрозрачность
          const addAmount = falloff * strength * (combinedNoise - threshold) * 2
          newValue = Math.min(1, origValue + addAmount * (1 - origValue))
        } else if (combinedNoise < threshold - 0.1 * roughness) {
          // Эрозия - уменьшаем непрозрачность
          const removeAmount = falloff * strength * erosion * (threshold - combinedNoise) * 3
          newValue = Math.max(0, origValue - removeAmount * origValue)
        }
        
        const finalValue = Math.round(newValue * 255)
        data[idx] = finalValue
        data[idx + 1] = finalValue
        data[idx + 2] = finalValue
      }
    }
    
    ctx.putImageData(imageData, 0, 0)
    return result
  }
  
  /**
   * Расстояние от точки до отрезка
   */
  pointToSegmentDistance(px, py, p1, p2) {
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const lengthSq = dx * dx + dy * dy
    
    if (lengthSq === 0) {
      // Отрезок вырожден в точку
      return Math.sqrt((px - p1.x) ** 2 + (py - p1.y) ** 2)
    }
    
    // Параметр t определяет ближайшую точку на отрезке
    let t = ((px - p1.x) * dx + (py - p1.y) * dy) / lengthSq
    t = Math.max(0, Math.min(1, t))
    
    const nearestX = p1.x + t * dx
    const nearestY = p1.y + t * dy
    
    return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2)
  }
  
  /**
   * Шумовое смешение (noise blend)
   */
  applyNoiseBlend(maskCanvas, points, params, width, height) {
    const blendWidth = params.width ?? 15
    const noiseScale = params.noiseScale ?? 0.15
    const contrast = params.contrast ?? 0.5
    
    const result = this._getPooledCanvas(width, height)
    const ctx = result.getContext('2d')
    
    // Небольшой blur для основы
    ctx.filter = `blur(${blendWidth * 0.3}px)`
    ctx.drawImage(maskCanvas, 0, 0, width, height, 0, 0, width, height)
    ctx.filter = 'none'
    
    // Модулируем шумом
    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4
        const value = data[idx]
        
        // На границе добавляем шумовую модуляцию
        if (value > 10 && value < 245) {
          const n = noise.noise2D(x * noiseScale, y * noiseScale) * 0.5 + 0.5 // 0-1
          const contrastFactor = contrast * 100
          
          // Сдвигаем значение на основе шума
          const shift = (n - 0.5) * contrastFactor
          const newValue = Math.max(0, Math.min(255, value + shift))
          
          data[idx] = newValue
          data[idx + 1] = newValue
          data[idx + 2] = newValue
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0)
    return result
  }
  
  /**
   * Создать маску области применения (полоса вдоль сегмента)
   */
  createApplyMask(points, fadeWidth, width, height, offsetX, offsetY) {
    const applyMask = this._getPooledCanvas(width, height)
    const ctx = applyMask.getContext('2d')
    
    ctx.translate(-offsetX, -offsetY)
    ctx.fillStyle = 'white'
    ctx.beginPath()
    
    // Полоса от границы внутрь и наружу
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const prevP = points[Math.max(0, i - 1)]
      const nextP = points[Math.min(points.length - 1, i + 1)]
      const dx = nextP.x - prevP.x
      const dy = nextP.y - prevP.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const nx = -dy / len
      const ny = dx / len
      
      if (i === 0) {
        ctx.moveTo(p.x - nx * fadeWidth, p.y - ny * fadeWidth)
      } else {
        ctx.lineTo(p.x - nx * fadeWidth, p.y - ny * fadeWidth)
      }
    }
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i]
      const prevP = points[Math.max(0, i - 1)]
      const nextP = points[Math.min(points.length - 1, i + 1)]
      const dx = nextP.x - prevP.x
      const dy = nextP.y - prevP.y
      const len = Math.sqrt(dx * dx + dy * dy) || 1
      const nx = -dy / len
      const ny = dx / len
      
      ctx.lineTo(p.x + nx * fadeWidth, p.y + ny * fadeWidth)
    }
    ctx.closePath()
    ctx.fill()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    
    return applyMask
  }
  
  /**
   * Нарисовать обводку вдоль границы
   */
  drawStroke(ctx, points, params) {
    const width = params.width ?? 2
    const opacity = params.opacity ?? 0.5
    const color = params.color ?? '#000000'
    
    if (points.length < 2) return
    
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.globalAlpha = opacity
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.stroke()
    ctx.restore()
  }
  
  /**
   * Нарисовать свечение вдоль границы
   */
  drawGlow(ctx, points, params) {
    const width = params.width ?? 10
    const intensity = params.intensity ?? 0.7
    const color = params.color ?? '#ffffff'
    const offsetX = params.offsetX ?? 0
    const offsetY = params.offsetY ?? 0
    
    if (points.length < 2) return
    
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = width * 2
    ctx.globalAlpha = intensity * 0.3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.filter = `blur(${width}px)`
    
    ctx.beginPath()
    ctx.moveTo(points[0].x + offsetX, points[0].y + offsetY)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x + offsetX, points[i].y + offsetY)
    }
    ctx.stroke()
    
    // Второй проход - более яркое ядро
    ctx.lineWidth = width * 0.5
    ctx.globalAlpha = intensity * 0.6
    ctx.filter = `blur(${width * 0.3}px)`
    ctx.stroke()
    
    ctx.restore()
  }
  
  /**
   * Нарисовать тень вдоль границы
   * Использует глобальные настройки освещения + модификатор
   */
  drawShadow(ctx, points, params) {
    const width = params.width ?? 8
    const lengthMultiplier = params.lengthMultiplier ?? 1.0
    const opacity = params.opacity ?? 0.4
    const color = params.color ?? '#000000'
    
    if (points.length < 2) return
    
    // Вычисляем смещение из глобальных настроек освещения
    const { angle, length, enabled } = this.lightingSettings
    
    // Если освещение отключено, не рисуем тень
    if (!enabled) return
    
    // Конвертируем угол в радианы и вычисляем смещение
    // angle: 0 = вправо, 90 = вниз, 180 = влево, 270 = вверх
    const radians = (angle * Math.PI) / 180
    const effectiveLength = length * lengthMultiplier
    const offsetX = Math.cos(radians) * effectiveLength
    const offsetY = Math.sin(radians) * effectiveLength
    
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.globalAlpha = opacity
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.filter = `blur(${width * 0.5}px)`
    
    ctx.beginPath()
    ctx.moveTo(points[0].x + offsetX, points[0].y + offsetY)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x + offsetX, points[i].y + offsetY)
    }
    ctx.stroke()
    ctx.restore()
  }
  
  /**
   * Проверить, есть ли соседний гекс того же патча на указанном ребре
   */
  hasNeighborInPatch(hex, edgeIdx, patch, radius) {
    // Вычисляем позицию соседа
    const offsets = getNeighborOffsets(radius)
    
    // Для центрального гекса (index=6) сосед на ребре i — это гекс с индексом i
    // Для соседей — нужна таблица смежности
    const neighborOffset = offsets[edgeIdx]
    if (!neighborOffset) return false
    
    const neighborCx = hex.cx + neighborOffset.dx
    const neighborCy = hex.cy + neighborOffset.dy
    
    // Ищем гекс патча в этой позиции (с допуском на float)
    return patch.hexes.some(h => 
      Math.abs(h.cx - neighborCx) < 1 && Math.abs(h.cy - neighborCy) < 1
    )
  }
  
  /**
   * Упорядочить рёбра в замкнутые контуры
   * Рёбра должны следовать друг за другом: v2 одного = v1 следующего
   * Возвращает массив контуров (каждый контур — массив рёбер)
   */
  orderEdgesIntoContours(edges) {
    if (edges.length === 0) return []
    if (edges.length === 1) return [edges]
    
    const contours = []
    const remaining = [...edges]
    
    while (remaining.length > 0) {
      const contour = [remaining.shift()]
      
      // Идём вперёд от последнего ребра
      let foundNext = true
      while (foundNext && remaining.length > 0) {
        const lastEdge = contour[contour.length - 1]
        const lastV2 = lastEdge.v2
        
        // Ищем ребро, которое начинается там, где закончилось предыдущее
        const nextIdx = remaining.findIndex(e => 
          Math.abs(e.v1.x - lastV2.x) < 0.1 && Math.abs(e.v1.y - lastV2.y) < 0.1
        )
        
        if (nextIdx >= 0) {
          contour.push(remaining[nextIdx])
          remaining.splice(nextIdx, 1)
        } else {
          foundNext = false
        }
      }
      
      contours.push(contour)
    }
    
    return contours
  }
  
  /**
   * Упорядочить рёбра в один контур (legacy — для обратной совместимости)
   */
  orderEdgesIntoContour(edges) {
    const contours = this.orderEdgesIntoContours(edges)
    // Возвращаем все рёбра из всех контуров
    return contours.flat()
  }
  
  /**
   * Группировать контур по соседнему патчу
   * Последовательные рёбра с одинаковым neighborPatchKey = один сегмент
   */
  groupContourByNeighbor(orderedEdges) {
    if (orderedEdges.length === 0) return []
    
    const segments = []
    let currentSegment = {
      neighborKey: orderedEdges[0].neighborPatchKey,
      edges: [orderedEdges[0]]
    }
    
    for (let i = 1; i < orderedEdges.length; i++) {
      const edge = orderedEdges[i]
      
      if (edge.neighborPatchKey === currentSegment.neighborKey) {
        currentSegment.edges.push(edge)
      } else {
        segments.push(currentSegment)
        currentSegment = {
          neighborKey: edge.neighborPatchKey,
          edges: [edge]
        }
      }
    }
    
    segments.push(currentSegment)
    
    // Проверяем замыкание: если первый и последний сегменты имеют одинаковый neighborKey
    if (segments.length > 1) {
      const first = segments[0]
      const last = segments[segments.length - 1]
      if (first.neighborKey === last.neighborKey) {
        // Объединяем: добавляем рёбра первого сегмента в конец последнего
        last.edges = last.edges.concat(first.edges)
        segments.shift()
      }
    }
    
    return segments
  }


  /**
   * Найти все границы между гексами разных типов
   */
  findAllBoundaries(hexes, transitions) {
    const boundaries = []
    const getHex = (idx) => hexes.find(h => h.index === idx)
    
    // Таблица соседства для flat-top гексов:
    // Рёбра центра: 0=СВ, 1=В, 2=ЮВ, 3=ЮЗ, 4=З, 5=СЗ
    // Соседи: 0=СВ, 1=В, 2=ЮВ, 3=ЮЗ, 4=З, 5=СЗ (NO WAIT - проверю)
    // 
    // Flat-top hex vertices (starting at -60°):
    //      v5----v0
    //     /        \
    //   v4          v1
    //     \        /
    //      v3----v2
    //
    // Edges: edge[i] connects vertex[i] to vertex[(i+1)%6]
    // Edge 0: v0→v1 (right-top to right)
    // Edge 1: v1→v2 (right to right-bottom)  
    // Edge 2: v2→v3 (right-bottom to left-bottom)
    // Edge 3: v3→v4 (left-bottom to left)
    // Edge 4: v4→v5 (left to left-top)
    // Edge 5: v5→v0 (left-top to right-top)
    //
    // Neighbors based on getNeighborOffsets:
    // 0: NE (dx=+1.5r, dy=-h/2) - shares center's edge 0
    // 1: SE (dx=+1.5r, dy=+h/2) - shares center's edge 1  
    // 2: S  (dx=0, dy=+h) - shares center's edge 2
    // 3: SW (dx=-1.5r, dy=+h/2) - shares center's edge 3
    // 4: NW (dx=-1.5r, dy=-h/2) - shares center's edge 4
    // 5: N  (dx=0, dy=-h) - shares center's edge 5
    
    const adjacency = [
      // [hex1Index, hex2Index, hex1Edge, hex2Edge]
      // Центр (6) с соседями — ребро центра i смотрит на соседа i
      [6, 0, 0, 3], // центр ребро 0 ↔ сосед 0 ребро 3
      [6, 1, 1, 4], // центр ребро 1 ↔ сосед 1 ребро 4
      [6, 2, 2, 5], // центр ребро 2 ↔ сосед 2 ребро 5
      [6, 3, 3, 0], // центр ребро 3 ↔ сосед 3 ребро 0
      [6, 4, 4, 1], // центр ребро 4 ↔ сосед 4 ребро 1
      [6, 5, 5, 2], // центр ребро 5 ↔ сосед 5 ребро 2
      // Соседи между собой (по часовой)
      [0, 1, 2, 5], // сосед 0 ребро 2 ↔ сосед 1 ребро 5
      [1, 2, 3, 0], // сосед 1 ребро 3 ↔ сосед 2 ребро 0
      [2, 3, 4, 1], // сосед 2 ребро 4 ↔ сосед 3 ребро 1
      [3, 4, 5, 2], // сосед 3 ребро 5 ↔ сосед 4 ребро 2
      [4, 5, 0, 3], // сосед 4 ребро 0 ↔ сосед 5 ребро 3
      [5, 0, 1, 4], // сосед 5 ребро 1 ↔ сосед 0 ребро 4
    ]
    
    for (const [idx1, idx2, edge1, edge2] of adjacency) {
      const hex1 = getHex(idx1)
      const hex2 = getHex(idx2)
      
      if (!hex1 || !hex2) continue
      if (isSameTerrain(hex1.terrain, hex2.terrain)) continue
      
      // Определяем верхний/нижний
      const isHex1Upper = hex1.elevation > hex2.elevation
      const upperHex = isHex1Upper ? hex1 : hex2
      const lowerHex = isHex1Upper ? hex2 : hex1
      const upperEdge = isHex1Upper ? edge1 : edge2
      const lowerEdge = isHex1Upper ? edge2 : edge1
      
      // Находим transition для этой пары террейнов
      // Логика: ищем любой transition между центром и соседом того же нижнего террейна
      let transition = null
      
      if (idx1 === 6 || idx2 === 6) {
        // Граница с центром — берём transition для этого соседа
        const neighborIdx = idx1 === 6 ? idx2 : idx1
        transition = transitions[neighborIdx]
      } else {
        // Граница между соседями
        // Ищем transition из любой границы центра с таким же нижним террейном
        const centerHex = getHex(6)
        if (centerHex) {
          // Если центр — такой же террейн как верхний, ищем его transition к нижнему
          if (isSameTerrain(centerHex.terrain, upperHex.terrain)) {
            // Центр такой же как верхний — ищем transition к соседу с террейном нижнего
            for (let i = 0; i < 6; i++) {
              const neighbor = getHex(i)
              if (neighbor && isSameTerrain(neighbor.terrain, lowerHex.terrain) && transitions[i]) {
                transition = transitions[i]
                break
              }
            }
          }
        }
      }
      
      if (!transition) {
        transition = { style: 'sharp', params: {} }
      }
      
      boundaries.push({
        hex1, hex2,
        edge1, edge2,
        upperHex, lowerHex,
        upperEdge, lowerEdge,
        transition
      })
    }
    
    return boundaries
  }
  
  /**
   * Применить альфа-градиент к ребру (для будущего использования)
   */
  applyEdgeAlphaGradient(ctx, cx, cy, radius, edgeIndex, fadeWidth) {
    const vertices = getHexVertices(cx, cy, radius)
    const start = vertices[edgeIndex]
    const end = vertices[(edgeIndex + 1) % 6]
    
    const midX = (start.x + end.x) / 2
    const midY = (start.y + end.y) / 2
    
    const dirX = midX - cx
    const dirY = midY - cy
    const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1
    const nx = dirX / len
    const ny = dirY / len
    
    const gradient = ctx.createLinearGradient(
      midX - nx * fadeWidth,
      midY - ny * fadeWidth,
      midX + nx * fadeWidth,
      midY + ny * fadeWidth
    )
    
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.7)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    
    ctx.save()
    ctx.globalCompositeOperation = 'destination-in'
    
    const edgeDx = end.x - start.x
    const edgeDy = end.y - start.y
    const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy)
    const ex = edgeDx / edgeLen
    const ey = edgeDy / edgeLen
    
    ctx.beginPath()
    ctx.moveTo(start.x - nx * fadeWidth - ex * 10, start.y - ny * fadeWidth - ey * 10)
    ctx.lineTo(end.x - nx * fadeWidth + ex * 10, end.y - ny * fadeWidth + ey * 10)
    ctx.lineTo(end.x + nx * fadeWidth * 2 + ex * 10, end.y + ny * fadeWidth * 2 + ey * 10)
    ctx.lineTo(start.x + nx * fadeWidth * 2 - ex * 10, start.y + ny * fadeWidth * 2 - ey * 10)
    ctx.closePath()
    
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.restore()
  }
  
  /**
   * Нарисовать сетку
   */
  drawGrid(ctx, cx, cy, radius, offsets, neighbors) {
    ctx.save()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.lineWidth = 1
    
    ctx.stroke(getHexPath(cx, cy, radius))
    
    for (let i = 0; i < 6; i++) {
      if (neighbors[i]) {
        const { dx, dy } = offsets[i]
        ctx.stroke(getHexPath(cx + dx, cy + dy, radius))
      }
    }
    
    ctx.restore()
  }
}

export const hexClusterRenderer = new HexClusterRenderer(512, 512)
