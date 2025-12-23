# Data / Игровые данные

JSON-файлы с данными игровой системы.

## Персонажи и создание

### races.json
Расы персонажей.
```json
{ "id": "human", "name": "Человек", "bonuses": {...}, "traits": [...] }
```

### subraces.json
Подрасы для каждой расы.
```json
{ "id": "wood_elf", "race": "elf", "name": "Лесной эльф", ... }
```

### classes.json
Классы персонажей.
```json
{ "id": "warrior", "name": "Воин", "hitDie": "d10", "skills": [...] }
```

### aspects.json
Аспекты персонажа для радар-диаграммы.
```json
{ "id": "strength", "name": "Сила", "color": "#ff0000" }
```

### skills.json
Навыки персонажей.
```json
{ "id": "athletics", "name": "Атлетика", "stat": "strength" }
```

## Экипировка

### items.json
Все предметы игры (оружие, броня, предметы).
```json
{
  "id": "longsword",
  "name": "Длинный меч",
  "type": "weapon",
  "damage": "1d8",
  "properties": ["versatile"]
}
```

### itemTypes.json
Категории и типы предметов.

### epochs.json
Эпохи и их ограничения на экипировку.
```json
{ "id": "medieval", "name": "Средневековье", "weapons": [...] }
```

### wealths.json
Уровни богатства и стартовые деньги.

## Игровой процесс

### terrains.json
Типы terrain для карты.
```json
{ "id": "forest", "name": "Лес", "color": "#228b22", "cover": true }
```

### diffs.json
Уровни сложности проверок.
```json
{ "id": "easy", "dc": 10, "name": "Лёгкая" }
```

### npcTemplates.json
Шаблоны NPC и монстров для мастера.
```json
{
  "categories": [
    { "id": "humanoids", "name": "Гуманоиды", "templates": [...] }
  ]
}
```

### playerIcons.json
Иконки для игроков.

## Использование в коде

```javascript
import racesData from '@/data/races.json'
import classesData from '@/data/classes.json'

const race = racesData.find(r => r.id === 'human')
```

## CLASS_TEMPLATE.md
Шаблон для добавления нового класса в систему.
