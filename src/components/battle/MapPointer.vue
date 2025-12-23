<script setup>
/**
 * MapPointer - слой указки и временных меток
 * 
 * Рендерится поверх карты, отображает:
 * - Указку мастера (курсор)
 * - Пинг-метки (пульсирующие маркеры)
 * - Свободные рисунки
 * - Фигуры (стрелки, круги, конусы)
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { usePointerStore, POINTER_TOOLS, POINTER_COLORS } from '@/stores/pointer'
import { useSessionStore } from '@/stores/session'
import { useInteractionStore, INTERACTION_STATE, DRAG_ZONE } from '@/stores/interaction'
import { safeStoreToRefs, safeUseStore } from '@/utils/safeStoreRefs'

const props = defineProps({
  // Размеры canvas
  width: {
    type: Number,
    required: true
  },
  height: {
    type: Number,
    required: true
  },
  // Камера карты для трансформации координат
  camera: {
    type: Object,
    required: true
  },
  // HexGrid для рендеринга гексов (опционально)
  hexGrid: {
    type: Object,
    default: null
  },
  // Позиция выбранного токена (для ring поворота)
  selectedTokenPosition: {
    type: Object,
    default: null
  },
  // Размер токена
  tokenSize: {
    type: Number,
    default: 48
  }
})

const emit = defineEmits(['tool-change'])

const pointerStore = safeUseStore(usePointerStore, 'pointer')
const sessionStore = safeUseStore(useSessionStore, 'session')
const interactionStore = safeUseStore(useInteractionStore, 'interaction')

const { isMaster = ref(false) } = safeStoreToRefs(sessionStore, 'session')
const {
  state: interactionState = ref('idle'),
  dragState = ref(null),
  selectedFacing: interactionSelectedFacing = ref(null),
  defencePreviewFacing = ref(null)
} = safeStoreToRefs(interactionStore, 'interaction')
const { 
  activeTool = ref('none'), 
  activeColor = ref('#ffffff'), 
  lineWidth = ref(3),
  masterPointer = ref(null), 
  pings = ref([]), 
  drawings = ref([]), 
  shapes = ref([]),
  currentDrawing = ref(null),
  currentShape = ref(null),
  measurement = ref(null),
  rangeDisplay = ref(null),
  movementRange = ref(null)
} = safeStoreToRefs(pointerStore, 'pointer')

const canvas = ref(null)
let ctx = null
let animationFrame = null

// ========== РЕНДЕРИНГ ==========

const render = () => {
  if (!canvas.value || !ctx) return
  
  ctx.clearRect(0, 0, props.width, props.height)
  
  ctx.save()
  ctx.translate(props.camera.x, props.camera.y)
  ctx.scale(props.camera.zoom, props.camera.zoom)
  
  // Рисуем в порядке: зоны -> путь -> измерение -> рисунки -> фигуры -> пинги -> указка
  renderMovementRange() // Зона движения персонажа (под всем остальным)
  // renderRotateRing удалён - больше не используется
  renderHoveredPath()   // Путь при наведении
  renderRange()
  renderMeasurement()
  renderDrawings()
  renderShapes()
  renderPings()
  renderPointer()
  
  ctx.restore()
  
  // Запрашиваем следующий кадр для анимации пингов
  animationFrame = requestAnimationFrame(render)
}

const renderPointer = () => {
  if (!masterPointer.value) return
  
  const { x, y } = masterPointer.value
  const size = 12 / props.camera.zoom
  
  // Указка - треугольник
  ctx.save()
  ctx.translate(x, y)
  
  // Тень
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetX = 2
  ctx.shadowOffsetY = 2
  
  // Заливка
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(size * 0.8, size * 0.6)
  ctx.lineTo(size * 0.3, size * 0.7)
  ctx.lineTo(size * 0.4, size * 1.2)
  ctx.lineTo(0, size * 0.85)
  ctx.lineTo(-size * 0.1, size * 1.2)
  ctx.lineTo(0, size * 0.7)
  ctx.closePath()
  
  ctx.fillStyle = '#facc15'
  ctx.fill()
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 1.5 / props.camera.zoom
  ctx.stroke()
  
  ctx.restore()
}

const renderPings = () => {
  const now = Date.now()
  
  pings.value.forEach(ping => {
    const age = now - ping.time
    const progress = age / ping.lifetime
    
    if (progress >= 1) return
    
    const { x, y, color } = ping
    
    // Пульсирующий круг
    const baseRadius = 20 / props.camera.zoom
    const maxRadius = 40 / props.camera.zoom
    
    // Несколько волн
    for (let wave = 0; wave < 3; wave++) {
      const waveProgress = (progress + wave * 0.3) % 1
      const radius = baseRadius + (maxRadius - baseRadius) * waveProgress
      const alpha = (1 - waveProgress) * 0.6
      
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.strokeStyle = color
      ctx.globalAlpha = alpha
      ctx.lineWidth = 3 / props.camera.zoom
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    
    // Центральная точка
    ctx.beginPath()
    ctx.arc(x, y, 6 / props.camera.zoom, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 1.5 / props.camera.zoom
    ctx.stroke()
  })
}

const renderDrawings = () => {
  // Завершённые рисунки
  drawings.value.forEach(drawing => {
    renderLine(drawing.points, drawing.color, drawing.width)
  })
  
  // Текущий рисунок
  if (currentDrawing.value && currentDrawing.value.points.length > 1) {
    renderLine(
      currentDrawing.value.points, 
      currentDrawing.value.color, 
      currentDrawing.value.width
    )
  }
}

const renderLine = (points, color, width) => {
  if (points.length < 2) return
  
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  
  // Сглаженная линия через quadratic curves
  for (let i = 1; i < points.length - 1; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2
    const yc = (points[i].y + points[i + 1].y) / 2
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
  }
  
  // Последняя точка
  const last = points[points.length - 1]
  ctx.lineTo(last.x, last.y)
  
  ctx.strokeStyle = color
  ctx.lineWidth = width / props.camera.zoom
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
}

const renderShapes = () => {
  // Завершённые фигуры
  shapes.value.forEach(shape => {
    renderShape(shape)
  })
  
  // Текущая фигура
  if (currentShape.value) {
    renderShape(currentShape.value)
  }
}

const renderShape = (shape) => {
  const { type, start, end, color } = shape
  
  ctx.strokeStyle = color
  ctx.fillStyle = color + '33' // 20% alpha
  ctx.lineWidth = 3 / props.camera.zoom
  
  switch (type) {
    case POINTER_TOOLS.ARROW:
      renderArrow(start, end, color)
      break
    case POINTER_TOOLS.CIRCLE:
      renderCircle(start, end, color)
      break
    case POINTER_TOOLS.CONE:
      renderCone(start, end, color)
      break
    case POINTER_TOOLS.LINE:
      renderSimpleLine(start, end, color)
      break
  }
}

const renderArrow = (start, end, color) => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const angle = Math.atan2(dy, dx)
  const length = Math.sqrt(dx * dx + dy * dy)
  
  const headLength = Math.min(20 / props.camera.zoom, length * 0.3)
  const headAngle = Math.PI / 6
  
  // Линия
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.strokeStyle = color
  ctx.lineWidth = 3 / props.camera.zoom
  ctx.stroke()
  
  // Наконечник
  ctx.beginPath()
  ctx.moveTo(end.x, end.y)
  ctx.lineTo(
    end.x - headLength * Math.cos(angle - headAngle),
    end.y - headLength * Math.sin(angle - headAngle)
  )
  ctx.lineTo(
    end.x - headLength * Math.cos(angle + headAngle),
    end.y - headLength * Math.sin(angle + headAngle)
  )
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

const renderCircle = (start, end, color) => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const radius = Math.sqrt(dx * dx + dy * dy)
  
  ctx.beginPath()
  ctx.arc(start.x, start.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = color + '33'
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 3 / props.camera.zoom
  ctx.stroke()
}

const renderCone = (start, end, color) => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const angle = Math.atan2(dy, dx)
  const length = Math.sqrt(dx * dx + dy * dy)
  
  const coneAngle = Math.PI / 4 // 45 градусов
  
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(
    start.x + length * Math.cos(angle - coneAngle / 2),
    start.y + length * Math.sin(angle - coneAngle / 2)
  )
  ctx.arc(start.x, start.y, length, angle - coneAngle / 2, angle + coneAngle / 2)
  ctx.closePath()
  
  ctx.fillStyle = color + '33'
  ctx.fill()
  ctx.strokeStyle = color
  ctx.lineWidth = 3 / props.camera.zoom
  ctx.stroke()
}

const renderSimpleLine = (start, end, color) => {
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.strokeStyle = color
  ctx.lineWidth = 3 / props.camera.zoom
  ctx.lineCap = 'round'
  ctx.stroke()
}

// ========== ИЗМЕРЕНИЕ РАССТОЯНИЯ ==========

const renderMeasurement = () => {
  if (!measurement.value) return
  
  const { start, end, distance, path } = measurement.value
  
  // Рисуем путь (подсвеченные гексы)
  if (path && path.length > 0 && props.hexGrid) {
    ctx.fillStyle = 'rgba(59, 130, 246, 0.2)' // Синяя заливка
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.6)'
    ctx.lineWidth = 2 / props.camera.zoom
    
    path.forEach(hex => {
      const center = props.hexGrid.hexToPixel(hex.q, hex.r)
      const corners = props.hexGrid.getHexCorners(center.x, center.y)
      
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(corners[i].x, corners[i].y)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    })
  }
  
  // Рисуем линию измерения
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 3 / props.camera.zoom
  ctx.setLineDash([10 / props.camera.zoom, 5 / props.camera.zoom])
  ctx.stroke()
  ctx.setLineDash([])
  
  // Начальная точка
  ctx.beginPath()
  ctx.arc(start.x, start.y, 6 / props.camera.zoom, 0, Math.PI * 2)
  ctx.fillStyle = '#3b82f6'
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2 / props.camera.zoom
  ctx.stroke()
  
  // Конечная точка
  ctx.beginPath()
  ctx.arc(end.x, end.y, 6 / props.camera.zoom, 0, Math.PI * 2)
  ctx.fillStyle = '#3b82f6'
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2 / props.camera.zoom
  ctx.stroke()
  
  // Текст с расстоянием (в середине линии)
  if (distance > 0) {
    const midX = (start.x + end.x) / 2
    const midY = (start.y + end.y) / 2
    
    const fontSize = 14 / props.camera.zoom
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    
    // Фон для текста
    const text = `${distance} гекс${distance === 1 ? '' : distance < 5 ? 'а' : 'ов'}`
    const metrics = ctx.measureText(text)
    const padding = 4 / props.camera.zoom
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'
    ctx.fillRect(
      midX - metrics.width / 2 - padding,
      midY - fontSize / 2 - padding,
      metrics.width + padding * 2,
      fontSize + padding * 2
    )
    
    ctx.fillStyle = '#fff'
    ctx.fillText(text, midX, midY)
  }
}

// ========== ЗОНА ДОСЯГАЕМОСТИ ==========

const renderRange = () => {
  if (!rangeDisplay.value || !props.hexGrid) return
  
  const { center, radius, hexes } = rangeDisplay.value
  
  // Найдём максимальную стоимость для градиента
  const maxCost = hexes.reduce((max, h) => Math.max(max, h.cost || 0), 1)
  
  // Рисуем все гексы в зоне
  hexes.forEach(hex => {
    const pixelCenter = props.hexGrid.hexToPixel(hex.q, hex.r)
    const corners = props.hexGrid.getHexCorners(pixelCenter.x, pixelCenter.y)
    
    // Определяем цвет в зависимости от стоимости перемещения
    const cost = hex.cost ?? 0
    const intensity = 1 - (cost / (maxCost + 1))
    
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(corners[i].x, corners[i].y)
    }
    ctx.closePath()
    
    ctx.fillStyle = `rgba(34, 197, 94, ${0.1 + intensity * 0.25})`
    ctx.fill()
    ctx.strokeStyle = `rgba(34, 197, 94, ${0.3 + intensity * 0.4})`
    ctx.lineWidth = 1 / props.camera.zoom
    ctx.stroke()
    
    // Показываем стоимость на гексе (если не центр)
    if (cost > 0 && props.camera.zoom >= 0.5) {
      ctx.font = `bold ${12 / props.camera.zoom}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.lineWidth = 2 / props.camera.zoom
      
      const costText = cost % 1 === 0 ? cost.toString() : cost.toFixed(1)
      ctx.strokeText(costText, pixelCenter.x, pixelCenter.y)
      ctx.fillText(costText, pixelCenter.x, pixelCenter.y)
    }
  })
  
  // Центр зоны
  const centerPixel = props.hexGrid.hexToPixel(center.q, center.r)
  ctx.beginPath()
  ctx.arc(centerPixel.x, centerPixel.y, 8 / props.camera.zoom, 0, Math.PI * 2)
  ctx.fillStyle = '#22c55e'
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2 / props.camera.zoom
  ctx.stroke()
}

// ========== ЗОНА ДВИЖЕНИЯ ПЕРСОНАЖА ==========

/**
 * Находит внешние рёбра многоугольника из гексов
 * Возвращает список рёбер для рисования границы
 * 
 * Геометрия для flat-top (startAngle=0):
 * - Углы: 0(право), 1(верх-право), 2(верх-лево), 3(лево), 4(низ-лево), 5(низ-право)
 * - Соседи: 0(E), 1(NE), 2(NW), 3(W), 4(SW), 5(SE)
 * - Ребро между углами (i+5)%6 и i соответствует соседу i
 */
const findOuterEdges = (hexes) => {
  if (!props.hexGrid || hexes.length === 0) return []
  
  // Создаём Set для быстрого поиска
  const hexSet = new Set(hexes.map(h => `${h.q},${h.r}`))
  
  // Используем HexGrid для получения соседей
  const grid = props.hexGrid
  
  // Смещение индексов углов зависит от ориентации:
  // - flat-top (startAngle = 0°): углы сдвинуты относительно направлений соседей, сдвиг = 1
  // - pointy-top (startAngle = 30°): углы совпадают с направлениями, сдвиг = 0
  const isPointy = grid.orientation === 'pointy'
  const cornerOffset = isPointy ? 0 : 1
  
  const edges = [] // [{start: {x,y}, end: {x,y}}]
  
  hexes.forEach(hex => {
    const center = grid.hexToPixel(hex.q, hex.r)
    const corners = grid.getHexCorners(center.x, center.y)
    
    // Получаем соседей через HexGrid
    const neighbors = grid.getNeighbors(hex.q, hex.r)
    
    // Проверяем каждого соседа
    for (let i = 0; i < 6; i++) {
      const neighbor = neighbors[i]
      const neighborKey = `${neighbor.q},${neighbor.r}`
      
      // Если соседа нет в нашем наборе - рисуем ребро, разделяющее с ним
      if (!hexSet.has(neighborKey)) {
        // Маппинг направления соседа → индексы углов ребра
        // HEX_DIRECTIONS: 0=East, 1=NE, 2=NW, 3=West, 4=SW, 5=SE
        // Для flat-top: ребро East - между углами 5 и 0
        // Для pointy-top: ребро East - между углами 0 и 1 (со сдвигом)
        const cornerStart = (6 - i + cornerOffset) % 6
        const cornerEnd = (5 - i + cornerOffset + 6) % 6
        
        edges.push({
          start: { x: corners[cornerStart].x, y: corners[cornerStart].y },
          end: { x: corners[cornerEnd].x, y: corners[cornerEnd].y }
        })
      }
    }
  })
  
  return edges
}

const renderMovementRange = () => {
  if (!movementRange.value || !props.hexGrid) {
    return
  }
  
  const { hexes, maxCost } = movementRange.value
  if (!hexes || hexes.length === 0) {
    return
  }
  
  // Сначала рисуем лёгкую заливку всех гексов
  hexes.forEach(hex => {
    const center = props.hexGrid.hexToPixel(hex.q, hex.r)
    const corners = props.hexGrid.getHexCorners(center.x, center.y)
    
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(corners[i].x, corners[i].y)
    }
    ctx.closePath()
    
    // Цвет зависит от оставшейся стоимости
    const cost = hex.cost ?? 0
    const remaining = maxCost - cost
    
    if (remaining >= maxCost * 0.6) {
      // Много ОД - голубой/бирюзовый
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'
    } else if (remaining >= maxCost * 0.3) {
      // Средне - голубой чуть темнее
      ctx.fillStyle = 'rgba(14, 165, 233, 0.15)'
    } else {
      // Мало - ещё темнее
      ctx.fillStyle = 'rgba(2, 132, 199, 0.15)'
    }
    ctx.fill()
  })
  
  // Находим внешние рёбра и рисуем границу
  const edges = findOuterEdges(hexes)
  
  // Рисуем все внешние рёбра как границу
  if (edges.length > 0) {
    // Сначала тёмная тень для контраста на светлом фоне
    ctx.beginPath()
    edges.forEach(edge => {
      ctx.moveTo(edge.start.x, edge.start.y)
      ctx.lineTo(edge.end.x, edge.end.y)
    })
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.lineWidth = 6 / props.camera.zoom
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    
    // Основная граница - бирюзовый/голубой, полупрозрачный
    ctx.beginPath()
    edges.forEach(edge => {
      ctx.moveTo(edge.start.x, edge.start.y)
      ctx.lineTo(edge.end.x, edge.end.y)
    })
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)'
    ctx.lineWidth = 4 / props.camera.zoom
    ctx.stroke()
    
    // Внутренняя светлая линия для глубины
    ctx.beginPath()
    edges.forEach(edge => {
      ctx.moveTo(edge.start.x, edge.start.y)
      ctx.lineTo(edge.end.x, edge.end.y)
    })
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.lineWidth = 1 / props.camera.zoom
    ctx.stroke()
  }
}

// renderRotateRing удалён - rotation ring больше не используется
// Вместо него используется drag на токене для поворота, preview отображается на самом токене

/**
 * Рисуем путь при выборе гекса с сегментацией по ресурсам
 */
const renderHoveredPath = () => {
  const pathData = pointerStore.hoveredPath
  if (!pathData || !props.hexGrid) return
  
  const { segments, targetHex } = pathData
  if (!segments || segments.length === 0) return
  
  // Цвета для разных типов сегментов
  const COLORS = {
    movement: {
      line: 'rgba(56, 189, 248, 0.9)',      // sky-400
      shadow: 'rgba(0, 0, 0, 0.5)',
      point: 'rgba(56, 189, 248, 1)'
    },
    surge_1: {
      line: 'rgba(250, 204, 21, 0.9)',      // yellow-400
      shadow: 'rgba(0, 0, 0, 0.5)',
      point: 'rgba(250, 204, 21, 1)'
    },
    surge_2: {
      line: 'rgba(251, 146, 60, 0.9)',      // orange-400
      shadow: 'rgba(0, 0, 0, 0.5)',
      point: 'rgba(251, 146, 60, 1)'
    },
    surge_3: {
      line: 'rgba(248, 113, 113, 0.85)',    // red-400 light
      shadow: 'rgba(0, 0, 0, 0.5)',
      point: 'rgba(248, 113, 113, 1)'
    },
    surge_4: {
      line: 'rgba(239, 68, 68, 0.8)',       // red-500
      shadow: 'rgba(0, 0, 0, 0.4)',
      point: 'rgba(239, 68, 68, 1)'
    },
    unreachable: {
      line: 'rgba(239, 68, 68, 0.5)',       // red-500 transparent
      shadow: 'rgba(0, 0, 0, 0.3)',
      point: 'rgba(239, 68, 68, 0.8)'
    }
  }
  
  const lineWidth = 4 / props.camera.zoom
  const shadowWidth = 8 / props.camera.zoom
  
  // Рисуем каждый сегмент
  segments.forEach((segment, segmentIndex) => {
    const { type, path, hasEndpoint, isFinal } = segment
    if (!path || path.length < 2) return
    
    const colors = COLORS[type] || COLORS.movement
    const points = path.map(hex => props.hexGrid.hexToPixel(hex.q, hex.r))
    
    // Рисуем тень сегмента
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.strokeStyle = colors.shadow
    ctx.lineWidth = shadowWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    
    // Основная линия сегмента
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y)
    }
    ctx.strokeStyle = colors.line
    ctx.lineWidth = lineWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    
    // Точка на границе ресурса (не на последнем сегменте, если есть hasEndpoint)
    if (hasEndpoint && !isFinal && points.length > 1) {
      const lastPoint = points[points.length - 1]
      const radius = 6 / props.camera.zoom
      
      // Тень
      ctx.beginPath()
      ctx.arc(lastPoint.x, lastPoint.y, radius + 2 / props.camera.zoom, 0, Math.PI * 2)
      ctx.fillStyle = colors.shadow
      ctx.fill()
      
      // Точка
      ctx.beginPath()
      ctx.arc(lastPoint.x, lastPoint.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = colors.point
      ctx.fill()
      
      // Светлый центр
      ctx.beginPath()
      ctx.arc(lastPoint.x, lastPoint.y, 2 / props.camera.zoom, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.fill()
    }
    
    // Конечная точка - просто небольшой маркер (ghost token рисуется в BattleMap)
    if (isFinal && points.length > 1) {
      const lastPoint = points[points.length - 1]
      const radius = 4 / props.camera.zoom
      
      // Небольшой светлый круг как маркер конца пути
      ctx.beginPath()
      ctx.arc(lastPoint.x, lastPoint.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = colors.point
      ctx.fill()
    }
  })
}

// ========== LIFECYCLE ==========

onMounted(() => {
  if (canvas.value) {
    ctx = canvas.value.getContext('2d')
    render()
  }
})

onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
})

// Перезапуск рендера при изменении размеров
watch([() => props.width, () => props.height], () => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame)
  }
  render()
})

// Перерисовка при изменении состояния interaction
watch([interactionState, dragState, interactionSelectedFacing], () => {
  // Триггерим перерисовку
}, { deep: true })

// ========== ИНСТРУМЕНТЫ (экспорт для родителя) ==========

const tools = POINTER_TOOLS
const colors = POINTER_COLORS

const setTool = (tool) => {
  pointerStore.setTool(tool)
  emit('tool-change', tool)
}

const setColor = (color) => {
  pointerStore.setColor(color)
}

const clearAll = () => {
  pointerStore.clearAll()
}

defineExpose({
  tools,
  colors,
  setTool,
  setColor,
  clearAll
})
</script>

<template>
  <canvas
    ref="canvas"
    class="absolute top-0 left-0 pointer-events-none"
    :width="width"
    :height="height"
  />
</template>
