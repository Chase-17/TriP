# Character Utilities / Утилиты персонажа

Функции для работы с персонажами, боевой системой и характеристиками.

## wounds.js - Система ран и HP

### Простая система (HP)
```javascript
const maxHP = calculateMaxHP(stats)
// Базовое HP = 8
// +1 за каждые 3 Разума (knowledge)
// +3 за каждые 6 Мощи (war)
// +6 за каждые 8 Восприятия (nature)

const newHP = applyDamageToHP(currentHP, maxHP, damage)
const type = getDamageType(damage) // 'scratch' | 'light' | 'heavy' | 'deadly'
```

### Продвинутая система (Раны)
```javascript
// Слоты ранений
const slots = calculateWoundSlots(stats, bonusDeadlySlots)
// { scratch: {base: 3, bonus: N}, light: {base: 2, bonus: M}, ... }

// Добавить/удалить рану (с переполнением)
const newWounds = addWound(currentWounds, slots, 'light')
const newWounds = removeWound(currentWounds, 'scratch')

// Штрафы
const penalty = calculateWoundPenalties(wounds, slots)
// Лёгкие: -3 за базовый слот
// Тяжёлые: -6 за базовый слот
// Смертельные: -9 за каждое

// Проверка жизни
const alive = isCharacterAlive(wounds, slots)
```

## checks.js - Проверки характеристик

```javascript
// Бонус проверки для аспекта
const bonus = getCheckBonus(character, 'war')
// Формула: max(
//   floor(aspect + neighbor1/2 + neighbor2/2),
//   floor(opposite/2)
// ) + modifiers

// Все бонусы
const bonuses = getAllCheckBonuses(character)
// { war: 5, knowledge: 3, community: 4, ... }

// Для UI (с названиями и иконками)
const uiData = getCheckBonusesForUI(character)
```

## defence.js - Защита

```javascript
// Полные данные защиты
const defence = getDefenceData(character, 'melee')
// { front: 12, flank: 8, back: 5 }

// Формула:
// Front: 6 + Treachery + броня + щит
// Flank: 3 + Treachery/2 + броня
// Back: 0 + Treachery/2 + броня

// Отдельные компоненты
const treachery = getTreacheryBonus(character) // = getCheckBonus('shadow')
const armor = getArmorData(character)
const weaponBonus = getWeaponDefenceBonus(character, 'front', 'melee')
```

## skills.js - Навыки

### Миграция из старого формата
```javascript
// Старый: ["martialArts", "steelShines"]
// Новый: [{ id, sourceType, sourceId, level, customDescriptions }]

const { migrated, needsSave } = migrateCharacterSkills(character.skills)
```

### Данные для отображения
```javascript
const displayData = getSkillDisplayData(skill)
// { name, description, tags, icon, ... }
```
