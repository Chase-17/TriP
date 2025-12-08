<script setup>
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import UserAvatar from './UserAvatar.vue'
import CharacterWizard from './CharacterWizard.vue'
import CharacterSheetDetailed from './CharacterSheetDetailed.vue'
import CharacterCards from './CharacterCards.vue'
import { useUserStore } from '@/stores/user'
import { useCharactersStore } from '@/stores/characters'

const userStore = useUserStore()
const charactersStore = useCharactersStore()

const { showCharacterWizard, currentView } = storeToRefs(userStore)
const { myCharacters, activeCharacter, activeCharacterId } = storeToRefs(charactersStore)

// Режим отображения: 'cards' или 'detailed'
// Автоматически переключаем на detailed если есть активный персонаж
const viewMode = ref(activeCharacter.value ? 'detailed' : 'cards')

// Когда меняется активный персонаж - переключаемся на detailed
watch(activeCharacterId, (newId) => {
  if (newId) {
    viewMode.value = 'detailed'
  }
})

const hasCharacter = computed(() => Boolean(activeCharacter.value))
const hasCharacters = computed(() => myCharacters.value.length > 0)

const openWizard = () => {
  userStore.openCharacterWizard()
  // Также переключаемся на вкладку персонажа, если еще не там
  if (currentView.value !== 'character-sheet') {
    userStore.setCurrentView('character-sheet')
  }
}

const closeWizard = () => {
  userStore.closeCharacterWizard()
}

const handleCharacterCreated = () => {
  userStore.closeCharacterWizard()
  // После создания остаёмся на карточках, чтобы выбрать нового персонажа
  viewMode.value = 'cards'
}

const handleSelectCharacter = (characterId) => {
  charactersStore.setActiveCharacter(characterId)
  viewMode.value = 'detailed'
}

const handleBackToCards = () => {
  viewMode.value = 'cards'
}

const handleCloseDetailed = () => {
  // При закрытии детального листа (например, после удаления)
  // Возвращаемся к карточкам
  viewMode.value = 'cards'
}
</script>

<template>
  <div class="h-full bg-slate-950 text-slate-50 overflow-y-auto">
    <!-- Карточки персонажей -->
    <CharacterCards
      v-if="viewMode === 'cards'"
      :characters="myCharacters"
      :active-character-id="activeCharacterId"
      @select-character="handleSelectCharacter"
      @create-character="openWizard"
    />

    <!-- Детальный лист персонажа -->
    <div v-else-if="viewMode === 'detailed' && hasCharacter" class="h-full flex flex-col">
      <!-- Кнопка назад -->
      <div class="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800 px-6 py-3">
        <button
          @click="handleBackToCards"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-300 hover:text-slate-100 hover:bg-slate-800/50 transition"
        >
          <span class="text-xl">←</span>
          <span class="font-medium">Назад к списку</span>
        </button>
      </div>
      
      <CharacterSheetDetailed 
        :character="activeCharacter"
        @close="handleCloseDetailed"
      />
    </div>

    <!-- Character Wizard -->
    <CharacterWizard 
      v-if="showCharacterWizard" 
      @close="closeWizard" 
      @created="handleCharacterCreated"
    />
  </div>
</template>
