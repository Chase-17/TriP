<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { storeToRefs } from 'pinia'

import UserAvatar from './UserAvatar.vue'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'

const session = useSessionStore()
const userStore = useUserStore()
const { messages, status, role, userProfiles } = storeToRefs(session)
const draft = ref('')
const listRef = ref(null)

// Фильтруем только пользовательские сообщения (убираем системные)
const chatMessages = computed(() => 
  messages.value.filter(m => m.type !== 'system')
)

// Получаем актуальный профиль пользователя по userId
const getUserProfile = (userId) => {
  // Если это текущий пользователь - берем из userStore
  if (userId === userStore.userId) {
    return {
      nickname: userStore.nickname || 'Гость',
      avatar: userStore.avatar
    }
  }
  
  // Иначе ищем в карте профилей
  const profile = userProfiles.value.get(userId)
  if (profile) {
    return {
      nickname: profile.nickname || 'Гость',
      avatar: profile.avatar
    }
  }
  
  // Fallback для старых сообщений без userId
  return {
    nickname: 'Неизвестный',
    avatar: null
  }
}

const canSend = computed(() => {
  if (role.value === 'master') {
    return ['ready', 'in-room'].includes(status.value)
  }
  return status.value === 'in-room'
})

// Автоскролл при новых сообщениях
watch(() => chatMessages.value.length, () => {
  nextTick(() => {
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  })
})

const submit = () => {
  if (!canSend.value) return
  session.sendMessage(draft.value)
  draft.value = ''
}

const onKey = (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    submit()
  }
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="flex flex-col h-full bg-slate-950">
    <!-- Messages area -->
    <div ref="listRef" class="flex-1 overflow-y-auto px-6 py-6 space-y-4">
      <div
        v-if="chatMessages.length === 0"
        class="h-full flex items-center justify-center"
      >
        <div class="text-center max-w-md">
          <p class="text-slate-500 text-lg mb-2">Чат пуст</p>
          <p class="text-slate-600 text-sm">
            {{ canSend 
              ? 'Отправьте первое сообщение, чтобы начать переписку.' 
              : 'Подключитесь к комнате, чтобы начать общение.' 
            }}
          </p>
        </div>
      </div>
      
      <article
        v-for="message in chatMessages"
        :key="message.id"
        class="flex gap-3 items-start max-w-2xl"
        :class="[
          message.senderRole === 'master' ? 'ml-0 mr-auto' : '',
          message.senderRole === 'player' ? 'mr-0 ml-auto flex-row-reverse' : ''
        ]"
      >
        <UserAvatar 
          :avatar="getUserProfile(message.userId).avatar" 
          :name="getUserProfile(message.userId).nickname" 
          size="md" 
        />
        
        <div
          class="rounded-xl px-5 py-3 border flex-1"
          :class="[
            message.senderRole === 'master' ? 'bg-sky-500/10 border-sky-400/30' : '',
            message.senderRole === 'player' ? 'bg-emerald-500/10 border-emerald-400/20' : ''
          ]"
        >
          <header class="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span class="font-semibold text-slate-200">
              {{ getUserProfile(message.userId).nickname }}
            </span>
            <time>{{ formatTime(message.time) }}</time>
          </header>
          <p class="text-base text-slate-100 whitespace-pre-line">{{ message.text }}</p>
        </div>
      </article>
    </div>

    <!-- Input area -->
    <footer class="border-t border-white/10 bg-slate-900/80 backdrop-blur px-6 py-4">
      <div class="flex gap-3 items-end max-w-4xl mx-auto">
        <textarea
          v-model="draft"
          class="flex-1 min-h-[56px] max-h-[200px] rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-base text-slate-50 resize-none"
          placeholder="Напишите сообщение..."
          :disabled="!canSend"
          @keydown="onKey"
          rows="1"
        ></textarea>
        <button
          type="button"
          class="h-[56px] px-6 rounded-xl bg-sky-500/20 border border-sky-400/60 font-semibold text-sky-100 hover:bg-sky-500/30 disabled:opacity-40 transition flex-shrink-0"
          :disabled="!canSend || !draft.trim()"
          @click="submit"
        >
          Отправить
        </button>
      </div>
    </footer>
  </div>
</template>
