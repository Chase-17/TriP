<script setup>
import { useUserStore } from '@/stores/user'
import { generateAvatar } from '@/utils/avatar'
import { calculateMaxHP } from '@/utils/wounds'
import CharacterCreationCanvas from './CharacterCreationCanvas.vue'

const emit = defineEmits(['close', 'created'])
const userStore = useUserStore()

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
  
  const character = userStore.addCharacter({
    name: formData.name || 'Безымянный',
    portrait: formData.portrait,
    gender: formData.gender,
    race: formData.race,
    subrace: formData.subrace,
    classId: formData.class,
    avatar: avatar,
    level: 1,
    healthType: 'hp', // или 'wounds'
    hp: { current: maxHP, max: maxHP },
    wounds: {
      scratch: { current: 0 },
      light: { current: 0 },
      heavy: { current: 0 },
      deadly: { current: 0 }
    },
    defence: {
      base: 0 // базовая защита, будет добавляться хитрость и броня
    },
    statusEffects: [],
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
    notes: formData.notes || ''
  })
  
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
