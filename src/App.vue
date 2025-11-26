<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'

import ChatPanel from '@/components/ChatPanel.vue'
import RoomSidebar from '@/components/RoomSidebar.vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { roomId } = storeToRefs(session)

const sidebarOpen = ref(false)

const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value
}
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
    </header>

    <!-- Main chat area -->
    <div class="flex-1 overflow-hidden">
      <ChatPanel />
    </div>

    <!-- Sidebar -->
    <RoomSidebar :open="sidebarOpen" @close="sidebarOpen = false" />
  </main>
</template>
