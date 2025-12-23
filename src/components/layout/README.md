# Layout Components / UI и Layout

Основные компоненты интерфейса и адаптивного layout.

## GameLayout.vue (~1700 строк)
**Главный адаптивный layout приложения.**

Структура экрана:
```
┌─────────────────────────────┐
│ Info Panel (250px)          │ ← Контекстная информация
├─────────────────────────────┤
│                             │
│   Work Area (flex)          │ ← Карта / Персонаж / Лог
│                             │
├─────────────────────────────┤
│ Action Panel (90px)         │ ← Действия текущего экрана
├─────────────────────────────┤
│ Navbar (fixed)              │ ← Переключение экранов
└─────────────────────────────┘
```

**Props:**
- `isMaster` - режим мастера (доп. инструменты)
- `character` - персонаж игрока
- `characters` - все персонажи
- `selectedToken`, `selectedHex` - выбор на карте
- `connectionStatus` - P2P статус
- `currentTurn`, `isPlayerTurn` - управление ходами

**События:**
- Навигация: `leave-room`, `set-view`
- Действия: `select-action`, `confirm-action`, `cancel-action`
- Карта: `move-to-hex`, `token-selected`, `hex-selected`
- Персонаж: `open-character-sheet`, `create-character`

## MobileInfoCard.vue
Карточка информации в info panel.
- Информация о выбранном токене
- Характеристики terrain
- Подсказки по действиям

## FillProfilePanel.vue
Панель профилей заполнения карты.
- Выбор preset-профилей
- Предпросмотр заполнения
- Настройка параметров

## PlayerProfileSetup.vue
Настройка профиля игрока перед игрой.
- Имя/никнейм
- Аватар
- Настройки отображения

## SplashOverlay.vue
Оверлей загрузки/ожидания.
- Подключение к комнате
- Ожидание мастера
- Синхронизация данных

## Паттерны адаптивности

```javascript
import { isMobileScreen } from '@/utils/mobile'

// Responsive breakpoints
const isMobile = computed(() => isMobileScreen())
```

CSS классы используют UnoCSS:
- `@mobile:hidden` - скрыть на мобильном
- `@mobile:flex` - показать на мобильном
- Touch-события для swipe-навигации
