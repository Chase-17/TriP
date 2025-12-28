<template>
  <div class="structure-editor">
    <div class="field">
      <label>ID</label>
      <input 
        type="text" 
        :value="structure.id" 
        @input="emit('update', { id: $event.target.value })"
        placeholder="unique_id"
      />
    </div>

    <div class="field">
      <label>Название</label>
      <input 
        type="text" 
        :value="structure.name" 
        @input="emit('update', { name: $event.target.value })"
        placeholder="Название структуры"
      />
    </div>

    <div class="field">
      <label>Тип</label>
      <select 
        :value="structure.type" 
        @change="emit('update', { type: $event.target.value })"
      >
        <option value="path">Путь (path)</option>
        <option value="area">Область (area)</option>
        <option value="point">Точка (point)</option>
      </select>
    </div>

    <div class="field">
      <label>Террейн</label>
      <select 
        :value="structure.terrainId" 
        @change="emit('update', { terrainId: $event.target.value })"
      >
        <option :value="null">-- Не выбран --</option>
        <option 
          v-for="t in terrains" 
          :key="t.id" 
          :value="t.id"
        >
          {{ t.name }}
        </option>
      </select>
    </div>

    <div class="field" v-if="structure.type === 'path'">
      <label>Ширина (гексы)</label>
      <div class="range-input">
        <input 
          type="range" 
          :value="structure.width" 
          @input="emit('update', { width: parseInt($event.target.value) })"
          min="1"
          max="5"
          step="1"
        />
        <span class="range-value">{{ structure.width }}</span>
      </div>
    </div>

    <div class="field">
      <label>Может пересекать</label>
      <div class="checkbox-list">
        <label v-for="t in terrains" :key="t.id" class="checkbox-item">
          <input 
            type="checkbox" 
            :checked="structure.rules?.canCross?.includes(t.id)"
            @change="toggleCanCross(t.id, $event.target.checked)"
          />
          {{ t.name }}
        </label>
      </div>
    </div>

    <div class="field checkbox">
      <label>
        <input 
          type="checkbox" 
          :checked="structure.rules?.snapToGrid" 
          @change="updateRule('snapToGrid', $event.target.checked)"
        />
        Привязка к сетке
      </label>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  structure: {
    type: Object,
    required: true,
  },
  terrains: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update'])

function toggleCanCross(terrainId, checked) {
  const current = props.structure.rules?.canCross || []
  let newList
  if (checked) {
    newList = [...current, terrainId]
  } else {
    newList = current.filter(id => id !== terrainId)
  }
  emit('update', { 
    rules: { 
      ...props.structure.rules, 
      canCross: newList 
    } 
  })
}

function updateRule(key, value) {
  emit('update', { 
    rules: { 
      ...props.structure.rules, 
      [key]: value 
    } 
  })
}
</script>

<style scoped>
.structure-editor {
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

.checkbox-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px;
  background: #1a1a3a;
  border-radius: 4px;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #aaa;
  cursor: pointer;
}

input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
}
</style>
