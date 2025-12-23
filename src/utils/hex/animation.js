/**
 * Утилиты для анимации движения токенов по гексагональной сетке
 */

import { HEX_DIRECTIONS } from './grid'

/**
 * Определить направление (0-5) от одного гекса к другому
 * 
 * @param {Object} from - {q, r} начальный гекс
 * @param {Object} to - {q, r} конечный гекс
 * @returns {number} направление 0-5 (или null если гексы совпадают)
 */
export function getHexDirection(from, to) {
  const dq = to.q - from.q
  const dr = to.r - from.r
  
  // Если гексы совпадают - направление не меняется
  if (dq === 0 && dr === 0) return null
  
  // Нормализуем направление для соседних гексов
  // Для не-соседних гексов ищем ближайшее направление
  const length = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr))
  const nq = dq / length
  const nr = dr / length
  
  // Находим ближайшее стандартное направление
  let bestDir = 0
  let bestDist = Infinity
  
  for (let i = 0; i < HEX_DIRECTIONS.length; i++) {
    const dir = HEX_DIRECTIONS[i]
    const dist = Math.abs(nq - dir.q) + Math.abs(nr - dir.r)
    if (dist < bestDist) {
      bestDist = dist
      bestDir = i
    }
  }
  
  return bestDir
}

/**
 * Конвертировать направление 0-5 в 12-секторное (0-11) для более плавного поворота
 * Направления 0-5 соответствуют нечётным 12-секторам (1, 3, 5, 7, 9, 11)
 * 
 * @param {number} dir6 - направление 0-5
 * @returns {number} направление 0-11
 */
export function direction6to12(dir6) {
  // 0 -> 0, 1 -> 2, 2 -> 4, 3 -> 6, 4 -> 8, 5 -> 10
  return dir6 * 2
}

/**
 * Easing функция для плавного движения (ease-in-out cubic)
 */
function easeInOutCubic(t) {
  return t < 0.5 
    ? 4 * t * t * t 
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Линейная интерполяция
 */
function lerp(a, b, t) {
  return a + (b - a) * t
}

/**
 * Создать сплайн Катмулла-Рома для плавной кривой через точки
 * @param {Array} points - массив точек [{x, y}]
 * @param {number} t - параметр 0-1 вдоль всего пути
 * @returns {{x, y}} интерполированная точка
 */
function catmullRomSpline(points, t) {
  if (points.length < 2) return points[0] || { x: 0, y: 0 }
  if (points.length === 2) {
    return {
      x: lerp(points[0].x, points[1].x, t),
      y: lerp(points[0].y, points[1].y, t)
    }
  }
  
  // Находим сегмент
  const segments = points.length - 1
  const scaledT = t * segments
  const segment = Math.min(Math.floor(scaledT), segments - 1)
  const localT = scaledT - segment
  
  // Получаем 4 контрольные точки для Catmull-Rom
  const p0 = points[Math.max(0, segment - 1)]
  const p1 = points[segment]
  const p2 = points[Math.min(points.length - 1, segment + 1)]
  const p3 = points[Math.min(points.length - 1, segment + 2)]
  
  // Catmull-Rom интерполяция
  const t2 = localT * localT
  const t3 = t2 * localT
  
  const x = 0.5 * (
    (2 * p1.x) +
    (-p0.x + p2.x) * localT +
    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
  )
  
  const y = 0.5 * (
    (2 * p1.y) +
    (-p0.y + p2.y) * localT +
    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
  )
  
  return { x, y }
}

/**
 * Вычислить направление (угол) по касательной к кривой
 * @param {Array} points - массив точек [{x, y}]
 * @param {number} t - параметр 0-1
 * @returns {number} угол в радианах
 */
function getSplineTangentAngle(points, t) {
  const delta = 0.01
  const t1 = Math.max(0, t - delta)
  const t2 = Math.min(1, t + delta)
  
  const p1 = catmullRomSpline(points, t1)
  const p2 = catmullRomSpline(points, t2)
  
  return Math.atan2(p2.y - p1.y, p2.x - p1.x)
}

/**
 * Конвертировать угол в 12-секторное направление
 * @param {number} angle - угол в радианах (от atan2: 0 = вправо, π/2 = вниз)
 * @param {boolean} isPointy - true для pointy-top ориентации, false для flat-top
 * @returns {number} направление 0-11 (0 = вправо/восток, по часовой стрелке)
 */
function angleToFacing12(angle, isPointy = true) {
  // atan2 возвращает: 0 = вправо, π/2 = вниз (в экранных координатах где Y вниз)
  // Нам нужно: facing 0 = вправо, facing 3 = вниз (90°), facing 6 = влево (180°)
  
  // Конвертируем радианы в градусы
  let degrees = angle * (180 / Math.PI)
  
  // Нормализуем к 0-360
  while (degrees < 0) degrees += 360
  while (degrees >= 360) degrees -= 360
  
  // Делим на 12 секторов (30° каждый)
  // Добавляем 15° для центрирования сектора
  let sector = Math.floor((degrees + 15) / 30) % 12
  
  // Для pointy-top нужна коррекция +3 сектора (90°)
  // Flat-top работает без коррекции
  if (isPointy) {
    sector = (sector + 3) % 12
  }
  
//   console.log('[angleToFacing12] angle:', (angle * 180 / Math.PI).toFixed(1) + '°', 
//     'degrees:', degrees.toFixed(1), 
//     'sector:', sector,
//     'isPointy:', isPointy)
  
  return sector
}

/**
 * Класс для плавной анимации токена по кривой
 */
export class SmoothTokenAnimation {
  constructor(options = {}) {
    this.characterId = options.characterId
    this.path = options.path || [] // [{q, r}]
    this.pixelPath = options.pixelPath || [] // [{x, y}] - путь в пикселях
    this.duration = options.duration || 500 // общая длительность в мс
    this.startTimestamp = options.startTimestamp || Date.now() // время начала для синхронизации
    this.onUpdate = options.onUpdate || (() => {}) // (x, y, facing, progress)
    this.onComplete = options.onComplete || (() => {})
    this.onHexChange = options.onHexChange || (() => {}) // вызывается при смене гекса
    this.isPointy = options.isPointy !== false // true для pointy-top, false для flat-top
    
    this.startTime = null
    this.isRunning = false
    this.animationFrameId = null
    this.lastHexIndex = 0
    this.lastFacing = 0 // Сохраняем последнее направление
  }
  
  /**
   * Запустить анимацию
   */
  start() {
    if (this.pixelPath.length < 2) {
      this.onComplete()
      return
    }
    
    this.startTime = performance.now()
    this.isRunning = true
    this.lastHexIndex = 0
    this.tick()
  }
  
  /**
   * Один кадр анимации
   */
  tick() {
    if (!this.isRunning) return
    
    const now = performance.now()
    const elapsed = now - this.startTime
    const rawProgress = Math.min(elapsed / this.duration, 1)
    const progress = easeInOutCubic(rawProgress)
    
    // Интерполируем позицию по сплайну
    const pos = catmullRomSpline(this.pixelPath, progress)
    
    // Вычисляем направление по касательной с учётом ориентации
    const angle = getSplineTangentAngle(this.pixelPath, progress)
    const facing = angleToFacing12(angle, this.isPointy)
    this.lastFacing = facing // Сохраняем для использования после анимации
    
    // Определяем текущий гекс
    const hexIndex = Math.min(
      Math.floor(progress * (this.path.length - 1)),
      this.path.length - 1
    )
    
    // Если сменился гекс - вызываем callback
    if (hexIndex !== this.lastHexIndex && hexIndex < this.path.length) {
      this.onHexChange(this.path[hexIndex], hexIndex)
      this.lastHexIndex = hexIndex
    }
    
    // Обновляем позицию
    this.onUpdate(pos.x, pos.y, facing, progress)
    
    if (rawProgress < 1) {
      this.animationFrameId = requestAnimationFrame(() => this.tick())
    } else {
      this.complete()
    }
  }
  
  /**
   * Завершить анимацию
   */
  complete() {
    this.isRunning = false
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    this.onComplete()
  }
  
  /**
   * Остановить анимацию
   */
  stop() {
    this.isRunning = false
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }
}

/**
 * Менеджер анимаций токенов
 * Хранит состояние анимируемых токенов для рендеринга
 */
export class TokenAnimationManager {
  constructor() {
    this.animations = new Map() // characterId -> SmoothTokenAnimation
    this.animatedPositions = new Map() // characterId -> { x, y, facing }
    this.onRenderCallback = null // callback для рендеринга
    this.renderLoopId = null
  }
  
  /**
   * Установить callback для рендеринга
   * @param {Function} callback - функция рендеринга
   */
  setRenderCallback(callback) {
    this.onRenderCallback = callback
  }
  
  /**
   * Запустить цикл рендеринга
   */
  startRenderLoop() {
    if (this.renderLoopId) return
    
    const loop = () => {
      if (this.animations.size > 0) {
        if (this.onRenderCallback) {
          this.onRenderCallback()
        }
        this.renderLoopId = requestAnimationFrame(loop)
      } else {
        this.renderLoopId = null
      }
    }
    
    this.renderLoopId = requestAnimationFrame(loop)
  }
  
  /**
   * Остановить цикл рендеринга
   */
  stopRenderLoop() {
    if (this.renderLoopId) {
      cancelAnimationFrame(this.renderLoopId)
      this.renderLoopId = null
    }
  }
  
  /**
   * Запустить анимацию движения токена
   * @param {Object} options
   * @param {string} options.characterId - ID персонажа
   * @param {Array} options.path - путь в гексах [{q, r}]
   * @param {Function} options.hexToPixel - функция конвертации гексов в пиксели
   * @param {number} options.duration - длительность анимации в мс
   * @param {boolean} options.isPointy - true для pointy-top, false для flat-top ориентации
   * @param {Function} options.onHexChange - callback при смене гекса
   * @param {Function} options.onComplete - callback при завершении
   * @returns {SmoothTokenAnimation}
   */
  animate(options) {
    const {
      characterId,
      path,
      hexToPixel,
      duration = 100 * path.length, // ~100мс на гекс
      isPointy = true,
      onHexChange = () => {},
      onComplete = () => {}
    } = options
    
    // Останавливаем предыдущую анимацию если есть
    this.stop(characterId)
    
    // Конвертируем путь в пиксели
    const pixelPath = path.map(hex => hexToPixel(hex.q, hex.r))
    
    const animation = new SmoothTokenAnimation({
      characterId,
      path,
      pixelPath,
      duration,
      isPointy,
      onUpdate: (x, y, facing, progress) => {
        this.animatedPositions.set(characterId, { x, y, facing })
      },
      onHexChange,
      onComplete: () => {
        // Сохраняем lastFacing до удаления анимации
        const finalFacing = animation.lastFacing
        this.animations.delete(characterId)
        this.animatedPositions.delete(characterId)
        // Передаём финальное направление в callback
        onComplete(finalFacing)
      }
    })
    
    this.animations.set(characterId, animation)
    animation.start()
    
    // Запускаем цикл рендеринга
    this.startRenderLoop()
    
    return animation
  }
  
  /**
   * Остановить анимацию токена
   */
  stop(characterId) {
    const animation = this.animations.get(characterId)
    if (animation) {
      animation.stop()
      this.animations.delete(characterId)
      this.animatedPositions.delete(characterId)
    }
  }
  
  /**
   * Получить анимированную позицию токена (если анимируется)
   * @param {string} characterId
   * @returns {{ x, y, facing } | null}
   */
  getAnimatedPosition(characterId) {
    return this.animatedPositions.get(characterId) || null
  }
  
  /**
   * Проверить, анимируется ли токен
   */
  isAnimating(characterId) {
    return this.animations.has(characterId)
  }
  
  /**
   * Остановить все анимации
   */
  stopAll() {
    for (const animation of this.animations.values()) {
      animation.stop()
    }
    this.animations.clear()
    this.animatedPositions.clear()
  }
}

// Глобальный менеджер анимаций (singleton)
export const tokenAnimationManager = new TokenAnimationManager()

/**
 * Запустить плавную анимацию движения токена
 * 
 * @param {Object} options
 * @param {string} options.characterId - ID персонажа
 * @param {Array} options.path - путь [{q, r, cost}]
 * @param {Function} options.hexToPixel - функция конвертации (q, r) -> {x, y}
 * @param {Function} options.moveToken - функция перемещения токена (q, r) => void
 * @param {Function} options.rotateToken - функция поворота токена (facing) => void
 * @param {Function} options.onComplete - callback при завершении
 * @param {number} options.duration - общая длительность (default: 100мс * длина пути)
 * @param {boolean} options.isPointy - true для pointy-top, false для flat-top ориентации
 * @returns {SmoothTokenAnimation} объект анимации для управления
 */
export function animateTokenMovement(options) {
  const {
    characterId,
    path,
    hexToPixel,
    moveToken,
    rotateToken,
    onComplete = () => {},
    duration,
    isPointy = true
  } = options
  
  if (!path || path.length < 2) {
    onComplete(0)
    return null
  }
  
  return tokenAnimationManager.animate({
    characterId,
    path,
    hexToPixel,
    duration: duration || 100 * path.length,
    isPointy,
    onHexChange: (hex, index) => {
      // Перемещаем токен в store при достижении нового гекса
      moveToken(hex.q, hex.r)
    },
    onComplete: (lastFacing) => {
      // Финальное перемещение в целевой гекс
      const lastHex = path[path.length - 1]
      moveToken(lastHex.q, lastHex.r)
      // Передаём финальное направление из анимации
      onComplete(lastFacing)
    }
  })
}

/**
 * Воспроизвести анимацию движения, полученную от другого пира
 * Учитывает разницу во времени для синхронизации
 * 
 * @param {Object} options
 * @param {string} options.characterId - ID персонажа
 * @param {Array} options.path - путь [{q, r}]
 * @param {Function} options.hexToPixel - функция конвертации (q, r) -> {x, y}
 * @param {Function} options.moveToken - функция перемещения токена (q, r) => void
 * @param {number} options.duration - общая длительность в мс
 * @param {number} options.startTime - время начала анимации (Date.now() на стороне отправителя)
 * @param {number} options.finalFacing - финальное направление токена
 * @param {boolean} options.isPointy - true для pointy-top, false для flat-top ориентации
 * @param {Function} options.onComplete - callback при завершении
 */
export function animateTokenFromRemote(options) {
  const {
    characterId,
    path,
    hexToPixel,
    moveToken,
    duration,
    startTime,
    finalFacing = 0,
    isPointy = true,
    onComplete = () => {}
  } = options
  
  if (!path || path.length < 2) {
    // Нет пути - сразу ставим в финальную позицию
    const lastHex = path?.[path.length - 1] || path?.[0]
    if (lastHex) {
      moveToken(lastHex.q, lastHex.r)
    }
    onComplete(finalFacing)
    return null
  }
  
  // Вычисляем сколько времени прошло с начала анимации
  // Используем небольшой порог чтобы компенсировать рассинхронизацию часов между устройствами
  const elapsed = Date.now() - startTime
  const clockDriftTolerance = 2000 // 2 секунды допуска на рассинхронизацию часов
  
  console.log('[Animation Remote] elapsed:', elapsed, 'duration:', duration)
  
  // Если прошло ОЧЕНЬ много времени (больше duration + tolerance) - пропускаем анимацию
  if (elapsed >= duration + clockDriftTolerance) {
    console.log('[Animation Remote] Animation definitely finished, snapping to final position')
    const lastHex = path[path.length - 1]
    moveToken(lastHex.q, lastHex.r)
    onComplete(finalFacing)
    return null
  }
  
  // Иначе проигрываем анимацию с начала (или с учётом elapsed если он положительный и разумный)
  let effectiveElapsed = Math.max(0, Math.min(elapsed, duration - 100)) // Минимум 100мс анимации
  
  // Если elapsed отрицательный (часы на другом устройстве впереди) - играем полностью
  if (elapsed < 0) {
    effectiveElapsed = 0
  }
  
  // Вычисляем оставшуюся длительность
  const remainingDuration = duration - effectiveElapsed
  
  // Вычисляем с какой точки пути начинать (пропорционально прошедшему времени)
  const progress = effectiveElapsed / duration
  const startPathIndex = Math.floor(progress * (path.length - 1))
  
  // Получаем оставшийся путь
  const remainingPath = path.slice(startPathIndex)
  
  if (remainingPath.length < 2) {
    // Слишком мало осталось - просто ставим в финальную позицию
    const lastHex = path[path.length - 1]
    moveToken(lastHex.q, lastHex.r)
    onComplete(finalFacing)
    return null
  }
  
  console.log(`[Animation Remote] Starting animation from index ${startPathIndex}, remaining duration: ${remainingDuration}ms`)
  
  return tokenAnimationManager.animate({
    characterId,
    path: remainingPath,
    hexToPixel,
    duration: remainingDuration,
    isPointy,
    onHexChange: (hex, index) => {
      moveToken(hex.q, hex.r)
    },
    onComplete: (lastFacing) => {
      const lastHex = path[path.length - 1]
      moveToken(lastHex.q, lastHex.r)
      // Используем lastFacing из анимации
      onComplete(lastFacing)
    }
  })
}
