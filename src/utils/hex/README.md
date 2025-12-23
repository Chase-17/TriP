# Hex Grid Utilities / Утилиты гексагональной сетки

Функции для работы с гексагональными сетками.
Использует axial координаты (q, r).

## grid.js

### HexGrid класс
Основной класс для работы с гекс-сеткой.

```javascript
const grid = new HexGrid({
  orientation: HEX_ORIENTATIONS.FLAT, // или POINTY
  hexSize: 32,
  origin: { x: 0, y: 0 }
})

// Конвертация координат
const pixel = grid.hexToPixel(q, r)
const hex = grid.pixelToHex(x, y)

// Соседи и расстояния
const neighbors = grid.getNeighbors(q, r)
const dist = grid.hexDistance(q1, r1, q2, r2)

// Углы для отрисовки
const corners = grid.getHexCorners(cx, cy)
```

### Standalone функции
```javascript
// Ключи для Map/Set
const key = hexKey(q, r)        // "3,5"
const {q, r} = parseHexKey(key) // {q: 3, r: 5}

// Расстояние
const dist = hexDistance(q1, r1, q2, r2)
```

### Константы
- `HEX_ORIENTATIONS.FLAT` - плоская вершина ⬡
- `HEX_ORIENTATIONS.POINTY` - острая вершина ⬢
- `HEX_DIRECTIONS` - 6 направлений для соседей

## selection.js

### SelectionManager класс
Управление выделением гексов.

```javascript
const manager = new SelectionManager(hexGrid)

// Прямоугольное выделение
const hexes = manager.calculateRectanglePreview(startHex, endHex, existingHexes, behavior)

// Круглое выделение
const hexes = manager.calculateCirclePreview(startHex, endHex, existingHexes, behavior)

// Линия
const hexes = manager.calculateLinePreview(startHex, endHex)
```

### Константы
- `SELECTION_SHAPES` - rectangle, circle, hexagon, line
- `SELECTION_MODES` - replace, add, subtract
- `SELECTION_BEHAVIORS` - aggressive, standard, passive

## fill.js

Заполнение областей карты с кластеризацией.

```javascript
// Применить профиль заливки
const result = applyFillProfile(profile, hexKeys, terrainStore, options)

// Предпросмотр (dry-run)
const preview = generateFillPreview(profile, hexKeys, terrainStore)

// Статистика
const stats = getFillStats(profile)
```

### Алгоритм кластеризации
- `density` (0-100%) - сколько гексов заполнить
- `clustering` (0-100) - насколько группировать
  - 0 = случайное распределение
  - 100 = плотные кластеры
