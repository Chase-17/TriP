/**
 * Утилиты для обработки изображений
 * Селективный hue-shift, фильтры, генерация вариантов
 */

/**
 * RGB → HSL конвертация
 */
export const rgbToHsl = (r, g, b) => {
  r /= 255
  g /= 255
  b /= 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h, s
  const l = (max + min) / 2

  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return [h * 360, s, l]
}

/**
 * HSL → RGB конвертация
 */
export const hslToRgb = (h, s, l) => {
  h /= 360
  let r, g, b

  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

/**
 * Линейная интерполяция
 */
export const lerp = (a, b, t) => a + (b - a) * t

/**
 * Маппинг значения из одного диапазона в другой
 */
export const mapRange = (value, inMin, inMax, outMin, outMax) => {
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin
}

/**
 * Селективный hue-shift для изображения
 * 
 * @param {HTMLCanvasElement|HTMLImageElement} source - Исходное изображение
 * @param {Object} options - Настройки
 * @param {Object} options.sourceRange - Диапазон исходных оттенков { minHue, maxHue }
 * @param {Object} options.targetRange - Целевой диапазон { minHue, maxHue }
 * @param {number} options.minSaturation - Минимальная насыщенность для обработки (0-1)
 * @param {boolean} options.preserveLightness - Сохранять яркость
 * @returns {HTMLCanvasElement} - Обработанный canvas
 */
export const selectiveHueShift = (source, options = {}) => {
  const {
    sourceRange = { minHue: 80, maxHue: 150 },  // Зелёный диапазон
    targetRange = { minHue: 30, maxHue: 50 },   // Жёлто-оранжевый
    minSaturation = 0.2,
    preserveLightness = true
  } = options

  // Создаём canvas для обработки
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  // Определяем размеры источника
  const width = source.width || source.naturalWidth
  const height = source.height || source.naturalHeight
  canvas.width = width
  canvas.height = height

  // Рисуем исходное изображение
  ctx.drawImage(source, 0, 0)

  // Получаем пиксели
  const imageData = ctx.getImageData(0, 0, width, height)
  const pixels = imageData.data

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]
    const g = pixels[i + 1]
    const b = pixels[i + 2]
    // Alpha остаётся без изменений

    const [h, s, l] = rgbToHsl(r, g, b)

    // Проверяем, попадает ли пиксель в исходный диапазон
    const inRange = h >= sourceRange.minHue && 
                    h <= sourceRange.maxHue && 
                    s >= minSaturation

    if (inRange) {
      // Маппим hue из исходного диапазона в целевой
      const newH = mapRange(
        h, 
        sourceRange.minHue, 
        sourceRange.maxHue, 
        targetRange.minHue, 
        targetRange.maxHue
      )

      const [newR, newG, newB] = hslToRgb(newH, s, l)
      
      pixels[i] = newR
      pixels[i + 1] = newG
      pixels[i + 2] = newB
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas
}

/**
 * Пресеты для времён года
 */
export const SEASON_PRESETS = {
  summerToAutumn: {
    sourceRange: { minHue: 70, maxHue: 160 },   // Зелёные оттенки
    targetRange: { minHue: 20, maxHue: 55 },    // Жёлто-оранжево-красные
    minSaturation: 0.15
  },
  summerToWinter: {
    sourceRange: { minHue: 60, maxHue: 160 },
    targetRange: { minHue: 180, maxHue: 220 },  // Холодные синеватые
    minSaturation: 0.1,
    // Дополнительно можно снизить насыщенность
  },
  dayToNight: {
    sourceRange: { minHue: 0, maxHue: 360 },    // Все цвета
    targetRange: { minHue: 220, maxHue: 260 },  // Синий
    minSaturation: 0
  }
}

/**
 * Применить пресет сезона к изображению
 */
export const applySeasonPreset = (source, presetName) => {
  const preset = SEASON_PRESETS[presetName]
  if (!preset) {
    console.warn(`Unknown season preset: ${presetName}`)
    return source
  }
  return selectiveHueShift(source, preset)
}

/**
 * Конвертировать canvas в Data URL
 */
export const canvasToDataUrl = (canvas, format = 'image/png', quality = 0.92) => {
  return canvas.toDataURL(format, quality)
}

/**
 * Конвертировать canvas в Blob
 */
export const canvasToBlob = (canvas, format = 'image/png', quality = 0.92) => {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, format, quality)
  })
}

/**
 * Загрузить изображение из URL/Data URL
 */
export const loadImage = (src) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Создать миниатюру изображения
 */
export const createThumbnail = (source, maxSize = 64) => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  const width = source.width || source.naturalWidth
  const height = source.height || source.naturalHeight
  
  const scale = Math.min(maxSize / width, maxSize / height)
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)

  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas
}
