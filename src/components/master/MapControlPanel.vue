<script setup>
/**
 * MapControlPanel - нижняя панель управления картой для мастера
 * Содержит: выбор карты, глобальные действия с картой
 * 
 * Террейн, выделение и инструменты редактирования 
 * вынесены в EditorToolsPanel (левая боковая панель)
 */
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useBattleMapStore } from '@/stores/battleMap'
import { safeStoreToRefs, safeUseStore } from '@/utils/safeStoreRefs'

const props = defineProps({
  editingMap: { type: Boolean, default: false },
  zoom: { type: Number, default: 1 }
})

const emit = defineEmits([
  'toggle-editing',
  'toggle-visibility',
  'delete-map',
  'create-map',
  'select-map',
  'center-camera'
])

const battleMapStore = safeUseStore(useBattleMapStore, 'battleMap')

const { maps = ref([]), activeMapId = ref(null), activeMap = ref(null) } = safeStoreToRefs(battleMapStore, 'battleMap')

const mapCount = computed(() => maps.value.length)
const isMapPublished = computed(() => activeMap.value?.visibility?.published ?? false)
</script>

<template>
  <div class="map-control-panel">
    <!-- Левая часть: выбор карты -->
    <div class="panel-left">
      <!-- Выбор карты -->
      <div class="map-selector">
        <select 
          v-if="mapCount > 0"
          :value="activeMapId"
          class="map-select"
          @change="emit('select-map', $event.target.value)"
        >
          <option 
            v-for="map in maps" 
            :key="map.id" 
            :value="map.id"
          >
            {{ map.name || 'Без названия' }}
          </option>
        </select>
        <button
          type="button"
          class="control-btn create-btn"
          @click.stop="emit('create-map')"
          title="Создать карту"
        >
          <Icon icon="mdi:plus" />
        </button>
      </div>
    </div>
    
    <!-- Центр: глобальные действия -->
    <div class="panel-center">
      <!-- Редактирование/Готово -->
      <button
        type="button"
        class="control-btn"
        :class="{ active: editingMap }"
        @click="emit('toggle-editing')"
      >
        <Icon :icon="editingMap ? 'mdi:check' : 'mdi:pencil'" />
        <span>{{ editingMap ? 'Готово' : 'Редактировать' }}</span>
      </button>
      
      <!-- Видимость -->
      <button
        v-if="activeMap"
        type="button"
        class="control-btn"
        :class="{ active: isMapPublished }"
        @click="emit('toggle-visibility')"
        :title="isMapPublished ? 'Скрыть от игроков' : 'Показать игрокам'"
      >
        <Icon :icon="isMapPublished ? 'mdi:eye' : 'mdi:eye-off'" />
        <span class="hide-mobile">{{ isMapPublished ? 'Видима' : 'Скрыта' }}</span>
      </button>
    </div>
    
    <!-- Правая часть: зум, центрирование и удаление -->
    <div class="panel-right">
      <!-- Индикатор масштаба -->
      <span class="zoom-indicator">{{ Math.round(zoom * 100) }}%</span>
      
      <button
        type="button"
        class="control-btn"
        title="Центрировать (0,0)"
        @click="emit('center-camera')"
      >
        <Icon icon="mdi:crosshairs-gps" />
      </button>
      
      <button
        v-if="activeMap"
        type="button"
        class="control-btn danger-btn"
        title="Удалить карту"
        @click="emit('delete-map')"
      >
        <Icon icon="mdi:delete" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.map-control-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
  position: relative;
  z-index: 20;
}

.panel-left,
.panel-center,
.panel-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.map-selector {
  display: flex;
  align-items: center;
}

.map-select {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  padding: 0.375rem 0.75rem;
  color: white;
  font-size: 0.875rem;
  min-width: 120px;
}

.map-select:focus {
  outline: none;
  border-color: rgba(56, 189, 248, 0.5);
}

.control-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(226, 232, 240, 0.9);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.control-btn.active {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.4);
  color: rgb(167, 243, 208);
}

.control-btn.create-btn:hover {
  background: rgba(56, 189, 248, 0.1);
  border-color: rgba(56, 189, 248, 0.3);
}

.control-btn.random-btn {
  color: rgba(251, 191, 36, 0.9);
}

.control-btn.random-btn:hover {
  background: rgba(251, 191, 36, 0.15);
  border-color: rgba(251, 191, 36, 0.3);
}

.control-btn.danger-btn {
  color: rgba(248, 113, 113, 0.9);
}

.control-btn.danger-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
}

/* Иконки */
.control-btn :deep(svg) {
  width: 1rem;
  height: 1rem;
}

/* Индикатор масштаба */
.zoom-indicator {
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.8);
  font-variant-numeric: tabular-nums;
}

/* Скрывать текст на маленьких экранах */
@media (max-width: 900px) {
  .hide-mobile {
    display: none;
  }
}
</style>
