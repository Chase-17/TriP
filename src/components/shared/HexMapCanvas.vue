<script setup>
/**
 * HexMapCanvas - унифицированный компонент для отображения гекс-карты
 * 
 * Использование:
 * - AssetManager: редактирование террейна (edit mode)
 * - BattleMap: отображение карты (readonly + live updates)
 * - Preview: превью в настройках
 */

import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useMapCamera } from '@/composables/useMapCamera'
import { useTerrainRenderer, RENDER_MODES } from '@/composables/useTerrainRenderer'
import { HexGrid } from '@/utils/hex/grid'
import { getHexVertices } from '@/utils/rendering/hexClusterRenderer'

const props = defineProps({
  // Данные карты
  hexes: {
    type: [Map, Array, Object],
    default: () => new Map()
  },
  
  // Размер гекса
  hexSize: {
    type: Number,
    default: 30
  },
  
  // Режим отображения
  renderMode: {
    type: String,
    default: RENDER_MODES.PRIMITIVE,
    validator: (v) => Object.values(RENDER_MODES).includes(v)
  },
  
  // Показывать сетку
  showGrid: {
    type: Boolean,
    default: true
  },
  
  // Стиль сетки
  gridColor: {
    type: String,
    default: 'rgba(255, 255, 255, 0.2)'
  },
  
  // Разрешить pan/zoom
  interactive: {
    type: Boolean,
    default: true
  },
  
  // Начальная позиция камеры
  initialCamera: {
    type: Object,
    default: () => ({ x: 0, y: 0, zoom: 1 })
  },
  
  // Ограничения камеры
  cameraOptions: {
    type: Object,
    default: () => ({})
  },
  
  // Настройки освещения
  lightingSettings: {
    type: Object,
    default: null
  },
  
  // Функция получения террейна по ID
  getTerrainById: {
    type: Function,
    default: null
  },
  
  // Функция получения правила перехода
  getTransitionRule: {
    type: Function,
    default: null
  },
  
  // Размеры (если не указаны — fill parent)
  width: {
    type: Number,
    default: null
  },
  
  height: {
    type: Number,
    default: null
  },
  
  // Режим редактирования (включает рисование кистью)
  editable: {
    type: Boolean,
    default: false
  },
  
  // Режим расширения карты (рисовать можно везде, не только по существующим гексам)
  expandable: {
    type: Boolean,
    default: false
  },
  
  // Гексы для подсветки превью кисти
  brushPreviewHexes: {
    type: Array,
    default: () => []
  },
  
  // Цвет превью кисти
  brushPreviewColor: {
    type: String,
    default: 'rgba(255, 255, 255, 0.3)'
  },
  
  // Цвет пустых гексов (для expandable режима)
  emptyHexColor: {
    type: String,
    default: 'rgba(255, 255, 255, 0.05)'
  },
  
  // Радиус отображаемой области пустых гексов (в гексах от центра 0,0)
  expandRadius: {
    type: Number,
    default: 30
  },
  
  // Версия конфигурации террейнов (слои, переходы)
  // Изменяется при любых изменениях для триггера перерисовки в live-режиме
  terrainVersion: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits([
  'ready',
  'camera-change',
  'hex-click',
  'hex-hover',
  'hex-drag',
  'context-menu',
  'paint-start',
  'paint-move',
  'paint-end'
])

// Refs на canvas элементы
const containerRef = ref(null)
const terrainCanvasRef = ref(null)
const gridCanvasRef = ref(null)
const interactionCanvasRef = ref(null)

// Размеры канваса
const canvasWidth = ref(800)
const canvasHeight = ref(600)

// HexGrid
const hexGrid = computed(() => new HexGrid({ hexSize: props.hexSize }))

// Camera composable
const camera = useMapCamera({
  initialX: props.initialCamera.x,
  initialY: props.initialCamera.y,
  initialZoom: props.initialCamera.zoom,
  ...props.cameraOptions
})

// Terrain renderer composable
const terrainRenderer = useTerrainRenderer({
  getTerrainById: props.getTerrainById || (() => null),
  getTransitionRule: props.getTransitionRule || (() => null)
})

// Следим за режимом рендеринга
watch(() => props.renderMode, (newMode) => {
  terrainRenderer.setMode(newMode)
  requestRedraw()
})

// Следим за изменениями камеры
watch(camera.cameraState, (newCamera) => {
  emit('camera-change', newCamera)
  requestRedraw()
}, { deep: true })

// Следим за изменениями гексов
watch(() => props.hexes, () => {
  terrainRenderer.invalidateCache()
  requestRedraw()
}, { deep: true })

// Следим за изменениями слоёв/переходов (реактивность для live-режима)
// Не очищаем patternCache — он сам определит через layersHash нужно ли пересоздавать
// Очищаем только для редактируемого террейна ('editing')
watch(() => props.terrainVersion, () => {
  terrainRenderer.invalidatePatternCache('editing')
  terrainRenderer.invalidateCache()
  requestRedraw()
})

// Следим за превью кисти
watch(() => props.brushPreviewHexes, () => {
  drawBrushPreview()
}, { deep: true })

// RAF handle
let rafId = null
let needsRedraw = false

/**
 * Запросить перерисовку
 */
const requestRedraw = () => {
  if (needsRedraw) return
  needsRedraw = true
  
  if (rafId) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => {
    redraw()
    needsRedraw = false
    rafId = null
  })
}

/**
 * Полная перерисовка
 */
const redraw = () => {
  drawTerrain()
  if (props.showGrid) {
    drawGrid()
  } else {
    clearGrid()
  }
  drawBrushPreview()
}

/**
 * Получить гексы в видимой области + пустые гексы для expandable режима
 */
const getVisibleHexes = () => {
  const cam = camera.cameraState.value
  const grid = hexGrid.value
  
  // Границы viewport в мировых координатах
  const topLeft = camera.canvasToWorld(0, 0)
  const bottomRight = camera.canvasToWorld(canvasWidth.value, canvasHeight.value)
  
  // Конвертируем в hex координаты с запасом
  const tlHex = grid.pixelToHex(topLeft.x - grid.hexSize * 2, topLeft.y - grid.hexSize * 2)
  const brHex = grid.pixelToHex(bottomRight.x + grid.hexSize * 2, bottomRight.y + grid.hexSize * 2)
  
  return { tlHex, brHex }
}

/**
 * Отрисовать террейн
 */
const drawTerrain = () => {
  const canvas = terrainCanvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // В expandable режиме сначала рисуем пустые гексы
  if (props.expandable) {
    drawEmptyHexes(ctx)
  }

  terrainRenderer.render(
    ctx,
    props.hexes,
    hexGrid.value,
    camera.cameraState.value,
    { lightingSettings: props.lightingSettings }
  )
}

/**
 * Отрисовать пустые гексы в видимой области (ограничено expandRadius от центра)
 */
const drawEmptyHexes = (ctx) => {
  const cam = camera.cameraState.value
  const grid = hexGrid.value
  const { tlHex, brHex } = getVisibleHexes()
  const maxRadius = props.expandRadius
  
  ctx.save()
  ctx.translate(cam.x, cam.y)
  ctx.scale(cam.zoom, cam.zoom)
  
  ctx.fillStyle = props.emptyHexColor
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
  ctx.lineWidth = 1 / cam.zoom
  
  // Итерируем по видимой области, но ограничиваем радиусом от центра
  const minQ = Math.max(tlHex.q - 2, -maxRadius)
  const maxQ = Math.min(brHex.q + 2, maxRadius)
  const minR = Math.max(tlHex.r - 2, -maxRadius)
  const maxR = Math.min(brHex.r + 2, maxRadius)
  
  for (let q = minQ; q <= maxQ; q++) {
    for (let r = minR; r <= maxR; r++) {
      // Ограничение по hex distance от центра
      const dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2
      if (dist > maxRadius) continue
      
      const key = `${q},${r}`
      
      // Пропускаем если гекс уже существует
      if (props.hexes.has && props.hexes.has(key)) continue
      if (props.hexes[key]) continue
      
      const center = grid.hexToPixel(q, r)
      const vertices = getHexVertices(center.x, center.y, grid.hexSize)
      
      ctx.beginPath()
      ctx.moveTo(vertices[0].x, vertices[0].y)
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y)
      }
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
    }
  }
  
  ctx.restore()
}

/**
 * Отрисовать сетку
 */
const drawGrid = () => {
  const canvas = gridCanvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  terrainRenderer.renderGrid(
    ctx,
    props.hexes,
    hexGrid.value,
    camera.cameraState.value,
    { strokeColor: props.gridColor }
  )
}

/**
 * Очистить сетку
 */
const clearGrid = () => {
  const canvas = gridCanvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}

/**
 * Отрисовать превью кисти на interaction слое
 */
const drawBrushPreview = () => {
  const canvas = interactionCanvasRef.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  if (!props.brushPreviewHexes || props.brushPreviewHexes.length === 0) return

  ctx.save()
  ctx.translate(camera.cameraState.value.x, camera.cameraState.value.y)
  ctx.scale(camera.cameraState.value.zoom, camera.cameraState.value.zoom)

  const radius = hexGrid.value.hexSize
  ctx.fillStyle = props.brushPreviewColor

  for (const hex of props.brushPreviewHexes) {
    const center = hexGrid.value.hexToPixel(hex.q, hex.r)
    const vertices = getHexVertices(center.x, center.y, radius)

    ctx.beginPath()
    ctx.moveTo(vertices[0].x, vertices[0].y)
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(vertices[i].x, vertices[i].y)
    }
    ctx.closePath()
    ctx.fill()
  }

  ctx.restore()
}

/**
 * Обработчики событий мыши/тача
 */
let isPanning = false
let isPainting = false
let lastPointer = { x: 0, y: 0 }

const onPointerDown = (e) => {
  if (!props.interactive) return
  
  // Режим редактирования: ЛКМ = рисование, СКМ/ПКМ = пан
  if (props.editable && e.button === 0) {
    // Рисование
    isPainting = true
    const hex = getHexAtPointer(e)
    if (hex) {
      emit('paint-start', hex, e)
    }
    e.target.setPointerCapture?.(e.pointerId)
  } else if (e.button === 0 || e.button === 1 || (props.editable && e.button === 2)) {
    // Пан (ЛКМ в обычном режиме, СКМ всегда, ПКМ в editable)
    isPanning = true
    lastPointer = { x: e.clientX, y: e.clientY }
    e.target.setPointerCapture?.(e.pointerId)
  }
}

const onPointerMove = (e) => {
  if (!props.interactive) return
  
  // Hover
  const hex = getHexAtPointer(e)
  if (hex) {
    emit('hex-hover', hex)
  }

  // Рисование
  if (isPainting && hex) {
    emit('paint-move', hex, e)
  }

  // Pan
  if (isPanning) {
    const dx = e.clientX - lastPointer.x
    const dy = e.clientY - lastPointer.y
    camera.pan(dx, dy)
    lastPointer = { x: e.clientX, y: e.clientY }
  }
}

const onPointerUp = (e) => {
  if (isPainting) {
    isPainting = false
    emit('paint-end')
    e.target.releasePointerCapture?.(e.pointerId)
  }
  if (isPanning) {
    isPanning = false
    e.target.releasePointerCapture?.(e.pointerId)
  }
}

const onClick = (e) => {
  if (!props.interactive) return
  
  const hex = getHexAtPointer(e)
  if (hex) {
    emit('hex-click', hex, e)
  }
}

const onContextMenu = (e) => {
  e.preventDefault()
  
  const hex = getHexAtPointer(e)
  emit('context-menu', hex, e)
}

const onWheel = (e) => {
  if (!props.interactive) return
  
  e.preventDefault()
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) return

  const centerX = e.clientX - rect.left
  const centerY = e.clientY - rect.top

  camera.zoomByWheel(e.deltaY, centerX, centerY)
}

/**
 * Получить гекс под указателем
 */
const getHexAtPointer = (e) => {
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) return null

  const screenX = e.clientX - rect.left
  const screenY = e.clientY - rect.top

  const world = camera.canvasToWorld(screenX, screenY)
  const coords = hexGrid.value.pixelToHex(world.x, world.y)

  return {
    q: coords.q,
    r: coords.r,
    key: `${coords.q},${coords.r}`,
    screenX,
    screenY,
    worldX: world.x,
    worldY: world.y
  }
}

/**
 * Touch handling для pinch zoom
 */
let touchStart = []

const onTouchStart = (e) => {
  if (!props.interactive) return
  touchStart = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY, id: t.identifier }))
}

const onTouchMove = (e) => {
  if (!props.interactive) return
  
  const touches = Array.from(e.touches)
  
  if (touches.length === 2 && touchStart.length === 2) {
    e.preventDefault()
    
    const rect = containerRef.value?.getBoundingClientRect()
    if (!rect) return

    const startDist = Math.hypot(
      touchStart[0].x - touchStart[1].x,
      touchStart[0].y - touchStart[1].y
    )

    const currentDist = Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY
    )

    const centerX = (touches[0].clientX + touches[1].clientX) / 2 - rect.left
    const centerY = (touches[0].clientY + touches[1].clientY) / 2 - rect.top

    const scale = currentDist / startDist

    camera.pinchZoom(scale, centerX, centerY)

    // Update touch start
    touchStart = touches.map(t => ({ x: t.clientX, y: t.clientY, id: t.identifier }))
  }
}

const onTouchEnd = (e) => {
  touchStart = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY, id: t.identifier }))
}

/**
 * Resize observer
 */
let resizeObserver = null

const updateSize = () => {
  if (!containerRef.value) return

  const rect = containerRef.value.getBoundingClientRect()
  canvasWidth.value = props.width || rect.width || 800
  canvasHeight.value = props.height || rect.height || 600

  // Update canvas sizes
  nextTick(() => {
    requestRedraw()
  })
}

// Lifecycle
onMounted(() => {
  updateSize()

  resizeObserver = new ResizeObserver(updateSize)
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }

  terrainRenderer.setMode(props.renderMode)

  emit('ready', {
    camera,
    terrainRenderer,
    hexGrid: hexGrid.value,
    requestRedraw,
    getHexAtPointer
  })
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (resizeObserver) resizeObserver.disconnect()
})

// Expose methods
defineExpose({
  camera,
  terrainRenderer,
  hexGrid,
  requestRedraw,
  getHexAtPointer,
  // Метод для принудительной инвалидации кэша паттернов И перерисовки (при изменении слоёв террейна)
  invalidateAndRedraw: () => {
    terrainRenderer.invalidatePatternCache()
    terrainRenderer.invalidateCache()
    requestRedraw()
  },
  // Метод для простой перерисовки без инвалидации (при изменении эффектов перехода)
  forceRedraw: () => {
    requestRedraw()
  },
  // Генерация полного паттерна (1024px) для редактируемого террейна
  generateFullPattern: () => {
    terrainRenderer.generateFullPattern()
    terrainRenderer.invalidateCache()
    requestRedraw()
  },
  // Переключение в режим превью (200px) для быстрого редактирования
  setPreviewMode: (preview = true) => {
    terrainRenderer.setPatternPreviewMode(preview)
    terrainRenderer.invalidatePatternCache('editing')
    terrainRenderer.invalidateCache()
    requestRedraw()
  },
  // Текущий режим превью
  patternPreviewMode: () => terrainRenderer.patternPreviewMode.value
})
</script>

<template>
  <div
    ref="containerRef"
    class="hex-map-canvas"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
    @click="onClick"
    @contextmenu="onContextMenu"
    @wheel="onWheel"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  >
    <!-- Terrain layer -->
    <canvas
      ref="terrainCanvasRef"
      class="canvas-layer terrain-layer"
      :width="canvasWidth"
      :height="canvasHeight"
    />
    
    <!-- Grid layer -->
    <canvas
      ref="gridCanvasRef"
      class="canvas-layer grid-layer"
      :width="canvasWidth"
      :height="canvasHeight"
    />
    
    <!-- Interaction layer (for highlights, selection, etc) -->
    <canvas
      ref="interactionCanvasRef"
      class="canvas-layer interaction-layer"
      :width="canvasWidth"
      :height="canvasHeight"
    />
    
    <!-- Debug: Zoom indicator -->
    <div class="zoom-indicator">
      Zoom: {{ camera.cameraState.value.zoom.toFixed(2) }}
      <span v-if="camera.cameraState.value.zoom > 0.5" class="lod-full">FULL</span>
      <span v-else class="lod-preview">PREVIEW</span>
    </div>
    
    <!-- Slot for overlays -->
    <slot />
  </div>
</template>

<style scoped>
.hex-map-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}

.canvas-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.terrain-layer {
  z-index: 1;
}

.grid-layer {
  z-index: 2;
  pointer-events: none;
}

.interaction-layer {
  z-index: 3;
  pointer-events: none;
}

.zoom-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  z-index: 100;
  pointer-events: none;
}

.lod-full {
  color: #4ade80;
  margin-left: 8px;
  font-weight: bold;
}

.lod-preview {
  color: #fbbf24;
  margin-left: 8px;
  font-weight: bold;
}
</style>
