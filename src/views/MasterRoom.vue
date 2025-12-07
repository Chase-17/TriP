<script setup>
/**
 * MasterRoom - полнофункциональная комната мастера
 * Все инструменты редактирования: карты, персонажи, чат, управление игроками
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import { useBattleMapStore } from '@/stores/battleMap'
import ChatPanel from '@/components/ChatPanel.vue'
import CharacterSheet from '@/components/CharacterSheet.vue'
import BattleMap from '@/components/BattleMap.vue'
import MasterTools from '@/components/MasterTools.vue'
import MasterCharactersPanel from '@/components/MasterCharactersPanel.vue'
import UserAvatar from '@/components/UserAvatar.vue'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const userStore = useUserStore()
const battleMapStore = useBattleMapStore()

const { roomId, status, connections } = storeToRefs(session)
const { nickname, avatar } = storeToRefs(userStore)

// Computed свойства
const isRoomReady = computed(() => status.value === 'ready' || status.value === 'in-room')
const players = computed(() => connections.value || [])
const hasPlayers = computed(() => players.value.length > 0 && players.value.some(c => c.ready))
const readyPlayersCount = computed(() => players.value.filter(p => p.ready).length)

// Текст статуса
const connectionStatusText = computed(() => {
  if (status.value === 'connecting') return 'Подключение...'
  if (status.value === 'error') return 'Ошибка'
  if (status.value === 'in-room' || hasPlayers.value) return `● ${readyPlayersCount.value} игрок(ов)`
  if (status.value === 'ready') return '○ Ожидание игроков'
  return '○ Локально'
})

const connectionStatusClass = computed(() => {
  if (status.value === 'error') return 'bg-rose-500/20 text-rose-400'
  if (hasPlayers.value) return 'bg-emerald-500/20 text-emerald-400'
  if (status.value === 'ready') return 'bg-amber-500/20 text-amber-400'
  return 'bg-slate-500/20 text-slate-400'
})

// Текущий вид
const activeView = ref('battle-map')

// Показывать боковую панель игроков
const showPlayersSidebar = ref(false)

// Копирование кода комнаты
const codeCopied = ref(false)

const navItems = [
  { id: 'battle-map', label: 'Карта', icon: '🗺️' },
  { id: 'master-tools', label: 'Инструменты', icon: '⚙️' },
  { id: 'chat', label: 'Чат', icon: '💬' },
  { id: 'characters', label: 'Персонажи', icon: '👥' }
]

onMounted(async () => {
  const roomIdParam = route.params.roomId
  
  if (!roomIdParam) {
    router.push('/master')
    return
  }
  
  // Устанавливаем роль мастера и roomId
  session.setRole('master')
  session.roomId = roomIdParam
  
  // Создаём комнату как мастер (хост)
  try {
    await session.createRoom()
  } catch (error) {
    console.error('Ошибка создания комнаты:', error)
  }
})

onUnmounted(() => {
  session.leaveRoom()
})

const setView = (view) => {
  activeView.value = view
}

const copyRoomCode = async () => {
  try {
    await navigator.clipboard.writeText(route.params.roomId)
    codeCopied.value = true
    setTimeout(() => { codeCopied.value = false }, 2000)
  } catch (e) {
    console.error('Не удалось скопировать:', e)
  }
}

const leaveRoom = () => {
  session.leaveRoom()
  router.push('/master')
}

const playerCount = computed(() => players.value.length)
</script>

<template>
  <div class="h-screen bg-slate-950 text-slate-50 flex flex-col overflow-hidden">
    <!-- Header -->
    <header class="bg-slate-900/90 backdrop-blur border-b border-white/10 px-4 py-2 flex items-center justify-between flex-shrink-0">
      <!-- Left: Back + Room info -->
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="text-slate-400 hover:text-white transition text-sm"
          @click="leaveRoom"
        >
          ← Назад
        </button>
        
        <div class="h-5 w-px bg-white/10"></div>
        
        <!-- Room code (clickable to copy) -->
        <button
          type="button"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 hover:bg-amber-500/30 transition"
          @click="copyRoomCode"
          :title="codeCopied ? 'Скопировано!' : 'Нажмите чтобы скопировать код'"
        >
          <span class="font-mono font-medium tracking-widest text-amber-400">
            {{ route.params.roomId }}
          </span>
          <span class="text-xs">{{ codeCopied ? '✓' : '📋' }}</span>
        </button>
        
        <!-- Connection status -->
        <span
          class="px-2 py-0.5 rounded text-xs"
          :class="connectionStatusClass"
        >
          {{ connectionStatusText }}
        </span>
        
        <!-- Master badge -->
        <span class="px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 border border-purple-400/30">
          ⚔️ Мастер
        </span>
      </div>
      
      <!-- Center: Navigation -->
      <nav class="flex gap-1">
        <button
          v-for="item in navItems"
          :key="item.id"
          type="button"
          class="px-3 py-1.5 rounded-lg text-sm transition flex items-center gap-1.5"
          :class="activeView === item.id 
            ? 'bg-amber-500/20 text-amber-400 border border-amber-400/40' 
            : 'text-slate-400 hover:text-white hover:bg-white/5'"
          @click="setView(item.id)"
        >
          <span>{{ item.icon }}</span>
          <span class="hidden md:inline">{{ item.label }}</span>
        </button>
      </nav>
      
      <!-- Right: Players + User -->
      <div class="flex items-center gap-3">
        <!-- Players count -->
        <button
          type="button"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg border transition"
          :class="showPlayersSidebar 
            ? 'bg-sky-500/20 border-sky-400/40 text-sky-400' 
            : 'border-white/10 text-slate-400 hover:text-white hover:bg-white/5'"
          @click="showPlayersSidebar = !showPlayersSidebar"
        >
          <span>👥</span>
          <span class="text-sm">{{ playerCount }}</span>
        </button>
        
        <div class="h-5 w-px bg-white/10"></div>
        
        <div class="flex items-center gap-2">
          <UserAvatar :avatar="avatar" :size="28" />
          <span class="text-sm hidden sm:inline">{{ nickname || 'Мастер' }}</span>
        </div>
      </div>
    </header>
    
    <!-- Main area -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Content -->
      <main class="flex-1 overflow-hidden">
        <BattleMap v-show="activeView === 'battle-map'" />
        <MasterTools v-show="activeView === 'master-tools'" />
        <ChatPanel v-show="activeView === 'chat'" />
        
        <!-- Characters panel -->
        <MasterCharactersPanel v-show="activeView === 'characters'" />
      </main>
      
      <!-- Players sidebar -->
      <aside
        v-if="showPlayersSidebar"
        class="w-64 bg-slate-900/50 border-l border-white/10 flex flex-col flex-shrink-0"
      >
        <div class="p-4 border-b border-white/10">
          <h3 class="font-medium">Игроки в комнате</h3>
        </div>
        
        <div class="flex-1 overflow-y-auto p-2">
          <div v-if="playerCount === 0" class="text-center py-8 text-slate-500 text-sm">
            <p>Пока никого нет</p>
            <p class="mt-2">Отправьте код комнаты игрокам:</p>
            <div class="mt-2 px-3 py-2 bg-slate-800 rounded font-mono text-amber-400">
              {{ route.params.roomId }}
            </div>
          </div>
          
          <div
            v-for="player in players"
            :key="player.id"
            class="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5"
          >
            <UserAvatar :avatar="player.avatar" :size="32" />
            <div class="flex-1 min-w-0">
              <div class="text-sm truncate">{{ player.nickname }}</div>
              <div class="text-xs text-slate-500">{{ player.role }}</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
