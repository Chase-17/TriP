/**
 * Утилиты для расчёта бонусов проверок
 * 
 * Формула бонуса проверки для аспекта:
 * - Primary: floor(aspect + neighbor1/2 + neighbor2/2 + modifiers)
 * - Alternative: floor(opposite/2)
 * - Результат: max(primary, alternative)
 * 
 * Modifiers включают:
 * - Штрафы от ранений (отрицательные)
 * - Бонусы от эффектов (в будущем)
 */

import aspectsData from '@/data/aspects.json'
import { calculateWoundSlots, calculateWoundPenalties } from './wounds.js'

// Маппинг аспектов для быстрого доступа
const aspectsMap = {}
aspectsData.aspects.forEach(aspect => {
  aspectsMap[aspect.id] = aspect
})

/**
 * Получить данные аспекта по ID
 */
export const getAspect = (aspectId) => {
  return aspectsMap[aspectId] || null
}

/**
 * Рассчитать штраф от ранений
 * @param {Object} character - персонаж
 * @returns {number} штраф (положительное число, нужно вычитать)
 */
export const getWoundsPenalty = (character) => {
  const stats = character?.stats || {}
  const woundsRaw = character?.combat?.wounds || character?.wounds || {}
  
  // Если нет данных о ранениях, штрафа нет
  if (!woundsRaw.scratch && !woundsRaw.light && !woundsRaw.heavy && !woundsRaw.deadly) {
    return 0
  }
  
  // Адаптируем формат: в персонаже wounds.light это число,
  // а calculateWoundPenalties ожидает wounds.light.current
  const wounds = {
    scratch: { current: typeof woundsRaw.scratch === 'number' ? woundsRaw.scratch : (woundsRaw.scratch?.current || 0) },
    light: { current: typeof woundsRaw.light === 'number' ? woundsRaw.light : (woundsRaw.light?.current || 0) },
    heavy: { current: typeof woundsRaw.heavy === 'number' ? woundsRaw.heavy : (woundsRaw.heavy?.current || 0) },
    deadly: { current: typeof woundsRaw.deadly === 'number' ? woundsRaw.deadly : (woundsRaw.deadly?.current || 0) }
  }
  
  const bonusDeadlySlots = character?.combat?.bonusDeadlySlots || 0
  const slots = calculateWoundSlots(stats, bonusDeadlySlots)
  
  // calculateWoundPenalties возвращает отрицательное число
  return -calculateWoundPenalties(wounds, slots)
}

/**
 * Получить все модификаторы для проверок (штрафы/бонусы)
 * @param {Object} character - персонаж
 * @returns {number} суммарный модификатор
 */
export const getCheckModifiers = (character) => {
  let modifiers = 0
  
  // Штраф от ранений
  modifiers -= getWoundsPenalty(character)
  
  // TODO: Добавить бонусы/штрафы от эффектов, состояний и т.д.
  // if (character?.conditions) { ... }
  
  return modifiers
}

/**
 * Рассчитать бонус проверки для конкретного аспекта
 * 
 * @param {Object} character - персонаж
 * @param {string} aspectId - ID аспекта (war, knowledge, community, shadow, mysticism, nature)
 * @returns {number} - бонус проверки
 */
export const getCheckBonus = (character, aspectId) => {
  const aspect = getAspect(aspectId)
  if (!aspect) return 0
  
  const stats = character?.stats || {}
  
  // Значения характеристик
  const aspectValue = stats[aspectId] || 0
  const neighbors = aspect.neighbors || []
  const neighbor1Value = stats[neighbors[0]] || 0
  const neighbor2Value = stats[neighbors[1]] || 0
  const oppositeValue = stats[aspect.opposite] || 0
  
  // Primary bonus: floor(aspect + neighbor1/2 + neighbor2/2)
  const primaryBonus = Math.floor(aspectValue + neighbor1Value / 2 + neighbor2Value / 2)
  
  // Alternative bonus: floor(opposite/2)
  const alternativeBonus = Math.floor(oppositeValue / 2)
  
  // Базовый бонус — максимум из двух вариантов
  const baseBonus = Math.max(primaryBonus, alternativeBonus)
  
  // Модификаторы (штрафы от ран и т.д.) применяются к финальному результату
  const modifiers = getCheckModifiers(character)
  
  // Бонус проверки может быть отрицательным
  return baseBonus + modifiers
}

/**
 * Получить все бонусы проверок для персонажа
 * 
 * @param {Object} character - персонаж
 * @returns {Object} - объект { war: number, knowledge: number, ... }
 */
export const getAllCheckBonuses = (character) => {
  const bonuses = {}
  
  aspectsData.aspects.forEach(aspect => {
    bonuses[aspect.id] = getCheckBonus(character, aspect.id)
  })
  
  return bonuses
}

/**
 * Получить полную информацию о бонусах проверок для UI
 * Включает название проверки, иконку и бонус
 * 
 * @param {Object} character - персонаж
 * @returns {Object} - объект { aspectId: { bonus, checkName, checkIcon } }
 */
export const getCheckBonusesForUI = (character) => {
  const bonuses = {}
  
  aspectsData.aspects.forEach(aspect => {
    bonuses[aspect.id] = {
      bonus: getCheckBonus(character, aspect.id),
      checkName: aspect.check?.name || '',
      checkNameEn: aspect.check?.nameEn || '',
      checkIcon: aspect.checkIcon
    }
  })
  
  return bonuses
}
