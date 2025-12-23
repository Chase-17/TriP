# TriP - Source Code / Исходный код

## Структура

```
src/
├── components/          # Vue компоненты
│   ├── battle/         # Боевая карта и лог
│   ├── character/      # Создание и отображение персонажей
│   ├── equipment/      # Экипировка и инвентарь
│   ├── master/         # Инструменты мастера
│   ├── layout/         # UI layout и адаптивность
│   └── shared/         # Переиспользуемые компоненты
├── views/              # Страницы (Vue Router)
├── stores/             # Pinia stores
├── utils/              # Утилиты и хелперы
├── data/               # JSON игровые данные
├── router/             # Vue Router конфигурация
└── assets/             # CSS стили
```

## Ключевые файлы

- `main.js` - точка входа, инициализация Vue
- `App.vue` - корневой компонент
- `assets/main.css` - глобальные стили

## Технологический стек

- **Vue 3** - Composition API, `<script setup>`
- **Pinia** - State management с persist plugin
- **Vue Router** - SPA навигация
- **PeerJS** - P2P WebRTC для master-player связи
- **UnoCSS** - Atomic CSS (Tailwind-подобный)
- **Vite** - Build tool и dev server
- **Iconify** - Иконки (@iconify/vue)

## Архитектурные паттерны

### Mobile-first
Все компоненты адаптивны, приоритет мобильной версии.
```javascript
import { isMobileScreen } from '@/utils/mobile'
```

### P2P коммуникация
Мастер хостит комнату, игроки подключаются через PeerJS.
```javascript
// Master
session.createRoom() → roomId

// Player  
session.joinRoom(roomId)
```

### Store-driven UI
Компоненты реактивны к изменениям в stores.
```javascript
const { characters } = storeToRefs(charactersStore)
```

## Потоки данных

```
Master                          Player
  │                               │
  ├── battleMapStore ──────────>  │ (sync)
  ├── charactersStore ─────────>  │ (sync)
  ├── sceneLogStore ───────────>  │ (sync)
  │                               │
  │ <────────── sessionStore ─────┤ (actions)
  │        (move, action, roll)   │
```

## Импорты

```javascript
// Компоненты
import GameLayout from '@/components/layout/GameLayout.vue'
import BattleMap from '@/components/battle/BattleMap.vue'

// Stores
import { useCharactersStore } from '@/stores/characters'

// Utils
import { hexToPixel } from '@/utils/hexGrid'

// Data
import racesData from '@/data/races.json'
```
