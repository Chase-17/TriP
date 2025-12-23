/**
 * Pathfinding для гексовой сетки
 * 
 * Реализация A* с учётом:
 * - Стоимости террейна
 * - Проходимости (passability)
 * - Модификаторов персонажа (полёт, плавание, травмы)
 * - Других токенов на карте
 */

import { hexKey, parseHexKey, HEX_DIRECTIONS } from './grid'

/**
 * Типы проходимости террейна
 */
export const PASSABILITY = {
  OPEN: 'open',           // Свободно проходимо
  DIFFICULT: 'difficult', // Труднопроходимо, но можно
  LIQUID: 'liquid',       // Жидкость (вода, лава) - нужно плавание/полёт
  SOLID: 'solid',         // Твёрдое (стены) - нужен phasing/ethereal
  VOID: 'void'            // Абсолютно непроходимо
}

/**
 * Способности персонажа для прохода через препятствия
 */
export const MOVEMENT_ABILITIES = {
  FLIGHT: 'flight',       // Полёт - проходит liquid, игнорирует difficult
  SWIMMING: 'swimming',   // Плавание - проходит liquid (вода)
  PHASING: 'phasing',     // Бестелесность - проходит solid
  // Модификаторы стоимости
  FOREST_KNOWLEDGE: 'forestKnowledge',
  SWAMP_WALKER: 'swampWalker',
  CLIMBING: 'climbing'
}

/**
 * Штрафы к движению
 */
export const MOVEMENT_PENALTIES = {
  INJURED: 'injured',
  EXHAUSTED: 'exhausted',
  HEAVY_LOAD: 'heavyLoad'
}

/**
 * Проверить, может ли персонаж пройти через террейн
 * 
 * @param {string} passability - тип проходимости террейна
 * @param {Object} abilities - способности персонажа
 * @returns {boolean}
 */
export function canPass(passability, abilities = {}) {
  abilities = abilities || {}
  
  switch (passability) {
    case PASSABILITY.OPEN:
    case PASSABILITY.DIFFICULT:
      return true
      
    case PASSABILITY.LIQUID:
      return !!(abilities.flight || abilities.swimming)
      
    case PASSABILITY.SOLID:
      return !!abilities.phasing
      
    case PASSABILITY.VOID:
      return false
      
    default:
      return true // неизвестный тип = проходимо
  }
}

/**
 * Рассчитать стоимость движения через гекс
 * 
 * @param {Object} hexData - данные гекса от getHexPathfindingData
 * @param {Object} modifiers - модификаторы персонажа (abilities + penalties)
 * @returns {number} - стоимость (Infinity = непроходимо)
 */
export function getMovementCost(hexData, modifiers = {}) {
  if (!hexData) return 1 // Пустой гекс = обычная стоимость
  
  // Защита от null
  modifiers = modifiers || {}
  
  // Новый формат: hexData уже содержит рассчитанную стоимость
  if (hexData.passable !== undefined) {
    if (!hexData.passable) return Infinity
    
    let cost = hexData.movementCost ?? 1
    
    // Применяем глобальные штрафы персонажа
    if (modifiers.injured) cost *= modifiers.injured
    if (modifiers.exhausted) cost *= modifiers.exhausted
    if (modifiers.heavyLoad) cost *= modifiers.heavyLoad
    if (modifiers.costMultiplier) cost *= modifiers.costMultiplier
    
    return Math.max(0.5, cost)
  }
  
  // Старый формат (обратная совместимость)
  const terrain = hexData.terrain || hexData
  const passability = terrain.passability || PASSABILITY.OPEN
  
  // Проверяем проходимость
  if (!canPass(passability, modifiers)) {
    return Infinity
  }
  
  const baseCost = hexData.movementCost ?? terrain.movementCost ?? 1
  let cost = baseCost
  
  // Полёт игнорирует стоимость difficult террейна
  if (modifiers.flight && passability === PASSABILITY.DIFFICULT) {
    cost = 1
  }
  
  // Модификаторы по биому (опционально)
  const biome = terrain.biome || hexData.biome
  if (biome === 'forest' && modifiers.forestKnowledge) {
    cost = Math.max(1, cost * modifiers.forestKnowledge)
  }
  if (biome === 'swamp' && modifiers.swampWalker) {
    cost = Math.max(1, cost * modifiers.swampWalker)
  }
  if (biome === 'mountain' && modifiers.climbing) {
    cost = Math.max(1, cost * modifiers.climbing)
  }
  
  // Глобальные штрафы
  if (modifiers.injured) {
    cost *= modifiers.injured
  }
  if (modifiers.exhausted) {
    cost *= modifiers.exhausted
  }
  if (modifiers.heavyLoad) {
    cost *= modifiers.heavyLoad
  }
  
  // Кастомный множитель
  if (modifiers.costMultiplier) {
    cost *= modifiers.costMultiplier
  }
  
  return Math.max(0.5, cost) // Минимум 0.5 (дорога)
}

/**
 * Получить соседей гекса
 * 
 * @param {number} q 
 * @param {number} r 
 * @returns {Array<{q: number, r: number}>}
 */
export function getHexNeighbors(q, r) {
  return HEX_DIRECTIONS.map(dir => ({
    q: q + dir.q,
    r: r + dir.r
  }))
}

/**
 * Расстояние между гексами (эвристика для A*)
 * 
 * @param {number} q1 
 * @param {number} r1 
 * @param {number} q2 
 * @param {number} r2 
 * @returns {number}
 */
export function hexDistance(q1, r1, q2, r2) {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2
}

/**
 * Приоритетная очередь (min-heap) для A*
 */
class PriorityQueue {
  constructor() {
    this.items = []
  }
  
  enqueue(item, priority) {
    this.items.push({ item, priority })
    this.bubbleUp(this.items.length - 1)
  }
  
  dequeue() {
    if (this.items.length === 0) return null
    
    const result = this.items[0]
    const last = this.items.pop()
    
    if (this.items.length > 0) {
      this.items[0] = last
      this.bubbleDown(0)
    }
    
    return result.item
  }
  
  bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      if (this.items[parentIndex].priority <= this.items[index].priority) break
      
      [this.items[parentIndex], this.items[index]] = [this.items[index], this.items[parentIndex]]
      index = parentIndex
    }
  }
  
  bubbleDown(index) {
    while (true) {
      const leftChild = 2 * index + 1
      const rightChild = 2 * index + 2
      let smallest = index
      
      if (leftChild < this.items.length && 
          this.items[leftChild].priority < this.items[smallest].priority) {
        smallest = leftChild
      }
      
      if (rightChild < this.items.length && 
          this.items[rightChild].priority < this.items[smallest].priority) {
        smallest = rightChild
      }
      
      if (smallest === index) break
      
      [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]]
      index = smallest
    }
  }
  
  isEmpty() {
    return this.items.length === 0
  }
  
  has(key) {
    return this.items.some(item => item.item.key === key)
  }
}

/**
 * Найти путь между двумя гексами (A*)
 * 
 * @param {Object} start - {q, r} начальный гекс
 * @param {Object} end - {q, r} конечный гекс
 * @param {Function} getTerrainAt - функция (q, r) => terrain data
 * @param {Object} options - опции поиска
 * @param {Object} options.modifiers - модификаторы движения персонажа
 * @param {Set<string>} options.blockedHexes - заблокированные гексы (токены)
 * @param {number} options.maxCost - максимальная стоимость пути
 * @param {number} options.maxIterations - защита от бесконечного цикла
 * 
 * @returns {Object} - { path: [{q, r, cost}], totalCost, found }
 */
export function findPath(start, end, getTerrainAt, options = {}) {
  const {
    modifiers = {},
    blockedHexes = new Set(),
    maxCost = 100,
    maxIterations = 10000
  } = options || {}
  
  // Защита от null
  const safeModifiers = modifiers || {}
  
  const startKey = hexKey(start.q, start.r)
  const endKey = hexKey(end.q, end.r)
  
  // Если старт = конец
  if (startKey === endKey) {
    return { path: [{ ...start, cost: 0 }], totalCost: 0, found: true }
  }
  
  // Проверяем, проходим ли конечный гекс
  const endTerrain = getTerrainAt(end.q, end.r)
  const endCost = getMovementCost(endTerrain, safeModifiers)
  if (endCost === Infinity) {
    return { path: [], totalCost: Infinity, found: false }
  }
  
  const openSet = new PriorityQueue()
  const cameFrom = new Map() // key -> { q, r }
  const gScore = new Map()   // key -> cost from start
  const fScore = new Map()   // key -> estimated total cost
  
  gScore.set(startKey, 0)
  fScore.set(startKey, hexDistance(start.q, start.r, end.q, end.r))
  openSet.enqueue({ ...start, key: startKey }, fScore.get(startKey))
  
  let iterations = 0
  
  while (!openSet.isEmpty() && iterations < maxIterations) {
    iterations++
    
    const current = openSet.dequeue()
    const currentKey = current.key
    
    // Достигли цели
    if (currentKey === endKey) {
      return reconstructPath(cameFrom, current, gScore)
    }
    
    const currentG = gScore.get(currentKey)
    
    // Превысили максимальную стоимость
    if (currentG > maxCost) {
      continue
    }
    
    // Проверяем соседей
    const neighbors = getHexNeighbors(current.q, current.r)
    
    for (const neighbor of neighbors) {
      const neighborKey = hexKey(neighbor.q, neighbor.r)
      
      // Заблокирован другим токеном
      if (blockedHexes.has(neighborKey) && neighborKey !== endKey) {
        continue
      }
      
      // Получаем стоимость террейна
      const terrain = getTerrainAt(neighbor.q, neighbor.r)
      const moveCost = getMovementCost(terrain, safeModifiers)
      
      // Непроходимый
      if (moveCost === Infinity) {
        continue
      }
      
      const tentativeG = currentG + moveCost
      
      // Превысили максимум
      if (tentativeG > maxCost) {
        continue
      }
      
      const existingG = gScore.get(neighborKey)
      
      if (existingG === undefined || tentativeG < existingG) {
        cameFrom.set(neighborKey, current)
        gScore.set(neighborKey, tentativeG)
        
        const h = hexDistance(neighbor.q, neighbor.r, end.q, end.r)
        const f = tentativeG + h
        fScore.set(neighborKey, f)
        
        openSet.enqueue({ ...neighbor, key: neighborKey }, f)
      }
    }
  }
  
  // Путь не найден
  return { path: [], totalCost: Infinity, found: false }
}

/**
 * Восстановить путь из cameFrom
 */
function reconstructPath(cameFrom, current, gScore) {
  const path = []
  let node = current
  
  while (node) {
    const cost = gScore.get(node.key) || 0
    path.unshift({ q: node.q, r: node.r, cost })
    node = cameFrom.get(node.key)
  }
  
  return {
    path,
    totalCost: gScore.get(current.key) || 0,
    found: true
  }
}

/**
 * Найти все гексы, достижимые за заданную стоимость (Dijkstra)
 * 
 * @param {Object} start - {q, r} начальный гекс
 * @param {number} maxCost - максимальная стоимость движения
 * @param {Function} getTerrainAt - функция (q, r) => terrain data
 * @param {Object} options - опции
 * @param {Object} options.modifiers - модификаторы движения
 * @param {Set<string>} options.blockedHexes - заблокированные гексы
 * 
 * @returns {Map<string, {q, r, cost}>} - карта достижимых гексов
 */
export function getReachableHexes(start, maxCost, getTerrainAt, options = {}) {
  const {
    modifiers = {},
    blockedHexes = new Set(),
    maxIterations = 5000
  } = options || {}
  
  // Защита от null
  const safeModifiers = modifiers || {}
  
  const startKey = hexKey(start.q, start.r)
  
  const reachable = new Map()
  const visited = new Set()
  const queue = new PriorityQueue()
  
  reachable.set(startKey, { q: start.q, r: start.r, cost: 0 })
  queue.enqueue({ q: start.q, r: start.r, cost: 0, key: startKey }, 0)
  
  let iterations = 0
  
  while (!queue.isEmpty() && iterations < maxIterations) {
    iterations++
    
    const current = queue.dequeue()
    const currentKey = current.key
    
    if (visited.has(currentKey)) continue
    visited.add(currentKey)
    
    const neighbors = getHexNeighbors(current.q, current.r)
    
    for (const neighbor of neighbors) {
      const neighborKey = hexKey(neighbor.q, neighbor.r)
      
      if (visited.has(neighborKey)) continue
      
      // Заблокирован
      if (blockedHexes.has(neighborKey)) continue
      
      // Стоимость
      const terrain = getTerrainAt(neighbor.q, neighbor.r)
      const moveCost = getMovementCost(terrain, safeModifiers)
      
      if (moveCost === Infinity) continue
      
      const totalCost = current.cost + moveCost
      
      if (totalCost > maxCost) continue
      
      const existing = reachable.get(neighborKey)
      
      if (!existing || totalCost < existing.cost) {
        const node = { q: neighbor.q, r: neighbor.r, cost: totalCost }
        reachable.set(neighborKey, node)
        queue.enqueue({ ...node, key: neighborKey }, totalCost)
      }
    }
  }
  
  return reachable
}

/**
 * Преобразовать Map достижимых гексов в массив для рендеринга
 * 
 * @param {Map} reachableMap - результат getReachableHexes
 * @returns {Array<{q, r, cost}>}
 */
export function reachableMapToArray(reachableMap) {
  return Array.from(reachableMap.values())
}

/**
 * Получить прямую линию между гексами (для отрисовки)
 * Не учитывает препятствия!
 * 
 * @param {number} q1 
 * @param {number} r1 
 * @param {number} q2 
 * @param {number} r2 
 * @returns {Array<{q, r}>}
 */
export function getHexLine(q1, r1, q2, r2) {
  const N = hexDistance(q1, r1, q2, r2)
  if (N === 0) return [{ q: q1, r: r1 }]
  
  const results = []
  
  for (let i = 0; i <= N; i++) {
    const t = i / N
    
    // Линейная интерполяция в кубических координатах
    const q = q1 + (q2 - q1) * t
    const r = r1 + (r2 - r1) * t
    const s1 = -q1 - r1
    const s2 = -q2 - r2
    const s = s1 + (s2 - s1) * t
    
    // Округляем к ближайшему гексу
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
    
    results.push({ q: rq, r: rr })
  }
  
  return results
}
