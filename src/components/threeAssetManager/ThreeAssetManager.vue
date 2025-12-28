<template>
  <div class="three-asset-manager" ref="containerRef">
    <!-- Left Panel: Selection -->
    <div 
      class="panel panel-left"
      :style="{ width: leftPanelStyle }"
    >
      <!-- Tabs -->
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          :class="['tab', { active: store.activeTab === tab.id }]"
          @click="store.setActiveTab(tab.id)"
          :title="tab.label"
        >
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-label">{{ tab.label }}</span>
        </button>
      </div>

      <!-- Search & Filters -->
      <div class="search-bar">
        <input 
          type="text" 
          v-model="searchQuery" 
          placeholder="Поиск..."
          class="search-input"
        />
        <button class="btn-add" @click="store.addItem()" title="Добавить">
          +
        </button>
      </div>

      <!-- Terrain Grid (tile view) -->
      <div class="selection-grid" v-if="store.activeTab === 'terrains'">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          :class="['grid-item', { selected: store.selectedItemId === item.id }]"
          @click="store.selectItem(item.id)"
          :title="item.name"
        >
          <div 
            class="grid-item-preview" 
            :style="{ backgroundColor: item.previewColor || item.color || '#444' }"
          >
            <span class="grid-item-layers">{{ item.layers?.length || 0 }}</span>
          </div>
          <span class="grid-item-name">{{ item.name }}</span>
        </div>
        <div v-if="filteredItems.length === 0" class="empty-grid">
          Ничего не найдено
        </div>
      </div>

      <!-- List View for other types -->
      <div class="selection-list" v-else>
        <div
          v-for="item in filteredItems"
          :key="item.id"
          :class="['list-item', { selected: store.selectedItemId === item.id }]"
          @click="store.selectItem(item.id)"
        >
          <span 
            v-if="item.color" 
            class="item-color" 
            :style="{ backgroundColor: item.color }"
          ></span>
          <span class="item-name">{{ item.name }}</span>
        </div>
        <div v-if="filteredItems.length === 0" class="empty-list">
          Ничего не найдено
        </div>
      </div>
    </div>

    <!-- Left Resize Handle -->
    <div 
      class="resize-handle"
      @mousedown="startResize('left', $event)"
    ></div>

    <!-- Center Panel: Preview -->
    <div class="panel panel-center">
      <div class="preview-header">
        <span>Превью</span>
        <div class="preview-controls">
          <!-- Paint mode toggle -->
          <button 
            v-if="store.activeTab === 'terrains'"
            :class="['btn-paint', { active: paintMode }]" 
            @click="togglePaintMode"
            :title="paintMode ? 'Выключить режим рисования' : 'Включить режим рисования'"
          >
            🖌️
          </button>
          <!-- Current brush indicator (just color swatch) -->
          <span 
            v-if="paintMode && currentPaintTerrain"
            class="brush-color-indicator"
            :title="'Кисть: ' + currentPaintTerrain.name"
            :style="{ backgroundColor: currentPaintTerrain.previewColor || currentPaintTerrain.color || '#666' }"
          ></span>
          <button 
            v-if="paintMode" 
            class="btn-clear"
            @click="clearPaintedMap" 
            title="Очистить карту"
          >
            🗑️
          </button>
          <!-- Map Templates -->
          <div v-if="paintMode" class="template-dropdown">
            <button 
              class="btn-templates"
              @click="showTemplateMenu = !showTemplateMenu"
              title="Шаблоны карт"
            >
              📁
            </button>
            <div v-if="showTemplateMenu" class="template-menu">
              <div class="template-menu-header">
                <span>Шаблоны карт</span>
                <button @click="showTemplateMenu = false" class="btn-close">×</button>
              </div>
              <!-- Save new template -->
              <div class="template-save-form">
                <input 
                  v-model="newTemplateName" 
                  type="text" 
                  placeholder="Название..." 
                  @keydown.enter="saveCurrentMapAsTemplate"
                />
                <button @click="saveCurrentMapAsTemplate" title="Сохранить">💾</button>
              </div>
              <!-- Template list -->
              <div class="template-list" v-if="mapTemplates.length > 0">
                <div 
                  v-for="template in mapTemplates" 
                  :key="template.id" 
                  class="template-item"
                >
                  <template v-if="editingTemplateId === template.id">
                    <input 
                      type="text" 
                      :value="template.name"
                      @blur="renameTemplate(template.id, $event.target.value)"
                      @keydown.enter="renameTemplate(template.id, $event.target.value)"
                      @keydown.esc="editingTemplateId = null"
                      class="template-name-input"
                      ref="templateNameInput"
                      autofocus
                    />
                  </template>
                  <template v-else>
                    <span class="template-name" @click="loadTemplate(template)">
                      {{ template.name }}
                    </span>
                    <div class="template-actions">
                      <button @click="startEditingTemplate(template.id)" title="Переименовать">✏️</button>
                      <button @click="deleteTemplate(template.id)" title="Удалить">🗑️</button>
                    </div>
                  </template>
                </div>
              </div>
              <div v-else class="template-empty">
                Нет сохранённых шаблонов
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="preview-container" ref="previewContainer">
        <ThreePreview
          :terrain="paintMode ? null : (store.activeTab === 'terrains' ? store.selectedItem : null)"
          :structure="store.activeTab === 'structures' ? store.selectedItem : null"
          :terrains="store.terrains"
          :rules="store.rules"
          :paint-mode="paintMode"
          :selected-terrain-id="paintTerrainId"
          @ready="onPreviewReady"
          @hex-paint="onHexPaint"
          @camera-change="onCameraChange"
        />
      </div>
    </div>

    <!-- Right Resize Handle -->
    <div 
      class="resize-handle"
      @mousedown="startResize('right', $event)"
    ></div>

    <!-- Right Panel: Editor -->
    <div 
      class="panel panel-right"
      :style="{ width: rightPanelStyle }"
    >
      <div class="editor-header" v-if="store.selectedItem">
        <span>{{ store.selectedItem.name }}</span>
        <div class="editor-actions">
          <button 
            class="btn-save" 
            @click="saveAssets"
            title="Сохранить всё"
          >
            💾
          </button>
          <button 
            class="btn-duplicate" 
            @click="store.duplicateItem(store.selectedItemId)"
            title="Дублировать"
          >
            ⧉
          </button>
          <button 
            class="btn-delete" 
            @click="confirmDelete(store.selectedItem)"
            title="Удалить"
          >
            ×
          </button>
        </div>
      </div>

      <div class="editor-content" v-if="store.selectedItem">
        <!-- Terrain Editor -->
        <TerrainEditor
          v-if="store.activeTab === 'terrains'"
          :terrain="store.selectedItem"
          @update="handleUpdate"
        />

        <!-- Structure Editor -->
        <StructureEditor
          v-if="store.activeTab === 'structures'"
          :structure="store.selectedItem"
          :terrains="store.terrains"
          @update="handleUpdate"
        />

        <!-- Object Editor -->
        <ObjectEditor
          v-if="store.activeTab === 'objects'"
          :object="store.selectedItem"
          @update="handleUpdate"
        />

        <!-- Rule Editor -->
        <RuleEditor
          v-if="store.activeTab === 'rules'"
          :rule="store.selectedItem"
          :terrains="store.terrains"
          @update="handleUpdate"
        />

        <!-- Profile Editor -->
        <ProfileEditor
          v-if="store.activeTab === 'profiles'"
          :profile="store.selectedItem"
          :terrains="store.terrains"
          :structures="store.structures"
          :objects="store.objects"
          @update="handleUpdate"
        />
      </div>

      <div class="editor-empty" v-else>
        <p>Выберите элемент для редактирования</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useThreeAssetsStore } from '@/stores/threeAssets'
import { useUserPrefsStore } from '@/stores/userPrefs'
import TerrainEditor from './editors/TerrainEditor.vue'
import StructureEditor from './editors/StructureEditor.vue'
import ObjectEditor from './editors/ObjectEditor.vue'
import RuleEditor from './editors/RuleEditor.vue'
import ProfileEditor from './editors/ProfileEditor.vue'
import ThreePreview from './preview/ThreePreview.vue'

const store = useThreeAssetsStore()
const prefsStore = useUserPrefsStore()
const containerRef = ref(null)
const previewContainer = ref(null)
const previewInstance = ref(null)
const searchQuery = ref('')

// Безопасное получение prefs (может быть undefined при первой загрузке)
const threePrefs = prefsStore.threeAssetManager || {}

// Paint mode state - инициализируем из persist
const paintMode = ref(threePrefs.paintMode || false)
const paintTerrainId = ref(threePrefs.paintTerrainId || null)

// Map templates state
const mapTemplates = ref([])  // { id, name, data, createdAt }
const showTemplateMenu = ref(false)
const newTemplateName = ref('')
const editingTemplateId = ref(null)
const currentTemplateId = ref(threePrefs.currentTemplateId || null)

const TEMPLATES_STORAGE_KEY = 'threeAssetManager_mapTemplates'

// Resizing state
const isResizing = ref(false)
const resizeSide = ref(null)
const startX = ref(0)
const startLeftWidth = ref(30)
const startRightWidth = ref(30)

const tabs = [
  { id: 'terrains', label: 'Террейны', icon: '🏔️' },
  { id: 'structures', label: 'Структуры', icon: '🛤️' },
  { id: 'objects', label: 'Объекты', icon: '🌳' },
  { id: 'rules', label: 'Правила', icon: '🔗' },
  { id: 'profiles', label: 'Профили', icon: '🎲' },
]

// Panel widths from prefs
const leftPanelWidth = computed(() => prefsStore.threeAssetManager.leftPanelWidth)
const rightPanelWidth = computed(() => prefsStore.threeAssetManager.rightPanelWidth)

// Calculate min-width and actual width
const leftPanelStyle = computed(() => {
  return `max(350px, ${leftPanelWidth.value}%)`
})

const rightPanelStyle = computed(() => {
  return `max(350px, ${rightPanelWidth.value}%)`
})

// Current paint terrain (for brush indicator)
const currentPaintTerrain = computed(() => {
  if (!paintTerrainId.value) return null
  return store.terrains.find(t => t.id === paintTerrainId.value)
})

// Filtered items based on search
const filteredItems = computed(() => {
  const items = store.currentCollection
  if (!searchQuery.value.trim()) return items
  const query = searchQuery.value.toLowerCase()
  return items.filter(item => item.name.toLowerCase().includes(query))
})

// Resize handlers
function startResize(side, event) {
  isResizing.value = true
  resizeSide.value = side
  startX.value = event.clientX
  startLeftWidth.value = leftPanelWidth.value
  startRightWidth.value = rightPanelWidth.value
  
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onResize(event) {
  if (!isResizing.value || !containerRef.value) return
  
  const containerWidth = containerRef.value.clientWidth
  const deltaX = event.clientX - startX.value
  const deltaPercent = (deltaX / containerWidth) * 100
  
  if (resizeSide.value === 'left') {
    const newLeftWidth = Math.max(20, Math.min(50, startLeftWidth.value + deltaPercent))
    prefsStore.setThreeAssetManagerPanelWidths(newLeftWidth, rightPanelWidth.value)
  } else if (resizeSide.value === 'right') {
    const newRightWidth = Math.max(20, Math.min(50, startRightWidth.value - deltaPercent))
    prefsStore.setThreeAssetManagerPanelWidths(leftPanelWidth.value, newRightWidth)
  }
}

function stopResize() {
  isResizing.value = false
  resizeSide.value = null
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

function handleUpdate(updates) {
  store.updateItem(store.selectedItemId, updates)
}

function saveAssets() {
  if (store.saveToStorage()) {
    // Можно добавить уведомление
    console.log('✅ Все ассеты сохранены')
  }
}

function confirmDelete(item) {
  if (confirm(`Удалить "${item.name}"?`)) {
    store.deleteItem(item.id)
  }
}

function onPreviewReady(instance) {
  previewInstance.value = instance
  
  // Убеждаемся что шаблоны загружены
  if (mapTemplates.value.length === 0) {
    loadTemplatesFromStorage()
  }
  
  // Восстанавливаем шаблон карты
  if (currentTemplateId.value) {
    const template = mapTemplates.value.find(t => t.id === currentTemplateId.value)
    if (template) {
      console.log('🗺️ Restoring map template:', template.name)
      instance.setHexMap?.(template.data)
    } else {
      console.log('⚠️ Template not found:', currentTemplateId.value)
    }
  }
  
  // Восстанавливаем камеру
  const savedCamera = prefsStore.threeAssetManager.camera
  if (savedCamera && instance.setCameraState) {
    instance.setCameraState(savedCamera)
  }
}

function resetCamera() {
  previewInstance.value?.resetCamera?.()
}

// Paint mode functions
function togglePaintMode() {
  paintMode.value = !paintMode.value
  if (paintMode.value) {
    // При включении paint mode используем выбранный террейн
    paintTerrainId.value = store.selectedItemId
  } else {
    paintTerrainId.value = null
  }
}

function clearPaintedMap() {
  previewInstance.value?.clearHexMap?.()
  currentTemplateId.value = null  // Сбрасываем ID шаблона при очистке
}

function onCameraChange(cameraState) {
  // Сохраняем состояние камеры в persist
  prefsStore.threeAssetManager.camera = cameraState
}

function onHexPaint({ q, r, terrainId }) {
  // Можно логировать или сохранять карту
  console.log(`Painted hex (${q}, ${r}) with terrain: ${terrainId}`)
}

// === Map Templates ===

function loadTemplatesFromStorage() {
  try {
    const stored = localStorage.getItem(TEMPLATES_STORAGE_KEY)
    if (stored) {
      mapTemplates.value = JSON.parse(stored)
    }
  } catch (e) {
    console.warn('Failed to load map templates:', e)
  }
}

function saveTemplatesToStorage() {
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(mapTemplates.value))
  } catch (e) {
    console.warn('Failed to save map templates:', e)
  }
}

function saveCurrentMapAsTemplate() {
  const name = newTemplateName.value.trim() || `Шаблон ${mapTemplates.value.length + 1}`
  const mapData = previewInstance.value?.getHexMap?.() || {}
  
  const template = {
    id: Date.now().toString(),
    name,
    data: mapData,
    createdAt: new Date().toISOString(),
  }
  
  mapTemplates.value.push(template)
  saveTemplatesToStorage()
  newTemplateName.value = ''
  showTemplateMenu.value = false
}

function loadTemplate(template) {
  previewInstance.value?.setHexMap?.(template.data)
  currentTemplateId.value = template.id  // Сохраняем ID для persist
  showTemplateMenu.value = false
}

function deleteTemplate(templateId) {
  mapTemplates.value = mapTemplates.value.filter(t => t.id !== templateId)
  saveTemplatesToStorage()
}

function renameTemplate(templateId, newName) {
  const template = mapTemplates.value.find(t => t.id === templateId)
  if (template) {
    template.name = newName.trim() || template.name
    saveTemplatesToStorage()
  }
  editingTemplateId.value = null
}

function startEditingTemplate(templateId) {
  editingTemplateId.value = templateId
}

// === Persist State ===

// Восстановление состояния при монтировании
onMounted(() => {
  loadTemplatesFromStorage()
  
  // Восстанавливаем активную вкладку
  if (prefsStore.threeAssetManager.activeTab) {
    store.setActiveTab(prefsStore.threeAssetManager.activeTab)
  }
  
  // Восстанавливаем выбранный элемент
  if (prefsStore.threeAssetManager.selectedItemId) {
    store.selectItem(prefsStore.threeAssetManager.selectedItemId)
  }
})

// Сохраняем состояние при изменениях
watch(() => store.activeTab, (tab) => {
  prefsStore.threeAssetManager.activeTab = tab
})

watch(() => store.selectedItemId, (id) => {
  prefsStore.threeAssetManager.selectedItemId = id
  if (paintMode.value && id) {
    paintTerrainId.value = id
    prefsStore.threeAssetManager.paintTerrainId = id
  }
})

watch(paintMode, (mode) => {
  prefsStore.threeAssetManager.paintMode = mode
})

watch(paintTerrainId, (id) => {
  prefsStore.threeAssetManager.paintTerrainId = id
})

watch(currentTemplateId, (id) => {
  prefsStore.threeAssetManager.currentTemplateId = id
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
})
</script>

<style scoped>
.three-asset-manager {
  display: flex;
  height: 100%;
  background: #1a1a2e;
  color: #e0e0e0;
  font-family: system-ui, -apple-system, sans-serif;
  overflow: hidden;
}

/* Panels */
.panel {
  display: flex;
  flex-direction: column;
  background: #16162a;
  overflow: hidden;
}

.panel-left {
  border-right: 1px solid #2a2a4a;
}

.panel-center {
  flex: 1;
  min-width: 300px;
}

.panel-right {
  border-left: 1px solid #2a2a4a;
}

/* Resize Handle */
.resize-handle {
  width: 6px;
  background: #2a2a4a;
  cursor: col-resize;
  transition: background 0.2s;
  flex-shrink: 0;
}

.resize-handle:hover {
  background: #4a4a7a;
}

/* Tabs */
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 8px;
  background: #12122a;
  border-bottom: 1px solid #2a2a4a;
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: #1a1a3a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.tab:hover {
  background: #252550;
  color: #aaa;
}

.tab.active {
  background: #3a3a6a;
  color: #fff;
  border-color: #5a5a8a;
}

.tab-icon {
  font-size: 14px;
}

.tab-label {
  white-space: nowrap;
}

/* Search Bar */
.search-bar {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: #1a1a3a;
  border-bottom: 1px solid #2a2a4a;
}

.search-input {
  flex: 1;
  padding: 8px 12px;
  background: #12122a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 13px;
}

.search-input:focus {
  outline: none;
  border-color: #4a4a7a;
}

.search-input::placeholder {
  color: #666;
}

.btn-add {
  width: 32px;
  height: 32px;
  background: #2a6a3a;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-add:hover {
  background: #3a8a4a;
}

/* Selection Grid (for terrains) */
.selection-grid {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 8px;
  align-content: start;
}

.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  background: #1a1a3a;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
}

.grid-item:hover {
  background: #252550;
}

.grid-item.selected {
  background: #3a3a6a;
  border-color: #6a6aaa;
}

.grid-item-preview {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 6px;
  border: 1px solid rgba(255,255,255,0.1);
  position: relative;
}

.grid-item-layers {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: rgba(0,0,0,0.6);
  color: #aaa;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  font-family: monospace;
}

.grid-item-icon {
  font-size: 24px;
}

.grid-item-name {
  font-size: 11px;
  text-align: center;
  color: #aaa;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grid-item.selected .grid-item-name {
  color: #fff;
}

.empty-grid,
.empty-list {
  grid-column: 1 / -1;
  padding: 20px;
  text-align: center;
  color: #666;
  font-size: 13px;
}

/* Selection List (for other types) */
.selection-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin: 2px 0;
  background: #1a1a3a;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.list-item:hover {
  background: #252550;
}

.list-item.selected {
  background: #3a3a6a;
  box-shadow: inset 0 0 0 1px #5a5a8a;
}

.item-color {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid rgba(255,255,255,0.2);
  flex-shrink: 0;
}

.item-name {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Preview Panel */
.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #1a1a3a;
  border-bottom: 1px solid #2a2a4a;
  flex-shrink: 0;
}

.preview-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
}

.preview-controls button {
  background: transparent;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  color: #888;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.preview-controls button:hover {
  background: #2a2a4a;
  color: #aaa;
}

.preview-controls .btn-paint.active {
  background: #4a7c2360;
  border-color: #4a7c23;
  color: #8fc44a;
}

.brush-color-indicator {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: 2px solid #4a4a6a;
  cursor: default;
}

.preview-container {
  flex: 1;
  position: relative;
  background: #0a0a1a;
}

/* Editor Panel */
.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #1a1a3a;
  border-bottom: 1px solid #2a2a4a;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}

.editor-actions {
  display: flex;
  gap: 4px;
}

.btn-save,
.btn-duplicate,
.btn-delete {
  background: transparent;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  color: #888;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 14px;
}

.btn-save:hover {
  background: #2a4a2a;
  color: #5e5;
  border-color: #3a6a3a;
}

.btn-duplicate:hover {
  background: #2a2a4a;
  color: #aaa;
}

.btn-delete:hover {
  background: #4a2a2a;
  color: #e55;
  border-color: #6a3a3a;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
}

.editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 14px;
}

/* Template Dropdown */
.template-dropdown {
  position: relative;
}

.btn-templates {
  background: transparent;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  color: #888;
  padding: 4px 6px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.btn-templates:hover {
  background: #2a2a4a;
  color: #aaa;
}

.template-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  width: 240px;
  background: #1a1a3a;
  border: 1px solid #3a3a5a;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  z-index: 100;
}

.template-menu-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-bottom: 1px solid #2a2a4a;
  font-size: 12px;
  font-weight: 600;
  color: #aaa;
}

.template-menu-header .btn-close {
  background: none;
  border: none;
  color: #666;
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
}

.template-menu-header .btn-close:hover {
  color: #aaa;
}

.template-save-form {
  display: flex;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid #2a2a4a;
}

.template-save-form input {
  flex: 1;
  padding: 6px 8px;
  background: #12122a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
}

.template-save-form input:focus {
  outline: none;
  border-color: #4a4a7a;
}

.template-save-form button {
  background: #3a6a3a;
  border: none;
  border-radius: 4px;
  color: #e0e0e0;
  padding: 4px 8px;
  cursor: pointer;
}

.template-save-form button:hover {
  background: #4a8a4a;
}

.template-list {
  max-height: 200px;
  overflow-y: auto;
}

.template-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid #2a2a4a;
}

.template-item:last-child {
  border-bottom: none;
}

.template-item:hover {
  background: #252550;
}

.template-name {
  flex: 1;
  font-size: 12px;
  color: #ccc;
  cursor: pointer;
  padding: 4px 0;
}

.template-name:hover {
  color: #fff;
}

.template-name-input {
  flex: 1;
  padding: 4px 6px;
  background: #12122a;
  border: 1px solid #4a4a7a;
  border-radius: 3px;
  color: #e0e0e0;
  font-size: 12px;
}

.template-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.template-item:hover .template-actions {
  opacity: 1;
}

.template-actions button {
  background: transparent;
  border: none;
  color: #666;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
}

.template-actions button:hover {
  color: #aaa;
}

.template-empty {
  padding: 16px;
  text-align: center;
  color: #666;
  font-size: 12px;
}
</style>
