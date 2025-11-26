<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { roomId, status, error, connections } = storeToRefs(session)

const isBusy = computed(() => status.value === 'connecting')
const showRoom = computed(() => Boolean(roomId.value))
const canCopy = computed(() => showRoom.value && !isBusy.value)

const handleCreate = () => {
  if (isBusy.value) return
  session.createRoom()
}

const copyRoomId = async () => {
  if (!canCopy.value) return
  try {
    await navigator.clipboard.writeText(roomId.value)
  } catch (err) {
    console.error('Clipboard copy failed', err)
  }
}
</script>

<template>
  <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="text-sm uppercase tracking-[0.2em] text-slate-500">Шаг 2</p>
        <h2 class="text-xl font-semibold">Создайте комнату</h2>
      </div>
      <span class="text-xs px-3 py-1 rounded-full border border-white/10 uppercase tracking-wide text-slate-400">
        {{ status }}
      </span>
    </div>

    <button
      type="button"
      class="w-full rounded-xl bg-sky-500/20 border border-sky-400/60 py-3 text-lg font-semibold text-sky-100 hover:bg-sky-500/30 transition"
      :disabled="isBusy"
      @click="handleCreate"
    >
      {{ showRoom ? 'Создать новую комнату' : 'Создать комнату' }}
    </button>

    <div v-if="showRoom" class="flex flex-col gap-3">
      <p class="text-sm text-slate-400">Этим кодом делитесь с игроками:</p>
      <div class="flex items-center gap-2">
        <div class="flex-1 rounded-xl border border-white/10 px-4 py-3 font-mono text-xl tracking-[0.3em] text-center">
          {{ roomId }}
        </div>
        <button
          type="button"
          class="px-4 py-3 rounded-xl border border-white/20 hover:border-sky-400/70 text-sm"
          :disabled="!canCopy"
          @click="copyRoomId"
        >
          Копировать
        </button>
      </div>
    </div>

    <div v-if="connections.length" class="space-y-2">
      <p class="text-sm uppercase tracking-[0.2em] text-slate-500">Игроки</p>
      <ul class="space-y-2">
        <li
          v-for="player in connections"
          :key="player.peerId"
          class="flex items-center justify-between rounded-xl border border-white/5 px-4 py-2 bg-slate-950/60"
        >
          <span class="font-medium">{{ player.alias }}</span>
          <span class="text-xs text-slate-400">{{ player.ready ? 'онлайн' : 'подключается' }}</span>
        </li>
      </ul>
    </div>

    <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>
  </div>
</template>
