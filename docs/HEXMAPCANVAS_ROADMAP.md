# HexMapCanvas — План разработки

## Цель
Создать универсальный компонент для рендеринга гексовых карт с поддержкой:
- Трёх режимов рендеринга террейна (primitive, live, cached)
- LOD (Level of Detail) для текстур и эффектов границ
- Полноценного взаимодействия (pan, zoom, brush, selection)
- Переиспользования в BattleMap и AssetManager

---

## Фаза 1: Базовая структура

### 1.1 Создать `src/components/shared/HexMapCanvas.vue`
- [x] Контейнер с несколькими canvas слоями
- [x] Props: `hexes`, `hexSize`, `renderMode`, `showGrid`
- [x] Emits: `hex-click`, `hex-hover`, `camera-change`

### 1.2 Создать `src/composables/useMapCamera.js`
- [x] Реактивное состояние камеры `{ x, y, zoom }`
- [x] `pan(dx, dy)` — перемещение
- [x] `zoomTo(zoom, pivotX, pivotY)` — zoom к точке
- [x] `centerOn(worldX, worldY)` — центрировать на координаты
- [x] Touch support (pinch-zoom)

### 1.3 Создать `src/composables/useTerrainRenderer.js`
- [x] Три режима: `primitive`, `live`, `cached`
- [x] `renderPrimitive(ctx, hexes, camera)` — плоские цвета
- [x] Интерфейс для будущих режимов

### 1.4 Режим `primitive`
- [x] Рендер гексов с `terrain.fallbackColor` или `terrain.averageColor`
- [x] Простой и быстрый

---

## Фаза 2: Интеграция в AssetManager

### 2.1 Создать `src/composables/useBrushTool.js`
- [x] Состояние кисти `{ size, mode, terrain }`
- [x] `startStroke()`, `continueStroke(hex)`, `endStroke()`
- [x] Превью кисти при hover

### 2.2 Шаблоны карт в terrain store
- [x] `mapTemplates: []` — сохранённые шаблоны
- [x] `createMapTemplate(name)`, `updateTemplateHexes(id, hexes)`
- [x] `removeMapTemplate(id)`, `duplicateMapTemplate(id)`
- [x] `activeTemplateId` — текущий шаблон
- [x] Persist в localStorage

### 2.3 Persist UI состояния в userPrefs
- [x] `previewMode` — cluster | map
- [x] `renderMode` — primitive | live | cached
- [x] `showGrid` — показывать сетку
- [x] `camera` — позиция и zoom карты

### 2.4 Интегрировать HexMapCanvas в AssetManager
- [x] Переключатель Cluster/HexMap режимов
- [x] Режим `expandable` — рисование везде
- [x] UI для управления шаблонами (создать/удалить/выбрать)
- [x] Сохранение гексов в шаблон
- [x] Сетка отключаемая

### 2.4 Утилиты для форм карт (NEW)
- [x] `src/utils/hex/hexShapes.js` — генерация гексов
- [x] Поддержка: cluster7, circle, rect, diamond, line

---

## Фаза 3: Live режим + LOD

### 3.1 Интегрировать HexClusterRenderer
- [x] Использовать существующий `renderExtended()` 
- [x] Преобразование гексов в формат для рендерера
- [x] Поддержка getTransitionForPair для границ

### 3.2 LOD для слоёв террейна
- [x] Добавить `minZoom` в структуру слоя
- [x] UI для настройки minZoom в редакторе террейнов
- [x] Фильтрация слоёв по текущему zoom при рендеринге

### 3.3 Автовычисление `averageColor`
- [x] Функция `computeAverageColor(terrain)`
- [x] Рендер sample 32×32 со всеми слоями
- [x] Вычисление среднего цвета пикселей
- [x] Функция `updateTerrainAverageColor(terrainId)`
- [x] Автообновление при изменении слоёв в UI

### 3.4 LOD для эффектов границ
- [x] Добавить `minZoom` в структуру эффекта
- [x] UI для настройки в EffectsPipelineEditor
- [x] Фильтрация эффектов при рендеринге границ

### 3.5 Применение LOD при рендеринге
- [x] zoom < 0.3: fallback на primitive режим
- [x] zoom 0.3-0.5: averageColor, без текстур
- [x] zoom 0.5-0.8: fallbackColor + базовые эффекты
- [x] zoom > 0.8: полная детализация
- [x] Фильтрация эффектов границ по minZoom

---

## Фаза 4: Cached режим

### 4.1 Offscreen canvas для кеша
- [x] Создание offscreen canvas нужного размера
- [x] Рендер всех видимых гексов в кеш
- [x] Blit кеша на основной canvas с учётом камеры

### 4.2 Инвалидация кеша
- [x] При изменении гекса (add/remove/change terrain)
- [ ] При изменении правила перехода
- [ ] При изменении lightingSettings
- [ ] При изменении слоёв террейна

### 4.3 Оптимизация
- [ ] Частичная инвалидация (только затронутые области)
- [ ] Lazy-рендеринг (только при запросе)
- [ ] Debounce для частых изменений

---

## Фаза 5: Интеграция в BattleMap

### 5.1 Замена terrain layer
- [ ] Использовать HexMapCanvas вместо terrainCanvas
- [ ] Сохранить совместимость с существующими слоями (grid, UI, tokens)

### 5.2 Проверка совместимости
- [ ] Pan/zoom работает
- [ ] Рисование террейнов работает
- [ ] Токены отображаются корректно
- [ ] Touch-взаимодействия работают
- [ ] Синхронизация между игроками работает

### 5.3 Переключение режимов
- [ ] UI для выбора режима рендеринга
- [ ] Автовыбор режима по размеру карты
- [ ] Сохранение предпочтений

---

## Структура файлов

```
src/
├── components/
│   └── shared/
│       └── HexMapCanvas.vue          # Основной компонент
├── composables/
│   ├── useMapCamera.js               # Pan/zoom логика
│   ├── useTerrainRenderer.js         # Три режима рендеринга
│   ├── useBrushTool.js               # Инструмент кисти
│   └── useMapInteraction.js          # Click/hover/drag
└── utils/
    └── rendering/
        ├── hexClusterRenderer.js     # Существующий (используется в live режиме)
        ├── boundaryEffects.js        # Существующий
        └── terrainLOD.js             # NEW: LOD логика для террейнов
```

---

## Заметки

### Режимы рендеринга:
- **primitive**: Плоские цвета, максимальная производительность
- **live**: Полный рендер в реальном времени, для отладки/превью
- **cached**: Предрендеренный кеш, баланс качества и производительности

### LOD пороги (предварительные):
- zoom < 0.3: только averageColor
- zoom 0.3-0.7: базовые слои, крупные эффекты (wave, jagged)
- zoom 0.7-1.5: большинство слоёв и эффектов
- zoom > 1.5: полная детализация (scatter, мелкий шум)

### Приоритеты:
1. Работающий базовый функционал
2. Совместимость с существующим кодом
3. Производительность
4. Красота/полировка
