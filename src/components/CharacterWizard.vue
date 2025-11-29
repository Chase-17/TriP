<script setup>
import { useUserStore } from '@/stores/user'
import { generateAvatar } from '@/utils/avatar'
import CharacterCreationCanvas from './CharacterCreationCanvas.vue'

const emit = defineEmits(['close', 'created'])
const userStore = useUserStore()

const createCharacter = (formData) => {
  if (!formData.avatar) {
    formData.avatar = generateAvatar(formData.name || 'Unknown')
  }
  
  const character = userStore.addCharacter({
    name: formData.name || 'Безымянный',
    class: formData.class,
    avatar: formData.avatar,
    level: 1,
    hp: { current: 10, max: 10 },
    stats: formData.stats,
    skills: formData.skills,
    notes: formData.notes || ''
  })
  
  emit('created', character)
  emit('close')
}
</script>

<template>
  <CharacterCreationCanvas @close="emit('close')" @created="createCharacter" />
</template>
