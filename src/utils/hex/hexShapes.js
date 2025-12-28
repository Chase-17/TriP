/**
 * hexShapes.js - генерация гексов для различных форм карты
 * 
 * Поддерживаемые формы:
 * - cluster7: 7 гексов (центр + 6 соседей)
 * - circle: круг с заданным радиусом
 * - rect: прямоугольник с заданными размерами
 * - diamond: ромб
 * - line: линия
 */

/**
 * Направления соседей для flat-top гексов
 */
export const HEX_DIRECTIONS = [
  { q: 1, r: 0 },   // E
  { q: 1, r: -1 },  // NE
  { q: 0, r: -1 },  // NW
  { q: -1, r: 0 },  // W
  { q: -1, r: 1 },  // SW
  { q: 0, r: 1 }    // SE
]

/**
 * Получить соседний гекс по направлению
 */
export function getNeighbor(q, r, direction) {
  const dir = HEX_DIRECTIONS[direction]
  return { q: q + dir.q, r: r + dir.r }
}

/**
 * Получить все соседние гексы
 */
export function getNeighbors(q, r) {
  return HEX_DIRECTIONS.map(dir => ({
    q: q + dir.q,
    r: r + dir.r
  }))
}

/**
 * Расстояние между двумя гексами (в гексах)
 */
export function hexDistance(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2
}

/**
 * Генерация cluster7 (центр + 6 соседей)
 * @returns {Array<{q, r, index}>}
 */
export function generateCluster7(centerQ = 0, centerR = 0) {
  const hexes = [
    { q: centerQ, r: centerR, index: 0 }
  ]
  
  HEX_DIRECTIONS.forEach((dir, i) => {
    hexes.push({
      q: centerQ + dir.q,
      r: centerR + dir.r,
      index: i + 1
    })
  })
  
  return hexes
}

/**
 * Генерация круга с радиусом r
 * @param {number} radius - радиус в гексах (включая центр)
 * @returns {Array<{q, r}>}
 */
export function generateCircle(radius, centerQ = 0, centerR = 0) {
  const hexes = []
  
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius)
    const r2 = Math.min(radius, -q + radius)
    
    for (let r = r1; r <= r2; r++) {
      hexes.push({ q: centerQ + q, r: centerR + r })
    }
  }
  
  return hexes
}

/**
 * Генерация прямоугольника (offset coordinates преобразованные в axial)
 * @param {number} width - ширина в колонках
 * @param {number} height - высота в рядах
 * @returns {Array<{q, r}>}
 */
export function generateRect(width, height, centerQ = 0, centerR = 0) {
  const hexes = []
  const halfW = Math.floor(width / 2)
  const halfH = Math.floor(height / 2)
  
  for (let col = -halfW; col <= halfW; col++) {
    for (let row = -halfH; row <= halfH; row++) {
      // Конвертация offset -> axial (odd-r)
      const q = col - Math.floor(row / 2)
      const r = row
      hexes.push({ q: centerQ + q, r: centerR + r })
    }
  }
  
  return hexes
}

/**
 * Генерация ромба
 * @param {number} size - размер (количество гексов по диагонали)
 * @returns {Array<{q, r}>}
 */
export function generateDiamond(size, centerQ = 0, centerR = 0) {
  const hexes = []
  const half = Math.floor(size / 2)
  
  for (let q = -half; q <= half; q++) {
    const rRange = half - Math.abs(q)
    for (let r = -rRange; r <= rRange; r++) {
      hexes.push({ q: centerQ + q, r: centerR + r })
    }
  }
  
  return hexes
}

/**
 * Генерация линии
 * @param {number} length - длина линии
 * @param {number} direction - направление (0-5, индекс в HEX_DIRECTIONS)
 * @returns {Array<{q, r}>}
 */
export function generateLine(length, direction = 0, centerQ = 0, centerR = 0) {
  const hexes = []
  const dir = HEX_DIRECTIONS[direction % 6]
  const half = Math.floor(length / 2)
  
  for (let i = -half; i <= half; i++) {
    hexes.push({
      q: centerQ + dir.q * i,
      r: centerR + dir.r * i
    })
  }
  
  return hexes
}

/**
 * Генерация гексов по имени формы (совместимость с AssetManager)
 * @param {string} shapeName - имя формы
 * @returns {Array<{q, r}>}
 */
export function generateShape(shapeName, centerQ = 0, centerR = 0) {
  switch (shapeName) {
    case 'cluster7':
      return generateCluster7(centerQ, centerR)
    
    case 'circle2':
      return generateCircle(2, centerQ, centerR)
    
    case 'circle3':
      return generateCircle(3, centerQ, centerR)
    
    case 'rect5x5':
      return generateRect(5, 5, centerQ, centerR)
    
    case 'rect3x7':
      return generateRect(3, 7, centerQ, centerR)
    
    case 'rect5x9':
      return generateRect(5, 9, centerQ, centerR)
    
    case 'diamond':
      return generateDiamond(5, centerQ, centerR)
    
    case 'line7':
      return generateLine(7, 0, centerQ, centerR)
    
    default:
      console.warn(`Unknown shape: ${shapeName}, falling back to cluster7`)
      return generateCluster7(centerQ, centerR)
  }
}

/**
 * Конвертация массива гексов в Map<key, {terrain: null}>
 * @param {Array<{q, r}>} hexes
 * @returns {Map<string, {terrain: null}>}
 */
export function hexArrayToMap(hexes) {
  const map = new Map()
  for (const hex of hexes) {
    map.set(`${hex.q},${hex.r}`, { terrain: null })
  }
  return map
}

/**
 * Конвертация Map гексов в массив
 * @param {Map<string, any>} hexMap
 * @returns {Array<{q, r, ...data}>}
 */
export function hexMapToArray(hexMap) {
  const result = []
  hexMap.forEach((data, key) => {
    const [q, r] = key.split(',').map(Number)
    result.push({ q, r, ...data })
  })
  return result
}
