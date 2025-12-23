<script setup>
/**
 * BattleControlPanel - правая выдвигающаяся панель управления боем для мастера
 * Содержит: инициатива, здоровье персонажей, инструменты (указка), очередь сообщений
 */
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { useCharactersStore } from '@/stores/characters'
import { useSessionStore } from '@/stores/session'
import { usePointerStore, POINTER_TOOLS } from '@/stores/pointer'
import { useInteractionStore } from '@/stores/interaction'
import { safeStoreToRefs, safeUseStore } from '@/utils/safeStoreRefs'

const props = defineProps({
  selectedToken: { type: Object, default: null },
  topOffset: { type: Number, default: 60 } // Отступ от верхнего края
})

const emit = defineEmits([
  'select-token',
  'open-character-sheet'
])

const charactersStore = safeUseStore(useCharactersStore, 'characters')
const sessionStore = safeUseStore(useSessionStore, 'session')
const pointerStore = safeUseStore(usePointerStore, 'pointer')
const interactionStore = safeUseStore(useInteractionStore, 'interaction')

const { characters = ref([]) } = safeStoreToRefs(charactersStore, 'characters')
const { isQueuePaused = ref(false), messageQueue = ref([]) } = safeStoreToRefs(sessionStore, 'session')
const { battlePanelExpanded = ref(true) } = safeStoreToRefs(interactionStore, 'interaction')

// Фильтр персонажей (на карте)
const tokensOnMap = computed(() => {
  return characters.value.filter(c => c.combat?.position)
})

// Выбранный персонаж для редактирования HP
const editingCharacterId = ref(null)
const hpDelta = ref(0)

const togglePanel = () => {
  interactionStore.toggleBattlePanel()
}

// Управление HP
const startEditHP = (characterId) => {
  editingCharacterId.value = characterId
  hpDelta.value = 0
}

const applyHPChange = () => {
  if (editingCharacterId.value && hpDelta.value !== 0) {
    charactersStore.modifyHP(editingCharacterId.value, hpDelta.value)
  }
  editingCharacterId.value = null
  hpDelta.value = 0
}

const cancelHPEdit = () => {
  editingCharacterId.value = null
  hpDelta.value = 0
}

// Управление очередью сообщений
const toggleQueuePause = () => {
  if (isQueuePaused.value) {
    sessionStore.flushQueue({ sequential: false })
  } else {
    sessionStore.pauseQueue()
  }
}

const flushQueueSequential = () => {
  sessionStore.flushQueue({ sequential: true, delay: 200 })
}

const clearMessageQueue = () => {
  sessionStore.clearQueue()
}

// Инструменты указки
const currentTool = computed(() => pointerStore.currentTool)

const setPointerTool = (tool) => {
  pointerStore.setTool(tool)
}
</script>

<template>
  <div 
    class="battle-control-panel"
    :class="{ expanded: battlePanelExpanded }"
    :style="{ top: `${props.topOffset}px` }"
  >
    <!-- Хвостик для открытия/закрытия -->
    <button 
      class="panel-toggle"
      @click="togglePanel"
    >
      <Icon :icon="battlePanelExpanded ? 'mdi:chevron-right' : 'mdi:chevron-left'" />
    </button>
    
    <!-- Содержимое панели -->
    <div class="panel-content">
      <div class="panel-header">
        <h3>Управление боем</h3>
      </div>
      
      <!-- Секция: Очередь сообщений (режим планирования) -->
      <div class="panel-section">
        <div class="section-header">
          <Icon icon="mdi:playlist-play" />
          <span>Планирование</span>
          <span v-if="messageQueue.length > 0" class="queue-badge">{{ messageQueue.length }}</span>
        </div>
        <div class="section-content queue-controls">
          <button 
            class="queue-btn"
            :class="{ active: isQueuePaused }"
            @click="toggleQueuePause"
          >
            <Icon :icon="isQueuePaused ? 'mdi:play' : 'mdi:pause'" />
            <span>{{ isQueuePaused ? 'Отправить' : 'Накапливать' }}</span>
          </button>
          
          <button 
            v-if="isQueuePaused && messageQueue.length > 0"
            class="queue-btn"
            @click="flushQueueSequential"
          >
            <Icon icon="mdi:playlist-check" />
            <span>По очереди</span>
          </button>
          
          <button 
            v-if="messageQueue.length > 0"
            class="queue-btn danger"
            @click="clearMessageQueue"
          >
            <Icon icon="mdi:delete-sweep" />
          </button>
        </div>
      </div>
      
      <!-- Секция: Инструменты указки -->
      <div class="panel-section">
        <div class="section-header">
          <Icon icon="mdi:cursor-default-click" />
          <span>Указка</span>
        </div>
        <div class="section-content pointer-tools">
          <button 
            class="tool-btn"
            :class="{ active: currentTool === POINTER_TOOLS.POINT }"
            @click="setPointerTool(POINTER_TOOLS.POINT)"
            title="Указать"
          >
            <Icon icon="mdi:cursor-default" />
          </button>
          <button 
            class="tool-btn"
            :class="{ active: currentTool === POINTER_TOOLS.DRAW }"
            @click="setPointerTool(POINTER_TOOLS.DRAW)"
            title="Рисовать"
          >
            <Icon icon="mdi:pencil" />
          </button>
          <button 
            class="tool-btn"
            :class="{ active: currentTool === POINTER_TOOLS.MEASURE }"
            @click="setPointerTool(POINTER_TOOLS.MEASURE)"
            title="Измерить"
          >
            <Icon icon="mdi:ruler" />
          </button>
          <button 
            v-if="currentTool !== POINTER_TOOLS.NONE"
            class="tool-btn"
            @click="setPointerTool(POINTER_TOOLS.NONE)"
            title="Выключить"
          >
            <Icon icon="mdi:close" />
          </button>
        </div>
      </div>
      
      <!-- Секция: Токены на карте -->
      <div class="panel-section tokens-section">
        <div class="section-header">
          <Icon icon="mdi:account-group" />
          <span>На карте ({{ tokensOnMap.length }})</span>
        </div>
        <div class="section-content tokens-list">
          <div 
            v-for="character in tokensOnMap" 
            :key="character.id"
            class="token-item"
            :class="{ selected: selectedToken?.characterId === character.id }"
            @click="emit('select-token', character)"
          >
            <div class="token-info">
              <span class="token-name">{{ character.name }}</span>
              <span class="token-pos">
                ({{ character.combat.position.q }}, {{ character.combat.position.r }})
              </span>
            </div>
            
            <!-- HP бар -->
            <div class="token-hp">
              <template v-if="editingCharacterId === character.id">
                <input 
                  v-model.number="hpDelta" 
                  type="number"
                  class="hp-input"
                  placeholder="±HP"
                  @keyup.enter="applyHPChange"
                  @keyup.escape="cancelHPEdit"
                />
                <button class="hp-btn confirm" @click="applyHPChange">
                  <Icon icon="mdi:check" />
                </button>
                <button class="hp-btn cancel" @click="cancelHPEdit">
                  <Icon icon="mdi:close" />
                </button>
              </template>
              <template v-else>
                <div 
                  class="hp-bar"
                  @click.stop="startEditHP(character.id)"
                >
                  <div 
                    class="hp-fill"
                    :style="{ width: `${Math.min(100, (character.hp?.current || 0) / (character.hp?.max || 1) * 100)}%` }"
                  ></div>
                  <span class="hp-text">
                    {{ character.hp?.current || 0 }}/{{ character.hp?.max || '?' }}
                  </span>
                </div>
              </template>
            </div>
          </div>
          
          <div v-if="tokensOnMap.length === 0" class="empty-state">
            Нет токенов на карте
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.battle-control-panel {
  position: absolute;
  /* top: dynamic via style binding */
  right: 4px;
  bottom: 6px; /* 6px над MapControlPanel (~40px) */
  width: 260px;
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  transform: translateX(calc(100% + 8px)); /* Скрыта за правым краем */
  transition: transform 0.3s ease;
  z-index: 30;
  display: flex;
}

.battle-control-panel.expanded {
  transform: translateX(0);
}

.panel-toggle {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translate(-100%, -50%);
  width: 24px;
  height: 48px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-right: none;
  border-radius: 8px 0 0 8px;
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
  overflow: hidden;
}

.panel-header {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: white;
  margin: 0;
}

.panel-section {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.8);
  background: rgba(255, 255, 255, 0.02);
}

.section-header :deep(svg) {
  width: 1rem;
  height: 1rem;
}

.queue-badge {
  background: rgba(56, 189, 248, 0.2);
  color: rgb(125, 211, 252);
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
  font-size: 0.625rem;
  margin-left: auto;
}

.section-content {
  padding: 0.5rem;
}

/* Очередь */
.queue-controls {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.queue-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(226, 232, 240, 0.9);
  font-size: 0.6875rem;
  cursor: pointer;
  transition: all 0.15s;
}

.queue-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.queue-btn.active {
  background: rgba(245, 158, 11, 0.2);
  border-color: rgba(245, 158, 11, 0.4);
  color: rgb(253, 224, 71);
}

.queue-btn.danger {
  color: rgba(248, 113, 113, 0.9);
}

.queue-btn.danger:hover {
  background: rgba(239, 68, 68, 0.15);
}

/* Инструменты указки */
.pointer-tools {
  display: flex;
  gap: 0.375rem;
}

.tool-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(226, 232, 240, 0.9);
  cursor: pointer;
  transition: all 0.15s;
}

.tool-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.tool-btn.active {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.4);
  color: rgb(125, 211, 252);
}

/* Токены */
.tokens-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tokens-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.token-item {
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.token-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
}

.token-item.selected {
  background: rgba(56, 189, 248, 0.1);
  border-color: rgba(56, 189, 248, 0.3);
}

.token-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.375rem;
}

.token-name {
  font-size: 0.75rem;
  font-weight: 500;
  color: white;
}

.token-pos {
  font-size: 0.625rem;
  color: rgba(148, 163, 184, 0.6);
  font-family: monospace;
}

.token-hp {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.hp-bar {
  flex: 1;
  height: 1.25rem;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 0.25rem;
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.hp-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, rgba(239, 68, 68, 0.6), rgba(34, 197, 94, 0.6));
  background-size: 200% 100%;
  background-position: right;
  transition: width 0.3s;
}

.hp-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  font-weight: 500;
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.hp-input {
  width: 3rem;
  padding: 0.25rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.25rem;
  color: white;
  font-size: 0.75rem;
  text-align: center;
}

.hp-btn {
  width: 1.25rem;
  height: 1.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.hp-btn.confirm {
  background: rgba(34, 197, 94, 0.3);
  color: rgb(134, 239, 172);
}

.hp-btn.cancel {
  background: rgba(239, 68, 68, 0.3);
  color: rgb(252, 165, 165);
}

.hp-btn :deep(svg) {
  width: 0.75rem;
  height: 0.75rem;
}

.empty-state {
  padding: 1rem;
  text-align: center;
  font-size: 0.75rem;
  color: rgba(148, 163, 184, 0.5);
}
</style>
