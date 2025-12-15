<script setup>
/**
 * SceneLog - лог событий сцены для мобильной версии
 * 
 * Отображает:
 * - Изображение сцены (если есть)
 * - Лог событий с фильтрацией
 * - Интерактивные элементы (проверки, лут и т.д.)
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useSceneLogStore, SceneEventType, SceneFilters } from '@/stores/sceneLog'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import { useCharactersStore } from '@/stores/characters'
import { getCheckBonus } from '@/utils/checks'
import { getPortraitUrl } from '@/utils/tokenRenderer'
import aspectsData from '@/data/aspects.json'
import diffsData from '@/data/diffs.json'
import UserAvatar from './UserAvatar.vue'
import CharacterPortrait from './CharacterPortrait.vue'

// Пропсов больше нет, изображения показываются только в инфопанели

const emit = defineEmits([
  'go-to-battle',
  'create-character',
  'skill-check-clicked',
  'view-image',
  'hide-image'
])

const sceneLogStore = useSceneLogStore()
const sessionStore = useSessionStore()
const userStore = useUserStore()
const charactersStore = useCharactersStore()

const { 
  filteredEvents, 
  paginatedEvents, 
  hasMoreEvents, 
  remainingEventsCount,
  totalEventsCount,
  currentImage, 
  hasActiveImage, 
  activeFilter, 
  perspectiveUserId 
} = storeToRefs(sceneLogStore)
const { role, connections } = storeToRefs(sessionStore)

// Проверка: скрыто ли событие для текущей перспективы
const isHiddenForPerspective = (event) => {
  if (!isMaster.value || !perspectiveUserId.value) return false
  return event.hiddenFrom && event.hiddenFrom.includes(perspectiveUserId.value)
}

// Скролл к низу при новых событиях
const logContainerRef = ref(null)
const autoScroll = ref(true)

// Показывать ли сетку доставки
const showDeliveryGrid = ref(true)

// Показывать ли панель инструментов мастера
const showMasterTools = ref(false)

// Диалог подтверждения очистки
const showClearConfirm = ref(false)

// Раскрытые квесты
const expandedQuests = ref(new Set())

// === Функции управления логом для мастера ===

const onExportLog = () => {
  sceneLogStore.downloadLog('trip-session-log')
  showMasterTools.value = false
}

const onClearLogClick = () => {
  showClearConfirm.value = true
  showMasterTools.value = false
}

const onConfirmClear = () => {
  sceneLogStore.clearAllEvents()
  showClearConfirm.value = false
}

const onCancelClear = () => {
  showClearConfirm.value = false
}

const onExportAndClear = () => {
  sceneLogStore.downloadLog('trip-session-log')
  sceneLogStore.clearAllEvents()
  showClearConfirm.value = false
}

const toggleQuestExpanded = (questId) => {
  if (expandedQuests.value.has(questId)) {
    expandedQuests.value.delete(questId)
  } else {
    expandedQuests.value.add(questId)
  }
}

// Иконка типа проверки (из данных аспекта)
const getCheckTypeIcon = (checkType) => {
  const aspect = aspectsData.aspects.find(a => a.id === checkType)
  return aspect?.checkIcon || 'mdi:dice-d20'
}

// Цвет аспекта проверки
const getAspectColor = (checkType) => {
  const aspect = aspectsData.aspects.find(a => a.id === checkType)
  return aspect?.color || '#f59e0b'
}

// Название сложности по числу
const getDifficultyName = (difficultyValue) => {
  const diff = diffsData[String(difficultyValue)]
  return diff ? `${diff.name} (${difficultyValue})` : String(difficultyValue)
}

// Получить данные сложности
const getDifficultyData = (difficultyValue) => {
  return diffsData[String(difficultyValue)] || { name: String(difficultyValue), color: '#f59e0b' }
}

// Фильтры
const filters = [
  { id: SceneFilters.ALL, label: 'Всё', icon: 'mdi:format-list-bulleted' },
  { id: SceneFilters.CHECKS, label: 'Проверки', icon: 'mdi:dice-d20' },
  { id: SceneFilters.COMBAT, label: 'Бой', icon: 'mdi:sword-cross' },
  { id: SceneFilters.QUESTS, label: 'Квесты', icon: 'mdi:map-marker-star' },
  { id: SceneFilters.ITEMS, label: 'Предметы', icon: 'mdi:treasure-chest' },
]

const setFilter = (filterId) => {
  sceneLogStore.setFilter(filterId)
}

// Скролл до конца при загрузке
onMounted(() => {
  if (logContainerRef.value) {
    setTimeout(() => {
      logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight
    }, 100)
  }
})

// Автоскролл при новых событиях (следим за пагинированными, не за всеми)
watch(paginatedEvents, (newEvents, oldEvents) => {
  // Скроллим только если добавились новые события в конец (а не загрузили историю)
  const isNewEventAtEnd = newEvents.length > 0 && oldEvents.length > 0 &&
    newEvents[newEvents.length - 1]?.id !== oldEvents[oldEvents.length - 1]?.id
  
  if (autoScroll.value && logContainerRef.value && isNewEventAtEnd) {
    setTimeout(() => {
      logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight
    }, 50)
  }
}, { deep: true })

// Проверка автоскролла при скролле пользователем
const onLogScroll = () => {
  if (!logContainerRef.value) return
  const { scrollTop, scrollHeight, clientHeight } = logContainerRef.value
  autoScroll.value = scrollHeight - scrollTop - clientHeight < 50
}

// Мастер ли это
const isMaster = computed(() => role.value === 'master')

// Список игроков для выбора перспективы (все известные, не только онлайн)
const perspectiveOptions = computed(() => {
  if (!isMaster.value) return []
  const options = [{ id: null, name: 'Все', avatar: null, online: true }]
  const allPlayers = sessionStore.allPlayers || []
  allPlayers.forEach(player => {
    options.push({
      id: player.userId,
      name: player.characterName || player.alias || 'Игрок',
      avatar: player.characterPortrait || player.avatar,
      online: player.online
    })
  })
  return options
})

// Установить перспективу
const setPerspective = (userId) => {
  sceneLogStore.setPerspective(userId)
}

// Форматирование времени
const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// Получение информации об отправителе
const getSenderInfo = (userId) => {
  // Защита от null/undefined
  if (!userId) {
    return { name: 'Система', avatar: null, isMe: false, isSystem: true }
  }
  
  if (userId === userStore.userId) {
    return { name: userStore.nickname || 'Вы', avatar: userStore.avatar, isMe: true }
  }
  
  // Ищем среди подключённых (для мастера - это игроки)
  const connection = sessionStore.connections?.find(c => c.userId === userId)
  if (connection) {
    return { name: connection.alias || 'Игрок', avatar: connection.avatar, isMe: false }
  }
  
  // Мастер (для игроков)
  if (sessionStore.masterProfile?.userId === userId) {
    return { name: sessionStore.masterProfile.nickname || 'Мастер', avatar: sessionStore.masterProfile.avatar, isMe: false, isMaster: true }
  }
  
  // Если мы мастер и отправитель - это мы
  if (sessionStore.role === 'master') {
    return { name: userStore.nickname || 'Мастер', avatar: userStore.avatar, isMe: true, isMaster: true }
  }
  
  return { name: 'Неизвестный', avatar: null, isMe: false }
}

// Получить активного персонажа игрока
const getMyCharacter = () => {
  const myChars = charactersStore.getCharactersByUserId(userStore.userId)
  // Берём первого персонажа (или активного, если будет такое свойство)
  return myChars.length > 0 ? myChars[0] : null
}

// Получить главного персонажа игрока по ownerId (для отображения в проверках)
const getCharacterByOwnerId = (ownerId) => {
  if (!ownerId) return null
  const chars = charactersStore.getCharactersByUserId(ownerId)
  return chars.length > 0 ? chars[0] : null
}

// Получить портрет персонажа для события проверки
const getCheckCharacterPortrait = (event) => {
  // Сначала пробуем из события
  if (event.characterPortrait) {
    return getPortraitUrl(event.characterPortrait)
  }
  // Иначе ищем по completedBy
  const character = getCharacterByOwnerId(event.completedBy)
  return character?.portrait ? getPortraitUrl(character.portrait) : null
}

// Предварительный анализ проверки - определяем нужен ли бросок
const getCheckPreview = (event) => {
  if (event.completed) return null
  
  const character = getMyCharacter()
  if (!character) return { needsRoll: true, modifier: 0 }
  
  const aspectId = getAspectIdByCheckType(event.checkType)
  const modifier = aspectId ? getCheckBonus(character, aspectId) : 0
  const difficulty = event.difficulty
  
  // Если модификатор >= сложности, автоуспех без броска
  if (modifier >= difficulty) {
    return { 
      needsRoll: false, 
      resultType: 'guaranteed-success',
      modifier,
      characterName: character.name
    }
  }
  
  // Если даже 12 + модификатор < сложности, автопровал
  if (12 + modifier < difficulty) {
    return {
      needsRoll: false,
      resultType: 'guaranteed-fail',
      modifier,
      characterName: character.name
    }
  }
  
  // Нужен бросок
  return {
    needsRoll: true,
    modifier,
    characterName: character.name
  }
}

// Автоматически завершить проверку (для гарантированных результатов)
const autoCompleteCheck = (event, resultType) => {
  const character = getMyCharacter()
  if (!character) return
  
  const aspectId = getAspectIdByCheckType(event.checkType)
  const modifier = aspectId ? getCheckBonus(character, aspectId) : 0
  
  const result = {
    roll: resultType === 'guaranteed-success' ? null : null,
    modifier,
    total: modifier,
    success: resultType === 'guaranteed-success',
    resultType,
    difficulty: event.difficulty
  }
  
  sceneLogStore.updateEvent(event.id, {
    completed: true,
    result,
    completedBy: userStore.userId,
    completedAt: Date.now(),
    characterName: character.name,
    characterPortrait: character.portrait || null
  })
  
  sessionStore.sendToMaster({
    type: 'skill-check-result',
    eventId: event.id,
    result,
    characterName: character.name,
    characterPortrait: character.portrait || null
  })
  
  emit('skill-check-clicked', { ...event, result })
}

// Маппинг названия проверки к aspectId
const getAspectIdByCheckType = (checkType) => {
  const aspect = aspectsData.aspects.find(a => a.id === checkType)
  return aspect ? aspect.id : null
}

// Обработка клика по проверке навыка - бросок d12
const onSkillCheckClick = (event) => {
  if (event.completed) return
  
  const character = getMyCharacter()
  if (!character) {
    console.warn('Нет персонажа для броска')
    return
  }
  
  // Бросок d12
  const roll = Math.floor(Math.random() * 12) + 1
  
  // Получаем модификатор персонажа для этого типа проверки
  const aspectId = getAspectIdByCheckType(event.checkType)
  const modifier = aspectId ? getCheckBonus(character, aspectId) : 0
  
  // Общий результат
  const total = roll + modifier
  
  // Определяем успех - просто сравниваем total со сложностью
  const success = total >= event.difficulty
  
  const result = {
    roll,
    modifier,
    total,
    success,
    resultType: 'normal',
    difficulty: event.difficulty
  }
  
  // Обновляем событие как завершённое
  sceneLogStore.updateEvent(event.id, {
    completed: true,
    result,
    completedBy: userStore.userId,
    completedAt: Date.now(),
    characterName: character.name,
    characterPortrait: character.portrait || null
  })
  
  // Отправляем результат мастеру
  sessionStore.sendToMaster({
    type: 'skill-check-result',
    eventId: event.id,
    result,
    characterName: character.name,
    characterPortrait: character.portrait || null
  })
  
  emit('skill-check-clicked', { ...event, result })
}

// Обработка клика по приглашению в бой
const onBattleInviteClick = () => {
  emit('go-to-battle')
}

// Обработка клика по созданию персонажа
const onCharacterInviteClick = (event) => {
  // Передаём и constraints и inviteId для обновления события после создания
  emit('create-character', { 
    constraints: event.constraints || {},
    inviteId: event.id
  })
}

// Получить название типа проверки по aspectId
const getCheckTypeName = (checkType) => {
  const aspect = aspectsData.aspects.find(a => a.id === checkType)
  return aspect?.check?.name || checkType
}

// Проверить, тёмный ли цвет (для выбора цвета текста)
const isDarkColor = (hexColor) => {
  if (!hexColor) return false
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance < 0.5
}

// Получение иконки для типа события
const getEventIcon = (type) => {
  const icons = {
    [SceneEventType.TEXT]: 'mdi:message-text',
    [SceneEventType.SYSTEM]: 'mdi:information',
    [SceneEventType.SKILL_CHECK]: 'mdi:dice-d20',
    [SceneEventType.SKILL_RESULT]: 'mdi:check-circle',
    [SceneEventType.BATTLE_INVITE]: 'mdi:sword-cross',
    [SceneEventType.ATTACK_RESULT]: 'mdi:sword',
    [SceneEventType.DAMAGE]: 'mdi:heart-broken',
    [SceneEventType.IMAGE]: 'mdi:image',
    [SceneEventType.IMPORTANT]: 'mdi:alert-circle',
    [SceneEventType.QUEST]: 'mdi:map-marker-star',
    [SceneEventType.ITEM_GIVE]: 'mdi:gift',
    [SceneEventType.ITEM_TAKE]: 'mdi:hand-back-left',
    [SceneEventType.ITEM_LOOT]: 'mdi:treasure-chest',
    [SceneEventType.CHARACTER_INVITE]: 'mdi:account-plus',
  }
  return icons[type] || 'mdi:circle'
}

// Получение цвета для типа события
const getEventColor = (type) => {
  const colors = {
    [SceneEventType.TEXT]: '#94a3b8',
    [SceneEventType.SYSTEM]: '#64748b',
    [SceneEventType.SKILL_CHECK]: '#f59e0b',
    [SceneEventType.SKILL_RESULT]: '#10b981',
    [SceneEventType.BATTLE_INVITE]: '#ef4444',
    [SceneEventType.ATTACK_RESULT]: '#ef4444',
    [SceneEventType.DAMAGE]: '#dc2626',
    [SceneEventType.IMAGE]: '#8b5cf6',
    [SceneEventType.IMPORTANT]: '#f59e0b',
    [SceneEventType.QUEST]: '#eab308',
    [SceneEventType.ITEM_GIVE]: '#22c55e',
    [SceneEventType.ITEM_TAKE]: '#f97316',
    [SceneEventType.ITEM_LOOT]: '#a855f7',
    [SceneEventType.CHARACTER_INVITE]: '#3b82f6',
  }
  return colors[type] || '#94a3b8'
}

// Проверка, можно ли взаимодействовать с событием
const isEventInteractive = (event) => {
  if (event.type === SceneEventType.SKILL_CHECK && !event.completed) {
    // Проверяем, наша ли это проверка
    // targetUserIds может быть null (для всех), массивом или undefined
    if (event.targetUserIds === null) return true // для всех
    if (Array.isArray(event.targetUserIds)) {
      return event.targetUserIds.includes(userStore.userId)
    }
    // Fallback на старое поле targetUserId
    return event.targetUserId === 'all' || event.targetUserId === userStore.userId
  }
  if (event.type === SceneEventType.BATTLE_INVITE) {
    if (event.targetUserIds === null) return true
    if (Array.isArray(event.targetUserIds)) {
      return event.targetUserIds.includes(userStore.userId)
    }
    return false
  }
  if (event.type === SceneEventType.CHARACTER_INVITE) {
    // Проверяем, не использовал ли уже текущий пользователь это приглашение
    const usedByCurrentUser = event.usedBy?.some(u => u.userId === userStore.userId)
    if (usedByCurrentUser) return false
    
    // Проверяем, адресовано ли нам
    if (event.targetUserIds === null) return true // для всех
    if (Array.isArray(event.targetUserIds)) {
      return event.targetUserIds.includes(userStore.userId)
    }
    // Fallback на старое поле targetUserId
    return event.targetUserId === 'all' || event.targetUserId === userStore.userId
  }
  if (event.type === SceneEventType.ITEM_GIVE && !event.accepted) {
    return event.targetUserId === userStore.userId
  }
  if (event.type === SceneEventType.ITEM_LOOT) {
    // Есть непринятые предметы
    return event.items.some(item => !item.claimedBy)
  }
  return false
}

// === Функции для CHARACTER_INVITE ===

// Проверить, использовал ли текущий пользователь приглашение
const hasUsedInvite = (event) => {
  return event.usedBy?.some(u => u.userId === userStore.userId)
}

// Получить созданного персонажа по приглашению (для текущего пользователя)
const getCreatedCharacterFromInvite = (event) => {
  const usage = event.usedBy?.find(u => u.userId === userStore.userId)
  return usage || null
}

// Получить статус доставки приглашения для мастера (по игрокам, не персонажам)
const getInviteDeliveryStatus = (event) => {
  if (!isMaster.value) return []
  
  // Получаем всех игроков из session store
  const allPlayers = sessionStore.allPlayers || []
  
  return allPlayers.map(player => {
    // Проверяем, адресовано ли приглашение этому игроку
    const isTargeted = event.targetUserIds === null || 
                       (Array.isArray(event.targetUserIds) && event.targetUserIds.includes(player.userId))
    
    if (!isTargeted) return null
    
    // Проверяем, использовал ли игрок приглашение
    const usage = event.usedBy?.find(u => u.userId === player.userId)
    
    return {
      userId: player.userId,
      alias: player.alias,
      avatar: player.avatar,
      online: player.online,
      delivered: event.deliveredTo?.includes(player.userId) || false,
      used: !!usage,
      createdCharacter: usage ? {
        id: usage.characterId,
        name: usage.characterName,
        portrait: usage.characterPortrait
      } : null
    }
  }).filter(Boolean)
}

// === Функции для мастера: статусы доставки ===

// Получить список всех персонажей для события (статусы доставки)
const getDeliveryStatus = (event) => {
  if (!isMaster.value) return []
  
  // Получаем всех персонажей игроков
  const allCharacters = charactersStore.allPlayerCharacters || []
  
  // Для каждого персонажа определяем статус
  return allCharacters.map(char => {
    // Проверяем, адресовано ли событие этому персонажу
    const isTargeted = !event.targetCharacterIds || 
                       event.targetCharacterIds === null ||
                       event.targetCharacterIds.includes(char.id)
    
    // Владелец персонажа
    const ownerConnection = sessionStore.connections?.find(c => c.userId === char.ownerId)
    const isOnline = ownerConnection?.conn?.open || false
    
    // Доставлено ли владельцу
    const wasDelivered = event.deliveredTo?.includes(char.ownerId) || false
    const isHidden = event.hiddenFrom?.includes(char.ownerId) || false
    
    // Получаем URL портрета персонажа
    const portraitUrl = char.portrait ? getPortraitUrl(char.portrait) : null
    
    return {
      characterId: char.id,
      characterName: char.name,
      characterPortrait: portraitUrl,
      ownerId: char.ownerId,
      ownerName: char.ownerNickname || ownerConnection?.alias || 'Игрок',
      online: isOnline,
      targeted: isTargeted,
      delivered: wasDelivered,
      hidden: isHidden
    }
  }).filter(c => c.targeted) // Показываем только целевых персонажей
}

// Обработка клика по статусу доставки
const handleDeliveryClick = (event, status, shiftKey) => {
  if (!isMaster.value) return
  
  if (status.hidden) {
    // Скрыто - показываем (и отправляем если нужно)
    toggleEventVisibility(event, status.ownerId, true)
  } else if (status.delivered) {
    // Доставлено и видимо - скрываем
    toggleEventVisibility(event, status.ownerId, false)
  } else {
    // Pending (не доставлено, не скрыто)
    if (shiftKey) {
      // Shift+Click - принудительная отправка
      resendToOwner(event, status.ownerId)
    } else {
      // Обычный клик - предварительное скрытие (pre-hide)
      preHideForOwner(event, status.ownerId)
    }
  }
}

// Предварительное скрытие события для владельца (до доставки)
const preHideForOwner = (event, ownerId) => {
  if (!isMaster.value) return
  
  const hiddenFrom = event.hiddenFrom || []
  if (!hiddenFrom.includes(ownerId)) {
    sceneLogStore.updateEvent(event.id, {
      hiddenFrom: [...hiddenFrom, ownerId]
    })
  }
}

// Переключить видимость события для персонажа/владельца (для мастера)
const toggleEventVisibility = (event, ownerId, currentlyHidden) => {
  if (!isMaster.value) return
  
  const hiddenFrom = event.hiddenFrom || []
  const deliveredTo = event.deliveredTo || []
  const connection = sessionStore.connections.find(c => c.userId === ownerId)
  
  if (currentlyHidden) {
    // Показываем событие игроку
    const newHiddenFrom = hiddenFrom.filter(id => id !== ownerId)
    const newDeliveredTo = deliveredTo.includes(ownerId) ? deliveredTo : [...deliveredTo, ownerId]
    
    sceneLogStore.updateEvent(event.id, {
      hiddenFrom: newHiddenFrom,
      deliveredTo: newDeliveredTo
    })
    
    // Отправляем событие игроку
    if (connection?.conn?.open) {
      connection.conn.send({
        type: 'scene-event',
        event: { ...event, hiddenFrom: newHiddenFrom, deliveredTo: newDeliveredTo }
      })
    }
  } else {
    // Скрываем событие от игрока
    if (!hiddenFrom.includes(ownerId)) {
      sceneLogStore.updateEvent(event.id, {
        hiddenFrom: [...hiddenFrom, ownerId]
      })
    }
    
    // Отправляем команду скрытия игроку
    if (connection?.conn?.open) {
      connection.conn.send({
        type: 'scene-event-hide',
        eventId: event.id
      })
    }
  }
}

// Переотправить событие владельцу персонажа (для тех кто был оффлайн)
const resendToOwner = (event, ownerId) => {
  if (!isMaster.value) return
  
  const connection = sessionStore.connections.find(c => c.userId === ownerId)
  if (connection?.conn?.open) {
    connection.conn.send({
      type: 'scene-event',
      event: event
    })
    
    // Обновляем deliveredTo
    const deliveredTo = event.deliveredTo || []
    if (!deliveredTo.includes(ownerId)) {
      sceneLogStore.updateEvent(event.id, {
        deliveredTo: [...deliveredTo, ownerId]
      })
    }
  }
}
</script>

<template>
  <div class="scene-log" :class="{ 'perspective-mode': isMaster && perspectiveUserId }">
    <!-- Индикатор режима перспективы -->
    <div v-if="isMaster && perspectiveUserId" class="perspective-indicator">
      <Icon icon="mdi:eye" />
      <span>Просмотр от: <strong>{{ perspectiveOptions.find(o => o.id === perspectiveUserId)?.name }}</strong></span>
      <button class="exit-perspective-btn" @click="setPerspective(null)">
        <Icon icon="mdi:close" />
        Выйти
      </button>
    </div>
    
    <!-- Фильтр перспективы для мастера -->
    <div v-if="isMaster && perspectiveOptions.length > 1" class="perspective-bar">
      <span class="perspective-label">Глазами:</span>
      <div class="perspective-options">
        <button
          v-for="option in perspectiveOptions"
          :key="option.id || 'all'"
          class="perspective-btn"
          :class="{ active: perspectiveUserId === option.id, offline: option.id && !option.online }"
          @click="setPerspective(option.id)"
        >
          <div class="perspective-avatar-wrapper">
            <UserAvatar 
              v-if="option.avatar" 
              :avatar="option.avatar" 
              size="xs" 
            />
            <Icon v-else icon="mdi:account-group" class="all-icon" />
            <span v-if="option.id && !option.online" class="offline-dot" title="Оффлайн"></span>
          </div>
          <span>{{ option.name }}</span>
        </button>
      </div>
      <!-- Переключатель показа статусов доставки -->
      <button 
        class="delivery-toggle-btn"
        :class="{ active: showDeliveryGrid }"
        @click="showDeliveryGrid = !showDeliveryGrid"
        :title="showDeliveryGrid ? 'Скрыть статусы доставки' : 'Показать статусы доставки'"
      >
        <Icon :icon="showDeliveryGrid ? 'mdi:account-check' : 'mdi:account-off'" />
      </button>
      
      <!-- Кнопка инструментов лога -->
      <button 
        class="log-tools-btn"
        :class="{ active: showMasterTools }"
        @click="showMasterTools = !showMasterTools"
        title="Инструменты лога"
      >
        <Icon icon="mdi:cog" />
      </button>
    </div>
    
    <!-- Панель инструментов мастера -->
    <Transition name="slide-down">
      <div v-if="isMaster && showMasterTools" class="master-tools-panel">
        <div class="tools-header">
          <span class="tools-title">Управление логом</span>
          <span class="events-count">{{ totalEventsCount }} событий</span>
        </div>
        <div class="tools-actions">
          <button class="tool-btn" @click="onExportLog" title="Экспортировать лог в JSON">
            <Icon icon="mdi:download" />
            <span>Экспорт</span>
          </button>
          <button class="tool-btn tool-btn-danger" @click="onClearLogClick" title="Очистить лог">
            <Icon icon="mdi:delete-outline" />
            <span>Очистить</span>
          </button>
        </div>
      </div>
    </Transition>
    
    <!-- Диалог подтверждения очистки -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showClearConfirm" class="confirm-overlay" @click.self="onCancelClear">
          <div class="confirm-dialog">
            <div class="confirm-icon">
              <Icon icon="mdi:alert-circle" />
            </div>
            <h3 class="confirm-title">Очистить лог?</h3>
            <p class="confirm-text">
              Будет удалено <strong>{{ totalEventsCount }}</strong> событий. 
              Это действие нельзя отменить.
            </p>
            <div class="confirm-actions">
              <button class="confirm-btn confirm-btn-secondary" @click="onCancelClear">
                Отмена
              </button>
              <button class="confirm-btn confirm-btn-primary" @click="onExportAndClear">
                <Icon icon="mdi:download" />
                Сохранить и очистить
              </button>
              <button class="confirm-btn confirm-btn-danger" @click="onConfirmClear">
                <Icon icon="mdi:delete" />
                Очистить
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    
    <!-- Изображение сцены для мастера (отображается внутри лога) -->
    <div v-if="isMaster && hasActiveImage && currentImage" class="scene-image-inline">
      <img :src="currentImage.url" :alt="currentImage.description" class="scene-image-preview" />
      <div class="scene-image-info">
        <span class="scene-image-desc">{{ currentImage.description || 'Изображение сцены' }}</span>
        <button class="hide-image-btn" @click="emit('hide-image')" title="Скрыть изображение">
          <Icon icon="mdi:eye-off" />
        </button>
      </div>
    </div>
    
    <!-- Лог событий -->
    <div 
      ref="logContainerRef"
      class="events-log"
      @scroll="onLogScroll"
    >
      <!-- Кнопка загрузки истории (вверху) -->
      <div v-if="hasMoreEvents" class="load-more-container">
        <button class="load-more-btn" @click="sceneLogStore.loadMoreEvents()">
          <Icon icon="mdi:history" />
          <span>Загрузить ещё ({{ remainingEventsCount }})</span>
        </button>
      </div>
      
      <div v-if="paginatedEvents.length === 0" class="empty-log">
        <Icon icon="mdi:book-open-variant" class="empty-icon" />
        <p>История событий пуста</p>
        <p class="empty-hint">Здесь будут отображаться события игры</p>
      </div>
      
      <TransitionGroup name="event-list" tag="div" class="events-list">
        <div 
          v-for="event in paginatedEvents" 
          :key="event.id"
          class="event-item"
          :class="[
            `event-${event.type}`,
            { 
              interactive: isEventInteractive(event),
              'hidden-for-perspective': isHiddenForPerspective(event)
            }
          ]"
          :style="{ '--event-color': getEventColor(event.type) }"
        >
          <!-- ОСОБЫЕ СЛУЧАИ: полноширинные события -->
          
          <!-- Приглашение в бой -->
          <template v-if="event.type === SceneEventType.BATTLE_INVITE">
            <div class="event-row" :class="{ 'event-row-fullwidth': !isMaster }">
              <div class="event-content" :class="{ 'event-content-fullwidth': !isMaster }">
                <div class="event-battle" @click.stop="onBattleInviteClick">
                  <div class="battle-lines"></div>
                  <Icon icon="mdi:sword-cross" class="battle-icon" />
                  <div class="battle-lines"></div>
                </div>
                <p v-if="event.description" class="battle-desc">{{ event.description }}</p>
              </div>
              <!-- Статусы доставки для мастера -->
              <div v-if="isMaster && showDeliveryGrid" class="delivery-grid">
                <div 
                  v-for="status in getDeliveryStatus(event)"
                  :key="status.characterId"
                  class="delivery-face"
                  :class="{ 
                    delivered: status.delivered && !status.hidden,
                    'is-hidden': status.hidden && status.delivered,
                    'pre-hidden': status.hidden && !status.delivered,
                    pending: !status.delivered && !status.hidden,
                    offline: !status.online
                  }"
                  @click.stop="handleDeliveryClick(event, status, $event.shiftKey)"
                >
                  <img v-if="status.characterPortrait" :src="status.characterPortrait" class="face-img" />
                  <UserAvatar v-else-if="status.avatar" :avatar="status.avatar" size="sm" class="face-avatar" />
                  <div v-else class="face-placeholder">{{ (status.characterName || status.name || '?')[0].toUpperCase() }}</div>
                  <div class="face-tooltip">
                    <div class="tooltip-char">{{ status.characterName || 'Без персонажа' }}</div>
                    <div class="tooltip-player">Игрок: {{ status.ownerName }}</div>
                    <div v-if="!status.online" class="tooltip-offline">офлайн</div>
                    <div class="tooltip-status">
                      <template v-if="status.hidden && status.delivered">Скрыто • Клик: показать</template>
                      <template v-else-if="status.hidden && !status.delivered">Будет скрыто • Клик: отмена</template>
                      <template v-else-if="status.delivered">Доставлено • Клик: скрыть</template>
                      <template v-else>Ожидает • Клик: скрыть, Shift: отправить</template>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
          
          <!-- Изображение - полноширинный -->
          <template v-else-if="event.type === SceneEventType.IMAGE">
            <div class="event-row" :class="{ 'event-row-fullwidth': !isMaster }">
              <div class="event-content" :class="{ 'event-content-fullwidth': !isMaster }">
                <div 
                  class="event-fullwidth-action" 
                  :class="{ viewing: currentImage?.url === event.url }"
                  @click.stop="currentImage?.url === event.url ? emit('hide-image', event) : emit('view-image', event)"
                >
                  <div class="fullwidth-lines"></div>
                  <Icon 
                    :icon="currentImage?.url === event.url ? 'mdi:eye-off' : 'mdi:image'" 
                    class="fullwidth-icon" 
                  />
                  <div class="fullwidth-lines"></div>
                </div>
                <p class="fullwidth-desc">{{ event.description || 'Изображение' }}</p>
              </div>
              <!-- Статусы доставки -->
              <div v-if="isMaster && showDeliveryGrid" class="delivery-grid">
                <div 
                  v-for="status in getDeliveryStatus(event)"
                  :key="status.characterId"
                  class="delivery-face"
                  :class="{ 
                    delivered: status.delivered && !status.hidden,
                    'is-hidden': status.hidden && status.delivered,
                    'pre-hidden': status.hidden && !status.delivered,
                    pending: !status.delivered && !status.hidden,
                    offline: !status.online
                  }"
                  @click.stop="handleDeliveryClick(event, status, $event.shiftKey)"
                >
                  <img v-if="status.characterPortrait" :src="status.characterPortrait" class="face-img" />
                  <UserAvatar v-else-if="status.avatar" :avatar="status.avatar" size="sm" class="face-avatar" />
                  <div v-else class="face-placeholder">{{ (status.characterName || status.name || '?')[0].toUpperCase() }}</div>
                </div>
              </div>
            </div>
          </template>
          
          <!-- Приглашение создать персонажа - полноширинный -->
          <template v-else-if="event.type === SceneEventType.CHARACTER_INVITE">
            <div class="event-row event-row-invite" :class="{ 'event-row-fullwidth': !isMaster }">
              <div class="event-content" :class="{ 'event-content-fullwidth': !isMaster }">
                <!-- Для игрока: проверяем использовал ли он приглашение -->
                <template v-if="!isMaster">
                  <!-- Если игрок уже использовал приглашение - показываем созданного персонажа -->
                  <template v-if="hasUsedInvite(event)">
                    <div class="invite-used">
                      <CharacterPortrait 
                        v-if="getCreatedCharacterFromInvite(event)?.characterPortrait"
                        :portrait="getCreatedCharacterFromInvite(event).characterPortrait"
                        :size="48"
                        :showBorder="true"
                        class="invite-portrait"
                      />
                      <div v-else class="invite-portrait-placeholder">
                        {{ (getCreatedCharacterFromInvite(event)?.characterName || '?')[0].toUpperCase() }}
                      </div>
                      <span class="invite-used-name">{{ getCreatedCharacterFromInvite(event)?.characterName || 'Персонаж создан' }}</span>
                    </div>
                  </template>
                  <!-- Если игрок ещё не использовал - кнопка создания -->
                  <template v-else-if="isEventInteractive(event)">
                    <div 
                      class="event-fullwidth-action" 
                      @click.stop="onCharacterInviteClick(event)"
                    >
                      <div class="fullwidth-lines blue"></div>
                      <Icon icon="mdi:account-plus" class="fullwidth-icon blue" />
                      <div class="fullwidth-lines blue"></div>
                    </div>
                    <p class="fullwidth-desc">Создайте персонажа!</p>
                  </template>
                  <!-- Если приглашение не для этого игрока -->
                  <template v-else>
                    <div class="invite-not-for-you">
                      <Icon icon="mdi:account-plus-outline" class="invite-icon-disabled" />
                      <span>Приглашение не для вас</span>
                    </div>
                  </template>
                </template>
                
                <!-- Для мастера: показываем кто использовал приглашение -->
                <template v-else>
                  <div class="invite-master-view">
                    <div class="invite-header">
                      <Icon icon="mdi:account-plus" class="invite-header-icon" />
                      <span>Приглашение создать персонажа</span>
                    </div>
                    <!-- Список использований -->
                    <div v-if="event.usedBy && event.usedBy.length > 0" class="invite-usages">
                      <div 
                        v-for="usage in event.usedBy" 
                        :key="usage.characterId" 
                        class="invite-usage"
                      >
                        <CharacterPortrait 
                          v-if="usage.characterPortrait"
                          :portrait="usage.characterPortrait"
                          :size="32"
                          :showBorder="true"
                          class="usage-portrait"
                        />
                        <div v-else class="usage-portrait-placeholder">
                          {{ (usage.characterName || '?')[0].toUpperCase() }}
                        </div>
                        <span class="usage-name">{{ usage.characterName }}</span>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
              
              <!-- Статусы доставки для мастера (по игрокам) -->
              <div v-if="isMaster && showDeliveryGrid" class="delivery-grid">
                <div 
                  v-for="status in getInviteDeliveryStatus(event)"
                  :key="status.userId"
                  class="delivery-face"
                  :class="{ 
                    delivered: status.delivered && !status.used,
                    used: status.used,
                    pending: !status.delivered && !status.used,
                    offline: !status.online
                  }"
                  :title="status.used ? `${status.alias}: ${status.createdCharacter?.name}` : status.alias"
                >
                  <!-- Если использовал - портрет персонажа -->
                  <img 
                    v-if="status.used && status.createdCharacter?.portrait" 
                    :src="getPortraitUrl(status.createdCharacter.portrait)" 
                    class="face-img" 
                  />
                  <!-- Иначе аватар игрока -->
                  <UserAvatar v-else-if="status.avatar" :avatar="status.avatar" size="sm" class="face-avatar" />
                  <div v-else class="face-placeholder">{{ (status.alias || '?')[0].toUpperCase() }}</div>
                </div>
              </div>
            </div>
          </template>
          
          <!-- Все остальные события: универсальный ряд -->
          <template v-else>
            <div class="event-row">
              <!-- Контент события -->
              <div class="event-content">
              
                <!-- Системное сообщение -->
                <template v-if="event.type === SceneEventType.SYSTEM">
                  <div class="event-system">
                    <Icon :icon="getEventIcon(event.type)" class="event-icon" />
                    <span>{{ event.text }}</span>
                  </div>
                </template>
              
                <!-- Текстовое сообщение от мастера -->
                <template v-else-if="event.type === SceneEventType.TEXT">
                  <div class="event-text-message">
                    <p class="text-content">{{ event.text }}</p>
                    <span class="text-time">{{ formatTime(event.time) }}</span>
                  </div>
                </template>
              
                <!-- Проверка навыка -->
                <template v-else-if="event.type === SceneEventType.SKILL_CHECK">
                  <div 
                    class="event-check"
                    :class="{ 
                      success: event.completed && event.result?.success,
                      failure: event.completed && event.result && !event.result.success,
                      'auto-success': event.result?.resultType === 'guaranteed-success',
                      'auto-failure': event.result?.resultType === 'guaranteed-fail'
                    }"
                    :style="{ '--aspect-color': getAspectColor(event.checkType), '--diff-color': getDifficultyData(event.difficulty).color }"
                    @click.stop="isEventInteractive(event) && onSkillCheckClick(event)"
                  >
                    <div class="check-main">
                      <!-- Иконка типа проверки в круге -->
                      <div class="check-icon-wrapper">
                        <Icon :icon="getCheckTypeIcon(event.checkType)" class="check-type-icon" />
                      </div>
                    
                      <!-- Портрет персонажа (если завершено) -->
                      <div v-if="event.completed && (getCheckCharacterPortrait(event) || event.characterName)" class="check-character">
                        <img 
                          v-if="getCheckCharacterPortrait(event)" 
                          :src="getCheckCharacterPortrait(event)" 
                          :alt="event.characterName"
                          class="character-portrait"
                        />
                        <div v-else class="character-initial">
                          {{ (event.characterName || '?')[0].toUpperCase() }}
                        </div>
                      </div>
                    
                      <!-- Сложность (текстовое название) -->
                      <div class="check-difficulty">
                        {{ getDifficultyName(event.difficulty) }}
                      </div>
                    
                      <!-- Результат (если завершено) -->
                      <div v-if="event.completed && event.result" class="check-result">
                        <template v-if="event.result.resultType === 'guaranteed-success'">
                          <span class="result-label auto-success">Автоуспех</span>
                        </template>
                        <template v-else-if="event.result.resultType === 'guaranteed-fail'">
                          <span class="result-label auto-fail">Автопровал</span>
                        </template>
                        <template v-else>
                          <span class="result-label" :class="event.result.success ? 'success' : 'fail'">
                            {{ event.result.success ? 'Успех' : 'Провал' }}
                          </span>
                        </template>
                      </div>
                    </div>
                    
                    <!-- Детали результата (бросок + модификатор) -->
                    <div v-if="event.completed && event.result && event.result.resultType === 'normal'" class="check-details">
                      <span class="check-roll">{{ event.result.roll }}</span>
                      <span v-if="event.result.modifier !== 0" class="check-modifier">
                        {{ event.result.modifier >= 0 ? '+' : '' }}{{ event.result.modifier }}
                      </span>
                      <span class="check-equals">=</span>
                      <span class="check-total">{{ event.result.total }}</span>
                      <span class="check-vs">vs</span>
                      <span class="check-target">{{ event.result.difficulty }}</span>
                    </div>
                  
                    <!-- Описание проверки (если есть) -->
                    <p v-if="event.description" class="check-desc">{{ event.description }}</p>
                  </div>
                </template>
              
                <!-- Важное - как текст, но с жёлтым фоном и иконкой -->
                <template v-else-if="event.type === SceneEventType.IMPORTANT">
                  <div class="event-important-message">
                    <Icon :icon="event.icon || 'mdi:alert-circle'" class="important-icon" />
                    <div class="important-body">
                      <p class="important-content">{{ event.text }}</p>
                      <span class="important-time">{{ formatTime(event.time) }}</span>
                    </div>
                  </div>
                </template>
              
                <!-- Квест -->
                <template v-else-if="event.type === SceneEventType.QUEST">
                  <div class="quest-container" @click.stop="toggleQuestExpanded(event.id)">
                    <div class="quest-header">
                      <Icon icon="mdi:map-marker-star" class="quest-icon" />
                      <span class="quest-title">{{ event.title }}</span>
                      <Icon 
                        :icon="expandedQuests.has(event.id) ? 'mdi:chevron-up' : 'mdi:chevron-down'" 
                        class="quest-chevron" 
                      />
                    </div>
                    <!-- Collapsible details -->
                    <div v-if="expandedQuests.has(event.id)" class="quest-details">
                      <p v-if="event.description" class="quest-desc">{{ event.description }}</p>
                      <ul v-if="event.objectives?.length" class="quest-objectives">
                        <li 
                          v-for="(obj, idx) in event.objectives" 
                          :key="idx"
                          :class="{ completed: obj.completed }"
                        >
                          <Icon :icon="obj.completed ? 'mdi:checkbox-marked-circle' : 'mdi:checkbox-blank-circle-outline'" />
                          {{ obj.text }}
                        </li>
                      </ul>
                    </div>
                  </div>
                </template>
              
                <!-- Выдача предмета -->
                <template v-else-if="event.type === SceneEventType.ITEM_GIVE">
                  <div class="event-item-give">
                    <Icon icon="mdi:gift" class="item-icon" />
                    <div class="item-content">
                      <span class="item-label">Получен предмет:</span>
                      <div class="item-list">
                        <span 
                          v-for="item in event.items" 
                          :key="item.id" 
                          class="item-badge"
                        >
                          {{ item.name }} <template v-if="item.quantity > 1">x{{ item.quantity }}</template>
                        </span>
                      </div>
                    </div>
                  </div>
                </template>
              
              <!-- Лут для группы -->
              <template v-else-if="event.type === SceneEventType.ITEM_LOOT">
                <div class="event-item-loot">
                  <div class="loot-header">
                    <Icon icon="mdi:treasure-chest" class="loot-icon" />
                    <span class="loot-title">Найден лут!</span>
                  </div>
                  <p v-if="event.description" class="loot-desc">{{ event.description }}</p>
                  <div class="loot-items">
                    <div 
                      v-for="item in event.items" 
                      :key="item.id" 
                      class="loot-item"
                      :class="{ claimed: item.claimedBy }"
                    >
                      <span class="loot-item-name">{{ item.name }}</span>
                      <span v-if="item.claimedBy" class="loot-claimed-by">
                        {{ getSenderInfo(item.claimedBy).name }}
                      </span>
                      <button v-else class="loot-claim-btn">Взять</button>
                    </div>
                  </div>
                </div>
              </template>
              
              <!-- Дефолтное отображение -->
              <template v-else>
                <div class="event-default">
                  <Icon :icon="getEventIcon(event.type)" class="event-icon" />
                  <span>{{ event.text || event.description || 'Событие' }}</span>
                </div>
              </template>
              
            </div>
            
            <!-- Статусы доставки для мастера (справа) -->
            <div v-if="isMaster && showDeliveryGrid" class="delivery-grid">
              <div 
                v-for="status in getDeliveryStatus(event)"
                :key="status.characterId"
                class="delivery-face"
                :class="{ 
                  delivered: status.delivered && !status.hidden,
                  'is-hidden': status.hidden && status.delivered,
                  'pre-hidden': status.hidden && !status.delivered,
                  pending: !status.delivered && !status.hidden,
                  offline: !status.online
                }"
                @click.stop="handleDeliveryClick(event, status, $event.shiftKey)"
              >
                <img v-if="status.characterPortrait" :src="status.characterPortrait" class="face-img" />
                <UserAvatar v-else-if="status.avatar" :avatar="status.avatar" size="sm" class="face-avatar" />
                <div v-else class="face-placeholder">{{ (status.characterName || status.name || '?')[0].toUpperCase() }}</div>
                <div class="face-tooltip">
                  <div class="tooltip-char">{{ status.characterName || 'Без персонажа' }}</div>
                  <div class="tooltip-player">Игрок: {{ status.ownerName }}</div>
                  <div v-if="!status.online" class="tooltip-offline">офлайн</div>
                  <div class="tooltip-status">
                    <template v-if="status.hidden && status.delivered">Скрыто • Клик: показать</template>
                    <template v-else-if="status.hidden && !status.delivered">Будет скрыто • Клик: отмена</template>
                    <template v-else-if="status.delivered">Доставлено • Клик: скрыть</template>
                    <template v-else>Ожидает • Клик: скрыть, Shift: отправить</template>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </template>
        </div>
      </TransitionGroup>
    </div>
  </div>
</template>

<style scoped>
.scene-log {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0f172a;
}

/* Изображение сцены для мастера (внутри лога) */
.scene-image-inline {
  padding: 12px;
  background: rgba(30, 41, 59, 0.6);
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  flex-shrink: 0;
}

.scene-image-preview {
  width: 100%;
  max-height: 180px;
  object-fit: contain;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.5);
}

.scene-image-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.scene-image-desc {
  font-size: 12px;
  color: #94a3b8;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hide-image-btn {
  background: none;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 6px;
  padding: 4px 8px;
  color: #64748b;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.hide-image-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #ef4444;
}

/* Режим перспективы */
.scene-log.perspective-mode {
  border: 2px solid rgba(139, 92, 246, 0.5);
  border-radius: 12px;
}

.perspective-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2));
  border-bottom: 1px solid rgba(139, 92, 246, 0.3);
  font-size: 13px;
  color: #c4b5fd;
  flex-shrink: 0;
}

.perspective-indicator strong {
  color: #e0e7ff;
}

.exit-perspective-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 4px 10px;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 6px;
  color: #fca5a5;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.exit-perspective-btn:hover {
  background: rgba(239, 68, 68, 0.3);
  border-color: #ef4444;
  color: #ef4444;
}

/* Панель выбора перспективы */
.perspective-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: rgba(30, 41, 59, 0.8);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  flex-shrink: 0;
}

.perspective-label {
  font-size: 13px;
  color: #64748b;
  white-space: nowrap;
}

.perspective-options {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.perspective-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  color: #94a3b8;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.perspective-btn:hover {
  border-color: rgba(148, 163, 184, 0.4);
}

.perspective-btn.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

.perspective-btn .all-icon {
  font-size: 16px;
}

.perspective-avatar-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.perspective-btn.offline {
  opacity: 0.6;
}

.offline-dot {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  background: #ef4444;
  border-radius: 50%;
  border: 1.5px solid #0f172a;
}

/* Кнопка переключения видимости статусов доставки */
.delivery-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin-left: auto;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: #64748b;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
}

.delivery-toggle-btn:hover {
  border-color: rgba(148, 163, 184, 0.4);
  color: #94a3b8;
}

.delivery-toggle-btn.active {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.4);
  color: #22c55e;
}

/* Область изображения */
.scene-image-area {
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
  background: #1e293b;
}

.scene-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scene-image-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
}

.scene-image-description {
  margin: 0;
  font-size: 13px;
  color: #e2e8f0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

/* Анимация изображения */
.image-slide-enter-active,
.image-slide-leave-active {
  transition: all 0.3s ease;
}

.image-slide-enter-from,
.image-slide-leave-to {
  height: 0 !important;
  opacity: 0;
}

/* Лог событий */
.events-log {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  min-height: 0; /* Важно для правильного скролла во flex контейнере */
}

.events-log .events-list {
  margin-top: auto; /* Прижимаем содержимое к низу, но сохраняем скролл */
}

/* Кнопка загрузки истории */
.load-more-container {
  display: flex;
  justify-content: center;
  padding: 8px 0 16px;
  flex-shrink: 0;
}

.load-more-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 20px;
  color: #60a5fa;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.load-more-btn:hover {
  background: rgba(59, 130, 246, 0.25);
  border-color: rgba(59, 130, 246, 0.5);
}

.load-more-btn:active {
  transform: scale(0.97);
}

.load-more-btn .iconify {
  font-size: 16px;
}

.empty-log {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: #64748b;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-log p {
  margin: 4px 0;
}

.empty-hint {
  font-size: 12px;
  opacity: 0.7;
}

/* Список событий */
.events-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Анимации списка */
.event-list-enter-active,
.event-list-leave-active {
  transition: all 0.3s ease;
}

.event-list-enter-from {
  opacity: 0;
  transform: translateY(20px);
}

.event-list-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.event-item.interactive {
  cursor: pointer;
}

.event-item.interactive:active {
  transform: scale(0.98);
}

/* Системное сообщение */
.event-system {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: #64748b;
  font-style: italic;
}

.event-system .event-icon {
  font-size: 14px;
}

/* Текстовое сообщение */
.event-message {
  padding: 10px 12px;
}

.event-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.event-sender {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
}

.event-time {
  font-size: 11px;
  color: #475569;
}

/* Базовый стиль события */
.event-item {
  border-radius: 8px;
  overflow: visible; /* Разрешаем выход тултипов за границы */
  position: relative;
}

/* Событие скрыто для выбранной перспективы */
.event-item.hidden-for-perspective {
  opacity: 0.35;
  position: relative;
}

/* Контент события становится некликабельным, но delivery-grid остаётся */
.event-item.hidden-for-perspective .event-row,
.event-item.hidden-for-perspective .event-content {
  pointer-events: none;
}

/* Delivery-grid остаётся кликабельным */
.event-item.hidden-for-perspective .delivery-grid {
  pointer-events: auto;
  opacity: 1;
}

.event-item.hidden-for-perspective::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 10px,
    rgba(239, 68, 68, 0.1) 10px,
    rgba(239, 68, 68, 0.1) 20px
  );
  pointer-events: none;
  z-index: 1;
}

/* Delivery-grid поверх эффекта */
.event-item.hidden-for-perspective .delivery-grid {
  z-index: 2;
}

/* Универсальный ряд события */
.event-row {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  gap: 12px;
}

/* Полноширинный ряд (для битвы) */
.event-row-fullwidth {
  flex-direction: column;
  align-items: stretch;
  padding: 16px 12px;
}

/* Контент события */
.event-content {
  flex: 1;
  min-width: 0;
  max-width: calc(100% - 100px); /* Оставляем место для delivery-grid */
}

/* Полноширинный контент (для игроков) */
.event-content-fullwidth {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Сетка статусов доставки - фиксированная ширина справа */
.delivery-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  padding: 4px;
  flex-shrink: 0;
  width: 80px; /* Фиксированная ширина */
  justify-items: center;
}

/* Абсолютная позиция для битвы */
.delivery-grid-absolute {
  position: absolute;
  top: 8px;
  right: 8px;
}

/* Расширяем до 3 колонок для 5+ игроков */
.delivery-grid:has(.delivery-face:nth-child(5)) {
  grid-template-columns: repeat(3, 1fr);
}

.delivery-face {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 2px solid transparent;
}

.delivery-face:hover {
  transform: scale(1.1);
  z-index: 10;
}

/* Статусы: цветные обводки */
.delivery-face.pending {
  border-color: #64748b;
  opacity: 0.5;
}

.delivery-face.delivered {
  border-color: #22c55e;
}

.delivery-face.is-hidden {
  border-color: #ef4444;
  opacity: 0.7;
}

/* Pre-hidden: скрыто до доставки - пунктирная красная обводка */
.delivery-face.pre-hidden {
  border-color: #ef4444;
  border-style: dashed;
  opacity: 0.5;
}

.delivery-face.offline {
  filter: grayscale(0.5);
}

.face-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}

.face-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.face-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #334155;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
}

/* Тултип при наведении */
.face-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0; /* Выравниваем по правому краю, чтобы не выходить за границы */
  transform: none;
  display: none;
  padding: 8px 12px;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  white-space: nowrap;
  z-index: 100;
  text-align: center;
}

.delivery-face:hover .face-tooltip {
  display: block;
}

.tooltip-char {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.tooltip-player {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
}

.tooltip-offline {
  font-size: 10px;
  color: #64748b;
  font-style: italic;
  margin-top: 2px;
}

.tooltip-status {
  font-size: 10px;
  color: #94a3b8;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

/* ==================== */
/* НОВЫЕ СТИЛИ СОБЫТИЙ */
/* ==================== */

/* Текстовое сообщение от мастера - без левой полосы */
.event-text-message {
  padding: 10px 14px;
  background: rgba(30, 41, 59, 0.8);
  border-radius: 8px;
}

.event-text-message .text-content {
  margin: 0;
  font-size: 14px;
  color: #e2e8f0;
  line-height: 1.5;
}

.event-text-message .text-time {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: #475569;
}

/* Приглашение в бой - от края до края с линиями */
.event-battle {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px 0;
  cursor: pointer;
  width: 100%;
}

.event-battle:active {
  transform: scale(0.97);
}

.battle-lines {
  flex: 1;
  height: 2px;
  background: linear-gradient(90deg, transparent, #ef4444, transparent);
}

.event-battle .battle-icon {
  font-size: 48px;
  color: #ef4444;
  filter: drop-shadow(0 0 12px rgba(239, 68, 68, 0.5));
  flex-shrink: 0;
}

.battle-desc {
  text-align: center;
  margin: -10px 0 0;
  font-size: 26px;
  color: #ef4444;
  font-weight: 600;
}

/* Универсальные стили для fullwidth событий (изображение, создание персонажа) */
.event-fullwidth-action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 12px 0;
  cursor: pointer;
  width: 100%;
}

.event-fullwidth-action:active {
  transform: scale(0.97);
}

/* По умолчанию - очень нейтральный для изображений */
.fullwidth-lines {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, #64748b, transparent);
}

/* Голубой для создания персонажа */
.fullwidth-lines.blue {
  height: 2px;
  background: linear-gradient(90deg, transparent, #38bdf8, transparent);
}

/* По умолчанию - очень нейтральный для изображений */
.fullwidth-icon {
  font-size: 36px;
  color: #64748b;
  filter: none;
  flex-shrink: 0;
}

/* Голубой для создания персонажа */
.fullwidth-icon.blue {
  color: #38bdf8;
  filter: drop-shadow(0 0 12px rgba(56, 189, 248, 0.5));
}

.fullwidth-desc {
  text-align: center;
  margin: -10px 0 0;
  font-size: 18px;
  color: #e2e8f0;
  font-weight: 500;
}

/* При просмотре изображения - красный */
.event-fullwidth-action.viewing .fullwidth-icon {
  color: #94a3b8;
  filter: drop-shadow(0 0 12px rgba(148, 163, 184, 0.5));
}

.event-fullwidth-action.viewing ~ .fullwidth-desc,
.event-item.event-image .fullwidth-desc {
  color: #94a3b8;
}

/* Создание персонажа - текст голубой */
.event-item.event-character-invite .fullwidth-desc {
  color: #38bdf8;
}

/* === Приглашение создать персонажа === */

.event-row-invite {
  min-height: 60px;
}

/* Использованное приглашение - показываем созданного персонажа */
.invite-used {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 12px;
}

.invite-portrait {
  flex-shrink: 0;
}

.invite-portrait-placeholder {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: #22c55e;
  flex-shrink: 0;
}

.invite-used-name {
  font-size: 16px;
  font-weight: 600;
  color: #22c55e;
}

/* Приглашение не для этого игрока */
.invite-not-for-you {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  color: #64748b;
  font-size: 13px;
}

.invite-icon-disabled {
  width: 20px;
  height: 20px;
  opacity: 0.5;
}

/* Вид для мастера */
.invite-master-view {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.invite-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #3b82f6;
  font-size: 13px;
  font-weight: 500;
}

.invite-header-icon {
  width: 18px;
  height: 18px;
}

/* Список созданных персонажей */
.invite-usages {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.invite-usage {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 4px;
  background: rgba(34, 197, 94, 0.15);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: 20px;
}

.usage-portrait {
  flex-shrink: 0;
}

.usage-portrait-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(34, 197, 94, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #22c55e;
}

.usage-name {
  font-size: 12px;
  font-weight: 500;
  color: #22c55e;
}

/* Delivery face для использованных приглашений */
.delivery-face.used {
  border-color: #22c55e;
  background: rgba(34, 197, 94, 0.15);
}

.delivery-face.used::after {
  content: '';
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 10px;
  height: 10px;
  background: #22c55e;
  border-radius: 50%;
  border: 2px solid #0f172a;
}

.event-fullwidth-action.accepted {
  opacity: 0.6;
  cursor: default;
}

.event-fullwidth-action.accepted .fullwidth-icon {
  color: #22c55e;
  filter: drop-shadow(0 0 12px rgba(34, 197, 94, 0.5));
}

@keyframes battle-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

/* Проверка навыка - новый дизайн */
.event-check {
  display: flex;
  flex-direction: column;
  padding: 8px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.event-check:active {
  transform: scale(0.98);
}

.event-check.success {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.05));
}

.event-check.failure {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
}

.event-check.auto-success {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1));
}

.event-check.auto-failure {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1));
}

.check-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* Иконка типа проверки в круге */
.check-icon-wrapper {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--aspect-color, #f59e0b);
  border-radius: 50%;
  flex-shrink: 0;
}

.check-icon-wrapper .check-type-icon {
  font-size: 22px;
  color: #ffffff;
}

.check-character {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
}

.check-character .character-portrait {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(148, 163, 184, 0.3);
}

.check-character .character-initial {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #334155;
  border-radius: 50%;
  font-size: 16px;
  font-weight: 700;
  color: #e2e8f0;
}

.check-difficulty {
  font-size: 14px;
  font-weight: 600;
  color: var(--diff-color, #f59e0b);
}

/* Детали результата */
.check-details {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding-left: 52px;
  font-size: 12px;
  color: #94a3b8;
}

.check-roll {
  font-weight: 600;
  color: #e2e8f0;
}

.check-modifier {
  color: #64748b;
}

.check-equals {
  color: #475569;
}

.check-total {
  font-weight: 700;
  color: #e2e8f0;
}

.check-vs {
  color: #475569;
  font-style: italic;
}

.check-target {
  color: var(--aspect-color, #f59e0b);
  font-weight: 600;
}

.check-result {
  margin-left: auto;
}

.check-result .result-label {
  font-size: 13px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
}

.check-result .result-label.success {
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
}

.check-result .result-label.fail {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.check-result .result-label.auto-success {
  background: rgba(34, 197, 94, 0.3);
  color: #22c55e;
}

.check-result .result-label.auto-fail {
  background: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}

.check-desc {
  margin: 8px 0 0;
  font-size: 12px;
  color: #94a3b8;
  padding-left: 52px;
}

/* Важное сообщение - как текст, но с жёлтым фоном и иконкой */
.event-important-message {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(234, 179, 8, 0.2);
  border-radius: 8px;
}

.event-important-message .important-icon {
  font-size: 20px;
  color: #eab308;
  flex-shrink: 0;
  margin-top: 2px;
}

.event-important-message .important-body {
  flex: 1;
}

.event-important-message .important-content {
  margin: 0;
  font-size: 14px;
  color: #e2e8f0;
  line-height: 1.5;
}

.event-important-message .important-time {
  display: block;
  margin-top: 6px;
  font-size: 11px;
  color: #eab308;
}

/* Квест - жёлтый градиент на внешнем контейнере */
.event-item.event-quest .event-content {
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(234, 179, 8, 0.05));
  border-radius: 8px;
}

/* Внутренний контейнер квеста */
.quest-container {
  padding: 12px 16px;
  cursor: pointer;
}

.quest-container .quest-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.quest-container .quest-icon {
  font-size: 24px;
  color: #eab308;
}

.quest-container .quest-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}

.quest-container .quest-chevron {
  font-size: 20px;
  color: #64748b;
  transition: transform 0.2s ease;
}

.quest-container .quest-details {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.quest-container .quest-desc {
  margin: 0 0 10px;
  font-size: 13px;
  color: #94a3b8;
  line-height: 1.4;
}

.quest-container .quest-objectives {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.quest-container .quest-objectives li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.quest-container .quest-objectives li.completed {
  color: #22c55e;
  text-decoration: line-through;
}

/* Системное сообщение */
.event-system {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: #64748b;
  font-style: italic;
}

.event-system .event-icon {
  font-size: 14px;
}

/* Дефолтное отображение */
.event-default {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: #94a3b8;
}

.event-default .event-icon {
  font-size: 18px;
}

/* Предметы */
.event-item-give {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
}

.item-icon {
  font-size: 24px;
  color: #22c55e;
}

.item-content {
  flex: 1;
}

.item-label {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 4px;
}

.item-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.item-badge {
  display: inline-block;
  padding: 4px 8px;
  background: rgba(34, 197, 94, 0.2);
  border-radius: 4px;
  font-size: 13px;
  color: #22c55e;
}

/* Лут */
.event-item-loot {
  padding: 12px;
}

.loot-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.loot-icon {
  font-size: 20px;
  color: #a855f7;
}

.loot-title {
  font-size: 14px;
  font-weight: 700;
  color: #a855f7;
}

.loot-desc {
  margin: 0 0 8px;
  font-size: 13px;
  color: #94a3b8;
}

.loot-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.loot-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 6px;
}

.loot-item.claimed {
  opacity: 0.6;
}

.loot-item-name {
  flex: 1;
  font-size: 13px;
  color: #e2e8f0;
}

.loot-claimed-by {
  font-size: 11px;
  color: #64748b;
}

.loot-claim-btn {
  padding: 4px 12px;
  background: #a855f7;
  border: none;
  border-radius: 4px;
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

/* Сообщение с изображением (без самой картинки) */
.event-image-message {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.image-message-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.image-icon {
  font-size: 18px;
  color: #8b5cf6;
}

.image-sender {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.image-time {
  font-size: 11px;
  color: #64748b;
}

.image-description {
  margin: 0;
  font-size: 13px;
  color: #94a3b8;
}

.view-image-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.1));
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 8px;
  color: #c4b5fd;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.view-image-btn:active {
  background: rgba(139, 92, 246, 0.3);
}

/* Кнопка скрытия изображения */
.hide-image-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1));
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 8px;
  color: #fca5a5;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.hide-image-btn:active {
  background: rgba(239, 68, 68, 0.3);
}

/* Карточка изображения, которое сейчас открыто */
.event-image-message.is-viewing {
  border: 1px solid rgba(139, 92, 246, 0.5);
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(139, 92, 246, 0.05));
}

/* Дефолтное событие */
.event-default {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  font-size: 13px;
  color: #94a3b8;
}

.event-default .event-icon {
  font-size: 16px;
}

/* === Инструменты мастера === */

.log-tools-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  background: rgba(100, 116, 139, 0.2);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 6px;
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: auto;
}

.log-tools-btn:hover {
  background: rgba(100, 116, 139, 0.3);
}

.log-tools-btn.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
  color: #60a5fa;
}

/* Панель инструментов */
.master-tools-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: rgba(30, 41, 59, 0.95);
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.tools-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tools-title {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.events-count {
  font-size: 12px;
  color: #64748b;
  padding: 2px 8px;
  background: rgba(100, 116, 139, 0.2);
  border-radius: 10px;
}

.tools-actions {
  display: flex;
  gap: 8px;
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 6px;
  color: #60a5fa;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background: rgba(59, 130, 246, 0.25);
}

.tool-btn-danger {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.tool-btn-danger:hover {
  background: rgba(239, 68, 68, 0.25);
}

/* Анимация slide-down */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* === Диалог подтверждения очистки === */

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.confirm-dialog {
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
  text-align: center;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
}

.confirm-icon {
  font-size: 48px;
  color: #f59e0b;
  margin-bottom: 16px;
}

.confirm-title {
  font-size: 18px;
  font-weight: 600;
  color: #f1f5f9;
  margin: 0 0 12px;
}

.confirm-text {
  font-size: 14px;
  color: #94a3b8;
  margin: 0 0 24px;
  line-height: 1.5;
}

.confirm-text strong {
  color: #e2e8f0;
}

.confirm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.confirm-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.confirm-btn-secondary {
  background: rgba(100, 116, 139, 0.2);
  border-color: rgba(100, 116, 139, 0.3);
  color: #94a3b8;
}

.confirm-btn-secondary:hover {
  background: rgba(100, 116, 139, 0.3);
}

.confirm-btn-primary {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
  color: #60a5fa;
}

.confirm-btn-primary:hover {
  background: rgba(59, 130, 246, 0.3);
}

.confirm-btn-danger {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
  color: #f87171;
}

.confirm-btn-danger:hover {
  background: rgba(239, 68, 68, 0.3);
}

/* Fade анимация */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
