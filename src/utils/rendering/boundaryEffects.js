/**
 * Модульная система эффектов для границ между террейнами
 * 
 * Каждый эффект — это функция (points, params) => points
 * Эффекты применяются последовательно (pipeline)
 * 
 * Типы эффектов:
 * - deform: Деформация линии (wave, jagged, noise, etc.)
 * - smooth: Сглаживание (chaikin, laplacian)
 * - subdivide: Добавление промежуточных точек
 * - offset: Смещение линии внутрь/наружу
 */

import { PerlinNoise } from './noise.js'

const noise = new PerlinNoise(42)

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

/**
 * Вычислить нормаль в точке линии
 */
function getNormalAt(points, index) {
  if (points.length < 2) return { nx: 0, ny: 1 }
  
  const prev = points[Math.max(0, index - 1)]
  const next = points[Math.min(points.length - 1, index + 1)]
  const dx = next.x - prev.x
  const dy = next.y - prev.y
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  
  return { nx: -dy / len, ny: dx / len }
}

/**
 * Применить смещение вдоль нормали к точке
 */
function offsetPoint(point, normal, offset) {
  return {
    x: point.x + normal.nx * offset,
    y: point.y + normal.ny * offset
  }
}

// ============================================
// ЭФФЕКТЫ ДЕФОРМАЦИИ (изменяют форму линии)
// ============================================

/**
 * Плавная волна (Perlin noise)
 */
export function effectWave(points, params = {}) {
  const amplitude = params.amplitude ?? 8
  const frequency = params.frequency ?? 0.12
  const seed = params.seed ?? 0
  
  return points.map((point, i) => {
    const normal = getNormalAt(points, i)
    const offset = noise.noise2D(
      point.x * frequency + seed,
      point.y * frequency
    ) * amplitude
    return offsetPoint(point, normal, offset)
  })
}

/**
 * Рваная граница (резкий noise)
 */
export function effectJagged(points, params = {}) {
  const amplitude = params.amplitude ?? 10
  const frequency = params.frequency ?? 0.18
  const sharpness = params.sharpness ?? 0.4
  
  return points.map((point, i) => {
    const normal = getNormalAt(points, i)
    let n = noise.noise2D(point.x * frequency, point.y * frequency)
    n = Math.sign(n) * Math.pow(Math.abs(n), sharpness)
    const offset = n * amplitude
    return offsetPoint(point, normal, offset)
  })
}

/**
 * Шумовая деформация
 */
export function effectNoise(points, params = {}) {
  const amplitude = params.amplitude ?? 6
  const scale = params.scale ?? 0.1
  
  return points.map((point, i) => {
    const normal = getNormalAt(points, i)
    const offset = noise.noise2D(point.x * scale, point.y * scale) * amplitude
    return offsetPoint(point, normal, offset)
  })
}

/**
 * Пилообразная волна (зубцы)
 */
export function effectSawtooth(points, params = {}) {
  const amplitude = params.amplitude ?? 8
  const frequency = params.frequency ?? 0.15
  
  return points.map((point, i) => {
    const normal = getNormalAt(points, i)
    const t = (point.x + point.y) * frequency
    const offset = ((t % 1) * 2 - 1) * amplitude
    return offsetPoint(point, normal, offset)
  })
}

/**
 * Ступенчатая граница (квадратная волна)
 */
export function effectSteps(points, params = {}) {
  const amplitude = params.amplitude ?? 6
  const frequency = params.frequency ?? 0.1
  
  return points.map((point, i) => {
    const normal = getNormalAt(points, i)
    const t = (point.x + point.y) * frequency
    const offset = (Math.floor(t) % 2 === 0 ? 1 : -1) * amplitude
    return offsetPoint(point, normal, offset)
  })
}

/**
 * Дизеринг (псевдослучайные смещения)
 */
export function effectDither(points, params = {}) {
  const amplitude = params.amplitude ?? 4
  const density = params.density ?? 0.5
  
  return points.map((point, i) => {
    const normal = getNormalAt(points, i)
    const hash = Math.sin(point.x * 12.9898 + point.y * 78.233) * 43758.5453
    const rand = hash - Math.floor(hash)
    const offset = rand < density ? amplitude : -amplitude
    return offsetPoint(point, normal, offset)
  })
}

/**
 * Синусоидальная волна (регулярная)
 */
export function effectSine(points, params = {}) {
  const amplitude = params.amplitude ?? 6
  const wavelength = params.wavelength ?? 30
  
  // Вычисляем кумулятивное расстояние вдоль линии
  let distance = 0
  const distances = [0]
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    distance += Math.sqrt(dx * dx + dy * dy)
    distances.push(distance)
  }
  
  return points.map((point, i) => {
    const normal = getNormalAt(points, i)
    const offset = Math.sin((distances[i] / wavelength) * Math.PI * 2) * amplitude
    return offsetPoint(point, normal, offset)
  })
}

/**
 * Зигзаг (острые углы туда-сюда)
 */
export function effectZigzag(points, params = {}) {
  const amplitude = params.amplitude ?? 8
  const wavelength = params.wavelength ?? 20
  
  // Вычисляем кумулятивное расстояние
  let distance = 0
  const distances = [0]
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dy = points[i].y - points[i - 1].y
    distance += Math.sqrt(dx * dx + dy * dy)
    distances.push(distance)
  }
  
  return points.map((point, i) => {
    const normal = getNormalAt(points, i)
    // Треугольная волна
    const phase = (distances[i] / wavelength) % 1
    const offset = (phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4) * amplitude
    return offsetPoint(point, normal, offset)
  })
}

/**
 * Фрактальная граница (рекурсивный noise на разных масштабах)
 */
export function effectFractal(points, params = {}) {
  const amplitude = params.amplitude ?? 10
  const octaves = params.octaves ?? 3
  const persistence = params.persistence ?? 0.5
  const baseFrequency = params.frequency ?? 0.1
  
  return points.map((point, i) => {
    const normal = getNormalAt(points, i)
    
    // Суммируем несколько октав шума
    let offset = 0
    let amp = amplitude
    let freq = baseFrequency
    
    for (let o = 0; o < octaves; o++) {
      offset += noise.noise2D(point.x * freq, point.y * freq) * amp
      amp *= persistence
      freq *= 2
    }
    
    return offsetPoint(point, normal, offset)
  })
}

/**
 * Пиксельная граница (ступенчатая, как в ретро-играх)
 */
export function effectPixelate(points, params = {}) {
  const gridSize = params.gridSize ?? 8
  
  return points.map(point => {
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize
    }
  })
}

// ============================================
// ЭФФЕКТЫ СГЛАЖИВАНИЯ
// ============================================

/**
 * Сглаживание Chaikin (скругление углов)
 */
export function effectChaikin(points, params = {}) {
  const iterations = params.iterations ?? 2
  const preserveEnds = params.preserveEnds ?? true
  
  if (points.length < 3) return points
  
  let result = [...points]
  
  for (let iter = 0; iter < iterations; iter++) {
    const newPoints = []
    
    if (preserveEnds) {
      newPoints.push(result[0])
    }
    
    for (let i = 0; i < result.length - 1; i++) {
      const p0 = result[i]
      const p1 = result[i + 1]
      
      newPoints.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        y: p0.y * 0.75 + p1.y * 0.25
      })
      
      newPoints.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        y: p0.y * 0.25 + p1.y * 0.75
      })
    }
    
    if (preserveEnds) {
      newPoints.push(result[result.length - 1])
    }
    
    result = newPoints
  }
  
  return result
}

/**
 * Сглаживание Laplacian (спрямление)
 */
export function effectLaplacian(points, params = {}) {
  const strength = params.strength ?? 0.5
  const iterations = params.iterations ?? Math.ceil(strength * 5)
  const factor = Math.min(strength, 0.8)
  
  if (points.length < 3) return points
  
  let result = [...points]
  
  for (let iter = 0; iter < iterations; iter++) {
    const newPoints = [result[0]]
    
    for (let i = 1; i < result.length - 1; i++) {
      const prev = result[i - 1]
      const curr = result[i]
      const next = result[i + 1]
      
      const midX = (prev.x + next.x) / 2
      const midY = (prev.y + next.y) / 2
      
      newPoints.push({
        x: curr.x + (midX - curr.x) * factor,
        y: curr.y + (midY - curr.y) * factor
      })
    }
    
    newPoints.push(result[result.length - 1])
    result = newPoints
  }
  
  return result
}

// ============================================
// ЭФФЕКТЫ ИНТЕРПОЛЯЦИИ
// ============================================

/**
 * Добавить промежуточные точки (subdivide)
 */
export function effectSubdivide(points, params = {}) {
  const segments = params.segments ?? 4
  
  if (points.length < 2) return points
  
  const result = []
  
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    
    for (let j = 0; j < segments; j++) {
      const t = j / segments
      result.push({
        x: p0.x + (p1.x - p0.x) * t,
        y: p0.y + (p1.y - p0.y) * t
      })
    }
  }
  
  result.push(points[points.length - 1])
  return result
}

// ============================================
// ЭФФЕКТЫ СМЕЩЕНИЯ
// ============================================

/**
 * Смещение линии внутрь/наружу (offset/erode/dilate)
 */
export function effectOffset(points, params = {}) {
  const amount = params.amount ?? 0
  
  if (amount === 0) return points
  
  return points.map((point, i) => {
    const normal = getNormalAt(points, i)
    return offsetPoint(point, normal, amount)
  })
}

// ============================================
// ЭФФЕКТЫ МАСКИ (влияют на рендер, применяются последними)
// Эти эффекты не изменяют точки, а добавляют метаданные
// которые рендерер использует для модификации отрисовки
// ============================================

/**
 * Альфа-размытие границы
 * Создаёт плавный градиент прозрачности на границе
 */
export function effectAlphaBlur(points, params = {}) {
  // Возвращаем точки как есть - рендерер обработает этот эффект
  return points
}

/**
 * Сыпучая граница (для песка, гравия)
 * Добавляет шумовую маску на краю для эффекта рассыпания
 */
export function effectScatter(points, params = {}) {
  return points
}

/**
 * Размытие с шумом (мягкое смешение текстур)
 */
export function effectNoiseBlend(points, params = {}) {
  return points
}

/**
 * Обводка границы
 */
export function effectStroke(points, params = {}) {
  return points
}

/**
 * Свечение на границе
 */
export function effectGlow(points, params = {}) {
  return points
}

/**
 * Тень от границы
 */
export function effectShadow(points, params = {}) {
  return points
}

// ============================================
// РЕГИСТРАЦИЯ ЭФФЕКТОВ
// ============================================

export const EFFECTS = {
  // Деформация - изменяют форму линии границы
  wave: { 
    fn: effectWave, 
    category: 'deform', 
    name: 'Волна', 
    description: 'Плавные волны на основе Perlin noise. Хорошо для органичных границ.',
    defaults: { amplitude: 8, frequency: 0.12 } 
  },
  jagged: { 
    fn: effectJagged, 
    category: 'deform', 
    name: 'Рваная', 
    description: 'Резкие, угловатые деформации. Для скал и гор.',
    defaults: { amplitude: 10, frequency: 0.18, sharpness: 0.4 } 
  },
  noise: { 
    fn: effectNoise, 
    category: 'deform', 
    name: 'Шум', 
    description: 'Хаотичные смещения. Для естественных текстур.',
    defaults: { amplitude: 6, scale: 0.1 } 
  },
  sawtooth: { 
    fn: effectSawtooth, 
    category: 'deform', 
    name: 'Зубцы', 
    description: 'Пилообразная волна с резкими переходами.',
    defaults: { amplitude: 8, frequency: 0.15 } 
  },
  steps: { 
    fn: effectSteps, 
    category: 'deform', 
    name: 'Ступеньки', 
    description: 'Квадратная волна. Для искусственных структур.',
    defaults: { amplitude: 6, frequency: 0.1 } 
  },
  dither: { 
    fn: effectDither, 
    category: 'deform', 
    name: 'Дизеринг', 
    description: 'Псевдослучайные смещения. Ретро-стиль.',
    defaults: { amplitude: 4, density: 0.5 } 
  },
  sine: { 
    fn: effectSine, 
    category: 'deform', 
    name: 'Синусоида', 
    description: 'Регулярная синусоида. Для воды и волн.',
    defaults: { amplitude: 6, wavelength: 30 } 
  },
  zigzag: { 
    fn: effectZigzag, 
    category: 'deform', 
    name: 'Зигзаг', 
    description: 'Острые углы туда-сюда. Для молний и трещин.',
    defaults: { amplitude: 8, wavelength: 20 } 
  },
  fractal: { 
    fn: effectFractal, 
    category: 'deform', 
    name: 'Фрактал', 
    description: 'Многоуровневый шум. Очень органичные, сложные границы.',
    defaults: { amplitude: 10, octaves: 3, persistence: 0.5, frequency: 0.1 } 
  },
  pixelate: { 
    fn: effectPixelate, 
    category: 'deform', 
    name: 'Пиксели', 
    description: 'Привязка к сетке. Ретро/8-bit стиль.',
    defaults: { gridSize: 8 } 
  },
  
  // Сглаживание - убирают резкие углы
  chaikin: { 
    fn: effectChaikin, 
    category: 'smooth', 
    name: 'Скругление', 
    description: 'Скругляет углы, делая линию плавной. Добавляет точки.',
    defaults: { iterations: 2, preserveEnds: true } 
  },
  laplacian: { 
    fn: effectLaplacian, 
    category: 'smooth', 
    name: 'Спрямление', 
    description: 'Спрямляет линию, сдвигая точки к середине соседей.',
    defaults: { strength: 1.0, iterations: 20 } 
  },
  
  // Детализация - добавляют точки для большего контроля
  subdivide: { 
    fn: effectSubdivide, 
    category: 'interpolate', 
    name: 'Разбиение', 
    description: 'Добавляет точки между существующими. Применять ПЕРЕД деформацией!',
    defaults: { segments: 4 } 
  },
  
  // Смещение - сдвигают всю линию
  offset: { 
    fn: effectOffset, 
    category: 'offset', 
    name: 'Смещение', 
    description: 'Сдвигает линию внутрь (+) или наружу (-).',
    defaults: { amount: 0 } 
  },
  
  // Маска - влияют на отрисовку текстуры, применяются последними
  alphaBlur: { 
    fn: effectAlphaBlur, 
    category: 'mask', 
    name: 'Альфа-размытие', 
    description: 'Плавный градиент прозрачности. Контроль начальной и конечной непрозрачности.',
    defaults: { width: 20, opacityStart: 100, opacityEnd: 0, falloff: 'linear' } 
  },
  scatter: { 
    fn: effectScatter, 
    category: 'mask', 
    name: 'Сыпучая', 
    description: 'Шумовая маска для эффекта рассыпания. Идеально для песка и гравия.',
    defaults: { width: 20, density: 0.5, noiseScale: 0.15, strength: 3.0, particleSize: 0.5, erosion: 0.5, roughness: 0.5, seed: 0 } 
  },
  noiseBlend: { 
    fn: effectNoiseBlend, 
    category: 'mask', 
    name: 'Шумовое смешение', 
    description: 'Смешение текстур с шумовой маской. Естественные переходы.',
    defaults: { width: 15, noiseScale: 0.15, contrast: 0.5 } 
  },
  stroke: { 
    fn: effectStroke, 
    category: 'mask', 
    name: 'Обводка', 
    description: 'Рисует линию обводки вдоль границы.',
    defaults: { width: 2, color: '#000000', opacity: 0.5 } 
  },
  
  // Визуальные эффекты - рисуются поверх
  glow: { 
    fn: effectGlow, 
    category: 'visual', 
    name: 'Свечение', 
    description: 'Мягкое свечение вдоль границы. Для магии и энергии.',
    defaults: { width: 10, offsetX: 0, offsetY: 0, color: '#ffffff', intensity: 0.7 } 
  },
  shadow: { 
    fn: effectShadow, 
    category: 'visual', 
    name: 'Тень', 
    description: 'Отбрасываемая тень от границы. Использует глобальное освещение карты.',
    defaults: { width: 8, lengthMultiplier: 1.0, color: '#000000', opacity: 0.4 } 
  }
}

// ============================================
// PIPELINE
// ============================================

/**
 * Применить цепочку эффектов к линии
 * 
 * @param {Array} points - массив точек [{x, y}, ...]
 * @param {Array} effects - массив эффектов [{type: 'wave', params: {...}}, ...]
 * @returns {Array} - обработанные точки
 */
export function applyEffectsPipeline(points, effects = []) {
  if (!effects || effects.length === 0) return points
  
  let result = points
  
  for (const effect of effects) {
    // Пропускаем выключенные эффекты
    if (effect.enabled === false) continue
    
    const effectDef = EFFECTS[effect.type]
    if (!effectDef) {
      console.warn(`[BoundaryEffects] Unknown effect type: ${effect.type}`)
      continue
    }
    
    // Merge defaults с переданными параметрами
    const params = { ...effectDef.defaults, ...effect.params }
    result = effectDef.fn(result, params)
  }
  
  return result
}

/**
 * Конвертировать старый формат (style + params) в новый (effects pipeline)
 */
export function convertLegacyStyle(style, params = {}) {
  if (!style || style === 'sharp') return []
  
  const effects = []
  
  // Subdivide обычно нужен перед деформацией
  effects.push({ type: 'subdivide', params: { segments: params.subdivideSegments ?? 8 } })
  
  // Маппинг старых стилей на эффекты
  switch (style) {
    case 'smooth-wave':
      effects.push({ type: 'wave', params: { amplitude: params.amplitude, frequency: params.frequency } })
      break
    case 'jagged':
      effects.push({ type: 'jagged', params: { amplitude: params.amplitude, frequency: params.frequency, sharpness: params.sharpness } })
      break
    case 'noise':
      effects.push({ type: 'noise', params: { amplitude: params.amplitude, scale: params.noiseScale } })
      break
    case 'sawtooth':
      effects.push({ type: 'sawtooth', params: { amplitude: params.amplitude, frequency: params.frequency } })
      break
    case 'steps':
      effects.push({ type: 'steps', params: { amplitude: params.amplitude, frequency: params.frequency } })
      break
    case 'dither':
      effects.push({ type: 'dither', params: { amplitude: params.amplitude, density: params.density } })
      break
    case 'blend':
    case 'gradient':
      // Эти стили не деформируют линию
      break
  }
  
  // Сглаживание (если указано)
  if (params.smoothness > 0) {
    const smoothMode = params.smoothMode ?? 'chaikin'
    if (smoothMode === 'chaikin') {
      effects.push({ type: 'chaikin', params: { iterations: Math.ceil(params.smoothness * 4) } })
    } else {
      effects.push({ type: 'laplacian', params: { strength: params.smoothness } })
    }
  }
  
  return effects
}

/**
 * Получить список всех доступных эффектов по категориям
 */
export function getEffectsByCategory() {
  const categories = {}
  
  for (const [id, def] of Object.entries(EFFECTS)) {
    if (!categories[def.category]) {
      categories[def.category] = []
    }
    categories[def.category].push({ id, ...def })
  }
  
  return categories
}

/**
 * Получить дефолтные параметры эффекта
 */
export function getEffectDefaults(effectType) {
  return EFFECTS[effectType]?.defaults ?? {}
}
