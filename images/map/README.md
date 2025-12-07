# Ассеты карты

Структура директорий для изображений карты.

## Структура

```
map/
├── terrains/     # Текстуры подложки (гексы террейна)
│   ├── grass.png
│   ├── forest_light.png
│   └── ...
├── objects/      # Объекты на карте (деревья, камни, здания)
│   ├── tree_oak.png
│   ├── rock_large.png
│   └── ...
├── effects/      # Эффекты (огонь, туман, магия)
│   ├── fire.png
│   ├── fog.png
│   └── ...
└── custom/       # Кастомные ассеты мастера
    └── ...
```

## Требования к изображениям террейнов

- **Формат**: PNG с прозрачностью
- **Размер**: Рекомендуется 128x128 или 256x256 пикселей
- **Форма**: Шестиугольник (будет обрезан по маске гекса)

## Добавление нового террейна

1. Добавьте изображение в `terrains/`
2. Добавьте запись в `src/data/terrains.json`:

```json
{
  "id": "my_terrain",
  "name": "Мой террейн",
  "description": "Описание",
  "biome": "plains",
  "color": "#4CAF50",
  "image": "/images/map/terrains/my_terrain.png",
  "visibility": "open",
  "movementCost": 1,
  "meleeAdvantage": 0,
  "tags": ["природа"]
}
```

## Параметры террейна

| Параметр | Описание | Значения |
|----------|----------|----------|
| `biome` | Биом | plains, forest, desert, swamp, mountain, water, snow, volcanic, urban, underground |
| `visibility` | Видимость | open (открытая), partial (маскирующая), blocking (блокирующая) |
| `movementCost` | Стоимость передвижения | 1-5 |
| `meleeAdvantage` | Преимущество в ближнем бою | -2 до +2 |
| `tags` | Теги для фильтрации | массив строк |
