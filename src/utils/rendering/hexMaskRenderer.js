/**
 * HexMaskRenderer - Рендеринг гексов с масками переходов
 * 
 * Архитектура:
 * 1. Нижний террейн (по elevation) рисуется полностью
 * 2. Верхний террейн обрезается по маске с формой границы
 * 3. Маска может иметь градиент прозрачности вдоль кривой
 * 
 * На каждом ребре всегда только 2 текстуры — это ключевое упрощение.
 */

import { PerlinNoise } from './noise.js'

const transitionNoise = new PerlinNoise(42)

// Приоритеты высот для сортировки (чем больше — тем выше рисуется)
const ELEVATION_PRIORITY = {
  'submerged': 0,
  'low': 1,
  'flat': 2,
  'elevated': 3,
  'high': 4,
  'cliff': 5
}

/**
 * Получить приоритет высоты террейна
 */
export function getElevationPriority(terrain) {
  if (!terrain?.categoryTags?.elevation) return 2 // default = flat
  return ELEVATION_PRIORITY[terrain.categoryTags.elevation] ?? 2
}

/**
 * Получить вершины flat-top гексагона
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

/**
 * Получить путь для стандартного гекса
 */
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
 * Построить деформированное ребро (волнистое, зубчатое и т.д.)
 * 
 * @param {number} startX, startY - начало ребра
 * @param {number} endX, endY - конец ребра
 * @param {string} style - тип деформации
 * @param {object} params - параметры
 * @param {number} direction - направление нормали (1 = наружу, -1 = внутрь)
 * @returns {Array<{x, y}>} массив точек
 */
export function buildDeformedEdge(startX, startY, endX, endY, style, params = {}, direction = 1) {
  const points = []
  const segments = params.segments || 12
  
  const dx = endX - startX
  const dy = endY - startY
  const len = Math.sqrt(dx * dx + dy * dy)
  
  // Нормаль к ребру
  const nx = -dy / len * direction
  const ny = dx / len * direction
  
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const x = startX + dx * t
    const y = startY + dy * t
    
    let offset = 0
    
    switch (style) {
      case 'smooth-wave': {
        const amplitude = params.amplitude || 6
        const frequency = params.frequency || 0.12
        const noiseVal = transitionNoise.noise2D(x * frequency, y * frequency)
        offset = noiseVal * amplitude
        break
      }
      
      case 'jagged': {
        const amplitude = params.amplitude || 8
        const frequency = params.frequency || 0.2
        const sharpness = params.sharpness || 0.6
        let noiseVal = transitionNoise.noise2D(x * frequency, y * frequency)
        noiseVal = Math.sign(noiseVal) * Math.pow(Math.abs(noiseVal), sharpness)
        offset = noiseVal * amplitude
        break
      }
      
      case 'sharp':
      default:
        offset = 0
        break
    }
    
    points.push({
      x: x + nx * offset,
      y: y + ny * offset
    })
  }
  
  return points
}

/**
 * Построить маску для гекса с учётом переходов на рёбрах
 * 
 * @param {number} cx, cy - центр гекса
 * @param {number} radius - радиус
 * @param {Array} edgeTransitions - массив из 6 элементов, каждый: {style, params, expandOutward}
 *   expandOutward: true = маска расширяется наружу (этот террейн "выше")
 *                  false = маска сжимается внутрь (этот террейн "ниже")
 * @returns {Path2D} маска
 */
export function buildHexMask(cx, cy, radius, edgeTransitions = []) {
  const vertices = getHexVertices(cx, cy, radius)
  const path = new Path2D()
  
  let firstPoint = null
  
  for (let i = 0; i < 6; i++) {
    const start = vertices[i]
    const end = vertices[(i + 1) % 6]
    const transition = edgeTransitions[i]
    
    if (!transition || transition.style === 'sharp') {
      // Прямое ребро
      if (i === 0) {
        path.moveTo(start.x, start.y)
        firstPoint = start
      }
      path.lineTo(end.x, end.y)
    } else {
      // Деформированное ребро
      const direction = transition.expandOutward ? 1 : -1
      const points = buildDeformedEdge(
        start.x, start.y,
        end.x, end.y,
        transition.style,
        transition.params || {},
        direction
      )
      
      if (i === 0) {
        path.moveTo(points[0].x, points[0].y)
        firstPoint = points[0]
      }
      
      for (let j = 1; j < points.length; j++) {
        path.lineTo(points[j].x, points[j].y)
      }
    }
  }
  
  path.closePath()
  return path
}

/**
 * Создать градиентную маску альфы для мягкого перехода
 * 
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx, cy - центр гекса
 * @param {number} radius
 * @param {number} edgeIndex - индекс ребра (0-5)
 * @param {object} params - параметры градиента
 * @returns {CanvasGradient}
 */
export function createEdgeAlphaGradient(ctx, cx, cy, radius, edgeIndex, params = {}) {
  const { width = 15, falloff = 'linear' } = params
  
  const vertices = getHexVertices(cx, cy, radius)
  const start = vertices[edgeIndex]
  const end = vertices[(edgeIndex + 1) % 6]
  
  // Середина ребра
  const midX = (start.x + end.x) / 2
  const midY = (start.y + end.y) / 2
  
  // Направление от центра к ребру (наружу)
  const dirX = midX - cx
  const dirY = midY - cy
  const len = Math.sqrt(dirX * dirX + dirY * dirY)
  const nx = dirX / len
  const ny = dirY / len
  
  // Градиент от (ребро - width) до (ребро + width)
  const gradient = ctx.createLinearGradient(
    midX - nx * width,
    midY - ny * width,
    midX + nx * width,
    midY + ny * width
  )
  
  // Альфа: от непрозрачного к прозрачному (для верхнего слоя)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')
  
  return gradient
}

/**
 * Класс для рендеринга гексов с масками
 */
export class HexMaskRenderer {
  constructor(width, height) {
    // Основной canvas
    this.width = width
    this.height = height
    
    // Буфер для рендеринга отдельных слоёв
    this.bufferCanvas = null
    this.bufferCtx = null
    
    // Буфер для масок
    this.maskCanvas = null
    this.maskCtx = null
  }
  
  /**
   * Инициализировать буферы
   */
  initBuffers() {
    if (!this.bufferCanvas) {
      this.bufferCanvas = document.createElement('canvas')
      this.bufferCanvas.width = this.width
      this.bufferCanvas.height = this.height
      this.bufferCtx = this.bufferCanvas.getContext('2d')
    }
    
    if (!this.maskCanvas) {
      this.maskCanvas = document.createElement('canvas')
      this.maskCanvas.width = this.width
      this.maskCanvas.height = this.height
      this.maskCtx = this.maskCanvas.getContext('2d')
    }
  }
  
  /**
   * Отрендерить гекс с маской
   * 
   * @param {CanvasRenderingContext2D} ctx - целевой контекст
   * @param {number} cx, cy - центр гекса
   * @param {number} radius - радиус
   * @param {string|CanvasPattern} fill - заливка (цвет или паттерн)
   * @param {Path2D} mask - маска (путь)
   * @param {object} alphaOptions - опции прозрачности для мягких переходов
   */
  renderHexWithMask(ctx, cx, cy, radius, fill, mask = null, alphaOptions = null) {
    ctx.save()
    
    // Применяем маску через clip
    if (mask) {
      ctx.clip(mask)
    } else {
      // Стандартная гекс-маска
      ctx.clip(getHexPath(cx, cy, radius))
    }
    
    // Если нужен градиент альфы на рёбрах
    if (alphaOptions?.edges?.length > 0) {
      this.renderWithEdgeAlpha(ctx, cx, cy, radius, fill, alphaOptions)
    } else {
      // Простая заливка
      ctx.fillStyle = fill
      ctx.fillRect(cx - radius - 10, cy - radius - 10, radius * 2 + 20, radius * 2 + 20)
    }
    
    ctx.restore()
  }
  
  /**
   * Рендер с градиентом альфы на рёбрах
   */
  renderWithEdgeAlpha(ctx, cx, cy, radius, fill, alphaOptions) {
    const { edges, width = 15 } = alphaOptions
    
    this.initBuffers()
    
    // Очищаем буферы
    this.bufferCtx.clearRect(0, 0, this.width, this.height)
    this.maskCtx.clearRect(0, 0, this.width, this.height)
    
    // Рисуем текстуру в буфер
    this.bufferCtx.fillStyle = fill
    this.bufferCtx.fillRect(0, 0, this.width, this.height)
    
    // Строим маску альфы
    // Начинаем с полной непрозрачности
    this.maskCtx.fillStyle = 'white'
    this.maskCtx.fill(getHexPath(cx, cy, radius))
    
    // Для каждого ребра с градиентом — рисуем градиент в маске
    for (const edgeInfo of edges) {
      const { edgeIndex, fadeDirection = 'out' } = edgeInfo
      
      const gradient = createEdgeAlphaGradient(
        this.maskCtx, cx, cy, radius, edgeIndex, { width }
      )
      
      // Применяем градиент к области ребра
      this.maskCtx.save()
      this.maskCtx.globalCompositeOperation = fadeDirection === 'out' 
        ? 'destination-out' // убираем альфу (fade out)
        : 'destination-in'  // оставляем только где градиент
      
      const vertices = getHexVertices(cx, cy, radius)
      const start = vertices[edgeIndex]
      const end = vertices[(edgeIndex + 1) % 6]
      const midX = (start.x + end.x) / 2
      const midY = (start.y + end.y) / 2
      const dirX = midX - cx
      const dirY = midY - cy
      const len = Math.sqrt(dirX * dirX + dirY * dirY)
      const nx = dirX / len
      const ny = dirY / len
      
      // Область градиента
      this.maskCtx.beginPath()
      this.maskCtx.moveTo(start.x, start.y)
      this.maskCtx.lineTo(end.x, end.y)
      this.maskCtx.lineTo(end.x + nx * width * 2, end.y + ny * width * 2)
      this.maskCtx.lineTo(start.x + nx * width * 2, start.y + ny * width * 2)
      this.maskCtx.closePath()
      
      this.maskCtx.fillStyle = gradient
      this.maskCtx.fill()
      this.maskCtx.restore()
    }
    
    // Применяем маску к текстуре
    this.bufferCtx.globalCompositeOperation = 'destination-in'
    this.bufferCtx.drawImage(this.maskCanvas, 0, 0)
    this.bufferCtx.globalCompositeOperation = 'source-over'
    
    // Копируем результат на основной canvas
    ctx.drawImage(this.bufferCanvas, 0, 0)
  }
  
  /**
   * Отрендерить два смежных гекса с переходом
   * 
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} hex1 - {cx, cy, radius, fill, terrain}
   * @param {object} hex2 - {cx, cy, radius, fill, terrain}
   * @param {number} sharedEdgeIndex1 - индекс общего ребра для hex1
   * @param {object} transition - {style, params}
   */
  renderAdjacentHexes(ctx, hex1, hex2, sharedEdgeIndex1, transition) {
    // Определяем порядок рисования по elevation
    const elev1 = getElevationPriority(hex1.terrain)
    const elev2 = getElevationPriority(hex2.terrain)
    
    let bottom, top, bottomEdgeIndex, topEdgeIndex
    
    if (elev1 <= elev2) {
      bottom = hex1
      top = hex2
      bottomEdgeIndex = sharedEdgeIndex1
      topEdgeIndex = (sharedEdgeIndex1 + 3) % 6 // противоположное ребро
    } else {
      bottom = hex2
      top = hex1
      bottomEdgeIndex = (sharedEdgeIndex1 + 3) % 6
      topEdgeIndex = sharedEdgeIndex1
    }
    
    // 1. Рисуем нижний гекс полностью
    this.renderHexWithMask(ctx, bottom.cx, bottom.cy, bottom.radius, bottom.fill)
    
    // 2. Строим маску для верхнего гекса
    const edgeTransitions = []
    for (let i = 0; i < 6; i++) {
      if (i === topEdgeIndex) {
        edgeTransitions[i] = {
          style: transition.style,
          params: transition.params,
          expandOutward: true // верхний расширяется на территорию нижнего
        }
      } else {
        edgeTransitions[i] = null // обычное ребро
      }
    }
    
    const topMask = buildHexMask(top.cx, top.cy, top.radius, edgeTransitions)
    
    // 3. Рисуем верхний гекс с маской и градиентом альфы
    const alphaOptions = transition.params?.softEdge ? {
      edges: [{ edgeIndex: topEdgeIndex, fadeDirection: 'out' }],
      width: transition.params.fadeWidth || 15
    } : null
    
    this.renderHexWithMask(ctx, top.cx, top.cy, top.radius, top.fill, topMask, alphaOptions)
  }
}

// Singleton
export const hexMaskRenderer = new HexMaskRenderer(512, 512)
