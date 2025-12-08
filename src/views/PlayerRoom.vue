<script setup>
/**
 * PlayerRoom - игровая комната для игрока
 * Адаптивный интерфейс: десктоп и мобильная версия
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import { useCharactersStore } from '@/stores/characters'
import { useBattleMapStore } from '@/stores/battleMap'
import ChatPanel from '@/components/ChatPanel.vue'
import CharacterSheet from '@/components/CharacterSheet.vue'
import BattleMap from '@/components/BattleMap.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import SplashOverlay from '@/components/SplashOverlay.vue'
import MobilePlayerInterface from '@/components/MobilePlayerInterface.vue'
import { isMobileScreen, setupMobileViewport } from '@/utils/mobile'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const userStore = useUserStore()
const charactersStore = useCharactersStore()
const battleMapStore = useBattleMapStore()

const { roomId, status, connections } = storeToRefs(session)
const { nickname, avatar, currentView } = storeToRefs(userStore)
const { characters } = storeToRefs(charactersStore)

// Computed свойства
const isConnected = computed(() => status.value === 'in-room' || status.value === 'ready')

// Текст статуса
const connectionStatusText = computed(() => {
  if (status.value === 'connecting') return 'Подключение...'
  if (status.value === 'in-room') return '● Подключено'
  if (status.value === 'error') return '○ Ошибка'
  return '○ Отключено'
})

const connectionStatusClass = computed(() => {
  if (status.value === 'in-room') return 'bg-emerald-500/20 text-emerald-400'
  if (status.value === 'connecting') return 'bg-amber-500/20 text-amber-400'
  return 'bg-rose-500/20 text-rose-400'
})

// Текущий вид
const activeView = ref('battle-map')

// Состояние подключения
const isConnecting = ref(true)
const connectionError = ref('')

// Мобильный интерфейс
const isMobile = ref(isMobileScreen())
const pendingAction = ref(null)

// Выбранные объекты на карте (для мобильной инфокарточки)
const selectedToken = ref(null)
const selectedHex = ref(null)

// Активное предложение реакции от мастера
const reactionPrompt = ref(null)

// Направление персонажа игрока
const playerFacing = computed(() => {
  if (!playerCharacter.value) return 0
  // Получаем токен персонажа из карты
  const token = battleMapStore.getTokenByCharacterId?.(playerCharacter.value.id)
  return token?.facing || 0
})

// Отладка
console.log('PlayerRoom: isMobile =', isMobile.value, 'screen width =', window.innerWidth)

const navItems = [
  { id: 'chat', label: 'Чат', icon: '💬' },
  { id: 'character-sheet', label: 'Персонаж', icon: '👤' },
  { id: 'battle-map', label: 'Карта', icon: '🗺️' }
]

// Персонаж игрока
const playerCharacter = computed(() => {
  const userId = userStore.userId
  console.log('Поиск персонажа игрока:', { userId, characters: characters.value.length })
  const character = characters.value.find(char => char.ownerId === userId)
  console.log('Найденный персонаж:', character)
  return character
})

// Определение, чей сейчас ход (заглушка)
const currentTurn = ref(null)
const isPlayerTurn = computed(() => {
  // TODO: реализовать логику определения хода
  return true // пока что всегда ход игрока для тестирования
})

onMounted(async () => {
  const roomIdParam = route.params.roomId
  
  if (!roomIdParam) {
    router.push('/')
    return
  }
  
  // Настройка мобильного viewport
  if (isMobile.value) {
    setupMobileViewport()
  }
  
  // Подключаемся к комнате
  try {
    session.joinRoom(roomIdParam)
    isConnecting.value = false
    
    // Настраиваем слушатель реакций после подключения
    setupReactionListener()
  } catch (error) {
    connectionError.value = 'Не удалось подключиться к комнате'
    isConnecting.value = false
  }
  
  // Слушаем изменения размера экрана
  const handleResize = () => {
    isMobile.value = isMobileScreen()
  }
  window.addEventListener('resize', handleResize)
  
  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
  })
})

onUnmounted(() => {
  session.leaveRoom()
})

const setView = (view) => {
  activeView.value = view
}

const leaveRoom = () => {
  session.leaveRoom()
  router.push('/')
}

// Мобильные действия
const handleSelectAction = (action) => {
  pendingAction.value = {
    id: action.id,
    title: action.label,
    description: getActionDescription(action.id),
    icon: action.icon,
    canConfirm: false // будет изменяться в зависимости от выбора на карте
  }
}

const handleConfirmAction = () => {
  if (pendingAction.value && pendingAction.value.target) {
    console.log('Выполняем действие:', pendingAction.value.id, 'цель:', pendingAction.value.target)
    
    if (pendingAction.value.id === 'move' && pendingAction.value.target.type === 'hex') {
      // Перемещаем персонажа игрока
      movePlayerCharacter(pendingAction.value.target.hex)
    } else if (pendingAction.value.id === 'attack' && pendingAction.value.target.characterId) {
      // Атакуем цель
      attackTarget(pendingAction.value.target)
    }
    
    pendingAction.value = null
  }
}

const movePlayerCharacter = (targetHex) => {
  const character = playerCharacter.value
  if (!character) {
    console.warn('Персонаж игрока не найден')
    return
  }
  
  console.log(`Перемещаем персонажа ${character.name} на гекс q:${targetHex.q}, r:${targetHex.r}`)
  
  // Получаем ID активной карты
  const mapId = battleMapStore.activeMapId
  if (!mapId) {
    console.warn('Нет активной карты для перемещения')
    return
  }
  
  console.log('Активная карта:', mapId)
  
  const moved = battleMapStore.moveTokenByCharacterId(mapId, character.id, targetHex.q, targetHex.r)
  
  if (!moved) {
    // Если токен не найден, размещаем его впервые
    console.log('Токен не найден на карте, размещаем впервые')
    const placed = battleMapStore.placeToken(mapId, character.id, targetHex.q, targetHex.r)
    if (placed) {
      console.log('Токен успешно размещен на карте')
    } else {
      console.warn('Не удалось разместить токен на карте. Возможно гекс занят.')
    }
  } else {
    console.log('Токен перемещен на существующей карте')
  }
  
  // Также обновляем позицию в charactersStore для синхронизации
  if (!character.combat?.position) {
    charactersStore.placeOnMap(character.id, mapId, targetHex.q, targetHex.r)
  } else {
    charactersStore.moveOnMap(character.id, targetHex.q, targetHex.r)
  }
  
  // Если есть сессия, отправляем обновление мастеру
  const isConnectedToMaster = session.role === 'player' && session.status === 'in-room'
  console.log('Проверка сессии для отправки:', { 
    role: session.role, 
    status: session.status,
    isConnectedToMaster 
  })
  if (isConnectedToMaster) {
    console.log('Отправляем перемещение мастеру...')
    session.broadcastCharacterMove(character.id, targetHex.q, targetHex.r)
  }
}

const attackTarget = (target) => {
  console.log('Атакуем цель:', target.characterId)
  // TODO: реализовать логику атаки
}

const handleActionTargetSelected = (target) => {
  if (pendingAction.value) {
    pendingAction.value.target = target
    pendingAction.value.canConfirm = true
    
    // Обновляем описание с информацией о цели
    if (target.type === 'hex') {
      pendingAction.value.description = `Переместиться на гекс (${target.hex.q}, ${target.hex.r})`
    } else if (target.characterId) {
      pendingAction.value.description = `Цель: ${target.character?.name || 'Неизвестный'}`
    }
  }
}

const handleCancelAction = () => {
  pendingAction.value = null
}

const getActionDescription = (actionId) => {
  const descriptions = {
    move: 'Выберите место для перемещения',
    attack: 'Выберите цель для атаки', 
    defend: 'Выберите сектор защиты',
    skill: 'Выберите навык и цель',
    ready: 'Сигнализировать о готовности',
    help: 'Показать справку'
  }
  return descriptions[actionId] || 'Выберите действие'
}

// Обработчики событий карты для мобильного интерфейса
const handleTokenSelected = (token) => {
  selectedToken.value = token
  // При выборе токена сбрасываем выбранный гекс
  if (token) {
    selectedHex.value = null
  }
}

const handleHexSelected = (hex) => {
  selectedHex.value = hex
  // При выборе гекса сбрасываем токен только если это пустой гекс
  // selectedToken остаётся если кликнули на гекс с токеном
}

// Обработчик смены снаряжения
const handleSwitchEquipment = () => {
  // TODO: открыть модалку смены снаряжения
  console.log('Смена снаряжения')
}

// Открыть лист конкретного персонажа
const handleOpenCharacterSheet = (characterId) => {
  if (characterId) {
    // Устанавливаем активного персонажа перед открытием листа
    charactersStore.setActiveCharacter(characterId)
  }
  setView('character-sheet')
}

// Обработчики реакций
const handleReactionAccept = (reactionId) => {
  console.log('Игрок принял реакцию:', reactionId)
  // Отправляем ответ мастеру
  if (session.status === 'in-room') {
    session.sendReactionResponse(reactionId, true)
  }
  reactionPrompt.value = null
}

const handleReactionDecline = (reactionId) => {
  console.log('Игрок отклонил реакцию:', reactionId)
  // Отправляем ответ мастеру
  if (session.status === 'in-room') {
    session.sendReactionResponse(reactionId, false)
  }
  reactionPrompt.value = null
}

// Слушатель сообщений от мастера о реакциях
const setupReactionListener = () => {
  // Это будет вызвано когда сессия установлена
  session.onMessage('reaction-prompt', (payload) => {
    console.log('Получено предложение реакции:', payload)
    reactionPrompt.value = {
      id: payload.id,
      title: payload.title || 'Реакция!',
      description: payload.description || 'Можете использовать реакцию',
      timeoutSeconds: payload.timeoutSeconds || 5,
      startedAt: Date.now()
    }
  })
}
</script>

<template>
  <div class="h-screen bg-slate-950 text-slate-50 flex flex-col overflow-hidden">
    <!-- Loading state -->
    <div v-if="isConnecting" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="animate-spin text-4xl mb-4">⏳</div>
        <p class="text-slate-400">Подключение к комнате...</p>
      </div>
    </div>
    
    <!-- Error state -->
    <div v-else-if="connectionError" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="text-4xl mb-4">😔</div>
        <p class="text-rose-400 mb-4">{{ connectionError }}</p>
        <button
          type="button"
          class="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition"
          @click="router.push('/')"
        >
          Вернуться
        </button>
      </div>
    </div>
    
    <!-- Mobile Interface -->
    <template v-else-if="isMobile">
      <!-- Верхняя панель мобильного интерфейса с инфокарточкой -->
      <MobilePlayerInterface
        :character="playerCharacter"
        :selected-token="selectedToken"
        :selected-hex="selectedHex"
        :player-facing="playerFacing"
        :active-view="activeView"
        :connection-status="status"
        :current-turn="currentTurn"
        :is-player-turn="isPlayerTurn"
        :pending-action="pendingAction"
        :reaction-prompt="reactionPrompt"
        @set-view="setView"
        @leave-room="leaveRoom"
        @select-action="handleSelectAction"
        @confirm-action="handleConfirmAction"
        @cancel-action="handleCancelAction"
        @switch-equipment="handleSwitchEquipment"
        @reaction-accept="handleReactionAccept"
        @reaction-decline="handleReactionDecline"
        @open-character-sheet="handleOpenCharacterSheet"
      />
      
      <!-- Content для мобильного интерфейса - расположен между header и bottom panel -->
      <main class="flex-1 overflow-auto bg-slate-950" style="padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px))">
        <ChatPanel v-show="activeView === 'chat'" />
        <CharacterSheet v-show="activeView === 'character-sheet'" />
        <BattleMap 
          v-show="activeView === 'battle-map'" 
          :readonly="!isPlayerTurn"
          :mobile-mode="true"
          :pending-action="pendingAction"
          @action-target-selected="handleActionTargetSelected"
          @token-selected="handleTokenSelected"
          @hex-selected="handleHexSelected"
        />
      </main>
    </template>
    
    <!-- Desktop Interface -->
    <template v-else>
      <!-- Header -->
      <header class="bg-slate-900/90 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div class="flex items-center gap-4">
          <button
            type="button"
            class="text-slate-400 hover:text-white transition"
            @click="leaveRoom"
            title="Выйти из комнаты"
          >
            ← Выход
          </button>
          
          <div class="h-6 w-px bg-white/10"></div>
          
          <span class="text-sm px-3 py-1 rounded-full bg-slate-800 border border-white/10 font-mono tracking-wider">
            {{ route.params.roomId }}
          </span>
          
          <span
            class="px-2 py-0.5 rounded text-xs"
            :class="connectionStatusClass"
          >
            {{ connectionStatusText }}
          </span>
        </div>
        
        <!-- Navigation -->
        <nav class="flex gap-1">
          <button
            v-for="item in navItems"
            :key="item.id"
            type="button"
            class="px-4 py-2 rounded-lg text-sm transition flex items-center gap-2"
            :class="activeView === item.id 
              ? 'bg-sky-500/20 text-sky-400 border border-sky-400/40' 
              : 'text-slate-400 hover:text-white hover:bg-white/5'"
            @click="setView(item.id)"
          >
            <span>{{ item.icon }}</span>
            <span class="hidden sm:inline">{{ item.label }}</span>
          </button>
        </nav>
        
        <!-- User -->
        <div class="flex items-center gap-3">
          <UserAvatar :avatar="avatar" :size="32" />
          <span class="text-sm hidden sm:inline">{{ nickname }}</span>
        </div>
      </header>
      
      <!-- Content -->
      <main class="flex-1 overflow-hidden">
        <ChatPanel v-show="activeView === 'chat'" />
        <CharacterSheet v-show="activeView === 'character-sheet'" />
        <BattleMap v-show="activeView === 'battle-map'" :readonly="true" />
      </main>
    </template>
    
    <!-- Сплеш-оверлей для эффектов от мастера -->
    <SplashOverlay />
  </div>
</template>
