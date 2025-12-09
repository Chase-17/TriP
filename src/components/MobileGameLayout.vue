<script setup>
/**
 * MobileGameLayout - единый мобильный layout для игрока
 * Структура:
 * - Инфопанель (250px) - контекстная информация
 * - Рабочая область (flex) - карта/персонаж/чат
 * - Панель действий (90px) - действия текущего экрана
 * - Навбар (фиксированный) - переключение экранов
 */
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useCharactersStore } from '@/stores/characters'
import { useBattleMapStore } from '@/stores/battleMap'
import { useUserStore } from '@/stores/user'
import MobileInfoCard from './MobileInfoCard.vue'
import BattleMap from './BattleMap.vue'
import ChatPanel from './ChatPanel.vue'
import MobileCharacterSheet from './MobileCharacterSheet.vue'

const props = defineProps({
  // Персонаж игрока
  character: { type: Object, default: null },
  // Все персонажи
  characters: { type: Array, default: () => [] },
  // Выбранный токен на карте
  selectedToken: { type: Object, default: null },
  // Выбранный гекс
  selectedHex: { type: Object, default: null },
  // Направление персонажа
  playerFacing: { type: Number, default: 0 },
  // Позиция токена игрока
  playerTokenPosition: { type: Object, default: null },
  // Статус подключения
  connectionStatus: { type: String, default: 'disconnected' },
  // Текущий ход
  currentTurn: { type: Object, default: null },
  // Ход игрока?
  isPlayerTurn: { type: Boolean, default: false },
  // Активное действие
  pendingAction: { type: Object, default: null },
  // Реакция
  reactionPrompt: { type: Object, default: null }
})

const emit = defineEmits([
  'leave-room',
  'set-view',
  'select-action', 
  'confirm-action', 
  'cancel-action',
  'switch-equipment',
  'reaction-accept',
  'reaction-decline',
  'open-character-sheet',
  'move-to-hex',
  'token-selected',
  'hex-selected',
  'hex-double-tap',
  'action-target-selected'
])

const charactersStore = useCharactersStore()
const battleMapStore = useBattleMapStore()
const userStore = useUserStore()

const { myCharacters, activeCharacter, activeCharacterId } = storeToRefs(charactersStore)

// Основные экраны (порядок важен для свайпа)
const screens = ['battle-map', 'character-sheet', 'chat']
const activeScreen = ref('battle-map')
const screenIndex = computed(() => screens.indexOf(activeScreen.value))

// Вкладки листа персонажа
const sheetTabs = [
  { id: 'main', label: 'Основное', icon: 'mdi:account' },
  { id: 'items', label: 'Вещи', icon: 'mdi:bag-personal' },
  { id: 'social', label: 'Социум', icon: 'mdi:account-group' },
  { id: 'magic', label: 'Магия', icon: 'mdi:auto-fix' }
]
const activeSheetTab = ref('main')

// Навигация
const navItems = [
  { id: 'battle-map', label: 'Карта', icon: 'mdi:map' },
  { id: 'character-sheet', label: 'Персонаж', icon: 'mdi:account' },
  { id: 'chat', label: 'Чат', icon: 'mdi:chat' }
]

// UI состояние
const infoCardCollapsed = ref(false)
const menuOpen = ref(false)

// Свайп для переключения экранов
const swipeState = ref({
  startX: 0,
  startY: 0,
  currentX: 0,
  isDragging: false,
  threshold: 80
})

const containerOffset = computed(() => {
  if (swipeState.value.isDragging) {
    const dx = swipeState.value.currentX - swipeState.value.startX
    // Ограничиваем смещение
    const maxOffset = 100
    return Math.max(-maxOffset, Math.min(maxOffset, dx))
  }
  return 0
})

const onNavTouchStart = (e) => {
  swipeState.value.startX = e.touches[0].clientX
  swipeState.value.startY = e.touches[0].clientY
  swipeState.value.currentX = e.touches[0].clientX
  swipeState.value.isDragging = false
}

const onNavTouchMove = (e) => {
  const dx = e.touches[0].clientX - swipeState.value.startX
  const dy = e.touches[0].clientY - swipeState.value.startY
  
  // Горизонтальный свайп
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 15) {
    e.preventDefault()
    swipeState.value.isDragging = true
    swipeState.value.currentX = e.touches[0].clientX
  }
}

const onNavTouchEnd = () => {
  if (!swipeState.value.isDragging) return
  
  const dx = swipeState.value.currentX - swipeState.value.startX
  
  if (Math.abs(dx) > 50) { // Уменьшил порог
    const currentIdx = screenIndex.value
    
    if (dx > 0 && currentIdx > 0) {
      // Свайп вправо - предыдущий экран
      activeScreen.value = screens[currentIdx - 1]
      emit('set-view', screens[currentIdx - 1])
    } else if (dx < 0 && currentIdx < screens.length - 1) {
      // Свайп влево - следующий экран
      activeScreen.value = screens[currentIdx + 1]
      emit('set-view', screens[currentIdx + 1])
    }
  }
  
  swipeState.value.isDragging = false
}

const selectScreen = (screenId) => {
  activeScreen.value = screenId
  emit('set-view', screenId)
}

const toggleMenu = () => {
  menuOpen.value = !menuOpen.value
}

// Сворачивание инфопанели
const toggleInfoPanel = () => {
  infoCardCollapsed.value = !infoCardCollapsed.value
}

// Статус подключения
const connectionStatusClass = computed(() => {
  if (props.connectionStatus === 'in-room') return 'connected'
  if (props.connectionStatus === 'connecting') return 'connecting'
  return 'disconnected'
})

const connectionStatusText = computed(() => {
  if (props.connectionStatus === 'in-room') return 'онлайн'
  if (props.connectionStatus === 'connecting') return 'подкл...'
  return 'офлайн'
})

// Контент инфопанели зависит от экрана
const infoPanelMode = computed(() => {
  if (activeScreen.value === 'battle-map') return 'map'
  if (activeScreen.value === 'character-sheet') return 'character'
  return 'chat'
})

// Действия на карте
const mapActions = [
  { id: 'move', label: 'Движение', icon: 'mdi:walk' },
  { id: 'attack', label: 'Атака', icon: 'mdi:sword' },
  { id: 'defend', label: 'Защита', icon: 'mdi:shield' },
  { id: 'skill', label: 'Навык', icon: 'mdi:auto-fix' }
]

const selectAction = (action) => {
  emit('select-action', action)
}

// Обработчики карты
const handleTokenSelected = (token) => {
  emit('token-selected', token)
}

const handleHexSelected = (hex) => {
  emit('hex-selected', hex)
}

const handleHexDoubleTap = (hex) => {
  emit('hex-double-tap', hex)
}

const handleActionTargetSelected = (target) => {
  emit('action-target-selected', target)
}

// Свайп по рабочей области
const onWorkspaceTouchStart = (e) => {
  // Не свайпаем на карте - у неё свои touch handlers
  if (activeScreen.value === 'battle-map') return
  
  swipeState.value.startX = e.touches[0].clientX
  swipeState.value.startY = e.touches[0].clientY
  swipeState.value.currentX = e.touches[0].clientX
  swipeState.value.isDragging = false
}

const onWorkspaceTouchMove = (e) => {
  if (activeScreen.value === 'battle-map') return
  
  const dx = e.touches[0].clientX - swipeState.value.startX
  const dy = e.touches[0].clientY - swipeState.value.startY
  
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20) {
    swipeState.value.isDragging = true
    swipeState.value.currentX = e.touches[0].clientX
  }
}

const onWorkspaceTouchEnd = () => {
  if (activeScreen.value === 'battle-map') return
  if (!swipeState.value.isDragging) return
  
  const dx = swipeState.value.currentX - swipeState.value.startX
  
  if (Math.abs(dx) > swipeState.value.threshold) {
    const currentIdx = screenIndex.value
    
    if (dx > 0 && currentIdx > 0) {
      activeScreen.value = screens[currentIdx - 1]
      emit('set-view', screens[currentIdx - 1])
    } else if (dx < 0 && currentIdx < screens.length - 1) {
      activeScreen.value = screens[currentIdx + 1]
      emit('set-view', screens[currentIdx + 1])
    }
  }
  
  swipeState.value.isDragging = false
}

// Переключение персонажа
const selectCharacter = (charId) => {
  charactersStore.setActiveCharacter(charId)
}
</script>

<template>
  <div class="mobile-game-layout" :class="{ 'player-turn': isPlayerTurn }">
    <!-- ИНФОПАНЕЛЬ (overlay) -->
    <div 
      class="info-panel-overlay" 
      :class="{ collapsed: infoCardCollapsed }"
    >
      <!-- Режим карты - инфокарточка -->
      <template v-if="infoPanelMode === 'map'">
        <MobileInfoCard
          :selected-token="selectedToken"
          :selected-hex="selectedHex"
          :player-character="character"
          :player-facing="playerFacing"
          :collapsed="infoCardCollapsed"
          :is-player-turn="isPlayerTurn"
          :player-token-position="playerTokenPosition"
          @toggle-collapse="infoCardCollapsed = !infoCardCollapsed"
          @open-character-sheet="(charId) => { emit('open-character-sheet', charId); activeScreen = 'character-sheet' }"
          @switch-equipment="$emit('switch-equipment')"
          @move-to-hex="(hex) => $emit('move-to-hex', hex)"
        />
      </template>
      
      <!-- Режим персонажа - используем тот же MobileInfoCard -->
      <template v-else-if="infoPanelMode === 'character'">
        <MobileInfoCard
          :selected-token="null"
          :selected-hex="null"
          :player-character="activeCharacter"
          :player-facing="0"
          :collapsed="infoCardCollapsed"
          :is-player-turn="isPlayerTurn"
          :player-token-position="null"
          :always-show-player="true"
          @toggle-collapse="infoCardCollapsed = !infoCardCollapsed"
          @open-character-sheet="(charId) => emit('open-character-sheet', charId)"
          @switch-equipment="$emit('switch-equipment')"
        />
      </template>
      
      <!-- Режим чата - заголовок чата -->
      <template v-else>
        <div class="info-panel-content" @click="toggleInfoPanel">
          <!-- Свёрнутое состояние -->
          <div v-if="infoCardCollapsed" class="collapsed-header">
            <Icon icon="mdi:chat" class="collapsed-chat-icon" />
            <span class="collapsed-name">Игровой чат</span>
            <Icon icon="mdi:chevron-down" class="collapse-icon" />
          </div>
          
          <!-- Развёрнутое состояние -->
          <template v-else>
            <div class="panel-header">
              <button class="collapse-btn" @click.stop="toggleInfoPanel">
                <Icon icon="mdi:chevron-up" />
              </button>
              <span class="panel-title">Игровой чат</span>
            </div>
            <div class="chat-info-expanded" @click.stop>
              <p class="chat-hint">Общайтесь с другими игроками и мастером</p>
            </div>
          </template>
        </div>
      </template>
    </div>
    
    <!-- РАБОЧАЯ ОБЛАСТЬ (занимает всё пространство) -->
    <div class="workspace">
      <div 
        class="screens-container"
        :style="{ 
          transform: `translateX(calc(-${screenIndex * (100/3)}% + ${containerOffset}px))`,
          transition: swipeState.isDragging ? 'none' : 'transform 300ms ease-out'
        }"
      >
        <!-- Экран: Карта -->
        <div class="screen screen-map">
          <BattleMap
            :readonly="!isPlayerTurn"
            :mobile-mode="true"
            :pending-action="pendingAction"
            @action-target-selected="handleActionTargetSelected"
            @token-selected="handleTokenSelected"
            @hex-selected="handleHexSelected"
            @hex-double-tap="handleHexDoubleTap"
          />
        </div>
        
        <!-- Экран: Персонаж -->
        <div class="screen screen-character">
          <MobileCharacterSheet
            :embedded="true"
            :active-tab="activeSheetTab"
            @update:activeTab="activeSheetTab = $event"
          />
        </div>
        
        <!-- Экран: Чат -->
        <div class="screen screen-chat">
          <ChatPanel />
        </div>
      </div>
    </div>
    
    <!-- ПАНЕЛЬ ДЕЙСТВИЙ (90px) -->
    <div 
      class="action-panel"
      @touchstart="onNavTouchStart"
      @touchmove="onNavTouchMove"
      @touchend="onNavTouchEnd"
    >
      <!-- Для карты - действия боя -->
      <template v-if="activeScreen === 'battle-map'">
        <template v-if="pendingAction">
          <div class="pending-action">
            <div class="action-info">
              <Icon :icon="pendingAction.icon" class="action-icon" />
              <span>{{ pendingAction.title }}</span>
            </div>
            <div class="action-controls">
              <button class="btn-cancel" @click="emit('cancel-action')">Отмена</button>
              <button class="btn-confirm" :disabled="!pendingAction.canConfirm" @click="emit('confirm-action')">OK</button>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="action-buttons">
            <button 
              v-for="action in mapActions" 
              :key="action.id"
              class="action-btn"
              @click="selectAction(action)"
            >
              <Icon :icon="action.icon" class="btn-icon" />
              <span class="btn-label">{{ action.label }}</span>
            </button>
          </div>
        </template>
      </template>
      
      <!-- Для персонажа - вкладки листа -->
      <template v-else-if="activeScreen === 'character-sheet'">
        <div class="sheet-tabs">
          <button
            v-for="tab in sheetTabs"
            :key="tab.id"
            class="sheet-tab"
            :class="{ active: activeSheetTab === tab.id }"
            @click="activeSheetTab = tab.id"
          >
            <Icon :icon="tab.icon" class="tab-icon" />
            <span class="tab-label">{{ tab.label }}</span>
          </button>
        </div>
      </template>
      
      <!-- Для чата - поле ввода будет внутри ChatPanel -->
      <template v-else>
        <div class="chat-actions">
          <span class="chat-hint-text">Используйте поле ввода внизу чата</span>
        </div>
      </template>
    </div>
    
    <!-- НАВБАР (фиксированный) -->
    <div class="nav-bar">
      <!-- Меню -->
      <button class="menu-btn" @click="toggleMenu">
        <Icon icon="mdi:menu" />
      </button>
      
      <!-- Вкладки -->
      <div class="nav-tabs">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="nav-tab"
          :class="{ active: activeScreen === item.id }"
          @click="selectScreen(item.id)"
        >
          <Icon :icon="item.icon" class="nav-icon" />
        </button>
      </div>
      
      <!-- Статус -->
      <div class="connection-status" :class="connectionStatusClass">
        <span class="status-text">{{ connectionStatusText }}</span>
        <div class="status-dot"></div>
      </div>
    </div>
    
    <!-- Меню (выпадающее) -->
    <Transition name="menu-fade">
      <div v-if="menuOpen" class="menu-overlay" @click="menuOpen = false">
        <div class="menu-content" @click.stop>
          <button class="menu-item exit" @click="emit('leave-room'); menuOpen = false">
            <Icon icon="mdi:exit-to-app" />
            <span>Выйти из комнаты</span>
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.mobile-game-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  height: 100dvh;
  background: #0f172a;
  color: #f1f5f9;
  overflow: hidden;
  position: relative;
}

/* ИНФОПАНЕЛЬ - overlay поверх рабочей области */
.info-panel-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 250px;
  z-index: 50;
  background: rgba(15, 23, 42, 0.97);
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  display: flex;
  flex-direction: column;
  transition: height 250ms ease-out;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.info-panel-overlay.collapsed {
  height: 56px;
}

/* Контент инфопанели */
.info-panel-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  cursor: pointer;
}

/* Свёрнутое состояние (общий стиль) */
.collapsed-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  height: 100%;
}

.collapsed-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: #1e293b;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.collapsed-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.collapsed-avatar span {
  font-size: 16px;
  font-weight: bold;
  color: #64748b;
}

.collapsed-chat-icon {
  width: 24px;
  height: 24px;
  color: #38bdf8;
}

.collapsed-name {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
}

.collapse-icon {
  width: 20px;
  height: 20px;
  color: #64748b;
}

/* Заголовок развёрнутой панели */
.panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  flex-shrink: 0;
}

.collapse-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(51, 65, 85, 0.5);
  border: none;
  color: #94a3b8;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: #f1f5f9;
}

/* Контент чата развёрнутый */
.chat-info-expanded {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.chat-info-expanded .chat-hint {
  font-size: 14px;
  color: #64748b;
  text-align: center;
}

/* Панель персонажа */

.character-tabs {
  display: flex;
  gap: 4px;
  padding: 4px 12px;
  overflow-x: auto;
  flex-shrink: 0;
}

.char-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(51, 65, 85, 0.3);
  border: 1px solid transparent;
  color: #94a3b8;
  font-size: 12px;
  white-space: nowrap;
}

.char-tab.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.3);
  color: #38bdf8;
}

.char-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.char-avatar-fallback {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
}

.char-summary {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  align-items: center;
}

.char-portrait {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  overflow: hidden;
  background: #1e293b;
  flex-shrink: 0;
}

.char-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.char-details {
  flex: 1;
  min-width: 0;
}

.char-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 4px;
}

.char-class {
  font-size: 14px;
  color: #94a3b8;
  margin: 0 0 8px;
}

.char-stats-row {
  display: flex;
  gap: 12px;
}

.mini-stat {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #64748b;
}

/* РАБОЧАЯ ОБЛАСТЬ - занимает всё пространство */
.workspace {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.screens-container {
  display: flex;
  height: 100%;
  width: 300%;
}

.screen {
  width: calc(100% / 3); /* Каждый экран = 1/3 от контейнера = 100% viewport */
  height: 100%;
  flex-shrink: 0;
  overflow: hidden;
}

.screen-map {
  background: #0f172a;
}

.screen-character {
  background: #0f172a;
  overflow-y: auto;
}

.screen-chat {
  background: #0f172a;
}

/* ПАНЕЛЬ ДЕЙСТВИЙ - 90px */
.action-panel {
  height: 90px;
  flex-shrink: 0;
  background: rgba(15, 23, 42, 0.95);
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  padding: 8px 12px;
  display: flex;
  align-items: center;
  touch-action: pan-y pinch-zoom;
}

.action-buttons {
  display: flex;
  gap: 8px;
  width: 100%;
  justify-content: space-around;
}

.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(51, 65, 85, 0.4);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  transition: all 150ms;
}

.action-btn:active {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.4);
  color: #38bdf8;
}

.btn-icon {
  width: 24px;
  height: 24px;
}

.btn-label {
  font-size: 11px;
  font-weight: 500;
}

.pending-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 12px;
}

.action-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f1f5f9;
}

.action-icon {
  width: 24px;
  height: 24px;
  color: #38bdf8;
}

.action-controls {
  display: flex;
  gap: 8px;
}

.btn-cancel {
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
  font-size: 13px;
}

.btn-confirm {
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #22c55e;
  font-size: 13px;
}

.btn-confirm:disabled {
  opacity: 0.5;
}

/* Вкладки листа персонажа */
.sheet-tabs {
  display: flex;
  gap: 6px;
  width: 100%;
  justify-content: space-around;
}

.sheet-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 16px;
  border-radius: 10px;
  background: rgba(51, 65, 85, 0.4);
  border: 1px solid transparent;
  color: #64748b;
  transition: all 150ms;
}

.sheet-tab.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.3);
  color: #38bdf8;
}

.tab-icon {
  width: 22px;
  height: 22px;
}

.tab-label {
  font-size: 11px;
  font-weight: 500;
}

/* Чат */
.chat-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.chat-hint-text {
  font-size: 13px;
  color: #64748b;
}

/* НАВБАР */
.nav-bar {
  height: 56px;
  flex-shrink: 0;
  background: rgba(15, 23, 42, 0.98);
  border-top: 1px solid rgba(148, 163, 184, 0.15);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  padding-bottom: env(safe-area-inset-bottom, 0);
  touch-action: pan-y pinch-zoom;
}

.menu-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 20px;
}

.nav-tabs {
  display: flex;
  gap: 4px;
}

.nav-tab {
  width: 48px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: transparent;
  border: none;
  color: #64748b;
  transition: all 150ms;
}

.nav-tab.active {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
}

.nav-icon {
  width: 24px;
  height: 24px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 11px;
}

.connection-status.connected {
  color: #22c55e;
}

.connection-status.connecting {
  color: #f59e0b;
}

.connection-status.disconnected {
  color: #ef4444;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

/* Меню */
.menu-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 100;
}

.menu-content {
  position: absolute;
  bottom: 70px;
  left: 12px;
  background: #1e293b;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  padding: 8px;
  min-width: 200px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: #f1f5f9;
  font-size: 14px;
  text-align: left;
}

.menu-item.exit {
  color: #ef4444;
}

.menu-item:hover {
  background: rgba(148, 163, 184, 0.1);
}

/* Анимации */
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 200ms;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
}

/* Подсветка хода игрока */
.mobile-game-layout.player-turn .action-panel {
  background: linear-gradient(to top, rgba(34, 197, 94, 0.1), rgba(15, 23, 42, 0.95));
  border-top-color: rgba(34, 197, 94, 0.3);
}
</style>
