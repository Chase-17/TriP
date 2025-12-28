<template>
  <LayerBase 
    :layer="layer" 
    :is-first="isFirst" 
    :is-last="isLast"
    @update="emit('update', $event)"
    @delete="emit('delete')"
    @move="emit('move', $event)"
  >
    <!-- Noise Type -->
    <div class="field">
      <label>Тип шума</label>
      <IconSelect
        :model-value="layer.noiseType"
        :options="noiseTypeOptions"
        @update:model-value="emit('update', { noiseType: $event })"
      />
    </div>

    <!-- Seed -->
    <div class="field">
      <label>Seed</label>
      <div class="seed-row">
        <input 
          type="number" 
          :value="layer.seed" 
          @input="emit('update', { seed: parseInt($event.target.value) || 0 })"
        />
        <button class="btn-randomize" @click="randomizeSeed" title="Случайный">🎲</button>
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
          min="0.1" max="20" step="0.1"
        />
        <span class="value">{{ layer.scale.toFixed(1) }}</span>
      </div>
    </div>

    <!-- Octaves (for FBM) -->
    <div class="field" v-if="showFbmOptions">
      <label>Октавы</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.octaves" 
          @input="emit('update', { octaves: parseInt($event.target.value) })"
          min="1" max="8" step="1"
        />
        <span class="value">{{ layer.octaves }}</span>
      </div>
    </div>

    <!-- Persistence (for FBM) -->
    <div class="field" v-if="showFbmOptions">
      <label>Persistence</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.persistence" 
          @input="emit('update', { persistence: parseFloat($event.target.value) })"
          min="0.1" max="1" step="0.05"
        />
        <span class="value">{{ layer.persistence.toFixed(2) }}</span>
      </div>
    </div>

    <!-- Lacunarity (for FBM) -->
    <div class="field" v-if="showFbmOptions">
      <label>Lacunarity</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.lacunarity" 
          @input="emit('update', { lacunarity: parseFloat($event.target.value) })"
          min="1" max="4" step="0.1"
        />
        <span class="value">{{ layer.lacunarity.toFixed(1) }}</span>
      </div>
    </div>

    <!-- Smoothness (for Voronoi) -->
    <div class="field" v-if="layer.noiseType === 'voronoi'">
      <label>Плавность</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.smoothness" 
          @input="emit('update', { smoothness: parseFloat($event.target.value) })"
          min="0" max="1" step="0.05"
        />
        <span class="value">{{ layer.smoothness.toFixed(2) }}</span>
      </div>
    </div>

    <!-- Warp Strength / Sharpness (for warped/fibrous/ridged) -->
    <div class="field" v-if="showWarpStrength">
      <label>{{ layer.noiseType === 'ridged' ? 'Резкость' : 'Сила искажения' }}</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.warpStrength" 
          @input="emit('update', { warpStrength: parseFloat($event.target.value) })"
          min="0.1" max="3" step="0.1"
        />
        <span class="value">{{ (layer.warpStrength || 1).toFixed(1) }}</span>
      </div>
    </div>

    <!-- Direction (for fibrous) -->
    <div class="field" v-if="layer.noiseType === 'fibrous'">
      <label>Направление</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.direction" 
          @input="emit('update', { direction: parseFloat($event.target.value) })"
          min="0" max="360" step="5"
        />
        <span class="value">{{ (layer.direction || 0).toFixed(0) }}°</span>
      </div>
    </div>

    <!-- Amplitude -->
    <div class="field">
      <label>Амплитуда</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.amplitude" 
          @input="emit('update', { amplitude: parseFloat($event.target.value) })"
          min="0" max="2" step="0.1"
        />
        <span class="value">{{ layer.amplitude.toFixed(1) }}</span>
      </div>
    </div>

    <!-- Color A & B -->
    <div class="field">
      <label>Цвет (мин → макс)</label>
      <div class="dual-color-row">
        <ColorPicker 
          :model-value="layer.colorA" 
          @update:model-value="emit('update', { colorA: $event })"
        />
        <span class="color-arrow">→</span>
        <ColorPicker 
          :model-value="layer.colorB" 
          @update:model-value="emit('update', { colorB: $event })"
        />
        <button 
          class="btn-swap" 
          @click="swapColors"
          title="Поменять местами"
        >⇄</button>
      </div>
    </div>

    <!-- Threshold -->
    <div class="field">
      <label>Порог отсечения</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.threshold" 
          @input="emit('update', { threshold: parseFloat($event.target.value) })"
          min="0" max="1" step="0.05"
        />
        <span class="value">{{ layer.threshold.toFixed(2) }}</span>
      </div>
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
import ColorPicker from '@/components/shared/ColorPicker.vue'
import IconSelect from '@/components/shared/IconSelect.vue'

const noiseTypeOptions = [
  { value: 'perlin', label: 'Perlin - Классический плавный шум', icon: '🌫️' },
  { value: 'simplex', label: 'Simplex - Улучшенный Perlin', icon: '△' },
  { value: 'voronoi', label: 'Voronoi - Ячейки/камни', icon: '🧿' },
  { value: 'cellular', label: 'Cellular - Резкие ячейки', icon: '🐝' },
  { value: 'fbm', label: 'FBM - Фрактальный шум', icon: '🌊' },
  { value: 'worley', label: 'Worley - Трещины', icon: '🔳' },
  { value: 'white', label: 'White - Белый шум', icon: '░' },
  { value: 'warped', label: 'Warped - Органика', icon: '🌀' },
  { value: 'fibrous', label: 'Fibrous - Волокна/текстура дерева', icon: '🌿' },
  { value: 'ridged', label: 'Ridged - Гребни/трещины', icon: '⛰️' },
]

const props = defineProps({
  layer: { type: Object, required: true },
  isFirst: { type: Boolean, default: false },
  isLast: { type: Boolean, default: false },
})

const emit = defineEmits(['update', 'delete', 'move'])

// FBM опции (octaves, persistence, lacunarity) для FBM, warped, fibrous и ridged
const showFbmOptions = computed(() => 
  props.layer.noiseType === 'fbm' || 
  props.layer.noiseType === 'warped' || 
  props.layer.noiseType === 'fibrous' ||
  props.layer.noiseType === 'ridged'
)

// Показывать warpStrength для warped, fibrous и ridged (как sharpness)
const showWarpStrength = computed(() =>
  props.layer.noiseType === 'warped' || 
  props.layer.noiseType === 'fibrous' ||
  props.layer.noiseType === 'ridged'
)

function randomizeSeed() {
  emit('update', { seed: Math.floor(Math.random() * 100000) })
}

function swapColors() {
  emit('update', { colorA: props.layer.colorB, colorB: props.layer.colorA })
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

.seed-row {
  display: flex;
  gap: 6px;
}

.seed-row input {
  flex: 1;
}

.btn-randomize {
  background: #2a2a4a;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 14px;
}

.btn-randomize:hover {
  background: #3a3a6a;
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

.dual-color-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dual-color-row input[type="color"] {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.color-arrow {
  color: #666;
  font-size: 14px;
}

.btn-swap {
  background: #2a2a4a;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  color: #888;
  font-size: 12px;
}

.btn-swap:hover {
  background: #3a3a6a;
  color: #aaa;
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
</style>
