<template>
  <LayerBase 
    :layer="layer" 
    :is-first="isFirst" 
    :is-last="isLast"
    @update="emit('update', $event)"
    @delete="emit('delete')"
    @move="emit('move', $event)"
  >
    <!-- Texture URL -->
    <div class="field">
      <label>Текстура</label>
      <div class="texture-input">
        <input 
          type="text" 
          :value="layer.textureUrl" 
          @input="emit('update', { textureUrl: $event.target.value })"
          placeholder="URL или путь к текстуре"
        />
        <button class="btn-browse" title="Выбрать файл">📁</button>
      </div>
      <div 
        v-if="layer.textureUrl" 
        class="texture-preview"
        :style="{ backgroundImage: `url(${layer.textureUrl})` }"
      ></div>
    </div>

    <!-- Tiling -->
    <div class="field">
      <label>Повторение</label>
      <div class="tiling-row">
        <label class="mini">X</label>
        <input 
          type="number" 
          :value="layer.tiling.x" 
          @input="emit('update', { tiling: { ...layer.tiling, x: parseFloat($event.target.value) || 1 } })"
          min="0.1" step="0.1"
        />
        <label class="mini">Y</label>
        <input 
          type="number" 
          :value="layer.tiling.y" 
          @input="emit('update', { tiling: { ...layer.tiling, y: parseFloat($event.target.value) || 1 } })"
          min="0.1" step="0.1"
        />
        <button 
          class="btn-link" 
          :class="{ active: tilingLinked }"
          @click="tilingLinked = !tilingLinked"
          title="Связать X и Y"
        >🔗</button>
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
          step="0.01"
        />
        <label class="mini">Y</label>
        <input 
          type="number" 
          :value="layer.offset.y" 
          @input="emit('update', { offset: { ...layer.offset, y: parseFloat($event.target.value) || 0 } })"
          step="0.01"
        />
      </div>
    </div>

    <!-- Rotation -->
    <div class="field">
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

    <!-- Filtering -->
    <div class="field">
      <label>Фильтрация</label>
      <select 
        :value="layer.filtering" 
        @change="emit('update', { filtering: $event.target.value })"
      >
        <option value="linear">Linear (сглаженная)</option>
        <option value="nearest">Nearest (пиксельная)</option>
      </select>
    </div>

    <!-- Color Adjustments -->
    <div class="field-group">
      <div class="field-group-header">Цветокоррекция</div>
      
      <div class="field">
        <label>Яркость</label>
        <div class="range-row">
          <input 
            type="range" 
            :value="layer.brightness" 
            @input="emit('update', { brightness: parseFloat($event.target.value) })"
            min="-1" max="1" step="0.05"
          />
          <span class="value">{{ (layer.brightness >= 0 ? '+' : '') + layer.brightness.toFixed(2) }}</span>
        </div>
      </div>

      <div class="field">
        <label>Контраст</label>
        <div class="range-row">
          <input 
            type="range" 
            :value="layer.contrast" 
            @input="emit('update', { contrast: parseFloat($event.target.value) })"
            min="-1" max="1" step="0.05"
          />
          <span class="value">{{ (layer.contrast >= 0 ? '+' : '') + layer.contrast.toFixed(2) }}</span>
        </div>
      </div>

      <div class="field">
        <label>Насыщенность</label>
        <div class="range-row">
          <input 
            type="range" 
            :value="layer.saturation" 
            @input="emit('update', { saturation: parseFloat($event.target.value) })"
            min="-1" max="1" step="0.05"
          />
          <span class="value">{{ (layer.saturation >= 0 ? '+' : '') + layer.saturation.toFixed(2) }}</span>
        </div>
      </div>

      <div class="field">
        <label>Оттенок</label>
        <div class="range-row">
          <input 
            type="range" 
            :value="layer.hue" 
            @input="emit('update', { hue: parseFloat($event.target.value) })"
            min="-180" max="180" step="5"
          />
          <span class="value">{{ layer.hue }}°</span>
        </div>
      </div>

      <button class="btn-reset" @click="resetColorAdjustments">Сбросить</button>
    </div>
  </LayerBase>
</template>

<script setup>
import { ref } from 'vue'
import LayerBase from './LayerBase.vue'

const props = defineProps({
  layer: { type: Object, required: true },
  isFirst: { type: Boolean, default: false },
  isLast: { type: Boolean, default: false },
})

const emit = defineEmits(['update', 'delete', 'move'])

const tilingLinked = ref(true)

function resetColorAdjustments() {
  emit('update', {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    hue: 0,
  })
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

select, input[type="text"], input[type="number"] {
  padding: 6px 8px;
  background: #12122a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
}

select:focus, input[type="text"]:focus, input[type="number"]:focus {
  outline: none;
  border-color: #4a4a7a;
}

.texture-input {
  display: flex;
  gap: 6px;
}

.texture-input input {
  flex: 1;
}

.btn-browse {
  background: #2a2a4a;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 12px;
}

.btn-browse:hover {
  background: #3a3a6a;
}

.texture-preview {
  width: 100%;
  height: 60px;
  margin-top: 6px;
  background-size: cover;
  background-position: center;
  border-radius: 4px;
  border: 1px solid #2a2a4a;
}

.tiling-row, .offset-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tiling-row input, .offset-row input {
  width: 60px;
}

.mini {
  font-size: 10px;
  color: #666;
}

.btn-link {
  background: transparent;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 12px;
  opacity: 0.5;
}

.btn-link.active {
  opacity: 1;
  background: #2a4a2a;
  border-color: #3a5a3a;
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
  min-width: 45px;
  text-align: right;
  font-size: 11px;
  color: #aaa;
  font-family: monospace;
}

.field-group {
  background: #15152a;
  border: 1px solid #25254a;
  border-radius: 6px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-group-header {
  font-size: 11px;
  font-weight: 600;
  color: #aaa;
  margin-bottom: 4px;
}

.btn-reset {
  background: transparent;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  color: #888;
  padding: 6px;
  cursor: pointer;
  font-size: 11px;
  margin-top: 4px;
}

.btn-reset:hover {
  background: #2a2a4a;
  color: #aaa;
}
</style>
