<script setup>
import { useUserStore } from '@/stores/user'
import { useCharactersStore } from '@/stores/characters'
import { generateAvatar } from '@/utils/avatar'
import { calculateMaxHP } from '@/utils/wounds'
import CharacterCreationCanvas from './CharacterCreationCanvas.vue'

const emit = defineEmits(['close', 'created'])
const userStore = useUserStore()
const charactersStore = useCharactersStore()

const createCharacter = (formData) => {
  // Используем выбранный портрет или генерируем аватар
  const avatar = formData.portrait 
    ? `/images/presets/${formData.portrait}.png`
    : generateAvatar(formData.name || 'Unknown')
  
  // Подготавливаем экипировку и инвентарь
  const equipment = formData.equipment || {}
  const weapons = equipment.weapons || []
  
  // Создаём начальные наборы оружия
  const weaponSets = [
    { name: 'Набор 1', weapons: weapons.slice(0, 2) },
    { name: 'Набор 2', weapons: [] }
  ]
  
  // Остальное оружие идёт в инвентарь
  const inventoryWeapons = weapons.slice(2).map(weaponId => ({
    id: weaponId,
    category: 'weapon',
    equipped: false
  }))
  
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
        weapons: weapons,
        items: [],
        wealth: equipment.wealth || 5
      },
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
  <CharacterCreationCanvas @close="handleClose" @created="createCharacter" />
</template>
