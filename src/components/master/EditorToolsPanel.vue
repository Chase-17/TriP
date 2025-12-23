<script setup>
/**
 * EditorToolsPanel - левая выдвигающаяся панель инструментов редактирования для мастера
 * Содержит: режимы редактора, формы и режимы выделения, детальные настройки инструментов
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useBattleMapStore } from '@/stores/battleMap'
import { useTerrainStore } from '@/stores/terrain'
import { useFillProfileStore } from '@/stores/fillProfile'
import { useMapHistoryStore } from '@/stores/mapHistory'
import { SELECTION_SHAPES, SELECTION_MODES, SELECTION_BEHAVIORS } from '@/utils/hex/selection'
import { safeStoreToRefs, safeUseStore } from '@/utils/safeStoreRefs'

const props = defineProps({
  editingMap: { type: Boolean, default: false },
  editorMode: { type: String, default: 'select' },
  topOffset: { type: Number, default: 60 },
  selectedTerrain: { type: String, default: null },
  selectedHexCount: { type: Number, default: 0 }
})

const emit = defineEmits([
  'set-editor-mode',
  'toggle-editing',
  'select-terrain',
  'select-profile',
  'edit-profile',
  'fill-selection',
  'fill-profile',
  'delete-selection',
  'clear-selection',
  'undo',
  'redo'
])

const battleMapStore = safeUseStore(useBattleMapStore, 'battleMap')
const terrainStore = safeUseStore(useTerrainStore, 'terrain')
const fillProfileStore = safeUseStore(useFillProfileStore, 'fillProfile')
const mapHistoryStore = safeUseStore(useMapHistoryStore, 'mapHistory')
const { selection = ref(null), brush = ref(null) } = safeStoreToRefs(battleMapStore, 'battleMap')
const { canUndo = ref(false), canRedo = ref(false) } = safeStoreToRefs(mapHistoryStore, 'mapHistory')
const { allTerrains: terrains = ref([]) } = safeStoreToRefs(terrainStore, 'terrain')
const { sortedProfiles: profiles = ref([]), currentProfile = ref(null) } = safeStoreToRefs(fillProfileStore, 'fillProfile')

// Состояние панели
const panelExpanded = ref(true)
const showTerrainPalette = ref(false)
const terrainFilter = ref('')
const terrainDisplayMode = ref('name') // 'name' | 'cost' | 'visibility'
const profileFilter = ref('')
const selectionFillType = ref('terrain') // 'terrain' | 'profile' - тип заливки для выделения

// Типы рисования для кисти
const brushTypes = [
  { id: 'terrain', icon: 'mdi:terrain', label: 'Террейн' },
  { id: 'profile', icon: 'mdi:dice-multiple', label: 'Профиль' }
]

// Типы заливки для выделения (такие же как для кисти)
const fillTypes = [
  { id: 'terrain', icon: 'mdi:terrain', label: 'Террейн' },
  { id: 'profile', icon: 'mdi:dice-multiple', label: 'Профиль' }
]

// Получить цвет террейна по ID
const getTerrainColor = (terrainId) => {
  if (!terrainId) return 'rgba(100, 116, 139, 0.5)'
  const terrain = terrainStore.getTerrainById(terrainId)
  return terrain?.color || terrain?.fallbackColor || '#888'
}

// Фильтрованные профили
const filteredProfilesList = computed(() => {
  const list = profiles.value || []
  if (!profileFilter.value) return list
  const search = profileFilter.value.toLowerCase()
  return list.filter(p =>
    p.name.toLowerCase().includes(search) ||
    p.description?.toLowerCase().includes(search)
  )
})

// Фильтрованные террейны
const filteredTerrainsList = computed(() => {
  if (!terrainFilter.value) return terrains.value
  const search = terrainFilter.value.toLowerCase()
  return terrains.value.filter(t => 
    t.name.toLowerCase().includes(search) ||
    t.biome?.toLowerCase().includes(search) ||
    t.tags?.some(tag => tag.toLowerCase().includes(search))
  )
})

// Информация о текущем террейне
const currentTerrainInfo = computed(() => {
  if (!props.selectedTerrain) return { name: 'Выберите', color: '#888' }
  return terrainStore.getTerrainById(props.selectedTerrain) || { name: props.selectedTerrain, color: '#888' }
})

// Получение текста для отображения на тайле террейна
const getTerrainTileLabel = (terrain) => {
  switch (terrainDisplayMode.value) {
    case 'cost':
      return terrain.movementCost?.toString() || '?'
    case 'visibility':
      if (terrain.visibility === 'open') return '○'
      if (terrain.visibility === 'partial') return '◐'
      if (terrain.visibility === 'blocking') return '●'
      return '?'
    case 'name':
    default:
      return terrain.name
  }
}

// Режимы отображения тайлов
const displayModes = [
  { id: 'name', icon: 'mdi:format-title', label: 'Имя' },
  { id: 'cost', icon: 'mdi:run-fast', label: 'Ход' },
  { id: 'visibility', icon: 'mdi:eye', label: 'Обзор' }
]

// Режимы редактора (плитка для расширения)
const editorModes = [
  { id: 'select', icon: 'mdi:cursor-default', label: 'Выбор', description: 'Выделение областей' },
  { id: 'paint', icon: 'mdi:brush', label: 'Кисть', description: 'Рисование террейна' },
  { id: 'erase', icon: 'mdi:eraser', label: 'Ластик', description: 'Удаление гексов' },
  // Будущие режимы:
  // { id: 'objects', icon: 'mdi:pine-tree', label: 'Объекты', description: 'Размещение объектов' },
  // { id: 'tokens', icon: 'mdi:account-circle', label: 'Токены', description: 'Размещение токенов' },
]

// Конфигурация форм выделения
const selectionShapes = [
  { id: SELECTION_SHAPES.RECTANGLE, icon: 'mdi:rectangle-outline', label: 'Прямоугольник' },
  { id: SELECTION_SHAPES.CIRCLE, icon: 'mdi:circle-outline', label: 'Круг' },
  { id: SELECTION_SHAPES.HEXAGON, icon: 'mdi:hexagon-outline', label: 'Шестиугольник' },
  { id: SELECTION_SHAPES.LINE, icon: 'mdi:vector-line', label: 'Линия' }
]

// Конфигурация режимов выделения
const selectionModes = [
  { id: SELECTION_MODES.REPLACE, icon: 'mdi:selection', label: 'Новое', description: 'Заменить выделение' },
  { id: SELECTION_MODES.ADD, icon: 'mdi:selection-ellipse-arrow-inside', label: 'Добавить', description: 'Shift: добавить к выделению' },
  { id: SELECTION_MODES.SUBTRACT, icon: 'mdi:selection-remove', label: 'Вычесть', description: 'Alt: вычесть из выделения' }
]

// Конфигурация поведений выделения
const selectionBehaviors = [
  { id: SELECTION_BEHAVIORS.AGGRESSIVE, label: 'Все', description: 'Все гексы в геометрической области' },
  { id: SELECTION_BEHAVIORS.STANDARD, label: 'Стандарт', description: 'Все гексы в геометрической области' },
  { id: SELECTION_BEHAVIORS.PASSIVE, label: 'Связные', description: 'Только связные существующие гексы (flood-fill)' }
]

// Текущий режим (определяется модификаторами клавиш)
const activeModifiers = ref({ shift: false, alt: false })


// Эффективный режим с учётом модификаторов
const effectiveMode = computed(() => {
  if (activeModifiers.value.shift && activeModifiers.value.alt) {
    return null // Пересечение — не реализовано
  }
  if (activeModifiers.value.shift) {
    return SELECTION_MODES.ADD
  }
  if (activeModifiers.value.alt) {
    return SELECTION_MODES.SUBTRACT
  }
  // Всегда базовый режим — "новый"
  return SELECTION_MODES.REPLACE
})

// Синхронизация режима выделения с effectiveMode
watch(effectiveMode, (newMode) => {
  if (newMode && selection.value?.mode !== newMode) {
    battleMapStore.setSelectionMode(newMode)
  }
})

// Обработка клавиш
const handleKeyDown = (event) => {
  let changed = false
  if (event.key === 'Shift' && !activeModifiers.value.shift) {
    activeModifiers.value.shift = true
    changed = true
  }
  if (event.key === 'Alt' && !activeModifiers.value.alt) {
    activeModifiers.value.alt = true
    changed = true
  }
  // Если модификатор изменился, обновить режим
  if (changed && effectiveMode.value && selection.value?.mode !== effectiveMode.value) {
    battleMapStore.setSelectionMode(effectiveMode.value)
  }
}

const handleKeyUp = (event) => {
  let changed = false
  if (event.key === 'Shift' && activeModifiers.value.shift) {
    activeModifiers.value.shift = false
    changed = true
  }
  if (event.key === 'Alt' && activeModifiers.value.alt) {
    activeModifiers.value.alt = false
    changed = true
  }
  // Если модификатор изменился, обновить режим
  if (changed && effectiveMode.value && selection.value?.mode !== effectiveMode.value) {
    battleMapStore.setSelectionMode(effectiveMode.value)
  }
}

// Сброс модификаторов при потере фокуса окна (alt+tab)
const handleWindowBlur = () => {
  if (activeModifiers.value.shift || activeModifiers.value.alt) {
    activeModifiers.value.shift = false
    activeModifiers.value.alt = false
    // Восстановить базовый режим
    battleMapStore.setSelectionMode(SELECTION_MODES.REPLACE)
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('keyup', handleKeyUp)
  window.addEventListener('blur', handleWindowBlur)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('keyup', handleKeyUp)
  window.removeEventListener('blur', handleWindowBlur)
})

const togglePanel = () => {
  panelExpanded.value = !panelExpanded.value
}
</script>

<template>
  <div 
    class="editor-tools-panel"
    :class="{ expanded: panelExpanded, 'editing-active': editingMap }"
    :style="{ top: `${props.topOffset}px` }"
  >
    <!-- Хвостик для открытия/закрытия -->
    <button 
      class="panel-toggle"
      @click="togglePanel"
    >
      <Icon :icon="panelExpanded ? 'mdi:chevron-left' : 'mdi:chevron-right'" />
    </button>
    
    <!-- Содержимое панели -->
    <div class="panel-content">
            
      <!-- Режимы редактора (плитка для расширения) -->
      <div v-if="editingMap" class="panel-section">
        <div class="section-header">
          <Icon icon="mdi:tools" />
          <span>Инструмент</span>
        </div>
        <div class="section-content">
          <div class="tools-grid">
            <button
              v-for="mode in editorModes"
              :key="mode.id"
              type="button"
              class="tool-tile"
              :class="{ active: editorMode === mode.id }"
              :title="mode.description"
              @click="emit('set-editor-mode', mode.id)"
            >
              <Icon :icon="mode.icon" class="tool-icon" />
              <span class="tool-label">{{ mode.label }}</span>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Undo/Redo панель -->
      <div v-if="editingMap" class="panel-section undo-redo-section">
        <div class="section-content">
          <div class="undo-redo-buttons">
            <button
              type="button"
              class="undo-redo-btn"
              :class="{ disabled: !canUndo }"
              :disabled="!canUndo"
              title="Отменить (Ctrl+Z)"
              @click="emit('undo')"
            >
              <Icon icon="mdi:undo" />
              <span>Отмена</span>
            </button>
            <button
              type="button"
              class="undo-redo-btn"
              :class="{ disabled: !canRedo }"
              :disabled="!canRedo"
              title="Повторить (Ctrl+Y)"
              @click="emit('redo')"
            >
              <Icon icon="mdi:redo" />
              <span>Повтор</span>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Настройки выделения (только в режиме select) -->
      <template v-if="editingMap && editorMode === 'select'">
        <!-- Форма выделения -->
        <div class="panel-section">
          <div class="section-header">
            <Icon icon="mdi:shape-outline" />
            <span>Форма</span>
          </div>
          <div class="section-content">
            <div class="shape-grid">
              <button
                v-for="shape in selectionShapes"
                :key="shape.id"
                type="button"
                class="shape-btn"
                :class="{ active: selection?.shape === shape.id }"
                :title="shape.label"
                @click="battleMapStore.setSelectionShape(shape.id)"
              >
                <Icon :icon="shape.icon" />
              </button>
            </div>
          </div>
        </div>
        
        <!-- Режим выделения -->
        <div class="panel-section">
          <div class="section-header">
            <Icon icon="mdi:selection-multiple" />
            <span>Режим</span>
            <span v-if="activeModifiers.shift || activeModifiers.alt" class="modifier-hint">
              {{ activeModifiers.shift ? 'Shift' : '' }}{{ activeModifiers.shift && activeModifiers.alt ? '+' : '' }}{{ activeModifiers.alt ? 'Alt' : '' }}
            </span>
          </div>
          <div class="section-content">
            <div class="mode-list">
              <button
                v-for="mode in selectionModes"
                :key="mode.id"
                type="button"
                class="selection-mode-btn"
                :class="{ 
                  active: selection?.mode === mode.id,
                  'temp-active': effectiveMode === mode.id && effectiveMode !== selection?.mode
                }"
                :title="mode.description"
                @click="battleMapStore.setSelectionMode(mode.id)"
              >
                <Icon :icon="mode.icon" />
                <span>{{ mode.label }}</span>
              </button>
            </div>
            <p class="hint-text">Shift: добавить • Alt: вычесть</p>
          </div>
        </div>
        
        <!-- Поведение выделения (временно скрыто)
        <div class="panel-section">
          <div class="section-header">
            <Icon icon="mdi:select-group" />
            <span>Поведение</span>
          </div>
          <div class="section-content">
            <div class="behavior-list">
              <button
                v-for="beh in selectionBehaviors"
                :key="beh.id"
                type="button"
                class="behavior-btn"
                :class="{ active: selection?.behavior === beh.id }"
                :title="beh.description"
                @click="battleMapStore.setSelectionBehavior(beh.id)"
              >
                {{ beh.label }}
              </button>
            </div>
            <p class="hint-text">{{ selectionBehaviors.find(b => b.id === selection?.behavior)?.description }}</p>
          </div>
        </div>
        -->
        
        <!-- Ширина линии (только для формы LINE) -->
        <div v-if="selection?.shape === SELECTION_SHAPES.LINE" class="panel-section">
          <div class="section-header">
            <Icon icon="mdi:arrow-expand-horizontal" />
            <span>Ширина линии</span>
            <span class="value-badge">{{ selection?.lineWidth ?? 1 }}</span>
          </div>
          <div class="section-content">
            <input
              type="range"
              min="1"
              max="5"
              :value="selection?.lineWidth ?? 1"
              class="width-slider"
              @input="battleMapStore.setSelectionLineWidth(Number($event.target.value))"
            />
            <div class="slider-labels">
              <span>1</span>
              <span>5</span>
            </div>
          </div>
        </div>
        
        <!-- Действия с выделением -->
        <div v-if="selectedHexCount > 0" class="panel-section selection-actions">
          <div class="section-header">
            <Icon icon="mdi:hexagon-multiple" />
            <span>Выделено: {{ selectedHexCount }}</span>
          </div>
          <div class="section-content">
            <!-- Переключатель типа заливки (как для кисти) -->
            <div class="section-header sub-header">
              <Icon icon="mdi:format-color-fill" />
              <span>Заливать</span>
            </div>
            <div class="brush-type-list">
              <button
                v-for="ft in fillTypes"
                :key="ft.id"
                type="button"
                class="brush-type-btn"
                :class="{ active: selectionFillType === ft.id }"
                @click="selectionFillType = ft.id"
              >
                <Icon :icon="ft.icon" />
                <span>{{ ft.label }}</span>
              </button>
            </div>
            
            <!-- Кнопки действий -->
            <div class="action-row" style="margin-top: 0.5rem;">
              <button
                type="button"
                class="action-btn primary-btn"
                :title="selectionFillType === 'terrain' ? 'Залить террейном' : 'Залить профилем'"
                @click="selectionFillType === 'terrain' ? emit('fill-selection') : emit('fill-profile')"
              >
                <Icon icon="mdi:format-color-fill" />
                <span>Залить</span>
              </button>
              <button
                type="button"
                class="action-btn danger-btn"
                title="Удалить выбранные гексы"
                @click="emit('delete-selection')"
              >
                <Icon icon="mdi:delete" />
              </button>
              <button
                type="button"
                class="action-btn"
                title="Снять выделение"
                @click="emit('clear-selection')"
              >
                <Icon icon="mdi:close" />
              </button>
            </div>
          </div>
        </div>
      </template>
      
      <!-- Настройки кисти (для режима paint) -->
      <template v-if="editingMap && editorMode === 'paint'">
        <!-- Размер кисти -->
        <div class="panel-section">
          <div class="section-header">
            <Icon icon="mdi:radius-outline" />
            <span>Размер кисти</span>
            <span class="value-badge">{{ brush?.size ?? 1 }}</span>
          </div>
          <div class="section-content">
            <input
              type="range"
              min="1"
              max="5"
              :value="brush?.size ?? 1"
              class="width-slider"
              @input="battleMapStore.setBrushSize(Number($event.target.value))"
            />
            <div class="slider-labels">
              <span>1</span>
              <span>5</span>
            </div>
          </div>
        </div>
        
        <!-- Тип рисования -->
        <div class="panel-section">
          <div class="section-header">
            <Icon icon="mdi:brush-variant" />
            <span>Рисовать</span>
          </div>
          <div class="section-content">
            <div class="brush-type-list">
              <button
                v-for="bt in brushTypes"
                :key="bt.id"
                type="button"
                class="brush-type-btn"
                :class="{ active: (brush?.type ?? 'terrain') === bt.id }"
                @click="battleMapStore.setBrushType(bt.id)"
              >
                <Icon :icon="bt.icon" />
                <span>{{ bt.label }}</span>
              </button>
            </div>
          </div>
        </div>
      </template>
      
      <!-- Настройки ластика (для режима erase) -->
      <template v-if="editingMap && editorMode === 'erase'">
        <div class="panel-section">
          <div class="section-header">
            <Icon icon="mdi:radius-outline" />
            <span>Размер ластика</span>
            <span class="value-badge">{{ brush?.size ?? 1 }}</span>
          </div>
          <div class="section-content">
            <input
              type="range"
              min="1"
              max="5"
              :value="brush?.size ?? 1"
              class="width-slider"
              @input="battleMapStore.setBrushSize(Number($event.target.value))"
            />
            <div class="slider-labels">
              <span>1</span>
              <span>5</span>
            </div>
          </div>
        </div>
      </template>
      
      <!-- Выбор террейна (для paint с type=terrain или select с fillType=terrain) -->
      <div v-if="editingMap && ((editorMode === 'paint' && (brush?.type ?? 'terrain') === 'terrain') || (editorMode === 'select' && selectionFillType === 'terrain'))" class="panel-section terrain-section">
        <div class="section-header">
          <Icon icon="mdi:palette" />
          <span>Террейн</span>
          <span class="terrain-count">{{ filteredTerrainsList.length }}</span>
        </div>
        <div class="section-content terrain-content">
          <!-- Переключатель режима отображения -->
          <div class="terrain-display-modes">
            <button
              v-for="mode in displayModes"
              :key="mode.id"
              type="button"
              class="display-mode-btn"
              :class="{ active: terrainDisplayMode === mode.id }"
              :title="mode.label"
              @click="terrainDisplayMode = mode.id"
            >
              <Icon :icon="mode.icon" />
            </button>
          </div>
          <!-- Фильтр -->
          <div class="terrain-filter">
            <Icon icon="mdi:magnify" class="filter-icon" />
            <input
              v-model="terrainFilter"
              type="text"
              placeholder="Поиск..."
              class="filter-input"
            />
            <button 
              v-if="terrainFilter" 
              class="filter-clear" 
              @click="terrainFilter = ''"
            >
              <Icon icon="mdi:close" />
            </button>
          </div>
          <!-- Компактная плиточная палитра террейнов -->
          <div class="terrain-grid-compact">
            <button
              v-for="terrain in filteredTerrainsList"
              :key="terrain.id"
              type="button"
              class="terrain-tile-compact"
              :class="{ selected: selectedTerrain === terrain.id }"
              :title="`${terrain.name} • Ход: ${terrain.movementCost} • ${terrain.visibility === 'open' ? 'Открытая' : terrain.visibility === 'partial' ? 'Частичная' : 'Блокирующая'}`"
              @click="emit('select-terrain', terrain.id)"
            >
              <span 
                class="tile-bg" 
                :style="{ backgroundColor: terrain.fallbackColor || terrain.color }"
              >
                <span class="tile-label">{{ getTerrainTileLabel(terrain) }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Выбор профиля (для paint с type=profile или select с fillType=profile) -->
      <div v-if="editingMap && ((editorMode === 'paint' && (brush?.type ?? 'terrain') === 'profile') || (editorMode === 'select' && selectionFillType === 'profile'))" class="panel-section profile-section">
        <div class="section-header">
          <Icon icon="mdi:dice-multiple" />
          <span>Профиль</span>
          <span class="terrain-count">{{ filteredProfilesList.length }}</span>
        </div>
        <div class="section-content profile-content">
          <!-- Фильтр -->
          <div class="terrain-filter">
            <Icon icon="mdi:magnify" class="filter-icon" />
            <input
              v-model="profileFilter"
              type="text"
              placeholder="Поиск..."
              class="filter-input"
            />
            <button 
              v-if="profileFilter" 
              class="filter-clear" 
              @click="profileFilter = ''"
            >
              <Icon icon="mdi:close" />
            </button>
          </div>
          
          <!-- Список профилей в виде карточек -->
          <div class="profile-list">
            <div
              v-for="profile in filteredProfilesList"
              :key="profile.id"
              class="profile-card"
              :class="{ selected: battleMapStore.selectedProfileId === profile.id }"
            >
              <button
                type="button"
                class="profile-card-main"
                @click="emit('select-profile', profile.id); battleMapStore.setSelectedProfile(profile.id); fillProfileStore.selectProfile(profile.id)"
              >
                <div class="profile-card-header">
                  <Icon icon="mdi:dice-multiple" class="profile-icon" />
                  <span class="profile-name">{{ profile.name }}</span>
                </div>
                <div class="profile-card-meta">
                  <span class="profile-base">
                    <span 
                      class="base-color-dot" 
                      :style="{ backgroundColor: terrainStore.getTerrainById(profile.baseTerrain)?.color || '#888' }"
                    ></span>
                    {{ terrainStore.getTerrainById(profile.baseTerrain)?.name || profile.baseTerrain }}
                  </span>
                  <span class="profile-layers">+{{ profile.layers?.length || 0 }} сл.</span>
                </div>
              </button>
              <button
                type="button"
                class="profile-edit-btn"
                title="Редактировать профиль"
                @click="fillProfileStore.selectProfile(profile.id); emit('edit-profile', profile.id)"
              >
                <Icon icon="mdi:pencil" />
              </button>
            </div>
          </div>
          
          <!-- Создать новый профиль -->
          <button 
            type="button" 
            class="create-profile-btn"
            @click="fillProfileStore.createProfile({ name: 'Новый профиль' })"
          >
            <Icon icon="mdi:plus" />
            <span>Новый профиль</span>
          </button>
        </div>
      </div>
      
      <!-- Подсказка если не в режиме редактирования -->
      <div v-if="!editingMap" class="empty-state">
        <Icon icon="mdi:pencil-off" class="empty-icon" />
        <p>Нажмите "Редактировать" для доступа к инструментам</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-tools-panel {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 48px;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(8px);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: row;
  z-index: 25;
  transition: width 0.2s ease;
}

.editor-tools-panel.expanded {
  width: 280px;
}

.panel-toggle {
  position: absolute;
  right: -24px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 48px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-left: none;
  border-radius: 0 8px 8px 0;
  color: rgba(148, 163, 184, 0.8);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.panel-toggle:hover {
  background: rgba(30, 41, 59, 0.95);
  color: white;
}

.panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

.panel-content::-webkit-scrollbar {
  display: none; /* Chrome/Safari/Opera */
}

.panel-header {
  padding: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.panel-header h3 {
  font-size: 0.875rem;
  font-weight: 500;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(226, 232, 240, 0.9);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.edit-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.edit-toggle-btn.active {
  background: rgba(16, 185, 129, 0.2);
  border-color: rgba(16, 185, 129, 0.4);
  color: rgb(167, 243, 208);
}

.panel-section {
  padding: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

/* Undo/Redo секция */
.undo-redo-section {
  padding: 0.5rem 0.75rem;
}

.undo-redo-buttons {
  display: flex;
  gap: 0.5rem;
}

.undo-redo-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(226, 232, 240, 0.9);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.undo-redo-btn:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.undo-redo-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.undo-redo-btn :deep(svg) {
  width: 1rem;
  height: 1rem;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.8);
  margin-bottom: 0.5rem;
}

.section-header :deep(svg) {
  width: 0.875rem;
  height: 0.875rem;
}

.modifier-hint {
  margin-left: auto;
  padding: 0.125rem 0.375rem;
  background: rgba(251, 191, 36, 0.2);
  color: rgb(251, 191, 36);
  border-radius: 0.25rem;
  font-size: 0.625rem;
}

.value-badge {
  margin-left: auto;
  padding: 0.125rem 0.375rem;
  background: rgba(56, 189, 248, 0.2);
  color: rgb(125, 211, 252);
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

/* Режимы редактора */
.mode-grid {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(148, 163, 184, 0.8);
  cursor: pointer;
  transition: all 0.15s;
}

.mode-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: white;
}

.mode-btn.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: rgb(125, 211, 252);
}

.mode-icon {
  width: 1.125rem;
  height: 1.125rem;
}

.mode-label {
  font-size: 0.75rem;
  white-space: nowrap;
}

/* Плитка инструментов */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.375rem;
}

.tool-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.5rem 0.25rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(148, 163, 184, 0.8);
  cursor: pointer;
  transition: all 0.15s;
}

.tool-tile:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  color: white;
}

.tool-tile.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.5);
  color: rgb(125, 211, 252);
}

.tool-icon {
  width: 1.25rem;
  height: 1.25rem;
}

.tool-label {
  font-size: 0.625rem;
  white-space: nowrap;
}

/* Формы выделения */
.shape-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.25rem;
}

.shape-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  color: rgba(148, 163, 184, 0.8);
  cursor: pointer;
  transition: all 0.15s;
}

.shape-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: white;
}

.shape-btn.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: rgb(125, 211, 252);
}

.shape-btn :deep(svg) {
  width: 1.25rem;
  height: 1.25rem;
}

/* Режимы выделения */
.mode-list {
  display: flex;
  gap: 0.25rem;
}

.selection-mode-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  color: rgba(148, 163, 184, 0.8);
  font-size: 0.625rem;
  cursor: pointer;
  transition: all 0.15s;
}

.selection-mode-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: white;
}

.selection-mode-btn.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: rgb(125, 211, 252);
}

.selection-mode-btn.temp-active {
  background: rgba(251, 191, 36, 0.15);
  border-color: rgba(251, 191, 36, 0.4);
  color: rgb(253, 224, 71);
}

.selection-mode-btn :deep(svg) {
  width: 1rem;
  height: 1rem;
}

/* Поведение выделения */
.behavior-list {
  display: flex;
  gap: 0.25rem;
}

.behavior-btn {
  flex: 1;
  padding: 0.375rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  color: rgba(148, 163, 184, 0.8);
  font-size: 0.625rem;
  cursor: pointer;
  transition: all 0.15s;
}

.behavior-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: white;
}

.behavior-btn.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: rgb(125, 211, 252);
}

/* Подсказки */
.hint-text {
  font-size: 0.625rem;
  color: rgba(100, 116, 139, 0.8);
  margin-top: 0.375rem;
  text-align: center;
}

/* Слайдер ширины */
.width-slider {
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  appearance: none;
  cursor: pointer;
}

.width-slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: rgb(56, 189, 248);
  border-radius: 50%;
  cursor: pointer;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.625rem;
  color: rgba(100, 116, 139, 0.6);
  margin-top: 0.25rem;
}

/* Пустое состояние */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  text-align: center;
  color: rgba(100, 116, 139, 0.6);
}

.empty-icon {
  width: 2rem;
  height: 2rem;
  margin-bottom: 0.5rem;
  opacity: 0.5;
}

.empty-state p {
  font-size: 0.75rem;
  line-height: 1.4;
}

/* Скрытие контента когда панель свёрнута */
.editor-tools-panel:not(.expanded) .panel-content {
  display: none;
}

/* Действия с выделением */
.selection-actions .section-header {
  color: rgb(125, 211, 252);
}

/* Переключатель типа заливки */
.fill-type-switcher {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.fill-type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  color: rgba(148, 163, 184, 0.7);
  font-size: 0.6875rem;
  cursor: pointer;
  transition: all 0.15s;
}

.fill-type-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}

.fill-type-btn.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: rgb(125, 211, 252);
}

.fill-type-btn :deep(svg) {
  width: 0.875rem;
  height: 0.875rem;
}

/* Палитра заливки */
.fill-palette {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.375rem;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
}

.palette-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.375rem;
}

.current-selection {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.6875rem;
  color: rgba(226, 232, 240, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terrain-dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 0.125rem;
  flex-shrink: 0;
}

.profile-icon {
  width: 0.75rem;
  height: 0.75rem;
  color: rgba(251, 191, 36, 0.8);
}

.edit-profile-btn {
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(148, 163, 184, 0.6);
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.edit-profile-btn:hover {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
}

.edit-profile-btn :deep(svg) {
  width: 0.75rem;
  height: 0.75rem;
}

/* Мини-сетка террейнов */
.terrain-mini-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.25rem;
}

.terrain-mini-tile {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  border: 2px solid transparent;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0.125rem;
}

.terrain-mini-tile:hover {
  border-color: rgba(255, 255, 255, 0.3);
}

.terrain-mini-tile.selected {
  border-color: #38bdf8;
}

.terrain-mini-tile .terrain-color {
  width: 100%;
  height: 100%;
  border-radius: 0.125rem;
}

.terrain-mini-tile.more-btn {
  color: rgba(148, 163, 184, 0.6);
}

.terrain-mini-tile.more-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

/* Мини-сетка профилей */
.profile-mini-grid {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 120px;
  overflow-y: auto;
}

.profile-mini-card {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.profile-mini-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
}

.profile-mini-card.selected {
  background: rgba(251, 191, 36, 0.1);
  border-color: rgba(251, 191, 36, 0.4);
}

.profile-base-dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 0.125rem;
  flex-shrink: 0;
}

.profile-mini-card .profile-name {
  font-size: 0.6875rem;
  color: rgba(226, 232, 240, 0.8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-mini-card.selected .profile-name {
  color: rgba(251, 191, 36, 0.9);
}

.profile-mini-card.more-btn {
  justify-content: center;
  color: rgba(148, 163, 184, 0.6);
}

.profile-mini-card.more-btn:hover {
  color: white;
}

/* Ряд кнопок действий */
.action-row {
  display: flex;
  gap: 0.25rem;
}

.action-row .action-btn {
  flex-direction: row;
  padding: 0.5rem 0.75rem;
}

.action-row .action-btn.primary-btn {
  flex: 1;
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.3);
  color: rgb(125, 211, 252);
}

.action-row .action-btn.primary-btn:hover {
  background: rgba(56, 189, 248, 0.25);
}

.action-row .action-btn :deep(svg) {
  width: 0.875rem;
  height: 0.875rem;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.25rem;
}

.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  color: rgba(148, 163, 184, 0.8);
  font-size: 0.625rem;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.05);
  color: white;
}

.action-btn :deep(svg) {
  width: 1rem;
  height: 1rem;
}

.action-btn.fill-btn {
  color: rgba(56, 189, 248, 0.9);
}

.action-btn.fill-btn:hover {
  background: rgba(56, 189, 248, 0.1);
  border-color: rgba(56, 189, 248, 0.3);
}

.action-btn.profile-fill-btn {
  color: rgba(251, 191, 36, 0.9);
}

.action-btn.profile-fill-btn:hover {
  background: rgba(251, 191, 36, 0.1);
  border-color: rgba(251, 191, 36, 0.3);
}

.action-btn.profile-fill-btn.has-profile {
  border-color: rgba(251, 191, 36, 0.4);
}

.action-btn.profile-fill-btn span {
  max-width: 5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-btn.danger-btn {
  color: rgba(248, 113, 113, 0.9);
}

.action-btn.danger-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
}

/* Секция террейна */
.terrain-section {
  background: rgba(255, 255, 255, 0.02);
}

/* Плиточная палитра террейнов */
.terrain-tiles {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 250px;
  overflow-y: auto;
}

.terrain-tile {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.375rem;
  color: rgba(226, 232, 240, 0.9);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.terrain-tile:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.terrain-tile.selected {
  background: rgba(56, 189, 248, 0.1);
  border-color: rgba(56, 189, 248, 0.5);
}

.tile-color {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.25rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
}

.tile-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.tile-name {
  font-size: 0.75rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-stats {
  display: flex;
  gap: 0.5rem;
  font-size: 0.625rem;
  color: rgba(148, 163, 184, 0.7);
}

.tile-stats .stat {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}

.tile-stats .stat :deep(svg) {
  width: 0.75rem;
  height: 0.75rem;
}

.tile-stats .stat.open {
  color: rgba(74, 222, 128, 0.8);
}

.tile-stats .stat.partial {
  color: rgba(251, 191, 36, 0.8);
}

.tile-stats .stat.blocking {
  color: rgba(248, 113, 113, 0.8);
}

/* Компактная сетка террейнов */
.terrain-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgba(255, 255, 255, 0.02);
}

.terrain-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.terrain-count {
  margin-left: auto;
  padding: 0.125rem 0.375rem;
  background: rgba(56, 189, 248, 0.15);
  color: rgb(125, 211, 252);
  border-radius: 0.25rem;
  font-size: 0.625rem;
}

.terrain-filter {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  margin-bottom: 0.5rem;
}

.filter-icon {
  width: 0.875rem;
  height: 0.875rem;
  color: rgba(148, 163, 184, 0.6);
  flex-shrink: 0;
}

.filter-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: rgba(226, 232, 240, 0.9);
  font-size: 0.75rem;
  min-width: 0;
}

.filter-input::placeholder {
  color: rgba(148, 163, 184, 0.5);
}

.filter-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  background: transparent;
  border: none;
  color: rgba(148, 163, 184, 0.6);
  cursor: pointer;
  padding: 0;
}

.filter-clear:hover {
  color: white;
}

.terrain-grid-compact {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.25rem;
  overflow-y: auto;
  align-content: start;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.terrain-grid-compact::-webkit-scrollbar {
  display: none;
}

.terrain-tile-compact {
  aspect-ratio: 1;
  padding: 0;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
  overflow: hidden;
}

.terrain-tile-compact:hover {
  border-color: rgba(255, 255, 255, 0.4);
  transform: scale(1.05);
}

.terrain-tile-compact.selected {
  border-color: rgba(56, 189, 248, 0.8);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.3);
}

.tile-bg {
  width: 100%;
  height: 100%;
  border-radius: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.tile-label {
  font-size: 0.625rem;
  font-weight: 600;
  color: white;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8), 0 0 2px rgba(0, 0, 0, 0.9);
  text-align: center;
  padding: 0.125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  line-height: 1.2;
}

/* Переключатель режимов отображения */
.terrain-display-modes {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
}

.display-mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.375rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  color: rgba(148, 163, 184, 0.7);
  cursor: pointer;
  transition: all 0.15s;
}

.display-mode-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.display-mode-btn.active {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.5);
  color: rgba(56, 189, 248, 1);
}

/* Старые стили террейна (для обратной совместимости) */
.current-terrain-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(226, 232, 240, 0.9);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.current-terrain-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.terrain-preview {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 0.25rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
}

.terrain-name {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-icon {
  width: 1rem;
  height: 1rem;
  opacity: 0.6;
  flex-shrink: 0;
}

.terrain-palette {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  max-height: 150px;
  overflow-y: auto;
}

.terrain-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.25rem;
}

.terrain-item {
  width: 100%;
  aspect-ratio: 1;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.terrain-item:hover {
  border-color: rgba(255, 255, 255, 0.4);
  transform: scale(1.1);
}

.terrain-item.selected {
  border-color: rgb(56, 189, 248);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.3);
}

/* Кнопки типа кисти */
.brush-type-list {
  display: flex;
  gap: 0.25rem;
}

/* Подзаголовок внутри секции */
.section-header.sub-header {
  font-size: 0.6875rem;
  padding: 0;
  margin-bottom: 0.375rem;
  color: rgba(148, 163, 184, 0.7);
}

.section-header.sub-header :deep(svg) {
  width: 0.75rem;
  height: 0.75rem;
}

.brush-type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(148, 163, 184, 0.8);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.brush-type-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.brush-type-btn.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.5);
  color: rgba(56, 189, 248, 1);
}

/* Секция профилей */
.profile-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.profile-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
  min-height: 0;
}

.profile-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.profile-list::-webkit-scrollbar {
  display: none;
}

.profile-card {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.5rem;
  transition: all 0.15s;
  overflow: hidden;
}

.profile-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.profile-card.selected {
  background: rgba(56, 189, 248, 0.1);
  border-color: rgba(56, 189, 248, 0.5);
}

.profile-card-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: inherit;
  min-width: 0;
}

.profile-edit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  background: rgba(255, 255, 255, 0.03);
  border: none;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(148, 163, 184, 0.5);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.profile-edit-btn:hover {
  background: rgba(56, 189, 248, 0.2);
  color: rgba(56, 189, 248, 1);
}

.profile-card-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.profile-icon {
  width: 1rem;
  height: 1rem;
  color: rgba(148, 163, 184, 0.7);
  flex-shrink: 0;
}

.profile-card.selected .profile-icon {
  color: rgba(56, 189, 248, 0.9);
}

.profile-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(226, 232, 240, 0.95);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.6875rem;
  color: rgba(148, 163, 184, 0.6);
}

.profile-base {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.base-color-dot {
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
}

.profile-layers {
  opacity: 0.7;
}

.create-profile-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem;
  background: rgba(56, 189, 248, 0.1);
  border: 1px dashed rgba(56, 189, 248, 0.3);
  border-radius: 0.375rem;
  color: rgba(56, 189, 248, 0.9);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.create-profile-btn:hover {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.5);
}
</style>
