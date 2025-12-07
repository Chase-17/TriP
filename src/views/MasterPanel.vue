<script setup>
/**
 * MasterPanel - главная панель мастера
 * Управление комнатами, картами, ассетами
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import { useBattleMapStore } from '@/stores/battleMap'
import { useFillProfileStore } from '@/stores/fillProfile'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const session = useSessionStore()
const userStore = useUserStore()
const battleMapStore = useBattleMapStore()
const fillProfileStore = useFillProfileStore()

const { nickname, avatar } = storeToRefs(userStore)
const { maps } = storeToRefs(battleMapStore)
const { profiles: fillProfiles } = storeToRefs(fillProfileStore)

// Активная вкладка
const activeTab = ref('rooms')

// Создание комнаты
const isCreatingRoom = ref(false)
const newRoomName = ref('')

// Список комнат (сохранённые)
const savedRooms = ref([])

onMounted(() => {
  userStore.initializeProfile()
  // Загрузка сохранённых комнат из localStorage
  const stored = localStorage.getItem('trip-master-rooms')
  if (stored) {
    try {
      savedRooms.value = JSON.parse(stored)
    } catch (e) {
      savedRooms.value = []
    }
  }
})

const createRoom = async () => {
  if (!newRoomName.value.trim()) return
  
  isCreatingRoom.value = true
  
  try {
    // Генерируем ID комнаты
    const roomId = generateRoomId()
    
    // Сохраняем комнату
    const room = {
      id: roomId,
      name: newRoomName.value.trim(),
      createdAt: Date.now(),
      mapId: null
    }
    
    savedRooms.value.unshift(room)
    saveRooms()
    
    // Переходим в комнату мастера
    router.push({ name: 'master-room', params: { roomId } })
  } finally {
    isCreatingRoom.value = false
    newRoomName.value = ''
  }
}

const generateRoomId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

const saveRooms = () => {
  localStorage.setItem('trip-master-rooms', JSON.stringify(savedRooms.value))
}

const deleteRoom = (roomId) => {
  if (!confirm('Удалить комнату?')) return
  savedRooms.value = savedRooms.value.filter(r => r.id !== roomId)
  saveRooms()
}

const openRoom = (roomId) => {
  router.push({ name: 'master-room', params: { roomId } })
}

const formatDate = (timestamp) => {
  return new Date(timestamp).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const tabs = [
  { id: 'rooms', label: 'Комнаты', icon: '🚪' },
  { id: 'maps', label: 'Карты', icon: '🗺️' },
  { id: 'profiles', label: 'Профили заливки', icon: '🎲' },
  { id: 'assets', label: 'Ассеты', icon: '🎨' }
]
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
    <!-- Header -->
    <header class="bg-slate-900/80 backdrop-blur border-b border-white/10 px-6 py-4">
      <div class="max-w-6xl mx-auto flex items-center justify-between">
        <div class="flex items-center gap-4">
          <router-link
            to="/"
            class="text-slate-400 hover:text-white transition"
          >
            ← На главную
          </router-link>
          
          <div class="h-6 w-px bg-white/10"></div>
          
          <h1 class="text-xl font-bold bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
            ⚔️ Панель мастера
          </h1>
        </div>
        
        <div class="flex items-center gap-3">
          <UserAvatar :avatar="avatar" :size="32" />
          <span class="text-sm">{{ nickname || 'Мастер' }}</span>
        </div>
      </div>
    </header>
    
    <!-- Tabs -->
    <div class="bg-slate-900/50 border-b border-white/10">
      <div class="max-w-6xl mx-auto flex gap-1 px-6">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="px-4 py-3 text-sm transition border-b-2 -mb-px"
          :class="activeTab === tab.id 
            ? 'text-amber-400 border-amber-400' 
            : 'text-slate-400 border-transparent hover:text-white'"
          @click="activeTab = tab.id"
        >
          {{ tab.icon }} {{ tab.label }}
        </button>
      </div>
    </div>
    
    <!-- Content -->
    <main class="flex-1 p-6">
      <div class="max-w-6xl mx-auto">
        
        <!-- Rooms tab -->
        <div v-if="activeTab === 'rooms'" class="space-y-6">
          <!-- Create room -->
          <div class="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <h2 class="text-lg font-semibold mb-4">Создать комнату</h2>
            
            <form @submit.prevent="createRoom" class="flex gap-3">
              <input
                v-model="newRoomName"
                type="text"
                placeholder="Название комнаты (например: Кампания драконов)"
                class="flex-1 px-4 py-2 bg-slate-800 border border-white/10 rounded-lg focus:outline-none focus:border-amber-400/50"
              />
              <button
                type="submit"
                class="px-6 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition disabled:opacity-50"
                :disabled="!newRoomName.trim() || isCreatingRoom"
              >
                {{ isCreatingRoom ? 'Создание...' : '+ Создать' }}
              </button>
            </form>
          </div>
          
          <!-- Rooms list -->
          <div class="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <h2 class="text-lg font-semibold mb-4">Ваши комнаты</h2>
            
            <div v-if="savedRooms.length === 0" class="text-center py-8 text-slate-500">
              У вас пока нет комнат. Создайте первую!
            </div>
            
            <div v-else class="grid gap-3">
              <div
                v-for="room in savedRooms"
                :key="room.id"
                class="flex items-center justify-between p-4 bg-slate-800/50 border border-white/5 rounded-lg hover:border-white/20 transition"
              >
                <div class="flex items-center gap-4">
                  <div class="text-2xl">🎮</div>
                  <div>
                    <h3 class="font-medium">{{ room.name }}</h3>
                    <div class="flex items-center gap-3 text-xs text-slate-400">
                      <span class="font-mono bg-slate-700 px-2 py-0.5 rounded">{{ room.id }}</span>
                      <span>{{ formatDate(room.createdAt) }}</span>
                    </div>
                  </div>
                </div>
                
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition"
                    @click="openRoom(room.id)"
                  >
                    Открыть
                  </button>
                  <button
                    type="button"
                    class="p-2 text-slate-400 hover:text-rose-400 transition"
                    @click="deleteRoom(room.id)"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Maps tab -->
        <div v-if="activeTab === 'maps'" class="space-y-6">
          <div class="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold">Сохранённые карты</h2>
              <span class="text-sm text-slate-400">{{ maps.length }} карт</span>
            </div>
            
            <div v-if="maps.length === 0" class="text-center py-8 text-slate-500">
              Карты создаются в комнате мастера
            </div>
            
            <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="map in maps"
                :key="map.id"
                class="p-4 bg-slate-800/50 border border-white/5 rounded-lg"
              >
                <div class="aspect-video bg-slate-700 rounded mb-3 flex items-center justify-center text-4xl">
                  🗺️
                </div>
                <h3 class="font-medium truncate">{{ map.name }}</h3>
                <p class="text-xs text-slate-400">
                  {{ map.scale }} • {{ map.layers?.find(l => l.type === 'terrain')?.data?.size || 0 }} гексов
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Fill profiles tab -->
        <div v-if="activeTab === 'profiles'" class="space-y-6">
          <div class="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-lg font-semibold">Профили заливки</h2>
              <span class="text-sm text-slate-400">{{ fillProfiles.length }} профилей</span>
            </div>
            
            <div v-if="fillProfiles.length === 0" class="text-center py-8 text-slate-500">
              Профили заливки создаются при редактировании карты
            </div>
            
            <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="profile in fillProfiles"
                :key="profile.id"
                class="p-4 bg-slate-800/50 border border-white/5 rounded-lg"
              >
                <h3 class="font-medium">{{ profile.name }}</h3>
                <p class="text-xs text-slate-400 mt-1">
                  База: {{ profile.baseTerrain }} • {{ profile.layers?.length || 0 }} слоёв
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Assets tab -->
        <div v-if="activeTab === 'assets'" class="space-y-6">
          <div class="bg-slate-900/50 border border-white/10 rounded-xl p-6">
            <h2 class="text-lg font-semibold mb-4">Управление ассетами</h2>
            
            <div class="text-center py-8 text-slate-500">
              <div class="text-4xl mb-4">🎨</div>
              <p>Загрузка кастомных ассетов — в разработке</p>
              <p class="text-sm mt-2">Пока используйте базовые террейны</p>
            </div>
          </div>
        </div>
        
      </div>
    </main>
  </div>
</template>
