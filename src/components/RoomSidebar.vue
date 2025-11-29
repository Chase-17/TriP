<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'

import MasterPanel from './MasterPanel.vue'
import PlayerPanel from './PlayerPanel.vue'
import RoleSelector from './RoleSelector.vue'
import UserAvatar from './UserAvatar.vue'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'

const props = defineProps({
  open: Boolean
})

const emit = defineEmits(['close'])

const session = useSessionStore()
const { role, status, roomId, messages, connections } = storeToRefs(session)

const userStore = useUserStore()
const { nickname, avatar } = storeToRefs(userStore)

const editingNickname = ref(false)
const nicknameInput = ref('')

const startEditNickname = () => {
  nicknameInput.value = nickname.value
  editingNickname.value = true
}

const saveNickname = () => {
  if (nicknameInput.value.trim()) {
    userStore.setNickname(nicknameInput.value)
  }
  editingNickname.value = false
}

const cancelEditNickname = () => {
  editingNickname.value = false
}

const statusLabels = {
  idle: 'ожидание',
  connecting: 'подключение',
  ready: 'комната создана',
  'in-room': 'в комнате',
  error: 'ошибка'
}

const readableStatus = computed(() => statusLabels[status.value] ?? status.value)

// Системные сообщения для отображения в сайдбаре
const systemMessages = computed(() => 
  messages.value.filter(m => m.type === 'system').slice(-10)
)

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

const resetAll = () => {
  if (confirm('Удалить все данные и начать с чистого листа? История чата будет потеряна.')) {
    session.reset()
    emit('close')
  }
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex"
    :class="open ? 'pointer-events-auto' : 'pointer-events-none'"
  >
    <!-- Overlay -->
    <div
      class="absolute inset-0 bg-black/60 transition-opacity duration-300"
      :class="open ? 'opacity-100' : 'opacity-0'"
      @click="emit('close')"
    ></div>

    <!-- Sidebar -->
    <aside
      class="relative ml-auto w-full max-w-md bg-slate-900 border-l border-white/10 shadow-2xl overflow-y-auto transition-transform duration-300"
      :class="open ? 'translate-x-0' : 'translate-x-full'"
    >
      <!-- Header -->
      <header class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-white/10 px-6 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold text-slate-50">Управление комнатой</h2>
            <p class="text-xs text-slate-400 mt-0.5">
              Статус: <strong class="text-sky-300">{{ readableStatus }}</strong>
            </p>
          </div>
          <button
            type="button"
            class="w-10 h-10 rounded-lg border border-white/10 hover:bg-white/5 flex items-center justify-center"
            @click="emit('close')"
          >
            <span class="text-slate-300 text-2xl">&times;</span>
          </button>
        </div>
      </header>

      <div class="px-6 py-6 space-y-6">
        <!-- User profile -->
        <div class="bg-slate-950/60 border border-white/10 rounded-xl px-5 py-4">
          <p class="text-xs uppercase tracking-wide text-slate-500 mb-3">Ваш профиль</p>
          <div class="flex items-center gap-3">
            <UserAvatar :avatar="avatar" :name="nickname" size="lg" />
            <div class="flex-1 min-w-0">
              <div v-if="!editingNickname" class="flex items-center gap-2">
                <p class="text-lg font-semibold text-slate-50 truncate">{{ nickname }}</p>
                <button
                  type="button"
                  class="text-slate-400 hover:text-sky-400 text-sm"
                  @click="startEditNickname"
                  title="Изменить никнейм"
                >
                  ✎
                </button>
              </div>
              <div v-else class="flex gap-2">
                <input
                  v-model="nicknameInput"
                  type="text"
                  class="flex-1 px-3 py-1 rounded border border-white/10 bg-slate-950/60 text-sm text-slate-50"
                  maxlength="20"
                  @keydown.enter="saveNickname"
                  @keydown.esc="cancelEditNickname"
                />
                <button
                  type="button"
                  class="px-2 text-emerald-400 hover:text-emerald-300"
                  @click="saveNickname"
                >
                  ✓
                </button>
                <button
                  type="button"
                  class="px-2 text-rose-400 hover:text-rose-300"
                  @click="cancelEditNickname"
                >
                  ✕
                </button>
              </div>
              <button
                type="button"
                class="text-xs text-slate-400 hover:text-sky-400 mt-1"
                @click="userStore.regenerateAvatar()"
              >
                Сменить аватарку
              </button>
            </div>
          </div>
        </div>

        <!-- Room code indicator -->
        <div
          v-if="roomId"
          class="bg-slate-950/60 border border-white/10 rounded-xl px-5 py-4"
        >
          <p class="text-xs uppercase tracking-wide text-slate-500 mb-2">Код комнаты</p>
          <p class="text-2xl font-mono tracking-[0.3em] text-center text-slate-50">
            {{ roomId }}
          </p>
        </div>

        <!-- Reset button -->
        <button
          v-if="role || roomId"
          type="button"
          class="w-full py-2 text-sm text-slate-400 hover:text-rose-400 border border-white/5 hover:border-rose-400/30 rounded-lg transition"
          @click="resetAll"
        >
          Начать заново (удалить все данные)
        </button>

        <!-- Role selector -->
        <RoleSelector />

        <!-- Master or Player controls -->
        <MasterPanel v-if="role === 'master'" />
        <PlayerPanel v-else-if="role === 'player'" />
        <div
          v-else
          class="bg-slate-950/40 border border-dashed border-white/10 rounded-xl px-5 py-4 text-slate-400 text-sm"
        >
          Выберите роль, чтобы управлять комнатой.
        </div>

        <!-- Participants list -->
        <div
          v-if="role === 'master' && connections.length > 0"
          class="bg-slate-950/60 border border-white/10 rounded-xl px-5 py-4"
        >
          <p class="text-xs uppercase tracking-wide text-slate-500 mb-3">Подключённые игроки</p>
          <ul class="space-y-3">
            <li
              v-for="player in connections"
              :key="player.peerId"
              class="flex items-center gap-3"
            >
              <UserAvatar :avatar="player.avatar" :name="player.alias" size="sm" />
              <span class="text-slate-200 flex-1">{{ player.alias }}</span>
              <span
                class="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                :class="player.ready ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'"
              >
                {{ player.ready ? 'онлайн' : 'подключается' }}
              </span>
            </li>
          </ul>
        </div>

        <!-- System messages log -->
        <div
          v-if="systemMessages.length > 0"
          class="bg-slate-950/40 border border-white/10 rounded-xl px-5 py-4"
        >
          <p class="text-xs uppercase tracking-wide text-slate-500 mb-3">Журнал событий</p>
          <ul class="space-y-2 max-h-60 overflow-y-auto">
            <li
              v-for="msg in systemMessages"
              :key="msg.id"
              class="text-sm text-slate-300 flex items-start gap-2"
            >
              <time class="text-xs text-slate-500 flex-shrink-0">
                {{ formatTime(msg.time) }}
              </time>
              <span class="flex-1">{{ msg.text }}</span>
            </li>
          </ul>
        </div>
      </div>
    </aside>
  </div>
</template>
