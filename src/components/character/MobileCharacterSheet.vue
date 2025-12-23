<script setup>
/**
 * MobileCharacterSheet - мобильная версия листа персонажа
 * Адаптивный интерфейс с вкладками для разных секций
 */
import { ref, computed, watch, Teleport } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useCharactersStore } from '@/stores/characters'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import { useBattleMapStore } from '@/stores/battleMap'
import aspectsData from '@/data/aspects.json'
import classesData from '@/data/classes.json'
import diffsData from '@/data/diffs.json'
import itemsData from '@/data/items.json'
import skillsData from '@/data/skills.json'
import CharacterEquipment from '../equipment/CharacterEquipment.vue'
import { getCheckBonus as getCheckBonusFromUtil } from '@/utils/character/checks'
import { migrateCharacterSkills, getSkillDisplayData } from '@/utils/character/skills'

const props = defineProps({
  // Персонаж для отображения (если не передан - берётся из стора)
  character: {
    type: Object,
    default: null
  },
  // Встроенный режим (без своих tabs - управляется извне)
  embedded: {
    type: Boolean,
    default: false
  },
  // Активная вкладка (для embedded режима)
  activeTab: {
    type: String,
    default: 'main'
  }
})

const emit = defineEmits(['close', 'switch-tab', 'update:activeTab', 'create-character', 'go-to-characters'])

const charactersStore = useCharactersStore()
const sessionStore = useSessionStore()
const userStore = useUserStore()
const battleMapStore = useBattleMapStore()
const { myCharacters, activeCharacter, activeCharacterId } = storeToRefs(charactersStore)
const { isMaster } = storeToRefs(sessionStore)
const { userId } = storeToRefs(userStore)

// Текущий персонаж:
// - Для мастера: из пропса или activeCharacter (любой)
// - Для игрока: только из своих персонажей (myCharacters)
const currentCharacter = computed(() => {
  if (props.character) return props.character
  
  // Мастер может смотреть любого персонажа
  if (isMaster.value) return activeCharacter.value
  
  // Игрок видит только своих персонажей
  const myChars = myCharacters.value
  if (!myChars.length) return null
  
  // Если activeCharacter принадлежит игроку - показываем его
  if (activeCharacter.value && activeCharacter.value.ownerId === userId.value) {
    return activeCharacter.value
  }
  
  // Иначе - первого из своих
  return myChars[0]
})

// Проверка владельца и права на удаление
const isOwner = computed(() => currentCharacter.value?.ownerId === userId.value)
const canDelete = computed(() => isOwner.value || isMaster.value)

// Вкладки внутри листа персонажа
const sheetTabs = [
  { id: 'main', label: 'Личность', icon: 'mdi:account-heart' },
  { id: 'items', label: 'Инвентарь', icon: 'mdi:backpack' },
  { id: 'social', label: 'Социум', icon: 'mdi:account-group' },
  { id: 'magic', label: 'Магия', icon: 'mdi:auto-fix' }
]

// Используем внешнюю вкладку в embedded режиме
const internalActiveTab = ref('main')
const activeSheetTab = computed({
  get: () => props.embedded ? props.activeTab : internalActiveTab.value,
  set: (val) => {
    if (props.embedded) {
      emit('update:activeTab', val)
    } else {
      internalActiveTab.value = val
    }
  }
})

// Ссылка на контейнер скролла для сброса при смене вкладки
const sheetContentRef = ref(null)

// Сбрасываем скролл при смене вкладки
watch(activeSheetTab, () => {
  if (sheetContentRef.value) {
    sheetContentRef.value.scrollTop = 0
  }
})

// Переключение между персонажами (если их больше одного)
const selectCharacter = (charId) => {
  charactersStore.setActiveCharacter(charId)
}

// Аспекты из общей базы данных (фиксированный порядок)
const aspects = computed(() => {
  // Используем порядок из metadata
  const order = aspectsData.metadata?.circularOrder || aspectsData.aspects.map(a => a.id)
  return order.map(id => aspectsData.aspects.find(a => a.id === id)).filter(Boolean)
})

// Режимы небоевых действий
const actionModes = computed(() => {
  return aspects.value.filter(a => a.mode)
})

// Активный режим действий (с сохранением в userStore)
const activeMode = computed({
  get: () => {
    if (!currentCharacter.value?.id) return null
    return userStore.getCharacterMode(currentCharacter.value.id)
  },
  set: (val) => {
    if (!currentCharacter.value?.id) return
    userStore.setCharacterMode(currentCharacter.value.id, val)
  }
})
const showModeInfo = ref(false)
const selectedModeDetails = ref(null)

// Названия активных режимов
const activeModeNames = computed(() => {
  if (!activeMode.value) return 'не выбран'
  const mode = actionModes.value.find(m => m.id === activeMode.value)
  return mode ? mode.mode.name : 'не выбран'
})

const setActiveMode = (modeId) => {
  activeMode.value = activeMode.value === modeId ? null : modeId
}

const showModeDetails = (mode) => {
  selectedModeDetails.value = mode
}

// === НАВЫКИ И ОСОБЕННОСТИ ===
const showCustomDescriptions = ref(false) // Показ своих заметок
const showOriginalDescription = ref(true) // Показ оригинальных описаний уровней
const skillsSearchQuery = ref('') // Поиск по навыкам
const selectedSkillDetails = ref(null) // Попап с деталями навыка

// Загружаем предпочтения для текущего персонажа
const skillPrefs = computed(() => {
  if (!currentCharacter.value?.id) return { expandedSkills: [], allExpanded: true }
  return userStore.getSkillPreferences(currentCharacter.value.id)
})

// Проверка, раскрыт ли конкретный навык
const isSkillExpanded = (skillId) => {
  // Если глобально раскрыты - проверяем, не закрыт ли индивидуально
  if (skillPrefs.value.allExpanded) {
    return !skillPrefs.value.expandedSkills.includes(skillId) // expandedSkills = список ЗАКРЫТЫХ при allExpanded
  }
  // Если глобально закрыты - проверяем, открыт ли индивидуально
  return skillPrefs.value.expandedSkills.includes(skillId)
}

// Переключение раскрытия конкретного навыка
const toggleSkillExpanded = (skillId) => {
  if (!currentCharacter.value?.id) return
  const charId = currentCharacter.value.id
  const isCurrentlyExpanded = isSkillExpanded(skillId)
  
  if (skillPrefs.value.allExpanded) {
    // Если все раскрыты, expandedSkills = список закрытых
    userStore.setSkillExpanded(charId, skillId, isCurrentlyExpanded) // добавляем в "закрытые"
  } else {
    // Если все закрыты, expandedSkills = список открытых
    userStore.setSkillExpanded(charId, skillId, !isCurrentlyExpanded)
  }
}

// Переключение глобального раскрытия
const toggleAllSkillsExpanded = () => {
  if (!currentCharacter.value?.id) return
  userStore.setAllSkillsExpanded(currentCharacter.value.id, !skillPrefs.value.allExpanded)
}

// Навыки персонажа с полными данными (с автоматической миграцией)
const characterSkills = computed(() => {
  if (!currentCharacter.value?.skills) return []
  
  // Мигрируем навыки из старого формата если нужно
  const { migrated, needsSave } = migrateCharacterSkills(currentCharacter.value.skills)
  
  // Если была миграция - сохраняем обновлённые данные
  if (needsSave && currentCharacter.value.id) {
    console.log('[Skills] Миграция навыков персонажа', currentCharacter.value.name)
    charactersStore.updateCharacter(currentCharacter.value.id, { skills: migrated })
  }
  
  // Преобразуем в данные для отображения
  return migrated.map(skill => getSkillDisplayData(skill)).filter(Boolean)
})

// Фильтрованные и отсортированные навыки
const filteredSkills = computed(() => {
  const query = skillsSearchQuery.value.toLowerCase().trim()
  if (!query) return characterSkills.value
  
  // Функция для расчёта релевантности
  const getRelevance = (skill) => {
    let score = 0
    const name = skill.name.toLowerCase()
    const source = skill.sourceName.toLowerCase()
    const desc = skill.currentDescription?.toLowerCase() || ''
    const customDesc = skill.customDescription?.toLowerCase() || ''
    const customTags = (skill.customTags || []).join(' ').toLowerCase()
    
    // Точное совпадение имени - максимальный приоритет
    if (name === query) score += 100
    // Имя начинается с запроса
    else if (name.startsWith(query)) score += 50
    // Имя содержит запрос
    else if (name.includes(query)) score += 30
    
    // Источник (класс/аспект)
    if (source.includes(query)) score += 15
    
    // Пользовательские теги
    if (customTags.includes(query)) score += 20
    
    // Пользовательское описание
    if (customDesc.includes(query)) score += 10
    
    // Оригинальное описание
    if (desc.includes(query)) score += 5
    
    return score
  }
  
  // Фильтруем и сортируем по релевантности
  return characterSkills.value
    .map(skill => ({ skill, relevance: getRelevance(skill) }))
    .filter(item => item.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .map(item => item.skill)
})

const openSkillDetails = (skill) => {
  // Сохраняем только id навыка, данные будем брать из characterSkills
  selectedSkillDetails.value = skill.id
}

const closeSkillDetails = () => {
  selectedSkillDetails.value = null
}

// Получаем актуальные данные выбранного навыка
const selectedSkillData = computed(() => {
  if (!selectedSkillDetails.value) return null
  return characterSkills.value.find(s => s.id === selectedSkillDetails.value) || null
})

// Сохранение кастомного описания для конкретного уровня навыка
const saveCustomDescription = (skillId, level, description) => {
  if (!currentCharacter.value) return
  const skills = [...(currentCharacter.value.skills || [])]
  const idx = skills.findIndex(s => s.id === skillId)
  if (idx >= 0) {
    const skill = { ...skills[idx] }
    skill.customDescriptions = { ...skill.customDescriptions, [level]: description }
    skills[idx] = skill
    charactersStore.updateCharacter(currentCharacter.value.id, { skills })
  }
}

// Сохранение кастомных тегов для конкретного уровня навыка
const saveCustomTags = (skillId, level, tags) => {
  if (!currentCharacter.value) return
  const skills = [...(currentCharacter.value.skills || [])]
  const idx = skills.findIndex(s => s.id === skillId)
  if (idx >= 0) {
    const skill = { ...skills[idx] }
    skill.customTags = { ...skill.customTags, [level]: tags }
    skills[idx] = skill
    charactersStore.updateCharacter(currentCharacter.value.id, { skills })
  }
}

// Палитра цветов для меток навыков
const skillColorOptions = [
  { name: 'Красный', value: '#ef4444' },
  { name: 'Оранжевый', value: '#f97316' },
  { name: 'Жёлтый', value: '#eab308' },
  { name: 'Зелёный', value: '#22c55e' },
  { name: 'Бирюзовый', value: '#14b8a6' },
  { name: 'Голубой', value: '#06b6d4' },
  { name: 'Синий', value: '#3b82f6' },
  { name: 'Фиолетовый', value: '#8b5cf6' },
  { name: 'Розовый', value: '#ec4899' },
  { name: 'Серый', value: '#64748b' }
]

// Сохранение цвета метки навыка
const saveSkillColor = (skillId, color) => {
  if (!currentCharacter.value) return
  const skills = [...(currentCharacter.value.skills || [])]
  const idx = skills.findIndex(s => s.id === skillId)
  if (idx >= 0) {
    const skill = { ...skills[idx] }
    if (color) {
      skill.customColor = color
    } else {
      delete skill.customColor
    }
    skills[idx] = skill
    charactersStore.updateCharacter(currentCharacter.value.id, { skills })
  }
}

// Сложности из общей базы данных
const difficulties = computed(() => {
  const diffsObj = diffsData.default || diffsData
  return Object.entries(diffsObj)
    .map(([val, data]) => ({ value: parseInt(val), ...data }))
    .sort((a, b) => a.value - b.value)
})

// Получаем бонус проверки для аспекта
const getCheckBonus = (aspectId) => {
  return getCheckBonusFromUtil(currentCharacter.value, aspectId)
}

// Получаем результат для ячейки таблицы
const getCellResult = (aspectId, difficulty) => {
  const bonus = getCheckBonus(aspectId)
  const needed = difficulty - bonus
  
  if (needed <= 2) return { type: 'auto', value: '✓' }
  if (needed <= 12) return { type: 'roll', value: needed }
  return { type: 'fail', value: '✗' }
}

// Находим сложность по значению
const findDifficulty = (value) => {
  const diffs = Object.entries(diffsData.default || diffsData)
    .map(([val, data]) => ({ value: parseInt(val), ...data }))
    .filter(d => d.value >= 0)
    .sort((a, b) => a.value - b.value)
  
  let closest = diffs[0]
  for (const diff of diffs) {
    if (diff.value <= value) {
      closest = diff
    } else {
      break
    }
  }
  return closest
}

// Свайп для переключения вкладок
// Обновление персонажа с синхронизацией в обе стороны
const updateCharacter = (updatedChar) => {
  charactersStore.updateCharacter(updatedChar.id, updatedChar)
  
  // Синхронизация изменений
  if (isMaster.value) {
    // Мастер рассылает изменения:
    // 1. Персональное обновление владельцу персонажа
    if (updatedChar.ownerId && updatedChar.ownerId !== 'master') {
      sessionStore.sendCharacterToPlayer(updatedChar.id, updatedChar.ownerId)
    }
    // 2. Общая рассылка всем (для отображения на карте и т.д.)
    sessionStore.broadcastAllCharacters()
  } else {
    // Игрок отправляет изменения мастеру
    sessionStore.sendCharacterUpdate(updatedChar.id)
  }
}

// ============ Редактирование характеристик (мастер) ============
const showStatsEditor = ref(false)
const editingStats = ref({})

// 6 основных аспектов для характеристик
const statAspects = computed(() => {
  return aspectsData.aspects.filter(a => 
    ['war', 'knowledge', 'community', 'shadow', 'mysticism', 'nature'].includes(a.id)
  )
})

const openStatsEditor = () => {
  if (!currentCharacter.value) return
  editingStats.value = { ...(currentCharacter.value.stats || {
    war: 0, knowledge: 0, community: 0, shadow: 0, mysticism: 0, nature: 0
  })}
  showStatsEditor.value = true
}

const saveStats = () => {
  if (!currentCharacter.value) return
  charactersStore.updateCharacter(currentCharacter.value.id, { 
    stats: { ...editingStats.value } 
  })
  // Синхронизируем с игроками (если мастер)
  if (isMaster.value) {
    sessionStore.broadcastAllCharacters()
  }
  showStatsEditor.value = false
}

// ============ Редактирование навыков (мастер) ============
const showMasterSkillsEditor = ref(false)
const editingMasterSkills = ref([])
const newSkillId = ref('')
const newSkillLevel = ref(1)
const customSkillName = ref('')
const customSkillDescription = ref('')
const showCustomSkillForm = ref(false)

// Все доступные навыки из классов и аспектов (traits)
const allAvailableSkills = computed(() => {
  const skills = []
  
  // Навыки из классов
  classesData.classes.forEach(cls => {
    if (cls.traits) {
      cls.traits.forEach(trait => {
        skills.push({
          id: `class_${cls.id}_${trait.id}`,
          name: trait.name,
          sourceType: 'class',
          sourceId: cls.id,
          sourceName: typeof cls.name === 'object' ? cls.name.m : cls.name,
          maxLevel: trait.levels?.length || 1,
          levels: trait.levels || []
        })
      })
    }
  })
  
  // Навыки из аспектов
  aspectsData.aspects.forEach(aspect => {
    if (aspect.traits) {
      aspect.traits.forEach(trait => {
        // Пропускаем временные навыки
        if (trait.id?.toLowerCase().includes('temp')) return
        
        skills.push({
          id: `aspect_${aspect.id}_${trait.id}`,
          name: trait.name,
          sourceType: 'aspect',
          sourceId: aspect.id,
          sourceName: aspect.name,
          aspectColor: aspect.color,
          maxLevel: trait.levels?.length || 1,
          levels: trait.levels || []
        })
      })
    }
  })
  
  return skills
})

const openMasterSkillsEditor = () => {
  if (!currentCharacter.value) return
  editingMasterSkills.value = [...(currentCharacter.value.skills || [])]
  showMasterSkillsEditor.value = true
}

const addMasterSkill = () => {
  if (!newSkillId.value) return
  if (editingMasterSkills.value.some(s => s.id === newSkillId.value)) {
    alert('Этот навык уже добавлен')
    return
  }
  editingMasterSkills.value.push({
    id: newSkillId.value,
    level: newSkillLevel.value
  })
  newSkillId.value = ''
  newSkillLevel.value = 1
}

const removeMasterSkill = (skillId) => {
  editingMasterSkills.value = editingMasterSkills.value.filter(s => s.id !== skillId)
}

const updateMasterSkillLevel = (skillId, level) => {
  const skill = editingMasterSkills.value.find(s => s.id === skillId)
  if (skill) {
    skill.level = parseInt(level) || 1
  }
}

const getMasterSkillData = (skillId) => {
  // Сначала ищем в стандартных навыках
  const standardSkill = allAvailableSkills.value.find(s => s.id === skillId)
  if (standardSkill) return standardSkill
  
  // Если это кастомный навык (начинается с custom_)
  if (skillId.startsWith('custom_')) {
    const charSkill = editingMasterSkills.value.find(s => s.id === skillId)
    if (charSkill) {
      return {
        id: skillId,
        name: charSkill.customName || 'Кастомный навык',
        sourceType: 'custom',
        sourceName: 'Особый',
        maxLevel: 3,
        levels: [],
        description: charSkill.customDescription || ''
      }
    }
  }
  
  return null
}

// Добавление кастомного навыка
const addCustomSkill = () => {
  if (!customSkillName.value.trim()) {
    alert('Введите название навыка')
    return
  }
  
  const customId = `custom_${Date.now()}`
  editingMasterSkills.value.push({
    id: customId,
    level: 1,
    customName: customSkillName.value.trim(),
    customDescription: customSkillDescription.value.trim()
  })
  
  customSkillName.value = ''
  customSkillDescription.value = ''
  showCustomSkillForm.value = false
}

const saveMasterSkills = () => {
  if (!currentCharacter.value) return
  charactersStore.updateCharacter(currentCharacter.value.id, { 
    skills: [...editingMasterSkills.value] 
  })
  // Синхронизируем с игроками
  if (isMaster.value) {
    sessionStore.broadcastAllCharacters()
  }
  showMasterSkillsEditor.value = false
}

// ============ Редактирование основных данных (мастер) ============
const showBasicEditor = ref(false)
const editingBasicData = ref({
  name: '',
  portrait: '',
  npcType: 'neutral',
  factions: [],
  visibleToPlayers: true
})

const npcTypes = [
  { id: 'ally', label: 'Союзник', color: '#22c55e' },
  { id: 'neutral', label: 'Нейтрал', color: '#94a3b8' },
  { id: 'enemy', label: 'Враг', color: '#ef4444' }
]

const openBasicEditor = () => {
  if (!currentCharacter.value) return
  editingBasicData.value = {
    name: currentCharacter.value.name || '',
    portrait: currentCharacter.value.portrait || '',
    npcType: currentCharacter.value.npcType || 'neutral',
    factions: currentCharacter.value.factions || [],
    visibleToPlayers: currentCharacter.value.visibleToPlayers !== false
  }
  showBasicEditor.value = true
}

const saveBasicData = () => {
  if (!currentCharacter.value) return
  charactersStore.updateCharacter(currentCharacter.value.id, {
    name: editingBasicData.value.name,
    portrait: editingBasicData.value.portrait,
    npcType: editingBasicData.value.npcType,
    factions: editingBasicData.value.factions,
    visibleToPlayers: editingBasicData.value.visibleToPlayers
  })
  // Синхронизируем с игроками
  if (isMaster.value) {
    sessionStore.broadcastAllCharacters()
  }
  showBasicEditor.value = false
}

// Управление фракциями
const newFaction = ref('')
const addFaction = () => {
  if (!newFaction.value.trim()) return
  if (!editingBasicData.value.factions.includes(newFaction.value.trim())) {
    editingBasicData.value.factions.push(newFaction.value.trim())
  }
  newFaction.value = ''
}
const removeFaction = (faction) => {
  editingBasicData.value.factions = editingBasicData.value.factions.filter(f => f !== faction)
}

// ============ Редактирование здоровья (мастер) ============
const showHealthEditor = ref(false)
const editingHealthData = ref({
  healthType: 'simple',
  maxHp: 8,
  // Для системы ранений (wounds)
  maxScratch: 3,
  maxLight: 2,
  maxHeavy: 1,
  maxDeadly: 1,
  bonusDeadlySlots: 0
})

const openHealthEditor = () => {
  if (!currentCharacter.value) return
  const combat = currentCharacter.value.combat || {}
  const wounds = combat.wounds || {}
  editingHealthData.value = {
    healthType: combat.healthType || 'simple',
    maxHp: combat.maxHp || 8,
    // Для системы ранений - читаем текущие максимумы или дефолты
    maxScratch: wounds.maxScratch ?? 3,
    maxLight: wounds.maxLight ?? 2,
    maxHeavy: wounds.maxHeavy ?? 1,
    maxDeadly: wounds.maxDeadly ?? 1,
    bonusDeadlySlots: combat.bonusDeadlySlots || 0
  }
  showHealthEditor.value = true
}

const saveHealthData = () => {
  if (!currentCharacter.value) return
  const currentCombat = currentCharacter.value.combat || {}
  const currentWounds = currentCombat.wounds || {}
  
  const updates = {
    combat: {
      ...currentCombat,
      healthType: editingHealthData.value.healthType,
      maxHp: editingHealthData.value.maxHp,
      bonusDeadlySlots: editingHealthData.value.bonusDeadlySlots
    }
  }
  
  // Если используется система ранений - сохраняем максимумы
  if (editingHealthData.value.healthType === 'wounds') {
    updates.combat.wounds = {
      ...currentWounds,
      maxScratch: editingHealthData.value.maxScratch,
      maxLight: editingHealthData.value.maxLight,
      maxHeavy: editingHealthData.value.maxHeavy,
      maxDeadly: editingHealthData.value.maxDeadly
    }
  }
  
  charactersStore.updateCharacter(currentCharacter.value.id, updates)
  // Синхронизируем с игроками
  if (isMaster.value) {
    sessionStore.broadcastAllCharacters()
  }
  showHealthEditor.value = false
}

// Удаление персонажа (перенесено из отдельной кнопки)
const confirmDeleteCharacter = () => {
  if (!currentCharacter.value) return
  
  const isNpc = currentCharacter.value.isNpc
  const confirmText = isNpc
    ? `Удалить NPC "${currentCharacter.value.name}"?`
    : isOwner.value
      ? `Удалить персонажа "${currentCharacter.value.name}"?`
      : `Удалить персонажа "${currentCharacter.value.name}" игрока ${currentCharacter.value.ownerNickname}?`
    
  if (confirm(confirmText)) {
    const charId = currentCharacter.value.id
    
    // Удаляем токен персонажа со всех карт
    const activeMap = battleMapStore.activeMap
    if (activeMap) {
      battleMapStore.removeTokenByCharacterId(activeMap.id, charId)
    }
    
    if (isNpc) {
      charactersStore.deleteNpc(charId)
      // Синхронизируем удаление NPC с игроками
      sessionStore.sendCharacterDelete(charId)
    } else {
      charactersStore.deleteCharacter(charId)
      sessionStore.sendCharacterDelete(charId)
    }
    
    if (isMaster.value) {
      emit('go-to-characters')
    } else {
      emit('close')
    }
  }
}

// Экипировка предмета из инвентаря
const handleEquipItem = (item) => {
  if (!currentCharacter.value) return
  
  if (item.category === 'armor') {
    const updatedCharacter = {
      ...currentCharacter.value,
      equipment: {
        ...currentCharacter.value.equipment,
        armor: item.id
      }
    }
    updateCharacter(updatedCharacter)
  } else if (item.category === 'weapon' || item.category === 'shield') {
    const sets = [...(currentCharacter.value.equipment?.weaponSets || [])]
    const firstSet = { ...sets[0] }
    
    const weapons = firstSet.weapons.map(weaponId => {
      return itemsData.items.find(i => i.id === weaponId)
    }).filter(Boolean)
    
    weapons.push(item)
    const totalHands = weapons.reduce((sum, w) => sum + (w.hands || 0), 0)
    const longWeaponsCount = weapons.filter(w => w.length === 2).length
    
    if (totalHands <= 2 && longWeaponsCount <= 1) {
      firstSet.weapons = [...firstSet.weapons, item.id]
      sets[0] = firstSet
      
      const updatedCharacter = {
        ...currentCharacter.value,
        equipment: {
          ...currentCharacter.value.equipment,
          weaponSets: sets
        }
      }
      updateCharacter(updatedCharacter)
    }
  }
}
</script>

<template>
  <div class="mobile-character-sheet" :class="{ embedded }">
    <!-- Заголовок с вкладками персонажей (если > 1, только не в embedded режиме) -->
    <div v-if="!embedded && myCharacters.length > 1" class="character-tabs">
      <button
        v-for="char in myCharacters"
        :key="char.id"
        class="char-tab"
        :class="{ active: activeCharacterId === char.id }"
        @click="selectCharacter(char.id)"
      >
        <img 
          v-if="char.portrait" 
          :src="char.portrait" 
          :alt="char.name"
          class="char-tab-avatar"
        />
        <span v-else class="char-tab-avatar-fallback">
          {{ char.name?.charAt(0)?.toUpperCase() || '?' }}
        </span>
        <span class="char-tab-name">{{ char.name }}</span>
      </button>
    </div>
    
    <!-- Горизонтальные вкладки секций листа (только не в embedded режиме) -->
    <div v-if="!embedded" class="sheet-tabs-row">
      <button
        v-for="tab in sheetTabs"
        :key="tab.id"
        class="sheet-tab-btn"
        :class="{ active: activeSheetTab === tab.id }"
        @click="activeSheetTab = tab.id"
      >
        <Icon :icon="tab.icon" class="tab-icon" />
        <span class="tab-label">{{ tab.label }}</span>
      </button>
    </div>
    
    <!-- Контент листа персонажа -->
    <div 
      v-if="currentCharacter"
      ref="sheetContentRef"
      class="sheet-content"
    >
      <!-- ===== Мастерские инструменты (ВВЕРХУ) ===== -->
      <div v-if="isMaster" class="master-edit-section">
        <div class="master-section-title">⚙️ Мастерские инструменты</div>
        
        <!-- Основные данные: имя, портрет, тип NPC -->
        <div class="master-basic-section">
          <div class="master-section-header">
            <span>Основные данные</span>
            <button class="master-edit-btn" @click="openBasicEditor">
              <Icon icon="mdi:pencil" />
              Редактировать
            </button>
          </div>
          <div class="master-basic-info">
            <div class="basic-info-row">
              <span class="info-label">Имя:</span>
              <span class="info-value">{{ currentCharacter.name }}</span>
            </div>
            <div v-if="currentCharacter.isNpc" class="basic-info-row">
              <span class="info-label">Тип:</span>
              <span 
                class="info-value npc-type-badge"
                :style="{ color: npcTypes.find(t => t.id === currentCharacter.npcType)?.color || '#94a3b8' }"
              >
                {{ npcTypes.find(t => t.id === currentCharacter.npcType)?.label || 'Нейтрал' }}
              </span>
            </div>
            <div v-if="currentCharacter.isNpc && currentCharacter.factions?.length" class="basic-info-row">
              <span class="info-label">Фракции:</span>
              <span class="info-value">{{ currentCharacter.factions.join(', ') }}</span>
            </div>
          </div>
        </div>
        
        <!-- Здоровье -->
        <div class="master-health-section">
          <div class="master-section-header">
            <span>Здоровье</span>
            <button class="master-edit-btn" @click="openHealthEditor">
              <Icon icon="mdi:pencil" />
              Редактировать
            </button>
          </div>
          <div class="master-health-info">
            <span class="health-type-badge" :class="currentCharacter.combat?.healthType || 'simple'">
              {{ currentCharacter.combat?.healthType === 'wounds' ? 'Ранения' : 'Простое HP' }}
            </span>
            <span v-if="currentCharacter.combat?.healthType !== 'wounds'" class="health-max">
              Макс: {{ currentCharacter.combat?.maxHp || 8 }}
            </span>
            <span v-else class="health-max">
              Смерт. слоты: {{ 1 + (currentCharacter.combat?.bonusDeadlySlots || 0) }}
            </span>
          </div>
        </div>
        
        <!-- Характеристики -->
        <div class="master-stats-section">
          <div class="master-section-header">
            <span>Характеристики</span>
            <button class="master-edit-btn" @click="openStatsEditor">
              <Icon icon="mdi:pencil" />
              Редактировать
            </button>
          </div>
          <div class="master-stats-grid">
            <div 
              v-for="aspect in statAspects" 
              :key="aspect.id"
              class="master-stat-item"
              :style="{ '--stat-color': aspect.color }"
            >
              <Icon :icon="aspect.characteristicIcon || aspect.icon" class="stat-icon" />
              <span class="stat-name">{{ aspect.characteristic?.name || aspect.name }}</span>
              <span class="stat-value">{{ currentCharacter?.stats?.[aspect.id] || 0 }}</span>
            </div>
          </div>
        </div>
        
        <!-- Навыки -->
        <div class="master-skills-section">
          <div class="master-section-header">
            <span>Управление навыками</span>
            <button class="master-edit-btn" @click="openMasterSkillsEditor">
              <Icon icon="mdi:pencil" />
              Редактировать
            </button>
          </div>
          <div class="master-skills-info">
            {{ currentCharacter?.skills?.length || 0 }} навыков назначено
          </div>
        </div>
        
        <!-- Удаление персонажа -->
        <div class="master-danger-section">
          <button class="master-delete-btn" @click="confirmDeleteCharacter">
            <Icon icon="mdi:delete" />
            {{ currentCharacter.isNpc ? 'Удалить NPC' : 'Удалить персонажа' }}
          </button>
        </div>
      </div>
      
      <!-- Вкладка "Основное" -->
      <div v-show="activeSheetTab === 'main'" class="tab-content tab-content-bottom">
        <!-- Блок навыков и особенностей -->
        <div class="skills-section">
          <div class="skills-header">
            <span class="skills-title">НАВЫКИ И ОСОБЕННОСТИ</span>
            <div class="skills-controls">
              <button 
                class="skills-toggle-desc" 
                :class="{ active: !showOriginalDescription }"
                @click="showOriginalDescription = !showOriginalDescription"
                title="Скрыть/показать оригинальные описания"
              >
                <Icon icon="mdi:text-box-remove" />
              </button>
              <button 
                class="skills-toggle-desc" 
                :class="{ active: showCustomDescriptions }"
                @click="showCustomDescriptions = !showCustomDescriptions"
                title="Показать свои заметки"
              >
                <Icon icon="mdi:note-edit" />
              </button>
              <button 
                class="skills-toggle-expand" 
                @click="toggleAllSkillsExpanded"
                :title="skillPrefs.allExpanded ? 'Свернуть все' : 'Развернуть все'"
              >
                <Icon :icon="skillPrefs.allExpanded ? 'mdi:unfold-less-horizontal' : 'mdi:unfold-more-horizontal'" />
              </button>
            </div>
          </div>
          
          <div v-if="characterSkills.length > 0" class="skills-list">
            <div 
              v-for="skill in filteredSkills" 
              :key="skill.id"
              class="skill-item"
              :class="{ expanded: isSkillExpanded(skill.id) }"
              :style="{ '--skill-color': skill.customColor || skill.aspectColor }"
            >
              <!-- Основная строка навыка -->
              <div class="skill-main" @click="toggleSkillExpanded(skill.id)">
                <div class="skill-info">
                  <span class="skill-name">{{ skill.name }}</span>
                  <span class="skill-level">{{ skill.level }}/{{ skill.maxLevel }}</span>
                </div>
                
                <!-- Источник: название класса справа -->
                <div class="skill-source">
                  <span class="skill-source-name">{{ skill.sourceName }}</span>
                  <Icon 
                    :icon="isSkillExpanded(skill.id) ? 'mdi:chevron-up' : 'mdi:chevron-down'" 
                    class="skill-expand-icon"
                  />
                </div>
              </div>
              
              <!-- Описание (раскрываемое) с фоновой картинкой -->
              <div v-if="isSkillExpanded(skill.id)" class="skill-description">
                <!-- Фоновая картинка класса -->
                <div 
                  v-if="skill.sourceType === 'class' && skill.sourceImage" 
                  class="skill-bg-image"
                  :style="{ backgroundImage: `url(${skill.sourceImage})` }"
                ></div>
                
                <!-- Все открытые уровни -->
                <div class="skill-levels-list">
                  <!-- Оригинальные описания (можно скрыть) -->
                  <template v-if="showOriginalDescription">
                    <div 
                      v-for="lvl in skill.unlockedLevels" 
                      :key="lvl.level" 
                      class="skill-level-item"
                    >
                      <span class="skill-level-badge">{{ lvl.level }}</span>
                      <p>{{ lvl.description }}</p>
                    </div>
                  </template>
                  <!-- Общая заметка к навыку (когда включён режим заметок) -->
                  <div v-if="showCustomDescriptions && skill.customDescription" class="skill-custom-note">
                    <span class="skill-note-badge">📝</span>
                    <p>{{ skill.customDescription }}</p>
                  </div>
                  <!-- Если скрыты описания и нет заметки - подсказка -->
                  <div v-if="!showOriginalDescription && !(showCustomDescriptions && skill.customDescription)" class="skill-hidden-hint">
                    <Icon icon="mdi:eye-off" />
                    <span>Описания скрыты</span>
                  </div>
                </div>
                
                <button class="skill-details-btn" @click.stop="openSkillDetails(skill)">
                  <Icon icon="mdi:dots-horizontal" />
                </button>
              </div>
            </div>
          </div>
          
          <!-- Заглушка когда навыков нет -->
          <div v-else class="skills-empty">
            <Icon icon="mdi:book-open-variant" class="skills-empty-icon" />
            <span>Навыки появятся по мере развития персонажа</span>
          </div>
          
          <!-- Поиск навыков -->
          <div v-if="characterSkills.length > 0" class="skills-filter">
            <Icon icon="mdi:magnify" class="skills-filter-icon" />
            <input 
              type="text" 
              v-model="skillsSearchQuery"
              placeholder="Поиск навыков..." 
              class="skills-filter-input" 
            />
            <button 
              v-if="skillsSearchQuery" 
              class="skills-filter-clear"
              @click="skillsSearchQuery = ''"
            >
              <Icon icon="mdi:close" />
            </button>
          </div>
        </div>

        <!-- Попап с деталями навыка -->
        <Teleport to="body">
        <div v-if="selectedSkillData" class="skill-details-overlay" @click="closeSkillDetails">
          <div class="skill-details-card" @click.stop>
            <div class="skill-details-header" :style="{ borderColor: selectedSkillData.customColor || selectedSkillData.aspectColor }">
              <Icon :icon="selectedSkillData.sourceIcon" class="skill-details-source-icon" />
              <div class="skill-details-title">
                <span class="skill-details-name">{{ selectedSkillData.name }}</span>
                <span class="skill-details-level">Уровень {{ selectedSkillData.level }} / {{ selectedSkillData.maxLevel }}</span>
              </div>
              <button class="skill-details-close-btn" @click="closeSkillDetails">
                <Icon icon="mdi:close" />
              </button>
            </div>
            
            <div class="skill-details-body">
              <!-- Описания всех открытых уровней -->
              <div class="skill-details-levels">
                <div 
                  v-for="lvl in selectedSkillData.unlockedLevels" 
                  :key="lvl.level" 
                  class="skill-details-level"
                >
                  <span class="skill-details-level-badge">{{ lvl.level }}</span>
                  <p class="skill-details-desc-text">{{ lvl.description }}</p>
                </div>
              </div>
              
              <!-- Единая заметка для всего навыка -->
              <div class="skill-details-section">
                <h4>Заметка</h4>
                <textarea 
                  class="skill-custom-desc-input"
                  :value="selectedSkillData.customDescription"
                  @input="e => saveCustomDescription(selectedSkillData.id, 0, e.target.value)"
                  placeholder="Добавьте заметку к навыку..."
                ></textarea>
              </div>
              
              <!-- Единые теги для всего навыка -->
              <div class="skill-details-section">
                <h4>Теги для поиска</h4>
                <input 
                  type="text"
                  class="skill-tags-input"
                  :value="selectedSkillData.customTags?.join(', ')"
                  @input="e => saveCustomTags(selectedSkillData.id, 0, e.target.value.split(',').map(t => t.trim()).filter(Boolean))"
                  placeholder="тег1, тег2, тег3..."
                />
              </div>
              
              <!-- Выбор цвета метки -->
              <div class="skill-details-section">
                <h4>Цвет метки</h4>
                <div class="skill-color-picker">
                  <button 
                    v-for="color in skillColorOptions" 
                    :key="color.value"
                    class="skill-color-option"
                    :class="{ active: (selectedSkillData.customColor || selectedSkillData.aspectColor) === color.value }"
                    :style="{ backgroundColor: color.value }"
                    :title="color.name"
                    @click="saveSkillColor(selectedSkillData.id, color.value)"
                  ></button>
                  <button 
                    class="skill-color-option reset"
                    :class="{ active: !selectedSkillData.customColor }"
                    title="Сбросить (цвет аспекта)"
                    @click="saveSkillColor(selectedSkillData.id, null)"
                  >
                    <Icon icon="mdi:refresh" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        </Teleport>

        <!-- Блок выбора режима небоевых действий -->
        <div class="action-mode-section">
          <div class="mode-header">
            <div class="mode-header-center">
              <span class="mode-title">РЕЖИМ ДЕЙСТВИЙ:</span>
              <span class="mode-active-name">{{ activeModeNames }}</span>
            </div>
            <button class="mode-info-btn" @click="showModeInfo = !showModeInfo">
              <Icon icon="mdi:information-outline" />
            </button>
          </div>
          <div class="mode-buttons">
            <button
              v-for="mode in actionModes"
              :key="mode.id"
              class="mode-btn"
              :class="{ active: activeMode === mode.id }"
              :style="{ '--mode-color': mode.color }"
              @click="setActiveMode(mode.id)"
              :title="mode.mode.name"
            >
              <Icon :icon="mode.mode.icon" class="mode-icon" />
              <span 
                class="mode-detail-btn" 
                @click.stop="showModeDetails(mode)"
              >
                <Icon icon="mdi:help-circle-outline" />
              </span>
            </button>
          </div>
        </div>

        <!-- Общая пояснялка по режимам -->
        <div v-if="showModeInfo" class="mode-info-panel">
          <p>Выбранный режим виден мастеру и влияет на контекст сцены.</p>
          <p>При высоких показателях соответствующего Атрибута режимы становятся эффективнее и дают особые бонусы.</p>
          <p>По умолчанию можно выбрать только один режим. Особые умения увеличивают лимит.</p>
          <p class="mode-info-warning">В бою режимы менять нельзя.</p>
        </div>

        <!-- Модалка с деталями режима -->
        <div v-if="selectedModeDetails" class="mode-details-overlay" @click="selectedModeDetails = null">
          <div class="mode-details-card" @click.stop>
            <div class="mode-details-header" :style="{ color: selectedModeDetails.color }">
              <Icon :icon="selectedModeDetails.mode.icon" class="mode-details-icon" />
              <span class="mode-details-name">{{ selectedModeDetails.mode.name }}</span>
            </div>
            <p class="mode-details-desc">{{ selectedModeDetails.mode.description }}</p>
            <div class="mode-details-info">
              <p>Мастер видит ваш выбранный режим. Контекст сцены может меняться в зависимости от вашего подхода.</p>
            </div>
            <button class="mode-details-close" @click="selectedModeDetails = null">Закрыть</button>
          </div>
        </div>

        <!-- Таблица проверок -->
        <div class="checks-section">
          <div class="checks-table-container">
            <!-- Фиксированный столбец проверок -->
            <div class="aspects-column">
              <div class="aspect-header-cell">
                <span class="checks-title">ПРОВЕРКИ</span>
              </div>
              <div 
                v-for="aspect in aspects" 
                :key="aspect.id"
                class="aspect-row-cell"
                :style="{ color: aspect.color }"
              >
                <Icon :icon="aspect.checkIcon || aspect.icon || 'mdi:circle'" class="aspect-icon" />
                <span class="aspect-name">{{ aspect.check?.name || aspect.name }}</span>
              </div>
            </div>
            <!-- Прокручиваемый блок со значениями -->
            <div class="checks-scroll-area">
              <div class="checks-grid">
                <!-- Заголовки сложностей -->
                <div class="diff-headers-row">
                  <div 
                    v-for="diff in difficulties" 
                    :key="diff.value"
                    class="diff-header-cell"
                    :class="'linetype-' + diff.linetype"
                    :style="{ '--diff-color': diff.color }"
                    :title="diff.name"
                  >
                    {{ diff.short }}
                  </div>
                </div>
                <!-- Строки значений -->
                <div v-for="aspect in aspects" :key="aspect.id" class="checks-row">
                  <div 
                    v-for="diff in difficulties" 
                    :key="diff.value"
                    class="check-cell"
                    :class="['linetype-' + diff.linetype, getCellResult(aspect.id, diff.value).type]"
                    :style="{ '--diff-color': diff.color }"
                  >
                    {{ getCellResult(aspect.id, diff.value).value }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Вкладка "Вещи" -->
      <div v-show="activeSheetTab === 'items'" class="tab-content">
        <div class="section-card">
          <CharacterEquipment
            :character="currentCharacter"
            :is-master="isMaster"
            @update:character="updateCharacter"
          />
        </div>
      </div>
      
      <!-- Вкладка "Социум" -->
      <div v-show="activeSheetTab === 'social'" class="tab-content">
        <div class="section-card placeholder">
          <Icon icon="mdi:account-group" class="placeholder-icon" />
          <p>Социальные связи</p>
          <span class="placeholder-hint">В разработке</span>
        </div>
      </div>
      
      <!-- Вкладка "Магия" -->
      <div v-show="activeSheetTab === 'magic'" class="tab-content">
        <div class="section-card placeholder">
          <Icon icon="mdi:auto-fix" class="placeholder-icon" />
          <p>Магические способности</p>
          <span class="placeholder-hint">В разработке</span>
        </div>
      </div>
    </div>
    
    <!-- Пустое состояние -->
    <div v-else class="empty-state">
      <Icon icon="mdi:account-off" class="empty-icon" />
      <p class="empty-title">У вас пока нет персонажей</p>
      <p class="empty-hint">
        Чтобы создать нового персонажа, вам нужно получить приглашение от мастера. 
        Оно отобразится на вкладке «Сцена».
      </p>
    </div>
    
    <!-- ===== Модальное окно редактирования основных данных ===== -->
    <Teleport to="body">
      <div v-if="showBasicEditor" class="master-modal-overlay" @click="showBasicEditor = false">
        <div class="master-modal master-modal-wide" @click.stop>
          <div class="master-modal-header">
            <h3>Основные данные</h3>
            <button class="modal-close-btn" @click="showBasicEditor = false">
              <Icon icon="mdi:close" />
            </button>
          </div>
          
          <div class="master-modal-body">
            <!-- Имя -->
            <div class="form-group">
              <label>Имя персонажа</label>
              <input 
                type="text" 
                v-model="editingBasicData.name"
                class="form-input"
                placeholder="Введите имя..."
              />
            </div>
            
            <!-- Портрет -->
            <div class="form-group">
              <label>URL портрета</label>
              <input 
                type="text" 
                v-model="editingBasicData.portrait"
                class="form-input"
                placeholder="https://..."
              />
              <div v-if="editingBasicData.portrait" class="portrait-preview">
                <img :src="editingBasicData.portrait" alt="Превью" />
              </div>
            </div>
            
            <!-- Только для NPC -->
            <template v-if="currentCharacter?.isNpc">
              <!-- Тип NPC -->
              <div class="form-group">
                <label>Тип NPC</label>
                <div class="npc-type-selector">
                  <button 
                    v-for="type in npcTypes"
                    :key="type.id"
                    class="npc-type-btn"
                    :class="{ active: editingBasicData.npcType === type.id }"
                    :style="{ '--type-color': type.color }"
                    @click="editingBasicData.npcType = type.id"
                  >
                    {{ type.label }}
                  </button>
                </div>
              </div>
              
              <!-- Видимость для игроков -->
              <div class="form-group">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    v-model="editingBasicData.visibleToPlayers"
                  />
                  <span>Видим игрокам на карте</span>
                </label>
              </div>
              
              <!-- Фракции -->
              <div class="form-group">
                <label>Фракции</label>
                <div class="factions-list">
                  <span 
                    v-for="faction in editingBasicData.factions" 
                    :key="faction"
                    class="faction-tag"
                  >
                    {{ faction }}
                    <button class="faction-remove" @click="removeFaction(faction)">×</button>
                  </span>
                </div>
                <div class="faction-add">
                  <input 
                    type="text" 
                    v-model="newFaction"
                    class="form-input"
                    placeholder="Новая фракция..."
                    @keyup.enter="addFaction"
                  />
                  <button class="add-faction-btn" @click="addFaction">
                    <Icon icon="mdi:plus" />
                  </button>
                </div>
              </div>
            </template>
          </div>
          
          <div class="master-modal-footer">
            <button class="modal-btn cancel" @click="showBasicEditor = false">Отмена</button>
            <button class="modal-btn save" @click="saveBasicData">Сохранить</button>
          </div>
        </div>
      </div>
    </Teleport>
    
    <!-- ===== Модальное окно редактирования здоровья ===== -->
    <Teleport to="body">
      <div v-if="showHealthEditor" class="master-modal-overlay" @click="showHealthEditor = false">
        <div class="master-modal" @click.stop>
          <div class="master-modal-header">
            <h3>Настройки здоровья</h3>
            <button class="modal-close-btn" @click="showHealthEditor = false">
              <Icon icon="mdi:close" />
            </button>
          </div>
          
          <div class="master-modal-body">
            <!-- Тип системы здоровья -->
            <div class="form-group">
              <label>Система здоровья</label>
              <div class="health-type-selector">
                <button 
                  class="health-type-btn"
                  :class="{ active: editingHealthData.healthType === 'simple' }"
                  @click="editingHealthData.healthType = 'simple'"
                >
                  <Icon icon="mdi:heart" />
                  <span>Простое HP</span>
                </button>
                <button 
                  class="health-type-btn"
                  :class="{ active: editingHealthData.healthType === 'wounds' }"
                  @click="editingHealthData.healthType = 'wounds'"
                >
                  <Icon icon="mdi:bandage" />
                  <span>Ранения</span>
                </button>
              </div>
            </div>
            
            <!-- Для простого HP -->
            <div v-if="editingHealthData.healthType === 'simple'" class="form-group">
              <label>Максимальное HP</label>
              <input 
                type="number" 
                v-model.number="editingHealthData.maxHp"
                class="form-input"
                min="1"
                max="100"
              />
            </div>
            
            <!-- Для ранений -->
            <template v-if="editingHealthData.healthType === 'wounds'">
              <div class="wounds-grid">
                <div class="form-group">
                  <label>Царапины (макс.)</label>
                  <input 
                    type="number" 
                    v-model.number="editingHealthData.maxScratch"
                    class="form-input"
                    min="0"
                    max="10"
                  />
                </div>
                <div class="form-group">
                  <label>Лёгкие (макс.)</label>
                  <input 
                    type="number" 
                    v-model.number="editingHealthData.maxLight"
                    class="form-input"
                    min="0"
                    max="10"
                  />
                </div>
                <div class="form-group">
                  <label>Тяжёлые (макс.)</label>
                  <input 
                    type="number" 
                    v-model.number="editingHealthData.maxHeavy"
                    class="form-input"
                    min="0"
                    max="10"
                  />
                </div>
                <div class="form-group">
                  <label>Смертельные (макс.)</label>
                  <input 
                    type="number" 
                    v-model.number="editingHealthData.maxDeadly"
                    class="form-input"
                    min="1"
                    max="10"
                  />
                </div>
              </div>
              <div class="form-group">
                <label>Бонусные смертельные слоты</label>
                <input 
                  type="number" 
                  v-model.number="editingHealthData.bonusDeadlySlots"
                  class="form-input"
                  min="0"
                  max="5"
                />
                <p class="form-hint">Добавляются к максимуму смертельных</p>
              </div>
            </template>
          </div>
          
          <div class="master-modal-footer">
            <button class="modal-btn cancel" @click="showHealthEditor = false">Отмена</button>
            <button class="modal-btn save" @click="saveHealthData">Сохранить</button>
          </div>
        </div>
      </div>
    </Teleport>
    
    <!-- ===== Модальное окно редактирования характеристик ===== -->
    <Teleport to="body">
      <div v-if="showStatsEditor" class="master-modal-overlay" @click="showStatsEditor = false">
        <div class="master-modal" @click.stop>
          <div class="master-modal-header">
            <h3>Редактирование характеристик</h3>
            <button class="modal-close-btn" @click="showStatsEditor = false">
              <Icon icon="mdi:close" />
            </button>
          </div>
          
          <div class="master-modal-body">
            <div class="stats-editor-grid">
              <div 
                v-for="aspect in statAspects" 
                :key="aspect.id"
                class="stat-editor-item"
                :style="{ '--stat-color': aspect.color }"
              >
                <div class="stat-editor-label">
                  <Icon :icon="aspect.characteristicIcon || aspect.icon" />
                  <span>{{ aspect.characteristic?.name || aspect.name }}</span>
                </div>
                <input 
                  type="number" 
                  v-model.number="editingStats[aspect.id]"
                  class="stat-editor-input"
                  min="-5"
                  max="10"
                />
              </div>
            </div>
          </div>
          
          <div class="master-modal-footer">
            <button class="modal-btn cancel" @click="showStatsEditor = false">Отмена</button>
            <button class="modal-btn save" @click="saveStats">Сохранить</button>
          </div>
        </div>
      </div>
    </Teleport>
    
    <!-- ===== Модальное окно редактирования навыков ===== -->
    <Teleport to="body">
      <div v-if="showMasterSkillsEditor" class="master-modal-overlay" @click="showMasterSkillsEditor = false">
        <div class="master-modal master-modal-wide" @click.stop>
          <div class="master-modal-header">
            <h3>Редактирование навыков</h3>
            <button class="modal-close-btn" @click="showMasterSkillsEditor = false">
              <Icon icon="mdi:close" />
            </button>
          </div>
          
          <div class="master-modal-body">
            <!-- Добавление нового навыка из классов/аспектов -->
            <div class="skill-add-row">
              <select v-model="newSkillId" class="skill-select">
                <option value="">Выберите навык...</option>
                <option 
                  v-for="skill in allAvailableSkills" 
                  :key="skill.id" 
                  :value="skill.id"
                  :disabled="editingMasterSkills.some(s => s.id === skill.id)"
                >
                  [{{ skill.sourceType === 'class' ? 'Класс' : 'Аспект' }}] {{ skill.name }} ({{ skill.sourceName }})
                </option>
              </select>
              <select v-model.number="newSkillLevel" class="level-select">
                <option :value="1">Ур. 1</option>
                <option :value="2">Ур. 2</option>
                <option :value="3">Ур. 3</option>
              </select>
              <button class="add-skill-btn" @click="addMasterSkill" :disabled="!newSkillId">
                <Icon icon="mdi:plus" />
              </button>
            </div>
            
            <!-- Добавление кастомного навыка -->
            <div class="custom-skill-section">
              <button 
                v-if="!showCustomSkillForm" 
                class="add-custom-skill-btn"
                @click="showCustomSkillForm = true"
              >
                <Icon icon="mdi:plus-circle-outline" /> Добавить особый навык
              </button>
              <div v-else class="custom-skill-form">
                <input 
                  v-model="customSkillName" 
                  placeholder="Название навыка"
                  class="custom-skill-input"
                />
                <textarea 
                  v-model="customSkillDescription" 
                  placeholder="Описание (опционально)"
                  class="custom-skill-textarea"
                  rows="2"
                />
                <div class="custom-skill-actions">
                  <button class="modal-btn cancel" @click="showCustomSkillForm = false">Отмена</button>
                  <button class="modal-btn save" @click="addCustomSkill">Добавить</button>
                </div>
              </div>
            </div>
            
            <!-- Список текущих навыков -->
            <div v-if="editingMasterSkills.length" class="skills-editor-list">
              <div 
                v-for="skill in editingMasterSkills" 
                :key="skill.id"
                class="skill-editor-item"
                :class="{ 'custom-skill': skill.id.startsWith('custom_') }"
              >
                <div class="skill-editor-info">
                  <span class="skill-editor-name">
                    {{ skill.customName || getMasterSkillData(skill.id)?.name || skill.id }}
                  </span>
                  <span class="skill-editor-source" v-if="getMasterSkillData(skill.id)?.sourceName">
                    {{ getMasterSkillData(skill.id).sourceName }}
                  </span>
                  <span class="skill-editor-source custom" v-else-if="skill.id.startsWith('custom_')">
                    Особый
                  </span>
                </div>
                <select 
                  :value="skill.level"
                  @change="updateMasterSkillLevel(skill.id, $event.target.value)"
                  class="level-select"
                >
                  <option :value="1">Ур. 1</option>
                  <option :value="2">Ур. 2</option>
                  <option :value="3">Ур. 3</option>
                </select>
                <button class="remove-skill-btn" @click="removeMasterSkill(skill.id)">
                  <Icon icon="mdi:close" />
                </button>
              </div>
            </div>
            <div v-else class="skills-editor-empty">
              Навыки не добавлены
            </div>
          </div>
          
          <div class="master-modal-footer">
            <button class="modal-btn cancel" @click="showMasterSkillsEditor = false">Отмена</button>
            <button class="modal-btn save" @click="saveMasterSkills">Сохранить</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mobile-character-sheet {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f172a;
  color: #f1f5f9;
}

/* Вкладки персонажей */
.character-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  overflow-x: auto;
  flex-shrink: 0;
}

.char-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(51, 65, 85, 0.3);
  border: 1px solid transparent;
  color: #94a3b8;
  font-size: 12px;
  white-space: nowrap;
  transition: all 150ms;
}

.char-tab.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.3);
  color: #38bdf8;
}

.char-tab-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.char-tab-avatar-fallback {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #334155;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
}

.char-tab-name {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Горизонтальные вкладки секций */
.sheet-tabs-row {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  background: rgba(15, 23, 42, 0.95);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  overflow-x: auto;
  flex-shrink: 0;
}

.sheet-tab-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(51, 65, 85, 0.3);
  border: 1px solid transparent;
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
  transition: all 150ms;
}

.sheet-tab-btn.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: rgba(56, 189, 248, 0.3);
  color: #38bdf8;
}

.sheet-tab-btn .tab-icon {
  width: 16px;
  height: 16px;
}

.sheet-tab-btn .tab-label {
  font-weight: 500;
}

/* Контент листа */
.sheet-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  padding-bottom: 12px;
}

/* Секция удаления персонажа */
.delete-section {
  display: flex;
  justify-content: flex-end;
  padding: 8px 0;
  margin-bottom: 8px;
}

.delete-character-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.delete-character-btn:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
}

.delete-character-btn .delete-icon {
  font-size: 16px;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Контент выровненный по низу */
.tab-content-bottom {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 16px;
}

/* === СЕКЦИЯ НАВЫКОВ === */
.skills-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skills-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.skills-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #e2e8f0;
}

.skills-controls {
  display: flex;
  gap: 4px;
}

.skills-toggle-desc,
.skills-toggle-expand {
  background: none;
  border: none;
  color: #64748b;
  padding: 4px;
  cursor: pointer;
  border-radius: 4px;
}

.skills-toggle-desc:hover,
.skills-toggle-expand:hover {
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.1);
}

.skills-toggle-desc.active {
  color: #22c55e;
}

.skills-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skills-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 20px;
  color: #64748b;
  font-size: 12px;
  text-align: center;
  font-style: italic;
}

.skills-empty-icon {
  font-size: 24px;
  opacity: 0.6;
}

.skill-item {
  position: relative;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 8px;
  border-left: 3px solid var(--skill-color, #64748b);
  overflow: hidden;
  transition: all 0.2s ease;
}

.skill-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  cursor: pointer;
}

.skill-main:hover {
  background: rgba(51, 65, 85, 0.4);
}

.skill-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.skill-name {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.skill-level {
  font-size: 11px;
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
}

.skill-source {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 16px;
  opacity: 0.8;
}

.skill-source-name {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.skill-expand-icon {
  font-size: 18px;
  color: #64748b;
  transition: transform 0.2s ease;
}

.skill-item.expanded .skill-expand-icon {
  transform: rotate(180deg);
}

.skill-description {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
  background: rgba(15, 23, 42, 0.5);
  overflow: hidden;
}

.skill-levels-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  position: relative;
  z-index: 1;
}

.skill-level-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.skill-level-badge {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.2);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  color: #cbd5e1;
}

.skill-level-item p {
  flex: 1;
  margin: 0;
}

/* Заметка игрока к навыку */
.skill-custom-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed rgba(148, 163, 184, 0.3);
}

.skill-note-badge {
  flex-shrink: 0;
  font-size: 14px;
}

.skill-custom-note p {
  flex: 1;
  margin: 0;
  color: #fbbf24;
  font-style: italic;
}

/* Фоновая картинка класса - внутри описания */
.skill-bg-image {
  position: absolute;
  right: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 100px;
  height: 100px;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  opacity: 0.2;
  pointer-events: none;
  filter: grayscale(20%);
}

.skill-description p {
  flex: 1;
  margin: 0;
  position: relative;
  z-index: 1;
}

.skill-details-btn {
  flex-shrink: 0;
  background: rgba(148, 163, 184, 0.15);
  border: none;
  border-radius: 4px;
  color: #64748b;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  position: relative;
  z-index: 1;
}

.skill-details-btn:hover {
  background: rgba(148, 163, 184, 0.25);
  color: #94a3b8;
}

.skills-filter {
  margin-top: 4px;
  position: relative;
  display: flex;
  align-items: center;
}

.skills-filter-icon {
  position: absolute;
  left: 12px;
  color: #64748b;
  font-size: 16px;
  pointer-events: none;
}

.skills-filter-input {
  width: 100%;
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  padding: 8px 12px 8px 36px;
  font-size: 13px;
  color: #e2e8f0;
}

.skills-filter-input::placeholder {
  color: #64748b;
}

.skills-filter-clear {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.15s;
}

.skills-filter-clear:hover {
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
}

/* Подсказка когда описания скрыты */
.skill-hidden-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #64748b;
  font-size: 12px;
  font-style: italic;
}

/* Попап деталей навыка */
.skill-details-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
  padding-top: 60px;
  padding-bottom: 80px;
  overflow-y: auto;
}

.skill-details-card {
  background: #1e293b;
  border-radius: 12px;
  width: calc(100vw - 32px);
  max-width: calc(100vw - 32px);
  margin-bottom: 20px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  display: flex;
  flex-direction: column;
}

.skill-details-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 2px solid;
  flex-shrink: 0;
}

.skill-details-source-icon {
  font-size: 24px;
  color: #94a3b8;
}

.skill-details-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.skill-details-name {
  font-size: 16px;
  font-weight: 700;
  color: #e2e8f0;
}

.skill-details-level {
  font-size: 12px;
  color: #94a3b8;
}

.skill-details-close-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.skill-details-close-btn:hover {
  color: #94a3b8;
}

.skill-details-body {
  padding: 12px 16px;
}

.skill-details-levels {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.skill-details-levels .skill-details-level {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 8px;
}

.skill-details-level-badge {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.2);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #cbd5e1;
}

.skill-details-desc-text {
  flex: 1;
  font-size: 13px;
  color: #cbd5e1;
  margin: 0;
  line-height: 1.5;
}

.skill-details-section {
  margin-bottom: 12px;
}

.skill-details-section:last-child {
  margin-bottom: 0;
}

.skill-details-section h4 {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  margin: 0 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.skill-custom-desc-input {
  width: 100%;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  padding: 10px;
  font-size: 13px;
  color: #e2e8f0;
  resize: vertical;
  min-height: 50px;
}

.skill-tags-input {
  width: 100%;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 13px;
  color: #e2e8f0;
}

.skill-custom-desc-input::placeholder,
.skill-tags-input::placeholder {
  color: #64748b;
}

/* Палитра цветов для метки навыка */
.skill-color-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skill-color-option {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.skill-color-option:hover {
  transform: scale(1.1);
}

.skill-color-option.active {
  border-color: #fff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
}

.skill-color-option.reset {
  background: rgba(148, 163, 184, 0.2);
  color: #94a3b8;
  font-size: 14px;
}

.skill-color-option.reset:hover {
  background: rgba(148, 163, 184, 0.3);
}

/* Секция режима действий */
.action-mode-section {
  flex-shrink: 0;
}

.mode-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
}

.mode-header-center {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  justify-content: center;
}

.mode-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #94a3b8;
}

.mode-active-name {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.mode-info-btn {
  background: none;
  border: none;
  color: #64748b;
  padding: 4px;
  cursor: pointer;
  flex-shrink: 0;
}

.mode-buttons {
  display: flex;
  gap: 8px;
  justify-content: space-between;
}

.mode-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 10px 4px;
  background: rgba(30, 41, 59, 0.6);
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
}

.mode-btn:hover {
  background: rgba(51, 65, 85, 0.6);
}

.mode-btn.active {
  border-color: var(--mode-color);
  background: color-mix(in srgb, var(--mode-color) 15%, transparent);
}

/* Особый стиль для Тени - более заметная чёрная граница */
.mode-btn.active[style*="#374151"] {
  border-color: #000000;
  background: rgba(0, 0, 0, 0.15);
}

.mode-icon {
  width: 24px;
  height: 24px;
  color: var(--mode-color);
}

.mode-detail-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  background: none;
  border: none;
  padding: 2px;
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
}

.mode-detail-btn:hover {
  color: #94a3b8;
}

/* Оверлей с деталями режима */
.mode-details-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.mode-details-card {
  background: #1e293b;
  border-radius: 16px;
  padding: 20px;
  max-width: 320px;
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.mode-details-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.mode-details-icon {
  width: 32px;
  height: 32px;
}

.mode-details-name {
  font-size: 20px;
  font-weight: 700;
}

.mode-details-desc {
  color: #94a3b8;
  font-size: 14px;
  margin: 0 0 16px;
  line-height: 1.5;
}

.mode-details-info {
  background: rgba(51, 65, 85, 0.4);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.mode-details-info p {
  color: #94a3b8;
  font-size: 13px;
  margin: 0;
  line-height: 1.5;
}

/* Панель пояснений по режимам */
.mode-info-panel {
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  padding: 12px;
}

.mode-info-panel p {
  color: #94a3b8;
  font-size: 12px;
  margin: 0 0 8px;
  line-height: 1.4;
}

.mode-info-panel p:last-child {
  margin-bottom: 0;
}

.mode-info-warning {
  color: #f59e0b !important;
  font-weight: 500;
}

.mode-details-bonuses {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.bonus-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #cbd5e1;
}

.bonus-check {
  color: #22c55e;
  width: 16px;
  height: 16px;
}

.mode-details-close {
  width: 100%;
  padding: 10px;
  background: rgba(51, 65, 85, 0.8);
  border: none;
  border-radius: 8px;
  color: #e2e8f0;
  font-size: 14px;
  cursor: pointer;
}

.mode-details-close:hover {
  background: rgba(71, 85, 105, 0.8);
}

/* Секция проверок */
.checks-section {
  flex-shrink: 0;
}

.checks-table-container {
  display: flex;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

/* Фиксированный столбец аспектов */
.aspects-column {
  flex-shrink: 0;
  width: 110px;
}

.aspect-header-cell {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.checks-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #e2e8f0;
}

.aspect-row-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  padding: 0 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  white-space: nowrap;
}

.aspect-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.aspect-name {
  font-weight: 500;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Прокручиваемая область со значениями */
.checks-scroll-area {
  width: calc(100% - 110px); /* 110px = ширина aspects-column */
  overflow-x: scroll;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-x;
}

.checks-grid {
  display: inline-flex;
  flex-direction: column;
  min-width: max-content;
}

.diff-headers-row {
  display: flex;
  height: 36px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.diff-header-cell {
  width: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 12px;
  color: #94a3b8;
  position: relative;
}

/* Границы столбцов через псевдоэлементы */
.diff-header-cell::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--diff-color, transparent);
}

/* Пунктир для "ниже" */
.diff-header-cell.linetype-dashed::before {
  background: repeating-linear-gradient(
    to bottom,
    var(--diff-color) 0px,
    var(--diff-color) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* Сплошная для базовых */
.diff-header-cell.linetype-single::before {
  background: var(--diff-color);
}

/* Крепостная стена для "выше" - сплошная слева, пунктир справа */
.diff-header-cell.linetype-double::before {
  width: 2px;
  background: var(--diff-color);
}
.diff-header-cell.linetype-double::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: repeating-linear-gradient(
    to bottom,
    var(--diff-color) 0px,
    var(--diff-color) 4px,
    transparent 4px,
    transparent 8px
  );
}

.checks-row {
  display: flex;
  height: 40px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.check-cell {
  width: 44px;
  min-width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  position: relative;
}

/* Границы для ячеек */
.check-cell::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--diff-color, transparent);
}

.check-cell.linetype-dashed::before {
  background: repeating-linear-gradient(
    to bottom,
    var(--diff-color) 0px,
    var(--diff-color) 4px,
    transparent 4px,
    transparent 8px
  );
}

.check-cell.linetype-single::before {
  background: var(--diff-color);
}

.check-cell.linetype-double::before {
  width: 2px;
  background: var(--diff-color);
}
.check-cell.linetype-double::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: repeating-linear-gradient(
    to bottom,
    var(--diff-color) 0px,
    var(--diff-color) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* Цвета ячеек - приглушённые */
.check-cell.auto {
  background: rgba(34, 197, 94, 0.1);
  color: #a3e635; /* лаймово-зелёный, не слишком яркий */
}

.check-cell.roll {
  background: rgba(251, 191, 36, 0.08);
  color: #cbd5e1; /* светло-серый */
}

.check-cell.fail {
  background: rgba(239, 68, 68, 0.08);
  color: #475569; /* тёмно-серый, неактивный */
}

/* Заголовочная карточка */
.header-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.header-info {
  flex: 1;
  min-width: 0;
}

.char-name {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 2px;
  word-break: break-word;
}

.char-class {
  font-size: 13px;
  color: #94a3b8;
  margin: 0 0 10px;
}

/* Сетка статов */
.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.stat-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid;
}

.stat-badge.armor {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.3);
}

.stat-badge.speed {
  background: rgba(6, 182, 212, 0.15);
  border-color: rgba(6, 182, 212, 0.3);
}

.stat-badge.bursts {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.3);
}

.stat-badge.level {
  background: rgba(168, 85, 247, 0.15);
  border-color: rgba(168, 85, 247, 0.3);
}

.stat-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.stat-badge.armor .stat-icon { color: #3b82f6; }
.stat-badge.speed .stat-icon { color: #06b6d4; }
.stat-badge.bursts .stat-icon { color: #f59e0b; }
.stat-badge.level .stat-icon { color: #a855f7; }

.stat-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #94a3b8;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
}

/* Секции */
.section-card {
  padding: 12px;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #94a3b8;
  margin: 0 0 12px;
}

/* Компактные навыки */
.skills-compact {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 8px;
}

.skill-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

.skill-icon {
  width: 16px;
  height: 16px;
}

.skill-bonus {
  font-size: 14px;
  font-weight: 700;
  color: #22c55e;
}

/* Плейсхолдеры */
.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
  color: #64748b;
}

.placeholder-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.placeholder-hint {
  font-size: 12px;
  color: #475569;
  margin-top: 4px;
}

/* Пустое состояние */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #64748b;
  padding: 32px;
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: #94a3b8;
  margin: 0 0 12px;
}

.empty-hint {
  font-size: 14px;
  color: #64748b;
  max-width: 320px;
  line-height: 1.5;
  margin: 0;
}

.create-character-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  padding: 12px 24px;
  background: linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%);
  border: none;
  border-radius: 12px;
  color: white;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 200ms;
}

.create-character-btn:active {
  transform: scale(0.95);
}

.create-character-btn .iconify {
  font-size: 20px;
}

/* Embedded режим - контент занимает всю высоту */
.mobile-character-sheet.embedded {
  overflow: hidden;
  height: 100%;
}

.mobile-character-sheet.embedded .sheet-content {
  flex: 1;
  overflow-y: auto;
  padding-top: 210px;
  height: 100%;
  box-sizing: border-box;
}

/* ===== Мастерские инструменты ===== */
.master-edit-section {
  margin-top: 24px;
  padding: 16px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 12px;
}

.master-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #a78bfa;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.master-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.master-section-header span {
  font-size: 14px;
  font-weight: 500;
  color: #e2e8f0;
}

.master-edit-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 6px;
  color: #a78bfa;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.master-edit-btn:hover {
  background: rgba(139, 92, 246, 0.3);
}

.master-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.master-stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.1);
}

.master-stat-item .stat-icon {
  font-size: 18px;
  color: var(--stat-color, #94a3b8);
}

.master-stat-item .stat-name {
  font-size: 10px;
  color: #94a3b8;
  text-align: center;
}

.master-stat-item .stat-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--stat-color, #f1f5f9);
}

.master-skills-section {
  margin-top: 16px;
}

.master-skills-info {
  font-size: 13px;
  color: #64748b;
}

/* Основные данные */
.master-basic-section {
  margin-bottom: 16px;
}

.master-basic-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.basic-info-row {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.info-label {
  color: #64748b;
}

.info-value {
  color: #e2e8f0;
  font-weight: 500;
}

.npc-type-badge {
  font-weight: 600;
}

/* Здоровье */
.master-health-section {
  margin-bottom: 16px;
}

.master-health-info {
  display: flex;
  gap: 12px;
  align-items: center;
}

.health-type-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.health-type-badge.simple {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.health-type-badge.wounds {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.health-max {
  font-size: 13px;
  color: #94a3b8;
}

/* Кнопка удаления */
.master-danger-section {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid rgba(239, 68, 68, 0.2);
}

.master-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  color: #ef4444;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.master-delete-btn:hover {
  background: rgba(239, 68, 68, 0.25);
}

/* Формы в модальных окнах */
.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #94a3b8;
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  color: #f1f5f9;
  font-size: 14px;
}

.form-input:focus {
  outline: none;
  border-color: rgba(139, 92, 246, 0.5);
}

.form-hint {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

/* Сетка для ранений */
.wounds-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.wounds-grid .form-group {
  margin-bottom: 0;
}

/* Кастомные навыки */
.custom-skill-section {
  margin: 12px 0;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.add-custom-skill-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px dashed rgba(139, 92, 246, 0.3);
  border-radius: 8px;
  color: #a78bfa;
  font-size: 13px;
  cursor: pointer;
  width: 100%;
  justify-content: center;
}

.add-custom-skill-btn:hover {
  background: rgba(139, 92, 246, 0.2);
}

.custom-skill-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.custom-skill-input {
  padding: 8px 12px;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 14px;
}

.custom-skill-textarea {
  padding: 8px 12px;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 13px;
  resize: vertical;
}

.custom-skill-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.skill-editor-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.skill-editor-source {
  font-size: 11px;
  color: #64748b;
}

.skill-editor-source.custom {
  color: #a78bfa;
}

.skill-editor-item.custom-skill {
  border-left: 2px solid #a78bfa;
}

.portrait-preview {
  margin-top: 8px;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  overflow: hidden;
  background: #1e293b;
}

.portrait-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Селектор типа NPC */
.npc-type-selector {
  display: flex;
  gap: 8px;
}

.npc-type-btn {
  flex: 1;
  padding: 10px;
  background: rgba(51, 65, 85, 0.4);
  border: 1px solid transparent;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.npc-type-btn.active {
  background: color-mix(in srgb, var(--type-color) 20%, transparent);
  border-color: var(--type-color);
  color: var(--type-color);
}

/* Чекбокс */
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: #8b5cf6;
}

.checkbox-label span {
  color: #e2e8f0;
}

/* Фракции */
.factions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.faction-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 12px;
  color: #3b82f6;
  font-size: 12px;
}

.faction-remove {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  margin-left: 2px;
}

.faction-add {
  display: flex;
  gap: 8px;
}

.add-faction-btn {
  width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 8px;
  color: #3b82f6;
  cursor: pointer;
}

/* Селектор типа здоровья */
.health-type-selector {
  display: flex;
  gap: 8px;
}

.health-type-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px;
  background: rgba(51, 65, 85, 0.4);
  border: 1px solid transparent;
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s;
}

.health-type-btn svg {
  font-size: 24px;
}

.health-type-btn.active {
  background: rgba(139, 92, 246, 0.2);
  border-color: rgba(139, 92, 246, 0.4);
  color: #a78bfa;
}

/* ===== Модальные окна мастера ===== */
.master-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.master-modal {
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.master-modal-wide {
  max-width: 500px;
}

.master-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
}

.master-modal-header h3 {
  font-size: 18px;
  font-weight: 600;
  color: #f1f5f9;
  margin: 0;
}

.modal-close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(51, 65, 85, 0.5);
  border: none;
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
}

.master-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.master-modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid rgba(148, 163, 184, 0.15);
}

.modal-btn {
  flex: 1;
  padding: 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.modal-btn.cancel {
  background: rgba(51, 65, 85, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #94a3b8;
}

.modal-btn.save {
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #22c55e;
}

.modal-btn.save:hover {
  background: rgba(34, 197, 94, 0.3);
}

/* Редактор характеристик */
.stats-editor-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat-editor-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 8px;
}

.stat-editor-label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  color: var(--stat-color, #f1f5f9);
  font-weight: 500;
}

.stat-editor-label svg {
  font-size: 20px;
}

.stat-editor-input {
  width: 70px;
  padding: 8px 12px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 6px;
  color: #f1f5f9;
  font-size: 18px;
  font-weight: 600;
  text-align: center;
}

/* Редактор навыков */
.skill-add-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.skill-select {
  flex: 1;
  padding: 10px 12px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  color: #f1f5f9;
  font-size: 14px;
}

.level-select {
  width: 80px;
  padding: 10px 8px;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 8px;
  color: #f1f5f9;
  font-size: 14px;
}

.add-skill-btn {
  width: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.4);
  border-radius: 8px;
  color: #22c55e;
  cursor: pointer;
}

.add-skill-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.skills-editor-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-editor-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(51, 65, 85, 0.3);
  border-radius: 8px;
}

.skill-editor-name {
  flex: 1;
  font-size: 14px;
  color: #e2e8f0;
}

.remove-skill-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #ef4444;
  cursor: pointer;
}

.skills-editor-empty {
  text-align: center;
  padding: 24px;
  color: #64748b;
  font-size: 14px;
}
</style>
