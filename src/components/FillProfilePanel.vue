<script setup>
/**
 * Панель редактирования профилей рандомной заливки
 */
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useFillProfileStore, FILL_CONDITION_TYPES, COMPARISON_OPERATORS } from '@/stores/fillProfile'
import { useTerrainStore } from '@/stores/terrain'

const emit = defineEmits(['apply', 'preview', 'close'])

const fillProfileStore = useFillProfileStore()
const terrainStore = useTerrainStore()

const { profiles, currentProfile, sortedProfiles } = storeToRefs(fillProfileStore)

// UI состояние
const activeTab = ref('profile') // profile, layers, preview
const editingLayerId = ref(null)
const showNewProfileDialog = ref(false)
const newProfileName = ref('')

// Террейны для выбора
const allTerrains = computed(() => {
  return [...terrainStore.baseTerrains, ...terrainStore.customTerrains]
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

// Выбрать профиль
const selectProfile = (profileId) => {
  fillProfileStore.selectProfile(profileId)
  editingLayerId.value = null
}

// Удалить профиль
const deleteProfile = (profileId) => {
  if (confirm('Удалить профиль?')) {
    fillProfileStore.deleteProfile(profileId)
  }
}

// Добавить слой
const addLayer = () => {
  if (!currentProfile.value) return
  
  const layer = fillProfileStore.addLayer(currentProfile.value.id, {
    name: `Слой ${(currentProfile.value.layers?.length || 0) + 1}`
  })
  
  if (layer) {
    editingLayerId.value = layer.id
    activeTab.value = 'layers'
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
const updateLayer = (layerId, field, value) => {
  if (!currentProfile.value) return
  fillProfileStore.updateLayer(currentProfile.value.id, layerId, { [field]: value })
}

// Обновить базовый террейн
const updateBaseTerrain = (terrainId) => {
  if (!currentProfile.value) return
  fillProfileStore.updateProfile(currentProfile.value.id, { baseTerrain: terrainId })
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

// Применить профиль
const applyProfile = () => {
  if (!currentProfile.value) return
  emit('apply', currentProfile.value)
}

// Показать превью
const showPreview = () => {
  if (!currentProfile.value) return
  emit('preview', currentProfile.value)
}

// Создать дефолтный профиль
const createDefaultProfile = () => {
  fillProfileStore.createDefaultProfile()
}

// Названия типов условий
const conditionTypeLabels = {
  [FILL_CONDITION_TYPES.NONE]: 'Без условия',
  [FILL_CONDITION_TYPES.TERRAIN_ID]: 'Террейн',
  [FILL_CONDITION_TYPES.TERRAIN_BIOME]: 'Биом',
  [FILL_CONDITION_TYPES.VISIBILITY]: 'Видимость',
  [FILL_CONDITION_TYPES.MOVEMENT_COST]: 'Проходимость',
  [FILL_CONDITION_TYPES.MELEE_ADVANTAGE]: 'Бонус ближ. боя',
  [FILL_CONDITION_TYPES.TAG]: 'Тег'
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
</script>

<template>
  <div class="fill-profile-panel flex flex-col h-full bg-slate-800 text-white">
    <!-- Заголовок -->
    <header class="flex items-center justify-between px-3 py-2 border-b border-white/10">
      <h3 class="text-sm font-medium">Профили заливки</h3>
      <button
        type="button"
        class="text-slate-400 hover:text-white transition"
        @click="emit('close')"
      >
        ✕
      </button>
    </header>
    
    <!-- Табы -->
    <div class="flex border-b border-white/10">
      <button
        v-for="tab in [
          { id: 'profile', label: '📋 Профиль' },
          { id: 'layers', label: '📚 Слои' },
          { id: 'preview', label: '👁 Превью' }
        ]"
        :key="tab.id"
        type="button"
        class="flex-1 px-3 py-2 text-xs transition"
        :class="activeTab === tab.id 
          ? 'bg-sky-500/20 text-sky-400 border-b-2 border-sky-400' 
          : 'text-slate-400 hover:text-white hover:bg-white/5'"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>
    
    <!-- Контент -->
    <div class="flex-1 overflow-y-auto p-3">
      <!-- Таб: Профиль -->
      <template v-if="activeTab === 'profile'">
        <!-- Список профилей -->
        <div class="space-y-2">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-slate-400">Сохранённые профили</span>
            <div class="flex gap-1">
              <button
                type="button"
                class="px-2 py-1 text-xs bg-sky-500/20 text-sky-400 rounded hover:bg-sky-500/30 transition"
                @click="showNewProfileDialog = true"
              >
                + Новый
              </button>
              <button
                v-if="profiles.length === 0"
                type="button"
                class="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition"
                @click="createDefaultProfile"
              >
                Пример
              </button>
            </div>
          </div>
          
          <!-- Диалог нового профиля -->
          <div v-if="showNewProfileDialog" class="p-2 bg-slate-700/50 rounded-lg mb-2">
            <input
              v-model="newProfileName"
              type="text"
              placeholder="Название профиля..."
              class="w-full px-2 py-1 text-xs bg-slate-900/50 border border-white/10 rounded mb-2 focus:outline-none focus:border-sky-400/50"
              @keyup.enter="createNewProfile"
            />
            <div class="flex gap-1">
              <button
                type="button"
                class="flex-1 px-2 py-1 text-xs bg-sky-500 text-white rounded hover:bg-sky-600 transition"
                @click="createNewProfile"
              >
                Создать
              </button>
              <button
                type="button"
                class="px-2 py-1 text-xs text-slate-400 hover:text-white transition"
                @click="showNewProfileDialog = false; newProfileName = ''"
              >
                Отмена
              </button>
            </div>
          </div>
          
          <!-- Список -->
          <div
            v-for="profile in sortedProfiles"
            :key="profile.id"
            class="p-2 rounded-lg border transition cursor-pointer"
            :class="currentProfile?.id === profile.id 
              ? 'bg-sky-500/20 border-sky-400/60' 
              : 'bg-slate-700/30 border-white/10 hover:border-white/20'"
            @click="selectProfile(profile.id)"
          >
            <div class="flex items-center justify-between">
              <div>
                <div class="text-sm font-medium">{{ profile.name }}</div>
                <div class="text-xs text-slate-400">
                  {{ profile.layers?.length || 0 }} слоёв • 
                  База: {{ getTerrainById(profile.baseTerrain).name }}
                </div>
              </div>
              <button
                type="button"
                class="p-1 text-slate-400 hover:text-red-400 transition"
                @click.stop="deleteProfile(profile.id)"
              >
                🗑
              </button>
            </div>
          </div>
          
          <div v-if="profiles.length === 0" class="text-center text-slate-500 text-xs py-4">
            Нет сохранённых профилей
          </div>
        </div>
        
        <!-- Редактирование текущего профиля -->
        <template v-if="currentProfile">
          <div class="mt-4 pt-4 border-t border-white/10">
            <div class="text-xs text-slate-400 mb-2">Базовый террейн</div>
            
            <div class="grid grid-cols-5 gap-1 max-h-32 overflow-y-auto">
              <button
                v-for="terrain in allTerrains"
                :key="terrain.id"
                type="button"
                class="w-10 h-10 rounded border transition"
                :class="currentProfile.baseTerrain === terrain.id 
                  ? 'border-sky-400 ring-2 ring-sky-400/50' 
                  : 'border-white/10 hover:border-white/30'"
                :style="{ backgroundColor: terrain.color || '#888' }"
                :title="terrain.name"
                @click="updateBaseTerrain(terrain.id)"
              ></button>
            </div>
          </div>
        </template>
      </template>
      
      <!-- Таб: Слои -->
      <template v-if="activeTab === 'layers' && currentProfile">
        <div class="space-y-2">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-slate-400">Слои профиля "{{ currentProfile.name }}"</span>
            <button
              type="button"
              class="px-2 py-1 text-xs bg-sky-500/20 text-sky-400 rounded hover:bg-sky-500/30 transition"
              @click="addLayer"
            >
              + Слой
            </button>
          </div>
          
          <!-- Список слоёв -->
          <div
            v-for="layer in currentProfile.layers"
            :key="layer.id"
            class="p-2 rounded-lg border transition"
            :class="editingLayerId === layer.id 
              ? 'bg-sky-500/10 border-sky-400/60' 
              : 'bg-slate-700/30 border-white/10'"
          >
            <!-- Заголовок слоя -->
            <div 
              class="flex items-center justify-between cursor-pointer"
              @click="editingLayerId = editingLayerId === layer.id ? null : layer.id"
            >
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  :checked="layer.enabled"
                  class="rounded"
                  @click.stop
                  @change="updateLayer(layer.id, 'enabled', $event.target.checked)"
                />
                <span 
                  class="w-4 h-4 rounded"
                  :style="{ backgroundColor: getTerrainById(layer.terrainId).color || '#888' }"
                ></span>
                <span class="text-sm">{{ layer.name }}</span>
              </div>
              <div class="flex items-center gap-1">
                <span class="text-xs text-slate-400">{{ layer.density }}%</span>
                <button
                  type="button"
                  class="p-1 text-slate-400 hover:text-red-400 transition"
                  @click.stop="removeLayer(layer.id)"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <!-- Развёрнутое редактирование -->
            <div v-if="editingLayerId === layer.id" class="mt-3 pt-3 border-t border-white/10 space-y-3">
              <!-- Название -->
              <div>
                <label class="text-xs text-slate-400">Название</label>
                <input
                  :value="layer.name"
                  type="text"
                  class="w-full px-2 py-1 text-xs bg-slate-900/50 border border-white/10 rounded mt-1 focus:outline-none focus:border-sky-400/50"
                  @input="updateLayer(layer.id, 'name', $event.target.value)"
                />
              </div>
              
              <!-- Террейн -->
              <div>
                <label class="text-xs text-slate-400">Террейн</label>
                <div class="grid grid-cols-6 gap-1 mt-1 max-h-24 overflow-y-auto">
                  <button
                    v-for="terrain in allTerrains"
                    :key="terrain.id"
                    type="button"
                    class="w-8 h-8 rounded border transition"
                    :class="layer.terrainId === terrain.id 
                      ? 'border-sky-400 ring-2 ring-sky-400/50' 
                      : 'border-white/10 hover:border-white/30'"
                    :style="{ backgroundColor: terrain.color || '#888' }"
                    :title="terrain.name"
                    @click="updateLayer(layer.id, 'terrainId', terrain.id)"
                  ></button>
                </div>
              </div>
              
              <!-- Плотность -->
              <div>
                <div class="flex items-center justify-between">
                  <label class="text-xs text-slate-400">Плотность</label>
                  <span class="text-xs text-sky-400">{{ layer.density }}%</span>
                </div>
                <input
                  :value="layer.density"
                  type="range"
                  min="0"
                  max="100"
                  class="w-full mt-1"
                  @input="updateLayer(layer.id, 'density', Number($event.target.value))"
                />
              </div>
              
              <!-- Группировка -->
              <div>
                <div class="flex items-center justify-between">
                  <label class="text-xs text-slate-400">Группировка</label>
                  <span class="text-xs text-sky-400">{{ layer.clustering }}%</span>
                </div>
                <div class="flex items-center gap-2 text-[10px] text-slate-500">
                  <span>Разброс</span>
                  <input
                    :value="layer.clustering"
                    type="range"
                    min="0"
                    max="100"
                    class="flex-1"
                    @input="updateLayer(layer.id, 'clustering', Number($event.target.value))"
                  />
                  <span>Кластеры</span>
                </div>
              </div>
              
              <!-- Условия -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-xs text-slate-400">Условия</label>
                  <button
                    type="button"
                    class="text-xs text-sky-400 hover:text-sky-300"
                    @click="addCondition(layer.id)"
                  >
                    + Условие
                  </button>
                </div>
                
                <div v-if="layer.conditions?.length === 0" class="text-xs text-slate-500 italic">
                  Нет условий (применяется везде)
                </div>
                
                <div 
                  v-for="condition in layer.conditions"
                  :key="condition.id"
                  class="flex items-center gap-1 mt-1 p-1 bg-slate-900/30 rounded text-xs"
                >
                  <select
                    :value="condition.type"
                    class="flex-1 px-1 py-0.5 bg-slate-800 border border-white/10 rounded text-xs"
                    @change="fillProfileStore.updateLayer(currentProfile.id, layer.id, { 
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
                    class="px-1 py-0.5 bg-slate-800 border border-white/10 rounded text-xs"
                    @change="fillProfileStore.updateLayer(currentProfile.id, layer.id, { 
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
                    class="w-16 px-1 py-0.5 bg-slate-800 border border-white/10 rounded text-xs"
                    @input="fillProfileStore.updateLayer(currentProfile.id, layer.id, { 
                      conditions: layer.conditions.map(c => c.id === condition.id 
                        ? { ...c, value: $event.target.value } 
                        : c
                      )
                    })"
                  />
                  
                  <button
                    type="button"
                    class="text-slate-400 hover:text-red-400"
                    @click="removeCondition(layer.id, condition.id)"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div v-if="!currentProfile.layers?.length" class="text-center text-slate-500 text-xs py-4">
            Добавьте слои для настройки заливки
          </div>
        </div>
      </template>
      
      <!-- Таб: Превью -->
      <template v-if="activeTab === 'preview' && currentProfile">
        <div class="text-center py-8">
          <div class="text-slate-400 text-sm mb-4">
            Выделите область на карте и нажмите "Превью" чтобы увидеть результат
          </div>
          
          <button
            type="button"
            class="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition"
            @click="showPreview"
          >
            👁 Показать превью
          </button>
        </div>
      </template>
      
      <div v-if="!currentProfile && activeTab !== 'profile'" class="text-center text-slate-500 text-xs py-8">
        Выберите или создайте профиль
      </div>
    </div>
    
    <!-- Футер с кнопкой применения -->
    <footer v-if="currentProfile" class="p-3 border-t border-white/10">
      <button
        type="button"
        class="w-full py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition"
        @click="applyProfile"
      >
        🎲 Применить к выделению
      </button>
    </footer>
  </div>
</template>

<style scoped>
.fill-profile-panel {
  width: 320px;
  max-height: 100%;
}
</style>
