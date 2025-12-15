<script setup>
/**
 * MasterSceneTools - инструменты мастера для отправки событий в лог сцены
 * Новый UI: вместо кнопки "Отправить" - аватары игроков для адресной отправки
 */
import { ref, computed, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { storeToRefs } from 'pinia'
import { useSceneLogStore, SceneEventType } from '@/stores/sceneLog'
import { useSessionStore } from '@/stores/session'
import { useCharactersStore } from '@/stores/characters'
import { useUserStore } from '@/stores/user'
import { useBattleMapStore } from '@/stores/battleMap'
import UserAvatar from './UserAvatar.vue'
import CharacterPortrait from './CharacterPortrait.vue'
import aspectsData from '@/data/aspects.json'
import diffsData from '@/data/diffs.json'
import racesData from '@/data/races.json'
import classesData from '@/data/classes.json'
import epochsData from '@/data/epochs.json'

const props = defineProps({
  compact: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'event-sent', 'templates-updated'])

const sceneLogStore = useSceneLogStore()
const sessionStore = useSessionStore()
const charactersStore = useCharactersStore()
const userStore = useUserStore()
const battleMapStore = useBattleMapStore()

const { connections } = storeToRefs(sessionStore)

// Активный инструмент
const activeTool = ref(null)

// Инструменты
const tools = [
  { id: 'text', label: 'Текст', icon: 'mdi:message-text', color: '#94a3b8' },
  { id: 'skill-check', label: 'Проверка', icon: 'mdi:dice-d20', color: '#f59e0b' },
  { id: 'battle-invite', label: 'В бой', icon: 'mdi:sword-cross', color: '#ef4444' },
  { id: 'image', label: 'Картинка', icon: 'mdi:image', color: '#8b5cf6' },
  { id: 'important', label: 'Важное', icon: 'mdi:alert-circle', color: '#f59e0b' },
  { id: 'quest', label: 'Квест', icon: 'mdi:map-marker-star', color: '#eab308' },
  { id: 'item-give', label: 'Предмет', icon: 'mdi:gift', color: '#22c55e' },
  { id: 'character-invite', label: 'Персонаж', icon: 'mdi:account-plus', color: '#3b82f6' },
]

const selectTool = (toolId) => {
  activeTool.value = activeTool.value === toolId ? null : toolId
  resetForms()
}

// === Формы для каждого инструмента ===

const textForm = ref({ text: '', isSecret: false })
const skillCheckForm = ref({ checkType: 'war', difficultyIndex: 3, description: '', isSecret: false })
const battleInviteForm = ref({ description: '', mapId: '' })
const imageForm = ref({ url: '', description: '' })
const importantForm = ref({ title: '', text: '', icon: 'mdi:alert-circle' })
const questForm = ref({ title: '', description: '', objectives: '' })
const itemGiveForm = ref({ itemName: '', quantity: 1, description: '' })
const characterInviteForm = ref({
  // Ограничения для создания персонажа
  allowedRaces: [],      // Пустой = все разрешены, иначе только указанные
  allowedSubraces: [],   // Формат: ['human-war', 'elf-nature'] - race-aspect
  allowedClasses: [],    // Пустой = все разрешены
  maxWealth: 5,          // Максимальный уровень благосостояния
  maxEpoch: 5            // Максимальная эпоха
})

// Tracking кому уже отправлено текущее сообщение (по characterId)
const sentToCharacters = ref(new Set())
// Tracking кому уже отправлено приглашение на создание персонажа (по userId)
const sentToPlayers = ref(new Set())

const resetForms = () => {
  textForm.value = { text: '', isSecret: false }
  skillCheckForm.value = { checkType: 'war', difficultyIndex: 3, description: '', isSecret: false }
  battleInviteForm.value = { description: '', mapId: '' }
  imageForm.value = { url: '', description: '' }
  importantForm.value = { title: '', text: '', icon: 'mdi:alert-circle' }
  questForm.value = { title: '', description: '', objectives: '' }
  itemGiveForm.value = { itemName: '', quantity: 1, description: '' }
  characterInviteForm.value = {
    allowedRaces: [],
    allowedSubraces: [],
    allowedClasses: [],
    maxWealth: 5,
    maxEpoch: 5
  }
  sentToCharacters.value = new Set()
  sentToPlayers.value = new Set()
}

// === ШАБЛОНЫ ===
const templates = ref([])
const showSaveAsTemplate = ref(false)
const templateName = ref('')
const templateIcon = ref('mdi:file-document')
const templateColor = ref('#3b82f6')
const templateTags = ref('')

// Иконки для выбора
const templateIcons = [
  // Существа
  { icon: 'mdi:skull', label: 'Монстр' },
  { icon: 'mdi:spider', label: 'Паук' },
  { icon: 'mdi:snake', label: 'Змея' },
  { icon: 'mdi:bat', label: 'Летучая мышь' },
  { icon: 'mdi:ghost', label: 'Призрак' },
  { icon: 'mdi:alien', label: 'Пришелец' },
  { icon: 'mdi:paw', label: 'Зверь' },
  { icon: 'mdi:bird', label: 'Птица' },
  { icon: 'mdi:fish', label: 'Рыба' },
  { icon: 'mdi:bug', label: 'Насекомое' },
  // Локации
  { icon: 'mdi:castle', label: 'Замок' },
  { icon: 'mdi:home', label: 'Дом' },
  { icon: 'mdi:pine-tree', label: 'Лес' },
  { icon: 'mdi:terrain', label: 'Горы' },
  { icon: 'mdi:waves', label: 'Вода' },
  { icon: 'mdi:fire', label: 'Огонь' },
  { icon: 'mdi:weather-sunny', label: 'Солнце' },
  { icon: 'mdi:weather-night', label: 'Ночь' },
  { icon: 'mdi:city', label: 'Город' },
  { icon: 'mdi:bridge', label: 'Мост' },
  // Действия/события
  { icon: 'mdi:sword-cross', label: 'Бой' },
  { icon: 'mdi:treasure-chest', label: 'Сокровище' },
  { icon: 'mdi:map-marker', label: 'Локация' },
  { icon: 'mdi:alert-circle', label: 'Важное' },
  { icon: 'mdi:help-circle', label: 'Загадка' },
  { icon: 'mdi:account-group', label: 'НПС' },
  { icon: 'mdi:script-text', label: 'Текст' },
  { icon: 'mdi:image', label: 'Картинка' },
  { icon: 'mdi:star', label: 'Особое' },
  { icon: 'mdi:flag', label: 'Квест' },
]

// Цвета для шаблонов
const templateColors = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#64748b', // slate
  '#78716c', // stone
]

// === ОГРАНИЧЕНИЯ ДЛЯ СОЗДАНИЯ ПЕРСОНАЖА ===
const showConstraints = ref(false)

const hasConstraints = computed(() => {
  const form = characterInviteForm.value
  return form.allowedRaces?.length > 0 || 
         form.allowedClasses?.length > 0 ||
         form.allowedSubraces?.length > 0 ||
         form.maxWealth < 5 ||
         form.maxEpoch < 5
})

const constraintsCount = computed(() => {
  const form = characterInviteForm.value
  let count = 0
  if (form.allowedRaces?.length > 0) count += form.allowedRaces.length
  if (form.allowedClasses?.length > 0) count += form.allowedClasses.length
  if (form.allowedSubraces?.length > 0) count += form.allowedSubraces.length
  if (form.maxWealth < 5) count++
  if (form.maxEpoch < 5) count++
  return count
})

const toggleConstraint = (field, value) => {
  const arr = characterInviteForm.value[field]
  const idx = arr.indexOf(value)
  if (idx === -1) {
    arr.push(value)
  } else {
    arr.splice(idx, 1)
  }
}

// Внутренние классы - те, которые соединены ровно с двумя аспектами (не с одним и не с классом)
const innerClasses = computed(() => {
  return classesData.classes.filter(cls => {
    // Проверяем, что класс имеет ровно 2 аспекта
    if (cls.aspects?.length !== 2) return false
    // Проверяем, что все рёбра (edges) ведут к аспектам, а не к классам
    if (!cls.edges || cls.edges.length === 0) return false
    const allEdgesAreAspects = cls.edges.every(edge => edge.type === 'aspect')
    return allEdgesAreAspects
  })
})

// Применить пресет "только внутренние классы"
const applyInnerClassesPreset = () => {
  characterInviteForm.value.allowedClasses = innerClasses.value.map(cls => cls.id)
}

// Загрузка шаблонов
onMounted(() => {
  const saved = localStorage.getItem('scene-templates-v2')
  if (saved) {
    try {
      templates.value = JSON.parse(saved)
    } catch (e) {
      console.error('Failed to load templates:', e)
      templates.value = []
    }
  }
})

// Сохранение шаблонов
const saveTemplates = () => {
  localStorage.setItem('scene-templates-v2', JSON.stringify(templates.value))
}

// Сохранить как шаблон
const saveAsTemplate = () => {
  if (!templateName.value.trim() || !isFormValid.value) return
  
  const eventData = prepareEventData()
  if (!eventData) return
  
  const template = {
    id: Date.now().toString(),
    name: templateName.value.trim(),
    icon: templateIcon.value,
    color: templateColor.value,
    tags: templateTags.value.split(',').map(t => t.trim()).filter(Boolean),
    tool: activeTool.value,
    data: eventData,
    sent: false
  }
  
  templates.value.push(template)
  saveTemplates()
  emit('templates-updated', templates.value)
  
  // Сброс формы шаблона
  showSaveAsTemplate.value = false
  templateName.value = ''
  templateTags.value = ''
}

// Удалить шаблон
const deleteTemplate = (templateId) => {
  templates.value = templates.value.filter(t => t.id !== templateId)
  saveTemplates()
  emit('templates-updated', templates.value)
}

// Переключить статус sent
const toggleTemplateSent = (templateId) => {
  const template = templates.value.find(t => t.id === templateId)
  if (template) {
    template.sent = !template.sent
    saveTemplates()
    emit('templates-updated', templates.value)
  }
}

// Отметить шаблон как отправленный
const markTemplateSent = (templateId) => {
  const template = templates.value.find(t => t.id === templateId)
  if (template) {
    template.sent = true
    saveTemplates()
    emit('templates-updated', templates.value)
  }
}

// Текущий загруженный шаблон (для отслеживания отправки)
const currentTemplateId = ref(null)

// Использовать шаблон (загрузить в форму)
const loadTemplate = (template) => {
  activeTool.value = template.tool
  currentTemplateId.value = template.id
  
  // Загружаем данные в соответствующую форму
  switch (template.tool) {
    case 'text':
      textForm.value = { 
        text: template.data.text || '', 
        isSecret: template.data.isSecret || false 
      }
      break
    case 'skill-check':
      const diffIdx = difficultyLevels.value.findIndex(d => d.value === template.data.difficulty)
      skillCheckForm.value = {
        checkType: template.data.checkType || 'war',
        difficultyIndex: diffIdx >= 0 ? diffIdx : 3,
        description: template.data.description || '',
        isSecret: template.data.isSecret || false
      }
      break
    case 'image':
      imageForm.value = {
        url: template.data.url || '',
        description: template.data.description || ''
      }
      break
    case 'important':
      importantForm.value = {
        title: template.data.title || '',
        text: template.data.text || '',
        icon: template.data.icon || 'mdi:alert-circle'
      }
      break
    case 'quest':
      questForm.value = {
        title: template.data.title || '',
        description: template.data.description || '',
        objectives: template.data.objectives || ''
      }
      break
    case 'item-give':
      itemGiveForm.value = {
        itemName: template.data.itemName || '',
        quantity: template.data.quantity || 1,
        description: template.data.description || ''
      }
      break
    case 'battle-invite':
      battleInviteForm.value = {
        description: template.data.description || '',
        mapId: template.data.mapId || ''
      }
      break
    case 'character-invite':
      // Загружаем ограничения из шаблона
      if (template.data.constraints) {
        characterInviteForm.value = {
          allowedRaces: template.data.constraints.allowedRaces || [],
          allowedSubraces: template.data.constraints.allowedSubraces || [],
          allowedClasses: template.data.constraints.allowedClasses || [],
          maxWealth: template.data.constraints.maxWealth ?? 5,
          maxEpoch: template.data.constraints.maxEpoch ?? 5
        }
      }
      break
  }
  
}

// 6 типов проверок из aspects.json
const checkTypes = computed(() => {
  return aspectsData.aspects.map(aspect => ({
    id: aspect.id,
    name: aspect.check.name,
    color: aspect.color,
    icon: aspect.checkIcon
  }))
})

// Сложности из diffs.json (шаг 3)
const difficultyLevels = computed(() => {
  const levels = []
  const keys = Object.keys(diffsData).map(Number).sort((a, b) => a - b)
  keys.forEach(key => {
    levels.push({
      value: key,
      ...diffsData[key]
    })
  })
  return levels
})

// Текущая сложность
const currentDifficulty = computed(() => {
  const idx = skillCheckForm.value.difficultyIndex
  return difficultyLevels.value[idx] || difficultyLevels.value[0]
})

// Все персонажи игроков для выбора адресатов
const targetCharacters = computed(() => {
  // Получаем всех персонажей игроков (не NPC)
  const allChars = charactersStore.allPlayerCharacters
  
  // Для каждого персонажа определяем онлайн-статус владельца
  return allChars.map(char => {
    // Ищем владельца среди подключений
    const ownerConnection = connections.value.find(c => c.userId === char.ownerId)
    const isOnline = ownerConnection?.conn?.open || false
    
    return {
      characterId: char.id,
      characterName: char.name,
      characterPortrait: char.portrait,
      ownerId: char.ownerId,
      ownerName: char.ownerNickname || ownerConnection?.alias || 'Игрок',
      online: isOnline,
      sent: sentToCharacters.value.has(char.id)
    }
  })
})

// Все игроки для выбора адресатов приглашений на создание персонажа
const targetPlayers = computed(() => {
  // Используем allPlayers из session store (онлайн + офлайн)
  return sessionStore.allPlayers.map(player => ({
    userId: player.userId,
    alias: player.alias,
    avatar: player.avatar,
    online: player.online,
    sent: sentToPlayers.value.has(player.userId)
  }))
})

// Проверка, всем ли игрокам отправлено приглашение
const allPlayersSent = computed(() => {
  if (targetPlayers.value.length === 0) return false
  return targetPlayers.value.every(p => p.sent)
})

// Показать/скрыть панель доставки
const showDeliveryPanel = ref(false)

// Проверка, всем ли отправлено
const allCharactersSent = computed(() => {
  if (targetCharacters.value.length === 0) return false
  return targetCharacters.value.every(c => c.sent)
})

// Проверка валидности текущей формы
const isFormValid = computed(() => {
  switch (activeTool.value) {
    case 'text':
      return textForm.value.text.trim().length > 0
    case 'skill-check':
      return true // Всегда валидно - есть дефолтные значения
    case 'battle-invite':
      return true
    case 'image':
      return imageForm.value.url.trim().length > 0
    case 'important':
      return importantForm.value.title.trim().length > 0
    case 'quest':
      return questForm.value.title.trim().length > 0
    case 'item-give':
      return itemGiveForm.value.itemName.trim().length > 0
    case 'character-invite':
      return true
    default:
      return false
  }
})

// === Подготовка данных события для текущего инструмента ===
const prepareEventData = () => {
  switch (activeTool.value) {
    case 'text':
      if (!textForm.value.text.trim()) return null
      return {
        type: SceneEventType.TEXT,
        text: textForm.value.text.trim(),
        isSecret: textForm.value.isSecret
      }
    
    case 'skill-check':
      const diff = currentDifficulty.value
      return {
        type: SceneEventType.SKILL_CHECK,
        checkType: skillCheckForm.value.checkType,
        difficulty: diff.value,
        difficultyName: diff.name,
        difficultyColor: diff.color,
        isSecret: skillCheckForm.value.isSecret,
        description: skillCheckForm.value.description,
        completed: false,
        result: null
      }
    
    case 'battle-invite':
      return {
        type: SceneEventType.BATTLE_INVITE,
        description: battleInviteForm.value.description,
        mapId: battleInviteForm.value.mapId || null
      }
    
    case 'image':
      if (!imageForm.value.url.trim()) return null
      return {
        type: SceneEventType.IMAGE,
        url: imageForm.value.url.trim(),
        description: imageForm.value.description
      }
    
    case 'important':
      if (!importantForm.value.title.trim()) return null
      return {
        type: SceneEventType.IMPORTANT,
        title: importantForm.value.title.trim(),
        text: importantForm.value.text,
        icon: importantForm.value.icon
      }
    
    case 'quest':
      if (!questForm.value.title.trim()) return null
      const objectives = questForm.value.objectives
        .split('\n')
        .filter(line => line.trim())
        .map(text => ({ text: text.trim(), completed: false }))
      return {
        type: SceneEventType.QUEST,
        title: questForm.value.title.trim(),
        description: questForm.value.description,
        objectives
      }
    
    case 'item-give':
      if (!itemGiveForm.value.itemName.trim()) return null
      return {
        type: SceneEventType.ITEM_GIVE,
        items: [{
          id: crypto.randomUUID(),
          name: itemGiveForm.value.itemName.trim(),
          quantity: itemGiveForm.value.quantity
        }],
        description: itemGiveForm.value.description,
        accepted: false
      }
    
    case 'character-invite':
      return {
        type: SceneEventType.CHARACTER_INVITE,
        constraints: {
          allowedRaces: characterInviteForm.value.allowedRaces || [],
          allowedSubraces: characterInviteForm.value.allowedSubraces || [],
          allowedClasses: characterInviteForm.value.allowedClasses || [],
          maxWealth: characterInviteForm.value.maxWealth ?? 10,
          maxEpoch: characterInviteForm.value.maxEpoch ?? 10
        },
        accepted: false
      }
    
    default:
      return null
  }
}

// === Отправка событий ===

// Отправить конкретному персонажу
const sendToCharacter = (characterId) => {
  const eventData = prepareEventData()
  if (!eventData) return
  
  // Находим персонажа и его владельца
  const character = charactersStore.characters.find(c => c.id === characterId)
  if (!character) return
  
  const ownerId = character.ownerId
  
  // Добавляем targetCharacterIds и информацию о персонаже
  const eventWithTarget = {
    ...eventData,
    targetCharacterIds: [characterId],
    targetUserIds: [ownerId], // Для совместимости и доставки
    // Данные персонажа для отображения
    targetCharacterName: character.name,
    targetCharacterPortrait: character.portrait,
  }
  
  // Проверяем, онлайн ли владелец
  const connection = connections.value.find(c => c.userId === ownerId)
  const isOnline = connection?.conn?.open
  
  // Добавляем в лог мастера
  const fullEvent = sceneLogStore.addEvent({
    ...eventWithTarget,
    deliveredTo: isOnline ? [ownerId] : [] // Трекинг доставки
  })
  
  // Отправляем владельцу если онлайн
  if (isOnline) {
    connection.conn.send({
      type: 'scene-event',
      event: fullEvent
    })
  }
  // Если офлайн - событие уже в логе с правильным time,
  // при подключении игрок получит его через scene-sync
  
  // Помечаем что отправлено
  sentToCharacters.value.add(characterId)
  sentToCharacters.value = new Set(sentToCharacters.value)
  
  emit('event-sent', fullEvent)
}

// Отправить всем персонажам
const sendToAll = () => {
  const eventData = prepareEventData()
  if (!eventData) return
  
  // Собираем ID всех персонажей и их владельцев
  const allChars = targetCharacters.value
  const allCharacterIds = allChars.map(c => c.characterId)
  const onlineOwnerIds = allChars
    .filter(c => c.online)
    .map(c => c.ownerId)
  
  // targetCharacterIds = null означает для всех
  const eventWithTarget = {
    ...eventData,
    targetCharacterIds: null, // null = всем
    targetUserIds: null,
    deliveredTo: onlineOwnerIds
  }
  
  const fullEvent = sceneLogStore.addEvent(eventWithTarget)
  
  // Broadcast всем онлайн
  sessionStore.broadcastPayload({
    type: 'scene-event',
    event: fullEvent
  })
  
  // Если отправляем из шаблона - помечаем его как отправленный
  if (currentTemplateId.value) {
    markTemplateSent(currentTemplateId.value)
    currentTemplateId.value = null
  }
  
  emit('event-sent', fullEvent)
  activeTool.value = null
  resetForms()
}

// === Отправка приглашения на создание персонажа - адресуется ИГРОКАМ, а не персонажам ===

// Отправить приглашение конкретному игроку
const sendInviteToPlayer = (userId) => {
  const eventData = prepareEventData()
  if (!eventData || eventData.type !== SceneEventType.CHARACTER_INVITE) return
  
  // Находим игрока
  const player = targetPlayers.value.find(p => p.userId === userId)
  if (!player) return
  
  // Добавляем targetUserIds и usedBy для отслеживания
  const eventWithTarget = {
    ...eventData,
    targetUserIds: [userId],
    targetCharacterIds: null, // Не привязано к персонажам - это для создания нового
    usedBy: [], // Массив для отслеживания кто создал персонажа по этому приглашению
  }
  
  // Проверяем, онлайн ли игрок
  const connection = connections.value.find(c => c.userId === userId)
  const isOnline = connection?.conn?.open
  
  // Добавляем в лог мастера
  const fullEvent = sceneLogStore.addEvent({
    ...eventWithTarget,
    deliveredTo: isOnline ? [userId] : []
  })
  
  // Отправляем игроку если онлайн
  if (isOnline) {
    connection.conn.send({
      type: 'scene-event',
      event: fullEvent
    })
  }
  
  // Помечаем что отправлено
  sentToPlayers.value.add(userId)
  sentToPlayers.value = new Set(sentToPlayers.value)
  
  emit('event-sent', fullEvent)
}

// Отправить приглашение всем игрокам
const sendInviteToAllPlayers = () => {
  const eventData = prepareEventData()
  if (!eventData || eventData.type !== SceneEventType.CHARACTER_INVITE) return
  
  // Собираем всех онлайн игроков
  const allPlayers = targetPlayers.value
  const onlineUserIds = allPlayers
    .filter(p => p.online)
    .map(p => p.userId)
  
  const eventWithTarget = {
    ...eventData,
    targetUserIds: null, // null = всем игрокам
    targetCharacterIds: null,
    usedBy: [], // Массив для отслеживания использований
    deliveredTo: onlineUserIds
  }
  
  const fullEvent = sceneLogStore.addEvent(eventWithTarget)
  
  // Broadcast всем онлайн
  sessionStore.broadcastPayload({
    type: 'scene-event',
    event: fullEvent
  })
  
  // Если отправляем из шаблона - помечаем его как отправленный
  if (currentTemplateId.value) {
    markTemplateSent(currentTemplateId.value)
    currentTemplateId.value = null
  }
  
  emit('event-sent', fullEvent)
  activeTool.value = null
  resetForms()
}

// Для изображения - дополнительно устанавливаем как текущее
const sendImageToCharacter = (characterId) => {
  if (activeTool.value !== 'image') return
  
  // Устанавливаем как текущее изображение
  sceneLogStore.setSceneImage(
    imageForm.value.url.trim(),
    imageForm.value.description,
    sessionStore.userId
  )
  
  sendToCharacter(characterId)
}

const sendImageToAll = () => {
  if (activeTool.value !== 'image') return
  
  sceneLogStore.setSceneImage(
    imageForm.value.url.trim(),
    imageForm.value.description,
    sessionStore.userId
  )
  
  sendToAll()
}

const clearSceneImage = () => {
  sceneLogStore.clearSceneImage()
  
  sessionStore.broadcastPayload({
    type: 'scene-event',
    event: {
      id: crypto.randomUUID(),
      type: SceneEventType.CLEAR_IMAGE,
      time: Date.now()
    }
  })
}

// Завершить отправку (закрыть форму)
const finishSending = () => {
  activeTool.value = null
  currentTemplateId.value = null
  resetForms()
}

// Иконки для важных сообщений
const importantIcons = [
  { value: 'mdi:alert-circle', label: 'Внимание' },
  { value: 'mdi:information', label: 'Информация' },
  { value: 'mdi:star', label: 'Важно' },
  { value: 'mdi:shield', label: 'Защита' },
  { value: 'mdi:skull', label: 'Опасность' },
  { value: 'mdi:treasure-chest', label: 'Награда' },
]

// Expose для родительского компонента
defineExpose({
  templates,
  loadTemplate,
  deleteTemplate,
  toggleTemplateSent
})
</script>

<template>
  <div class="master-scene-tools" :class="{ compact }">
    <div class="tools-header">
      <h3 class="tools-title">
        <Icon icon="mdi:broadcast" />
        Инструменты сцены
      </h3>
      <button v-if="compact" class="close-btn" @click="emit('close')">
        <Icon icon="mdi:close" />
      </button>
    </div>
    
    <!-- Кнопки инструментов -->
    <div class="tools-grid">
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="tool-btn"
        :class="{ active: activeTool === tool.id }"
        :style="{ '--tool-color': tool.color }"
        @click="selectTool(tool.id)"
      >
        <Icon :icon="tool.icon" class="tool-icon" />
        <span class="tool-label">{{ tool.label }}</span>
      </button>
    </div>
    
    <!-- Формы инструментов -->
    <Transition name="slide-down">
      <div v-if="activeTool" class="tool-form">
        <!-- Текст -->
        <template v-if="activeTool === 'text'">
          <div class="form-group">
            <label>Сообщение</label>
            <textarea 
              v-model="textForm.text" 
              placeholder="Введите текст..."
              rows="3"
            ></textarea>
          </div>
          <label class="checkbox-label">
            <input type="checkbox" v-model="textForm.isSecret" />
            Секретно (только видевшие увидят)
          </label>
        </template>
        
        <!-- Проверка навыка -->
        <template v-else-if="activeTool === 'skill-check'">
          <!-- Селектор типа проверки - 6 кнопок -->
          <div class="form-group">
            <label>Тип проверки</label>
            <div class="check-type-grid">
              <button
                v-for="ct in checkTypes"
                :key="ct.id"
                type="button"
                class="check-type-btn"
                :class="{ active: skillCheckForm.checkType === ct.id }"
                :style="{ '--check-color': ct.color }"
                @click="skillCheckForm.checkType = ct.id"
              >
                <Icon :icon="ct.icon" class="check-type-icon" />
                <span>{{ ct.name }}</span>
              </button>
            </div>
          </div>
          
          <!-- Слайдер сложности -->
          <div class="form-group">
            <label>
              Сложность: 
              <span 
                class="difficulty-badge"
                :style="{ 
                  backgroundColor: currentDifficulty.color,
                  color: currentDifficulty.lightText ? '#fff' : '#000'
                }"
              >
                {{ currentDifficulty.name }} ({{ currentDifficulty.value }})
              </span>
            </label>
            <div class="difficulty-slider-container">
              <input 
                type="range" 
                v-model.number="skillCheckForm.difficultyIndex" 
                :min="0" 
                :max="difficultyLevels.length - 1"
                class="difficulty-slider"
                :style="{ '--slider-color': currentDifficulty.color }"
              />
              <div class="difficulty-marks">
                <span 
                  v-for="(diff, idx) in difficultyLevels" 
                  :key="diff.value"
                  class="difficulty-mark"
                  :class="{ active: idx === skillCheckForm.difficultyIndex }"
                  :style="{ left: `${(idx / (difficultyLevels.length - 1)) * 100}%` }"
                  :title="diff.name"
                >
                  <span 
                    class="mark-dot"
                    :style="{ backgroundColor: diff.color }"
                  ></span>
                </span>
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label>Описание (опц.)</label>
            <input type="text" v-model="skillCheckForm.description" placeholder="Что проверяем?" />
          </div>
          <label class="checkbox-label">
            <input type="checkbox" v-model="skillCheckForm.isSecret" />
            Секретная проверка
          </label>
        </template>
        
        <!-- Приглашение в бой -->
        <template v-else-if="activeTool === 'battle-invite'">
          <div class="form-group">
            <label>Описание (опц.)</label>
            <input type="text" v-model="battleInviteForm.description" placeholder="Начало битвы..." />
          </div>
          <div class="form-group">
            <label>Карта сражения (опц.)</label>
            <select v-model="battleInviteForm.mapId">
              <option value="">Текущая карта</option>
              <option v-for="map in battleMapStore.maps" :key="map.id" :value="map.id">
                {{ map.name || 'Карта ' + map.id.slice(0, 6) }}
              </option>
            </select>
          </div>
        </template>
        
        <!-- Изображение -->
        <template v-else-if="activeTool === 'image'">
          <div class="form-group">
            <label>URL изображения</label>
            <input type="url" v-model="imageForm.url" placeholder="https://..." />
          </div>
          <!-- Предпросмотр картинки -->
          <div v-if="imageForm.url.trim()" class="image-preview">
            <img 
              :src="imageForm.url" 
              alt="Предпросмотр" 
              @error="$event.target.style.display = 'none'"
              @load="$event.target.style.display = 'block'"
            />
          </div>
          <div class="form-group">
            <label>Описание</label>
            <textarea v-model="imageForm.description" placeholder="Что на картинке?" rows="2"></textarea>
          </div>
          <button class="clear-btn" @click="clearSceneImage">
            <Icon icon="mdi:image-off" />
            Очистить изображение сцены
          </button>
        </template>
        
        <!-- Важное сообщение -->
        <template v-else-if="activeTool === 'important'">
          <div class="form-group">
            <label>Заголовок</label>
            <input type="text" v-model="importantForm.title" placeholder="Важное событие!" />
          </div>
          <div class="form-group">
            <label>Текст</label>
            <textarea v-model="importantForm.text" placeholder="Подробности..." rows="2"></textarea>
          </div>
          <div class="form-group">
            <label>Иконка</label>
            <div class="icon-picker">
              <button
                v-for="icon in importantIcons"
                :key="icon.value"
                type="button"
                class="icon-option"
                :class="{ active: importantForm.icon === icon.value }"
                :title="icon.label"
                @click="importantForm.icon = icon.value"
              >
                <Icon :icon="icon.value" />
              </button>
            </div>
          </div>
        </template>
        
        <!-- Квест -->
        <template v-else-if="activeTool === 'quest'">
          <div class="form-group">
            <label>Название квеста</label>
            <input type="text" v-model="questForm.title" placeholder="Найти сокровище..." />
          </div>
          <div class="form-group">
            <label>Описание</label>
            <textarea v-model="questForm.description" placeholder="Подробности задания..." rows="2"></textarea>
          </div>
          <div class="form-group">
            <label>Цели (по одной на строку)</label>
            <textarea v-model="questForm.objectives" placeholder="Поговорить с NPC&#10;Найти ключ&#10;Открыть дверь" rows="3"></textarea>
          </div>
        </template>
        
        <!-- Выдача предмета -->
        <template v-else-if="activeTool === 'item-give'">
          <div class="form-row">
            <div class="form-group flex-1">
              <label>Предмет</label>
              <input type="text" v-model="itemGiveForm.itemName" placeholder="Зелье здоровья" />
            </div>
            <div class="form-group quantity">
              <label>Кол-во</label>
              <input type="number" v-model.number="itemGiveForm.quantity" min="1" />
            </div>
          </div>
        </template>
        
        <!-- Приглашение создать персонажа -->
        <template v-else-if="activeTool === 'character-invite'">
          <p class="form-hint">Игрок получит приглашение создать нового персонажа</p>
          
          <!-- Ограничения -->
          <div class="constraints-section">
            <div class="constraints-header" @click="showConstraints = !showConstraints">
              <Icon :icon="showConstraints ? 'mdi:chevron-down' : 'mdi:chevron-right'" />
              <span>Ограничения</span>
              <span v-if="hasConstraints" class="constraints-badge">{{ constraintsCount }}</span>
            </div>
            
            <div v-if="showConstraints" class="constraints-body">
              <!-- Разрешённые расы -->
              <div class="constraint-group">
                <label>Разрешённые расы <span class="hint">(пусто = все)</span></label>
                <div class="chips-grid">
                  <button
                    v-for="race in racesData.races"
                    :key="race.id"
                    class="chip"
                    :class="{ active: characterInviteForm.allowedRaces.includes(race.id) }"
                    @click="toggleConstraint('allowedRaces', race.id)"
                  >
                    {{ race.name }}
                  </button>
                </div>
              </div>
              
              <!-- Разрешённые классы -->
              <div class="constraint-group">
                <div class="constraint-header">
                  <label>Разрешённые классы <span class="hint">(пусто = все)</span></label>
                  <button 
                    class="preset-btn"
                    @click="applyInnerClassesPreset"
                    title="Только внутренние классы (между двумя аспектами)"
                  >
                    ⚙️ Внутренние
                  </button>
                </div>
                <div class="chips-grid">
                  <button
                    v-for="cls in classesData.classes"
                    :key="cls.id"
                    class="chip"
                    :class="{ active: characterInviteForm.allowedClasses.includes(cls.id) }"
                    @click="toggleConstraint('allowedClasses', cls.id)"
                  >
                    {{ typeof cls.name === 'object' ? cls.name.m : cls.name }}
                  </button>
                </div>
              </div>
              
              <!-- Wealth и Epoch -->
              <div class="constraint-row">
                <div class="constraint-slider">
                  <label>Благосостояние: {{ characterInviteForm.maxWealth }}</label>
                  <input type="range" min="1" max="10" v-model.number="characterInviteForm.maxWealth" />
                </div>
                <div class="constraint-slider">
                  <label>Эпоха: {{ characterInviteForm.maxEpoch }}</label>
                  <input type="range" min="1" max="10" v-model.number="characterInviteForm.maxEpoch" />
                </div>
              </div>
            </div>
          </div>
        </template>
        
        <!-- === Секция отправки === -->
        <!-- Для character-invite - показываем игроков -->
        <template v-if="activeTool === 'character-invite'">
          <div class="send-section">
            <div class="send-label">Отправить игроку:</div>
            
            <div class="recipients-grid">
              <!-- Аватары игроков -->
              <button
                v-for="player in targetPlayers"
                :key="player.userId"
                class="recipient-btn"
                :class="{ sent: player.sent, offline: !player.online }"
                :disabled="!isFormValid || player.sent"
                @click="sendInviteToPlayer(player.userId)"
                :title="player.sent ? `Отправлено: ${player.alias}` : `Отправить: ${player.alias}` + (!player.online ? ' (офлайн)' : '')"
              >
                <!-- Аватар игрока -->
                <UserAvatar 
                  v-if="player.avatar"
                  :avatar="player.avatar"
                  size="md"
                  class="player-avatar"
                />
                <div v-else class="char-initial">
                  {{ (player.alias || '?')[0].toUpperCase() }}
                </div>
                <div class="recipient-info">
                  <span class="recipient-name">{{ player.alias }}</span>
                </div>
                <Icon v-if="player.sent" icon="mdi:check-circle" class="sent-icon" />
                <Icon v-else-if="!player.online" icon="mdi:wifi-off" class="offline-icon" />
              </button>
            </div>
            
            <!-- Кнопка "Всем" на отдельной строке -->
            <button
              class="send-all-btn"
              :class="{ sent: allPlayersSent }"
              :disabled="!isFormValid"
              @click="sendInviteToAllPlayers()"
            >
              <Icon icon="mdi:account-group" />
              <span>Отправить всем</span>
            </button>
            
            <!-- Кнопка сохранить как шаблон -->
            <button 
              v-if="isFormValid && !showSaveAsTemplate"
              class="template-btn"
              @click="showSaveAsTemplate = true"
              title="Сохранить как шаблон"
            >
              <Icon icon="mdi:content-save-plus" />
            </button>
            
            <!-- Кнопка завершить, если уже кому-то отправлено -->
            <button 
              v-if="sentToPlayers.size > 0"
              class="finish-btn"
              @click="finishSending"
            >
              <Icon icon="mdi:check" />
              Готово
            </button>
          </div>
        </template>
        
        <!-- Для остальных типов - персонажи -->
        <template v-else>
          <div class="send-section">
            <div class="send-label">Отправить:</div>
            
            <div class="recipients-grid">
              <!-- Портреты персонажей -->
              <button
                v-for="char in targetCharacters"
                :key="char.characterId"
                class="recipient-btn"
                :class="{ sent: char.sent, offline: !char.online }"
                :disabled="!isFormValid || char.sent"
                @click="activeTool === 'image' ? sendImageToCharacter(char.characterId) : sendToCharacter(char.characterId)"
                :title="char.sent ? `Отправлено: ${char.characterName}` : `Отправить: ${char.characterName}` + (!char.online ? ' (игрок офлайн)' : '')"
              >
                <!-- Портрет персонажа -->
                <CharacterPortrait 
                  v-if="char.characterPortrait"
                  :portrait="char.characterPortrait"
                  :size="44"
                  :showBorder="true"
                />
                <div v-else class="char-initial">
                  {{ (char.characterName || '?')[0].toUpperCase() }}
                </div>
                <div class="recipient-info">
                  <span class="recipient-name">{{ char.characterName }}</span>
                  <span class="recipient-char">{{ char.ownerName }}</span>
                </div>
                <Icon v-if="char.sent" icon="mdi:check-circle" class="sent-icon" />
                <Icon v-else-if="!char.online" icon="mdi:wifi-off" class="offline-icon" />
              </button>
            </div>
            
            <!-- Кнопка "Всем" на отдельной строке -->
            <button
              class="send-all-btn"
              :class="{ sent: allCharactersSent }"
              :disabled="!isFormValid"
              @click="activeTool === 'image' ? sendImageToAll() : sendToAll()"
            >
              <Icon icon="mdi:account-group" />
              <span>Отправить всем</span>
            </button>
            
            <!-- Кнопка сохранить как шаблон -->
            <button 
              v-if="isFormValid && !showSaveAsTemplate"
              class="template-btn"
              @click="showSaveAsTemplate = true"
              title="Сохранить как шаблон"
            >
              <Icon icon="mdi:content-save-plus" />
            </button>
            
            <!-- Кнопка завершить, если уже кому-то отправлено -->
            <button 
              v-if="sentToCharacters.size > 0"
              class="finish-btn"
              @click="finishSending"
            >
              <Icon icon="mdi:check" />
              Готово
            </button>
          </div>
        </template>
        
        <!-- Форма сохранения шаблона -->
        <Transition name="slide-down">
          <div v-if="showSaveAsTemplate" class="save-template-form">
            <div class="template-form-header">
              <span>Сохранить как шаблон</span>
              <button class="close-btn" @click="showSaveAsTemplate = false">
                <Icon icon="mdi:close" />
              </button>
            </div>
            
            <div class="form-group">
              <label>Название</label>
              <input 
                v-model="templateName" 
                type="text" 
                placeholder="Название шаблона..."
                class="form-input"
              />
            </div>
            
            <div class="form-group">
              <label>Теги (через запятую)</label>
              <input 
                v-model="templateTags" 
                type="text" 
                placeholder="монстр, босс, подземелье..."
                class="form-input"
              />
            </div>
            
            <div class="form-group">
              <label>Иконка</label>
              <div class="icon-picker">
                <button
                  v-for="iconOpt in templateIcons"
                  :key="iconOpt.icon"
                  class="icon-option"
                  :class="{ active: templateIcon === iconOpt.icon }"
                  :style="{ color: templateIcon === iconOpt.icon ? templateColor : undefined }"
                  @click="templateIcon = iconOpt.icon"
                  :title="iconOpt.label"
                >
                  <Icon :icon="iconOpt.icon" />
                </button>
              </div>
            </div>
            
            <div class="form-group">
              <label>Цвет</label>
              <div class="color-picker">
                <button
                  v-for="color in templateColors"
                  :key="color"
                  class="color-option"
                  :class="{ active: templateColor === color }"
                  :style="{ background: color }"
                  @click="templateColor = color"
                />
              </div>
            </div>
            
            <button 
              class="save-template-btn"
              :disabled="!templateName.trim()"
              @click="saveAsTemplate"
            >
              <Icon icon="mdi:content-save" />
              Сохранить шаблон
            </button>
          </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.master-scene-tools {
  background: #1e293b;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.master-scene-tools.compact {
  padding: 12px;
  gap: 12px;
}

.tools-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tools-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: #e2e8f0;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  color: #64748b;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
}

/* Сетка инструментов */
.tools-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.compact .tools-grid {
  gap: 6px;
}

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s ease;
}

.compact .tool-btn {
  padding: 8px 4px;
}

.tool-btn:hover {
  background: rgba(15, 23, 42, 0.8);
  border-color: var(--tool-color);
}

.tool-btn.active {
  background: color-mix(in srgb, var(--tool-color) 20%, transparent);
  border-color: var(--tool-color);
  color: var(--tool-color);
}

.tool-icon {
  font-size: 24px;
}

.compact .tool-icon {
  font-size: 20px;
}

.tool-label {
  font-size: 11px;
  font-weight: 500;
}

.compact .tool-label {
  font-size: 10px;
}

/* Форма */
.tool-form {
  background: rgba(15, 23, 42, 0.5);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
}

.form-group input,
.form-group textarea,
.form-group select {
  padding: 10px 12px;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 14px;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: #3b82f6;
}

.form-group textarea {
  resize: vertical;
  min-height: 60px;
}

.form-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
}

.form-row .form-group.flex-1 {
  flex: 1;
}

.form-row .form-group.quantity {
  width: 80px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #94a3b8;
  cursor: pointer;
}

.checkbox-label input {
  width: 16px;
  height: 16px;
}

.form-hint {
  font-size: 12px;
  color: #64748b;
  margin: 0;
}

/* Иконки */
.icon-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.icon-option {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #94a3b8;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-option.active {
  border-color: #f59e0b;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

/* === Секция отправки с аватарами === */
.send-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
}

.send-label {
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
}

.recipients-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.recipient-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  min-width: 70px;
}

.recipient-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
}

.recipient-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.recipient-btn.sent {
  background: rgba(34, 197, 94, 0.2);
  border-color: #22c55e;
}

.recipient-btn.offline {
  opacity: 0.5;
  filter: grayscale(0.5);
}

.recipient-btn.offline:hover:not(:disabled) {
  opacity: 0.8;
  filter: grayscale(0);
}

.char-initial {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #475569 0%, #334155 100%);
  border-radius: 50%;
  font-size: 18px;
  font-weight: 700;
  color: #e2e8f0;
  border: 2px solid rgba(148, 163, 184, 0.3);
}

.offline-icon {
  position: absolute;
  top: 4px;
  right: 4px;
  color: #64748b;
  font-size: 12px;
}

.recipient-name {
  font-size: 10px;
  color: #94a3b8;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sent-icon {
  position: absolute;
  top: 4px;
  right: 4px;
  color: #22c55e;
  font-size: 14px;
}

.recipient-btn.send-all {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.3);
}

.recipient-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.recipient-name {
  font-size: 10px;
  color: #94a3b8;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipient-char {
  font-size: 9px;
  color: #64748b;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Кнопка "Всем" на отдельной строке */
.send-all-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2));
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 8px;
  color: #c4b5fd;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.send-all-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3));
  border-color: #8b5cf6;
}

.send-all-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-all-btn.sent {
  background: rgba(34, 197, 94, 0.2);
  border-color: #22c55e;
  color: #22c55e;
}

.finish-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid #22c55e;
  border-radius: 8px;
  color: #22c55e;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.finish-btn:hover {
  background: rgba(34, 197, 94, 0.3);
}

.clear-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: rgba(148, 163, 184, 0.2);
  border: none;
  border-radius: 8px;
  color: #94a3b8;
  font-size: 13px;
  cursor: pointer;
}

.clear-btn:hover {
  background: rgba(148, 163, 184, 0.3);
}

/* Предпросмотр картинки */
.image-preview {
  border-radius: 8px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
}

.image-preview img {
  width: 100%;
  max-height: 200px;
  object-fit: contain;
  display: block;
}

/* === Стили для проверки навыка === */
.check-type-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.check-type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #94a3b8;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.check-type-btn:hover {
  border-color: var(--check-color);
  color: var(--check-color);
}

.check-type-btn.active {
  background: color-mix(in srgb, var(--check-color) 20%, transparent);
  border-color: var(--check-color);
  color: var(--check-color);
}

.check-type-icon {
  font-size: 20px;
}

/* Слайдер сложности */
.difficulty-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.difficulty-slider-container {
  position: relative;
  padding: 8px 0 20px;
}

.difficulty-slider {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(to right, 
    #00DDFF 0%, #00DDFF 15%,
    #00CC44 15%, #00CC44 30%,
    #FFEE00 30%, #FFEE00 45%,
    #FF8800 45%, #FF8800 60%,
    #CC0000 60%, #CC0000 75%,
    #440066 75%, #440066 90%,
    #000000 90%, #000000 100%
  );
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.difficulty-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--slider-color, #fff);
  border: 3px solid #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  cursor: pointer;
}

.difficulty-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--slider-color, #fff);
  border: 3px solid #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  cursor: pointer;
}

.difficulty-marks {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 12px;
}

.difficulty-mark {
  position: absolute;
  transform: translateX(-50%);
}

.mark-dot {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  opacity: 0.5;
}

.difficulty-mark.active .mark-dot {
  width: 8px;
  height: 8px;
  opacity: 1;
  box-shadow: 0 0 4px currentColor;
}

/* === Кнопка шаблона === */
.template-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  background: rgba(139, 92, 246, 0.1);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 8px;
  color: #a78bfa;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.template-btn:hover {
  background: rgba(139, 92, 246, 0.2);
  border-color: #8b5cf6;
}

/* === Форма сохранения шаблона === */
.save-template-form {
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(139, 92, 246, 0.3);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.template-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 600;
  color: #a78bfa;
}

.template-form-header .close-btn {
  font-size: 16px;
  padding: 2px;
}

.form-input {
  padding: 8px 10px;
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 6px;
  color: #e2e8f0;
  font-size: 13px;
}

.form-input:focus {
  outline: none;
  border-color: #8b5cf6;
}

.color-picker {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.color-option {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.active {
  border-color: white;
  box-shadow: 0 0 8px currentColor;
}

.save-template-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3));
  border: 1px solid #8b5cf6;
  border-radius: 8px;
  color: #c4b5fd;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.save-template-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(59, 130, 246, 0.4));
}

.save-template-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Анимации */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.2s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* === Constraints Section === */
.constraints-section {
  margin-top: 12px;
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 8px;
  overflow: hidden;
}

.constraints-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(30, 41, 59, 0.5);
  cursor: pointer;
  font-size: 13px;
  color: #94a3b8;
  transition: background 0.15s;
}

.constraints-header:hover {
  background: rgba(51, 65, 85, 0.5);
}

.constraints-badge {
  margin-left: auto;
  padding: 2px 8px;
  background: #3b82f6;
  color: white;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}

.constraints-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: rgba(15, 23, 42, 0.5);
}

.constraint-group label {
  display: block;
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 8px;
}

.constraint-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.constraint-header label {
  margin-bottom: 0;
}

.preset-btn {
  padding: 4px 10px;
  font-size: 11px;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #60a5fa;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.preset-btn:hover {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.6);
}

.constraint-group label .hint {
  color: #64748b;
  font-weight: normal;
}

.chips-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  padding: 4px 10px;
  font-size: 12px;
  border-radius: 12px;
  border: 1px solid rgba(100, 116, 139, 0.4);
  background: rgba(30, 41, 59, 0.5);
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s;
}

.chip:hover {
  border-color: #3b82f6;
  color: #e2e8f0;
}

.chip.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
  color: #3b82f6;
}

.constraint-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.constraint-slider {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.constraint-slider label {
  font-size: 12px;
  color: #94a3b8;
}

.constraint-slider input[type="range"] {
  width: 100%;
  accent-color: #3b82f6;
}
</style>
