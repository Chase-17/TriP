/**
 * Character utilities - реэкспорт всех функций для работы с персонажами
 */

// Система ран и здоровья
export {
  calculateMaxHP,
  applyDamageToHP,
  getDamageType,
  calculateWoundSlots,
  addWound,
  removeWound,
  calculateWoundPenalties,
  isCharacterAlive
} from './wounds'

// Проверки характеристик
export {
  getAspect,
  getWoundsPenalty,
  getCheckModifiers,
  getCheckBonus,
  getAllCheckBonuses,
  getCheckBonusesForUI
} from './checks'

// Защита
export {
  getTreacheryBonus,
  getArmorData,
  getWeaponDefenceBonus,
  calculateDefence,
  getDefenceData
} from './defence'

// Миграция навыков
export {
  migrateSkill,
  migrateCharacterSkills,
  getSkillDisplayData
} from './skills'
