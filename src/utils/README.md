# Utils / Утилиты

Вспомогательные функции и хелперы, организованные по доменам.

## Структура

```
utils/
├── hex/              # Гексагональная геометрия
│   ├── grid.js       # HexGrid класс, hexKey, parseHexKey, hexDistance
│   ├── selection.js  # SelectionManager, формы и режимы выделения
│   ├── fill.js       # Заполнение областей с кластеризацией
│   └── index.js      # Реэкспорт всех функций
├── character/        # Персонаж и боевая система
│   ├── wounds.js     # Система ран и HP
│   ├── checks.js     # Проверки характеристик
│   ├── defence.js    # Расчёт защиты
│   ├── skills.js     # Навыки и миграция
│   └── index.js      # Реэкспорт всех функций
├── rendering/        # Отрисовка на canvas
│   ├── tokenRenderer.js  # Рендеринг токенов
│   └── index.js      # Реэкспорт
├── assets.js         # Пути к ассетам
├── avatar.js         # Генерация аватаров
└── mobile.js         # Мобильные утилиты
```

## Использование

```javascript
// Гексы - через подпапку или index
import { HexGrid, hexKey, hexDistance } from '@/utils/hex/grid'
import { SelectionManager, SELECTION_SHAPES } from '@/utils/hex/selection'
import { applyFillProfile } from '@/utils/hex/fill'

// Персонаж
import { calculateWoundSlots, calculateMaxHP } from '@/utils/character/wounds'
import { getCheckBonus } from '@/utils/character/checks'
import { getDefenceData } from '@/utils/character/defence'
import { migrateCharacterSkills } from '@/utils/character/skills'

// Рендеринг
import { drawTokens, getPortraitUrl } from '@/utils/rendering/tokenRenderer'

// Общие утилиты (остаются в корне)
import { assetUrl, presetUrl } from '@/utils/assets'
import { generateAvatar, getInitials } from '@/utils/avatar'
import { isMobileScreen, setupMobileViewport } from '@/utils/mobile'
```
