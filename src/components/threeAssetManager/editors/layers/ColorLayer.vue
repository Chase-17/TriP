<template>
  <LayerBase 
    :layer="layer" 
    :is-first="isFirst" 
    :is-last="isLast"
    @update="emit('update', $event)"
    @delete="emit('delete')"
    @move="emit('move', $event)"
  >
    <div class="field">
      <label>Цвет</label>
      <ColorPicker 
        :model-value="layer.color" 
        @update:model-value="emit('update', { color: $event })"
      />
    </div>
  </LayerBase>
</template>

<script setup>
import LayerBase from './LayerBase.vue'
import ColorPicker from '@/components/shared/ColorPicker.vue'

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
</style>
