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
import aspectsData from '@/data/aspects.json'
import UserAvatar from './UserAvatar.vue'

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

const { filteredEvents, currentImage, hasActiveImage, activeFilter } = storeToRefs(sceneLogStore)
const { role } = storeToRefs(sessionStore)

// Скролл к низу при новых событиях
const logContainerRef = ref(null)
const autoScroll = ref(true)

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

// Автоскролл при новых событиях
watch(filteredEvents, () => {
  if (autoScroll.value && logContainerRef.value) {
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
    characterName: character.name
  })
  
  sessionStore.sendToMaster({
    type: 'skill-check-result',
    eventId: event.id,
    result,
    characterName: character.name
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
    characterName: character.name
  })
  
  // Отправляем результат мастеру
  sessionStore.sendToMaster({
    type: 'skill-check-result',
    eventId: event.id,
    result,
    characterName: character.name
  })
  
  emit('skill-check-clicked', { ...event, result })
}

// Обработка клика по приглашению в бой
const onBattleInviteClick = () => {
  emit('go-to-battle')
}

// Обработка клика по созданию персонажа
const onCharacterInviteClick = (event) => {
  emit('create-character', event.restrictions)
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
    return event.targetUserIds === null || event.targetUserIds.includes(userStore.userId)
  }
  if (event.type === SceneEventType.CHARACTER_INVITE && !event.accepted) {
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

// === Функции для мастера: статусы доставки ===

// Проверка, является ли текущий пользователь мастером
const isMaster = computed(() => role.value === 'master')

// Получить список подключённых игроков для события
const getDeliveryStatus = (event) => {
  if (!isMaster.value) return []
  
  // Получаем список всех подключённых
  const allConnections = sessionStore.connections || []
  
  // Для каждого игрока определяем статус
  return allConnections.map(conn => {
    const isHidden = event.hiddenFrom?.includes(conn.userId) || false
    const wasDelivered = event.deliveredTo?.includes(conn.userId) || false
    
    return {
      userId: conn.userId,
      name: conn.alias || 'Игрок',
      avatar: conn.avatar,
      // Если скрыто - всё равно считаем delivered для правильного отображения
      delivered: wasDelivered || isHidden,
      hidden: isHidden
    }
  })
}

// Переключить видимость события для игрока (для мастера)
const toggleEventVisibility = (event, userId, currentlyHidden) => {
  if (!isMaster.value) return
  
  const hiddenFrom = event.hiddenFrom || []
  const deliveredTo = event.deliveredTo || []
  const connection = sessionStore.connections.find(c => c.userId === userId)
  
  if (currentlyHidden) {
    // Показываем событие игроку
    const newHiddenFrom = hiddenFrom.filter(id => id !== userId)
    const newDeliveredTo = deliveredTo.includes(userId) ? deliveredTo : [...deliveredTo, userId]
    
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
    if (!hiddenFrom.includes(userId)) {
      sceneLogStore.updateEvent(event.id, {
        hiddenFrom: [...hiddenFrom, userId]
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

// Переотправить событие игроку (для тех кто был оффлайн)
const resendToPlayer = (event, userId) => {
  if (!isMaster.value) return
  
  const connection = sessionStore.connections.find(c => c.userId === userId)
  if (connection?.conn?.open) {
    connection.conn.send({
      type: 'scene-event',
      event: event
    })
    
    // Обновляем deliveredTo
    const deliveredTo = event.deliveredTo || []
    if (!deliveredTo.includes(userId)) {
      sceneLogStore.updateEvent(event.id, {
        deliveredTo: [...deliveredTo, userId]
      })
    }
  }
}
</script>

<template>
  <div class="scene-log">
    <!-- Лог событий -->
    <div 
      ref="logContainerRef"
      class="events-log"
      @scroll="onLogScroll"
    >
      <div v-if="filteredEvents.length === 0" class="empty-log">
        <Icon icon="mdi:book-open-variant" class="empty-icon" />
        <p>История событий пуста</p>
        <p class="empty-hint">Здесь будут отображаться события игры</p>
      </div>
      
      <TransitionGroup name="event-list" tag="div" class="events-list">
        <div 
          v-for="event in filteredEvents" 
          :key="event.id"
          class="event-item"
          :class="[
            `event-${event.type}`,
            { interactive: isEventInteractive(event) }
          ]"
          :style="{ '--event-color': getEventColor(event.type) }"
          @click="isEventInteractive(event) && onSkillCheckClick(event)"
        >
          <!-- Системное сообщение -->
          <template v-if="event.type === SceneEventType.SYSTEM">
            <div class="event-system">
              <Icon :icon="getEventIcon(event.type)" class="event-icon" />
              <span>{{ event.text }}</span>
            </div>
          </template>
          
          <!-- Текстовое сообщение -->
          <template v-else-if="event.type === SceneEventType.TEXT">
            <div class="event-message">
              <div class="event-header">
                <span class="event-sender">{{ getSenderInfo(event.senderUserId).name }}</span>
                <span class="event-time">{{ formatTime(event.time) }}</span>
              </div>
              <p class="event-text">{{ event.text }}</p>
            </div>
          </template>
          
          <!-- Проверка навыка -->
          <template v-else-if="event.type === SceneEventType.SKILL_CHECK">
            <div 
              class="event-skill-check"
              :class="{ completed: event.completed, pending: !event.completed }"
              :style="{ '--check-color': event.difficultyColor || '#f59e0b' }"
            >
              <div class="skill-check-header">
                <Icon icon="mdi:dice-d20" class="skill-check-icon" />
                <span class="skill-check-label">{{ getCheckTypeName(event.checkType) }}</span>
                <span 
                  class="skill-check-difficulty"
                  :style="{ 
                    backgroundColor: event.difficultyColor || '#f59e0b',
                    color: isDarkColor(event.difficultyColor) ? '#fff' : '#000'
                  }"
                >
                  {{ event.difficultyName || event.difficulty }}
                </span>
              </div>
              
              <p v-if="event.description" class="skill-check-desc">{{ event.description }}</p>
              
              <!-- Результат проверки (завершённая) -->
              <div v-if="event.completed && event.result" class="skill-check-result">
                <!-- Имя персонажа -->
                <span v-if="event.characterName" class="result-character">{{ event.characterName }}</span>
                
                <!-- Гарантированный успех (без броска) -->
                <template v-if="event.result.resultType === 'guaranteed-success'">
                  <span class="result-auto success">✨ Автоуспех! (бонус {{ event.result.modifier >= 0 ? '+' : '' }}{{ event.result.modifier }} ≥ {{ event.difficulty }})</span>
                </template>
                <!-- Гарантированный провал (без броска) -->
                <template v-else-if="event.result.resultType === 'guaranteed-fail'">
                  <span class="result-auto failure">💀 Автопровал! (даже 12{{ event.result.modifier >= 0 ? '+' : '' }}{{ event.result.modifier }} < {{ event.difficulty }})</span>
                </template>
                <!-- Обычный результат с броском -->
                <template v-else>
                  <div class="result-details">
                    <span class="result-need">Нужно: {{ event.difficulty }}</span>
                    <span class="result-roll">🎲 {{ event.result.roll }}</span>
                    <span class="result-modifier">{{ event.result.modifier >= 0 ? '+' : '' }}{{ event.result.modifier }}</span>
                    <span class="result-total">= {{ event.result.total }}</span>
                  </div>
                  <span 
                    class="result-status"
                    :class="event.result.success ? 'success' : 'failure'"
                  >
                    {{ event.result.success ? 'Успех!' : 'Провал' }}
                  </span>
                </template>
              </div>
              
              <!-- Незавершённая проверка для игрока -->
              <template v-else-if="isEventInteractive(event)">
                <!-- Предпросмотр с именем персонажа и модификатором -->
                <div class="skill-check-preview">
                  <span class="preview-character">{{ getCheckPreview(event)?.characterName || 'Ваш персонаж' }}</span>
                  <span class="preview-modifier">Бонус: {{ (getCheckPreview(event)?.modifier || 0) >= 0 ? '+' : '' }}{{ getCheckPreview(event)?.modifier || 0 }}</span>
                </div>
                
                <!-- Гарантированный успех - сразу показываем -->
                <template v-if="getCheckPreview(event)?.resultType === 'guaranteed-success'">
                  <div class="guaranteed-result success" @click.stop="autoCompleteCheck(event, 'guaranteed-success')">
                    <Icon icon="mdi:check-circle" />
                    <span>Автоуспех! Бросок не требуется</span>
                  </div>
                </template>
                <!-- Гарантированный провал -->
                <template v-else-if="getCheckPreview(event)?.resultType === 'guaranteed-fail'">
                  <div class="guaranteed-result failure" @click.stop="autoCompleteCheck(event, 'guaranteed-fail')">
                    <Icon icon="mdi:close-circle" />
                    <span>Автопровал! Бросок не поможет</span>
                  </div>
                </template>
                <!-- Нужен бросок -->
                <template v-else>
                  <button 
                    class="skill-check-btn"
                    @click.stop="onSkillCheckClick(event)"
                  >
                    <Icon icon="mdi:dice-multiple" />
                    Бросить
                  </button>
                </template>
              </template>
            </div>
          </template>
          
          <!-- Приглашение в бой -->
          <template v-else-if="event.type === SceneEventType.BATTLE_INVITE">
            <div class="event-battle-invite" @click.stop="onBattleInviteClick">
              <Icon icon="mdi:sword-cross" class="battle-icon" />
              <div class="battle-content">
                <span class="battle-title">Приглашение в бой!</span>
                <p v-if="event.description" class="battle-desc">{{ event.description }}</p>
              </div>
              <Icon icon="mdi:chevron-right" class="battle-arrow" />
            </div>
          </template>
          
          <!-- Важное сообщение -->
          <template v-else-if="event.type === SceneEventType.IMPORTANT">
            <div class="event-important">
              <div class="important-header">
                <Icon :icon="event.icon || 'mdi:alert-circle'" class="important-icon" />
                <span class="important-title">{{ event.title }}</span>
              </div>
              <p class="important-text">{{ event.text }}</p>
            </div>
          </template>
          
          <!-- Квест -->
          <template v-else-if="event.type === SceneEventType.QUEST">
            <div class="event-quest">
              <div class="quest-header">
                <Icon icon="mdi:map-marker-star" class="quest-icon" />
                <span class="quest-title">Новый квест: {{ event.title }}</span>
              </div>
              <p class="quest-desc">{{ event.description }}</p>
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
          
          <!-- Приглашение создать персонажа -->
          <template v-else-if="event.type === SceneEventType.CHARACTER_INVITE">
            <div 
              class="event-character-invite"
              :class="{ accepted: event.accepted }"
              @click.stop="!event.accepted && onCharacterInviteClick(event)"
            >
              <Icon icon="mdi:account-plus" class="char-invite-icon" />
              <div class="char-invite-content">
                <span class="char-invite-title">
                  {{ event.accepted ? 'Персонаж создан' : 'Создайте персонажа!' }}
                </span>
                <p v-if="!event.accepted" class="char-invite-hint">Нажмите, чтобы начать</p>
              </div>
              <Icon v-if="!event.accepted" icon="mdi:chevron-right" class="char-invite-arrow" />
            </div>
          </template>
          
          <!-- Изображение - кнопка просмотра или скрытия -->
          <template v-else-if="event.type === SceneEventType.IMAGE">
            <div class="event-image-message" :class="{ 'is-viewing': currentImage?.url === event.url }">
              <div class="image-message-header">
                <Icon icon="mdi:image" class="image-icon" />
                <span class="image-sender">{{ getSenderInfo(event.senderUserId).name }}</span>
                <span class="image-time">{{ formatTime(event.time) }}</span>
              </div>
              <p v-if="event.description" class="image-description">{{ event.description }}</p>
              <!-- Если это текущее открытое изображение - показываем кнопку "Скрыть" -->
              <button 
                v-if="currentImage?.url === event.url" 
                class="hide-image-btn" 
                @click.stop="emit('hide-image', event)"
              >
                <Icon icon="mdi:eye-off" />
                Скрыть
              </button>
              <!-- Иначе - кнопка "Посмотреть" -->
              <button v-else class="view-image-btn" @click.stop="emit('view-image', event)">
                <Icon icon="mdi:eye" />
                Посмотреть
              </button>
            </div>
          </template>
          
          <!-- Дефолтное отображение -->
          <template v-else>
            <div class="event-default">
              <Icon :icon="getEventIcon(event.type)" class="event-icon" />
              <span>{{ event.text || event.description || 'Событие' }}</span>
            </div>
          </template>
          
          <!-- Статусы доставки для мастера (не системные сообщения) -->
          <div 
            v-if="isMaster && event.type !== SceneEventType.SYSTEM" 
            class="delivery-status"
          >
            <div 
              v-for="status in getDeliveryStatus(event)"
              :key="status.userId"
              class="delivery-avatar"
              :class="{ 
                delivered: status.delivered && !status.hidden,
                'is-hidden': status.hidden,
                pending: !status.delivered && !status.hidden
              }"
              :title="status.hidden ? `${status.name}: скрыто - клик чтобы показать` : (status.delivered ? `${status.name}: доставлено - клик чтобы скрыть` : `${status.name}: не доставлено - клик чтобы отправить`)"
              @click.stop="status.hidden ? toggleEventVisibility(event, status.userId, true) : (status.delivered ? toggleEventVisibility(event, status.userId, false) : resendToPlayer(event, status.userId))"
            >
              <UserAvatar :src="status.avatar" :size="20" />
              <Icon 
                v-if="status.hidden" 
                icon="mdi:eye-off" 
                class="status-icon hidden-icon" 
              />
              <Icon 
                v-else-if="status.delivered" 
                icon="mdi:check" 
                class="status-icon delivered-icon" 
              />
              <Icon 
                v-else 
                icon="mdi:clock-outline" 
                class="status-icon pending-icon" 
              />
            </div>
          </div>
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

/* Базовый стиль события */
.event-item {
  background: #1e293b;
  border-radius: 8px;
  border-left: 3px solid var(--event-color, #64748b);
  overflow: hidden;
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

.event-text {
  margin: 0;
  font-size: 14px;
  color: #e2e8f0;
  line-height: 1.4;
}

/* Проверка навыка */
.event-skill-check {
  padding: 12px;
}

.skill-check-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.skill-check-icon {
  font-size: 20px;
  color: #f59e0b;
}

.skill-check-label {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}

.skill-check-difficulty {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}

.skill-check-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: #94a3b8;
}

.skill-check-result {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 6px;
}

.result-details {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.result-need {
  color: #64748b;
  font-size: 12px;
}

.result-roll {
  font-weight: 700;
  color: #e2e8f0;
}

.result-modifier {
  color: #94a3b8;
}

.result-total {
  font-weight: 600;
  color: #e2e8f0;
}

.result-auto {
  font-size: 16px;
  font-weight: 700;
  text-align: center;
}

.result-auto.success {
  color: #10b981;
}

.result-auto.failure {
  color: #ef4444;
}

.result-status {
  margin-left: auto;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}

.result-status.success {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.result-status.failure {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.skill-check-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  border: none;
  border-radius: 6px;
  color: #1e293b;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.skill-check-btn:active {
  transform: scale(0.98);
}

/* Предпросмотр проверки */
.skill-check-preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  margin-top: 8px;
}

.preview-character {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.preview-modifier {
  font-size: 12px;
  color: #94a3b8;
  background: rgba(148, 163, 184, 0.1);
  padding: 2px 8px;
  border-radius: 4px;
}

/* Гарантированный результат (до броска) */
.guaranteed-result {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.guaranteed-result:active {
  transform: scale(0.98);
}

.guaranteed-result.success {
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.1));
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #22c55e;
}

.guaranteed-result.failure {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.1));
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #ef4444;
}

/* Имя персонажа в результате */
.result-character {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  margin-bottom: 4px;
}

/* Приглашение в бой */
.event-battle-invite {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(185, 28, 28, 0.1));
  cursor: pointer;
}

.battle-icon {
  font-size: 28px;
  color: #ef4444;
}

.battle-content {
  flex: 1;
}

.battle-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #ef4444;
}

.battle-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.battle-arrow {
  font-size: 24px;
  color: #ef4444;
}

/* Важное сообщение */
.event-important {
  padding: 12px;
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.1));
}

.important-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.important-icon {
  font-size: 20px;
  color: #f59e0b;
}

.important-title {
  font-size: 14px;
  font-weight: 700;
  color: #f59e0b;
}

.important-text {
  margin: 0;
  font-size: 13px;
  color: #e2e8f0;
  line-height: 1.4;
}

/* Квест */
.event-quest {
  padding: 12px;
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.1), rgba(202, 138, 4, 0.1));
}

.quest-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.quest-icon {
  font-size: 20px;
  color: #eab308;
}

.quest-title {
  font-size: 14px;
  font-weight: 700;
  color: #eab308;
}

.quest-desc {
  margin: 0 0 8px;
  font-size: 13px;
  color: #e2e8f0;
}

.quest-objectives {
  margin: 0;
  padding: 0;
  list-style: none;
}

.quest-objectives li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
  color: #94a3b8;
}

.quest-objectives li.completed {
  color: #10b981;
  text-decoration: line-through;
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

/* Приглашение создать персонажа */
.event-character-invite {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.1));
  cursor: pointer;
}

.event-character-invite.accepted {
  opacity: 0.6;
  cursor: default;
}

.char-invite-icon {
  font-size: 28px;
  color: #3b82f6;
}

.char-invite-content {
  flex: 1;
}

.char-invite-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #3b82f6;
}

.char-invite-hint {
  margin: 4px 0 0;
  font-size: 12px;
  color: #94a3b8;
}

.char-invite-arrow {
  font-size: 24px;
  color: #3b82f6;
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

/* Статусы доставки для мастера */
.delivery-status {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  margin-top: 8px;
}

.delivery-avatar {
  position: relative;
  cursor: pointer;
  border-radius: 50%;
  padding: 2px;
  transition: all 0.2s ease;
}

.delivery-avatar.delivered {
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.4);
}

.delivery-avatar.is-hidden {
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  opacity: 0.6;
}

.delivery-avatar.pending {
  background: rgba(148, 163, 184, 0.1);
  border: 1px solid rgba(148, 163, 184, 0.2);
  opacity: 0.5;
}

.delivery-avatar:hover {
  transform: scale(1.1);
}

.delivery-avatar.delivered:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.4);
}

.delivery-avatar.pending:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
  opacity: 1;
}

.status-icon {
  position: absolute;
  bottom: -2px;
  right: -2px;
  font-size: 10px;
  background: #1e293b;
  border-radius: 50%;
  padding: 1px;
}

.delivered-icon {
  color: #22c55e;
}

.hidden-icon {
  color: #ef4444;
}

.pending-icon {
  color: #94a3b8;
}
</style>
