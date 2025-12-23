/**
 * Утилита для сегментации пути по ресурсам движения
 */

/**
 * Типы сегментов пути
 */
export const PATH_SEGMENT_TYPES = {
  MOVEMENT: 'movement',      // За основные очки движения (голубой)
  SURGE_1: 'surge_1',        // За первый порыв (жёлтый)
  SURGE_2: 'surge_2',        // За второй порыв (оранжево-жёлтый)
  SURGE_3: 'surge_3',        // За третий порыв
  SURGE_4: 'surge_4',        // За четвёртый порыв
  UNREACHABLE: 'unreachable' // Недостижимо (красный)
}

/**
 * Цвета для сегментов
 */
export const SEGMENT_COLORS = {
  [PATH_SEGMENT_TYPES.MOVEMENT]: {
    line: 'rgba(56, 189, 248, 0.9)',      // sky-400
    shadow: 'rgba(0, 0, 0, 0.5)',
    point: 'rgba(56, 189, 248, 1)'
  },
  [PATH_SEGMENT_TYPES.SURGE_1]: {
    line: 'rgba(250, 204, 21, 0.9)',      // yellow-400
    shadow: 'rgba(0, 0, 0, 0.5)',
    point: 'rgba(250, 204, 21, 1)'
  },
  [PATH_SEGMENT_TYPES.SURGE_2]: {
    line: 'rgba(251, 146, 60, 0.9)',      // orange-400
    shadow: 'rgba(0, 0, 0, 0.5)',
    point: 'rgba(251, 146, 60, 1)'
  },
  [PATH_SEGMENT_TYPES.SURGE_3]: {
    line: 'rgba(248, 113, 113, 0.85)',    // red-400 light
    shadow: 'rgba(0, 0, 0, 0.5)',
    point: 'rgba(248, 113, 113, 1)'
  },
  [PATH_SEGMENT_TYPES.SURGE_4]: {
    line: 'rgba(239, 68, 68, 0.8)',       // red-500
    shadow: 'rgba(0, 0, 0, 0.4)',
    point: 'rgba(239, 68, 68, 1)'
  },
  [PATH_SEGMENT_TYPES.UNREACHABLE]: {
    line: 'rgba(239, 68, 68, 0.6)',       // red-500 transparent
    shadow: 'rgba(0, 0, 0, 0.3)',
    point: 'rgba(239, 68, 68, 0.9)'
  }
}

/**
 * Разбить путь на сегменты по ресурсам
 * 
 * @param {Array} path - путь [{q, r, cost}]
 * @param {Object} resources - ресурсы персонажа
 * @param {number} resources.movement - текущие очки движения
 * @param {number} resources.surges - текущие порывы
 * @param {number} resources.movementPerSurge - очков движения за порыв
 * @returns {Object} - { segments: [], usedResources: {}, reachable: boolean }
 */
export function segmentPath(path, resources) {
  if (!path || path.length < 2) {
    return { segments: [], usedResources: { movement: 0, surges: 0 }, reachable: true }
  }
  
  const {
    movement = 5,
    surges = 2,
    movementPerSurge = 2
  } = resources || {}
  
  const segments = []
  let remainingMovement = movement
  let remainingSurges = surges
  let usedMovement = 0
  let usedSurges = 0
  
  // Границы ресурсов (cost на котором заканчивается ресурс)
  const boundaries = []
  
  // Первая граница - конец основного движения
  boundaries.push({ cost: movement, type: PATH_SEGMENT_TYPES.MOVEMENT })
  
  // Границы для каждого порыва
  let cumulativeCost = movement
  for (let i = 0; i < surges; i++) {
    cumulativeCost += movementPerSurge
    const surgeType = i === 0 ? PATH_SEGMENT_TYPES.SURGE_1 
                    : i === 1 ? PATH_SEGMENT_TYPES.SURGE_2
                    : i === 2 ? PATH_SEGMENT_TYPES.SURGE_3
                    : PATH_SEGMENT_TYPES.SURGE_4
    boundaries.push({ cost: cumulativeCost, type: surgeType })
  }
  
  // Определяем тип для стоимости
  const getTypeForCost = (cost) => {
    if (cost <= movement) return PATH_SEGMENT_TYPES.MOVEMENT
    
    let accCost = movement
    for (let i = 0; i < surges; i++) {
      accCost += movementPerSurge
      if (cost <= accCost) {
        return i === 0 ? PATH_SEGMENT_TYPES.SURGE_1 
             : i === 1 ? PATH_SEGMENT_TYPES.SURGE_2
             : i === 2 ? PATH_SEGMENT_TYPES.SURGE_3
             : PATH_SEGMENT_TYPES.SURGE_4
      }
    }
    return PATH_SEGMENT_TYPES.UNREACHABLE
  }
  
  // Максимальная достижимая стоимость
  const maxReachableCost = movement + surges * movementPerSurge
  
  // Строим сегменты
  let currentSegment = {
    type: getTypeForCost(0.01), // Начальный тип
    path: [path[0]],
    startCost: 0,
    endCost: 0,
    hasEndpoint: false,
    isFinal: false
  }
  
  for (let i = 1; i < path.length; i++) {
    const hex = path[i]
    const prevHex = path[i - 1]
    const hexType = getTypeForCost(hex.cost)
    const prevType = getTypeForCost(prevHex.cost)
    
    // Если тип изменился - закрываем текущий сегмент и начинаем новый
    if (hexType !== prevType) {
      // Закрываем текущий сегмент с точкой на границе
      currentSegment.endCost = prevHex.cost
      currentSegment.hasEndpoint = true
      segments.push(currentSegment)
      
      // Начинаем новый сегмент
      currentSegment = {
        type: hexType,
        path: [prevHex, hex], // Включаем предыдущий гекс для плавной линии
        startCost: prevHex.cost,
        endCost: hex.cost,
        hasEndpoint: false,
        isFinal: false
      }
    } else {
      // Тот же тип - добавляем в текущий сегмент
      currentSegment.path.push(hex)
      currentSegment.endCost = hex.cost
    }
  }
  
  // Закрываем последний сегмент
  currentSegment.hasEndpoint = true
  currentSegment.isFinal = true
  segments.push(currentSegment)
  
  // Вычисляем использованные ресурсы
  const totalCost = path[path.length - 1].cost
  if (totalCost <= movement) {
    usedMovement = totalCost
  } else {
    usedMovement = movement
    const surgesCost = totalCost - movement
    usedSurges = Math.min(surges, Math.ceil(surgesCost / movementPerSurge))
  }
  
  // Определяем достижимость
  const lastSegment = segments[segments.length - 1]
  const reachable = lastSegment?.type !== PATH_SEGMENT_TYPES.UNREACHABLE
  
  return {
    segments,
    usedResources: {
      movement: usedMovement,
      surges: usedSurges
    },
    reachable
  }
}
