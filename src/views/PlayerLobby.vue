<script setup>
/**
 * PlayerLobby - страница входа для игроков
 * Здесь игрок может ввести код комнаты и присоединиться
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const userStore = useUserStore()
const { nickname, avatar } = storeToRefs(userStore)

const roomCode = ref('')
const isJoining = ref(false)
const error = ref('')

// Редактирование профиля
const isEditingProfile = ref(false)
const editNickname = ref('')

onMounted(() => {
  userStore.initializeProfile()
  editNickname.value = nickname.value
})

const joinRoom = async () => {
  if (!roomCode.value.trim()) {
    error.value = 'Введите код комнаты'
    return
  }
  
  if (!nickname.value.trim()) {
    error.value = 'Укажите имя'
    isEditingProfile.value = true
    return
  }
  
  isJoining.value = true
  error.value = ''
  
  try {
    // Переходим в комнату
    router.push({
      name: 'player-room',
      params: { roomId: roomCode.value.trim().toUpperCase() }
    })
  } catch (e) {
    error.value = 'Не удалось подключиться'
    isJoining.value = false
  }
}

const saveProfile = () => {
  if (editNickname.value.trim()) {
    userStore.setNickname(editNickname.value.trim())
  }
  isEditingProfile.value = false
}

const handleAvatarChange = (newAvatar) => {
  userStore.setAvatar(newAvatar)
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 text-slate-50 flex flex-col">
    <!-- Header -->
    <header class="bg-slate-900/80 backdrop-blur border-b border-white/10 px-6 py-4">
      <div class="max-w-4xl mx-auto flex items-center justify-between">
        <h1 class="text-2xl font-bold bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">
          TriP Rooms
        </h1>
        
        <!-- Профиль игрока -->
        <button
          type="button"
          class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition"
          @click="isEditingProfile = true"
        >
          <UserAvatar :avatar="avatar" :size="32" />
          <span class="text-sm">{{ nickname || 'Настроить профиль' }}</span>
        </button>
      </div>
    </header>
    
    <!-- Main content -->
    <main class="flex-1 flex items-center justify-center p-6">
      <div class="w-full max-w-md">
        <!-- Join room card -->
        <div class="bg-slate-900/50 backdrop-blur border border-white/10 rounded-2xl p-8">
          <div class="text-center mb-8">
            <div class="text-6xl mb-4">🎲</div>
            <h2 class="text-2xl font-semibold mb-2">Присоединиться к игре</h2>
            <p class="text-slate-400">Введите код комнаты от мастера</p>
          </div>
          
          <form @submit.prevent="joinRoom" class="space-y-4">
            <div>
              <input
                v-model="roomCode"
                type="text"
                placeholder="Код комнаты"
                class="w-full px-4 py-3 text-lg text-center font-mono tracking-widest uppercase bg-slate-800 border border-white/10 rounded-xl focus:outline-none focus:border-sky-400/50 focus:ring-2 focus:ring-sky-400/20"
                :disabled="isJoining"
              />
            </div>
            
            <div v-if="error" class="text-rose-400 text-sm text-center">
              {{ error }}
            </div>
            
            <button
              type="submit"
              class="w-full py-3 bg-sky-500 hover:bg-sky-600 text-white font-medium rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="isJoining || !roomCode.trim()"
            >
              <span v-if="isJoining">Подключение...</span>
              <span v-else>Войти в комнату</span>
            </button>
          </form>
        </div>
        
        <!-- Master link -->
        <div class="mt-6 text-center">
          <router-link
            to="/master"
            class="text-sm text-slate-500 hover:text-sky-400 transition"
          >
            Войти как мастер →
          </router-link>
        </div>
      </div>
    </main>
    
    <!-- Edit profile modal -->
    <div
      v-if="isEditingProfile"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      @click.self="isEditingProfile = false"
    >
      <div class="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 class="text-lg font-semibold mb-4">Ваш профиль</h3>
        
        <div class="flex flex-col items-center gap-4 mb-6">
          <UserAvatar
            :avatar="avatar"
            :size="80"
            :editable="true"
            @change="handleAvatarChange"
          />
          
          <input
            v-model="editNickname"
            type="text"
            placeholder="Ваше имя"
            class="w-full px-4 py-2 bg-slate-900 border border-white/10 rounded-lg text-center focus:outline-none focus:border-sky-400/50"
          />
        </div>
        
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 py-2 text-slate-400 hover:text-white transition"
            @click="isEditingProfile = false"
          >
            Отмена
          </button>
          <button
            type="button"
            class="flex-1 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition"
            @click="saveProfile"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
