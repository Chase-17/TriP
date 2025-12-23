# Components Structure / Структура компонентов

Vue 3 компоненты для VTT (Virtual Tabletop) приложения TriP.
Мобильно-ориентированный интерфейс с адаптивным дизайном.

## Папки / Folders

### `battle/` - Боевая система
- `BattleMap.vue` - Главный компонент гекс-карты (рендеринг, токены, взаимодействие)
- `SceneLog.vue` - Лог событий и результатов бросков с фильтрацией

### `character/` - Персонажи
- `CharacterWizard.vue` - Обёртка для создания персонажа с интеграцией store
- `CharacterCreationCanvas.vue` - Многошаговый визард создания персонажа (1868 строк)
- `CharacterFinalization.vue` - Финальный шаг: имя, портрет, подтверждение
- `MobileCharacterSheet.vue` - Адаптивный лист персонажа (3600+ строк)
- `ClassStatsAndSkills.vue` - Выбор класса, характеристик и навыков
- `AspectChart.vue` - Радарная диаграмма аспектов персонажа
- `CharacterPortrait.vue` - Отображение портрета с рамкой класса

### `equipment/` - Экипировка
- `EquipmentSelector.vue` - Выбор начальной экипировки при создании
- `EquipmentManager.vue` - Управление экипировкой в игре
- `InventoryPanel.vue` - Инвентарь персонажа
- `ArmorCarousel.vue` - Карусель выбора брони
- `WeaponSelector.vue` - Выбор оружия с фильтрами

### `master/` - Инструменты Мастера
- `MasterTools.vue` - Панель инструментов (режимы, настройки)
- `MasterSceneTools.vue` - Управление сценой и броски (2000+ строк)
- `MasterCharactersPanel.vue` - Управление персонажами игроков и NPC
- `NpcPanel.vue` - Создание и редактирование NPC/монстров
- `SceneTemplatesList.vue` - Шаблоны быстрого запуска сцен

### `layout/` - Интерфейс и Layout
- `GameLayout.vue` - Главный адаптивный layout (1700 строк)
- `MobileInfoCard.vue` - Карточка информации для мобильного режима
- `FillProfilePanel.vue` - Панель заполнения профиля карты
- `PlayerProfileSetup.vue` - Настройка профиля игрока
- `SplashOverlay.vue` - Оверлей загрузки/ожидания

### `shared/` - Общие компоненты
- `UserAvatar.vue` - Аватар пользователя с fallback
- `PlayerIcon.vue` - Иконка игрока для списков
- `HealthDisplay.vue` - Отображение здоровья и ран

## Ключевые паттерны

1. **State Management**: Pinia stores с persist plugin
2. **P2P Communication**: PeerJS для master-player связи
3. **Styling**: UnoCSS + Tailwind-подобные классы
4. **Icons**: @iconify/vue для иконок
5. **Mobile-first**: Адаптивный дизайн, touch-события

## Основные зависимости между компонентами

```
GameLayout
├── BattleMap
├── SceneLog  
├── MobileCharacterSheet
│   ├── EquipmentManager
│   └── InventoryPanel
└── Master*Panel (если isMaster)

CharacterWizard
└── CharacterCreationCanvas
    ├── ClassStatsAndSkills
    ├── AspectChart
    ├── EquipmentSelector
    │   ├── ArmorCarousel
    │   └── WeaponSelector
    └── CharacterFinalization
```
