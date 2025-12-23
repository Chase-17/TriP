/**
 * Система проходимости гексов
 * 
 * Каждый гекс может иметь несколько источников правил проходимости:
 * - terrain: базовый террейн
 * - objects: объекты на гексе (забор, баррикада, канат)
 * - tokens: токены (существа) на гексе
 * - effects: временные эффекты (огонь, лёд, яд)
 * 
 * Каждый источник содержит массив правил. Система выбирает лучшее
 * подходящее правило для персонажа из каждого источника, затем
 * комбинирует результаты.
 */

/**
 * Стандартные теги проходимости
 */
export const PASSABILITY_TAGS = {
  // Способности движения
  FLIGHT: 'flight',           // Полёт
  SWIMMING: 'swimming',       // Плавание
  PHASING: 'phasing',         // Бестелесность (проход сквозь стены)
  CLIMBING: 'climbing',       // Лазание
  ACROBAT: 'acrobat',         // Акробатика
  
  // Сопротивления
  FIRE_RESIST: 'fire_resist',
  COLD_RESIST: 'cold_resist', 
  ACID_RESIST: 'acid_resist',
  POISON_RESIST: 'poison_resist',
  
  // Блокеры
  CREATURE: 'creature',       // Существо (блокирует как стена)
  // Размеры существ (для будущего)
  // XS_CREATURE: 'xs_creature',
  // S_CREATURE: 's_creature',
  // LG_CREATURE: 'lg_creature',
  // XL_CREATURE: 'xl_creature',
  
  // Специальные
  BLOCKED: 'blocked',         // Абсолютная блокировка (никто не пройдёт)
  ALLY: 'ally',               // Союзник (динамический тег)
}

/**
 * Максимальная категория урона
 */
export const MAX_DAMAGE_CATEGORY = 7

/**
 * Правило проходимости по умолчанию
 */
export const DEFAULT_RULE = { cost: 1, damage: 0 }

/**
 * Структура правила проходимости:
 * {
 *   requires?: string[],  // Теги, которые ДОЛЖНЫ быть у персонажа (AND)
 *   cost?: number,        // Стоимость прохода (default: 1)
 *   damage?: number,      // Категория урона при проходе (0-7, default: 0)
 *   override?: boolean,   // Если true, cost не складывается с другими
 *   blocked?: boolean,    // Абсолютная блокировка
 * }
 */

/**
 * Проверить, подходит ли правило для персонажа
 * 
 * @param {Object} rule - правило проходимости
 * @param {Set<string>} characterTags - теги способностей персонажа
 * @returns {boolean}
 */
export function ruleMatchesCharacter(rule, characterTags) {
  // Абсолютная блокировка - никто не проходит
  if (rule.blocked) return false
  
  // Нет требований - подходит всем
  if (!rule.requires || rule.requires.length === 0) return true
  
  // Все теги из requires должны быть у персонажа
  return rule.requires.every(tag => characterTags.has(tag))
}

/**
 * Найти лучшее подходящее правило из массива
 * Правила проверяются по порядку, возвращается первое подходящее
 * (предполагается сортировка от специфичных к общим)
 * 
 * @param {Array} rules - массив правил
 * @param {Set<string>} characterTags - теги персонажа
 * @returns {Object|null} - лучшее правило или null если ничего не подходит
 */
export function findBestRule(rules, characterTags) {
  if (!rules || rules.length === 0) {
    return DEFAULT_RULE
  }
  
  for (const rule of rules) {
    if (ruleMatchesCharacter(rule, characterTags)) {
      return {
        cost: rule.cost ?? 1,
        damage: rule.damage ?? 0,
        override: rule.override ?? false
      }
    }
  }
  
  // Ни одно правило не подходит - непроходимо
  return null
}

/**
 * Рассчитать итоговую проходимость гекса для персонажа
 * 
 * @param {Object} hexPassability - объект с правилами от разных источников
 *   { terrain: [], objects: [], tokens: [], effects: [] }
 * @param {Set<string>|Array<string>} characterTags - теги способностей персонажа
 * @returns {Object} - { passable: boolean, cost: number, damage: number }
 */
export function calculatePassability(hexPassability, characterTags) {
  // Преобразуем массив в Set если нужно
  const tags = characterTags instanceof Set 
    ? characterTags 
    : new Set(characterTags || [])
  
  const sources = ['terrain', 'objects', 'tokens', 'effects']
  
  let totalCost = 0
  let maxDamage = 0
  let hasOverride = false
  let overrideCost = 0
  
  for (const source of sources) {
    const rules = hexPassability?.[source]
    if (!rules || rules.length === 0) continue
    
    const bestRule = findBestRule(rules, tags)
    
    // Источник не пропускает персонажа
    if (bestRule === null) {
      return { passable: false, cost: Infinity, damage: 0 }
    }
    
    // Обработка override (например, канат над пропастью)
    if (bestRule.override) {
      hasOverride = true
      overrideCost = Math.max(overrideCost, bestRule.cost)
    } else {
      totalCost += bestRule.cost
    }
    
    // Урон - берём максимальную категорию
    maxDamage = Math.max(maxDamage, bestRule.damage)
  }
  
  // Финальная стоимость
  const finalCost = hasOverride ? overrideCost : totalCost
  
  return {
    passable: true,
    cost: Math.max(0.5, finalCost), // Минимум 0.5 (дорога)
    damage: Math.min(maxDamage, MAX_DAMAGE_CATEGORY)
  }
}

/**
 * Создать правила проходимости для токена (существа)
 * 
 * @param {string} ownerId - ID владельца токена
 * @param {Object} options - опции
 * @returns {Array} - массив правил
 */
export function createTokenPassabilityRules(ownerId, options = {}) {
  const { 
    size = 'medium',  // xs, s, medium, lg, xl
    allowAllies = true 
  } = options
  
  const rules = []
  
  // Союзники могут проходить бесплатно
  if (allowAllies) {
    rules.push({ requires: [`ally_of_${ownerId}`], cost: 0 })
  }
  
  // Бестелесные проходят через существ
  rules.push({ requires: ['phasing'], cost: 1 })
  
  // Для остальных - требуется тег creature (которого обычно нет)
  // Это означает блокировку
  rules.push({ requires: ['creature'], cost: 1 })
  
  return rules
}

/**
 * Создать правила проходимости от террейна
 * Конвертирует старый формат (passability: 'solid') в новый
 * 
 * @param {Object} terrain - данные террейна
 * @returns {Array} - массив правил
 */
export function terrainToPassabilityRules(terrain) {
  if (!terrain) return [DEFAULT_RULE]
  
  const oldPassability = terrain.passability
  const baseCost = terrain.movementCost ?? 1
  
  // Новый формат - уже массив правил
  if (Array.isArray(terrain.passabilityRules)) {
    return terrain.passabilityRules
  }
  
  // Конвертируем старый формат
  switch (oldPassability) {
    case 'open':
      return [{ cost: baseCost }]
      
    case 'difficult':
      return [{ cost: baseCost }]
      
    case 'liquid':
      // Летающие и плавающие проходят
      return [
        { requires: ['flight'], cost: 1 },
        { requires: ['swimming'], cost: baseCost }
      ]
      
    case 'solid':
      // Только бестелесные
      return [
        { requires: ['phasing'], cost: 1 }
      ]
      
    case 'void':
      // Никто не проходит
      return [{ blocked: true }]
      
    default:
      return [{ cost: baseCost }]
  }
}

/**
 * Собрать все правила проходимости для гекса
 * 
 * @param {Object} terrainData - данные террейна
 * @param {Array} objects - объекты на гексе
 * @param {Object|null} token - токен на гексе (или null)
 * @param {Array} effects - эффекты на гексе
 * @param {string} viewerId - ID смотрящего (для определения союзников)
 * @returns {Object} - { terrain: [], objects: [], tokens: [], effects: [] }
 */
export function buildHexPassability(terrainData, objects = [], token = null, effects = [], viewerId = null) {
  const result = {
    terrain: terrainToPassabilityRules(terrainData),
    objects: [],
    tokens: [],
    effects: []
  }
  
  // Правила от объектов
  for (const obj of objects) {
    if (obj.passabilityRules) {
      result.objects.push(...obj.passabilityRules)
    }
  }
  
  // Правила от токена
  if (token) {
    // Свой токен не блокирует
    if (token.characterId !== viewerId) {
      result.tokens = createTokenPassabilityRules(token.ownerId || token.characterId, {
        allowAllies: true
      })
    }
  }
  
  // Правила от эффектов
  for (const effect of effects) {
    if (effect.passabilityRules) {
      result.effects.push(...effect.passabilityRules)
    }
  }
  
  return result
}
