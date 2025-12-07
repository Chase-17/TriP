/**
 * Утилиты для выделения гексов
 * Поддержка разных форм и режимов выделения
 */

import { hexKey, parseHexKey } from './hexGrid'

/**
 * Формы выделения
 */
export const SELECTION_SHAPES = {
  RECTANGLE: 'rectangle',
  CIRCLE: 'circle',
  HEXAGON: 'hexagon',
  LINE: 'line'
}

/**
 * Режимы выделения (как применять к текущему)
 */
export const SELECTION_MODES = {
  REPLACE: 'replace',   // Заменить текущее выделение
  ADD: 'add',           // Добавить к текущему
  SUBTRACT: 'subtract'  // Вычесть из текущего
}

/**
 * Поведение захвата гексов
 */
export const SELECTION_BEHAVIORS = {
  AGGRESSIVE: 'aggressive', // Захватывает все гексы в геометрической области
  STANDARD: 'standard',     // Захватывает только существующие гексы
  PASSIVE: 'passive'        // Захватывает только существующие гексы (flood-fill от начальной точки)
}

/**
 * Класс для управления выделением
 */
export class SelectionManager {
  constructor(hexGrid) {
    this.hexGrid = hexGrid
  }

  /**
   * Hex distance между двумя гексами
   */
  hexDistance(a, b) {
    return Math.max(
      Math.abs(a.q - b.q),
      Math.abs(a.r - b.r),
      Math.abs((a.q + a.r) - (b.q + b.r))
    )
  }

  /**
   * Фильтрация гексов по поведению
   * @param {Array} hexes - Массив гексов {q, r}
   * @param {Map} existingHexes - Map существующих гексов на карте
   * @param {string} behavior - Поведение захвата
   * @param {Object} startHex - Начальный гекс для PASSIVE режима
   * 
   * Поведения:
   * - AGGRESSIVE: все гексы в геометрической области
   * - STANDARD: все гексы в геометрической области (то же что AGGRESSIVE)
   * - PASSIVE: flood-fill по существующим гексам (только связные с начальной точкой)
   */
  filterByBehavior(hexes, existingHexes, behavior, startHex = null) {
    // AGGRESSIVE и STANDARD - возвращаем все гексы в геометрической области
    if (behavior === SELECTION_BEHAVIORS.AGGRESSIVE || behavior === SELECTION_BEHAVIORS.STANDARD) {
      return hexes
    }
    
    if (behavior === SELECTION_BEHAVIORS.PASSIVE) {
      // Flood-fill: только связные существующие гексы, начиная от startHex
      // Это полезно для выделения "островов" существующих гексов
      if (!startHex) {
        return hexes // Если нет начальной точки, возвращаем все
      }
      
      const startKey = hexKey(startHex.q, startHex.r)
      
      // Если начальный гекс не существует, но он в области - возвращаем все
      // (пользователь начал выделение с пустого места)
      if (!existingHexes.has(startKey)) {
        return hexes
      }
      
      const hexSet = new Set(hexes.map(h => hexKey(h.q, h.r)))
      const result = new Set()
      const visited = new Set()
      const queue = [startHex]
      
      while (queue.length > 0) {
        const current = queue.shift()
        const key = hexKey(current.q, current.r)
        
        if (visited.has(key)) continue
        visited.add(key)
        
        // Гекс должен быть в геометрической области И существовать на карте
        if (!hexSet.has(key) || !existingHexes.has(key)) continue
        
        result.add(key)
        
        // Добавляем соседей в очередь
        const neighbors = this.getNeighbors(current.q, current.r)
        for (const n of neighbors) {
          const nKey = hexKey(n.q, n.r)
          if (!visited.has(nKey)) {
            queue.push(n)
          }
        }
      }
      
      return Array.from(result).map(parseHexKey)
    }
    
    return hexes
  }

  /**
   * Получить соседей гекса
   */
  getNeighbors(q, r) {
    return [
      { q: q + 1, r: r },
      { q: q - 1, r: r },
      { q: q, r: r + 1 },
      { q: q, r: r - 1 },
      { q: q + 1, r: r - 1 },
      { q: q - 1, r: r + 1 }
    ]
  }

  /**
   * Рассчитать превью для прямоугольного выделения
   * @param {Object} startHex - Начальный гекс {q, r}
   * @param {Object} endHex - Конечный гекс {q, r}
   * @param {Map} existingHexes - Существующие гексы на карте
   * @param {string} behavior - Поведение захвата
   * @returns {Array} Массив гексов {q, r}
   */
  calculateRectanglePreview(startHex, endHex, existingHexes, behavior = SELECTION_BEHAVIORS.STANDARD) {
    // Определяем границы в hex-координатах
    const minQ = Math.min(startHex.q, endHex.q)
    const maxQ = Math.max(startHex.q, endHex.q)
    const minR = Math.min(startHex.r, endHex.r)
    const maxR = Math.max(startHex.r, endHex.r)

    const hexes = []
    
    // Собираем все гексы в прямоугольной области hex-координат
    for (let q = minQ; q <= maxQ; q++) {
      for (let r = minR; r <= maxR; r++) {
        hexes.push({ q, r })
      }
    }

    return this.filterByBehavior(hexes, existingHexes, behavior, startHex)
  }

  /**
   * Рассчитать превью для прямоугольного выделения по пиксельным координатам
   * @param {Object} startPixel - Начальная точка {x, y} в пикселях
   * @param {Object} endPixel - Конечная точка {x, y} в пикселях
   * @param {Map} existingHexes - Существующие гексы на карте
   * @param {string} behavior - Поведение захвата
   * @returns {Array} Массив гексов {q, r}
   */
  calculateRectanglePreviewPixel(startPixel, endPixel, existingHexes, behavior = SELECTION_BEHAVIORS.STANDARD) {
    const minX = Math.min(startPixel.x, endPixel.x)
    const maxX = Math.max(startPixel.x, endPixel.x)
    const minY = Math.min(startPixel.y, endPixel.y)
    const maxY = Math.max(startPixel.y, endPixel.y)

    const startHex = this.hexGrid.pixelToHex(startPixel.x, startPixel.y)
    
    // Итерируем по пиксельной сетке с шагом ~половина размера гекса
    const step = this.hexGrid.hexSize * 0.5
    const hexSet = new Set()
    
    for (let x = minX; x <= maxX + step; x += step) {
      for (let y = minY; y <= maxY + step; y += step) {
        // Ограничиваем координаты областью прямоугольника
        const checkX = Math.min(x, maxX)
        const checkY = Math.min(y, maxY)
        
        // Находим гекс в этой точке
        const hex = this.hexGrid.pixelToHex(checkX, checkY)
        
        // Проверяем, попадает ли центр этого гекса в прямоугольник
        const center = this.hexGrid.hexToPixel(hex.q, hex.r)
        if (center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY) {
          hexSet.add(hexKey(hex.q, hex.r))
        }
      }
    }
    
    const hexes = Array.from(hexSet).map(parseHexKey)
    return this.filterByBehavior(hexes, existingHexes, behavior, startHex)
  }

  /**
   * Рассчитать превью для кругового выделения по пиксельным координатам
   * @param {Object} startPixel - Центр круга {x, y} в пикселях
   * @param {Object} endPixel - Точка на краю круга {x, y} в пикселях
   * @param {Map} existingHexes - Существующие гексы на карте
   * @param {string} behavior - Поведение захвата
   * @returns {Array} Массив гексов {q, r}
   */
  calculateCirclePreviewPixel(startPixel, endPixel, existingHexes, behavior = SELECTION_BEHAVIORS.STANDARD) {
    const dx = endPixel.x - startPixel.x
    const dy = endPixel.y - startPixel.y
    const radiusPixels = Math.sqrt(dx * dx + dy * dy)
    
    // Определяем начальный гекс для фильтрации
    const startHex = this.hexGrid.pixelToHex(startPixel.x, startPixel.y)
    
    // Примерный hex-радиус для итерации
    const hexRadius = Math.ceil(radiusPixels / this.hexGrid.hexSize) + 2
    
    const hexes = []
    
    // Проверяем гексы в области
    for (let dq = -hexRadius; dq <= hexRadius; dq++) {
      for (let dr = -hexRadius; dr <= hexRadius; dr++) {
        const q = startHex.q + dq
        const r = startHex.r + dr
        
        // Проверяем, попадает ли центр гекса в круг
        const hexPixel = this.hexGrid.hexToPixel(q, r)
        const distX = hexPixel.x - startPixel.x
        const distY = hexPixel.y - startPixel.y
        const dist = Math.sqrt(distX * distX + distY * distY)
        
        if (dist <= radiusPixels) {
          hexes.push({ q, r })
        }
      }
    }

    return this.filterByBehavior(hexes, existingHexes, behavior, startHex)
  }

  /**
   * Рассчитать превью для кругового выделения
   * Радиус определяется расстоянием между startHex и endHex
   * @param {Object} startHex - Центр круга {q, r}
   * @param {Object} endHex - Точка на краю круга {q, r}
   * @param {Map} existingHexes - Существующие гексы на карте
   * @param {string} behavior - Поведение захвата
   * @returns {Array} Массив гексов {q, r}
   */
  calculateCirclePreview(startHex, endHex, existingHexes, behavior = SELECTION_BEHAVIORS.STANDARD) {
    // Радиус в пикселях
    const startPixel = this.hexGrid.hexToPixel(startHex.q, startHex.r)
    const endPixel = this.hexGrid.hexToPixel(endHex.q, endHex.r)
    
    return this.calculateCirclePreviewPixel(startPixel, endPixel, existingHexes, behavior)
  }

  /**
   * Рассчитать превью для шестиугольного выделения по пиксельным координатам
   * @param {Object} startPixel - Центр {x, y} в пикселях
   * @param {Object} endPixel - Точка определяющая радиус {x, y} в пикселях
   * @param {Map} existingHexes - Существующие гексы на карте
   * @param {string} behavior - Поведение захвата
   * @returns {Array} Массив гексов {q, r}
   */
  calculateHexagonPreviewPixel(startPixel, endPixel, existingHexes, behavior = SELECTION_BEHAVIORS.STANDARD) {
    // Определяем гексы для расчёта hex-радиуса
    const startHex = this.hexGrid.pixelToHex(startPixel.x, startPixel.y)
    const endHex = this.hexGrid.pixelToHex(endPixel.x, endPixel.y)
    
    // Радиус = hex-расстояние
    const radius = this.hexDistance(startHex, endHex)
    
    const hexes = []
    
    // Собираем все гексы в hex-радиусе от начального гекса
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const ds = -dq - dr
        const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds))
        
        if (dist <= radius) {
          hexes.push({ q: startHex.q + dq, r: startHex.r + dr })
        }
      }
    }

    return this.filterByBehavior(hexes, existingHexes, behavior, startHex)
  }

  /**
   * Рассчитать превью для шестиугольного выделения
   * Использует hex-distance (шахматное расстояние в hex-сетке)
   * @param {Object} startHex - Центр шестиугольника {q, r}
   * @param {Object} endHex - Точка определяющая радиус {q, r}
   * @param {Map} existingHexes - Существующие гексы на карте
   * @param {string} behavior - Поведение захвата
   * @returns {Array} Массив гексов {q, r}
   */
  calculateHexagonPreview(startHex, endHex, existingHexes, behavior = SELECTION_BEHAVIORS.STANDARD) {
    // Радиус = hex-расстояние до endHex
    const radius = this.hexDistance(startHex, endHex)
    
    const hexes = []
    
    // Собираем все гексы в hex-радиусе
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const ds = -dq - dr
        // Hex distance от центра
        const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds))
        
        if (dist <= radius) {
          hexes.push({ q: startHex.q + dq, r: startHex.r + dr })
        }
      }
    }

    return this.filterByBehavior(hexes, existingHexes, behavior, startHex)
  }

  /**
   * Рассчитать превью для линии по пиксельным координатам
   * @param {Object} startPixel - Начальная точка {x, y} в пикселях
   * @param {Object} endPixel - Конечная точка {x, y} в пикселях
   * @param {number} width - Ширина линии в гексах
   * @param {Map} existingHexes - Существующие гексы на карте
   * @param {string} behavior - Поведение захвата
   * @returns {Array} Массив гексов {q, r}
   */
  calculateLinePreviewPixel(startPixel, endPixel, width = 1, existingHexes, behavior = SELECTION_BEHAVIORS.STANDARD) {
    const startHex = this.hexGrid.pixelToHex(startPixel.x, startPixel.y)
    const endHex = this.hexGrid.pixelToHex(endPixel.x, endPixel.y)
    
    return this.calculateLinePreview(startHex, endHex, width, existingHexes, behavior)
  }

  /**
   * Рассчитать превью для линии
   * @param {Object} startHex - Начальный гекс {q, r}
   * @param {Object} endHex - Конечный гекс {q, r}
   * @param {number} width - Ширина линии в гексах
   * @param {Map} existingHexes - Существующие гексы на карте
   * @param {string} behavior - Поведение захвата
   * @returns {Array} Массив гексов {q, r}
   */
  calculateLinePreview(startHex, endHex, width = 1, existingHexes, behavior = SELECTION_BEHAVIORS.STANDARD) {
    // Получаем гексы вдоль линии
    const lineHexes = this.getHexLine(startHex, endHex)
    
    const hexSet = new Set()
    const halfWidth = Math.floor(width / 2)
    
    // Расширяем каждый гекс линии на ширину
    for (const hex of lineHexes) {
      // Добавляем сам гекс
      hexSet.add(hexKey(hex.q, hex.r))
      
      // Добавляем соседей в радиусе halfWidth
      if (halfWidth > 0) {
        for (let dq = -halfWidth; dq <= halfWidth; dq++) {
          for (let dr = -halfWidth; dr <= halfWidth; dr++) {
            const ds = -dq - dr
            const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds))
            if (dist <= halfWidth) {
              hexSet.add(hexKey(hex.q + dq, hex.r + dr))
            }
          }
        }
      }
    }
    
    const hexes = Array.from(hexSet).map(parseHexKey)
    return this.filterByBehavior(hexes, existingHexes, behavior, startHex)
  }

  /**
   * Получить гексы вдоль линии (алгоритм hex linedraw)
   */
  getHexLine(start, end) {
    const N = this.hexDistance(start, end)
    const results = []

    if (N === 0) {
      return [{ q: start.q, r: start.r }]
    }

    for (let i = 0; i <= N; i++) {
      const t = i / N
      const q = start.q + (end.q - start.q) * t
      const r = start.r + (end.r - start.r) * t
      const rounded = this.hexRound(q, r)
      results.push(rounded)
    }

    return results
  }

  /**
   * Округление дробных hex-координат
   */
  hexRound(q, r) {
    const s = -q - r
    
    let rq = Math.round(q)
    let rr = Math.round(r)
    let rs = Math.round(s)
    
    const qDiff = Math.abs(rq - q)
    const rDiff = Math.abs(rr - r)
    const sDiff = Math.abs(rs - s)
    
    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs
    } else if (rDiff > sDiff) {
      rr = -rq - rs
    }
    
    return { q: rq, r: rr }
  }
}
