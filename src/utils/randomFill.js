/**
 * Алгоритм рандомной заливки с кластеризацией
 * Заполняет набор гексов согласно профилю заливки
 */

import { FILL_CONDITION_TYPES, COMPARISON_OPERATORS } from '@/stores/fillProfile'

/**
 * Генератор псевдослучайных чисел с seed (для воспроизводимости)
 */
class SeededRandom {
  constructor(seed = null) {
    this.seed = seed ?? Date.now()
    this.current = this.seed
  }
  
  // Линейный конгруэнтный генератор
  next() {
    this.current = (this.current * 1103515245 + 12345) & 0x7fffffff
    return this.current / 0x7fffffff
  }
  
  // Случайное целое в диапазоне [min, max]
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min
  }
  
  // Перемешать массив (Fisher-Yates)
  shuffle(array) {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i)
      ;[result[i], result[j]] = [result[j], result[i]]
    }
    return result
  }
}

/**
 * Получить соседей гекса (axial координаты)
 */
function getHexNeighbors(q, r) {
  return [
    { q: q + 1, r: r },
    { q: q + 1, r: r - 1 },
    { q: q, r: r - 1 },
    { q: q - 1, r: r },
    { q: q - 1, r: r + 1 },
    { q: q, r: r + 1 }
  ]
}

/**
 * Преобразовать ключ в координаты
 */
function keyToCoords(key) {
  const [q, r] = key.split(',').map(Number)
  return { q, r }
}

/**
 * Преобразовать координаты в ключ
 */
function coordsToKey(q, r) {
  return `${q},${r}`
}

/**
 * Проверить условие для террейна
 */
function checkCondition(condition, terrainInfo, terrainStore) {
  if (!condition || condition.type === FILL_CONDITION_TYPES.NONE) {
    return true
  }
  
  const { type, operator, value, minValue, maxValue } = condition
  
  // Получаем значение для сравнения
  let actualValue
  switch (type) {
    case FILL_CONDITION_TYPES.TERRAIN_ID:
      actualValue = terrainInfo?.id
      break
    case FILL_CONDITION_TYPES.TERRAIN_BIOME:
      actualValue = terrainInfo?.biome
      break
    case FILL_CONDITION_TYPES.VISIBILITY:
      actualValue = terrainInfo?.visibility
      break
    case FILL_CONDITION_TYPES.MOVEMENT_COST:
      actualValue = terrainInfo?.movementCost ?? 1
      break
    case FILL_CONDITION_TYPES.MELEE_ADVANTAGE:
      actualValue = terrainInfo?.meleeAdvantage ?? 0
      break
    case FILL_CONDITION_TYPES.TAG:
      actualValue = terrainInfo?.tags || []
      break
    case FILL_CONDITION_TYPES.RANDOM:
      // Для random условие всегда true (фильтруем по плотности отдельно)
      return true
    default:
      return true
  }
  
  // Сравниваем
  switch (operator) {
    case COMPARISON_OPERATORS.EQUALS:
      return actualValue === value
    case COMPARISON_OPERATORS.NOT_EQUALS:
      return actualValue !== value
    case COMPARISON_OPERATORS.GREATER:
      return actualValue > value
    case COMPARISON_OPERATORS.GREATER_EQUALS:
      return actualValue >= value
    case COMPARISON_OPERATORS.LESS:
      return actualValue < value
    case COMPARISON_OPERATORS.LESS_EQUALS:
      return actualValue <= value
    case COMPARISON_OPERATORS.CONTAINS:
      if (Array.isArray(actualValue)) {
        return actualValue.includes(value)
      }
      return String(actualValue).includes(String(value))
    default:
      return true
  }
}

/**
 * Проверить все условия слоя
 */
function checkAllConditions(layer, terrainInfo, terrainStore) {
  if (!layer.conditions || layer.conditions.length === 0) {
    return true
  }
  
  // Все условия должны быть выполнены (AND)
  return layer.conditions.every(cond => checkCondition(cond, terrainInfo, terrainStore))
}

/**
 * Выбрать гексы для заливки с учётом плотности и кластеризации
 * 
 * @param {string[]} candidateKeys - Ключи гексов-кандидатов
 * @param {number} density - Плотность (0-100%)
 * @param {number} clustering - Кластеризация (0-100)
 * @param {SeededRandom} rng - Генератор случайных чисел
 * @returns {Set<string>} - Выбранные ключи гексов
 */
function selectHexesWithClustering(candidateKeys, density, clustering, rng) {
  if (candidateKeys.length === 0) return new Set()
  
  const targetCount = Math.round(candidateKeys.length * (density / 100))
  if (targetCount === 0) return new Set()
  
  const selected = new Set()
  const candidates = new Set(candidateKeys)
  
  // Нормализуем кластеризацию к вероятности выбора соседа
  // 0 = чистый рандом, 100 = всегда выбираем соседа если возможно
  const neighborBias = clustering / 100
  
  // Начинаем с случайных стартовых точек
  // Количество стартовых точек зависит от кластеризации
  // Меньше кластеризация = больше стартовых точек = более разбросанное распределение
  const numSeeds = Math.max(1, Math.round(targetCount * (1 - neighborBias * 0.8)))
  
  const candidateArray = rng.shuffle([...candidates])
  
  // Выбираем стартовые точки
  const seeds = candidateArray.slice(0, Math.min(numSeeds, candidateArray.length))
  seeds.forEach(key => {
    selected.add(key)
    candidates.delete(key)
  })
  
  // Заполняем оставшиеся места
  while (selected.size < targetCount && candidates.size > 0) {
    // Решаем: выбирать соседа существующего или случайный
    const useNeighbor = rng.next() < neighborBias
    
    if (useNeighbor) {
      // Пытаемся найти соседа одного из выбранных гексов
      const selectedArray = [...selected]
      const shuffledSelected = rng.shuffle(selectedArray)
      
      let found = false
      for (const selectedKey of shuffledSelected) {
        const { q, r } = keyToCoords(selectedKey)
        const neighbors = getHexNeighbors(q, r)
        const shuffledNeighbors = rng.shuffle(neighbors)
        
        for (const neighbor of shuffledNeighbors) {
          const neighborKey = coordsToKey(neighbor.q, neighbor.r)
          if (candidates.has(neighborKey)) {
            selected.add(neighborKey)
            candidates.delete(neighborKey)
            found = true
            break
          }
        }
        if (found) break
      }
      
      // Если сосед не найден, выбираем случайный
      if (!found && candidates.size > 0) {
        const randomKey = rng.shuffle([...candidates])[0]
        selected.add(randomKey)
        candidates.delete(randomKey)
      }
    } else {
      // Выбираем случайный из оставшихся
      const randomKey = rng.shuffle([...candidates])[0]
      selected.add(randomKey)
      candidates.delete(randomKey)
    }
  }
  
  return selected
}

/**
 * Применить профиль заливки к набору гексов
 * 
 * @param {Object} profile - Профиль заливки
 * @param {string[]} hexKeys - Ключи гексов для заливки (из выделения)
 * @param {Object} terrainStore - Store террейнов (для получения инфо)
 * @param {Object} options - Дополнительные опции
 * @returns {Map<string, string>} - Карта: ключ гекса -> ID террейна
 */
export function applyFillProfile(profile, hexKeys, terrainStore, options = {}) {
  const { previewOnly = false, customSeed = null } = options
  
  if (!profile || !hexKeys || hexKeys.length === 0) {
    return new Map()
  }
  
  // Инициализируем генератор
  const seed = customSeed ?? profile.seed ?? Date.now()
  const rng = new SeededRandom(seed)
  
  // Результат: ключ -> terrainId
  const result = new Map()
  
  // Шаг 1: Заполняем все гексы базовым террейном
  for (const key of hexKeys) {
    result.set(key, profile.baseTerrain)
  }
  
  // Шаг 2: Применяем слои по порядку приоритета
  const sortedLayers = [...profile.layers]
    .filter(l => l.enabled && l.terrainId)
    .sort((a, b) => a.priority - b.priority)
  
  for (const layer of sortedLayers) {
    // Находим кандидатов - гексы, соответствующие условиям слоя
    const candidates = []
    
    for (const key of hexKeys) {
      const currentTerrainId = result.get(key)
      const terrainInfo = terrainStore.getTerrainById(currentTerrainId)
      
      if (checkAllConditions(layer, terrainInfo, terrainStore)) {
        candidates.push(key)
      }
    }
    
    // Выбираем гексы с учётом плотности и кластеризации
    const selectedKeys = selectHexesWithClustering(
      candidates,
      layer.density,
      layer.clustering,
      rng
    )
    
    // Применяем террейн слоя
    for (const key of selectedKeys) {
      result.set(key, layer.terrainId)
    }
  }
  
  return result
}

/**
 * Получить статистику заливки
 */
export function getFillStats(fillResult, terrainStore) {
  const stats = {
    total: fillResult.size,
    byTerrain: {}
  }
  
  fillResult.forEach((terrainId, key) => {
    if (!stats.byTerrain[terrainId]) {
      const info = terrainStore.getTerrainById(terrainId)
      stats.byTerrain[terrainId] = {
        id: terrainId,
        name: info?.name || terrainId,
        count: 0,
        percent: 0
      }
    }
    stats.byTerrain[terrainId].count++
  })
  
  // Считаем проценты
  Object.values(stats.byTerrain).forEach(s => {
    s.percent = Math.round((s.count / stats.total) * 100)
  })
  
  return stats
}

/**
 * Сгенерировать превью (только вычисляем, не применяем)
 */
export function generateFillPreview(profile, hexKeys, terrainStore, seed = null) {
  return applyFillProfile(profile, hexKeys, terrainStore, {
    previewOnly: true,
    customSeed: seed ?? Date.now()
  })
}

export { SeededRandom }
