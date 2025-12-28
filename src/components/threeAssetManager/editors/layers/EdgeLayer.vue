<template>
  <LayerBase 
    :layer="layer" 
    :is-first="isFirst" 
    :is-last="isLast"
    @update="emit('update', $event)"
    @delete="emit('delete')"
    @move="emit('move', $event)"
  >
    <!-- Edge Style -->
    <div class="field">
      <label>Стиль обводки</label>
      <select 
        :value="layer.style" 
        @change="emit('update', { style: $event.target.value })"
      >
        <option value="solid">Сплошная</option>
        <option value="dashed">Пунктирная</option>
        <option value="dotted">Точечная</option>
        <option value="glow">Свечение</option>
        <option value="double">Двойная</option>
      </select>
    </div>

    <!-- Color -->
    <div class="field">
      <label>Цвет</label>
      <div class="color-row">
        <input 
          type="color" 
          :value="layer.color" 
          @input="emit('update', { color: $event.target.value })"
        />
        <input 
          type="text" 
          :value="layer.color" 
          @input="emit('update', { color: $event.target.value })"
          class="color-text"
        />
      </div>
    </div>

    <!-- Width -->
    <div class="field">
      <label>Толщина</label>
      <div class="range-row">
        <input 
          type="range" 
          :value="layer.width" 
          @input="emit('update', { width: parseFloat($event.target.value) })"
          min="0.01" max="0.3" step="0.01"
        />
        <span class="value">{{ layer.width.toFixed(2) }}</span>
      </div>
    </div>

    <!-- Inset -->
    <div class="field checkbox">
      <label>
        <input 
          type="checkbox" 
          :checked="layer.inset" 
          @change="emit('update', { inset: $event.target.checked })"
        />
        Внутри гекса
      </label>
    </div>

    <!-- Glow Settings (for glow style) -->
    <div class="field-group" v-if="layer.style === 'glow'">
      <div class="field-group-header">Настройки свечения</div>
      
      <div class="field">
        <label>Цвет свечения</label>
        <div class="color-row">
          <input 
            type="color" 
            :value="layer.glowColor" 
            @input="emit('update', { glowColor: $event.target.value })"
          />
          <input 
            type="text" 
            :value="layer.glowColor" 
            @input="emit('update', { glowColor: $event.target.value })"
            class="color-text"
          />
        </div>
      </div>

      <div class="field">
        <label>Размер свечения</label>
        <div class="range-row">
          <input 
            type="range" 
            :value="layer.glowSize" 
            @input="emit('update', { glowSize: parseFloat($event.target.value) })"
            min="0.01" max="0.5" step="0.01"
          />
          <span class="value">{{ layer.glowSize.toFixed(2) }}</span>
        </div>
      </div>
    </div>
  </LayerBase>
</template>

<script setup>
import LayerBase from './LayerBase.vue'

defineProps({
  layer: { type: Object, required: true },
  isFirst: { type: Boolean, default: false },
  isLast: { type: Boolean, default: false },
})

const emit = defineEmits(['update', 'delete', 'move'])
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
</style>
