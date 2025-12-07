<script setup>
/**
 * PlayerRoom - игровая комната для игрока
 * Чистый интерфейс: чат, персонаж, карта (только просмотр)
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import ChatPanel from '@/components/ChatPanel.vue'
import CharacterSheet from '@/components/CharacterSheet.vue'
import BattleMap from '@/components/BattleMap.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import SplashOverlay from '@/components/SplashOverlay.vue'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const userStore = useUserStore()

const { roomId, status, connections } = storeToRefs(session)
const { nickname, avatar, currentView } = storeToRefs(userStore)

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

const navItems = [
  { id: 'chat', label: 'Чат', icon: '💬' },
  { id: 'character-sheet', label: 'Персонаж', icon: '👤' },
  { id: 'battle-map', label: 'Карта', icon: '🗺️' }
]

onMounted(async () => {
  const roomIdParam = route.params.roomId
  
  if (!roomIdParam) {
    router.push('/')
    return
  }
  
  // Подключаемся к комнате
  try {
    session.joinRoom(roomIdParam)
    isConnecting.value = false
  } catch (error) {
    connectionError.value = 'Не удалось подключиться к комнате'
    isConnecting.value = false
  }
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
    
    <!-- Main content -->
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
