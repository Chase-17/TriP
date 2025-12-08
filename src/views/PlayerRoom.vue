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

const navItems = [
  { id: 'chat', label: 'Чат', icon: '💬' },
  { id: 'character-sheet', label: 'Персонаж', icon: '👤' },
  { id: 'battle-map', label: 'Карта', icon: '🗺️' }
]

// Персонаж игрока
const playerCharacter = computed(() => {
  const userId = userStore.userId
  return characters.value.find(char => char.userId === userId)
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
  if (pendingAction.value) {
    console.log('Выполняем действие:', pendingAction.value.id)
    // TODO: реализовать выполнение действия
    pendingAction.value = null
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
      <MobilePlayerInterface
        :character="playerCharacter"
        :active-view="activeView"
        :connection-status="status"
        :current-turn="currentTurn"
        :is-player-turn="isPlayerTurn"
        :pending-action="pendingAction"
        @set-view="setView"
        @leave-room="leaveRoom"
        @select-action="handleSelectAction"
        @confirm-action="handleConfirmAction"
        @cancel-action="handleCancelAction"
      />
      
      <!-- Content для мобильного интерфейса -->
      <main class="flex-1 overflow-hidden">
        <ChatPanel v-show="activeView === 'chat'" />
        <CharacterSheet v-show="activeView === 'character-sheet'" />
        <BattleMap 
          v-show="activeView === 'battle-map'" 
          :readonly="!isPlayerTurn"
          :mobile-mode="true"
          :pending-action="pendingAction"
          @action-target-selected="pendingAction && (pendingAction.canConfirm = true)"
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
