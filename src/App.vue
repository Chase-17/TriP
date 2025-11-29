<script setup>
import { ref, onMounted, computed } from 'vue'
import { storeToRefs } from 'pinia'

import ChatPanel from '@/components/ChatPanel.vue'
import CharacterSheet from '@/components/CharacterSheet.vue'
import BattleMap from '@/components/BattleMap.vue'
import RoomSidebar from '@/components/RoomSidebar.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'

const session = useSessionStore()
const { roomId } = storeToRefs(session)

const userStore = useUserStore()
const { nickname, avatar, currentView } = storeToRefs(userStore)

const sidebarOpen = ref(false)

onMounted(() => {
  // Инициализируем профиль пользователя при первом запуске
  userStore.initializeProfile()
})

const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value
}

const setView = (view) => {
  userStore.setCurrentView(view)
}

const navItems = computed(() => [
  { id: 'chat', label: 'Чат', icon: '💬' },
  { id: 'character-sheet', label: 'Персонаж', icon: '👤' },
  { id: 'battle-map', label: 'Карта', icon: '🗺️' }
])

</script>

<template>
  <main class="h-screen bg-slate-950 text-slate-50 flex flex-col overflow-hidden">
    <!-- Top bar -->
    <header class="bg-slate-900/90 backdrop-blur border-b border-white/10 px-6 py-3 flex items-center justify-between flex-shrink-0">
      <div class="flex items-center gap-4">
        <h1 class="text-xl font-semibold">TriP Rooms</h1>
        <span
          v-if="roomId"
          class="text-sm px-3 py-1 rounded-full bg-slate-800 border border-white/10 font-mono tracking-wider"
        >
          {{ roomId }}
        </span>
      </div>
      
      <div class="flex items-center gap-3">
        <!-- Аватар текущего пользователя -->
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-white/10">
          <UserAvatar :avatar="avatar" :name="nickname" size="sm" />
          <span class="text-sm font-medium text-slate-200">{{ nickname }}</span>
        </div>
        
        <button
          type="button"
          class="w-10 h-10 rounded-lg border border-white/10 hover:bg-white/5 flex items-center justify-center transition"
          :class="sidebarOpen ? 'bg-sky-500/20 border-sky-400/50' : ''"
          @click="toggleSidebar"
          title="Управление комнатой"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </header>

    <!-- Main content area -->
    <div class="flex-1 overflow-hidden">
      <ChatPanel v-if="currentView === 'chat'" />
      <CharacterSheet v-else-if="currentView === 'character-sheet'" />
      <BattleMap v-else-if="currentView === 'battle-map'" />
    </div>

    <!-- Bottom navigation (mobile-friendly) -->
    <nav class="bg-slate-900/95 backdrop-blur border-t border-white/10 px-2 py-2 flex items-center justify-around flex-shrink-0">
      <button
        v-for="item in navItems"
        :key="item.id"
        type="button"
        class="flex-1 flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition"
        :class="currentView === item.id 
          ? 'bg-sky-500/20 text-sky-300' 
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'"
        @click="setView(item.id)"
      >
        <span class="text-2xl">{{ item.icon }}</span>
        <span class="text-xs font-medium">{{ item.label }}</span>
      </button>
    </nav>

    <!-- Sidebar -->
    <RoomSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
  </main>
</template>
