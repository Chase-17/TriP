<template>
  <div class="profile-editor">
    <div class="field">
      <label>ID</label>
      <input 
        type="text" 
        :value="profile.id" 
        @input="emit('update', { id: $event.target.value })"
        placeholder="unique_id"
      />
    </div>

    <div class="field">
      <label>Название</label>
      <input 
        type="text" 
        :value="profile.name" 
        @input="emit('update', { name: $event.target.value })"
        placeholder="Название профиля"
      />
    </div>

    <!-- Terrains weights -->
    <div class="section">
      <div class="section-header">
        <span>Террейны (веса)</span>
      </div>
      <div class="weight-list">
        <div 
          v-for="t in terrains" 
          :key="t.id" 
          class="weight-item"
        >
          <span 
            class="weight-color" 
            :style="{ backgroundColor: t.color }"
          ></span>
          <span class="weight-name">{{ t.name }}</span>
          <input 
            type="number" 
            :value="profile.terrains?.[t.id] || 0"
            @input="updateWeight('terrains', t.id, $event.target.value)"
            min="0"
            max="1"
            step="0.1"
            class="weight-input"
          />
        </div>
      </div>
      <div class="weight-total">
        Сумма: {{ terrainTotal.toFixed(2) }}
        <span v-if="terrainTotal !== 1" class="warning">(рекомендуется 1.0)</span>
      </div>
    </div>

    <!-- Structures weights -->
    <div class="section">
      <div class="section-header">
        <span>Структуры (вероятность)</span>
      </div>
      <div class="weight-list">
        <div 
          v-for="s in structures" 
          :key="s.id" 
          class="weight-item"
        >
          <span class="weight-icon">🛤️</span>
          <span class="weight-name">{{ s.name }}</span>
          <input 
            type="number" 
            :value="profile.structures?.[s.id] || 0"
            @input="updateWeight('structures', s.id, $event.target.value)"
            min="0"
            max="1"
            step="0.05"
            class="weight-input"
          />
        </div>
        <div v-if="structures.length === 0" class="empty-notice">
          Нет структур
        </div>
      </div>
    </div>

    <!-- Objects density -->
    <div class="section">
      <div class="section-header">
        <span>Объекты (плотность)</span>
      </div>
      <div class="weight-list">
        <div 
          v-for="o in objects" 
          :key="o.id" 
          class="weight-item"
        >
          <span class="weight-icon">🌳</span>
          <span class="weight-name">{{ o.name }}</span>
          <input 
            type="number" 
            :value="profile.objects?.[o.id] || 0"
            @input="updateWeight('objects', o.id, $event.target.value)"
            min="0"
            max="1"
            step="0.05"
            class="weight-input"
          />
        </div>
        <div v-if="objects.length === 0" class="empty-notice">
          Нет объектов
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  profile: {
    type: Object,
    required: true,
  },
  terrains: {
    type: Array,
    default: () => [],
  },
  structures: {
    type: Array,
    default: () => [],
  },
  objects: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['update'])

const terrainTotal = computed(() => {
  const weights = props.profile.terrains || {}
  return Object.values(weights).reduce((sum, w) => sum + (parseFloat(w) || 0), 0)
})

function updateWeight(category, id, value) {
  const current = props.profile[category] || {}
  const numValue = parseFloat(value) || 0
  
  emit('update', {
    [category]: {
      ...current,
      [id]: numValue,
    }
  })
}
</script>

<style scoped>
.profile-editor {
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

.field input[type="text"] {
  padding: 8px 10px;
  background: #1a1a3a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 13px;
}

.field input[type="text"]:focus {
  outline: none;
  border-color: #4a4a7a;
}

.section {
  background: #1a1a3a;
  border-radius: 4px;
  overflow: hidden;
}

.section-header {
  padding: 8px 12px;
  background: #12122a;
  font-size: 12px;
  font-weight: 600;
  color: #aaa;
  border-bottom: 1px solid #2a2a4a;
}

.weight-list {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 150px;
  overflow-y: auto;
}

.weight-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  background: #16162a;
  border-radius: 3px;
}

.weight-color {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  border: 1px solid rgba(255,255,255,0.1);
  flex-shrink: 0;
}

.weight-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.weight-name {
  flex: 1;
  font-size: 12px;
  color: #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.weight-input {
  width: 60px;
  padding: 4px 6px;
  background: #1a1a3a;
  border: 1px solid #2a2a4a;
  border-radius: 3px;
  color: #e0e0e0;
  font-size: 12px;
  text-align: right;
}

.weight-input:focus {
  outline: none;
  border-color: #4a4a7a;
}

.weight-total {
  padding: 8px 12px;
  font-size: 12px;
  color: #888;
  border-top: 1px solid #2a2a4a;
}

.warning {
  color: #c84;
}

.empty-notice {
  padding: 12px;
  text-align: center;
  color: #666;
  font-size: 12px;
}
</style>
