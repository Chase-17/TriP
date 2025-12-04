/**
 * Утилиты для работы с системой ранений и HP
 */

/**
 * Рассчитать максимальное количество HP для простой системы здоровья
 * @param {Object} stats - характеристики персонажа
 * @returns {number} максимальное HP
 */
export function calculateMaxHP(stats = {}) {
  let baseHP = 8
  
  // Каждый доп слот царапин добавляет +1 HP
  const scratchBonus = Math.floor((stats.knowledge || 0) / 3)
  baseHP += scratchBonus * 1
  
  // Каждый доп слот лёгких добавляет +3 HP
  const lightBonus = Math.floor((stats.war || 0) / 6)
  baseHP += lightBonus * 3
  
  // Каждый доп слот тяжёлых добавляет +6 HP
  const heavyBonus = Math.floor((stats.mysticism || 0) / 9)
  baseHP += heavyBonus * 6
  
  return baseHP
}

/**
 * Применить урон к HP с конвертацией в ранения разных типов
 * @param {number} currentHP - текущее HP
 * @param {number} maxHP - максимальное HP
 * @param {number} damage - урон (1=царапина, 3=лёгкое, 9=тяжёлое, 27=смертельное)
 * @returns {number} новое HP
 */
export function applyDamageToHP(currentHP, maxHP, damage) {
  return Math.max(0, currentHP - damage)
}

/**
 * Получить тип урона по количеству
 * @param {number} damage - урон
 * @returns {string} тип: 'scratch' | 'light' | 'heavy' | 'deadly'
 */
export function getDamageType(damage) {
  if (damage >= 27) return 'deadly'
  if (damage >= 9) return 'heavy'
  if (damage >= 3) return 'light'
  return 'scratch'
}

/**
 * Рассчитать максимальное количество слотов для каждого типа ранений
 * @param {Object} stats - характеристики персонажа
 * @returns {Object} объект с базовыми и бонусными слотами
 */
export function calculateWoundSlots(stats = {}) {
  return {
    scratch: {
      base: 3,
      bonus: Math.floor((stats.knowledge || 0) / 3)
    },
    light: {
      base: 2,
      bonus: Math.floor((stats.war || 0) / 6)
    },
    heavy: {
      base: 1,
      bonus: Math.floor((stats.mysticism || 0) / 9)
    },
    deadly: {
      base: 1,
      bonus: 0 // бонусные смертельные слоты получаются только через умения
    }
  }
}

/**
 * Добавить ранение с логикой переполнения
 * @param {Object} currentWounds - текущее состояние ранений { scratch: {current}, light: {current}, ... }
 * @param {Object} slots - максимальные слоты (результат calculateWoundSlots)
 * @param {string} woundType - тип ранения: 'scratch', 'light', 'heavy', 'deadly'
 * @returns {Object} новое состояние ранений
 */
export function addWound(currentWounds, slots, woundType) {
  const wounds = JSON.parse(JSON.stringify(currentWounds))
  
  const addWoundRecursive = (type) => {
    const maxSlots = slots[type].base + slots[type].bonus
    const current = wounds[type].current || 0
    
    if (current < maxSlots) {
      // Есть свободные слоты
      wounds[type].current = current + 1
    } else {
      // Слоты заполнены - переполнение
      if (type === 'scratch') {
        // Царапины переполнены - очищаем и добавляем лёгкое
        wounds.scratch.current = 0
        addWoundRecursive('light')
      } else if (type === 'light') {
        // Лёгкие переполнены - добавляем тяжёлое
        addWoundRecursive('heavy')
      } else if (type === 'heavy') {
        // Тяжёлые переполнены - добавляем смертельное
        addWoundRecursive('deadly')
      } else if (type === 'deadly') {
        // Смертельные переполнены - всё равно добавляем (персонаж скорее всего мёртв)
        wounds.deadly.current = current + 1
      }
    }
  }
  
  addWoundRecursive(woundType)
  return wounds
}

/**
 * Удалить ранение
 * @param {Object} currentWounds - текущее состояние ранений
 * @param {string} woundType - тип ранения для удаления
 * @returns {Object} новое состояние ранений
 */
export function removeWound(currentWounds, woundType) {
  const wounds = JSON.parse(JSON.stringify(currentWounds))
  const current = wounds[woundType].current || 0
  wounds[woundType].current = Math.max(0, current - 1)
  return wounds
}

/**
 * Рассчитать штрафы от ранений
 * @param {Object} currentWounds - текущее состояние ранений
 * @param {Object} slots - максимальные слоты
 * @returns {number} суммарный штраф
 */
export function calculateWoundPenalties(currentWounds, slots) {
  let penalty = 0
  
  // Лёгкие ранения: -3 если заполнены базовые слоты (штраф только от базовых)
  const lightCurrent = currentWounds.light?.current || 0
  const lightBonus = slots.light.bonus
  if (lightCurrent > lightBonus) {
    penalty -= 3
  }
  
  // Тяжёлые ранения: -6 если заполнены базовые слоты
  const heavyCurrent = currentWounds.heavy?.current || 0
  const heavyBonus = slots.heavy.bonus
  if (heavyCurrent > heavyBonus) {
    penalty -= 6
  }
  
  // Смертельные: -9 за каждое (обычно означает смерть или критическое состояние)
  const deadlyCurrent = currentWounds.deadly?.current || 0
  if (deadlyCurrent > 0) {
    penalty -= 9 * deadlyCurrent
  }
  
  return penalty
}

/**
 * Проверить, жив ли персонаж
 * @param {Object} currentWounds - текущее состояние ранений
 * @param {Object} slots - максимальные слоты
 * @returns {boolean} true если персонаж жив
 */
export function isCharacterAlive(currentWounds, slots) {
  const deadlyCurrent = currentWounds.deadly?.current || 0
  const deadlyMax = slots.deadly.base + slots.deadly.bonus
  
  // Персонаж мёртв если смертельные ранения превышают максимум
  return deadlyCurrent <= deadlyMax
}

/**
 * Получить статус здоровья персонажа
 * @param {Object} currentWounds - текущее состояние ранений
 * @param {Object} slots - максимальные слоты
 * @returns {Object} { status: 'healthy'|'wounded'|'critical'|'dying'|'dead', description: string }
 */
export function getHealthStatus(currentWounds, slots) {
  const deadlyCurrent = currentWounds.deadly?.current || 0
  const deadlyMax = slots.deadly.base + slots.deadly.bonus
  const heavyCurrent = currentWounds.heavy?.current || 0
  const lightCurrent = currentWounds.light?.current || 0
  const scratchCurrent = currentWounds.scratch?.current || 0
  
  if (deadlyCurrent > deadlyMax) {
    return { status: 'dead', description: 'Мёртв' }
  }
  
  if (deadlyCurrent > 0) {
    return { status: 'dying', description: 'При смерти' }
  }
  
  if (heavyCurrent > 0) {
    return { status: 'critical', description: 'Критическое состояние' }
  }
  
  if (lightCurrent > 0) {
    return { status: 'wounded', description: 'Ранен' }
  }
  
  if (scratchCurrent > 0) {
    return { status: 'scratched', description: 'Поцарапан' }
  }
  
  return { status: 'healthy', description: 'Здоров' }
}
