/**
 * HexTransitions - Утилиты для рендеринга визуальных переходов между гексами
 * 
 * Поддерживает стили:
 * - sharp: чёткая линия границы
 * - blend: градиентное смешение цветов
 * - smooth-wave: волнистая плавная линия (берег моря)
 * - jagged: рваная/зубчатая граница (горы)
 * - gradient: градиент от одного террейна к другому
 * - noise: шумовое смешение
 * - dither: дизеринг-паттерн
 */

import { PerlinNoise } from './noise.js'

// Глобальный генератор шума для переходов
const transitionNoise = new PerlinNoise(42)

/**
 * Получить вершины flat-top гексагона
 * 
 * Flat-top означает, что ВЕРХНЕЕ ребро горизонтальное.
 * Вершины нумеруются по часовой стрелке, начиная с ВЕРХНЕЙ ПРАВОЙ:
 * 
 *       v5 ---- v0      (верхнее горизонтальное ребро)
 *      /          \
 *    v4            v1
 *      \          /
 *       v3 ---- v2      (нижнее горизонтальное ребро)
 * 
 * Углы вершин (от центра):
 *   v0: -60° (300°) - верхняя правая
 *   v1: 0°          - правая
 *   v2: 60°         - нижняя правая
 *   v3: 120°        - нижняя левая
 *   v4: 180°        - левая
 *   v5: 240° (-120°) - верхняя левая
 * 
 * Рёбра:
 *   0: v0→v1 (правое верхнее, наклонное)
 *   1: v1→v2 (правое нижнее, наклонное)  
 *   2: v2→v3 (нижнее горизонтальное)
 *   3: v3→v4 (левое нижнее, наклонное)
 *   4: v4→v5 (левое верхнее, наклонное)
 *   5: v5→v0 (верхнее горизонтальное)
 * 
 * @param {number} cx - центр X
 * @param {number} cy - центр Y
 * @param {number} radius - радиус
 * @returns {Array<{x: number, y: number}>} массив из 6 вершин
 */
export function getHexVertices(cx, cy, radius) {
  const vertices = []
  for (let i = 0; i < 6; i++) {
    // Начинаем с -60° (300°) чтобы верхнее ребро было горизонтальным
    // и вершина v0 была в правом верхнем углу
    const angle = (Math.PI / 3) * i - Math.PI / 3
    vertices.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle)
    })
  }
  return vertices
}

/**
 * Получить ребро гексагона между двумя вершинами
 * @param {number} cx - центр X
 * @param {number} cy - центр Y
 * @param {number} radius - радиус
 * @param {number} edgeIndex - индекс ребра (0-5)
 * @returns {{start: {x, y}, end: {x, y}, midpoint: {x, y}}}
 */
export function getHexEdge(cx, cy, radius, edgeIndex) {
  const vertices = getHexVertices(cx, cy, radius)
  const start = vertices[edgeIndex]
  const end = vertices[(edgeIndex + 1) % 6]
  return {
    start,
    end,
    midpoint: {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2
    }
  }
}

/**
 * Маппинг индекса соседа на индексы рёбер центрального гекса
 * 
 * Для flat-top гексагона:
 * 
 * Вершины нумеруются с 0° и по часовой:
 *   v0 = 0° (справа)
 *   v1 = 60° (справа-снизу)
 *   v2 = 120° (слева-снизу)
 *   v3 = 180° (слева)
 *   v4 = 240° (слева-сверху)
 *   v5 = 300° (справа-сверху)
 * 
 * Рёбра (между вершинами):
 *   Ребро 0: v0→v1 (правое, вертикальное)
 *   Ребро 1: v1→v2 (нижнее правое, диагональ)
 *   Ребро 2: v2→v3 (нижнее левое, диагональ)
 *   Ребро 3: v3→v4 (левое, вертикальное)
 *   Ребро 4: v4→v5 (верхнее левое, диагональ)
 *   Ребро 5: v5→v0 (верхнее правое, диагональ)
 * 
 * Соседи в HexClusterPreview:
 *   0: СВ  dx: +1.5r, dy: -h/2  → касается ребра 0 и 5
 *   1: ЮВ  dx: +1.5r, dy: +h/2  → касается ребра 0 и 1
 *   2: Ю   dx: 0,     dy: +h    → касается рёбер 1 и 2
 *   3: ЮЗ  dx: -1.5r, dy: +h/2  → касается ребра 2 и 3
 *   4: СЗ  dx: -1.5r, dy: -h/2  → касается ребра 3 и 4
 *   5: С   dx: 0,     dy: -h    → касается рёбер 4 и 5
 * 
 * Но каждый сосед касается только ОДНОГО ребра центра!
 * Правильный маппинг:
 *   Сосед 0 (СВ)  → Ребро 5 (верхнее правое)
 *   Сосед 1 (ЮВ)  → Ребро 0 (правое) — НЕТ! Это вертикальное ребро
 *   
 * Пересчитаем:
 *   Сосед справа-сверху (dx:+1.5r, dy:-h/2) граничит с ребром который идёт
 *   от v5 (300°) к v0 (0°) — это ребро 5
 *   
 *   Сосед справа-снизу (dx:+1.5r, dy:+h/2) граничит с ребром от v0 к v1 — ребро 0
 *   
 * Итоговый маппинг сосед → ребро:
 *   Сосед 0 (СВ)  → Ребро 5
 *   Сосед 1 (ЮВ)  → Ребро 0
 *   Сосед 2 (Ю)   → Ребро 1 и 2 (касается двух!) — берём 1
 *   Сосед 3 (ЮЗ)  → Ребро 2 или 3 — берём 2
 *   Сосед 4 (СЗ)  → Ребро 3 или 4 — берём 3
 *   Сосед 5 (С)   → Ребро 4 и 5 (касается двух!) — берём 4
 *
 * НЕПРАВИЛЬНО! Давай разберёмся иначе.
 * 
 * Сосед находится в направлении от центра. Ребро — это грань между центром и соседом.
 * Для pointy-top было бы проще, но у нас flat-top.
 * 
 * Направление к соседу:
 *   Сосед 0: угол = atan2(-h/2, 1.5r) ≈ -30° (или 330°)
 *   Сосед 1: угол = atan2(h/2, 1.5r) ≈ 30°
 *   Сосед 2: угол = atan2(h, 0) = 90°
 *   Сосед 3: угол = atan2(h/2, -1.5r) ≈ 150°
 *   Сосед 4: угол = atan2(-h/2, -1.5r) ≈ 210° (или -150°)
 *   Сосед 5: угол = atan2(-h, 0) = -90° (или 270°)
 * 
 * Середины рёбер:
 *   Ребро 0 (v0→v1): середина на угле 30° от центра
 *   Ребро 1 (v1→v2): середина на угле 90° 
 *   Ребро 2 (v2→v3): середина на угле 150°
 *   Ребро 3 (v3→v4): середина на угле 210°
 *   Ребро 4 (v4→v5): середина на угле 270°
 *   Ребро 5 (v5→v0): середина на угле 330°
 * 
 * Маппинг по совпадению углов:
 *   Сосед 0 (330°) → Ребро 5 (330°) ✓
 *   Сосед 1 (30°)  → Ребро 0 (30°)  ✓
 *   Сосед 2 (90°)  → Ребро 1 (90°)  ✓
 *   Сосед 3 (150°) → Ребро 2 (150°) ✓
 *   Сосед 4 (210°) → Ребро 3 (210°) ✓
 *   Сосед 5 (270°) → Ребро 4 (270°) ✓
 * 
 * Итого: сосед i → ребро (i + 5) % 6, или проще: (i - 1 + 6) % 6
 */
export function neighborIndexToEdgeIndex(neighborIndex) {
  // Сосед 0 → ребро 5, сосед 1 → ребро 0, и т.д.
  return (neighborIndex + 5) % 6
}

/**
 * Получить все рёбра для данного соседа
 * (для соседей сверху/снизу возвращает 2 ребра)
 */
export function neighborIndexToEdgeIndices(neighborIndex) {
  return [(neighborIndex + 5) % 6]
}

/**
 * Найти смежные рёбра с одинаковым стилем перехода
 * @param {Array} transitions - массив переходов для каждого соседа
 * @returns {Array<{style: string, edges: number[], params: object}>} группы смежных рёбер
 */
export function groupAdjacentEdges(transitions) {
  const groups = []
  const used = new Set()
  
  for (let i = 0; i < 6; i++) {
    if (used.has(i) || !transitions[i]) continue
    
    const style = transitions[i].style
    const params = transitions[i].params || {}
    const edges = [i]
    used.add(i)
    
    // Ищем смежные рёбра с тем же стилем по часовой стрелке
    let next = (i + 1) % 6
    while (!used.has(next) && transitions[next]?.style === style) {
      edges.push(next)
      used.add(next)
      next = (next + 1) % 6
    }
    
    // Ищем смежные рёбра против часовой стрелки
    let prev = (i + 5) % 6
    while (!used.has(prev) && transitions[prev]?.style === style) {
      edges.unshift(prev)
      used.add(prev)
      prev = (prev + 5) % 6
    }
    
    groups.push({ style, edges, params })
  }
  
  return groups
}

/**
 * Построить путь из смежных рёбер
 * @param {number} cx - центр гекса X
 * @param {number} cy - центр гекса Y
 * @param {number} radius - радиус гекса
 * @param {number[]} edges - индексы смежных рёбер
 * @returns {Array<{x: number, y: number}>} точки пути
 */
export function buildEdgePath(cx, cy, radius, edges) {
  const path = []
  const vertices = getHexVertices(cx, cy, radius)
  
  if (edges.length === 0) return path
  
  // Добавляем все вершины рёбер по порядку
  for (let i = 0; i < edges.length; i++) {
    const edgeIdx = edges[i]
    if (i === 0) {
      path.push(vertices[edgeIdx])
    }
    path.push(vertices[(edgeIdx + 1) % 6])
  }
  
  return path
}

/**
 * Применить волновую деформацию к пути
 * @param {Array<{x, y}>} path - исходный путь
 * @param {object} params - параметры волны
 * @param {{x: number, y: number}} center - центр гекса (для определения направления нормали)
 * @returns {Array<{x, y}>} деформированный путь с дополнительными точками
 */
export function applyWaveDeformation(path, params = {}, center = null) {
  const {
    amplitude = 5,
    frequency = 0.15,
    segments = 12,
    seed = 0
  } = params
  
  if (path.length < 2) return path
  
  const result = []
  
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i]
    const end = path[i + 1]
    
    // Направление ребра
    const dx = end.x - start.x
    const dy = end.y - start.y
    const len = Math.sqrt(dx * dx + dy * dy)
    
    // Нормаль к ребру (перпендикуляр)
    let nx = -dy / len
    let ny = dx / len
    
    // Убедимся, что нормаль смотрит наружу от центра
    if (center) {
      const midX = (start.x + end.x) / 2
      const midY = (start.y + end.y) / 2
      const toCenterX = center.x - midX
      const toCenterY = center.y - midY
      // Если нормаль смотрит к центру, переворачиваем
      if (nx * toCenterX + ny * toCenterY > 0) {
        nx = -nx
        ny = -ny
      }
    }
    
    // Разбиваем ребро на сегменты
    for (let j = 0; j <= segments; j++) {
      const t = j / segments
      const x = start.x + dx * t
      const y = start.y + dy * t
      
      // Волновое смещение на основе позиции
      const noiseVal = transitionNoise.noise2D(
        (x + seed) * frequency,
        (y + seed) * frequency
      )
      const offset = noiseVal * amplitude
      
      result.push({
        x: x + nx * offset,
        y: y + ny * offset
      })
    }
  }
  
  return result
}

/**
 * Применить зубчатую деформацию к пути
 * @param {Array<{x, y}>} path - исходный путь
 * @param {object} params - параметры
 * @param {{x: number, y: number}} center - центр гекса (для определения направления нормали)
 * @returns {Array<{x, y}>} деформированный путь
 */
export function applyJaggedDeformation(path, params = {}, center = null) {
  const {
    amplitude = 8,
    frequency = 0.25,
    sharpness = 0.7,
    seed = 0
  } = params
  
  if (path.length < 2) return path
  
  const result = []
  
  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i]
    const end = path[i + 1]
    
    const dx = end.x - start.x
    const dy = end.y - start.y
    const len = Math.sqrt(dx * dx + dy * dy)
    
    let nx = -dy / len
    let ny = dx / len
    
    // Убедимся, что нормаль смотрит наружу от центра
    if (center) {
      const midX = (start.x + end.x) / 2
      const midY = (start.y + end.y) / 2
      const toCenterX = center.x - midX
      const toCenterY = center.y - midY
      if (nx * toCenterX + ny * toCenterY > 0) {
        nx = -nx
        ny = -ny
      }
    }
    
    // Меньше сегментов для острых углов
    const segments = 6
    
    for (let j = 0; j <= segments; j++) {
      const t = j / segments
      const x = start.x + dx * t
      const y = start.y + dy * t
      
      // Зубчатый шум с резкими переходами
      let noiseVal = transitionNoise.noise2D(
        (x + seed) * frequency,
        (y + seed) * frequency
      )
      
      // Делаем более острым через степенную функцию
      noiseVal = Math.sign(noiseVal) * Math.pow(Math.abs(noiseVal), sharpness)
      
      const offset = noiseVal * amplitude
      
      result.push({
        x: x + nx * offset,
        y: y + ny * offset
      })
    }
  }
  
  return result
}

/**
 * Класс для рендеринга переходов между гексами
 */
export class HexTransitionRenderer {
  constructor() {
    this.noiseCache = new Map()
  }
  
  /**
   * Отрендерить переходы для центрального гекса
   * @param {CanvasRenderingContext2D} ctx - контекст canvas
   * @param {number} cx - центр X
   * @param {number} cy - центр Y
   * @param {number} radius - радиус гекса
   * @param {Array} transitions - массив переходов для каждого соседа (6 элементов)
   * @param {object} options - дополнительные опции
   */
  renderTransitions(ctx, cx, cy, radius, transitions, options = {}) {
    const {
      centerColor = '#888888',
      neighborColors = []
    } = options
    
    if (!transitions || transitions.length === 0) return
    
    // Группируем смежные рёбра
    const groups = groupAdjacentEdges(transitions)
    
    // Рендерим каждую группу
    for (const group of groups) {
      this.renderTransitionGroup(ctx, cx, cy, radius, group, {
        centerColor,
        neighborColors
      })
    }
  }
  
  /**
   * Отрендерить группу смежных рёбер с одним стилем
   */
  renderTransitionGroup(ctx, cx, cy, radius, group, options) {
    const { style, edges, params } = group
    const path = buildEdgePath(cx, cy, radius, edges)
    const center = { x: cx, y: cy }
    
    switch (style) {
      case 'sharp':
        this.renderSharpTransition(ctx, path, params)
        break
      case 'smooth-wave':
        this.renderWaveTransition(ctx, path, params, center)
        break
      case 'jagged':
        this.renderJaggedTransition(ctx, path, params, center)
        break
      case 'blend':
        this.renderBlendTransition(ctx, cx, cy, radius, edges, params, options)
        break
      case 'gradient':
        this.renderGradientTransition(ctx, cx, cy, radius, edges, params, options)
        break
      case 'noise':
        this.renderNoiseTransition(ctx, cx, cy, radius, edges, params, options)
        break
      case 'dither':
        this.renderDitherTransition(ctx, cx, cy, radius, edges, params, options)
        break
      default:
        this.renderSharpTransition(ctx, path, params)
    }
  }
  
  /**
   * Чёткая линия границы
   */
  renderSharpTransition(ctx, path, params = {}) {
    const { color = 'rgba(0, 0, 0, 0.5)', width = 2 } = params
    
    if (path.length < 2) return
    
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(path[0].x, path[0].y)
    
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y)
    }
    
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.restore()
  }
  
  /**
   * Волнистая линия (берег)
   */
  renderWaveTransition(ctx, path, params = {}, center = null) {
    const {
      color = 'rgba(100, 180, 255, 0.7)',
      width = 3,
      amplitude = 6,
      frequency = 0.12
    } = params
    
    const wavePath = applyWaveDeformation(path, { amplitude, frequency, segments: 15 }, center)
    
    if (wavePath.length < 2) return
    
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(wavePath[0].x, wavePath[0].y)
    
    // Плавная кривая через точки (Catmull-Rom или просто линии)
    for (let i = 1; i < wavePath.length; i++) {
      ctx.lineTo(wavePath[i].x, wavePath[i].y)
    }
    
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    
    // Дополнительная тонкая линия для эффекта пены
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.lineWidth = 1
    ctx.stroke()
    
    ctx.restore()
  }
  
  /**
   * Зубчатая линия (горы)
   */
  renderJaggedTransition(ctx, path, params = {}, center = null) {
    const {
      color = 'rgba(80, 60, 40, 0.8)',
      width = 2,
      amplitude = 8,
      frequency = 0.2
    } = params
    
    const jaggedPath = applyJaggedDeformation(path, { amplitude, frequency, sharpness: 0.6 }, center)
    
    if (jaggedPath.length < 2) return
    
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(jaggedPath[0].x, jaggedPath[0].y)
    
    for (let i = 1; i < jaggedPath.length; i++) {
      ctx.lineTo(jaggedPath[i].x, jaggedPath[i].y)
    }
    
    ctx.strokeStyle = color
    ctx.lineWidth = width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'miter'
    ctx.stroke()
    ctx.restore()
  }
  
  /**
   * Градиентное смешение (blend)
   * @param params.width - ширина градиента
   * @param params.opacity - непрозрачность
   * @param params.offset - смещение центра градиента: 
   *   отрицательное = внутрь (к центру гекса), 
   *   положительное = наружу (к соседу)
   */
  renderBlendTransition(ctx, cx, cy, radius, edges, params = {}, options = {}) {
    const { width = 15, opacity = 0.5, offset = 0 } = params
    const { centerColor = '#888888', neighborColors = [] } = options
    
    ctx.save()
    
    for (const edgeIdx of edges) {
      const edge = getHexEdge(cx, cy, radius, edgeIdx)
      const neighborColor = neighborColors[edgeIdx] || '#888888'
      
      // Направление к соседу (наружу от центра)
      const dirX = edge.midpoint.x - cx
      const dirY = edge.midpoint.y - cy
      const len = Math.sqrt(dirX * dirX + dirY * dirY)
      const nx = dirX / len
      const ny = dirY / len
      
      // Точка на ребре со смещением
      const offsetX = edge.midpoint.x + nx * offset
      const offsetY = edge.midpoint.y + ny * offset
      
      // Создаём градиент от центра к соседу
      const gradient = ctx.createLinearGradient(
        offsetX - nx * width,
        offsetY - ny * width,
        offsetX + nx * width,
        offsetY + ny * width
      )
      
      gradient.addColorStop(0, this.colorWithAlpha(centerColor, 0))
      gradient.addColorStop(0.3, this.colorWithAlpha(centerColor, opacity * 0.5))
      gradient.addColorStop(0.5, this.colorWithAlpha(neighborColor, opacity))
      gradient.addColorStop(0.7, this.colorWithAlpha(neighborColor, opacity * 0.5))
      gradient.addColorStop(1, this.colorWithAlpha(neighborColor, 0))
      
      // Рисуем полосу вдоль ребра
      ctx.beginPath()
      ctx.moveTo(edge.start.x + nx * offset - nx * width, edge.start.y + ny * offset - ny * width)
      ctx.lineTo(edge.end.x + nx * offset - nx * width, edge.end.y + ny * offset - ny * width)
      ctx.lineTo(edge.end.x + nx * offset + nx * width, edge.end.y + ny * offset + ny * width)
      ctx.lineTo(edge.start.x + nx * offset + nx * width, edge.start.y + ny * offset + ny * width)
      ctx.closePath()
      
      ctx.fillStyle = gradient
      ctx.fill()
    }
    
    ctx.restore()
  }
  
  /**
   * Простой градиент
   * @param params.width - ширина градиента
   * @param params.offset - смещение: отрицательное = внутрь, положительное = наружу
   */
  renderGradientTransition(ctx, cx, cy, radius, edges, params = {}, options = {}) {
    const { width = 10, offset = 0 } = params
    const { centerColor = '#888888', neighborColors = [] } = options
    
    ctx.save()
    
    for (const edgeIdx of edges) {
      const edge = getHexEdge(cx, cy, radius, edgeIdx)
      const neighborColor = neighborColors[edgeIdx] || '#888888'
      
      const dirX = edge.midpoint.x - cx
      const dirY = edge.midpoint.y - cy
      const len = Math.sqrt(dirX * dirX + dirY * dirY)
      const nx = dirX / len
      const ny = dirY / len
      
      // Точка на ребре со смещением
      const offsetX = edge.midpoint.x + nx * offset
      const offsetY = edge.midpoint.y + ny * offset
      
      const gradient = ctx.createLinearGradient(
        offsetX - nx * width,
        offsetY - ny * width,
        offsetX + nx * width,
        offsetY + ny * width
      )
      
      gradient.addColorStop(0, this.colorWithAlpha(centerColor, 0))
      gradient.addColorStop(0.5, this.colorWithAlpha(neighborColor, 0.6))
      gradient.addColorStop(1, this.colorWithAlpha(neighborColor, 0))
      
      ctx.beginPath()
      ctx.moveTo(edge.start.x + nx * offset - nx * width, edge.start.y + ny * offset - ny * width)
      ctx.lineTo(edge.end.x + nx * offset - nx * width, edge.end.y + ny * offset - ny * width)
      ctx.lineTo(edge.end.x + nx * offset + nx * width, edge.end.y + ny * offset + ny * width)
      ctx.lineTo(edge.start.x + nx * offset + nx * width, edge.start.y + ny * offset + ny * width)
      ctx.closePath()
      
      ctx.fillStyle = gradient
      ctx.fill()
    }
    
    ctx.restore()
  }
  
  /**
   * Шумовое смешение
   */
  renderNoiseTransition(ctx, cx, cy, radius, edges, params = {}, options = {}) {
    const { width = 12, density = 0.3 } = params
    const { neighborColors = [] } = options
    
    ctx.save()
    
    for (const edgeIdx of edges) {
      const edge = getHexEdge(cx, cy, radius, edgeIdx)
      const neighborColor = neighborColors[edgeIdx] || '#888888'
      
      const dirX = edge.midpoint.x - cx
      const dirY = edge.midpoint.y - cy
      const len = Math.sqrt(dirX * dirX + dirY * dirY)
      const nx = dirX / len
      const ny = dirY / len
      
      // Рисуем точки с шумом
      const edgeDx = edge.end.x - edge.start.x
      const edgeDy = edge.end.y - edge.start.y
      const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy)
      
      const pointCount = Math.floor(edgeLen * width * density)
      
      ctx.fillStyle = neighborColor
      
      for (let i = 0; i < pointCount; i++) {
        const t = Math.random()
        const d = (Math.random() - 0.5) * width * 2
        
        const px = edge.start.x + edgeDx * t + nx * d
        const py = edge.start.y + edgeDy * t + ny * d
        
        const noiseVal = transitionNoise.noise2D(px * 0.1, py * 0.1)
        if (noiseVal > 0) {
          const size = 1 + Math.random() * 2
          ctx.globalAlpha = 0.3 + Math.random() * 0.4
          ctx.fillRect(px - size / 2, py - size / 2, size, size)
        }
      }
    }
    
    ctx.globalAlpha = 1
    ctx.restore()
  }
  
  /**
   * Дизеринг
   */
  renderDitherTransition(ctx, cx, cy, radius, edges, params = {}, options = {}) {
    const { width = 10, pattern = 'checker' } = params
    const { neighborColors = [] } = options
    
    ctx.save()
    
    for (const edgeIdx of edges) {
      const edge = getHexEdge(cx, cy, radius, edgeIdx)
      const neighborColor = neighborColors[edgeIdx] || '#888888'
      
      const dirX = edge.midpoint.x - cx
      const dirY = edge.midpoint.y - cy
      const len = Math.sqrt(dirX * dirX + dirY * dirY)
      const nx = dirX / len
      const ny = dirY / len
      
      const edgeDx = edge.end.x - edge.start.x
      const edgeDy = edge.end.y - edge.start.y
      
      ctx.fillStyle = neighborColor
      
      // Шахматный паттерн
      const step = 3
      for (let u = 0; u < 1; u += step / Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy)) {
        for (let v = -width; v < width; v += step) {
          const px = edge.start.x + edgeDx * u + nx * v
          const py = edge.start.y + edgeDy * u + ny * v
          
          const gridX = Math.floor(px / step)
          const gridY = Math.floor(py / step)
          
          // Плотность уменьшается к краям
          const distFromEdge = Math.abs(v) / width
          const threshold = 0.3 + distFromEdge * 0.5
          
          if ((gridX + gridY) % 2 === 0 && Math.random() > threshold) {
            ctx.globalAlpha = 0.6 - distFromEdge * 0.4
            ctx.fillRect(px - 1, py - 1, 2, 2)
          }
        }
      }
    }
    
    ctx.globalAlpha = 1
    ctx.restore()
  }
  
  /**
   * Добавить альфа-канал к цвету
   */
  colorWithAlpha(color, alpha) {
    // Если уже rgba
    if (color.startsWith('rgba')) {
      return color.replace(/[\d.]+\)$/, `${alpha})`)
    }
    
    // Если rgb
    if (color.startsWith('rgb(')) {
      return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
    }
    
    // Если hex
    if (color.startsWith('#')) {
      const hex = color.slice(1)
      let r, g, b
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16)
        g = parseInt(hex[1] + hex[1], 16)
        b = parseInt(hex[2] + hex[2], 16)
      } else {
        r = parseInt(hex.slice(0, 2), 16)
        g = parseInt(hex.slice(2, 4), 16)
        b = parseInt(hex.slice(4, 6), 16)
      }
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
    
    return color
  }
}

// Singleton экземпляр
export const hexTransitionRenderer = new HexTransitionRenderer()
