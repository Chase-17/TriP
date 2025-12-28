<template>
  <div :class="['layer-item', { collapsed: isCollapsed, disabled: !layer.enabled }]">
    <!-- Layer Header -->
    <div class="layer-header" @click="toggleCollapse">
      <div class="layer-drag-handle" @mousedown.stop>⋮⋮</div>
      
      <button 
        class="layer-visibility" 
        @click.stop="emit('update', { enabled: !layer.enabled })"
        :title="layer.enabled ? 'Скрыть слой' : 'Показать слой'"
      >
        {{ layer.enabled ? '👁️' : '👁️‍🗨️' }}
      </button>

      <span class="layer-icon">{{ layerIcon }}</span>
      
      <!-- Editable layer name -->
      <input 
        v-if="isEditingName"
        ref="nameInputRef"
        type="text"
        class="layer-name-input"
        :value="layer.name || ''"
        @input="emit('update', { name: $event.target.value })"
        @blur="isEditingName = false"
        @keydown.enter="isEditingName = false"
        @keydown.esc="isEditingName = false"
        @click.stop
        placeholder="Название слоя..."
      />
      <span 
        v-else
        class="layer-name"
      >
        {{ layer.name || layerTypeLabel }}
      </span>
      
      <div class="layer-actions">
        <button 
          class="btn-rename" 
          @click.stop="startEditingName"
          title="Переименовать"
        >✏️</button>
        <button 
          class="btn-move" 
          @click.stop="emit('move', 'up')"
          title="Вверх"
          :disabled="isFirst"
        >↑</button>
        <button 
          class="btn-move" 
          @click.stop="emit('move', 'down')"
          title="Вниз"
          :disabled="isLast"
        >↓</button>
        <button 
          class="btn-delete" 
          @click.stop="emit('delete')"
          title="Удалить слой"
        >×</button>
      </div>

      <span class="layer-collapse-icon">{{ isCollapsed ? '▶' : '▼' }}</span>
    </div>

    <!-- Common Layer Controls -->
    <div class="layer-content" v-show="!isCollapsed">
      <!-- Opacity -->
      <div class="field">
        <label>Прозрачность</label>
        <div class="range-row">
          <input 
            type="range" 
            :value="layer.opacity" 
            @input="emit('update', { opacity: parseFloat($event.target.value) })"
            min="0" max="1" step="0.05"
          />
          <span class="value">{{ (layer.opacity * 100).toFixed(0) }}%</span>
        </div>
      </div>

      <!-- Blend Mode -->
      <div class="field">
        <label>Режим смешивания</label>
        <IconSelect
          :model-value="layer.blendMode"
          :options="blendModeOptions"
          @update:model-value="emit('update', { blendMode: $event })"
        />
      </div>

      <!-- Layer-specific content (slot) -->
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import IconSelect from '@/components/shared/IconSelect.vue'

const props = defineProps({
  layer: { type: Object, required: true },
  isFirst: { type: Boolean, default: false },
  isLast: { type: Boolean, default: false },
})

const emit = defineEmits(['update', 'delete', 'move'])

const isCollapsed = ref(false)
const isEditingName = ref(false)
const nameInputRef = ref(null)

const layerTypeLabels = {
  color: 'Цвет',
  noise: 'Шум',
  pattern: 'Паттерн',
  gradient: 'Градиент',
  texture: 'Текстура',
  height: 'Высота',
  edge: 'Обводка',
}

const layerIcons = {
  color: '🎨',
  noise: '🌫️',
  pattern: '⬡',
  gradient: '🌈',
  texture: '🖼️',
  height: '⛰️',
  edge: '⭕',
}

const layerTypeLabel = computed(() => layerTypeLabels[props.layer.type] || props.layer.type)
const layerIcon = computed(() => layerIcons[props.layer.type] || '📦')

const blendModeOptions = [
  { value: 'normal', label: 'Normal - Обычное наложение', icon: '🔲' },
  { value: 'multiply', label: 'Multiply - Умножение (затемнение)', icon: '✖️' },
  { value: 'screen', label: 'Screen - Экран (осветление)', icon: '💡' },
  { value: 'overlay', label: 'Overlay - Перекрытие (контраст)', icon: '🔀' },
  { value: 'add', label: 'Add - Сложение (яркий свет)', icon: '➕' },
  { value: 'subtract', label: 'Subtract - Вычитание', icon: '➖' },
  { value: 'difference', label: 'Difference - Разница (инверсия)', icon: '🔃' },
  { value: 'softLight', label: 'Soft Light - Мягкий свет', icon: '🌤️' },
  { value: 'hardLight', label: 'Hard Light - Жёсткий свет', icon: '☀️' },
]

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function startEditingName() {
  isEditingName.value = true
  nextTick(() => {
    nameInputRef.value?.focus()
    nameInputRef.value?.select()
  })
}
</script>

<style scoped>
.layer-item {
  background: #1a1a3a;
  border: 1px solid #2a2a4a;
  border-radius: 6px;
  margin-bottom: 8px;
  overflow: hidden;
}

.layer-item.disabled {
  opacity: 0.5;
}

.layer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #222244;
  cursor: pointer;
  user-select: none;
}

.layer-header:hover {
  background: #2a2a55;
}

.layer-drag-handle {
  color: #555;
  cursor: grab;
  font-size: 10px;
  letter-spacing: 2px;
}

.layer-visibility {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.7;
}

.layer-visibility:hover {
  opacity: 1;
}

.layer-icon {
  font-size: 14px;
}

.layer-name {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: #ccc;
  cursor: text;
  padding: 2px 4px;
  border-radius: 3px;
  min-width: 60px;
}

.layer-name:hover {
  background: rgba(255, 255, 255, 0.05);
}

.layer-name-input {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: #e0e0e0;
  background: #2a2a4a;
  border: 1px solid #4a4a7a;
  border-radius: 3px;
  padding: 2px 6px;
  min-width: 60px;
  outline: none;
}

.layer-name-input:focus {
  border-color: #6a6aaa;
}

.layer-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.2s;
}

.layer-header:hover .layer-actions {
  opacity: 1;
}

.btn-move, .btn-delete, .btn-rename {
  background: transparent;
  border: 1px solid #3a3a5a;
  border-radius: 3px;
  color: #888;
  padding: 2px 6px;
  cursor: pointer;
  font-size: 11px;
}

.btn-rename:hover {
  background: #3a3a6a;
  color: #aaa;
}

.btn-move:hover {
  background: #3a3a6a;
  color: #aaa;
}

.btn-move:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-delete:hover {
  background: #5a2a2a;
  color: #e55;
  border-color: #6a3a3a;
}

.layer-collapse-icon {
  color: #666;
  font-size: 10px;
  width: 12px;
}

.layer-content {
  padding: 12px;
  border-top: 1px solid #2a2a4a;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

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
  min-width: 36px;
  text-align: right;
  font-size: 11px;
  color: #aaa;
  font-family: monospace;
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
</style>
