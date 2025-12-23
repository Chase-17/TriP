<script setup>
/**
 * NpcPanel - панель управления NPC для мастера
 * Показывает список NPC с возможностью создания, редактирования, копирования и удаления
 */
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useCharactersStore } from '@/stores/characters'
import { useSessionStore } from '@/stores/session'
import { useBattleMapStore } from '@/stores/battleMap'
import npcTemplatesData from '@/data/npcTemplates.json'
import CharacterPortrait from '../character/CharacterPortrait.vue'

const charactersStore = useCharactersStore()
const sessionStore = useSessionStore()
const battleMapStore = useBattleMapStore()

const emit = defineEmits(['open-character-sheet'])

const categories = npcTemplatesData.categories
const difficulties = npcTemplatesData.difficulties

// Состояние
const filterCategory = ref('all')
const filterDifficulty = ref('all')
const searchQuery = ref('')

// Старые переменные для совместимости (можно удалить позже)
const showCreator = ref(false)
const editingNpcId = ref(null)
const editingNpcData = ref(null)

// Все NPC
const allNpcs = computed(() => charactersStore.allNpcs)

// Фильтрованные NPC
const filteredNpcs = computed(() => {
  let result = allNpcs.value
  
  if (filterCategory.value !== 'all') {
    result = result.filter(n => n.category === filterCategory.value)
  }
  
  if (filterDifficulty.value !== 'all') {
    result = result.filter(n => n.difficulty === filterDifficulty.value)
  }
  
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(n => n.name.toLowerCase().includes(query))
  }
  
  return result
})

// Сгруппированные по категориям
const npcsByCategory = computed(() => {
  const grouped = {}
  filteredNpcs.value.forEach(npc => {
    const cat = npc.category || 'other'
    if (!grouped[cat]) {
      grouped[cat] = []
    }
    grouped[cat].push(npc)
  })
  return grouped
})

// === МЕТОДЫ ===

// Создать нового NPC и открыть лист персонажа
const openCreateNpc = () => {
  const newNpc = charactersStore.createNpc({
    name: 'Новый NPC',
    category: 'humanoid',
    difficulty: 'regular'
  })
  // Синхронизируем с игроками
  sessionStore.broadcastAllCharacters()
  // Открываем лист персонажа для редактирования
  emit('open-character-sheet', newNpc.id)
}

// Открыть редактирование NPC (через стандартный лист персонажа)
const openEditNpc = (npc) => {
  emit('open-character-sheet', npc.id)
}

// Закрыть редактор (оставляем для совместимости со старым NpcCreator)
const closeCreator = () => {
  showCreator.value = false
  editingNpcId.value = null
  editingNpcData.value = null
}

// Дублировать NPC
const duplicateNpc = (npc) => {
  const newNpcData = {
    ...npc,
    name: npc.name + ' (копия)'
  }
  delete newNpcData.id
  charactersStore.createNpc(newNpcData)
  // Синхронизируем с игроками
  sessionStore.broadcastAllCharacters()
}

// Удалить NPC
const deleteNpc = (npcId) => {
  if (confirm('Удалить этого NPC?')) {
    // Удаляем токен с карты
    const activeMap = battleMapStore.activeMap
    if (activeMap) {
      battleMapStore.removeTokenByCharacterId(activeMap.id, npcId)
    }
    charactersStore.deleteNpc(npcId)
    // Синхронизируем удаление с игроками
    sessionStore.sendCharacterDelete(npcId)
  }
}

// Отправить изображение NPC игрокам как сплеш
const sendNpcImageToPlayers = (npc, imageUrl) => {
  if (!imageUrl) return
  sessionStore.sendSplashImage(imageUrl, {
    title: npc.name,
    duration: 5000
  })
}

// Получить информацию о категории
const getCategoryInfo = (catId) => {
  return categories.find(c => c.id === catId) || { name: 'Прочее', icon: 'mdi:help-circle' }
}

// Получить информацию о сложности
const getDifficultyInfo = (diffId) => {
  return difficulties.find(d => d.id === diffId) || { name: 'Рядовой', color: '#22c55e' }
}

// Доступные фракции (должны совпадать с NpcCreator)
const factionColors = {
  player: '#22c55e',
  enemy: '#ef4444',
  neutral: '#94a3b8',
  wildlife: '#f59e0b',
  undead: '#8b5cf6',
  guards: '#3b82f6',
  bandits: '#dc2626',
  merchants: '#eab308'
}

const factionNames = {
  player: 'Игроки',
  enemy: 'Враги',
  neutral: 'Нейтральные',
  wildlife: 'Дикие звери',
  undead: 'Нежить',
  guards: 'Стража',
  bandits: 'Бандиты',
  merchants: 'Торговцы'
}

// Получить цвет фракции
const getFactionColor = (factionId) => {
  return factionColors[factionId] || '#94a3b8'
}

// Получить название фракции
const getFactionName = (factionId) => {
  if (factionId.startsWith('custom_')) {
    return factionId.replace('custom_', '').replace(/_/g, ' ')
  }
  return factionNames[factionId] || factionId
}
</script>

<template>
  <div class="npc-panel">
    <!-- Заголовок -->
    <header class="panel-header">
      <div class="header-info">
        <h2 class="header-title">
          <Icon icon="mdi:skull" />
          NPC и монстры
        </h2>
        <span class="header-count">{{ allNpcs.length }}</span>
      </div>
      <button class="btn-create" @click="openCreateNpc">
        <Icon icon="mdi:plus" />
        <span>Создать</span>
      </button>
    </header>
    
    <!-- Фильтры -->
    <div class="filters">
      <input 
        v-model="searchQuery"
        type="text" 
        class="search-input" 
        placeholder="Поиск по имени..."
      />
      <select v-model="filterCategory" class="filter-select">
        <option value="all">Все категории</option>
        <option v-for="cat in categories" :key="cat.id" :value="cat.id">
          {{ cat.name }}
        </option>
      </select>
      <select v-model="filterDifficulty" class="filter-select">
        <option value="all">Любая сложность</option>
        <option v-for="diff in difficulties" :key="diff.id" :value="diff.id">
          {{ diff.name }}
        </option>
      </select>
    </div>
    
    <!-- Список NPC -->
    <div class="npc-list">
      <template v-if="filteredNpcs.length > 0">
        <div 
          v-for="(npcs, categoryId) in npcsByCategory" 
          :key="categoryId" 
          class="category-group"
        >
          <div class="category-header">
            <Icon :icon="getCategoryInfo(categoryId).icon" />
            <span>{{ getCategoryInfo(categoryId).name }}</span>
            <span class="category-count">{{ npcs.length }}</span>
          </div>
          
          <div class="npcs-grid">
            <div 
              v-for="npc in npcs" 
              :key="npc.id" 
              class="npc-card"
              @click="openEditNpc(npc)"
            >
              <!-- Портрет -->
              <div class="npc-portrait">
                <CharacterPortrait 
                  v-if="npc.portrait"
                  :portrait="npc.portrait"
                  :size="48"
                />
                <div v-else class="portrait-placeholder">
                  <Icon :icon="getCategoryInfo(npc.category).icon" />
                </div>
              </div>
              
              <!-- Инфо -->
              <div class="npc-info">
                <div class="npc-name">{{ npc.name }}</div>
                <div class="npc-meta">
                  <span 
                    class="npc-difficulty" 
                    :style="{ color: getDifficultyInfo(npc.difficulty).color }"
                  >
                    {{ getDifficultyInfo(npc.difficulty).name }}
                  </span>
                  <span class="npc-hp" v-if="npc.combat?.healthType === 'simple'">
                    ❤️ {{ npc.combat?.hp }}/{{ npc.combat?.maxHp }}
                  </span>
                </div>
                <!-- Фракции -->
                <div class="npc-factions" v-if="npc.factions?.length">
                  <span 
                    v-for="factionId in npc.factions.slice(0, 3)" 
                    :key="factionId"
                    class="faction-badge"
                    :style="{ background: getFactionColor(factionId) + '30', color: getFactionColor(factionId) }"
                  >
                    {{ getFactionName(factionId) }}
                  </span>
                  <span v-if="npc.factions.length > 3" class="faction-more">
                    +{{ npc.factions.length - 3 }}
                  </span>
                </div>
              </div>
              
              <!-- Действия -->
              <div class="npc-actions" @click.stop>
                <button 
                  class="action-btn" 
                  title="Дублировать"
                  @click="duplicateNpc(npc)"
                >
                  <Icon icon="mdi:content-copy" />
                </button>
                <button 
                  v-if="npc.images?.length > 0"
                  class="action-btn" 
                  title="Показать игрокам"
                  @click="sendNpcImageToPlayers(npc, npc.images[0])"
                >
                  <Icon icon="mdi:eye" />
                </button>
                <button 
                  class="action-btn delete" 
                  title="Удалить"
                  @click="deleteNpc(npc.id)"
                >
                  <Icon icon="mdi:delete" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
      
      <!-- Пустое состояние -->
      <div v-else class="empty-state">
        <Icon icon="mdi:ghost" class="empty-icon" />
        <p v-if="searchQuery || filterCategory !== 'all' || filterDifficulty !== 'all'">
          Нет NPC по заданным фильтрам
        </p>
        <p v-else>
          Пока нет созданных NPC.<br>
          Создайте первого противника!
        </p>
        <button class="btn-create-empty" @click="openCreateNpc">
          <Icon icon="mdi:plus" />
          Создать NPC
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.npc-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f172a;
  color: #e2e8f0;
}

/* Header */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: #1e293b;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-count {
  padding: 2px 8px;
  background: rgba(148, 163, 184, 0.2);
  border-radius: 12px;
  font-size: 12px;
  color: #94a3b8;
}

.btn-create {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #22c55e;
  border: none;
  border-radius: 8px;
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-create:hover {
  background: #16a34a;
}

/* Filters */
.filters {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  background: #1e293b;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.search-input, .filter-select {
  padding: 8px 12px;
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 13px;
}

.search-input {
  flex: 1;
}

.search-input:focus, .filter-select:focus {
  outline: none;
  border-color: #3b82f6;
}

/* NPC List */
.npc-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.category-group {
  margin-bottom: 24px;
}

.category-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.category-count {
  padding: 1px 6px;
  background: rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  font-size: 11px;
}

.npcs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.npc-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.npc-card:hover {
  background: #334155;
  border-color: rgba(59, 130, 246, 0.3);
}

.npc-portrait {
  position: relative;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
}

.portrait-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #334155;
  border-radius: 50%;
  color: #64748b;
  font-size: 20px;
}

.npc-type-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 10px;
  color: white;
  border: 2px solid #1e293b;
}

.npc-info {
  flex: 1;
  min-width: 0;
}

.npc-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.npc-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  font-size: 12px;
}

.npc-difficulty {
  font-weight: 500;
}

.npc-hp {
  color: #64748b;
}

.npc-factions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.faction-badge {
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 500;
}

.faction-more {
  font-size: 10px;
  color: #64748b;
}

.npc-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.npc-card:hover .npc-actions {
  opacity: 1;
}

.action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.1);
  border: none;
  border-radius: 6px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: rgba(59, 130, 246, 0.2);
  color: #3b82f6;
}

.action-btn.delete:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  color: #64748b;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  margin: 0 0 20px;
  line-height: 1.5;
}

.btn-create-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 8px;
  color: #3b82f6;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-create-empty:hover {
  background: rgba(59, 130, 246, 0.3);
}

/* Creator overlay */
.creator-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #0f172a;
}
</style>
