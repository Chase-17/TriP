/**
 * Утилиты для расчёта защиты персонажа
 * 
 * Формула защиты:
 * - Фронт: 6 + Treachery + броня + щит/парирование
 * - Фланг: 3 + Treachery/2 + броня
 * - Спина: 0 + Treachery/2 + броня
 * 
 * Treachery (Коварство) — это бонус проверки аспекта Shadow,
 * рассчитывается через getCheckBonus('shadow')
 */
import itemsData from '@/data/items.json'
import { getCheckBonus } from '@/utils/checks.js'

// Маппинг предметов
const itemsMap = {}
Object.keys(itemsData).forEach(category => {
  if (Array.isArray(itemsData[category])) {
    itemsData[category].forEach(item => {
      itemsMap[item.id] = item
    })
  }
})

/**
 * Получить бонус проверки Treachery (Коварство) для персонажа
 * Это просто обёртка над getCheckBonus для аспекта shadow
 * 
 * @param {Object} character - персонаж
 * @returns {number} - бонус проверки Treachery
 */
export const getTreacheryBonus = (character) => {
  return getCheckBonus(character, 'shadow')
}

/**
 * Получить данные брони персонажа
 */
export const getArmorData = (character) => {
  const armorId = character?.equipment?.armor
  if (!armorId) return null
  return itemsMap[armorId] || null
}

/**
 * Получить бонус защиты от оружия/щита
 */
export const getWeaponDefenceBonus = (character, direction, attackType) => {
  const activeSetIndex = character?.equipment?.activeSetIndex ?? 0
  const weaponSets = character?.equipment?.weaponSets || []
  const activeSet = weaponSets[activeSetIndex]
  
  if (!activeSet || !activeSet.weapons) return 0
  
  let bonus = 0
  
  for (const weaponId of activeSet.weapons) {
    const item = itemsMap[weaponId]
    if (!item) continue
    
    // Щит даёт защиту только спереди
    if (item.type === 'shield') {
      if (direction === 'front') {
        if (attackType === 'melee') {
          bonus += item.defenceMelee || 0
        } else if (attackType === 'ranged') {
          bonus += item.defenceRanged || 0
        }
      }
    }
    
    // Оружие с парированием (парирующий кинжал и т.п.)
    if (item.parry && direction === 'front' && attackType === 'melee') {
      bonus += item.parry || 0
    }
  }
  
  return bonus
}

/**
 * Вычислить защиту для конкретного направления и типа атаки
 * @param {Object} character - персонаж
 * @param {string} direction - 'front', 'flank', 'back'
 * @param {string} attackType - 'melee', 'ranged'
 * @returns {number} - значение защиты
 */
export const calculateDefence = (character, direction, attackType) => {
  // Бонус Treachery (уже включает штрафы от ранений)
  const treacheryBonus = getTreacheryBonus(character)
  const halfTreachery = Math.floor(treacheryBonus / 2)
  
  const armorData = getArmorData(character)
  const armorDefence = armorData?.defence || 0
  
  const weaponBonus = getWeaponDefenceBonus(character, direction, attackType)
  
  let baseDefence = 0
  let treacheryMod = 0
  
  if (direction === 'front') {
    baseDefence = 6
    treacheryMod = treacheryBonus
  } else if (direction === 'flank') {
    baseDefence = 3
    treacheryMod = halfTreachery
  } else if (direction === 'back') {
    baseDefence = 0
    treacheryMod = halfTreachery
  }
  
  // Защита не может быть меньше 0
  return Math.max(0, baseDefence + treacheryMod + armorDefence + weaponBonus)
}

/**
 * Получить объект с защитой для всех направлений (для передачи в CharacterPortrait)
 * @param {Object} character - персонаж
 * @param {string} attackType - 'melee' или 'ranged'
 * @returns {Object} - { front, flank, back }
 */
export const getDefenceData = (character, attackType) => {
  return {
    front: calculateDefence(character, 'front', attackType),
    flank: calculateDefence(character, 'flank', attackType),
    back: calculateDefence(character, 'back', attackType)
  }
}
