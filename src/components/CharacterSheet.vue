<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import UserAvatar from './UserAvatar.vue'
import CharacterWizard from './CharacterWizard.vue'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const { activeCharacter, characters } = storeToRefs(userStore)

const showWizard = ref(false)

const hasCharacter = computed(() => Boolean(activeCharacter.value))

const openWizard = () => {
  showWizard.value = true
}

const closeWizard = () => {
  showWizard.value = false
}

const handleCharacterCreated = () => {
  showWizard.value = false
}
</script>

<template>
  <div class="h-full bg-slate-950 text-slate-50 overflow-y-auto">
    <!-- Нет персонажей -->
    <div v-if="!hasCharacter" class="h-full flex items-center justify-center px-6">
      <div class="text-center max-w-md">
        <div class="w-24 h-24 mx-auto mb-6 rounded-full bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center">
          <span class="text-4xl text-slate-600">👤</span>
        </div>
        <h2 class="text-2xl font-bold mb-3">Персонаж не создан</h2>
        <p class="text-slate-400 mb-6">
          Создайте своего первого персонажа, чтобы начать приключение
        </p>
        <button
          type="button"
          class="px-6 py-3 rounded-xl bg-sky-500/20 border border-sky-400/60 font-semibold text-sky-100 hover:bg-sky-500/30 transition"
          @click="openWizard"
        >
          Создать персонажа
        </button>
      </div>
    </div>

    <!-- Карточка персонажа -->
    <div v-else class="px-4 py-6 space-y-6 max-w-2xl mx-auto">
      <!-- Заголовок с аватаром -->
      <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-6">
        <div class="flex items-start gap-4">
          <UserAvatar :avatar="activeCharacter.avatar" :name="activeCharacter.name" size="xl" />
          <div class="flex-1 min-w-0">
            <h1 class="text-2xl font-bold truncate">{{ activeCharacter.name }}</h1>
            <p class="text-slate-400 text-sm">
              {{ activeCharacter.class || 'Класс не указан' }} • Уровень {{ activeCharacter.level }}
            </p>
          </div>
          <button
            type="button"
            class="px-3 py-1.5 text-sm rounded-lg border border-white/10 hover:bg-white/5"
          >
            ⚙️
          </button>
        </div>
      </div>

      <!-- HP -->
      <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-6">
        <p class="text-xs uppercase tracking-wide text-slate-500 mb-3">Здоровье</p>
        <div class="flex items-center gap-4">
          <div class="flex-1">
            <div class="h-3 bg-slate-800 rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-rose-500 to-red-600 transition-all"
                :style="{ width: `${(activeCharacter.hp.current / activeCharacter.hp.max) * 100}%` }"
              ></div>
            </div>
          </div>
          <p class="text-2xl font-bold font-mono">
            {{ activeCharacter.hp.current }} / {{ activeCharacter.hp.max }}
          </p>
        </div>
      </div>

      <!-- Характеристики -->
      <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-6">
        <p class="text-xs uppercase tracking-wide text-slate-500 mb-4">Характеристики</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div v-for="(value, stat) in activeCharacter.stats" :key="stat" class="text-center p-4 bg-slate-950/60 rounded-xl">
            <p class="text-xs uppercase tracking-wide text-slate-400 mb-1">{{ stat }}</p>
            <p class="text-3xl font-bold">{{ value }}</p>
          </div>
        </div>
        <p v-if="!Object.keys(activeCharacter.stats || {}).length" class="text-center text-slate-500 py-4">
          Характеристики не заданы
        </p>
      </div>

      <!-- Навыки -->
      <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-6">
        <p class="text-xs uppercase tracking-wide text-slate-500 mb-4">Навыки</p>
        <div v-if="activeCharacter.skills?.length" class="space-y-2">
          <div
            v-for="skill in activeCharacter.skills"
            :key="skill"
            class="px-4 py-2 bg-slate-950/60 rounded-lg text-sm"
          >
            {{ skill }}
          </div>
        </div>
        <p v-else class="text-center text-slate-500 py-4">
          Навыки не заданы
        </p>
      </div>

      <!-- Заметки -->
      <div class="bg-slate-900/60 border border-white/10 rounded-2xl p-6">
        <p class="text-xs uppercase tracking-wide text-slate-500 mb-3">Заметки</p>
        <p class="text-slate-300 whitespace-pre-wrap">
          {{ activeCharacter.notes || 'Заметок пока нет' }}
        </p>
      </div>
    </div>

    <!-- Character Wizard -->
    <CharacterWizard 
      v-if="showWizard" 
      @close="closeWizard" 
      @created="handleCharacterCreated"
    />
  </div>
</template>
