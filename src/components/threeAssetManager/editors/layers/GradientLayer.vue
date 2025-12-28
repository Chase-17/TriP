<template>
  <LayerBase 
    :layer="layer" 
    :is-first="isFirst" 
    :is-last="isLast"
    @update="emit('update', $event)"
    @delete="emit('delete')"
    @move="emit('move', $event)"
  >
    <!-- Gradient Type -->
    <div class="field">
      <label>Тип градиента</label>
      <IconSelect
        :model-value="layer.gradientType"
        :options="gradientTypeOptions"
        @update:model-value="emit('update', { gradientType: $event })"
      />
    </div>

    <!-- Angle (for linear) -->
    <div class="field" v-if="layer.gradientType === 'linear'">
      <label>Угол</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.angle" 
          @input="emit('update', { angle: parseFloat($event.target.value) })"
          min="0" max="360" step="5"
        />
        <span class="value">{{ layer.angle }}°</span>
      </div>
    </div>

    <!-- Center (for radial/angular/diamond) -->
    <div class="field" v-if="layer.gradientType !== 'linear'">
      <label>Центр</label>
      <div class="center-row">
        <label class="mini">X</label>
        <input 
          type="range" 
          :value="layer.centerX" 
          @input="emit('update', { centerX: parseFloat($event.target.value) })"
          min="0" max="1" step="0.05"
        />
        <span class="mini-value">{{ layer.centerX.toFixed(2) }}</span>
        <label class="mini">Y</label>
        <input 
          type="range" 
          :value="layer.centerY" 
          @input="emit('update', { centerY: parseFloat($event.target.value) })"
          min="0" max="1" step="0.05"
        />
        <span class="mini-value">{{ layer.centerY.toFixed(2) }}</span>
      </div>
    </div>

    <!-- Scale -->
    <div class="field">
      <label>Масштаб</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.scale" 
          @input="emit('update', { scale: parseFloat($event.target.value) })"
          min="0.1" max="5" step="0.1"
        />
        <span class="value">{{ layer.scale.toFixed(1) }}</span>
      </div>
    </div>

    <!-- Color Stops -->
    <div class="field">
      <label>Цветовые точки</label>
      <div class="color-stops">
        <div 
          v-for="(stop, index) in layer.colors" 
          :key="index"
          class="color-stop"
        >
          <input 
            type="color" 
            :value="stop.color" 
            @input="updateColorStop(index, { color: $event.target.value })"
          />
          <input 
            type="range" 
            :value="stop.stop" 
            @input="updateColorStop(index, { stop: parseFloat($event.target.value) })"
            min="0" max="1" step="0.01"
            class="stop-slider"
          />
          <span class="stop-value">{{ (stop.stop * 100).toFixed(0) }}%</span>
          <button 
            class="btn-remove-stop" 
            @click="removeColorStop(index)"
            :disabled="layer.colors.length <= 2"
            title="Удалить точку"
          >×</button>
        </div>
        <button class="btn-add-stop" @click="addColorStop">+ Добавить точку</button>
      </div>
    </div>

    <!-- Gradient Preview -->
    <div class="field">
      <label>Предпросмотр</label>
      <div 
        class="gradient-preview" 
        :style="{ background: gradientPreviewStyle }"
      ></div>
    </div>

    <!-- Invert -->
    <div class="field checkbox">
      <label>
        <input 
          type="checkbox" 
          :checked="layer.invert" 
          @change="emit('update', { invert: $event.target.checked })"
        />
        Инвертировать
      </label>
    </div>
  </LayerBase>
</template>

<script setup>
import { computed } from 'vue'
import LayerBase from './LayerBase.vue'
import IconSelect from '@/components/shared/IconSelect.vue'

const gradientTypeOptions = [
  { value: 'linear', label: 'Линейный градиент', icon: '↔️' },
  { value: 'radial', label: 'Радиальный градиент', icon: '🔘' },
  { value: 'angular', label: 'Угловой градиент', icon: '🎯' },
  { value: 'diamond', label: 'Ромбовидный градиент', icon: '◇' },
]

const props = defineProps({
  layer: { type: Object, required: true },
  isFirst: { type: Boolean, default: false },
  isLast: { type: Boolean, default: false },
})

const emit = defineEmits(['update', 'delete', 'move'])

const gradientPreviewStyle = computed(() => {
  const sorted = [...props.layer.colors].sort((a, b) => a.stop - b.stop)
  const stops = sorted.map(s => `${s.color} ${s.stop * 100}%`).join(', ')
  
  switch (props.layer.gradientType) {
    case 'radial':
      return `radial-gradient(circle, ${stops})`
    case 'angular':
      return `conic-gradient(from ${props.layer.angle}deg, ${stops})`
    case 'diamond':
      return `linear-gradient(${props.layer.angle}deg, ${stops})`
    default:
      return `linear-gradient(${props.layer.angle}deg, ${stops})`
  }
})

function updateColorStop(index, updates) {
  const newColors = [...props.layer.colors]
  newColors[index] = { ...newColors[index], ...updates }
  emit('update', { colors: newColors })
}

function addColorStop() {
  const newColors = [...props.layer.colors]
  // Find a gap to insert new stop
  const sorted = [...newColors].sort((a, b) => a.stop - b.stop)
  let newStop = 0.5
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1].stop - sorted[i].stop
    if (gap > 0.1) {
      newStop = sorted[i].stop + gap / 2
      break
    }
  }
  newColors.push({ stop: newStop, color: '#888888' })
  emit('update', { colors: newColors })
}

function removeColorStop(index) {
  if (props.layer.colors.length <= 2) return
  const newColors = props.layer.colors.filter((_, i) => i !== index)
  emit('update', { colors: newColors })
}
</script>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field label {
  font-size: 11px;
  color: #888;
  font-weight: 500;
}

.field.checkbox label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #aaa;
}

select {
  padding: 6px 8px;
  background: #12122a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
}

select:focus {
  outline: none;
  border-color: #4a4a7a;
}

.range-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-row input[type="range"] {
  flex: 1;
  height: 4px;
  background: #2a2a4a;
  border-radius: 2px;
  appearance: none;
}

.range-row input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  background: #5a5a8a;
  border-radius: 50%;
  cursor: pointer;
}

.range-row .value {
  min-width: 40px;
  text-align: right;
  font-size: 11px;
  color: #aaa;
  font-family: monospace;
}

.center-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.center-row input[type="range"] {
  width: 60px;
  height: 4px;
  background: #2a2a4a;
  border-radius: 2px;
  appearance: none;
}

.center-row input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 10px;
  height: 10px;
  background: #5a5a8a;
  border-radius: 50%;
  cursor: pointer;
}

.mini {
  font-size: 10px;
  color: #666;
}

.mini-value {
  font-size: 10px;
  color: #888;
  font-family: monospace;
  min-width: 28px;
}

.color-stops {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.color-stop {
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-stop input[type="color"] {
  width: 28px;
  height: 24px;
  padding: 0;
  border: 1px solid #2a2a4a;
  border-radius: 3px;
  cursor: pointer;
  background: transparent;
}

.stop-slider {
  flex: 1;
  height: 4px;
  background: #2a2a4a;
  border-radius: 2px;
  appearance: none;
}

.stop-slider::-webkit-slider-thumb {
  appearance: none;
  width: 10px;
  height: 10px;
  background: #5a5a8a;
  border-radius: 50%;
  cursor: pointer;
}

.stop-value {
  font-size: 10px;
  color: #888;
  font-family: monospace;
  min-width: 32px;
  text-align: right;
}

.btn-remove-stop {
  background: transparent;
  border: 1px solid #3a3a4a;
  border-radius: 3px;
  color: #666;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 12px;
}

.btn-remove-stop:hover:not(:disabled) {
  background: #4a2a2a;
  color: #e55;
  border-color: #5a3a3a;
}

.btn-remove-stop:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-add-stop {
  background: #2a2a4a;
  border: 1px dashed #3a3a5a;
  border-radius: 4px;
  color: #888;
  padding: 6px;
  cursor: pointer;
  font-size: 11px;
}

.btn-add-stop:hover {
  background: #3a3a5a;
  color: #aaa;
}

.gradient-preview {
  height: 24px;
  border-radius: 4px;
  border: 1px solid #2a2a4a;
}
</style>
