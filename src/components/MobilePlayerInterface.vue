<template>
  <!-- Мобильный интерфейс игрока -->
  <div class="mobile-player-interface" :class="{ 'player-turn': isPlayerTurn }">
    <!-- Верхняя инфопанель (только для карты) -->
    <div v-if="activeView === 'battle-map'" class="mobile-top-section">
      <!-- Инфокарточка -->
      <MobileInfoCard
        :selected-token="selectedToken"
        :selected-hex="selectedHex"
        :player-character="character"
        :player-facing="playerFacing"
        :collapsed="infoCardCollapsed"
        :is-player-turn="isPlayerTurn"
        :player-token-position="playerTokenPosition"
        @toggle-collapse="infoCardCollapsed = !infoCardCollapsed"
        @open-character-sheet="(charId) => $emit('open-character-sheet', charId)"
        @switch-equipment="$emit('switch-equipment')"
        @move-to-hex="(hex) => $emit('move-to-hex', hex)"
      />
    </div>
    
    <!-- Оверлей реакции -->
    <Transition name="reaction-fade">
      <div v-if="reactionPrompt" class="reaction-overlay">
        <div class="reaction-card">
          <!-- Таймер -->
          <div class="reaction-timer">
            <div 
              class="timer-bar" 
              :style="{ width: reactionTimePercent + '%' }"
            ></div>
          </div>
          
          <!-- Содержимое -->
          <div class="reaction-content">
            <div class="reaction-icon">
              <Icon icon="mdi:flash" class="w-8 h-8 text-amber-400" />
            </div>
            <div class="reaction-text">
              <h4 class="reaction-title">{{ reactionPrompt.title || 'Реакция!' }}</h4>
              <p class="reaction-description">{{ reactionPrompt.description }}</p>
            </div>
          </div>
          
          <!-- Кнопки -->
          <div class="reaction-buttons">
            <button class="reaction-btn decline" @click="emit('reaction-decline', reactionPrompt.id)">
              <Icon icon="mdi:close" class="w-5 h-5" />
              <span>Отказ</span>
            </button>
            <button class="reaction-btn accept" @click="emit('reaction-accept', reactionPrompt.id)">
              <Icon icon="mdi:check" class="w-5 h-5" />
              <span>Использовать</span>
            </button>
          </div>
          
          <!-- Оставшееся время -->
          <div class="reaction-time-left">
            {{ reactionSecondsLeft }}с
          </div>
        </div>
      </div>
    </Transition>
    
    <!-- Нижняя панель - навигация + действия -->
    <div class="mobile-bottom-panel" :class="{ 'turn-active': isPlayerTurn }">
      <!-- Контент нижней панели -->
      <div class="bottom-content">
        <!-- Режим выбора действия (только для карты на своём ходу) -->
        <template v-if="activeView === 'battle-map' && pendingAction">
          <div class="action-preview">
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
        </template>
        
        <!-- Кнопки действий (только для карты, без активного действия) -->
        <template v-else-if="activeView === 'battle-map' && !pendingAction">
          <div class="action-buttons-grid">
            <button
              v-for="action in availableActions"
              :key="action.id"
              class="action-button"
              :class="{ disabled: !action.enabled }"
              :disabled="!action.enabled"
              @click="handleActionClick(action)"
            >
              <Icon :icon="action.icon" class="w-6 h-6" />
              <span class="text-xs">{{ action.label }}</span>
            </button>
          </div>
        </template>
      </div>
      
      <!-- Навигация + статус (всегда видна) -->
      <div class="nav-bar">
        <!-- Кнопка меню (слева) -->
        <button class="menu-btn" @click="toggleMenu">
          <Icon icon="mdi:menu" class="w-5 h-5" />
        </button>
        
        <!-- Навигация (центр) -->
        <div class="nav-tabs">
          <button
            v-for="item in navItems"
            :key="item.id"
            class="nav-tab"
            :class="{ active: activeView === item.id }"
            @click="selectNavItem(item.id)"
          >
            <Icon :icon="item.icon" class="w-5 h-5" />
          </button>
        </div>
        
        <!-- Статус подключения (справа с текстом) -->
        <div class="connection-indicator" :class="connectionStatusClass">
          <span class="connection-text">{{ connectionStatusText }}</span>
          <div class="connection-dot"></div>
        </div>
      </div>
    </div>
    
    <!-- Выпадающее меню -->
    <Transition name="menu-slide">
      <div v-if="menuOpen" class="dropdown-menu">
        <div class="menu-overlay" @click="menuOpen = false"></div>
        <div class="menu-content">
          <!-- Кнопка выхода -->
          <button class="exit-button" @click="$emit('leave-room')">
            <Icon icon="mdi:exit-to-app" class="w-5 h-5" />
            <span>Выйти из комнаты</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>
<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import MobileInfoCard from './MobileInfoCard.vue'

const props = defineProps({
  character: {
    type: Object,
    default: null
  },
  // Выбранный токен на карте
  selectedToken: {
    type: Object,
    default: null
  },
  // Выбранный гекс (если не токен)
  selectedHex: {
    type: Object,
    default: null
  },
  // Направление персонажа игрока
  playerFacing: {
    type: Number,
    default: 0
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
  },
  // Предложение реакции от мастера
  reactionPrompt: {
    type: Object,
    default: null
    // { id, title, description, timeoutSeconds, startedAt }
  },
  // Позиция токена игрока на карте
  playerTokenPosition: {
    type: Object,
    default: null // { q, r }
  }
})

const emit = defineEmits(['set-view', 'leave-room', 'select-action', 'confirm-action', 'cancel-action', 'switch-equipment', 'reaction-accept', 'reaction-decline', 'open-character-sheet', 'move-to-hex'])

// Состояние UI
const infoCardCollapsed = ref(false)
const menuOpen = ref(false)
const reactionTimeTick = ref(0) // Для обновления таймера реакции

// Таймер реакции
let reactionTimerInterval = null

// Следим за reactionPrompt для запуска/остановки таймера
watch(() => props.reactionPrompt, (newPrompt) => {
  if (newPrompt) {
    // Запускаем таймер обновления
    reactionTimerInterval = setInterval(() => {
      reactionTimeTick.value++
      // Проверяем, не истекло ли время
      if (reactionSecondsLeft.value <= 0) {
        clearInterval(reactionTimerInterval)
        emit('reaction-decline', newPrompt.id)
      }
    }, 100)
  } else {
    if (reactionTimerInterval) {
      clearInterval(reactionTimerInterval)
      reactionTimerInterval = null
    }
  }
}, { immediate: true })

onUnmounted(() => {
  if (reactionTimerInterval) {
    clearInterval(reactionTimerInterval)
  }
})

// Вычисляем оставшееся время реакции
const reactionSecondsLeft = computed(() => {
  if (!props.reactionPrompt) return 0
  // Для реактивности
  const _ = reactionTimeTick.value
  const elapsed = (Date.now() - props.reactionPrompt.startedAt) / 1000
  const remaining = Math.max(0, (props.reactionPrompt.timeoutSeconds || 5) - elapsed)
  return Math.ceil(remaining)
})

// Процент оставшегося времени для прогресс-бара
const reactionTimePercent = computed(() => {
  if (!props.reactionPrompt) return 100
  const _ = reactionTimeTick.value
  const elapsed = (Date.now() - props.reactionPrompt.startedAt) / 1000
  const total = props.reactionPrompt.timeoutSeconds || 5
  return Math.max(0, ((total - elapsed) / total) * 100)
})

const navItems = [
  { id: 'battle-map', label: 'Карта', icon: 'mdi:map' },
  { id: 'character-sheet', label: 'Персонаж', icon: 'mdi:account' },
  { id: 'chat', label: 'Чат', icon: 'mdi:chat' }
]

// Класс статуса подключения
const connectionStatusClass = computed(() => {
  switch (props.connectionStatus) {
    case 'connected': return 'status-connected'
    case 'connecting': return 'status-connecting'
    default: return 'status-disconnected'
  }
})

// Текст статуса подключения
const connectionStatusText = computed(() => {
  switch (props.connectionStatus) {
    case 'connected': return 'онлайн'
    case 'connecting': return '...'
    default: return 'офлайн'
  }
})

// Доступные действия в зависимости от хода и контекста
const availableActions = computed(() => {
  // Не ход игрока - минимальные действия
  if (!props.isPlayerTurn) {
    return [
      { id: 'ready', label: 'Готов', icon: 'mdi:check', enabled: true },
      { id: 'help', label: 'Помощь', icon: 'mdi:help-circle', enabled: true }
    ]
  }
  
  // Ход игрока - только снаряжение и особые действия
  return [
    { id: 'equipment', label: 'Снаряжение', icon: 'mdi:bag-personal', enabled: true },
    { id: 'special', label: 'Особые', icon: 'mdi:star-four-points', enabled: true }
  ]
})

// Проверка, является ли выбранный токен своим
const isOwnToken = computed(() => {
  if (!props.selectedToken?.character) return false
  // Сравниваем ID персонажа токена с ID персонажа игрока
  return props.selectedToken.character.id === props.character?.id
})

// Переключение меню
const toggleMenu = () => {
  menuOpen.value = !menuOpen.value
}

// Выбор навигации
const selectNavItem = (id) => {
  emit('set-view', id)
  menuOpen.value = false
}

// Обработка клика по кнопке действия
const handleActionClick = (action) => {
  if (action.id === 'equipment') {
    emit('switch-equipment')
  } else {
    emit('select-action', action)
  }
}
</script>

<style scoped>
/* Общий контейнер */
.mobile-player-interface {
  position: relative;
}

.mobile-player-interface.player-turn {
  /* Подсветка когда ход игрока - используется для нижней панели */
  --turn-glow: rgba(34, 197, 94, 0.15);
}

/* Верхняя секция */
.mobile-top-section {
  position: relative;
  z-index: 50;
}

/* Нижняя панель */
.mobile-bottom-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgb(15 23 42 / 0.95);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgb(51 65 85 / 0.5);
  z-index: 50;
  transition: background-color 200ms;
}

.mobile-bottom-panel.turn-active {
  background: linear-gradient(to top, rgba(34, 197, 94, 0.15), rgba(15, 23, 42, 0.95));
  border-top-color: rgba(34, 197, 94, 0.3);
}

.bottom-content {
  padding: 8px 12px;
}

/* Навбар */
.nav-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  padding-bottom: max(8px, env(safe-area-inset-bottom));
  border-top: 1px solid rgba(51, 65, 85, 0.3);
}

.nav-tabs {
  display: flex;
  gap: 4px;
}

.nav-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 36px;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  border: none;
  cursor: pointer;
  transition: all 150ms;
}

.nav-tab:active {
  background-color: rgba(51, 65, 85, 0.5);
}

.nav-tab.active {
  background-color: rgba(14, 165, 233, 0.2);
  color: #38bdf8;
}

/* Статус подключения */
.connection-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.6);
}

.connection-text {
  font-size: 11px;
  color: #94a3b8;
}

.status-connected .connection-text {
  color: #34d399;
}

.status-disconnected .connection-text {
  color: #f87171;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-connected .connection-dot {
  background-color: #34d399;
  box-shadow: 0 0 6px #34d399;
}

.status-connecting .connection-dot {
  background-color: #fbbf24;
  animation: pulse 1s ease-in-out infinite;
}

.status-disconnected .connection-dot {
  background-color: #f87171;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Кнопка меню */
.menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: #94a3b8;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 150ms;
}

.menu-btn:active {
  background-color: rgba(51, 65, 85, 0.5);
  color: #f1f5f9;
}

/* Выпадающее меню */
.dropdown-menu {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.menu-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
}

.menu-content {
  position: relative;
  background: rgba(15, 23, 42, 0.98);
  backdrop-filter: blur(8px);
  border-radius: 16px 16px 0 0;
  padding: 16px;
  width: 100%;
  max-width: 400px;
  padding-bottom: max(16px, env(safe-area-inset-bottom));
}

.exit-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border-radius: 10px;
  width: 100%;
  background-color: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(248, 113, 113, 0.3);
  font-size: 15px;
  font-weight: 500;
  transition: all 150ms;
}

.exit-button:active {
  background-color: rgba(239, 68, 68, 0.25);
}

/* Анимация меню */
.menu-slide-enter-active,
.menu-slide-leave-active {
  transition: all 250ms ease-out;
}

.menu-slide-enter-from,
.menu-slide-leave-to {
  opacity: 0;
}

.menu-slide-enter-from .menu-content,
.menu-slide-leave-to .menu-content {
  transform: translateY(100%);
}

/* Превью действия */
.action-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background-color: rgba(30, 41, 59, 0.5);
  border-radius: 8px;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.btn-cancel {
  flex: 1;
  padding: 10px 12px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 14px;
  background-color: rgb(51 65 85);
  color: rgb(203 213 225);
  border: 1px solid rgb(75 85 99);
  transition: all 150ms;
}

.btn-cancel:active {
  background-color: rgb(75 85 99);
}

.btn-confirm {
  flex: 1;
  padding: 10px 12px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 14px;
  background-color: rgb(14 165 233);
  color: white;
  border: 1px solid rgb(56 189 248);
  transition: all 150ms;
}

.btn-confirm:active {
  background-color: rgb(2 132 199);
}

.btn-confirm:disabled {
  background-color: rgb(75 85 99);
  color: rgb(148 163 184);
  border-color: rgb(100 116 139);
}

/* Сетка кнопок действий */
.action-buttons-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.action-button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  border-radius: 10px;
  background-color: rgba(30, 41, 59, 0.5);
  border: 1px solid rgba(51, 65, 85, 0.5);
  color: #cbd5e1;
  transition: all 150ms;
  font-size: 11px;
}

.action-button:active {
  background-color: rgba(51, 65, 85, 0.7);
  transform: scale(0.95);
}

.action-button.disabled {
  opacity: 0.5;
}

/* Оверлей реакции */
.reaction-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}

.reaction-card {
  position: relative;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.98), rgba(15, 23, 42, 0.98));
  border-radius: 16px;
  border: 2px solid rgba(251, 191, 36, 0.5);
  box-shadow: 0 0 30px rgba(251, 191, 36, 0.3);
  max-width: 320px;
  width: 100%;
  overflow: hidden;
  animation: reaction-pulse 1s ease-in-out infinite;
}

@keyframes reaction-pulse {
  0%, 100% { 
    box-shadow: 0 0 30px rgba(251, 191, 36, 0.3);
    border-color: rgba(251, 191, 36, 0.5);
  }
  50% { 
    box-shadow: 0 0 40px rgba(251, 191, 36, 0.5);
    border-color: rgba(251, 191, 36, 0.7);
  }
}

.reaction-timer {
  height: 4px;
  background: rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.timer-bar {
  height: 100%;
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
  transition: width 100ms linear;
}

.reaction-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.reaction-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(251, 191, 36, 0.2);
  border-radius: 50%;
}

.reaction-text {
  flex: 1;
}

.reaction-title {
  font-size: 16px;
  font-weight: 600;
  color: #fbbf24;
  margin: 0 0 4px 0;
}

.reaction-description {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.4;
}

.reaction-buttons {
  display: flex;
  gap: 8px;
  padding: 0 16px 16px;
}

.reaction-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 150ms;
}

.reaction-btn.decline {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(248, 113, 113, 0.3);
}

.reaction-btn.decline:active {
  background: rgba(239, 68, 68, 0.3);
  transform: scale(0.95);
}

.reaction-btn.accept {
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
  border: 1px solid rgba(74, 222, 128, 0.3);
}

.reaction-btn.accept:active {
  background: rgba(34, 197, 94, 0.3);
  transform: scale(0.95);
}

.reaction-time-left {
  position: absolute;
  top: 12px;
  right: 12px;
  font-size: 20px;
  font-weight: 700;
  color: #fbbf24;
  text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
}

/* Анимация реакции */
.reaction-fade-enter-active,
.reaction-fade-leave-active {
  transition: all 300ms ease-out;
}

.reaction-fade-enter-from,
.reaction-fade-leave-to {
  opacity: 0;
}

.reaction-fade-enter-from .reaction-card,
.reaction-fade-leave-to .reaction-card {
  transform: translateY(20px) scale(0.95);
}
</style>