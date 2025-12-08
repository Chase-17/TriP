<template>
  <div class="mobile-control-panel">
    <!-- Тонкая верхняя панель -->
    <div 
      class="mobile-header"
      :class="{ 'expanded': headerExpanded }"
    >
      <!-- Минимальная строка -->
      <div class="header-minimal" @click="toggleHeader">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <!-- Иконка меню -->
          <button class="header-icon">
            <Icon :icon="headerExpanded ? 'mdi:chevron-up' : 'mdi:menu'" class="w-4 h-4" />
          </button>
          
          <!-- Портрет персонажа (если есть) -->
          <div v-if="character" class="character-mini-portrait">
            <img 
              :src="getCharacterPortrait(character)" 
              :alt="character.name"
              class="w-6 h-6 rounded-full object-cover bg-slate-700"
              @error="(e) => e.target.style.display = 'none'"
            />
          </div>
          
          <!-- Краткая информация -->
          <div class="header-info">
            <span class="text-xs text-slate-300 truncate">
              {{ currentTurnInfo }}
            </span>
          </div>
        </div>
        
        <!-- Статус подключения -->
        <div class="connection-indicator" :class="connectionStatusClass">
          <div class="w-2 h-2 rounded-full bg-current"></div>
        </div>
      </div>
      
      <!-- Расширенная панель -->
      <div v-if="headerExpanded" class="header-expanded">
        <div class="expanded-content">
          <!-- Информация о персонаже -->
          <div v-if="character" class="character-info">
            <div class="flex items-center gap-3 mb-3">
              <img 
                :src="getCharacterPortrait(character)" 
                :alt="character.name"
                class="w-10 h-10 rounded-lg object-cover bg-slate-700"
                @error="(e) => e.target.style.display = 'none'"
              />
              <div>
                <h3 class="text-sm font-semibold text-slate-100">{{ character.name }}</h3>
                <p class="text-xs text-slate-400">{{ character.class || 'Персонаж' }}</p>
              </div>
            </div>
            
            <!-- Быстрые показатели -->
            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-label">HP</span>
                <span class="stat-value">{{ characterHP }}</span>
              </div>
              <div v-if="character.combat?.movementPoints !== undefined" class="stat-item">
                <span class="stat-label">Движение</span>
                <span class="stat-value">{{ character.combat.movementPoints }}</span>
              </div>
              <div v-if="character.combat?.actionPoints !== undefined" class="stat-item">
                <span class="stat-label">Действия</span>
                <span class="stat-value">{{ character.combat.actionPoints }}</span>
              </div>
            </div>
          </div>
          
          <!-- Навигация -->
          <div class="navigation-tabs">
            <button
              v-for="item in navItems"
              :key="item.id"
              class="nav-tab"
              :class="{ active: activeView === item.id }"
              @click="$emit('set-view', item.id)"
            >
              <Icon :icon="item.icon" class="w-4 h-4" />
              <span class="text-xs">{{ item.label }}</span>
            </button>
          </div>
          
          <!-- Кнопка выхода -->
          <button 
            class="exit-button"
            @click="$emit('leave-room')"
          >
            <Icon icon="mdi:exit-to-app" class="w-4 h-4" />
            <span class="text-xs">Выход</span>
          </button>
        </div>
      </div>
    </div>
    
    <!-- Нижняя панель управления -->
    <div class="mobile-bottom-panel">
      <div class="bottom-content">
        <!-- Информация о выбранном действии -->
        <div v-if="pendingAction" class="action-preview">
          <div class="action-info">
            <Icon :icon="pendingAction.icon" class="w-5 h-5 text-sky-400" />
            <div>
              <p class="text-sm font-medium text-slate-100">{{ pendingAction.title }}</p>
              <p class="text-xs text-slate-400">{{ pendingAction.description }}</p>
            </div>
          </div>
          <div class="action-buttons">
            <button 
              class="btn-cancel"
              @click="$emit('cancel-action')"
            >
              Отмена
            </button>
            <button 
              class="btn-confirm"
              @click="$emit('confirm-action')"
              :disabled="!pendingAction.canConfirm"
            >
              Подтвердить
            </button>
          </div>
        </div>
        
        <!-- Обычные кнопки действий -->
        <div v-else class="action-buttons-grid">
          <button
            v-for="action in availableActions"
            :key="action.id"
            class="action-button"
            :class="{ disabled: !action.enabled }"
            :disabled="!action.enabled"
            @click="$emit('select-action', action)"
          >
            <Icon :icon="action.icon" class="w-6 h-6" />
            <span class="text-xs">{{ action.label }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { presetUrl } from '@/utils/assets'

const props = defineProps({
  character: {
    type: Object,
    default: null
  },
  activeView: {
    type: String,
    default: 'battle-map'
  },
  connectionStatus: {
    type: String,
    default: 'disconnected'
  },
  currentTurn: {
    type: Object,
    default: null
  },
  isPlayerTurn: {
    type: Boolean,
    default: false
  },
  pendingAction: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['set-view', 'leave-room', 'select-action', 'confirm-action', 'cancel-action'])

const headerExpanded = ref(false)

const navItems = [
  { id: 'battle-map', label: 'Карта', icon: 'mdi:map' },
  { id: 'character-sheet', label: 'Персонаж', icon: 'mdi:account' },
  { id: 'chat', label: 'Чат', icon: 'mdi:chat' }
]

// Получить портрет персонажа
const getCharacterPortrait = (character) => {
  if (!character?.portrait) return null
  if (typeof character.portrait === 'number') {
    return presetUrl(character.portrait)
  }
  return character.portrait
}

// Информация об HP
const characterHP = computed(() => {
  if (!props.character?.combat) return '—'
  const current = props.character.combat.currentHP || 0
  const max = props.character.combat.maxHP || 0
  return `${current}/${max}`
})

// Информация о текущем ходе
const currentTurnInfo = computed(() => {
  if (props.isPlayerTurn) {
    return 'Ваш ход'
  } else if (props.currentTurn) {
    return `Ход: ${props.currentTurn.name}`
  }
  return 'Ожидание...'
})

// Класс статуса подключения
const connectionStatusClass = computed(() => {
  switch (props.connectionStatus) {
    case 'connected': return 'text-emerald-400'
    case 'connecting': return 'text-amber-400'
    default: return 'text-rose-400'
  }
})

// Доступные действия в зависимости от хода
const availableActions = computed(() => {
  if (props.isPlayerTurn) {
    return [
      { id: 'move', label: 'Движение', icon: 'mdi:run', enabled: true },
      { id: 'attack', label: 'Атака', icon: 'mdi:sword', enabled: true },
      { id: 'defend', label: 'Защита', icon: 'mdi:shield', enabled: true },
      { id: 'skill', label: 'Навык', icon: 'mdi:star', enabled: true }
    ]
  } else {
    return [
      { id: 'ready', label: 'Готов', icon: 'mdi:check', enabled: true },
      { id: 'help', label: 'Помощь', icon: 'mdi:help', enabled: true }
    ]
  }
})

const toggleHeader = () => {
  headerExpanded.value = !headerExpanded.value
}
</script>

<style scoped>
.mobile-control-panel {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: rgb(2 6 23);
}

.mobile-header {
  background-color: rgb(15 23 42 / 0.95);
  backdrop-filter: blur(4px);
  border-bottom: 1px solid rgb(51 65 85 / 0.5);
  z-index: 50;
  transition: all 200ms;
}

.header-minimal {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.75rem;
  min-height: 44px;
  cursor: pointer;
}

.header-minimal:active {
  background-color: rgb(30 41 59 / 0.5);
}

.header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  color: rgb(148 163 184);
  transition: colors 200ms;
}

.header-icon:active {
  background-color: rgb(30 41 59 / 0.5);
}

.character-mini-portrait {
  flex-shrink: 0;
}

.header-info {
  flex: 1;
  min-width: 0;
}

.connection-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
}

.header-expanded {
  border-top: 1px solid rgb(51 65 85 / 0.3);
  background-color: rgb(30 41 59 / 0.3);
}

.expanded-content {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.character-info {
  background-color: rgb(30 41 59 / 0.3);
  border-radius: 0.5rem;
  padding: 0.75rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}

.stat-item {
  text-align: center;
  padding: 0.5rem;
  background-color: rgb(15 23 42 / 0.5);
  border-radius: 0.375rem;
}

.stat-label {
  display: block;
  font-size: 0.75rem;
  color: rgb(148 163 184);
  margin-bottom: 0.25rem;
}

.stat-value {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(241 245 249);
}

.navigation-tabs {
  display: flex;
  gap: 0.5rem;
}

.nav-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  flex: 1;
  background-color: rgb(30 41 59 / 0.3);
  color: rgb(148 163 184);
  transition: colors 200ms;
}

.nav-tab:active {
  background-color: rgb(51 65 85 / 0.5);
}

.nav-tab.active {
  background-color: rgb(14 165 233 / 0.2);
  color: rgb(56 189 248);
  border: 1px solid rgb(56 189 248 / 0.3);
}

.exit-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  width: 100%;
  background-color: rgb(239 68 68 / 0.2);
  color: rgb(248 113 113);
  border: 1px solid rgb(248 113 113 / 0.3);
  transition: colors 200ms;
}

.exit-button:active {
  background-color: rgb(239 68 68 / 0.3);
}

.mobile-bottom-panel {
  background-color: rgb(15 23 42 / 0.95);
  backdrop-filter: blur(4px);
  border-top: 1px solid rgb(51 65 85 / 0.5);
  padding: 1rem;
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}

.bottom-content {
  max-width: 28rem;
  margin: 0 auto;
}

.action-preview {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.action-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background-color: rgb(30 41 59 / 0.5);
  border-radius: 0.5rem;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn-cancel {
  flex: 1;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
  background-color: rgb(51 65 85);
  color: rgb(203 213 225);
  border: 1px solid rgb(75 85 99);
  transition: colors 200ms;
}

.btn-cancel:active {
  background-color: rgb(75 85 99);
}

.btn-confirm {
  flex: 1;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-weight: 500;
  background-color: rgb(14 165 233);
  color: white;
  border: 1px solid rgb(56 189 248);
  transition: colors 200ms;
}

.btn-confirm:active {
  background-color: rgb(2 132 199);
}

.btn-confirm:disabled {
  background-color: rgb(75 85 99);
  color: rgb(148 163 184);
  border-color: rgb(100 116 139);
}

.action-buttons-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.action-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  border-radius: 0.75rem;
  background-color: rgb(30 41 59 / 0.5);
  border: 1px solid rgb(51 65 85 / 0.5);
  color: rgb(203 213 225);
  transition: all 200ms;
}

.action-button:active {
  background-color: rgb(51 65 85 / 0.7);
  transform: scale(0.95);
}

.action-button.disabled {
  opacity: 0.5;
  background-color: rgb(30 41 59 / 0.3);
}
</style>