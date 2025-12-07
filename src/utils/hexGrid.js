/**
 * Утилиты для работы с гексагональными сетками
 * Поддержка flat-top и pointy-top ориентаций
 * 
 * Система координат: Axial (q, r)
 * https://www.redblobgames.com/grids/hexagons/
 */

// Константы для расчёта размеров гекса
export const HEX_ORIENTATIONS = {
  FLAT: 'flat',     // Плоская вершина сверху ⬡
  POINTY: 'pointy'  // Острая вершина сверху ⬢
}

/**
 * Матрицы преобразования для разных ориентаций
 */
const ORIENTATION_MATRICES = {
  [HEX_ORIENTATIONS.FLAT]: {
    f0: 3/2,    f1: 0,
    f2: Math.sqrt(3)/2, f3: Math.sqrt(3),
    b0: 2/3,    b1: 0,
    b2: -1/3,   b3: Math.sqrt(3)/3,
    startAngle: 0
  },
  [HEX_ORIENTATIONS.POINTY]: {
    f0: Math.sqrt(3),   f1: Math.sqrt(3)/2,
    f2: 0,              f3: 3/2,
    b0: Math.sqrt(3)/3, b1: -1/3,
    b2: 0,              b3: 2/3,
    startAngle: 30
  }
}

/**
 * Направления для соседних гексов (axial coordinates)
 */
export const HEX_DIRECTIONS = [
  { q: 1, r: 0 },   // East
  { q: 1, r: -1 },  // NE
  { q: 0, r: -1 },  // NW
  { q: -1, r: 0 },  // West
  { q: -1, r: 1 },  // SW
  { q: 0, r: 1 }    // SE
]

/**
 * Класс для работы с гексагональной сеткой
 */
export class HexGrid {
  constructor(options = {}) {
    this.orientation = options.orientation || HEX_ORIENTATIONS.FLAT
    this.hexSize = options.hexSize || 32 // Радиус гекса в пикселях
    this.origin = options.origin || { x: 0, y: 0 } // Смещение сетки
    this.matrix = ORIENTATION_MATRICES[this.orientation]
  }

  /**
   * Конвертация axial координат в пиксельные
   */
  hexToPixel(q, r) {
    const { f0, f1, f2, f3 } = this.matrix
    const x = this.hexSize * (f0 * q + f1 * r) + this.origin.x
    const y = this.hexSize * (f2 * q + f3 * r) + this.origin.y
    return { x, y }
  }

  /**
   * Конвертация пиксельных координат в axial
   */
  pixelToHex(x, y) {
    const { b0, b1, b2, b3 } = this.matrix
    const px = (x - this.origin.x) / this.hexSize
    const py = (y - this.origin.y) / this.hexSize
    const q = b0 * px + b1 * py
    const r = b2 * px + b3 * py
    return this.hexRound(q, r)
  }

  /**
   * Округление дробных hex-координат до ближайшего целого гекса
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

  /**
   * Получить углы гекса для отрисовки
   */
  getHexCorners(centerX, centerY) {
    const corners = []
    for (let i = 0; i < 6; i++) {
      const angleDeg = 60 * i + this.matrix.startAngle
      const angleRad = (Math.PI / 180) * angleDeg
      corners.push({
        x: centerX + this.hexSize * Math.cos(angleRad),
        y: centerY + this.hexSize * Math.sin(angleRad)
      })
    }
    return corners
  }

  /**
   * Получить соседний гекс в указанном направлении (0-5)
   */
  getNeighbor(q, r, direction) {
    const dir = HEX_DIRECTIONS[direction]
    return { q: q + dir.q, r: r + dir.r }
  }

  /**
   * Получить все соседние гексы
   */
  getNeighbors(q, r) {
    return HEX_DIRECTIONS.map(dir => ({
      q: q + dir.q,
      r: r + dir.r
    }))
  }

  /**
   * Расстояние между двумя гексами
   */
  hexDistance(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2
  }

  /**
   * Генерация прямоугольной карты гексов
   */
  generateRectMap(width, height) {
    const hexes = []
    
    for (let r = 0; r < height; r++) {
      const rOffset = Math.floor(r / 2)
      for (let q = -rOffset; q < width - rOffset; q++) {
        hexes.push({ q, r })
      }
    }
    
    return hexes
  }

  /**
   * Ширина гекса в пикселях
   */
  getHexWidth() {
    if (this.orientation === HEX_ORIENTATIONS.FLAT) {
      return this.hexSize * 2
    }
    return this.hexSize * Math.sqrt(3)
  }

  /**
   * Высота гекса в пикселях
   */
  getHexHeight() {
    if (this.orientation === HEX_ORIENTATIONS.FLAT) {
      return this.hexSize * Math.sqrt(3)
    }
    return this.hexSize * 2
  }

  /**
   * Горизонтальный шаг между центрами соседних гексов
   */
  getHorizontalSpacing() {
    if (this.orientation === HEX_ORIENTATIONS.FLAT) {
      return this.hexSize * 1.5
    }
    return this.hexSize * Math.sqrt(3)
  }

  /**
   * Вертикальный шаг между центрами соседних гексов
   */
  getVerticalSpacing() {
    if (this.orientation === HEX_ORIENTATIONS.FLAT) {
      return this.hexSize * Math.sqrt(3)
    }
    return this.hexSize * 1.5
  }

  /**
   * Вычислить bounding box для набора гексов
   */
  getBoundingBox(hexes) {
    if (!hexes.length) return { x: 0, y: 0, width: 0, height: 0 }

    let minX = Infinity, minY = Infinity
    let maxX = -Infinity, maxY = -Infinity

    for (const hex of hexes) {
      const center = this.hexToPixel(hex.q, hex.r)
      const corners = this.getHexCorners(center.x, center.y)
      
      for (const corner of corners) {
        minX = Math.min(minX, corner.x)
        minY = Math.min(minY, corner.y)
        maxX = Math.max(maxX, corner.x)
        maxY = Math.max(maxY, corner.y)
      }
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }
}

/**
 * Создать уникальный ключ для гекса (для Map/Set)
 */
export const hexKey = (q, r) => `${q},${r}`

/**
 * Распарсить ключ гекса обратно в координаты
 */
export const parseHexKey = (key) => {
  const [q, r] = key.split(',').map(Number)
  return { q, r }
}
