/**
 * useBrushTool - composable для рисования кистью на гекс-карте
 * 
 * Предоставляет:
 * - Состояние кисти (размер, режим, выбранный террейн)
 * - Рисование штрихами (startStroke, continueStroke, endStroke)
 * - Превью кисти при hover
 * - Историю для undo/redo
 */

import { ref, computed, shallowRef } from 'vue'

// Режимы кисти
export const BRUSH_MODES = {
  PAINT: 'paint',     // Рисование террейном
  ERASE: 'erase',     // Стирание (установка в null)
  EYEDROPPER: 'eyedropper' // Пипетка (выбор террейна с карты)
}

// Формы кисти
export const BRUSH_SHAPES = {
  CIRCLE: 'circle',   // Круглая (радиус в гексах)
  SQUARE: 'square',   // Квадратная
  LINE: 'line'        // Линия (для дорог и рек)
}

/**
 * Получить гексы в круге радиуса r от центра (q, r)
 */
function getHexesInRadius(centerQ, centerR, radius) {
  const hexes = []
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      hexes.push({ q: centerQ + dq, r: centerR + dr })
    }
  }
  return hexes
}

/**
 * Получить гексы в квадрате размера size от центра
 */
function getHexesInSquare(centerQ, centerR, size) {
  const hexes = []
  const half = Math.floor(size / 2)
  for (let dq = -half; dq <= half; dq++) {
    for (let dr = -half; dr <= half; dr++) {
      hexes.push({ q: centerQ + dq, r: centerR + dr })
    }
  }
  return hexes
}

/**
 * @param {Object} options
 * @param {Function} options.onPaint - callback при рисовании (hexes, terrain)
 * @param {Function} options.onErase - callback при стирании (hexes)
 * @param {Function} options.onPick - callback при пипетке (hex)
 */
export function useBrushTool(options = {}) {
  const {
    onPaint = () => {},
    onErase = () => {},
    onPick = () => {}
  } = options

  // Состояние кисти
  const mode = ref(BRUSH_MODES.PAINT)
  const shape = ref(BRUSH_SHAPES.CIRCLE)
  const size = ref(1) // Радиус для circle, размер для square
  const terrain = shallowRef(null) // Выбранный террейн для рисования

  // Состояние рисования
  const isDrawing = ref(false)
  const currentStroke = ref([]) // Гексы текущего штриха
  const strokeHistory = ref([]) // История штрихов для undo

  // Последний обработанный гекс (для избежания дублей)
  const lastHex = ref(null)

  // Превью гексов под кистью
  const previewHexes = ref([])

  /**
   * Получить гексы, покрываемые кистью от центра
   */
  const getBrushHexes = (centerQ, centerR) => {
    if (size.value <= 0) {
      return [{ q: centerQ, r: centerR }]
    }

    switch (shape.value) {
      case BRUSH_SHAPES.CIRCLE:
        return getHexesInRadius(centerQ, centerR, size.value - 1)
      case BRUSH_SHAPES.SQUARE:
        return getHexesInSquare(centerQ, centerR, size.value)
      default:
        return [{ q: centerQ, r: centerR }]
    }
  }

  /**
   * Обновить превью кисти
   */
  const updatePreview = (q, r) => {
    if (mode.value === BRUSH_MODES.EYEDROPPER) {
      previewHexes.value = [{ q, r }]
    } else {
      previewHexes.value = getBrushHexes(q, r)
    }
  }

  /**
   * Очистить превью
   */
  const clearPreview = () => {
    previewHexes.value = []
  }

  /**
   * Начать штрих рисования
   */
  const startStroke = (q, r) => {
    if (mode.value === BRUSH_MODES.EYEDROPPER) {
      // Пипетка — просто выбираем террейн
      onPick({ q, r })
      return
    }

    isDrawing.value = true
    currentStroke.value = []
    lastHex.value = null

    applyBrush(q, r)
  }

  /**
   * Продолжить штрих (при движении мыши с зажатой кнопкой)
   */
  const continueStroke = (q, r) => {
    if (!isDrawing.value) return

    // Пропускаем если это тот же гекс
    if (lastHex.value && lastHex.value.q === q && lastHex.value.r === r) {
      return
    }

    applyBrush(q, r)
  }

  /**
   * Завершить штрих
   */
  const endStroke = () => {
    if (!isDrawing.value) return

    isDrawing.value = false

    // Сохраняем штрих в историю для undo
    if (currentStroke.value.length > 0) {
      strokeHistory.value.push({
        hexes: [...currentStroke.value],
        mode: mode.value,
        terrain: terrain.value
      })

      // Ограничиваем размер истории
      if (strokeHistory.value.length > 50) {
        strokeHistory.value.shift()
      }
    }

    currentStroke.value = []
    lastHex.value = null
  }

  /**
   * Применить кисть к точке
   */
  const applyBrush = (q, r) => {
    const hexes = getBrushHexes(q, r)
    lastHex.value = { q, r }

    // Добавляем в текущий штрих
    for (const hex of hexes) {
      const key = `${hex.q},${hex.r}`
      if (!currentStroke.value.find(h => `${h.q},${h.r}` === key)) {
        currentStroke.value.push(hex)
      }
    }

    // Вызываем callback
    if (mode.value === BRUSH_MODES.PAINT && terrain.value) {
      onPaint(hexes, terrain.value)
    } else if (mode.value === BRUSH_MODES.ERASE) {
      onErase(hexes)
    }
  }

  /**
   * Установить террейн для рисования
   */
  const setTerrain = (newTerrain) => {
    terrain.value = newTerrain
    // Автоматически переключаемся в режим рисования
    if (newTerrain && mode.value === BRUSH_MODES.EYEDROPPER) {
      mode.value = BRUSH_MODES.PAINT
    }
  }

  /**
   * Установить режим кисти
   */
  const setMode = (newMode) => {
    if (Object.values(BRUSH_MODES).includes(newMode)) {
      mode.value = newMode
    }
  }

  /**
   * Установить размер кисти
   */
  const setSize = (newSize) => {
    size.value = Math.max(1, Math.min(10, newSize))
  }

  /**
   * Установить форму кисти
   */
  const setShape = (newShape) => {
    if (Object.values(BRUSH_SHAPES).includes(newShape)) {
      shape.value = newShape
    }
  }

  /**
   * Очистить историю
   */
  const clearHistory = () => {
    strokeHistory.value = []
  }

  /**
   * Проверка: есть ли выбранный террейн
   */
  const hasTerrain = computed(() => terrain.value !== null)

  /**
   * Проверка: можно ли рисовать
   */
  const canPaint = computed(() => {
    return mode.value === BRUSH_MODES.PAINT ? hasTerrain.value : true
  })

  return {
    // Состояние
    mode,
    shape,
    size,
    terrain,
    isDrawing,
    previewHexes,
    
    // Computed
    hasTerrain,
    canPaint,
    
    // Константы
    BRUSH_MODES,
    BRUSH_SHAPES,
    
    // Методы рисования
    startStroke,
    continueStroke,
    endStroke,
    
    // Превью
    updatePreview,
    clearPreview,
    
    // Настройки
    setTerrain,
    setMode,
    setSize,
    setShape,
    
    // История
    strokeHistory,
    clearHistory
  }
}
