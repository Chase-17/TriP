<script setup>
import { useUserStore } from '@/stores/user'
import { useCharactersStore } from '@/stores/characters'
import { useSessionStore } from '@/stores/session'
import { generateAvatar } from '@/utils/avatar'
import { calculateMaxHP } from '@/utils/character/wounds'
import { presetUrl } from '@/utils/assets'
import CharacterCreationCanvas from './CharacterCreationCanvas.vue'

const props = defineProps({
  // Ограничения для создания персонажа (из приглашения мастера)
  constraints: { type: Object, default: null },
  // ID приглашения (для отслеживания использования)
  inviteId: { type: String, default: null }
})

const emit = defineEmits(['close', 'created'])
const userStore = useUserStore()
const charactersStore = useCharactersStore()
const sessionStore = useSessionStore()

const createCharacter = (formData) => {
  // Используем выбранный портрет или генерируем аватар
  const avatar = formData.portrait 
    ? presetUrl(formData.portrait)
    : generateAvatar(formData.name || 'Unknown')
  
  // Подготавливаем экипировку
  const equipment = formData.equipment || {}
  const weaponIds = equipment.weapons || []
  
  // Создаём наборы оружия с полными данными предметов (клоны, не ссылки)
  // Первые 2 оружия идут в первый набор, остальные — в инвентарь
  const weaponSets = [
    { name: 'Набор 1', weapons: weaponIds.slice(0, 2) },
    { name: 'Набор 2', weapons: [] }
  ]
  
  // Остальное оружие идёт в инвентарь
  const inventoryWeapons = weaponIds.slice(2)
  
  // Рассчитываем максимальное HP на основе характеристик
  const maxHP = calculateMaxHP(formData.stats || {})
  
  // Создаём персонажа через charactersStore
  const character = charactersStore.createFromWizard(
    userStore.userId,
    userStore.nickname,
    {
      name: formData.name || 'Безымянный',
      portrait: formData.portrait,
      gender: formData.gender,
      race: formData.race,
      subrace: formData.subrace,
      class: formData.class,
      avatar: avatar,
      stats: formData.stats,
      skills: formData.skills,
      equipment: {
        armor: equipment.armor || 'clothes',
        weaponSets: weaponSets,
        activeSetIndex: 0,
        wealth: equipment.wealth || 5,
        epoch: equipment.epoch || 10
      },
      inventory: inventoryWeapons,
      combat: {
        hp: maxHP,
        maxHp: maxHP,
        mp: 0,
        maxMp: 0
      }
    }
  )
  
  // Отправляем персонажа мастеру
  setTimeout(() => {
    sessionStore.sendCharactersToMaster()
  }, 100)
  
  emit('created', character)
  emit('close')
}

const handleClose = () => {
  // При закрытии также сбрасываем состояние в store
  userStore.closeCharacterWizard()
  emit('close')
}
</script>

<template>
  <CharacterCreationCanvas 
    :constraints="constraints"
    @close="handleClose" 
    @created="createCharacter" 
  />
</template>
