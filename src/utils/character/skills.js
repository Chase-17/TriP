/**
 * Утилита для миграции навыков из старого формата (строки) в новый (объекты)
 * 
 * Старый формат: ["martialArts", "steelShines", "oneAmongBeasts"]
 * Новый формат: [
 *   { id: "martialArts", sourceType: "class", sourceId: "warrior", level: 1, customDescription: {}, customTags: {} },
 *   ...
 * ]
 */

import classesData from '@/data/classes.json'
import aspectsData from '@/data/aspects.json'
import racesData from '@/data/races.json'

/**
 * Поиск навыка по ID в классах
 * @returns {{ sourceType: string, sourceId: string, trait: object } | null}
 */
function findSkillInClasses(skillId) {
  for (const cls of classesData.classes) {
    const trait = cls.traits?.find(t => t.id === skillId)
    if (trait) {
      return {
        sourceType: 'class',
        sourceId: cls.id,
        trait
      }
    }
  }
  return null
}

/**
 * Поиск навыка по ID в аспектах
 * @returns {{ sourceType: string, sourceId: string, trait: object } | null}
 */
function findSkillInAspects(skillId) {
  for (const aspect of aspectsData.aspects) {
    const trait = aspect.traits?.find(t => t.id === skillId)
    if (trait) {
      return {
        sourceType: 'aspect',
        sourceId: aspect.id,
        trait
      }
    }
  }
  return null
}

/**
 * Поиск навыка по ID в расах
 * @returns {{ sourceType: string, sourceId: string, trait: object } | null}
 */
function findSkillInRaces(skillId) {
  for (const race of racesData.races) {
    const trait = race.traits?.find(t => t.id === skillId)
    if (trait) {
      return {
        sourceType: 'race',
        sourceId: race.id,
        trait
      }
    }
  }
  return null
}

/**
 * Найти навык по ID во всех источниках
 * @param {string} skillId 
 * @returns {{ sourceType: string, sourceId: string, trait: object } | null}
 */
function findSkillById(skillId) {
  return findSkillInClasses(skillId) 
    || findSkillInAspects(skillId) 
    || findSkillInRaces(skillId)
    || null
}

/**
 * Преобразует навык из старого формата в новый
 * @param {string | object} skill - Навык в старом (строка) или новом (объект) формате
 * @returns {object | null} - Навык в новом формате или null если не найден
 */
export function migrateSkill(skill) {
  // Уже новый формат (объект)
  if (typeof skill === 'object' && skill !== null) {
    // Проверяем, что есть все нужные поля
    if (skill.id && skill.sourceType && skill.sourceId) {
      const result = {
        id: skill.id,
        sourceType: skill.sourceType,
        sourceId: skill.sourceId,
        level: skill.level || 1,
        customDescriptions: skill.customDescriptions || {}, // { 1: "...", 2: "...", 3: "..." }
        customTags: skill.customTags || {} // { 1: [...], 2: [...], 3: [...] }
      }
      // Сохраняем кастомный цвет метки если он есть
      if (skill.customColor) {
        result.customColor = skill.customColor
      }
      return result
    }
    
    // Старый объектный формат { id, level } без sourceType
    if (skill.id) {
      const found = findSkillById(skill.id)
      if (found) {
        return {
          id: skill.id,
          sourceType: found.sourceType,
          sourceId: found.sourceId,
          level: skill.level || 1,
          customDescriptions: skill.customDescriptions || skill.customDescription ? { [skill.level || 1]: skill.customDescription } : {},
          customTags: skill.customTags || {}
        }
      }
    }
    
    return null
  }
  
  // Старый формат (строка)
  if (typeof skill === 'string') {
    const found = findSkillById(skill)
    if (found) {
      return {
        id: skill,
        sourceType: found.sourceType,
        sourceId: found.sourceId,
        level: 1,
        customDescriptions: {},
        customTags: {}
      }
    }
    
    console.warn(`[SkillsMigration] Навык "${skill}" не найден ни в одном источнике`)
    return null
  }
  
  return null
}

/**
 * Мигрирует массив навыков персонажа
 * @param {Array<string | object>} skills - Массив навыков
 * @returns {{ migrated: Array<object>, needsSave: boolean }} - Мигрированные навыки и флаг необходимости сохранения
 */
export function migrateCharacterSkills(skills) {
  if (!Array.isArray(skills)) {
    return { migrated: [], needsSave: false }
  }
  
  let needsSave = false
  const migrated = []
  
  for (const skill of skills) {
    // Проверяем, нужна ли миграция
    const isOldFormat = typeof skill === 'string' || 
      (typeof skill === 'object' && skill && !skill.sourceType)
    
    if (isOldFormat) {
      needsSave = true
    }
    
    const migratedSkill = migrateSkill(skill)
    if (migratedSkill) {
      migrated.push(migratedSkill)
    }
  }
  
  return { migrated, needsSave }
}

/**
 * Получает данные навыка для отображения
 * @param {object} skill - Навык в новом формате
 * @returns {object} - Полные данные навыка для UI
 */
export function getSkillDisplayData(skill) {
  const found = findSkillById(skill.id)
  if (!found) {
    return {
      ...skill,
      name: skill.id,
      maxLevel: 1,
      levels: [],
      sourceName: 'Неизвестно',
      sourceIcon: 'mdi:help-circle',
      sourceColor: '#94a3b8',
      aspectColor: '#94a3b8',
      currentDescription: ''
    }
  }
  
  const trait = found.trait
  const maxLevel = trait.levels?.length || 1
  
  // Получаем информацию об источнике
  let sourceName = ''
  let sourceIcon = 'mdi:help-circle'
  let sourceColor = '#94a3b8'
  let sourceImage = null // Картинка класса
  let aspectColor = '#94a3b8'
  let aspectId = null
  let aspectIcon = null
  
  if (found.sourceType === 'class') {
    const classInfo = classesData.classes.find(c => c.id === found.sourceId)
    sourceIcon = 'mdi:school'
    sourceName = classInfo ? (classInfo.name.m || classInfo.name) : found.sourceId
    // Картинка класса (с учётом base URL)
    const baseUrl = import.meta.env.BASE_URL || '/'
    sourceImage = `${baseUrl}images/classes/${found.sourceId}.png`
    // Берём первый аспект класса для цвета
    if (classInfo?.aspects?.[0]) {
      aspectId = classInfo.aspects[0]
      const aspect = aspectsData.aspects.find(a => a.id === aspectId)
      if (aspect) {
        aspectColor = aspect.color || '#94a3b8'
        aspectIcon = aspect.icon
      }
    }
  } else if (found.sourceType === 'aspect') {
    const aspectInfo = aspectsData.aspects.find(a => a.id === found.sourceId)
    sourceIcon = aspectInfo?.icon || 'mdi:hexagon'
    sourceColor = aspectInfo?.color || '#94a3b8'
    aspectColor = sourceColor
    aspectIcon = aspectInfo?.icon
    sourceName = aspectInfo?.name || found.sourceId
    aspectId = found.sourceId
  } else if (found.sourceType === 'race') {
    const raceInfo = racesData.races.find(r => r.id === found.sourceId)
    sourceIcon = 'mdi:account'
    sourceName = raceInfo?.name || found.sourceId
  }
  
  // Описания всех уровней до текущего включительно
  const unlockedLevels = []
  for (let i = 0; i < skill.level; i++) {
    const lvlData = trait.levels?.[i]
    if (lvlData) {
      unlockedLevels.push({
        level: i + 1,
        description: lvlData.text || lvlData.description || '',
        customDescription: skill.customDescriptions?.[i + 1] || '',
        customTags: skill.customTags?.[i + 1] || []
      })
    }
  }
  
  // Описание только текущего (максимального) уровня для краткого отображения
  const currentLevelData = trait.levels?.[skill.level - 1]
  const currentDescription = currentLevelData?.text || currentLevelData?.description || ''
  
  // Общая заметка и теги для всего навыка (уровень 0)
  const customDescription = skill.customDescriptions?.[0] || skill.customDescriptions?.[skill.level] || ''
  const customTags = skill.customTags?.[0] || skill.customTags?.[skill.level] || []
  
  // Кастомный цвет метки (если задан игроком)
  const customColor = skill.customColor || null
  
  return {
    id: skill.id,
    name: trait.name,
    sourceType: skill.sourceType,
    sourceId: skill.sourceId,
    level: skill.level,
    maxLevel,
    levels: trait.levels || [],
    unlockedLevels, // Все открытые уровни с описаниями
    sourceName,
    sourceIcon,
    sourceColor,
    sourceImage,
    aspectId,
    aspectColor,
    aspectIcon,
    currentDescription,
    customDescription,
    customTags,
    customColor, // Кастомный цвет метки
    // Полные данные для редактирования
    customDescriptions: skill.customDescriptions || {},
    allCustomTags: skill.customTags || {}
  }
}
