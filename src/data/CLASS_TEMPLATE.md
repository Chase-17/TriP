# Шаблон для добавления классов

## Структура класса

```json
{
  "id": "class_id",
  "name": "Название",
  "nameEn": "English Name",
  "description": "Описание класса, его роль и особенности",
  "type": "inner",  // или "outer"
  "aspects": ["aspect1", "aspect2"],  // или ["aspect1"] для outer
  "position": {
    "type": "between",  // или "beyond" для outer
    "aspect1": "war",
    "aspect2": "knowledge",  // только для inner
    "distance": 0.5,  // 0.33, 0.5, 0.67 для позиции на линии (inner) или 1.2, 1.4, 1.6 для расстояния от центра (outer)
    "description": "Описание позиции"
  },
  "traits": [
    "Трейт 1",
    "Трейт 2",
    "Трейт 3"
  ],
  "costs": {
    "relatedClass": 2,      // Стоимость способностей своего класса
    "relatedAspect": 1,     // Стоимость способностей классов связанных аспектов
    "unrelatedClass": 3,    // Стоимость способностей родственных классов
    "unrelatedAspect": 2    // Стоимость способностей несвязанных классов
  },
  "primaryCharacteristic": "might",  // war, knowledge, community, shadow, mysticism, nature
  "secondaryCharacteristic": "reason",
  "startingHP": 12,
  "hpPerLevel": 8,
  "icon": "game-icons:icon-name",
  "iconImage": "/images/classes/inner/class_id.png",  // или outer/
  "color": "#dc2626",  // Можно использовать цвет основного аспекта
  "colorMix": {
    "aspect1": 0.5,
    "aspect2": 0.5
  }
}
```

## 21 Inner Class (между аспектами)

### War ↔ Knowledge (3 класса)
1. **Warrior** (0.33) - ближе к War
2. **Tactician** (0.5) - посередине
3. **Battle Scholar** (0.67) - ближе к Knowledge

### Knowledge ↔ Community (3 класса)
4. **Scholar** (0.33) - ближе к Knowledge
5. **Sage** (0.5) - посередине
6. **Diplomat** (0.67) - ближе к Community

### Community ↔ Shadow (3 класса)
7. **Negotiator** (0.33) - ближе к Community
8. **Spy** (0.5) - посередине
9. **Infiltrator** (0.67) - ближе к Shadow

### Shadow ↔ Mysticism (3 класса)
10. **Shadow Mage** (0.33) - ближе к Shadow
11. **Occultist** (0.5) - посередине
12. **Warlock** (0.67) - ближе к Mysticism

### Mysticism ↔ Nature (3 класса)
13. **Mystic** (0.33) - ближе к Mysticism
14. **Shaman** (0.5) - посередине
15. **Druid** (0.67) - ближе к Nature

### Nature ↔ War (3 класса)
16. **Ranger** (0.33) - ближе к Nature
17. **Hunter** (0.5) - посередине
18. **Barbarian** (0.67) - ближе к War

### Центральные классы (3 класса)
19. **Monk** - баланс всех аспектов
20. **Bard** - социальный универсал
21. **Artificer** - технический универсал

## 18 Outer Classes (за аспектами)

### War (3 класса)
- Berserker (1.2)
- Champion (1.4)
- Warlord (1.6)

### Knowledge (3 класса)
- Archivist (1.2)
- Scientist (1.4)
- Philosopher (1.6)

### Community (3 класса)
- Leader (1.2)
- Noble (1.4)
- Emissary (1.6)

### Shadow (3 класса)
- Assassin (1.2)
- Thief (1.4)
- Trickster (1.6)

### Mysticism (3 класса)
- Sorcerer (1.2)
- Witch (1.4)
- Archmage (1.6)

### Nature (3 класса)
- Beastmaster (1.2)
- Wildling (1.4)
- Primalist (1.6)

## Характеристики по аспектам

- **War** → Might (Мощь)
- **Knowledge** → Reason (Разум)
- **Community** → Charisma (Харизма)
- **Shadow** → Cunning (Хитрость)
- **Mysticism** → Intuition (Интуиция)
- **Nature** → Perception (Восприятие)

## Стартовое HP по типам

- **War-heavy**: 12 HP, +8/level
- **Balanced**: 10 HP, +6/level
- **Magic/Cunning-heavy**: 8 HP, +4/level

## Стоимость способностей (стандартная)

Для большинства классов:
```json
"costs": {
  "relatedClass": 2,
  "relatedAspect": 1,
  "unrelatedClass": 3,
  "unrelatedAspect": 2
}
```

Для универсальных/центральных классов может быть другая:
```json
"costs": {
  "relatedClass": 2,
  "relatedAspect": 1,
  "unrelatedClass": 2,
  "unrelatedAspect": 1
}
```
