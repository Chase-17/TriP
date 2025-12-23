# AI.md - AI Development Guide

Этот файл — индекс проекта для AI-ассистентов.

## Обзор проекта

**TriP** — Virtual Tabletop (VTT) для настольных ролевых игр.
- Mobile-first интерфейс
- P2P архитектура (PeerJS)
- Vue 3 + Pinia + Vite

## Ключевые концепции

### Роли
- **Мастер (Master)** — хостит комнату, управляет картой и NPC
- **Игрок (Player)** — подключается к комнате, управляет персонажем

### Игровые сущности
- **Character** — персонаж (игрока или NPC)
- **Token** — визуальное представление на карте
- **Hex** — ячейка гексагональной карты
- **Terrain** — тип местности (лес, вода, стены)

## Структура файлов

```
src/
├── components/          # README.md в каждой подпапке
│   ├── battle/         # BattleMap, SceneLog
│   ├── character/      # Wizard, Sheet, Portrait
│   ├── equipment/      # Selector, Manager, Inventory
│   ├── master/         # Tools, NpcPanel, Templates
│   ├── layout/         # GameLayout, InfoCard, Splash
│   └── shared/         # Avatar, Icon, HealthDisplay
├── views/              # 4 страницы: Lobby, Room (player/master)
├── stores/             # 8 stores с persist
├── utils/              # Утилиты по доменам
│   ├── hex/           # Гексагональная геометрия
│   ├── character/     # Персонаж, раны, проверки
│   └── rendering/     # Рендеринг токенов
└── data/               # 14 JSON файлов данных
```

## Основные файлы для редактирования

| Задача | Файлы |
|--------|-------|
| Интерфейс карты | `components/battle/BattleMap.vue` |
| Создание персонажа | `components/character/CharacterCreationCanvas.vue` |
| Лист персонажа | `components/character/MobileCharacterSheet.vue` |
| Инструменты мастера | `components/master/MasterSceneTools.vue` |
| Основной layout | `components/layout/GameLayout.vue` |
| P2P логика | `stores/session.js` |
| Геометрия гексов | `utils/hex/grid.js` |
| Система ран | `utils/character/wounds.js` |
| Рендеринг токенов | `utils/rendering/tokenRenderer.js` |
| Данные персонажей | `stores/characters.js` |
| Геометрия гексов | `utils/hexGrid.js` |
| Рендеринг токенов | `utils/tokenRenderer.js` |

## Паттерны кода

### Компоненты
```vue
<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCharactersStore } from '@/stores/characters'

const store = useCharactersStore()
const { characters } = storeToRefs(store)
</script>
```

### Импорт компонентов
```javascript
// Из подпапок components/
import GameLayout from '@/components/layout/GameLayout.vue'
import BattleMap from '@/components/battle/BattleMap.vue'
import CharacterWizard from '@/components/character/CharacterWizard.vue'
```

### Stores
```javascript
import { defineStore } from 'pinia'

export const useExampleStore = defineStore('example', {
  state: () => ({ ... }),
  actions: { ... },
  persist: { key: 'trip-example' }
})
```

### Импорт утилит
```javascript
// Гексы
import { HexGrid, hexKey, hexDistance } from '@/utils/hex/grid'
import { SelectionManager } from '@/utils/hex/selection'
import { applyFillProfile } from '@/utils/hex/fill'

// Персонаж
import { calculateWoundSlots } from '@/utils/character/wounds'
import { getCheckBonus } from '@/utils/character/checks'
import { getDefenceData } from '@/utils/character/defence'

// Рендеринг
import { drawTokens, getPortraitUrl } from '@/utils/rendering/tokenRenderer'

// Общие
import { assetUrl, presetUrl } from '@/utils/assets'
import { isMobileScreen } from '@/utils/mobile'
```

## Типичные задачи

### Добавить новый компонент
1. Определи категорию (battle/character/equipment/master/layout/shared)
2. Создай файл в соответствующей папке
3. Добавь импорт в родительский компонент

### Добавить новую утилиту
1. Определи домен (hex/character/rendering или корень)
2. Добавь в существующий файл или создай новый
3. Добавь экспорт в index.js папки
4. Обнови README.md

### Изменить игровые данные
1. Найди JSON в `src/data/`
2. Структура описана в `src/data/README.md`

### Добавить новый store
1. Создай файл в `src/stores/`
2. Добавь persist если нужна персистентность
3. Обнови `src/stores/README.md`

## Зависимости между модулями

```
Views
  └── GameLayout (layout/)
        ├── BattleMap (battle/)
        ├── SceneLog (battle/)
        ├── MobileCharacterSheet (character/)
        │     ├── EquipmentManager (equipment/)
        │     └── InventoryPanel (equipment/)
        └── Master*Panel (master/)
              └── NpcPanel (master/)

CharacterWizard (character/)
  └── CharacterCreationCanvas
        ├── ClassStatsAndSkills
        ├── AspectChart
        ├── EquipmentSelector (equipment/)
        └── CharacterFinalization
```

## Команды разработки

```bash
npm run dev      # Dev server на localhost:5173
npm run build    # Production build в dist/
npm run lint     # ESLint проверка
npm run test     # Vitest тесты
```

## Важные заметки

1. **Mobile-first**: Все компоненты должны работать на мобильных
2. **P2P-first**: Данные синхронизируются через PeerJS, нет сервера
3. **Pinia persist**: Состояние сохраняется в localStorage
4. **UnoCSS**: Используй Tailwind-подобные классы
