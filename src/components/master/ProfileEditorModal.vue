<script setup>
/**
 * ProfileEditorModal - модальное окно для создания и редактирования профилей заливки
 * Просторный интерфейс для комфортной работы с профилями
 */
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useFillProfileStore, FILL_CONDITION_TYPES, COMPARISON_OPERATORS } from '@/stores/fillProfile'
import { useTerrainStore } from '@/stores/terrain'
import { safeStoreToRefs, safeUseStore } from '@/utils/safeStoreRefs'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'select'])

const fillProfileStore = safeUseStore(useFillProfileStore, 'fillProfile')
const terrainStore = safeUseStore(useTerrainStore, 'terrain')

const { profiles = ref([]), currentProfile = ref(null), sortedProfiles = ref([]) } = safeStoreToRefs(fillProfileStore, 'fillProfile')

// UI состояние
const showNewProfileDialog = ref(false)
const newProfileName = ref('')
const editingLayerId = ref(null)
const profileFilter = ref('')

// Фильтрованные профили
const filteredProfiles = computed(() => {
  if (!profileFilter.value) return sortedProfiles.value
  const search = profileFilter.value.toLowerCase()
  return sortedProfiles.value.filter(p =>
    p.name.toLowerCase().includes(search) ||
    p.description?.toLowerCase().includes(search)
  )
})

// Террейны для выбора
const allTerrains = computed(() => {
  return terrainStore.allTerrains || []
})

// Получить террейн по ID
const getTerrainById = (id) => {
  return allTerrains.value.find(t => t.id === id) || { name: id, color: '#888' }
}

// Создать новый профиль
const createNewProfile = () => {
  if (!newProfileName.value.trim()) return
  
  fillProfileStore.createProfile({
    name: newProfileName.value.trim()
  })
  
  newProfileName.value = ''
  showNewProfileDialog.value = false
}

// Выбрать профиль в списке
const setCurrentProfile = (profileId) => {
  fillProfileStore.selectProfile(profileId)
  editingLayerId.value = null
}

// Удалить профиль
const deleteProfile = (profileId) => {
  if (confirm('Удалить профиль?')) {
    fillProfileStore.deleteProfile(profileId)
  }
}

// Обновить название профиля
const updateProfileName = (name) => {
  if (!currentProfile.value) return
  fillProfileStore.updateProfile(currentProfile.value.id, { name })
}

// Обновить описание профиля
const updateProfileDescription = (description) => {
  if (!currentProfile.value) return
  fillProfileStore.updateProfile(currentProfile.value.id, { description })
}

// Обновить базовый террейн
const updateBaseTerrain = (terrainId) => {
  if (!currentProfile.value) return
  fillProfileStore.updateProfile(currentProfile.value.id, { baseTerrain: terrainId })
}

// Добавить слой
const addLayer = () => {
  if (!currentProfile.value) return
  
  const layer = fillProfileStore.addLayer(currentProfile.value.id, {
    name: `Слой ${(currentProfile.value.layers?.length || 0) + 1}`
  })
  
  if (layer) {
    editingLayerId.value = layer.id
  }
}

// Удалить слой
const removeLayer = (layerId) => {
  if (!currentProfile.value) return
  fillProfileStore.removeLayer(currentProfile.value.id, layerId)
  if (editingLayerId.value === layerId) {
    editingLayerId.value = null
  }
}

// Обновить слой
const updateLayer = (layerId, updates) => {
  if (!currentProfile.value) return
  fillProfileStore.updateLayer(currentProfile.value.id, layerId, updates)
}

// Добавить условие
const addCondition = (layerId) => {
  if (!currentProfile.value) return
  fillProfileStore.addCondition(currentProfile.value.id, layerId, {
    type: FILL_CONDITION_TYPES.NONE
  })
}

// Удалить условие
const removeCondition = (layerId, conditionId) => {
  if (!currentProfile.value) return
  fillProfileStore.removeCondition(currentProfile.value.id, layerId, conditionId)
}

// Названия типов условий
const conditionTypeLabels = {
  [FILL_CONDITION_TYPES.NONE]: 'Без условия',
  [FILL_CONDITION_TYPES.TERRAIN_ID]: 'Террейн',
  [FILL_CONDITION_TYPES.TERRAIN_BIOME]: 'Биом',
  [FILL_CONDITION_TYPES.VISIBILITY]: 'Видимость',
  [FILL_CONDITION_TYPES.MOVEMENT_COST]: 'Проходимость',
  [FILL_CONDITION_TYPES.MELEE_ADVANTAGE]: 'Бонус ближ. боя',
  [FILL_CONDITION_TYPES.TAG]: 'Тег',
  [FILL_CONDITION_TYPES.RANDOM]: 'Случайно'
}

// Названия операторов
const operatorLabels = {
  [COMPARISON_OPERATORS.EQUALS]: '=',
  [COMPARISON_OPERATORS.NOT_EQUALS]: '≠',
  [COMPARISON_OPERATORS.GREATER]: '>',
  [COMPARISON_OPERATORS.GREATER_EQUALS]: '≥',
  [COMPARISON_OPERATORS.LESS]: '<',
  [COMPARISON_OPERATORS.LESS_EQUALS]: '≤',
  [COMPARISON_OPERATORS.CONTAINS]: 'содержит'
}

// Подтвердить выбор профиля для рисования
const confirmProfile = () => {
  if (!currentProfile.value) return
  emit('select', currentProfile.value)
  closeModal()
}

// Закрыть модал
const closeModal = () => {
  emit('close')
}

// Закрыть по клику на backdrop
const onBackdropClick = (e) => {
  if (e.target === e.currentTarget) {
    closeModal()
  }
}

// Закрыть по Escape
const onKeydown = (e) => {
  if (e.key === 'Escape') {
    closeModal()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div 
        v-if="visible" 
        class="modal-backdrop"
        @click="onBackdropClick"
        @keydown="onKeydown"
      >
        <div class="modal-container">
          <!-- Header -->
          <header class="modal-header">
            <div class="header-title">
              <Icon icon="mdi:dice-multiple" class="header-icon" />
              <h2>Профили заливки</h2>
            </div>
            <button type="button" class="close-btn" @click="closeModal">
              <Icon icon="mdi:close" />
            </button>
          </header>
          
          <!-- Content -->
          <div class="modal-content">
            <!-- Левая колонка: список профилей -->
            <aside class="profiles-sidebar">
              <div class="sidebar-header">
                <h3>Профили</h3>
                <button 
                  type="button" 
                  class="add-btn"
                  @click="showNewProfileDialog = true"
                >
                  <Icon icon="mdi:plus" />
                </button>
              </div>
              
              <!-- Фильтр -->
              <div class="filter-box">
                <Icon icon="mdi:magnify" class="filter-icon" />
                <input 
                  v-model="profileFilter"
                  type="text" 
                  placeholder="Поиск..." 
                  class="filter-input"
                />
              </div>
              
              <!-- Диалог нового профиля -->
              <div v-if="showNewProfileDialog" class="new-profile-dialog">
                <input 
                  v-model="newProfileName"
                  type="text" 
                  placeholder="Название профиля..."
                  class="new-profile-input"
                  @keyup.enter="createNewProfile"
                />
                <div class="new-profile-actions">
                  <button type="button" class="btn-primary" @click="createNewProfile">
                    Создать
                  </button>
                  <button type="button" class="btn-secondary" @click="showNewProfileDialog = false; newProfileName = ''">
                    Отмена
                  </button>
                </div>
              </div>
              
              <!-- Список профилей -->
              <div class="profiles-list">
                <button
                  v-for="profile in filteredProfiles"
                  :key="profile.id"
                  type="button"
                  class="profile-item"
                  :class="{ selected: currentProfile?.id === profile.id }"
                  @click="setCurrentProfile(profile.id)"
                >
                  <div class="profile-item-main">
                    <span class="profile-name">{{ profile.name }}</span>
                    <span class="profile-meta">
                      <span 
                        class="base-dot"
                        :style="{ backgroundColor: getTerrainById(profile.baseTerrain).color }"
                      ></span>
                      {{ profile.layers?.length || 0 }} слоёв
                    </span>
                  </div>
                  <button 
                    type="button" 
                    class="delete-btn"
                    @click.stop="deleteProfile(profile.id)"
                  >
                    <Icon icon="mdi:delete-outline" />
                  </button>
                </button>
                
                <div v-if="filteredProfiles.length === 0" class="empty-list">
                  <p>Нет профилей</p>
                  <button type="button" class="btn-primary" @click="showNewProfileDialog = true">
                    Создать первый
                  </button>
                </div>
              </div>
            </aside>
            
            <!-- Основная область: редактирование профиля -->
            <main class="profile-editor">
              <template v-if="currentProfile">
                <!-- Основные настройки -->
                <section class="editor-section">
                  <h3 class="section-title">
                    <Icon icon="mdi:cog" />
                    Основные настройки
                  </h3>
                  
                  <div class="form-grid">
                    <div class="form-group">
                      <label>Название</label>
                      <input 
                        type="text" 
                        :value="currentProfile.name"
                        class="form-input"
                        @input="updateProfileName($event.target.value)"
                      />
                    </div>
                    
                    <div class="form-group">
                      <label>Описание</label>
                      <input 
                        type="text" 
                        :value="currentProfile.description"
                        placeholder="Опционально..."
                        class="form-input"
                        @input="updateProfileDescription($event.target.value)"
                      />
                    </div>
                  </div>
                </section>
                
                <!-- Базовый террейн -->
                <section class="editor-section">
                  <h3 class="section-title">
                    <Icon icon="mdi:terrain" />
                    Базовый террейн
                    <span class="section-hint">Заполняет все гексы в области</span>
                  </h3>
                  
                  <div class="terrain-grid">
                    <!-- Опция без базового террейна -->
                    <button
                      type="button"
                      class="terrain-tile no-terrain"
                      :class="{ selected: !currentProfile.baseTerrain }"
                      title="Без базового террейна — только слои"
                      @click="updateBaseTerrain(null)"
                    >
                      <span class="terrain-color no-terrain-color">
                        <Icon icon="mdi:texture-box" />
                      </span>
                      <span class="terrain-name">Нет</span>
                    </button>
                    <button
                      v-for="terrain in allTerrains"
                      :key="terrain.id"
                      type="button"
                      class="terrain-tile"
                      :class="{ selected: currentProfile.baseTerrain === terrain.id }"
                      :title="terrain.name"
                      @click="updateBaseTerrain(terrain.id)"
                    >
                      <span 
                        class="terrain-color"
                        :style="{ backgroundColor: terrain.color || terrain.fallbackColor }"
                      ></span>
                      <span class="terrain-name">{{ terrain.name }}</span>
                    </button>
                  </div>
                </section>
                
                <!-- Слои -->
                <section class="editor-section layers-section">
                  <div class="section-header-row">
                    <h3 class="section-title">
                      <Icon icon="mdi:layers-triple" />
                      Слои
                      <span class="section-hint">Накладываются поверх базового</span>
                    </h3>
                    <button type="button" class="btn-add-layer" @click="addLayer">
                      <Icon icon="mdi:plus" />
                      Добавить слой
                    </button>
                  </div>
                  
                  <div v-if="currentProfile.layers?.length" class="layers-list">
                    <div 
                      v-for="(layer, index) in currentProfile.layers" 
                      :key="layer.id"
                      class="layer-card"
                      :class="{ expanded: editingLayerId === layer.id }"
                    >
                      <!-- Заголовок слоя -->
                      <div class="layer-header" @click="editingLayerId = editingLayerId === layer.id ? null : layer.id">
                        <div class="layer-info">
                          <span class="layer-index">#{{ index + 1 }}</span>
                          <input 
                            v-model="layer.name"
                            type="text"
                            class="layer-name-input"
                            @click.stop
                            @input="updateLayer(layer.id, { name: $event.target.value })"
                          />
                          <span 
                            class="layer-terrain-preview"
                            :style="{ backgroundColor: getTerrainById(layer.terrainId).color }"
                            :title="getTerrainById(layer.terrainId).name"
                          ></span>
                        </div>
                        <div class="layer-actions">
                          <span class="layer-density">{{ layer.density }}%</span>
                          <button type="button" class="layer-toggle">
                            <Icon :icon="editingLayerId === layer.id ? 'mdi:chevron-up' : 'mdi:chevron-down'" />
                          </button>
                          <button type="button" class="layer-delete" @click.stop="removeLayer(layer.id)">
                            <Icon icon="mdi:delete-outline" />
                          </button>
                        </div>
                      </div>
                      
                      <!-- Развёрнутые настройки слоя -->
                      <div v-if="editingLayerId === layer.id" class="layer-details">
                        <div class="layer-form-grid">
                          <!-- Террейн -->
                          <div class="form-group">
                            <label>Террейн</label>
                            <select 
                              :value="layer.terrainId"
                              class="form-select"
                              @change="updateLayer(layer.id, { terrainId: $event.target.value })"
                            >
                              <option value="">Не выбран</option>
                              <option v-for="t in allTerrains" :key="t.id" :value="t.id">
                                {{ t.name }}
                              </option>
                            </select>
                          </div>
                          
                          <!-- Плотность -->
                          <div class="form-group">
                            <label>Плотность: {{ layer.density }}%</label>
                            <input 
                              type="range"
                              min="0"
                              max="100"
                              :value="layer.density"
                              class="form-range"
                              @input="updateLayer(layer.id, { density: Number($event.target.value) })"
                            />
                          </div>
                          
                          <!-- Кластеризация -->
                          <div class="form-group">
                            <label>Группировка: {{ layer.clustering }}%</label>
                            <input 
                              type="range"
                              min="0"
                              max="100"
                              :value="layer.clustering"
                              class="form-range"
                              @input="updateLayer(layer.id, { clustering: Number($event.target.value) })"
                            />
                          </div>
                        </div>
                        
                        <!-- Условия -->
                        <div class="layer-conditions">
                          <div class="conditions-header">
                            <span>Условия применения</span>
                            <button type="button" class="btn-add-condition" @click="addCondition(layer.id)">
                              <Icon icon="mdi:plus" />
                            </button>
                          </div>
                          
                          <div v-if="layer.conditions?.length" class="conditions-list">
                            <div 
                              v-for="condition in layer.conditions" 
                              :key="condition.id"
                              class="condition-row"
                            >
                              <select 
                                :value="condition.type"
                                class="condition-type"
                                @change="updateLayer(layer.id, { 
                                  conditions: layer.conditions.map(c => c.id === condition.id 
                                    ? { ...c, type: $event.target.value } 
                                    : c
                                  )
                                })"
                              >
                                <option v-for="(label, type) in conditionTypeLabels" :key="type" :value="type">
                                  {{ label }}
                                </option>
                              </select>
                              
                              <select 
                                v-if="condition.type !== FILL_CONDITION_TYPES.NONE"
                                :value="condition.operator"
                                class="condition-operator"
                                @change="updateLayer(layer.id, { 
                                  conditions: layer.conditions.map(c => c.id === condition.id 
                                    ? { ...c, operator: $event.target.value } 
                                    : c
                                  )
                                })"
                              >
                                <option v-for="(label, op) in operatorLabels" :key="op" :value="op">
                                  {{ label }}
                                </option>
                              </select>
                              
                              <input 
                                v-if="condition.type !== FILL_CONDITION_TYPES.NONE"
                                :value="condition.value"
                                type="text"
                                placeholder="значение"
                                class="condition-value"
                                @input="updateLayer(layer.id, { 
                                  conditions: layer.conditions.map(c => c.id === condition.id 
                                    ? { ...c, value: $event.target.value } 
                                    : c
                                  )
                                })"
                              />
                              
                              <button 
                                type="button" 
                                class="condition-delete"
                                @click="removeCondition(layer.id, condition.id)"
                              >
                                <Icon icon="mdi:close" />
                              </button>
                            </div>
                          </div>
                          
                          <p v-else class="no-conditions">Нет условий — слой применяется везде</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div v-else class="empty-layers">
                    <Icon icon="mdi:layers-off" class="empty-icon" />
                    <p>Добавьте слои для создания сложных паттернов</p>
                    <button type="button" class="btn-primary" @click="addLayer">
                      <Icon icon="mdi:plus" />
                      Добавить первый слой
                    </button>
                  </div>
                </section>
              </template>
              
              <!-- Пустое состояние -->
              <div v-else class="empty-editor">
                <Icon icon="mdi:arrow-left" class="empty-icon" />
                <p>Выберите профиль слева или создайте новый</p>
              </div>
            </main>
          </div>
          
          <!-- Footer -->
          <footer v-if="currentProfile" class="modal-footer">
            <button type="button" class="btn-secondary" @click="closeModal">
              Закрыть
            </button>
            <button type="button" class="btn-primary" @click="confirmProfile">
              <Icon icon="mdi:check" />
              Выбрать
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 2rem;
}

.modal-container {
  width: 100%;
  max-width: 1100px;
  max-height: 85vh;
  background: #1e293b;
  border-radius: 1rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

/* Header */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-icon {
  width: 1.5rem;
  height: 1.5rem;
  color: #38bdf8;
}

.header-title h2 {
  font-size: 1.25rem;
  font-weight: 600;
  color: white;
  margin: 0;
}

.close-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(148, 163, 184, 0.8);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

/* Content */
.modal-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* Sidebar */
.profiles-sidebar {
  width: 280px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.15);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.sidebar-header h3 {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 0.9);
  margin: 0;
}

.add-btn {
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(56, 189, 248, 0.2);
  border: none;
  color: #38bdf8;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.add-btn:hover {
  background: rgba(56, 189, 248, 0.3);
}

.filter-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
}

.filter-icon {
  width: 1rem;
  height: 1rem;
  color: rgba(148, 163, 184, 0.5);
}

.filter-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: white;
  font-size: 0.875rem;
}

.filter-input::placeholder {
  color: rgba(148, 163, 184, 0.5);
}

.new-profile-dialog {
  margin: 0 0.75rem 0.75rem;
  padding: 0.75rem;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 0.5rem;
}

.new-profile-input {
  width: 100%;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: white;
  font-size: 0.875rem;
  margin-bottom: 0.5rem;
}

.new-profile-actions {
  display: flex;
  gap: 0.5rem;
}

.profiles-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
}

.profile-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}

.profile-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.profile-item.selected {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
}

.profile-item-main {
  flex: 1;
  min-width: 0;
}

.profile-name {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: white;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-meta {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.6);
  margin-top: 0.25rem;
}

.base-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
}

.delete-btn {
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(148, 163, 184, 0.4);
  border-radius: 0.25rem;
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
}

.profile-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  color: #f87171;
  background: rgba(248, 113, 113, 0.1);
}

.empty-list {
  text-align: center;
  padding: 2rem 1rem;
  color: rgba(148, 163, 184, 0.6);
}

.empty-list p {
  margin-bottom: 1rem;
}

/* Editor */
.profile-editor {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.editor-section {
  margin-bottom: 2rem;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: white;
  margin: 0 0 1rem 0;
}

.section-hint {
  font-size: 0.75rem;
  font-weight: 400;
  color: rgba(148, 163, 184, 0.6);
  margin-left: 0.5rem;
}

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-group label {
  font-size: 0.75rem;
  font-weight: 500;
  color: rgba(148, 163, 184, 0.8);
}

.form-input,
.form-select {
  padding: 0.625rem 0.75rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: white;
  font-size: 0.875rem;
  transition: all 0.15s;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: rgba(56, 189, 248, 0.5);
}

.form-range {
  width: 100%;
  accent-color: #38bdf8;
}

/* Terrain grid */
.terrain-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 0.5rem;
}

.terrain-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 2px solid transparent;
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.15s;
}

.terrain-tile:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.terrain-tile.selected {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
}

.no-terrain-color {
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-linear-gradient(
    45deg,
    rgba(100, 116, 139, 0.3),
    rgba(100, 116, 139, 0.3) 4px,
    rgba(71, 85, 105, 0.3) 4px,
    rgba(71, 85, 105, 0.3) 8px
  );
  color: rgba(148, 163, 184, 0.7);
  font-size: 1.25rem;
}

.terrain-tile.no-terrain.selected .no-terrain-color {
  color: #38bdf8;
}

.terrain-color {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.375rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.terrain-name {
  font-size: 0.6875rem;
  color: rgba(226, 232, 240, 0.8);
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* Layers */
.btn-add-layer {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 0.5rem;
  color: #38bdf8;
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-add-layer:hover {
  background: rgba(56, 189, 248, 0.25);
}

.layers-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.layer-card {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
  overflow: hidden;
}

.layer-card.expanded {
  border-color: rgba(56, 189, 248, 0.3);
}

.layer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  cursor: pointer;
  transition: background 0.15s;
}

.layer-header:hover {
  background: rgba(255, 255, 255, 0.03);
}

.layer-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.layer-index {
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(148, 163, 184, 0.5);
}

.layer-name-input {
  background: transparent;
  border: none;
  outline: none;
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  transition: background 0.15s;
}

.layer-name-input:hover,
.layer-name-input:focus {
  background: rgba(255, 255, 255, 0.1);
}

.layer-terrain-preview {
  width: 1rem;
  height: 1rem;
  border-radius: 0.25rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.layer-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.layer-density {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.6);
  padding: 0.25rem 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.25rem;
}

.layer-toggle,
.layer-delete {
  width: 1.5rem;
  height: 1.5rem;
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

.layer-toggle:hover {
  color: white;
}

.layer-delete:hover {
  color: #f87171;
}

.layer-details {
  padding: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  background: rgba(0, 0, 0, 0.1);
}

.layer-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1rem;
}

.layer-conditions {
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.conditions-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  font-size: 0.8125rem;
  color: rgba(148, 163, 184, 0.8);
}

.btn-add-condition {
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: rgba(148, 163, 184, 0.8);
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-add-condition:hover {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
}

.conditions-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.condition-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.condition-type {
  flex: 1;
  padding: 0.375rem 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: white;
  font-size: 0.75rem;
}

.condition-operator {
  width: 3rem;
  padding: 0.375rem 0.25rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: white;
  font-size: 0.75rem;
  text-align: center;
}

.condition-value {
  width: 5rem;
  padding: 0.375rem 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: white;
  font-size: 0.75rem;
}

.condition-delete {
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(148, 163, 184, 0.5);
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.condition-delete:hover {
  color: #f87171;
}

.no-conditions {
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.5);
  font-style: italic;
}

.empty-layers {
  text-align: center;
  padding: 3rem 2rem;
  background: rgba(0, 0, 0, 0.1);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 0.75rem;
}

.empty-icon {
  width: 3rem;
  height: 3rem;
  color: rgba(148, 163, 184, 0.3);
  margin-bottom: 1rem;
}

.empty-layers p {
  color: rgba(148, 163, 184, 0.6);
  margin-bottom: 1rem;
}

.empty-editor {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(148, 163, 184, 0.5);
}

.empty-editor .empty-icon {
  width: 4rem;
  height: 4rem;
  margin-bottom: 1rem;
}

/* Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
}

/* Buttons */
.btn-primary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: #38bdf8;
  border: none;
  border-radius: 0.5rem;
  color: #0f172a;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-primary:hover {
  background: #7dd3fc;
}

.btn-secondary {
  padding: 0.625rem 1rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  color: rgba(226, 232, 240, 0.9);
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.15);
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
}
</style>
