<template>
  <div class="object-editor">
    <div class="field">
      <label>ID</label>
      <input 
        type="text" 
        :value="object.id" 
        @input="emit('update', { id: $event.target.value })"
        placeholder="unique_id"
      />
    </div>

    <div class="field">
      <label>Название</label>
      <input 
        type="text" 
        :value="object.name" 
        @input="emit('update', { name: $event.target.value })"
        placeholder="Название объекта"
      />
    </div>

    <div class="field">
      <label>Тип</label>
      <select 
        :value="object.type" 
        @change="emit('update', { type: $event.target.value })"
      >
        <option value="sprite">Спрайт (2D)</option>
        <option value="model">Модель (3D)</option>
        <option value="decal">Декаль</option>
        <option value="particle">Частицы</option>
      </select>
    </div>

    <div class="field">
      <label>Ассет (URL или base64)</label>
      <input 
        type="text" 
        :value="object.asset" 
        @input="emit('update', { asset: $event.target.value })"
        placeholder="/images/tree.png"
      />
    </div>

    <div class="field">
      <label>Масштаб</label>
      <div class="range-input">
        <input 
          type="range" 
          :value="object.scale" 
          @input="emit('update', { scale: parseFloat($event.target.value) })"
          min="0.1"
          max="5"
          step="0.1"
        />
        <span class="range-value">{{ object.scale?.toFixed(1) }}</span>
      </div>
    </div>

    <div class="field checkbox" v-if="object.type === 'sprite'">
      <label>
        <input 
          type="checkbox" 
          :checked="object.billboard" 
          @change="emit('update', { billboard: $event.target.checked })"
        />
        Billboard (всегда лицом к камере)
      </label>
    </div>

    <div class="asset-preview" v-if="object.asset">
      <label>Превью ассета</label>
      <div class="preview-box">
        <img 
          v-if="isImage" 
          :src="object.asset" 
          alt="Preview"
          @error="imageError = true"
        />
        <span v-else class="preview-placeholder">3D модель</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  object: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['update'])

const imageError = ref(false)

const isImage = computed(() => {
  if (!props.object.asset) return false
  if (imageError.value) return false
  const asset = props.object.asset.toLowerCase()
  return asset.endsWith('.png') || 
         asset.endsWith('.jpg') || 
         asset.endsWith('.jpeg') ||
         asset.endsWith('.webp') ||
         asset.endsWith('.svg') ||
         asset.startsWith('data:image')
})
</script>

<style scoped>
.object-editor {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field label {
  font-size: 12px;
  color: #888;
  font-weight: 500;
}

.field.checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #ccc;
}

.field input[type="text"],
.field select {
  padding: 8px 10px;
  background: #1a1a3a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 13px;
}

.field input[type="text"]:focus,
.field select:focus {
  outline: none;
  border-color: #4a4a7a;
}

.range-input {
  display: flex;
  align-items: center;
  gap: 10px;
}

.range-input input[type="range"] {
  flex: 1;
  height: 4px;
  background: #2a2a4a;
  border-radius: 2px;
  appearance: none;
}

.range-input input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: #5a5a8a;
  border-radius: 50%;
  cursor: pointer;
}

.range-value {
  min-width: 40px;
  text-align: right;
  font-size: 13px;
  color: #aaa;
  font-family: monospace;
}

input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.asset-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.asset-preview label {
  font-size: 12px;
  color: #888;
  font-weight: 500;
}

.preview-box {
  width: 100%;
  height: 120px;
  background: #1a1a3a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.preview-box img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-placeholder {
  color: #666;
  font-size: 12px;
}
</style>
