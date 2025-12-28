<script setup>
/**
 * TerrainPreview - компонент визуального превью террейна
 * 
 * Рендерит террейн на основе слоёв в реальном времени.
 * Поддерживает hex-маску и различные размеры.
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { TerrainLayerRenderer, createLayer, LAYER_TYPES } from '@/utils/rendering/terrainLayerRenderer.js'

const props = defineProps({
  // Массив слоёв для рендеринга
  layers: {
    type: Array,
    default: () => []
  },
  // Базовый цвет (если нет слоёв)
  color: {
    type: String,
    default: '#888888'
  },
  // Размер превью
  size: {
    type: Number,
    default: 128
  },
  // Применять hex-маску
  hexMask: {
    type: Boolean,
    default: true
  },
  // Показывать сетку hex
  showGrid: {
    type: Boolean,
    default: false
  },
  // Задержка перед ре-рендером (debounce)
  debounce: {
    type: Number,
    default: 50
  }
})

const emit = defineEmits(['rendered'])

// Refs
const canvasRef = ref(null)
const imageDataUrl = ref('')
const isRendering = ref(false)

// Renderer instance
let renderer = null
let renderTimeout = null

// Computed effective layers
const effectiveLayers = computed(() => {
  if (props.layers && props.layers.length > 0) {
    return props.layers
  }
  // Если нет слоёв, создаём слой из базового цвета
  return [createLayer({ type: LAYER_TYPES.SOLID, color: props.color })]
})

/**
 * Рендерить террейн
 */
function render() {
  if (!renderer) {
    renderer = new TerrainLayerRenderer(props.size, props.size)
  }
  
  // Resize if needed
  if (renderer.width !== props.size) {
    renderer.resize(props.size, props.size)
  }
  
  isRendering.value = true
  
  try {
    renderer.render(effectiveLayers.value, {
      hexMask: props.hexMask,
      centerX: props.size / 2,
      centerY: props.size / 2,
      radius: props.size / 2 - 2
    })
    
    // Draw grid overlay if needed
    if (props.showGrid) {
      drawHexGrid(renderer.ctx)
    }
    
    imageDataUrl.value = renderer.toDataURL()
    emit('rendered', imageDataUrl.value)
  } catch (e) {
    console.error('TerrainPreview render error:', e)
  } finally {
    isRendering.value = false
  }
}

/**
 * Нарисовать hex-сетку поверх
 */
function drawHexGrid(ctx) {
  const centerX = props.size / 2
  const centerY = props.size / 2
  const radius = props.size / 2 - 2
  
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2
    const x = centerX + radius * Math.cos(angle)
    const y = centerY + radius * Math.sin(angle)
    
    if (i === 0) {
      ctx.moveTo(x, y)
    } else {
      ctx.lineTo(x, y)
    }
  }
  
  ctx.closePath()
  ctx.stroke()
}

/**
 * Debounced render
 */
function scheduleRender() {
  if (renderTimeout) {
    clearTimeout(renderTimeout)
  }
  
  renderTimeout = setTimeout(() => {
    render()
  }, props.debounce)
}

// Watch for changes
watch(
  () => [props.layers, props.color, props.size, props.hexMask, props.showGrid],
  () => {
    scheduleRender()
  },
  { deep: true }
)

// Initial render
onMounted(() => {
  render()
})

// Cleanup
onUnmounted(() => {
  if (renderTimeout) {
    clearTimeout(renderTimeout)
  }
  renderer = null
})

// Expose methods
defineExpose({
  render,
  getDataUrl: () => imageDataUrl.value
})
</script>

<template>
  <div 
    class="terrain-preview-wrapper"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <img 
      v-if="imageDataUrl"
      :src="imageDataUrl" 
      :width="size" 
      :height="size"
      class="terrain-preview-image"
      :class="{ rendering: isRendering }"
      alt="Terrain preview"
    />
    <div v-else class="terrain-preview-placeholder">
      <span>...</span>
    </div>
    
    <!-- Loading overlay -->
    <div v-if="isRendering" class="rendering-indicator">
      <div class="spinner"></div>
    </div>
  </div>
</template>

<style scoped>
.terrain-preview-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.5rem;
  overflow: hidden;
}

.terrain-preview-image {
  display: block;
  transition: opacity 0.15s;
}

.terrain-preview-image.rendering {
  opacity: 0.7;
}

.terrain-preview-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: rgba(255, 255, 255, 0.3);
  font-size: 1.5rem;
}

.rendering-indicator {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
