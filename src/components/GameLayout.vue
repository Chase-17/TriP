<script setup>
/**
 * GameLayout - единый адаптивный layout для игрока и мастера
 * Структура:
 * - Инфопанель (250px) - контекстная информация
 * - Рабочая область (flex) - карта/персонаж/чат
 * - Панель действий (90px) - действия текущего экрана
 * - Навбар (фиксированный) - переключение экранов
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useCharactersStore } from '@/stores/characters'
import { useBattleMapStore } from '@/stores/battleMap'
import { useUserStore } from '@/stores/user'
import { useSceneLogStore, SceneFilters } from '@/stores/sceneLog'
import { isMobileScreen } from '@/utils/mobile'
import MobileInfoCard from './MobileInfoCard.vue'
import BattleMap from './BattleMap.vue'
import SceneLog from './SceneLog.vue'
import MobileCharacterSheet from './MobileCharacterSheet.vue'
// Компоненты мастера
import MasterSceneTools from './MasterSceneTools.vue'
import MasterTools from './MasterTools.vue'
import MasterCharactersPanel from './MasterCharactersPanel.vue'
import SceneTemplatesList from './SceneTemplatesList.vue'

const props = defineProps({
  // Режим мастера - показывает дополнительные инструменты
  isMaster: { type: Boolean, default: false },
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
  'hex-long-press-move',    // Перемещение с long press (выбор направления)
  'hex-long-press-confirm', // Подтверждение направления
  'token-rotate',           // Поворот токена на месте
  'action-target-selected',
  'create-character'
])

const charactersStore = useCharactersStore()
const battleMapStore = useBattleMapStore()
const userStore = useUserStore()
const sceneLogStore = useSceneLogStore()

// Импортируем sessionStore для получения roomId мастера
import { useSessionStore } from '@/stores/session'
const sessionStore = useSessionStore()
const { roomId } = storeToRefs(sessionStore)

// Копирование кода комнаты
const codeCopied = ref(false)
const copyRoomCode = async () => {
  if (!roomId.value) return
  try {
    await navigator.clipboard.writeText(roomId.value)
    codeCopied.value = true
    setTimeout(() => { codeCopied.value = false }, 2000)
  } catch (e) {
    console.error('Не удалось скопировать:', e)
  }
}

const { myCharacters, activeCharacter, activeCharacterId } = storeToRefs(charactersStore)
const { activeFilter, hasActiveImage, currentImage } = storeToRefs(sceneLogStore)
const { layoutPreference } = storeToRefs(userStore)

// === Layout режим (mobile/desktop) ===
const screenWidth = ref(window.innerWidth)
const isScreenMobile = computed(() => isMobileScreen())

// Эффективный layout с учётом настройки пользователя
const effectiveLayout = computed(() => {
  if (layoutPreference.value === 'mobile') return 'mobile'
  if (layoutPreference.value === 'desktop') return 'desktop'
  // auto - по размеру экрана
  return isScreenMobile.value ? 'mobile' : 'desktop'
})

const isMobileLayout = computed(() => effectiveLayout.value === 'mobile')
const isDesktopLayout = computed(() => effectiveLayout.value === 'desktop')

// Отслеживаем изменение размера экрана
const handleResize = () => {
  screenWidth.value = window.innerWidth
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  
  // Загружаем шаблоны из localStorage для мастера
  if (props.isMaster) {
    const saved = localStorage.getItem('scene-templates-v2')
    if (saved) {
      try {
        sceneTemplates.value = JSON.parse(saved)
      } catch (e) {
        console.error('Failed to load templates:', e)
      }
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// Основные экраны (порядок важен для свайпа) - разные для игрока и мастера
const screens = computed(() => {
  if (props.isMaster) {
    return ['battle-map', 'chat', 'master-tools', 'characters', 'character-sheet']
  }
  return ['battle-map', 'character-sheet', 'chat']
})
const activeScreen = ref(userStore.mobileActiveScreen || 'battle-map')
const screenIndex = computed(() => screens.value.indexOf(activeScreen.value))
const screenCount = computed(() => screens.value.length)

// Ref для MasterSceneTools и шаблоны
const masterSceneToolsRef = ref(null)
const sceneTemplates = ref([])

// Обработчики шаблонов
const onTemplatesUpdated = (templates) => {
  sceneTemplates.value = templates
}
const onSelectTemplate = (template) => {
  if (masterSceneToolsRef.value) {
    masterSceneToolsRef.value.loadTemplate(template)
  }
}
const onDeleteTemplate = (templateId) => {
  if (masterSceneToolsRef.value) {
    masterSceneToolsRef.value.deleteTemplate(templateId)
  }
}
const onToggleSent = (templateId) => {
  if (masterSceneToolsRef.value) {
    masterSceneToolsRef.value.toggleTemplateSent(templateId)
  }
}

// Вкладки листа персонажа
const sheetTabs = [
  { id: 'main', label: 'Личность', icon: 'mdi:account-heart' },
  { id: 'items', label: 'Инвентарь', icon: 'mdi:backpack' },
  { id: 'social', label: 'Социум', icon: 'mdi:account-group' },
  { id: 'magic', label: 'Магия', icon: 'mdi:auto-fix' }
]
const activeSheetTab = ref('main')

// Навигация - разные вкладки для игрока и мастера
const navItems = computed(() => {
  if (props.isMaster) {
    return [
      { id: 'battle-map', label: 'Карта', icon: 'mdi:map' },
      { id: 'chat', label: 'Сцена', icon: 'mdi:drama-masks' },
      { id: 'master-tools', label: 'Инструменты', icon: 'mdi:cog' },
      { id: 'characters', label: 'Все персонажи', icon: 'mdi:account-group' }
    ]
  }
  return [
    { id: 'battle-map', label: 'Карта', icon: 'mdi:map' },
    { id: 'character-sheet', label: 'Персонаж', icon: 'mdi:account' },
    { id: 'chat', label: 'Сцена', icon: 'mdi:drama-masks' }
  ]
})

// Фильтры для экрана сцены
const sceneFilterOptions = [
  { id: SceneFilters.ALL, label: 'Всё', icon: 'mdi:format-list-bulleted' },
  { id: SceneFilters.CHECKS, label: 'Проверки', icon: 'mdi:dice-d20' },
  { id: SceneFilters.COMBAT, label: 'Бой', icon: 'mdi:sword-cross' },
  { id: SceneFilters.QUESTS, label: 'Квесты', icon: 'mdi:map-marker-star' },
  { id: SceneFilters.ITEMS, label: 'Вещи', icon: 'mdi:treasure-chest' },
]

// UI состояние - раздельная свёрнутость для каждого экрана (из userStore)
// По умолчанию панели закрыты (collapsed=true означает закрыто)
// Текущее состояние свёрнутости зависит от активного экрана
const infoCardCollapsed = computed({
  get: () => !userStore.getInfoPanelOpen(activeScreen.value),
  set: (val) => { userStore.setInfoPanelOpen(activeScreen.value, !val) }
})

const menuOpen = ref(false)

// Открыть инфопанель сцены и показать картинку из события
const openSceneInfoPanel = (event) => {
  // Если передано событие с картинкой - устанавливаем её
  if (event && event.url) {
    sceneLogStore.setSceneImage(event.url, event.description, event.senderUserId)
  }
  userStore.setInfoPanelOpen('chat', true)
  sceneLogStore.touchInfoPanel()
}

// Скрыть изображение сцены и свернуть инфопанель
const hideSceneImage = () => {
  sceneLogStore.clearSceneImage()
  userStore.setInfoPanelOpen('chat', false)
}

const touchSceneInfoPanel = () => {
  sceneLogStore.touchInfoPanel()
  userStore.setInfoPanelOpen('chat', true)
}

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
      userStore.setMobileActiveScreen(activeScreen.value)
      emit('set-view', screens[currentIdx - 1])
    } else if (dx < 0 && currentIdx < screens.length - 1) {
      // Свайп влево - следующий экран
      activeScreen.value = screens[currentIdx + 1]
      userStore.setMobileActiveScreen(activeScreen.value)
      emit('set-view', screens[currentIdx + 1])
    }
  }
  
  swipeState.value.isDragging = false
}

const selectScreen = (screenId) => {
  activeScreen.value = screenId
  userStore.setMobileActiveScreen(screenId)
  emit('set-view', screenId)
}

// Открыть лист персонажа для мастера
const openMasterCharacterSheet = (charId) => {
  charactersStore.setActiveCharacter(charId)
  selectScreen('character-sheet')
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

// Показывается ли инфопанель (для мастера скрывается на экране сцены)
const showInfoPanel = computed(() => {
  if (props.isMaster && activeScreen.value === 'chat') return false
  return true
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

const handleHexLongPressMove = (data) => {
  // Перемещение с long press - персонаж уже перемещён, ждём выбор направления
  emit('hex-long-press-move', data)
}

const handleHexLongPressConfirm = (data) => {
  // Подтверждение направления после long press
  emit('hex-long-press-confirm', data)
}

const handleTokenRotate = (data) => {
  // Поворот токена на месте (long press на своём токене)
  emit('token-rotate', data)
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
  <div 
    class="game-layout" 
    :class="{ 
      'player-turn': isPlayerTurn,
      'mobile-layout': isMobileLayout,
      'desktop-layout': isDesktopLayout,
      'master-mode': isMaster,
      'no-info-panel': !showInfoPanel
    }"
  >
    <!-- ИНФОПАНЕЛЬ (overlay) - скрыта для мастера только на экране сцены -->
    <div 
      v-if="showInfoPanel"
      class="info-panel-overlay" 
      :class="{ 
        collapsed: infoCardCollapsed,
        'scene-mode': infoPanelMode === 'chat',
        'has-image': infoPanelMode === 'chat' && hasActiveImage
      }"
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
          :is-master="isMaster"
          @toggle-collapse="infoCardCollapsed = !infoCardCollapsed"
          @open-character-sheet="(charId) => { emit('open-character-sheet', charId); activeScreen = 'character-sheet' }"
          @switch-equipment="$emit('switch-equipment')"
          @move-to-hex="(hex) => $emit('move-to-hex', hex)"
        />
      </template>
      
      <!-- Режим персонажа - используем тот же MobileInfoCard -->
      <template v-else-if="infoPanelMode === 'character'">
        <MobileInfoCard
          :selected-token="selectedToken"
          :selected-hex="null"
          :player-character="activeCharacter"
          :player-facing="playerFacing"
          :collapsed="infoCardCollapsed"
          :is-player-turn="isPlayerTurn"
          :player-token-position="null"
          :always-show-player="true"
          :is-master="isMaster"
          @toggle-collapse="infoCardCollapsed = !infoCardCollapsed"
          @open-character-sheet="(charId) => emit('open-character-sheet', charId)"
          @switch-equipment="$emit('switch-equipment')"
        />
      </template>
      
      <!-- Режим чата/сцены - изображение сцены или заголовок -->
      <template v-else>
        <div class="info-panel-content scene-info" @click="touchSceneInfoPanel">
          <!-- Если есть активное изображение сцены -->
          <template v-if="hasActiveImage && currentImage">
            <!-- Свёрнутое состояние с превью -->
            <div v-if="infoCardCollapsed" class="collapsed-header scene-image-preview">
              <img :src="currentImage.url" :alt="currentImage.description" class="preview-thumbnail" />
              <span class="collapsed-name">{{ currentImage.description || 'Изображение сцены' }}</span>
              <Icon icon="mdi:chevron-down" class="collapse-icon" />
            </div>
            
            <!-- Развёрнутое состояние с полным изображением -->
            <template v-else>
              <div class="panel-header">
                <button class="collapse-btn" @click.stop="toggleInfoPanel">
                  <Icon icon="mdi:chevron-up" />
                </button>
                <span class="panel-title">{{ currentImage.description || 'Сцена' }}</span>
              </div>
              <div class="scene-image-container" @click.stop @touchstart="touchSceneInfoPanel">
                <img :src="currentImage.url" :alt="currentImage.description" class="scene-full-image" />
              </div>
            </template>
          </template>
          
          <!-- Нет изображения - показываем заголовок сцены -->
          <template v-else>
            <div v-if="infoCardCollapsed" class="collapsed-header">
              <Icon icon="mdi:drama-masks" class="collapsed-chat-icon" />
              <span class="collapsed-name">Сцена</span>
              <Icon icon="mdi:chevron-down" class="collapse-icon" />
            </div>
            <template v-else>
              <div class="panel-header">
                <button class="collapse-btn" @click.stop="toggleInfoPanel">
                  <Icon icon="mdi:chevron-up" />
                </button>
                <span class="panel-title">Сцена</span>
              </div>
              <div class="chat-info-expanded" @click.stop @touchstart="touchSceneInfoPanel">
                <p class="chat-hint">Лог событий, проверки и квесты</p>
              </div>
            </template>
          </template>
        </div>
      </template>
    </div>
    
    <!-- РАБОЧАЯ ОБЛАСТЬ (занимает всё пространство) -->
    <div class="workspace">
      <div 
        class="screens-container"
        :class="{ 'master-screens': isMaster }"
        :style="{ 
          width: `${screenCount * 100}%`,
          transform: `translateX(calc(-${screenIndex * (100/screenCount)}% + ${containerOffset}px))`,
          transition: swipeState.isDragging ? 'none' : 'transform 300ms ease-out'
        }"
      >
        <!-- Экран: Карта (общий для всех) -->
        <div class="screen screen-map" :style="{ width: `${100/screenCount}%` }">
          <BattleMap
            :readonly="!isMaster && !isPlayerTurn"
            :is-master="isMaster"
            :mobile-mode="true"
            :pending-action="pendingAction"
            @action-target-selected="handleActionTargetSelected"
            @token-selected="handleTokenSelected"
            @hex-selected="handleHexSelected"
            @hex-double-tap="handleHexDoubleTap"
            @hex-long-press-move="handleHexLongPressMove"
            @hex-long-press-confirm="handleHexLongPressConfirm"
            @token-rotate="handleTokenRotate"
          />
        </div>
        
        <!-- Экраны игрока -->
        <template v-if="!isMaster">
          <!-- Экран: Персонаж -->
          <div class="screen screen-character" :style="{ width: `${100/screenCount}%` }">
            <MobileCharacterSheet
              :embedded="true"
              :active-tab="activeSheetTab"
              @update:activeTab="activeSheetTab = $event"
              @create-character="emit('create-character', $event)"
            />
          </div>
          
          <!-- Экран: Сцена -->
          <div class="screen screen-chat" :style="{ width: `${100/screenCount}%` }">
            <SceneLog 
              @go-to-battle="selectScreen('battle-map')"
              @create-character="emit('create-character', $event)"
              @view-image="openSceneInfoPanel"
              @hide-image="hideSceneImage"
            />
          </div>
        </template>
        
        <!-- Экраны мастера -->
        <template v-else>
          <!-- Экран: Сцена с инструментами мастера -->
          <div class="screen screen-scene-master" :style="{ width: `${100/screenCount}%` }">
            <div class="master-scene-layout">
              <div class="master-scene-tools-column">
                <MasterSceneTools 
                  ref="masterSceneToolsRef"
                  @templates-updated="onTemplatesUpdated"
                />
              </div>
              <div class="master-scene-templates-column">
                <SceneTemplatesList 
                  :templates="sceneTemplates"
                  @select-template="onSelectTemplate"
                  @delete-template="onDeleteTemplate"
                  @toggle-sent="onToggleSent"
                />
              </div>
              <div class="master-scene-log">
                <SceneLog 
                  @go-to-battle="selectScreen('battle-map')"
                  @view-image="openSceneInfoPanel"
                  @hide-image="hideSceneImage"
                />
              </div>
            </div>
          </div>
          
          <!-- Экран: Инструменты мастера -->
          <div class="screen screen-master-tools" :style="{ width: `${100/screenCount}%` }">
            <MasterTools />
          </div>
          
          <!-- Экран: Персонажи -->
          <div class="screen screen-characters" :style="{ width: `${100/screenCount}%` }">
            <MasterCharactersPanel @open-character-sheet="openMasterCharacterSheet" />
          </div>
          
          <!-- Экран: Лист персонажа (для просмотра мастером) -->
          <div class="screen screen-character" :style="{ width: `${100/screenCount}%` }">
            <MobileCharacterSheet
              :embedded="true"
              :active-tab="activeSheetTab"
              @update:activeTab="activeSheetTab = $event"
              @go-to-characters="selectScreen('characters')"
            />
          </div>
        </template>
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
          <!-- Кнопка назад для мастера -->
          <button
            v-if="isMaster"
            class="sheet-tab back-btn"
            @click="selectScreen('characters')"
          >
            <Icon icon="mdi:arrow-left" class="tab-icon" />
            <span class="tab-label">Назад</span>
          </button>
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
      
      <!-- Для сцены - фильтры событий -->
      <template v-else>
        <div class="scene-filters">
          <button
            v-for="filter in sceneFilterOptions"
            :key="filter.id"
            class="scene-filter-btn"
            :class="{ active: activeFilter === filter.id }"
            @click="sceneLogStore.setFilter(filter.id)"
          >
            <Icon :icon="filter.icon" class="filter-icon" />
            <span class="filter-label">{{ filter.label }}</span>
          </button>
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
          <!-- Код комнаты (только для мастера) -->
          <template v-if="isMaster && roomId">
            <div class="menu-section">
              <div class="menu-section-title">Код комнаты</div>
              <button class="room-code-btn" @click="copyRoomCode">
                <span class="room-code">{{ roomId }}</span>
                <Icon :icon="codeCopied ? 'mdi:check' : 'mdi:content-copy'" class="copy-icon" />
              </button>
              <p v-if="codeCopied" class="copy-hint">Скопировано!</p>
            </div>
            <div class="menu-divider"></div>
          </template>
          
          <!-- Переключатель layout -->
          <div class="menu-section">
            <div class="menu-section-title">Режим отображения</div>
            <div class="layout-switcher">
              <button 
                class="layout-option" 
                :class="{ active: layoutPreference === 'auto' }"
                @click="userStore.setLayoutPreference('auto')"
              >
                <Icon icon="mdi:cellphone-link" />
                <span>Авто</span>
              </button>
              <button 
                class="layout-option" 
                :class="{ active: layoutPreference === 'mobile' }"
                @click="userStore.setLayoutPreference('mobile')"
              >
                <Icon icon="mdi:cellphone" />
                <span>Мобильный</span>
              </button>
              <button 
                class="layout-option" 
                :class="{ active: layoutPreference === 'desktop' }"
                @click="userStore.setLayoutPreference('desktop')"
              >
                <Icon icon="mdi:monitor" />
                <span>Десктоп</span>
              </button>
            </div>
          </div>
          
          <div class="menu-divider"></div>
          
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
/* === BASE LAYOUT === */
.game-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  height: 100dvh;
  background: #0f172a;
  color: #f1f5f9;
  overflow: hidden;
  position: relative;
}

/* === DESKTOP LAYOUT === */
.game-layout.desktop-layout {
  flex-direction: column;
}

/* Desktop: Навбар сверху на всю ширину */
.game-layout.desktop-layout .nav-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 48px;
  border-top: none;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  background: rgba(15, 23, 42, 0.95);
  backdrop-filter: blur(8px);
  z-index: 60;
  order: -1;
}

.game-layout.desktop-layout .nav-bar .menu-btn {
  order: 3;
}

.game-layout.desktop-layout .nav-bar .nav-tabs {
  order: 1;
  flex: 1;
  justify-content: flex-start;
  gap: 8px;
  padding-left: 16px;
}

.game-layout.desktop-layout .nav-bar .connection-status {
  order: 2;
}

/* Desktop: Инфопанель сверху на всю ширину */
.game-layout.desktop-layout .info-panel-overlay {
  position: fixed;
  top: 48px; /* Под навбаром */
  left: 0;
  right: 0;
  width: 100%;
  max-width: none;
  height: auto;
  max-height: calc(100vh - 180px);
  border-radius: 0;
  border: none;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.game-layout.desktop-layout .info-panel-overlay.collapsed {
  width: 100%;
  max-width: none;
  height: 56px;
}

/* Desktop: Содержимое инфопанели - ограничено и по центру */
.game-layout.desktop-layout .info-panel-overlay :deep(.info-card),
.game-layout.desktop-layout .info-panel-overlay .info-panel-content {
  max-width: 600px;
  margin: 0 auto;
}

/* Desktop: Рабочая область - отступы под навбар, инфопанель и панель действий */
.game-layout.desktop-layout .workspace {
  flex: 1;
  padding-top: calc(48px + 56px); /* Навбар + свёрнутая инфопанель */
  padding-bottom: 90px; /* Панель действий */
}

/* Когда инфопанель скрыта (для мастера на экране сцены) - меньше отступ */
.game-layout.desktop-layout.no-info-panel .workspace {
  padding-top: 48px; /* Только навбар */
}

.game-layout.desktop-layout .screens-container {
  padding-top: 0;
}

/* Desktop: Панель действий внизу */
.game-layout.desktop-layout .action-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 55;
}

/* === MOBILE LAYOUT (default) === */

/* ИНФОПАНЕЛЬ - overlay поверх рабочей области */
.info-panel-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 200px;
  z-index: 50;
  background: rgba(15, 23, 42, 0.97);
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  display: flex;
  flex-direction: column;
  transition: height 250ms ease-out, max-height 250ms ease-out;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.info-panel-overlay.collapsed {
  height: 56px;
}

/* Режим сцены с картинкой - динамическая высота */
.info-panel-overlay.scene-mode.has-image:not(.collapsed) {
  height: auto;
  max-height: 70vh;
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

/* === Изображение сцены в инфопанели === */
.scene-info {
  background: #0f172a;
}

.scene-image-preview {
  gap: 8px;
}

.preview-thumbnail {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.scene-image-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 0;
}

.scene-full-image {
  width: 100%;
  max-height: calc(70vh - 48px);
  object-fit: contain;
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
  /* Mobile: отступ сверху под свёрнутую инфопанель */
  padding-top: 56px;
}

.screens-container {
  display: flex;
  height: 100%;
  /* Ширина задаётся динамически через inline style */
}

.screen {
  /* Ширина задаётся динамически через inline style */
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

/* Desktop: Отступ снизу для экрана персонажа под панель действий (только для игрока) */
.game-layout.desktop-layout:not(.master-mode) .screen-character {
  padding-bottom: 100px;
}

.screen-chat {
  background: #0f172a;
}

/* Экраны мастера */
.screen-scene-master {
  background: #0f172a;
  overflow: hidden;
}

.master-scene-layout {
  display: flex;
  height: 100%;
  gap: 16px;
  padding: 16px;
}

.master-scene-tools-column {
  flex: 0 0 auto;
  width: 380px;
  min-width: 320px;
  max-width: 450px;
  overflow-y: auto;
  overflow-x: hidden;
}

.master-scene-templates-column {
  flex: 0 0 auto;
  width: 240px;
  min-width: 200px;
  max-width: 280px;
  overflow: hidden;
}

.master-scene-log {
  flex: 1;
  max-width: 600px;
  overflow: hidden;
  margin-left: auto;
}

.screen-master-tools {
  background: #0f172a;
  overflow-y: auto;
}

.screen-characters {
  background: #0f172a;
  overflow-y: auto;
}

/* ПАНЕЛЬ ДЕЙСТВИЙ - 90px */
.action-panel {
  height: 90px;
  flex-shrink: 0;
  background: rgba(15, 23, 42, 0.95);
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  padding: 8px 12px;
  padding-bottom: max(8px, env(safe-area-inset-bottom, 0));
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

.sheet-tab.back-btn {
  background: rgba(71, 85, 105, 0.4);
  color: #94a3b8;
}

.sheet-tab.back-btn:hover {
  background: rgba(71, 85, 105, 0.6);
  color: #cbd5e1;
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

/* Фильтры сцены */
.scene-filters {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 0 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.scene-filters::-webkit-scrollbar {
  display: none;
}

.scene-filter-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 12px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: #94a3b8;
  flex-shrink: 0;
  cursor: pointer;
  transition: all 0.2s ease;
}

.scene-filter-btn.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
  color: #3b82f6;
}

.scene-filter-btn .filter-icon {
  font-size: 18px;
}

.scene-filter-btn .filter-label {
  font-size: 10px;
  font-weight: 500;
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
  min-width: 240px;
}

.menu-section {
  padding: 8px;
}

.menu-section-title {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.layout-switcher {
  display: flex;
  gap: 4px;
}

.layout-option {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 8px;
  background: rgba(51, 65, 85, 0.4);
  border: 1px solid transparent;
  color: #94a3b8;
  font-size: 10px;
  cursor: pointer;
  transition: all 150ms;
}

.layout-option:hover {
  background: rgba(51, 65, 85, 0.6);
}

.layout-option.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.4);
  color: #38bdf8;
}

.layout-option svg {
  width: 20px;
  height: 20px;
}

.menu-divider {
  height: 1px;
  background: rgba(148, 163, 184, 0.15);
  margin: 4px 0;
}

/* Код комнаты мастера */
.room-code-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
  cursor: pointer;
  transition: all 150ms;
}

.room-code-btn:hover {
  background: rgba(245, 158, 11, 0.25);
}

.room-code {
  font-family: monospace;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  color: #f59e0b;
}

.copy-icon {
  width: 18px;
  height: 18px;
  color: #f59e0b;
}

.copy-hint {
  font-size: 11px;
  color: #22c55e;
  margin-top: 4px;
  text-align: center;
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
.game-layout.player-turn .action-panel {
  background: linear-gradient(to top, rgba(34, 197, 94, 0.1), rgba(15, 23, 42, 0.95));
  border-top-color: rgba(34, 197, 94, 0.3);
}

/* === MASTER MODE EXTRAS === */
.game-layout.master-mode .nav-bar {
  background: linear-gradient(to right, rgba(139, 92, 246, 0.1), rgba(15, 23, 42, 0.98));
}
</style>
