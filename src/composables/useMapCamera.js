/**
 * useMapCamera - composable для управления камерой карты
 * 
 * Предоставляет:
 * - Реактивное состояние камеры (x, y, zoom)
 * - Pan (перемещение)
 * - Zoom к точке (колёсико мыши)
 * - Pinch-zoom для touch
 * - Центрирование на координаты
 */

import { ref, computed, readonly } from 'vue'

// Ограничения zoom
const MIN_ZOOM = 0.1
const MAX_ZOOM = 5.0

/**
 * @param {Object} options
 * @param {number} options.initialX - начальная позиция X
 * @param {number} options.initialY - начальная позиция Y
 * @param {number} options.initialZoom - начальный zoom
 * @param {number} options.minZoom - минимальный zoom
 * @param {number} options.maxZoom - максимальный zoom
 */
export function useMapCamera(options = {}) {
  const {
    initialX = 0,
    initialY = 0,
    initialZoom = 1,
    minZoom = MIN_ZOOM,
    maxZoom = MAX_ZOOM
  } = options

  // Состояние камеры
  const x = ref(initialX)
  const y = ref(initialY)
  const zoom = ref(initialZoom)

  // Для pinch-zoom
  const pinchState = ref(null)

  /**
   * Clamp zoom в допустимых пределах
   */
  const clampZoom = (z) => Math.max(minZoom, Math.min(maxZoom, z))

  /**
   * Переместить камеру на delta пикселей
   */
  const pan = (dx, dy) => {
    x.value += dx
    y.value += dy
  }

  /**
   * Установить позицию камеры
   */
  const setPosition = (newX, newY) => {
    x.value = newX
    y.value = newY
  }

  /**
   * Установить zoom
   */
  const setZoom = (newZoom) => {
    zoom.value = clampZoom(newZoom)
  }

  /**
   * Zoom к точке (pivot) — сохраняет точку под курсором на месте
   * @param {number} newZoom - новый уровень zoom
   * @param {number} pivotX - X в canvas координатах
   * @param {number} pivotY - Y в canvas координатах
   */
  const zoomTo = (newZoom, pivotX, pivotY) => {
    const oldZoom = zoom.value
    const clampedZoom = clampZoom(newZoom)
    
    if (clampedZoom === oldZoom) return

    // Мировые координаты точки до zoom
    const worldX = (pivotX - x.value) / oldZoom
    const worldY = (pivotY - y.value) / oldZoom

    // Новая позиция камеры чтобы pivot остался на месте
    x.value = pivotX - worldX * clampedZoom
    y.value = pivotY - worldY * clampedZoom
    zoom.value = clampedZoom
  }

  /**
   * Zoom колёсиком мыши
   * @param {number} deltaY - значение deltaY от wheel event (+ = вниз = отдаление)
   * @param {number} pivotX - X курсора
   * @param {number} pivotY - Y курсора
   * @param {number} factor - множитель скорости zoom (default 1.1)
   */
  const zoomByWheel = (deltaY, pivotX, pivotY, factor = 1.1) => {
    // deltaY > 0 = прокрутка вниз = отдаление (уменьшение zoom)
    const multiplier = deltaY < 0 ? factor : 1 / factor
    zoomTo(zoom.value * multiplier, pivotX, pivotY)
  }

  /**
   * Центрировать камеру на мировых координатах
   * @param {number} worldX - X в мировых координатах
   * @param {number} worldY - Y в мировых координатах  
   * @param {number} canvasWidth - ширина canvas
   * @param {number} canvasHeight - высота canvas
   */
  const centerOn = (worldX, worldY, canvasWidth, canvasHeight) => {
    x.value = canvasWidth / 2 - worldX * zoom.value
    y.value = canvasHeight / 2 - worldY * zoom.value
  }

  /**
   * Сбросить камеру в начальное состояние
   */
  const reset = (canvasWidth = 0, canvasHeight = 0) => {
    zoom.value = initialZoom
    if (canvasWidth && canvasHeight) {
      x.value = canvasWidth / 2
      y.value = canvasHeight / 2
    } else {
      x.value = initialX
      y.value = initialY
    }
  }

  // ========== Touch support ==========

  /**
   * Начать pinch-zoom жест
   * @param {Touch[]} touches - массив касаний (минимум 2)
   */
  const startPinch = (touches) => {
    if (touches.length < 2) return

    const t1 = touches[0]
    const t2 = touches[1]
    
    const centerX = (t1.clientX + t2.clientX) / 2
    const centerY = (t1.clientY + t2.clientY) / 2
    const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)

    pinchState.value = {
      centerX,
      centerY,
      distance,
      startZoom: zoom.value,
      startX: x.value,
      startY: y.value
    }
  }

  /**
   * Обновить pinch-zoom
   * @param {Touch[]} touches - текущие касания
   */
  const updatePinch = (touches) => {
    if (!pinchState.value || touches.length < 2) return

    const t1 = touches[0]
    const t2 = touches[1]

    const centerX = (t1.clientX + t2.clientX) / 2
    const centerY = (t1.clientY + t2.clientY) / 2
    const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)

    const scale = distance / pinchState.value.distance
    const newZoom = clampZoom(pinchState.value.startZoom * scale)

    // Zoom к центру pinch
    const worldX = (pinchState.value.centerX - pinchState.value.startX) / pinchState.value.startZoom
    const worldY = (pinchState.value.centerY - pinchState.value.startY) / pinchState.value.startZoom

    x.value = centerX - worldX * newZoom
    y.value = centerY - worldY * newZoom
    zoom.value = newZoom
  }

  /**
   * Завершить pinch-zoom
   */
  const endPinch = () => {
    pinchState.value = null
  }

  /**
   * Проверить, активен ли pinch
   */
  const isPinching = computed(() => pinchState.value !== null)

  // ========== Утилиты преобразования координат ==========

  /**
   * Canvas координаты → Мировые координаты
   */
  const canvasToWorld = (canvasX, canvasY) => ({
    x: (canvasX - x.value) / zoom.value,
    y: (canvasY - y.value) / zoom.value
  })

  /**
   * Мировые координаты → Canvas координаты
   */
  const worldToCanvas = (worldX, worldY) => ({
    x: worldX * zoom.value + x.value,
    y: worldY * zoom.value + y.value
  })

  /**
   * Получить текущее состояние камеры как объект
   */
  const getState = () => ({
    x: x.value,
    y: y.value,
    zoom: zoom.value
  })

  /**
   * Установить состояние камеры из объекта
   */
  const setState = (state) => {
    if (state.x !== undefined) x.value = state.x
    if (state.y !== undefined) y.value = state.y
    if (state.zoom !== undefined) zoom.value = clampZoom(state.zoom)
  }

  /**
   * Computed объект состояния камеры для удобства
   */
  const cameraState = computed(() => ({
    x: x.value,
    y: y.value,
    zoom: zoom.value
  }))

  return {
    // Состояние (readonly для внешнего использования)
    x: readonly(x),
    y: readonly(y),
    zoom: readonly(zoom),
    cameraState,
    
    // Computed
    isPinching,
    
    // Методы
    pan,
    setPosition,
    setZoom,
    zoomTo,
    zoomByWheel,
    centerOn,
    reset,
    
    // Touch
    startPinch,
    updatePinch,
    endPinch,
    
    // Утилиты
    canvasToWorld,
    worldToCanvas,
    getState,
    setState
  }
}
