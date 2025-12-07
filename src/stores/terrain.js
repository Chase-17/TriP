/**
 * Store для управления террейнами карты
 * Базовые террейны + кастомные от мастера
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import terrainsData from '@/data/terrains.json'

/**
 * Типы видимости
 */
export const VISIBILITY_TYPES = {
  OPEN: 'open',           // Полностью открытая
  PARTIAL: 'partial',     // Маскирующая (частичная)
  BLOCKING: 'blocking'    // Блокирующая
}

/**
 * Диапазоны значений
 */
export const TERRAIN_LIMITS = {
  MOVEMENT_COST: { min: 1, max: 5 },
  MELEE_ADVANTAGE: { min: -2, max: 2 }
}

export const useTerrainStore = defineStore('terrain', () => {
  // ===== STATE =====
  
  // Базовые террейны (из JSON, неизменяемые)
  const baseTerrains = ref(terrainsData.terrains)
  
  // Кастомные террейны мастера (сохраняются)
  const customTerrains = ref([])
  
  // Биомы
  const biomes = ref(terrainsData.biomes)
  
  // Типы видимости
  const visibilityTypes = ref(terrainsData.visibility)
  
  // Загруженные изображения (кэш)
  const imageCache = ref(new Map())
  
  // Фильтры
  const filters = ref({
    search: '',
    biome: null,
    visibility: null,
    movementCostMin: 1,
    movementCostMax: 5,
    meleeAdvantageMin: -2,
    meleeAdvantageMax: 2,
    tags: []
  })
  
  // ===== GETTERS =====
  
  /**
   * Все террейны (базовые + кастомные)
   */
  const allTerrains = computed(() => {
    return [...baseTerrains.value, ...customTerrains.value]
  })
  
  /**
   * Все уникальные теги
   */
  const allTags = computed(() => {
    const tagSet = new Set()
    allTerrains.value.forEach(t => {
      t.tags?.forEach(tag => tagSet.add(tag))
    })
    return Array.from(tagSet).sort()
  })
  
  /**
   * Отфильтрованные террейны
   */
  const filteredTerrains = computed(() => {
    return allTerrains.value.filter(terrain => {
      // Поиск по имени/описанию
      if (filters.value.search) {
        const search = filters.value.search.toLowerCase()
        const nameMatch = terrain.name.toLowerCase().includes(search)
        const descMatch = terrain.description?.toLowerCase().includes(search)
        if (!nameMatch && !descMatch) return false
      }
      
      // Фильтр по биому
      if (filters.value.biome && terrain.biome !== filters.value.biome) {
        return false
      }
      
      // Фильтр по видимости
      if (filters.value.visibility && terrain.visibility !== filters.value.visibility) {
        return false
      }
      
      // Фильтр по стоимости передвижения
      if (terrain.movementCost < filters.value.movementCostMin ||
          terrain.movementCost > filters.value.movementCostMax) {
        return false
      }
      
      // Фильтр по преимуществу ближнего боя
      if (terrain.meleeAdvantage < filters.value.meleeAdvantageMin ||
          terrain.meleeAdvantage > filters.value.meleeAdvantageMax) {
        return false
      }
      
      // Фильтр по тегам (все выбранные теги должны присутствовать)
      if (filters.value.tags.length > 0) {
        const terrainTags = new Set(terrain.tags || [])
        const hasAllTags = filters.value.tags.every(tag => terrainTags.has(tag))
        if (!hasAllTags) return false
      }
      
      return true
    })
  })
  
  /**
   * Террейны сгруппированные по биому
   */
  const terrainsByBiome = computed(() => {
    const groups = {}
    biomes.value.forEach(biome => {
      groups[biome.id] = {
        biome,
        terrains: filteredTerrains.value.filter(t => t.biome === biome.id)
      }
    })
    return groups
  })
  
  // ===== ACTIONS =====
  
  /**
   * Получить террейн по ID
   */
  function getTerrainById(id) {
    return allTerrains.value.find(t => t.id === id) || null
  }
  
  /**
   * Получить отфильтрованные террейны с внешними параметрами
   */
  function getFilteredTerrains(options = {}) {
    const {
      biome = null,
      visibility = null,
      passabilityMin = 0,
      passabilityMax = 5,
      meleeAdvantageMin = -2,
      meleeAdvantageMax = 2,
      search = '',
      tags = []
    } = options
    
    return allTerrains.value.filter(terrain => {
      // Поиск по имени/описанию
      if (search) {
        const searchLower = search.toLowerCase()
        const nameMatch = terrain.name.toLowerCase().includes(searchLower)
        const descMatch = terrain.description?.toLowerCase().includes(searchLower)
        if (!nameMatch && !descMatch) return false
      }
      
      // Фильтр по биому
      if (biome && terrain.biome !== biome) return false
      
      // Фильтр по видимости
      if (visibility && terrain.visibility !== visibility) return false
      
      // Фильтр по стоимости передвижения (passability = movementCost)
      const cost = terrain.movementCost ?? 1
      if (cost < passabilityMin || cost > passabilityMax) return false
      
      // Фильтр по преимуществу ближнего боя
      const melee = terrain.meleeAdvantage ?? 0
      if (melee < meleeAdvantageMin || melee > meleeAdvantageMax) return false
      
      // Фильтр по тегам
      if (tags.length > 0) {
        const terrainTags = new Set(terrain.tags || [])
        if (!tags.every(tag => terrainTags.has(tag))) return false
      }
      
      return true
    })
  }
  
  /**
   * Получить биом по ID
   */
  function getBiomeById(id) {
    return biomes.value.find(b => b.id === id) || null
  }
  
  /**
   * Получить цвет террейна (с фоллбэком на цвет биома)
   */
  function getTerrainColor(terrainId) {
    const terrain = getTerrainById(terrainId)
    if (!terrain) return '#888888'
    
    if (terrain.color) return terrain.color
    
    const biome = getBiomeById(terrain.biome)
    return biome?.color || '#888888'
  }
  
  /**
   * Получить изображение террейна
   */
  function getTerrainImage(terrainId) {
    const terrain = getTerrainById(terrainId)
    return terrain?.image || null
  }
  
  /**
   * Загрузить изображение в кэш
   */
  async function loadImage(src) {
    if (imageCache.value.has(src)) {
      return imageCache.value.get(src)
    }
    
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        imageCache.value.set(src, img)
        resolve(img)
      }
      img.onerror = reject
      img.src = src
    })
  }
  
  /**
   * Добавить кастомный террейн
   */
  function addCustomTerrain(terrain) {
    // Генерируем уникальный ID
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const newTerrain = {
      id,
      name: terrain.name || 'Новый террейн',
      description: terrain.description || '',
      biome: terrain.biome || 'plains',
      color: terrain.color || '#888888',
      image: terrain.image || null,
      visibility: terrain.visibility || 'open',
      movementCost: Math.max(1, Math.min(5, terrain.movementCost || 1)),
      meleeAdvantage: Math.max(-2, Math.min(2, terrain.meleeAdvantage || 0)),
      tags: terrain.tags || [],
      isCustom: true,
      createdAt: Date.now()
    }
    
    customTerrains.value.push(newTerrain)
    return newTerrain
  }
  
  /**
   * Обновить кастомный террейн
   */
  function updateCustomTerrain(id, updates) {
    const index = customTerrains.value.findIndex(t => t.id === id)
    if (index === -1) return false
    
    customTerrains.value[index] = {
      ...customTerrains.value[index],
      ...updates,
      updatedAt: Date.now()
    }
    
    return true
  }
  
  /**
   * Удалить кастомный террейн
   */
  function removeCustomTerrain(id) {
    const index = customTerrains.value.findIndex(t => t.id === id)
    if (index === -1) return false
    
    customTerrains.value.splice(index, 1)
    return true
  }
  
  /**
   * Установить фильтры
   */
  function setFilters(newFilters) {
    filters.value = { ...filters.value, ...newFilters }
  }
  
  /**
   * Сбросить фильтры
   */
  function resetFilters() {
    filters.value = {
      search: '',
      biome: null,
      visibility: null,
      movementCostMin: 1,
      movementCostMax: 5,
      meleeAdvantageMin: -2,
      meleeAdvantageMax: 2,
      tags: []
    }
  }
  
  /**
   * Экспорт кастомных террейнов
   */
  function exportCustomTerrains() {
    return JSON.stringify(customTerrains.value, null, 2)
  }
  
  /**
   * Импорт кастомных террейнов
   */
  function importCustomTerrains(jsonString) {
    try {
      const imported = JSON.parse(jsonString)
      if (!Array.isArray(imported)) throw new Error('Invalid format')
      
      // Добавляем с новыми ID чтобы избежать конфликтов
      imported.forEach(terrain => {
        addCustomTerrain(terrain)
      })
      
      return true
    } catch (e) {
      console.error('Failed to import terrains:', e)
      return false
    }
  }
  
  return {
    // State
    baseTerrains,
    customTerrains,
    biomes,
    visibilityTypes,
    imageCache,
    filters,
    
    // Getters
    allTerrains,
    allTags,
    filteredTerrains,
    terrainsByBiome,
    
    // Actions
    getTerrainById,
    getFilteredTerrains,
    getBiomeById,
    getTerrainColor,
    getTerrainImage,
    loadImage,
    addCustomTerrain,
    updateCustomTerrain,
    removeCustomTerrain,
    setFilters,
    resetFilters,
    exportCustomTerrains,
    importCustomTerrains
  }
}, {
  persist: {
    key: 'trip-terrains',
    paths: ['customTerrains']
  }
})
