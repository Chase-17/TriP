/**
 * Store для профилей рандомной заливки
 * Позволяет создавать сложные паттерны заливки с условиями и рандомизацией
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * Типы условий для слоёв заливки
 */
export const FILL_CONDITION_TYPES = {
  NONE: 'none',                     // Без условий (применяется везде)
  TERRAIN_ID: 'terrain_id',         // Конкретный террейн
  TERRAIN_BIOME: 'terrain_biome',   // Биом террейна
  VISIBILITY: 'visibility',         // Тип видимости
  MOVEMENT_COST: 'movement_cost',   // Стоимость передвижения
  MELEE_ADVANTAGE: 'melee_advantage', // Бонус ближнего боя
  TAG: 'tag',                       // Наличие тега
  RANDOM: 'random'                  // Просто случайный шанс
}

/**
 * Операторы сравнения
 */
export const COMPARISON_OPERATORS = {
  EQUALS: 'eq',
  NOT_EQUALS: 'neq',
  GREATER: 'gt',
  GREATER_EQUALS: 'gte',
  LESS: 'lt',
  LESS_EQUALS: 'lte',
  CONTAINS: 'contains'
}

/**
 * Генерация уникального ID
 */
const generateId = () => `fill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

/**
 * Создать пустой слой заливки
 */
export const createFillLayer = (options = {}) => ({
  id: generateId(),
  name: options.name || 'Новый слой',
  enabled: true,
  
  // Какой террейн ставить
  terrainId: options.terrainId || null,
  
  // Плотность (0-100%) - какой процент подходящих гексов заполнить
  density: options.density ?? 20,
  
  // Группировка (0-100)
  // 0 = равномерное распределение
  // 100 = максимальная кластеризация (все в одной группе)
  clustering: options.clustering ?? 0,
  
  // Условия применения (когда этот слой накладывается)
  conditions: options.conditions || [],
  
  // Приоритет (слои с большим приоритетом перезаписывают)
  priority: options.priority ?? 0
})

/**
 * Создать условие
 */
export const createCondition = (options = {}) => ({
  id: generateId(),
  type: options.type || FILL_CONDITION_TYPES.NONE,
  operator: options.operator || COMPARISON_OPERATORS.EQUALS,
  value: options.value ?? null,
  // Для числовых диапазонов
  minValue: options.minValue ?? null,
  maxValue: options.maxValue ?? null
})

/**
 * Создать пустой профиль заливки
 */
export const createFillProfile = (options = {}) => ({
  id: generateId(),
  name: options.name || 'Новый профиль',
  description: options.description || '',
  
  // Базовый террейн (заполняет все гексы в выделении)
  baseTerrain: options.baseTerrain || 'grass',
  
  // Дополнительные слои (применяются поверх базового)
  layers: options.layers || [],
  
  // Seed для воспроизводимой генерации (null = случайный)
  seed: options.seed ?? null,
  
  // Метаданные
  createdAt: Date.now(),
  updatedAt: Date.now()
})

export const useFillProfileStore = defineStore('fillProfile', () => {
  // ===== STATE =====
  
  // Сохранённые профили
  const profiles = ref([])
  
  // Текущий редактируемый профиль (для UI)
  const currentProfileId = ref(null)
  
  // Превью (для отображения перед применением)
  const previewData = ref(null)
  
  // ===== GETTERS =====
  
  const currentProfile = computed(() => {
    return profiles.value.find(p => p.id === currentProfileId.value) || null
  })
  
  const sortedProfiles = computed(() => {
    return [...profiles.value].sort((a, b) => b.updatedAt - a.updatedAt)
  })
  
  // ===== ACTIONS =====
  
  /**
   * Создать новый профиль
   */
  function createProfile(options = {}) {
    const profile = createFillProfile(options)
    profiles.value.push(profile)
    currentProfileId.value = profile.id
    return profile
  }
  
  /**
   * Обновить профиль
   */
  function updateProfile(profileId, updates) {
    const profile = profiles.value.find(p => p.id === profileId)
    if (profile) {
      Object.assign(profile, updates, { updatedAt: Date.now() })
    }
    return profile
  }
  
  /**
   * Удалить профиль
   */
  function deleteProfile(profileId) {
    const index = profiles.value.findIndex(p => p.id === profileId)
    if (index !== -1) {
      profiles.value.splice(index, 1)
      if (currentProfileId.value === profileId) {
        currentProfileId.value = profiles.value[0]?.id || null
      }
    }
  }
  
  /**
   * Дублировать профиль
   */
  function duplicateProfile(profileId) {
    const source = profiles.value.find(p => p.id === profileId)
    if (!source) return null
    
    const copy = createFillProfile({
      ...JSON.parse(JSON.stringify(source)),
      name: `${source.name} (копия)`
    })
    copy.id = generateId()
    copy.layers = copy.layers.map(l => ({ ...l, id: generateId() }))
    
    profiles.value.push(copy)
    return copy
  }
  
  /**
   * Добавить слой к профилю
   */
  function addLayer(profileId, layerOptions = {}) {
    const profile = profiles.value.find(p => p.id === profileId)
    if (!profile) return null
    
    const layer = createFillLayer(layerOptions)
    profile.layers.push(layer)
    profile.updatedAt = Date.now()
    return layer
  }
  
  /**
   * Обновить слой
   */
  function updateLayer(profileId, layerId, updates) {
    const profile = profiles.value.find(p => p.id === profileId)
    if (!profile) return null
    
    const layer = profile.layers.find(l => l.id === layerId)
    if (layer) {
      Object.assign(layer, updates)
      profile.updatedAt = Date.now()
    }
    return layer
  }
  
  /**
   * Удалить слой
   */
  function removeLayer(profileId, layerId) {
    const profile = profiles.value.find(p => p.id === profileId)
    if (!profile) return
    
    const index = profile.layers.findIndex(l => l.id === layerId)
    if (index !== -1) {
      profile.layers.splice(index, 1)
      profile.updatedAt = Date.now()
    }
  }
  
  /**
   * Добавить условие к слою
   */
  function addCondition(profileId, layerId, conditionOptions = {}) {
    const profile = profiles.value.find(p => p.id === profileId)
    if (!profile) return null
    
    const layer = profile.layers.find(l => l.id === layerId)
    if (!layer) return null
    
    const condition = createCondition(conditionOptions)
    layer.conditions.push(condition)
    profile.updatedAt = Date.now()
    return condition
  }
  
  /**
   * Удалить условие
   */
  function removeCondition(profileId, layerId, conditionId) {
    const profile = profiles.value.find(p => p.id === profileId)
    if (!profile) return
    
    const layer = profile.layers.find(l => l.id === layerId)
    if (!layer) return
    
    const index = layer.conditions.findIndex(c => c.id === conditionId)
    if (index !== -1) {
      layer.conditions.splice(index, 1)
      profile.updatedAt = Date.now()
    }
  }
  
  /**
   * Выбрать профиль для редактирования
   */
  function selectProfile(profileId) {
    currentProfileId.value = profileId
  }
  
  /**
   * Установить превью
   */
  function setPreview(data) {
    previewData.value = data
  }
  
  /**
   * Очистить превью
   */
  function clearPreview() {
    previewData.value = null
  }
  
  /**
   * Экспорт профилей
   */
  function exportProfiles() {
    return JSON.stringify(profiles.value, null, 2)
  }
  
  /**
   * Импорт профилей
   */
  function importProfiles(jsonString, replace = false) {
    try {
      const imported = JSON.parse(jsonString)
      if (!Array.isArray(imported)) {
        throw new Error('Неверный формат данных')
      }
      
      if (replace) {
        profiles.value = imported
      } else {
        // Генерируем новые ID чтобы избежать конфликтов
        imported.forEach(profile => {
          profile.id = generateId()
          profile.layers = profile.layers.map(l => ({
            ...l,
            id: generateId(),
            conditions: l.conditions.map(c => ({ ...c, id: generateId() }))
          }))
          profiles.value.push(profile)
        })
      }
      
      return true
    } catch (e) {
      console.error('Ошибка импорта профилей:', e)
      return false
    }
  }
  
  /**
   * Создать профиль по умолчанию (пример)
   */
  function createDefaultProfile() {
    const profile = createProfile({
      name: 'Лесная поляна',
      description: 'Трава с редкими деревьями и кустами',
      baseTerrain: 'grass'
    })
    
    // Слой деревьев
    addLayer(profile.id, {
      name: 'Деревья',
      terrainId: 'forest_light',
      density: 15,
      clustering: 40
    })
    
    // Слой высокой травы
    addLayer(profile.id, {
      name: 'Высокая трава',
      terrainId: 'tall_grass',
      density: 25,
      clustering: 20
    })
    
    return profile
  }
  
  return {
    // State
    profiles,
    currentProfileId,
    previewData,
    
    // Getters
    currentProfile,
    sortedProfiles,
    
    // Actions
    createProfile,
    updateProfile,
    deleteProfile,
    duplicateProfile,
    addLayer,
    updateLayer,
    removeLayer,
    addCondition,
    removeCondition,
    selectProfile,
    setPreview,
    clearPreview,
    exportProfiles,
    importProfiles,
    createDefaultProfile
  }
}, {
  persist: {
    key: 'trip-fill-profiles',
    paths: ['profiles']
  }
})
