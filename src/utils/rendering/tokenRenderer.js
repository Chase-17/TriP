/**
 * TokenRenderer - отрисовка токенов персонажей на canvas
 * 
 * Рисует:
 * - Круглый портрет персонажа (изображение или фоллбек с буквой)
 * - Линии защиты: hex-сегменты (melee) и дуги (ranged)
 * - Индикатор направления (треугольник)
 * - Эффекты ранений (царапины, оверлей тяжёлых ран)
 */

import diffsData from '@/data/diffs.json'
import { calculateWoundSlots } from '@/utils/character/wounds'
import { assetUrl } from '@/utils/assets'

// Кэш загруженных изображений
const imageCache = new Map()

/**
 * Получить полный URL портрета
 * Portrait может быть:
 * - Числом (индекс пресета, например 56) -> /images/presets/56.png
 * - Полный URL (http://, https://)
 * - Data URL (data:image/...)
 * - Blob URL (blob:...)
 * - Название пресета (например, "warrior") -> /images/presets/warrior.png
 * - Путь к файлу (/images/...)
 */
export const getPortraitUrl = (portrait) => {
  if (portrait === null || portrait === undefined) return null
  
  // Если число — это индекс пресета
  if (typeof portrait === 'number') {
    return assetUrl(`/images/presets/${portrait}.png`)
  }
  
  // Если не строка — пробуем преобразовать
  if (typeof portrait !== 'string') {
    return assetUrl(`/images/presets/${String(portrait)}.png`)
  }
  
  // Уже полный URL или data/blob URL
  if (portrait.startsWith('http://') || 
      portrait.startsWith('https://') || 
      portrait.startsWith('data:') || 
      portrait.startsWith('blob:')) {
    return portrait
  }
  
  // Путь начинается с / — добавляем base
  if (portrait.startsWith('/')) {
    return assetUrl(portrait)
  }
  
  // Название пресета -> путь к файлу
  return assetUrl(`/images/presets/${portrait}.png`)
}

/**
 * Загрузить изображение с кэшированием
 * @param {string} src - URL изображения
 * @returns {Promise<HTMLImageElement>}
 */
export const loadImage = (src) => {
  if (!src) return Promise.resolve(null)
  
  if (imageCache.has(src)) {
    return Promise.resolve(imageCache.get(src))
  }
  
  const isExternalUrl = src.startsWith('http://') || src.startsWith('https://')
  const isDataOrBlob = src.startsWith('data:') || src.startsWith('blob:')
  
  return new Promise((resolve, reject) => {
    const img = new Image()
    
    const tryLoadWithoutCors = () => {
      const img2 = new Image()
      img2.onload = () => {
        imageCache.set(src, img2)
        resolve(img2)
      }
      img2.onerror = () => {
        console.warn('Failed to load image (no CORS):', src)
        resolve(null)
      }
      img2.src = src
    }
    
    // Для data/blob URLs crossOrigin не нужен
    if (!isDataOrBlob) {
      img.crossOrigin = 'anonymous'
    }
    
    img.onload = () => {
      imageCache.set(src, img)
      resolve(img)
    }
    img.onerror = (e) => {
      // Для внешних URL пробуем загрузить без CORS
      if (isExternalUrl) {
        console.warn('CORS failed for image, trying without:', src)
        tryLoadWithoutCors()
      } else {
        console.warn('Failed to load image:', src, e)
        resolve(null)
      }
    }
    img.src = src
  })
}

/**
 * Предзагрузить изображения для токенов
 * @param {Array} tokens - массив токенов с character.portrait
 */
export const preloadTokenImages = async (tokens) => {
  const promises = tokens
    .filter(t => t.character?.portrait)
    .map(t => {
      const url = getPortraitUrl(t.character.portrait)
      return loadImage(url).catch(() => null)
    })
  
  await Promise.all(promises)
}

/**
 * Найти сложность по значению защиты
 * @param {number} value - значение защиты
 * @returns {Object} - данные сложности { color, linetype, value, ... }
 */
const findDifficulty = (value) => {
  const diffs = Object.entries(diffsData.default || diffsData)
    .map(([val, data]) => ({ value: parseInt(val), ...data }))
    .filter(d => d.value >= 0)
    .sort((a, b) => a.value - b.value)
  
  let closest = diffs[0]
  for (const diff of diffs) {
    if (diff.value <= value) {
      closest = diff
    } else {
      break
    }
  }
  return closest
}

/**
 * Получить точку на окружности
 * @param {number} cx - центр X
 * @param {number} cy - центр Y
 * @param {number} radius - радиус
 * @param {number} angleDeg - угол в градусах (0 = вверх)
 */
const getPoint = (cx, cy, radius, angleDeg) => {
  const rad = (angleDeg - 90) * Math.PI / 180
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad)
  }
}

/**
 * Нарисовать портрет персонажа (круглый)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - центр X
 * @param {number} cy - центр Y
 * @param {number} radius - радиус портрета
 * @param {string|null} portrait - портрет (пресет или URL)
 * @param {string} name - имя персонажа (для фоллбека)
 * @param {Object} wounds - объект ранений
 * @param {Object} woundSlots - слоты ранений
 */
export const drawPortrait = (ctx, cx, cy, radius, portrait, name, wounds, woundSlots) => {
  ctx.save()
  
  // Получаем полный URL портрета
  const portraitUrl = getPortraitUrl(portrait)
  
  // Обрезка по кругу
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.clip()
  
  // Фон
  ctx.fillStyle = '#1e293b'
  ctx.fill()
  
  // Изображение или фоллбек
  if (portraitUrl && imageCache.has(portraitUrl)) {
    const img = imageCache.get(portraitUrl)
    // Рисуем изображение с сохранением пропорций (cover)
    const imgAspect = img.width / img.height
    let drawW, drawH, drawX, drawY
    
    if (imgAspect > 1) {
      // Широкое изображение
      drawH = radius * 2
      drawW = drawH * imgAspect
      drawX = cx - drawW / 2
      drawY = cy - radius
    } else {
      // Высокое изображение
      drawW = radius * 2
      drawH = drawW / imgAspect
      drawX = cx - radius
      drawY = cy - drawH / 2
    }
    
    ctx.drawImage(img, drawX, drawY, drawW, drawH)
  } else {
    // Фоллбек - буква
    ctx.fillStyle = '#64748b'
    ctx.font = `bold ${radius}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name?.charAt(0)?.toUpperCase() || '?', cx, cy)
  }
  
  // Оверлей тяжёлых ранений (красный снизу вверх)
  if (wounds && woundSlots && wounds.heavy > 0) {
    const total = woundSlots.heavy.base + woundSlots.heavy.bonus
    const percent = (wounds.heavy / total) * 0.7 // Максимум 70%
    
    const gradient = ctx.createLinearGradient(cx, cy + radius, cx, cy - radius)
    gradient.addColorStop(0, 'rgba(220, 38, 38, 0.8)')
    gradient.addColorStop(percent, 'rgba(220, 38, 38, 0.4)')
    gradient.addColorStop(percent + 0.01, 'transparent')
    
    ctx.fillStyle = gradient
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
  }
  
  // Эффект смерти (пульсация)
  if (wounds && woundSlots && wounds.deadly > 0) {
    const total = woundSlots.deadly.base + woundSlots.deadly.bonus
    const level = wounds.deadly / total
    
    if (level >= 1) {
      // Мёртв - серый оверлей
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
    } else {
      // Умирает - красная виньетка
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      gradient.addColorStop(0, 'transparent')
      gradient.addColorStop(0.7, 'transparent')
      gradient.addColorStop(1, `rgba(220, 38, 38, ${0.3 + level * 0.5})`)
      
      ctx.fillStyle = gradient
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
    }
  }
  
  ctx.restore()
  
  // Обводка портрета
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.lineWidth = 2
  ctx.stroke()
}

/**
 * Нарисовать царапины (дуги вокруг портрета)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - центр X
 * @param {number} cy - центр Y
 * @param {number} radius - радиус портрета
 * @param {Object} wounds - объект ранений
 * @param {Object} woundSlots - слоты ранений
 */
export const drawScratches = (ctx, cx, cy, radius, wounds, woundSlots) => {
  if (!wounds || !woundSlots || wounds.scratch === 0) return
  
  const total = woundSlots.scratch.base + woundSlots.scratch.bonus
  const filled = wounds.scratch
  
  const gapDegrees = 10
  const arcLength = (360 - total * gapDegrees) / total
  const filledTotalWidth = filled * arcLength + (filled - 1) * gapDegrees
  const startAngle = 180 - filledTotalWidth / 2
  
  const arcRadius = radius + 4
  
  ctx.strokeStyle = '#fbbf24' // Жёлтый для царапин
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  
  for (let i = 0; i < filled; i++) {
    const angle = startAngle + i * (arcLength + gapDegrees)
    const start = (angle - 90) * Math.PI / 180
    const end = (angle + arcLength - 90) * Math.PI / 180
    
    ctx.beginPath()
    ctx.arc(cx, cy, arcRadius, start, end)
    ctx.stroke()
  }
}

/**
 * Нарисовать лёгкие ранения (точки на границе)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - центр X
 * @param {number} cy - центр Y
 * @param {number} radius - радиус портрета
 * @param {Object} wounds - объект ранений
 * @param {Object} woundSlots - слоты ранений
 */
export const drawLightWounds = (ctx, cx, cy, radius, wounds, woundSlots) => {
  if (!wounds || !woundSlots || wounds.light === 0) return
  
  const filled = wounds.light
  const gapDegrees = 25
  const dotRadius = radius * 0.1
  
  const totalAngle = (filled - 1) * gapDegrees
  const startAngle = 90 + totalAngle / 2
  
  ctx.fillStyle = '#dc2626' // Красный
  
  for (let i = 0; i < filled; i++) {
    const angle = startAngle - i * gapDegrees
    const rad = angle * Math.PI / 180
    
    ctx.beginPath()
    ctx.arc(
      cx + radius * Math.cos(rad),
      cy + radius * Math.sin(rad),
      dotRadius,
      0,
      Math.PI * 2
    )
    ctx.fill()
  }
}

/**
 * Нарисовать сегмент защиты от ударов (hex-линия)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - центр X
 * @param {number} cy - центр Y
 * @param {number} radius - радиус от центра до линии
 * @param {string} segment - 'front', 'flank', 'back'
 * @param {Object} difficulty - данные сложности
 * @param {number} rotation - поворот в градусах
 * @param {string} side - 'left' или 'right'
 */
export const drawMeleeDefenceSegment = (ctx, cx, cy, radius, segment, difficulty, rotation = 0, side = 'left') => {
  if (!difficulty) return
  
  const color = difficulty.color || '#FFFFFF'
  const linetype = difficulty.linetype || 'single'
  
  // Углы для левой и правой стороны
  // Левая: top(0) -> topLeft(300) -> botLeft(240) -> bottom(180)
  // Правая: top(0) -> topRight(60) -> botRight(120) -> bottom(180)
  let angles
  if (side === 'left') {
    angles = { top: 0, upper: 300, lower: 240, bottom: 180 }
  } else {
    angles = { top: 0, upper: 60, lower: 120, bottom: 180 }
  }
  
  const top = getPoint(cx, cy, radius, angles.top + rotation)
  const upper = getPoint(cx, cy, radius, angles.upper + rotation)
  const lower = getPoint(cx, cy, radius, angles.lower + rotation)
  const bottom = getPoint(cx, cy, radius, angles.bottom + rotation)
  
  let p1, p2
  if (segment === 'front') {
    p1 = top
    p2 = upper
  } else if (segment === 'flank') {
    p1 = upper
    p2 = lower
  } else if (segment === 'back') {
    p1 = lower
    p2 = bottom
  } else {
    return
  }
  
  // Рисуем линию в зависимости от типа
  ctx.lineCap = 'butt' // Квадратные концы для "слипания" линий
  ctx.strokeStyle = color
  
  if (linetype === 'dashed') {
    // Только пунктир для низкой защиты
    ctx.setLineDash([4, 5]) // Увеличенные промежутки для читаемости
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    ctx.setLineDash([])
  } else if (linetype === 'double') {
    // Двойная линия: сплошная внутри + пунктир снаружи, вплотную
    // Внутренняя сплошная линия
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    
    // Внешняя пунктирная линия (смещение = половина толщины каждой линии)
    const outerRadius = radius + 1.5 // Минимальный offset для слияния
    const outerP1 = getPoint(cx, cy, outerRadius, (segment === 'front' ? angles.top : segment === 'flank' ? angles.upper : angles.lower) + rotation)
    const outerP2 = getPoint(cx, cy, outerRadius, (segment === 'front' ? angles.upper : segment === 'flank' ? angles.lower : angles.bottom) + rotation)
    
    ctx.setLineDash([4, 5])
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(outerP1.x, outerP1.y)
    ctx.lineTo(outerP2.x, outerP2.y)
    ctx.stroke()
    ctx.setLineDash([])
  } else {
    // single - только сплошная линия
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
  }
}

/**
 * Нарисовать сегмент защиты от снарядов (дуга)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - центр X
 * @param {number} cy - центр Y
 * @param {number} radius - радиус дуги
 * @param {string} segment - 'front', 'flank', 'back'
 * @param {Object} difficulty - данные сложности
 * @param {number} rotation - поворот в градусах
 * @param {string} side - 'left' или 'right'
 */
export const drawRangedDefenceSegment = (ctx, cx, cy, radius, segment, difficulty, rotation = 0, side = 'left') => {
  if (!difficulty) return
  
  const color = difficulty.color || '#FFFFFF'
  const linetype = difficulty.linetype || 'single'
  
  // Углы для левой и правой стороны
  // Левая: front(300-360), flank(240-300), back(180-240)
  // Правая: front(0-60), flank(60-120), back(120-180)
  let startAngle, endAngle
  
  if (side === 'left') {
    if (segment === 'front') {
      startAngle = 300
      endAngle = 360
    } else if (segment === 'flank') {
      startAngle = 240
      endAngle = 300
    } else if (segment === 'back') {
      startAngle = 180
      endAngle = 240
    } else {
      return
    }
  } else {
    // Правая сторона
    if (segment === 'front') {
      startAngle = 0
      endAngle = 60
    } else if (segment === 'flank') {
      startAngle = 60
      endAngle = 120
    } else if (segment === 'back') {
      startAngle = 120
      endAngle = 180
    } else {
      return
    }
  }
  
  // Применяем поворот
  startAngle += rotation
  endAngle += rotation
  
  const startRad = (startAngle - 90) * Math.PI / 180
  const endRad = (endAngle - 90) * Math.PI / 180
  
  ctx.lineCap = 'butt' // Квадратные концы для "слипания" линий
  ctx.strokeStyle = color
  
  if (linetype === 'dashed') {
    // Только пунктир для низкой защиты
    ctx.setLineDash([4, 5]) // Увеличенные промежутки для читаемости
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, radius, startRad, endRad)
    ctx.stroke()
    ctx.setLineDash([])
  } else if (linetype === 'double') {
    // Двойная линия: сплошная внутри + пунктир снаружи, вплотную
    // Внутренняя сплошная дуга
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, radius, startRad, endRad)
    ctx.stroke()
    
    // Внешняя пунктирная дуга (смещение = половина толщины каждой линии)
    ctx.setLineDash([4, 5])
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, radius + 1.5, startRad, endRad) // Минимальный offset для слияния
    ctx.stroke()
    ctx.setLineDash([])
  } else {
    // single - только сплошная линия
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(cx, cy, radius, startRad, endRad)
    ctx.stroke()
  }
}

/**
 * Нарисовать полную защиту токена (с обеих сторон)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - центр X
 * @param {number} cy - центр Y
 * @param {number} portraitRadius - радиус портрета
 * @param {Object} meleeDefence - { front, flank, back } значения защиты
 * @param {Object} rangedDefence - { front, flank, back } значения защиты
 * @param {number} rotation - поворот токена (facing * 60)
 * @param {Object} options - { bothSides: true } для отображения с обеих сторон
 */
export const drawDefence = (ctx, cx, cy, portraitRadius, meleeDefence, rangedDefence, rotation = 0, options = {}) => {
  const { bothSides = false } = options
  const hexRadius = portraitRadius + 14 // Отступ чтобы не наползать на царапины
  const arcRadius = hexRadius + 6       // Дуги снаружи гекса
  
  // Melee defence (hex segments) - левая сторона
  if (meleeDefence) {
    for (const segment of ['front', 'flank', 'back']) {
      const value = meleeDefence[segment]
      if (value !== undefined && value !== null) {
        const diff = findDifficulty(value)
        drawMeleeDefenceSegment(ctx, cx, cy, hexRadius, segment, diff, rotation, 'left')
        
        // Правая сторона (зеркально)
        if (bothSides) {
          drawMeleeDefenceSegment(ctx, cx, cy, hexRadius, segment, diff, rotation, 'right')
        }
      }
    }
  }
  
  // Ranged defence (arc segments)
  if (rangedDefence) {
    for (const segment of ['front', 'flank', 'back']) {
      const value = rangedDefence[segment]
      if (value !== undefined && value !== null) {
        const diff = findDifficulty(value)
        drawRangedDefenceSegment(ctx, cx, cy, arcRadius, segment, diff, rotation, 'left')
        
        // Правая сторона (зеркально)
        if (bothSides) {
          drawRangedDefenceSegment(ctx, cx, cy, arcRadius, segment, diff, rotation, 'right')
        }
      }
    }
  }
}

/**
 * Нарисовать индикатор направления (треугольник)
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - центр X
 * @param {number} cy - центр Y
 * @param {number} radius - расстояние до индикатора
 * @param {number} rotation - поворот в градусах
 */
export const drawFacingIndicator = (ctx, cx, cy, radius, rotation = 0) => {
  const tip = getPoint(cx, cy, radius + 8, rotation)
  const left = getPoint(cx, cy, radius, rotation - 15)
  const right = getPoint(cx, cy, radius, rotation + 15)
  
  ctx.beginPath()
  ctx.moveTo(tip.x, tip.y)
  ctx.lineTo(left.x, left.y)
  ctx.lineTo(right.x, right.y)
  ctx.closePath()
  
  ctx.fillStyle = 'rgba(250, 204, 21, 0.9)' // Жёлтый
  ctx.fill()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.lineWidth = 1
  ctx.stroke()
}

/**
 * Нарисовать оверлей токена (подложка + защита) - рисуется ПОВЕРХ всех токенов
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} token - данные токена
 * @param {Object} options - опции отрисовки
 */
export const drawTokenOverlay = (ctx, token, options = {}) => {
  const {
    tokenSize = 48,
    isHovered = false,
    isSelected = false,
    canSeeDefence = false,
    facingOffset = 0 // Смещение направления для flat-top (90°) или pointy-top (0°)
  } = options
  
  const { character, pixelX, pixelY, facing = 0, meleeDefence, rangedDefence } = token
  if (!character) return
  
  const cx = pixelX
  const cy = pixelY
  const portraitRadius = tokenSize / 2
  const rotation = facing * 30 + facingOffset // facing: 0-11, каждый шаг = 30°, + смещение для ориентации
  
  const shouldShowDefenceUI = (isHovered || isSelected) && canSeeDefence && (meleeDefence || rangedDefence)
  
  if (shouldShowDefenceUI) {
    // Получаем данные для ран
    const wounds = character.combat?.wounds
    const woundSlots = character.woundSlots || 
      (character.stats ? calculateWoundSlots(character.stats, character.combat?.bonusDeadlySlots || 0) : null)
    
    // 1. Рисуем тёмную подложку (заполненный круг)
    drawTokenHoverUI(ctx, cx, cy, portraitRadius, rotation, isSelected, isHovered)
    
    // 2. Рисуем защиту
    drawDefence(ctx, cx, cy, portraitRadius, meleeDefence, rangedDefence, rotation, { bothSides: true })
    
    // 3. Перерисовываем портрет поверх подложки
    drawPortrait(ctx, cx, cy, portraitRadius, character.portrait, character.name, wounds, woundSlots)
    
    // 4. Перерисовываем царапины и раны поверх
    if (wounds && woundSlots) {
      drawScratches(ctx, cx, cy, portraitRadius, wounds, woundSlots)
      drawLightWounds(ctx, cx, cy, portraitRadius, wounds, woundSlots)
    }
    
    // 5. Перерисовываем индикатор направления поверх
    const indicatorRadius = portraitRadius + 28
    drawFacingIndicator(ctx, cx, cy, indicatorRadius, rotation)
  }
}

/**
 * Нарисовать один токен полностью
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} token - данные токена { character, pixelX, pixelY, facing, meleeDefence, rangedDefence }
 * @param {Object} options - опции отрисовки
 */
export const drawToken = (ctx, token, options = {}) => {
  const {
    tokenSize = 48,
    showDefence = false, // По умолчанию защита скрыта
    showFacing = true,
    isHovered = false,
    isSelected = false,
    canSeeDefence = false, // Может ли текущий игрок видеть защиту этого токена
    facingOffset = 0 // Смещение направления для flat-top (90°) или pointy-top (0°)
  } = options
  
  const { character, pixelX, pixelY, facing = 0, meleeDefence, rangedDefence } = token
  if (!character) return
  
  const cx = pixelX
  const cy = pixelY
  const portraitRadius = tokenSize / 2
  const rotation = facing * 30 + facingOffset // facing: 0-11, каждый шаг = 30°, + смещение для ориентации
  
  // Получаем данные для ран
  const wounds = character.combat?.wounds
  // Вычисляем слоты ранений из stats (если не переданы напрямую)
  const woundSlots = character.woundSlots || 
    (character.stats ? calculateWoundSlots(character.stats, character.combat?.bonusDeadlySlots || 0) : null)
  
  // Показывать ли интерфейс защиты (только при hover/select и если есть доступ)
  const shouldShowDefenceUI = (isHovered || isSelected) && canSeeDefence && (meleeDefence || rangedDefence)
  
  // 0. Тёмный фон-интерфейс при hover (если показываем защиту)
  if (shouldShowDefenceUI) {
    drawTokenHoverUI(ctx, cx, cy, portraitRadius, rotation, isSelected, isHovered)
  }
  
  // 1. Портрет (не вращается)
  drawPortrait(ctx, cx, cy, portraitRadius, character.portrait, character.name, wounds, woundSlots)
  
  // 2. Царапины и лёгкие ранения (не вращаются)
  if (wounds && woundSlots) {
    drawScratches(ctx, cx, cy, portraitRadius, wounds, woundSlots)
    drawLightWounds(ctx, cx, cy, portraitRadius, wounds, woundSlots)
  }
  
  // 4. Защита (только при hover и если есть доступ) - вращается с направлением
  if (shouldShowDefenceUI) {
    drawDefence(ctx, cx, cy, portraitRadius, meleeDefence, rangedDefence, rotation, { bothSides: true })
  }
  
  // 5. Индикатор направления
  if (showFacing) {
    const indicatorRadius = portraitRadius + (shouldShowDefenceUI ? 28 : 8)
    drawFacingIndicator(ctx, cx, cy, indicatorRadius, rotation)
  }
}

/**
 * Нарисовать тёмный фон-интерфейс при наведении
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx - центр X
 * @param {number} cy - центр Y
 * @param {number} portraitRadius - радиус портрета
 * @param {number} rotation - поворот в градусах
 */
export const drawTokenHoverUI = (ctx, cx, cy, portraitRadius, rotation = 0, isSelected = false, isHovered = false) => {
  ctx.save()
  
  const uiRadius = portraitRadius + 35 // Радиус интерфейса
  
  // Тёмный градиентный фон с изменением цвета в зависимости от состояния
  const gradient = ctx.createRadialGradient(cx, cy, portraitRadius - 5, cx, cy, uiRadius)
  
  if (isSelected) {
    // Жёлто-золотистый оттенок для выбранного
    gradient.addColorStop(0, 'rgba(45, 35, 15, 0.95)')
    gradient.addColorStop(0.6, 'rgba(35, 28, 12, 0.85)')
    gradient.addColorStop(1, 'rgba(25, 20, 8, 0)')
  } else if (isHovered) {
    // Голубоватый оттенок для hover
    gradient.addColorStop(0, 'rgba(15, 30, 45, 0.95)')
    gradient.addColorStop(0.6, 'rgba(12, 25, 38, 0.85)')
    gradient.addColorStop(1, 'rgba(8, 18, 28, 0)')
  } else {
    // Обычный тёмный фон
    gradient.addColorStop(0, 'rgba(15, 23, 42, 0.95)')
    gradient.addColorStop(0.6, 'rgba(15, 23, 42, 0.85)')
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0)')
  }
  
  ctx.beginPath()
  ctx.arc(cx, cy, uiRadius, 0, Math.PI * 2)
  ctx.fillStyle = gradient
  ctx.fill()
  
  // Тонкая обводка интерфейса с изменением цвета
  ctx.beginPath()
  ctx.arc(cx, cy, uiRadius - 2, 0, Math.PI * 2)
  if (isSelected) {
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)' // Золотистая обводка
  } else if (isHovered) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)' // Голубая обводка
  } else {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)' // Обычная серая
  }
  ctx.lineWidth = 1
  ctx.stroke()
  
  ctx.restore()
}



/**
 * Нарисовать все токены на слое UI
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} tokens - массив токенов
 * @param {Object} options - опции отрисовки
 *   - hoveredTokenId: ID токена под курсором
 *   - selectedTokenId: ID выбранного токена
 *   - currentUserId: ID текущего пользователя
 *   - isMaster: является ли текущий пользователь мастером
 *   - draggingTokenId: ID перетаскиваемого токена
 */
export const drawTokens = (ctx, tokens, options = {}) => {
  const { 
    hoveredTokenId = null, 
    selectedTokenId = null,
    currentUserId = null,
    isMaster = false,
    draggingTokenId = null,
    facingOffset = 0
  } = options
  
  // Собираем информацию о токенах с их состояниями
  const tokenStates = tokens.map(token => {
    const isHovered = token.id === hoveredTokenId || token.characterId === hoveredTokenId
    const isSelected = token.id === selectedTokenId || token.characterId === selectedTokenId
    const isDragging = token.id === draggingTokenId || token.characterId === draggingTokenId
    
    const isOwner = token.character?.ownerId === currentUserId
    const showDefenceToOthers = token.character?.combat?.showDefenceToOthers || false
    const canSeeDefence = isMaster || isOwner || showDefenceToOthers
    
    return { token, isHovered, isSelected, isDragging, canSeeDefence }
  })
  
  // ПЕРВЫЙ ПРОХОД: Рисуем все токены БЕЗ UI hover/defence
  for (const { token, isHovered, isSelected, isDragging, canSeeDefence } of tokenStates) {
    if (isDragging) {
      ctx.save()
      ctx.globalAlpha = 0.7
    }
    
    drawToken(ctx, token, {
      ...options,
      isHovered: false, // Не рисуем UI в первом проходе
      isSelected: false,
      canSeeDefence
    })
    
    if (isDragging) {
      ctx.restore()
    }
  }
  
  // ВТОРОЙ ПРОХОД: Рисуем UI hover/defence поверх всех токенов
  // Сначала selected, потом hovered (чтобы hovered был сверху)
  const interactiveTokens = tokenStates.filter(ts => ts.isHovered || ts.isSelected)
  
  // Сортируем: сначала selected, потом hovered (hovered рисуется последним = сверху)
  interactiveTokens.sort((a, b) => {
    if (a.isHovered && !b.isHovered) return 1  // hovered идёт последним
    if (!a.isHovered && b.isHovered) return -1
    return 0
  })
  
  for (const { token, isHovered, isSelected, canSeeDefence } of interactiveTokens) {
    drawTokenOverlay(ctx, token, {
      ...options,
      isHovered,
      isSelected,
      canSeeDefence
    })
  }
}

// ========== HIT TESTING ==========

/**
 * Проверить, попадает ли точка в токен
 * @param {number} x - координата X точки (в мировых координатах)
 * @param {number} y - координата Y точки (в мировых координатах)
 * @param {Object} token - токен { pixelX, pixelY }
 * @param {number} tokenSize - размер токена
 * @returns {boolean}
 */
export const isPointInToken = (x, y, token, tokenSize) => {
  const dx = x - token.pixelX
  const dy = y - token.pixelY
  const radius = tokenSize / 2
  return (dx * dx + dy * dy) <= (radius * radius)
}

/**
 * Найти токен под курсором
 * @param {number} x - координата X (в мировых координатах)
 * @param {number} y - координата Y (в мировых координатах)
 * @param {Array} tokens - массив токенов
 * @param {number} tokenSize - размер токена
 * @returns {Object|null} - токен или null
 */
export const findTokenAtPoint = (x, y, tokens, tokenSize) => {
  // Проходим в обратном порядке (верхние токены приоритетнее)
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]
    if (isPointInToken(x, y, token, tokenSize)) {
      return token
    }
  }
  return null
}

/**
 * Конвертировать координаты canvas в мировые (с учётом камеры)
 * @param {number} canvasX - X на canvas
 * @param {number} canvasY - Y на canvas
 * @param {Object} camera - { x, y, zoom }
 * @returns {{ x: number, y: number }}
 */
export const canvasToWorld = (canvasX, canvasY, camera) => {
  return {
    x: (canvasX - camera.x) / camera.zoom,
    y: (canvasY - camera.y) / camera.zoom
  }
}

/**
 * Конвертировать мировые координаты в координаты canvas
 * @param {number} worldX - X в мире
 * @param {number} worldY - Y в мире
 * @param {Object} camera - { x, y, zoom }
 * @returns {{ x: number, y: number }}
 */
export const worldToCanvas = (worldX, worldY, camera) => {
  return {
    x: worldX * camera.zoom + camera.x,
    y: worldY * camera.zoom + camera.y
  }
}
