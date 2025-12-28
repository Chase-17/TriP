<script setup>
/**
 * ThreeHexDemo - Демонстрация Three.js рендерера гекс-карты
 * 
 * Показывает:
 * - Ортографический 2D вид
 * - GPU шейдеры для шума
 * - Высоты гексов (elevation)
 * - Pan/Zoom
 * - Hover detection
 */

import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { ThreeHexRenderer } from '@/utils/rendering/ThreeHexRenderer'
import { HexGrid } from '@/utils/hex/grid'

const props = defineProps({
  hexes: {
    type: [Map, Array],
    default: () => new Map()
  },
  hexSize: {
    type: Number,
    default: 30
  },
  getTerrainById: {
    type: Function,
    default: () => null
  }
})

const emit = defineEmits(['hex-hover', 'hex-click'])

const containerRef = ref(null)
let renderer = null
let hexGrid = null

// Camera state
const cameraX = ref(0)
const cameraY = ref(0)
const zoom = ref(1)

// Hover state
const hoveredHex = ref(null)

// Mouse handling
let isDragging = false
let lastMouseX = 0
let lastMouseY = 0

onMounted(() => {
  if (!containerRef.value) return
  
  hexGrid = new HexGrid({ hexSize: props.hexSize })
  
  renderer = new ThreeHexRenderer(containerRef.value, {
    hexSize: props.hexSize,
    antialias: true
  })
  
  // Подготавливаем гексы с террейнами
  const preparedHexes = prepareHexes()
  renderer.renderHexes(preparedHexes, hexGrid)
  
  // Запускаем анимацию
  renderer.start()
  
  // Event listeners
  containerRef.value.addEventListener('mousedown', onMouseDown)
  containerRef.value.addEventListener('mousemove', onMouseMove)
  containerRef.value.addEventListener('mouseup', onMouseUp)
  containerRef.value.addEventListener('mouseleave', onMouseUp)
  containerRef.value.addEventListener('wheel', onWheel)
  containerRef.value.addEventListener('click', onClick)
})

onBeforeUnmount(() => {
  if (renderer) {
    renderer.dispose()
  }
  
  if (containerRef.value) {
    containerRef.value.removeEventListener('mousedown', onMouseDown)
    containerRef.value.removeEventListener('mousemove', onMouseMove)
    containerRef.value.removeEventListener('mouseup', onMouseUp)
    containerRef.value.removeEventListener('mouseleave', onMouseUp)
    containerRef.value.removeEventListener('wheel', onWheel)
    containerRef.value.removeEventListener('click', onClick)
  }
})

// Подготовка гексов с полными данными террейнов
function prepareHexes() {
  const prepared = []
  
  const processHex = (hex) => {
    let terrain = hex.terrain
    
    // Если terrain это ID — получаем полный объект
    if (typeof terrain === 'string' && props.getTerrainById) {
      terrain = props.getTerrainById(terrain) || { color: '#888888' }
    }
    
    prepared.push({
      q: hex.q,
      r: hex.r,
      terrain: terrain || { color: '#888888' }
    })
  }
  
  if (props.hexes instanceof Map) {
    props.hexes.forEach(hex => processHex(hex))
  } else if (Array.isArray(props.hexes)) {
    props.hexes.forEach(hex => processHex(hex))
  }
  
  return prepared
}

// Обновление при изменении гексов
watch(() => props.hexes, () => {
  if (renderer && hexGrid) {
    const preparedHexes = prepareHexes()
    renderer.renderHexes(preparedHexes, hexGrid)
  }
}, { deep: true })

// Mouse handlers
function onMouseDown(e) {
  if (e.button === 0 || e.button === 1) {
    isDragging = true
    lastMouseX = e.clientX
    lastMouseY = e.clientY
  }
}

function onMouseMove(e) {
  if (isDragging) {
    const dx = e.clientX - lastMouseX
    const dy = e.clientY - lastMouseY
    
    cameraX.value -= dx / zoom.value
    cameraY.value -= dy / zoom.value
    
    renderer.setCamera(cameraX.value, cameraY.value, zoom.value)
    
    lastMouseX = e.clientX
    lastMouseY = e.clientY
  } else {
    // Hover detection
    const hexData = renderer.getHexAtPoint(e.clientX, e.clientY)
    if (hexData) {
      hoveredHex.value = { q: hexData.q, r: hexData.r }
      emit('hex-hover', hexData)
    } else {
      hoveredHex.value = null
    }
  }
}

function onMouseUp() {
  isDragging = false
}

function onWheel(e) {
  e.preventDefault()
  
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
  zoom.value = Math.max(0.1, Math.min(5, zoom.value * zoomFactor))
  
  renderer.setCamera(cameraX.value, cameraY.value, zoom.value)
}

function onClick(e) {
  const hexData = renderer.getHexAtPoint(e.clientX, e.clientY)
  if (hexData) {
    emit('hex-click', hexData)
  }
}

// Expose for parent
defineExpose({
  getRenderer: () => renderer,
  setCamera: (x, y, z) => {
    cameraX.value = x
    cameraY.value = y
    zoom.value = z
    renderer?.setCamera(x, y, z)
  }
})
</script>

<template>
  <div class="three-hex-demo">
    <div ref="containerRef" class="renderer-container" />
    
    <div class="info-overlay">
      <div class="zoom-info">Zoom: {{ zoom.toFixed(2) }}</div>
      <div v-if="hoveredHex" class="hover-info">
        Hex: {{ hoveredHex.q }}, {{ hoveredHex.r }}
      </div>
    </div>
    
    <div class="controls">
      <span class="control-hint">🖱️ Drag to pan | Scroll to zoom</span>
    </div>
  </div>
</template>

<style scoped>
.three-hex-demo {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.renderer-container {
  width: 100%;
  height: 100%;
}

.info-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-family: monospace;
  pointer-events: none;
}

.zoom-info {
  margin-bottom: 4px;
}

.hover-info {
  color: #4ade80;
}

.controls {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.5);
  color: rgba(255, 255, 255, 0.7);
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 11px;
  pointer-events: none;
}
</style>
