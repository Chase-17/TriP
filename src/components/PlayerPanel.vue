<script setup>
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'

import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { status, error, roomId } = storeToRefs(session)

const roomCode = ref('')

watch(
  () => roomId.value,
  (value) => {
    if (status.value === 'in-room') {
      roomCode.value = value
    }
  }
)

const isJoining = computed(() => status.value === 'connecting')
const canJoin = computed(() => roomCode.value.trim().length >= 4 && !isJoining.value)
const canLeave = computed(() => status.value === 'in-room')

const join = () => {
  if (!canJoin.value) return
  session.joinRoom(roomCode.value)
}

const leave = () => {
  session.leaveRoom()
}
</script>

<template>
  <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-6 space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <p class="text-sm uppercase tracking-[0.2em] text-slate-500">Шаг 2</p>
        <h2 class="text-xl font-semibold">Подключитесь к комнате</h2>
      </div>
      <span class="text-xs px-3 py-1 rounded-full border border-white/10 uppercase tracking-wide text-slate-400">
        {{ status }}
      </span>
    </div>
    <label class="flex flex-col gap-2">
      <span class="text-sm text-slate-400">Код комнаты</span>
      <input
        v-model="roomCode"
        type="text"
        maxlength="8"
        class="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3 font-mono tracking-[0.3em] text-center text-lg uppercase"
        placeholder="ABC123"
      />
    </label>
    <div class="flex flex-wrap gap-3">
      <button
        type="button"
        class="flex-1 rounded-xl bg-emerald-500/20 border border-emerald-400/60 py-3 text-base font-semibold text-emerald-100 hover:bg-emerald-500/30 transition"
        :disabled="!canJoin"
        @click="join"
      >
        Войти
      </button>
      <button
        type="button"
        class="flex-1 rounded-xl border border-white/20 py-3 text-base font-semibold text-slate-200 hover:border-rose-400/70 hover:text-rose-200"
        :disabled="!canLeave"
        @click="leave"
      >
        Выйти
      </button>
    </div>
    <p v-if="error" class="text-sm text-rose-300">{{ error }}</p>
  </div>
</template>
