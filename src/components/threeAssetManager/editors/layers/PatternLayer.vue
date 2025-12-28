<template>
  <LayerBase 
    :layer="layer" 
    :is-first="isFirst" 
    :is-last="isLast"
    @update="emit('update', $event)"
    @delete="emit('delete')"
    @move="emit('move', $event)"
  >
    <!-- Pattern Type -->
    <div class="field">
      <label>Тип паттерна</label>
      <IconSelect
        :model-value="layer.patternType"
        :options="patternTypeOptions"
        @update:model-value="emit('update', { patternType: $event })"
      />
    </div>

    <!-- Color -->
    <div class="field">
      <label>Цвет 1 (фон)</label>
      <ColorPicker 
        :model-value="layer.color" 
        @update:model-value="emit('update', { color: $event })"
      />
    </div>

    <!-- Color 2 -->
    <div class="field">
      <label>Цвет 2 (паттерн)</label>
      <ColorPicker 
        :model-value="layer.color2 || '#ffffff'" 
        @update:model-value="emit('update', { color2: $event })"
      />
    </div>

    <!-- Scale -->
    <div class="field">
      <label>Масштаб</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.scale" 
          @input="emit('update', { scale: parseFloat($event.target.value) })"
          min="0.1" max="10" step="0.1"
        />
        <span class="value">{{ layer.scale.toFixed(1) }}</span>
      </div>
    </div>

    <!-- Rotation (not for rings - they are rotation invariant) -->
    <div class="field" v-if="showRotation">
      <label>Поворот</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.rotation" 
          @input="emit('update', { rotation: parseFloat($event.target.value) })"
          min="0" max="360" step="5"
        />
        <span class="value">{{ layer.rotation }}°</span>
      </div>
    </div>

    <!-- Line Width (for grids, stripes, crosshatch, rings) -->
    <div class="field" v-if="showLineWidth">
      <label>Толщина линии</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.lineWidth" 
          @input="emit('update', { lineWidth: parseFloat($event.target.value) })"
          min="0.01" max="0.5" step="0.01"
        />
        <span class="value">{{ layer.lineWidth.toFixed(2) }}</span>
      </div>
    </div>

    <!-- Dot Size (for dots) -->
    <div class="field" v-if="layer.patternType === 'dots'">
      <label>Размер точек</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.dotSize" 
          @input="emit('update', { dotSize: parseFloat($event.target.value) })"
          min="0.01" max="0.5" step="0.01"
        />
        <span class="value">{{ layer.dotSize.toFixed(2) }}</span>
      </div>
    </div>

    <!-- Wave Frequency (for waves) -->
    <div class="field" v-if="layer.patternType === 'waves'">
      <label>Частота волн</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.waveFrequency" 
          @input="emit('update', { waveFrequency: parseFloat($event.target.value) })"
          min="0.5" max="10" step="0.5"
        />
        <span class="value">{{ layer.waveFrequency.toFixed(1) }}</span>
      </div>
    </div>

    <!-- Ring Count (for rings) -->
    <div class="field" v-if="layer.patternType === 'rings'">
      <label>Количество колец</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.ringCount" 
          @input="emit('update', { ringCount: parseInt($event.target.value) })"
          min="1" max="10" step="1"
        />
        <span class="value">{{ layer.ringCount }}</span>
      </div>
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

    <!-- Offset -->
    <div class="field">
      <label>Смещение</label>
      <div class="offset-row">
        <label class="mini">X</label>
        <input 
          type="number" 
          :value="layer.offset.x" 
          @input="emit('update', { offset: { ...layer.offset, x: parseFloat($event.target.value) || 0 } })"
          step="0.1"
        />
        <label class="mini">Y</label>
        <input 
          type="number" 
          :value="layer.offset.y" 
          @input="emit('update', { offset: { ...layer.offset, y: parseFloat($event.target.value) || 0 } })"
          step="0.1"
        />
      </div>
    </div>
  </LayerBase>
</template>

<script setup>
import { computed } from 'vue'
import LayerBase from './LayerBase.vue'
import ColorPicker from '@/components/shared/ColorPicker.vue'
import IconSelect from '@/components/shared/IconSelect.vue'

const patternTypeOptions = [
  { value: 'hexgrid', label: 'Гексагональная сетка', icon: '⬡' },
  { value: 'grid', label: 'Квадратная сетка', icon: '▦' },
  { value: 'stripes', label: 'Полосы', icon: '≡' },
  { value: 'dots', label: 'Точки', icon: '⊙' },
  { value: 'checker', label: 'Шахматка', icon: '♟️' },
  { value: 'rings', label: 'Кольца', icon: '◎' },
  { value: 'waves', label: 'Волны', icon: '∿' },
  { value: 'crosshatch', label: 'Штриховка', icon: '╳' },
  { value: 'diagonal', label: 'Диагональ', icon: '⧈' },
]

const props = defineProps({
  layer: { type: Object, required: true },
  isFirst: { type: Boolean, default: false },
  isLast: { type: Boolean, default: false },
})

const emit = defineEmits(['update', 'delete', 'move'])

// Поворот работает для всех паттернов кроме колец (они симметричны)
const showRotation = computed(() => 
  props.layer.patternType !== 'rings'
)

// Толщина линии для сеток, полос, штриховки, колец
const showLineWidth = computed(() => 
  ['grid', 'stripes', 'crosshatch', 'rings'].includes(props.layer.patternType)
)
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

select, input[type="number"] {
  padding: 6px 8px;
  background: #12122a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
}

select:focus, input[type="number"]:focus {
  outline: none;
  border-color: #4a4a7a;
}

.color-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-row input[type="color"] {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.color-text {
  flex: 1;
  padding: 6px 8px;
  background: #12122a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
  font-family: monospace;
}

.color-text:focus {
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

.offset-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.offset-row label.mini {
  font-size: 10px;
  color: #666;
}

.offset-row input {
  width: 60px;
}

.field.checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
}

.field.checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}
</style>
