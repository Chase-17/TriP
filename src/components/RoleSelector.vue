<script setup>
import { storeToRefs } from 'pinia'

import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const { role } = storeToRefs(session)

const options = [
  {
    id: 'master',
    title: 'Мастер',
    description: 'Создаёт комнаты, принимает игроков и управляет чатом.'
  },
  {
    id: 'player',
    title: 'Игрок',
    description: 'Присоединяется по коду и сообщает мастеру о событиях.'
  }
]

const handleSelect = (id) => {
  session.setRole(id)
}
</script>

<template>
  <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
    <div>
      <p class="text-sm uppercase tracking-[0.2em] text-slate-500">Шаг 1</p>
      <h2 class="text-xl font-semibold mt-1">Выберите роль</h2>
      <p class="text-sm text-slate-400 mt-1">
        Можно переключаться в любой момент — история чата начнёт отсчёт заново.
      </p>
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <button
        v-for="option in options"
        :key="option.id"
        type="button"
        class="text-left rounded-xl border border-white/10 bg-slate-950/40 px-5 py-4 transition-all"
        :class="role === option.id ? 'border-sky-400/80 bg-sky-400/10 shadow-[0_0_25px_rgba(56,189,248,0.2)]' : 'hover:border-white/30'"
        @click="handleSelect(option.id)"
      >
        <p class="text-sm uppercase tracking-wide text-slate-500">{{ option.title }}</p>
        <p class="text-base text-slate-100 font-medium mt-1">{{ option.description }}</p>
      </button>
    </div>
  </div>
</template>
