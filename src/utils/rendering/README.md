# Rendering Utilities / Утилиты рендеринга

Функции для отрисовки на canvas.

## tokenRenderer.js

Рендеринг токенов персонажей на canvas.

### Загрузка изображений
```javascript
// Получить URL портрета (обрабатывает все форматы)
const url = getPortraitUrl(portrait)
// portrait может быть: число, URL, data:, blob:, имя пресета

// Загрузить с кэшированием
const img = await loadImage(url)

// Предзагрузить для токенов
await preloadTokenImages(tokens)
```

### Отрисовка токенов
```javascript
// Нарисовать все токены
drawTokens(ctx, tokens, {
  hoveredTokenId,
  selectedTokenId,
  currentUserId,
  isMaster,
  facingOffset: 90 // для flat-top
})

// Нарисовать один токен
drawToken(ctx, token, options)

// Нарисовать только оверлей (при hover)
drawTokenOverlay(ctx, token, options)
```

### Отдельные элементы
```javascript
// Портрет (круглый, с эффектами ран)
drawPortrait(ctx, cx, cy, radius, portrait, name, wounds, woundSlots)

// Царапины (жёлтые дуги)
drawScratches(ctx, cx, cy, radius, wounds, woundSlots)

// Лёгкие раны (оранжевые метки)
drawLightWounds(ctx, cx, cy, radius, wounds, woundSlots)

// Защита (hex-сегменты и дуги)
drawDefence(ctx, cx, cy, portraitRadius, meleeDefence, rangedDefence, rotation, options)

// Индикатор направления (треугольник)
drawFacingIndicator(ctx, cx, cy, radius, rotation)

// Фон при hover/select
drawTokenHoverUI(ctx, cx, cy, portraitRadius, rotation, isSelected, isHovered)
```

### Hit Testing
```javascript
// Проверить попадание в токен
const hit = isPointInToken(x, y, token, tokenSize)

// Найти токен под курсором
const token = findTokenAtPoint(x, y, tokens, tokenSize)
```

### Конвертация координат
```javascript
// Canvas → World (с учётом камеры)
const world = canvasToWorld(canvasX, canvasY, camera)

// World → Canvas
const canvas = worldToCanvas(worldX, worldY, camera)
```

## Визуализация защиты

Защита отображается как:
- **Melee**: hex-сегменты (прямые линии по сторонам гекса)
- **Ranged**: дуги вокруг токена

Цвета и типы линий берутся из `diffs.json`:
- Цвет зависит от категории защиты
- Тип графики линии зависит от подкатегории
- Пунктирная линия = пониженная защита внутри категории (слабейшая из трёх)
- Сплошная линия = базовая, средняя защита внутри категории
- Двойная линия, состоящая из сплошной слипшейся с пунктирной = повышенная сложность, сильнейшая из трёх внутри категории
