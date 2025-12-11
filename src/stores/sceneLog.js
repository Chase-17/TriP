import { defineStore } from 'pinia'
import { useSessionStore } from './session'
import { useUserStore } from './user'
import { useCharactersStore } from './characters'

/**
 * Типы событий в логе сцены
 */
export const SceneEventType = {
  // Базовые
  TEXT: 'text',                     // Простое текстовое сообщение
  SYSTEM: 'system',                 // Системное сообщение
  
  // Проверки
  SKILL_CHECK: 'skill-check',       // Проверка навыка (интерактивная)
  SKILL_RESULT: 'skill-result',     // Результат проверки (замороженный)
  
  // Боевые
  BATTLE_INVITE: 'battle-invite',   // Приглашение в бой
  ATTACK_RESULT: 'attack-result',   // Результат атаки
  DAMAGE: 'damage',                 // Нанесённый урон
  
  // Визуальные
  IMAGE: 'image',                   // Изображение с описанием
  CLEAR_IMAGE: 'clear-image',       // Очистка поля изображения
  
  // Квесты и важное
  IMPORTANT: 'important',           // Важное сообщение (квест и т.д.)
  QUEST: 'quest',                   // Получение квеста
  
  // Предметы
  ITEM_GIVE: 'item-give',           // Выдача предмета
  ITEM_TAKE: 'item-take',           // Изъятие предмета
  ITEM_LOOT: 'item-loot',           // Лут для группы (разбирают сами)
  
  // Персонажи
  CHARACTER_INVITE: 'character-invite', // Приглашение создать персонажа
}

/**
 * Фильтры для отображения лога
 */
export const SceneFilters = {
  ALL: 'all',
  CHECKS: 'checks',       // Проверки и их результаты
  COMBAT: 'combat',       // Боевые события
  QUESTS: 'quests',       // Квесты и важное
  ITEMS: 'items',         // Предметы
}

const createEventId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

const MAX_EVENTS = 500

export const useSceneLogStore = defineStore('sceneLog', {
  state: () => ({
    // События лога
    events: [],
    
    // Текущее изображение сцены
    currentImage: null, // { url, description, sentBy, time }
    
    // Активный фильтр
    activeFilter: SceneFilters.ALL,
    
    // Время последнего взаимодействия с инфопанелью
    lastInfoPanelInteraction: Date.now(),
    
    // Автосворачивание инфопанели (таймаут в мс)
    infoPanelAutoHideTimeout: 10000, // 10 секунд
  }),
  
  persist: {
    key: 'trip-scene-log-v1',
    paths: ['events', 'currentImage', 'activeFilter']
  },
  
  getters: {
    /**
     * Отфильтрованные события
     */
    filteredEvents: (state) => {
      if (state.activeFilter === SceneFilters.ALL) {
        return state.events
      }
      
      const filterMap = {
        [SceneFilters.CHECKS]: [
          SceneEventType.SKILL_CHECK,
          SceneEventType.SKILL_RESULT,
        ],
        [SceneFilters.COMBAT]: [
          SceneEventType.BATTLE_INVITE,
          SceneEventType.ATTACK_RESULT,
          SceneEventType.DAMAGE,
        ],
        [SceneFilters.QUESTS]: [
          SceneEventType.IMPORTANT,
          SceneEventType.QUEST,
        ],
        [SceneFilters.ITEMS]: [
          SceneEventType.ITEM_GIVE,
          SceneEventType.ITEM_TAKE,
          SceneEventType.ITEM_LOOT,
        ],
      }
      
      const allowedTypes = filterMap[state.activeFilter] || []
      return state.events.filter(e => allowedTypes.includes(e.type))
    },
    
    /**
     * Есть ли активное изображение
     */
    hasActiveImage: (state) => Boolean(state.currentImage?.url),
    
    /**
     * Незавершённые проверки для текущего пользователя
     */
    pendingChecksForMe: (state) => {
      const userStore = useUserStore()
      return state.events.filter(e => 
        e.type === SceneEventType.SKILL_CHECK &&
        !e.completed &&
        (e.targetUserId === userStore.userId || e.targetUserId === 'all')
      )
    },
    
    /**
     * Важные события (для быстрого доступа)
     */
    importantEvents: (state) => {
      return state.events.filter(e => 
        e.type === SceneEventType.IMPORTANT ||
        e.type === SceneEventType.QUEST
      )
    },
  },
  
  actions: {
    /**
     * Добавить событие в лог
     */
    addEvent(event) {
      const fullEvent = {
        id: createEventId(),
        time: Date.now(),
        ...event
      }
      
      this.events.push(fullEvent)
      
      // Ограничиваем размер лога
      if (this.events.length > MAX_EVENTS) {
        this.events = this.events.slice(-MAX_EVENTS)
      }
      
      return fullEvent
    },
    
    /**
     * Обновить событие (например, завершить проверку)
     */
    updateEvent(eventId, updates) {
      const idx = this.events.findIndex(e => e.id === eventId)
      if (idx !== -1) {
        // Создаём новый массив для корректной реактивности Vue
        this.events = this.events.map((e, i) => 
          i === idx ? { ...e, ...updates } : e
        )
      }
    },
    
    /**
     * Синхронизировать события (при подключении к сессии)
     * Мерджит входящие события с существующими, сортирует по времени
     */
    syncEvents(incomingEvents) {
      if (!Array.isArray(incomingEvents) || incomingEvents.length === 0) return
      
      // Создаём Map для быстрого поиска существующих событий
      const existingMap = new Map(this.events.map(e => [e.id, e]))
      
      // Добавляем новые события или обновляем существующие
      incomingEvents.forEach(event => {
        if (existingMap.has(event.id)) {
          // Обновляем существующее событие если входящее новее
          const existing = existingMap.get(event.id)
          if (event.time >= existing.time) {
            existingMap.set(event.id, { ...existing, ...event })
          }
        } else {
          // Добавляем новое событие
          existingMap.set(event.id, event)
        }
      })
      
      // Преобразуем обратно в массив и сортируем по времени
      this.events = Array.from(existingMap.values())
        .sort((a, b) => a.time - b.time)
      
      // Ограничиваем размер
      if (this.events.length > MAX_EVENTS) {
        this.events = this.events.slice(-MAX_EVENTS)
      }
      
      console.log('[SceneLog] syncEvents: merged to', this.events.length, 'events')
    },
    
    /**
     * Удалить событие (например, когда мастер скрывает его от игрока)
     */
    removeEvent(eventId) {
      const idx = this.events.findIndex(e => e.id === eventId)
      if (idx !== -1) {
        this.events.splice(idx, 1)
        console.log('[SceneLog] removeEvent:', eventId)
      }
    },
    
    /**
     * Установить изображение сцены
     */
    setSceneImage(url, description, sentBy) {
      this.currentImage = {
        url,
        description,
        sentBy,
        time: Date.now()
      }
    },
    
    /**
     * Очистить изображение сцены
     */
    clearSceneImage() {
      this.currentImage = null
    },
    
    /**
     * Установить фильтр
     */
    setFilter(filter) {
      this.activeFilter = filter
    },
    
    /**
     * Обновить время взаимодействия с инфопанелью
     */
    touchInfoPanel() {
      this.lastInfoPanelInteraction = Date.now()
    },
    
    // === Хелперы для создания событий ===
    
    /**
     * Текстовое сообщение
     */
    addTextEvent(text, senderUserId, isSecret = false, targetUserIds = null) {
      return this.addEvent({
        type: SceneEventType.TEXT,
        text,
        senderUserId,
        isSecret,
        targetUserIds, // null = всем, массив = конкретным
      })
    },
    
    /**
     * Системное сообщение
     */
    addSystemEvent(text) {
      return this.addEvent({
        type: SceneEventType.SYSTEM,
        text,
      })
    },
    
    /**
     * Проверка навыка (от мастера игроку)
     */
    addSkillCheck(checkType, difficulty, targetUserId, isSecret = false, description = '') {
      const userStore = useUserStore()
      return this.addEvent({
        type: SceneEventType.SKILL_CHECK,
        checkType,           // Тип проверки (например, 'war-knowledge')
        difficulty,          // Сложность (число)
        targetUserId,        // 'all' или конкретный userId
        senderUserId: userStore.userId,
        isSecret,            // Видна только цели
        description,         // Описание ситуации
        completed: false,    // Ещё не выполнена
        result: null,        // Результат после выполнения
      })
    },
    
    /**
     * Завершить проверку навыка (результат)
     */
    completeSkillCheck(eventId, roll, bonus, success, characterId) {
      this.updateEvent(eventId, {
        completed: true,
        result: {
          roll,
          bonus,
          total: roll + bonus,
          success,
          characterId,
          time: Date.now()
        }
      })
    },
    
    /**
     * Приглашение в бой
     */
    addBattleInvite(targetUserIds = null, description = '') {
      const userStore = useUserStore()
      return this.addEvent({
        type: SceneEventType.BATTLE_INVITE,
        targetUserIds,
        senderUserId: userStore.userId,
        description,
      })
    },
    
    /**
     * Изображение с описанием
     */
    addImageEvent(url, description, targetUserIds = null) {
      const userStore = useUserStore()
      
      // Устанавливаем как текущее изображение
      this.setSceneImage(url, description, userStore.userId)
      
      return this.addEvent({
        type: SceneEventType.IMAGE,
        url,
        description,
        targetUserIds,
        senderUserId: userStore.userId,
      })
    },
    
    /**
     * Важное сообщение
     */
    addImportantEvent(title, text, icon = 'mdi:alert-circle') {
      const userStore = useUserStore()
      return this.addEvent({
        type: SceneEventType.IMPORTANT,
        title,
        text,
        icon,
        senderUserId: userStore.userId,
      })
    },
    
    /**
     * Квест
     */
    addQuestEvent(title, description, objectives = []) {
      const userStore = useUserStore()
      return this.addEvent({
        type: SceneEventType.QUEST,
        title,
        description,
        objectives, // [{ text, completed: false }]
        senderUserId: userStore.userId,
      })
    },
    
    /**
     * Выдача предмета
     */
    addItemGiveEvent(items, targetUserId, description = '') {
      const userStore = useUserStore()
      return this.addEvent({
        type: SceneEventType.ITEM_GIVE,
        items, // [{ id, name, quantity, ... }]
        targetUserId,
        description,
        senderUserId: userStore.userId,
        accepted: false, // Игрок ещё не принял
      })
    },
    
    /**
     * Лут для группы
     */
    addItemLootEvent(items, description = '') {
      const userStore = useUserStore()
      return this.addEvent({
        type: SceneEventType.ITEM_LOOT,
        items, // [{ id, name, quantity, claimedBy: null }]
        description,
        senderUserId: userStore.userId,
      })
    },
    
    /**
     * Изъятие предмета
     */
    addItemTakeEvent(items, targetUserId, description = '') {
      const userStore = useUserStore()
      return this.addEvent({
        type: SceneEventType.ITEM_TAKE,
        items,
        targetUserId,
        description,
        senderUserId: userStore.userId,
      })
    },
    
    /**
     * Приглашение создать персонажа
     */
    addCharacterInviteEvent(targetUserId = 'all', restrictions = {}) {
      const userStore = useUserStore()
      return this.addEvent({
        type: SceneEventType.CHARACTER_INVITE,
        targetUserId,
        restrictions, // { allowedRaces, allowedClasses, maxLevel, etc. }
        senderUserId: userStore.userId,
        accepted: false,
      })
    },
    
    /**
     * Очистить лог (для мастера)
     */
    clearEvents() {
      this.events = []
    },
    
    /**
     * Обработать входящее событие (от сети)
     */
    handleIncomingEvent(event) {
      console.log('[SceneLog] handleIncomingEvent:', event)
      
      // Проверяем, видимо ли событие текущему пользователю
      const userStore = useUserStore()
      
      if (event.isSecret && event.targetUserId !== userStore.userId && event.targetUserId !== 'all') {
        // Секретное событие не для нас - игнорируем
        console.log('[SceneLog] Skipping secret event not for us')
        return
      }
      
      if (event.targetUserIds && Array.isArray(event.targetUserIds) && !event.targetUserIds.includes(userStore.userId)) {
        // Событие адресовано конкретным пользователям, но не нам
        console.log('[SceneLog] Skipping event not targeted to us')
        return
      }
      
      // Добавляем в лог (сохраняем оригинальный id и time)
      const existing = this.events.find(e => e.id === event.id)
      if (existing) {
        // Обновляем существующее
        console.log('[SceneLog] Updating existing event')
        Object.assign(existing, event)
      } else {
        // Добавляем новое
        console.log('[SceneLog] Adding new event, total:', this.events.length + 1)
        this.events.push(event)
        
        // Ограничиваем размер
        if (this.events.length > MAX_EVENTS) {
          this.events = this.events.slice(-MAX_EVENTS)
        }
      }
      
      // Особая обработка для изображений
      if (event.type === SceneEventType.IMAGE) {
        this.currentImage = {
          url: event.url,
          description: event.description,
          sentBy: event.senderUserId,
          time: event.time
        }
      } else if (event.type === SceneEventType.CLEAR_IMAGE) {
        this.currentImage = null
      }
    }
  }
})
