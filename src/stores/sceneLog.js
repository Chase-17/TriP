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

// Максимум событий в памяти (localStorage лимит ~5MB)
const MAX_EVENTS = 3000

// Сколько событий показывать в DOM за раз
const PAGE_SIZE = 50

// Debounce для persist (мс)
const PERSIST_DEBOUNCE = 2000

// Таймер для debounce persist
let persistTimer = null

export const useSceneLogStore = defineStore('sceneLog', {
  state: () => ({
    // События лога
    events: [],
    
    // Текущее изображение сцены
    currentImage: null, // { url, description, sentBy, time }
    
    // Активный фильтр
    activeFilter: SceneFilters.ALL,
    
    // Перспектива мастера - от имени какого игрока смотреть (null = всё)
    perspectiveUserId: null,
    
    // Время последнего взаимодействия с инфопанелью
    lastInfoPanelInteraction: Date.now(),
    
    // Автосворачивание инфопанели (таймаут в мс)
    infoPanelAutoHideTimeout: 10000, // 10 секунд
    
    // === Пагинация ===
    // Сколько страниц загружено (показываем PAGE_SIZE * loadedPages событий)
    loadedPages: 1,
    
    // Флаг для отложенного сохранения
    _pendingPersist: false,
  }),
  
  persist: {
    key: 'trip-scene-log-v2',
    paths: ['events', 'currentImage', 'activeFilter'],
    // Кастомный сериализатор с защитой от слишком большого лога
    serializer: {
      serialize: (state) => {
        try {
          // Если событий слишком много, сохраняем только последние MAX_EVENTS
          const eventsToSave = state.events?.length > MAX_EVENTS 
            ? state.events.slice(-MAX_EVENTS)
            : state.events
          
          const dataToSave = {
            ...state,
            events: eventsToSave
          }
          
          return JSON.stringify(dataToSave)
        } catch (e) {
          console.error('[SceneLog] Serialize error:', e)
          return JSON.stringify({ events: [], currentImage: null, activeFilter: 'all' })
        }
      },
      deserialize: (value) => {
        try {
          return JSON.parse(value)
        } catch (e) {
          console.error('[SceneLog] Deserialize error:', e)
          return { events: [], currentImage: null, activeFilter: 'all' }
        }
      }
    },
    // Миграция со старой версии
    beforeRestore: (ctx) => {
      try {
        const oldData = localStorage.getItem('trip-scene-log-v1')
        if (oldData && !localStorage.getItem('trip-scene-log-v2')) {
          localStorage.setItem('trip-scene-log-v2', oldData)
          localStorage.removeItem('trip-scene-log-v1')
        }
      } catch (e) {
        console.warn('[SceneLog] Migration failed:', e)
      }
    }
  },
  
  getters: {
    /**
     * Отфильтрованные события
     * Учитывает как тип события (activeFilter), так и перспективу (perspectiveUserId)
     */
    filteredEvents: (state) => {
      let events = state.events
      
      // Фильтр по перспективе (для мастера - от имени какого игрока смотреть)
      if (state.perspectiveUserId) {
        const charactersStore = useCharactersStore()
        // Получаем ID персонажей этого игрока
        const playerCharacterIds = charactersStore.characters
          .filter(c => c.ownerId === state.perspectiveUserId && !c.isNpc)
          .map(c => c.id)
        
        events = events.filter(e => {
          // Публичные события (без targetCharacterIds и targetUserIds) - показываем всем
          const isPublic = (!e.targetCharacterIds || e.targetCharacterIds.length === 0) &&
                          (!e.targetUserIds || e.targetUserIds.length === 0)
          if (isPublic) {
            return !e.isSecret
          }
          
          // Проверяем targetCharacterIds (новый формат)
          if (e.targetCharacterIds && Array.isArray(e.targetCharacterIds)) {
            const hasPlayerCharacter = e.targetCharacterIds.some(charId => 
              playerCharacterIds.includes(charId)
            )
            if (hasPlayerCharacter) return true
          }
          
          // Проверяем targetUserIds (старый формат)
          if (e.targetUserIds && Array.isArray(e.targetUserIds)) {
            return e.targetUserIds.includes(state.perspectiveUserId)
          }
          
          return false
        })
      }
      
      // Фильтр по типу события
      if (state.activeFilter === SceneFilters.ALL) {
        return events
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
    
    /**
     * Общее количество отфильтрованных событий
     */
    totalFilteredCount() {
      return this.filteredEvents.length
    },
    
    /**
     * Пагинированные события для отображения в DOM
     * Возвращает последние N событий, где N = PAGE_SIZE * loadedPages
     */
    paginatedEvents(state) {
      const filtered = this.filteredEvents
      const limit = PAGE_SIZE * state.loadedPages
      // Берём последние события (самые новые в конце)
      if (filtered.length <= limit) {
        return filtered
      }
      return filtered.slice(-limit)
    },
    
    /**
     * Есть ли ещё события для загрузки
     */
    hasMoreEvents(state) {
      const filtered = this.filteredEvents
      const limit = PAGE_SIZE * state.loadedPages
      return filtered.length > limit
    },
    
    /**
     * Сколько ещё событий можно загрузить
     */
    remainingEventsCount(state) {
      const filtered = this.filteredEvents
      const limit = PAGE_SIZE * state.loadedPages
      return Math.max(0, filtered.length - limit)
    },
    
    /**
     * Общее количество событий в логе
     */
    totalEventsCount: (state) => state.events.length,
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
     * Отметить приглашение на создание персонажа как использованное
     * @param {string} inviteId - ID события приглашения
     * @param {object} usage - информация об использовании { userId, characterId, characterName, characterPortrait }
     */
    markInviteUsed(inviteId, usage) {
      const idx = this.events.findIndex(e => e.id === inviteId && e.type === SceneEventType.CHARACTER_INVITE)
      if (idx === -1) {
        console.warn('[SceneLog] markInviteUsed: event not found:', inviteId)
        return
      }
      
      const event = this.events[idx]
      
      // Проверяем, не использовал ли уже этот пользователь
      if (event.usedBy?.some(u => u.userId === usage.userId)) {
        console.warn('[SceneLog] markInviteUsed: already used by this user:', usage.userId)
        return
      }
      
      // Добавляем usage в массив usedBy
      const usedBy = [...(event.usedBy || []), usage]
      
      this.events = this.events.map((e, i) => 
        i === idx ? { ...e, usedBy } : e
      )
      
      console.log('[SceneLog] markInviteUsed:', inviteId, usage.characterName)
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
      // Сбрасываем пагинацию при смене фильтра
      this.loadedPages = 1
    },
    
    // === Пагинация ===
    
    /**
     * Загрузить ещё одну страницу событий
     */
    loadMoreEvents() {
      this.loadedPages++
    },
    
    /**
     * Сбросить пагинацию (показать только последние события)
     */
    resetPagination() {
      this.loadedPages = 1
    },
    
    /**
     * Загрузить все события (осторожно с производительностью!)
     */
    loadAllEvents() {
      const totalPages = Math.ceil(this.filteredEvents.length / PAGE_SIZE)
      this.loadedPages = Math.max(1, totalPages)
    },
    
    // === Управление логом (для мастера) ===
    
    /**
     * Удалить несколько событий по ID
     * @param {boolean} broadcast - отправить игрокам (для мастера)
     */
    removeEvents(eventIds, broadcast = true) {
      if (!Array.isArray(eventIds) || eventIds.length === 0) return
      const idsSet = new Set(eventIds)
      this.events = this.events.filter(e => !idsSet.has(e.id))
      console.log('[SceneLog] removeEvents:', eventIds.length, 'events removed')
      
      // Отправляем игрокам если мастер
      if (broadcast) {
        const sessionStore = useSessionStore()
        if (sessionStore.role === 'master') {
          sessionStore.broadcastPayload({
            type: 'scene-remove-events',
            eventIds
          })
        }
      }
    },
    
    /**
     * Очистить лог полностью
     * @param {boolean} broadcast - отправить игрокам (для мастера)
     */
    clearAllEvents(broadcast = true) {
      const count = this.events.length
      this.events = []
      this.currentImage = null
      this.loadedPages = 1
      console.log('[SceneLog] clearAllEvents:', count, 'events cleared')
      
      // Отправляем игрокам если мастер
      if (broadcast) {
        const sessionStore = useSessionStore()
        if (sessionStore.role === 'master') {
          sessionStore.broadcastPayload({
            type: 'scene-clear'
          })
        }
      }
    },
    
    /**
     * Очистить события старше указанного времени
     * @param {number} olderThanMs - временная метка (Date.now() - X)
     */
    clearEventsOlderThan(olderThanMs) {
      const before = this.events.length
      this.events = this.events.filter(e => e.time >= olderThanMs)
      console.log('[SceneLog] clearEventsOlderThan:', before - this.events.length, 'events cleared')
    },
    
    /**
     * Экспортировать лог в JSON (для сохранения перед очисткой)
     * @returns {object} Объект с событиями и метаданными
     */
    exportLog() {
      return {
        version: 1,
        exportedAt: Date.now(),
        exportedAtISO: new Date().toISOString(),
        totalEvents: this.events.length,
        events: [...this.events],
        currentImage: this.currentImage ? { ...this.currentImage } : null
      }
    },
    
    /**
     * Экспортировать лог и скачать как файл
     * @param {string} filename - имя файла (без расширения)
     */
    downloadLog(filename = 'trip-scene-log') {
      const data = this.exportLog()
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      console.log('[SceneLog] downloadLog:', data.totalEvents, 'events exported')
    },
    
    /**
     * Импортировать лог из JSON (добавляет к существующим)
     * @param {object} data - объект экспорта
     * @param {boolean} replace - заменить существующие события
     */
    importLog(data, replace = false) {
      if (!data || !Array.isArray(data.events)) {
        console.error('[SceneLog] importLog: invalid data')
        return false
      }
      
      if (replace) {
        this.events = data.events
      } else {
        // Мерджим с существующими
        this.syncEvents(data.events)
      }
      
      if (data.currentImage) {
        this.currentImage = data.currentImage
      }
      
      console.log('[SceneLog] importLog:', data.events.length, 'events imported')
      return true
    },
    
    /**
     * Установить перспективу мастера (от имени кого смотреть)
     * @param {string|null} userId - ID пользователя или null для просмотра всего
     */
    setPerspective(userId) {
      this.perspectiveUserId = userId
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
      const existingIdx = this.events.findIndex(e => e.id === event.id)
      if (existingIdx !== -1) {
        // Обновляем существующее на месте
        console.log('[SceneLog] Updating existing event')
        this.events[existingIdx] = { ...this.events[existingIdx], ...event }
      } else {
        // Добавляем новое, вставляя по времени
        console.log('[SceneLog] Adding new event, total:', this.events.length + 1)
        const eventTime = event.time || Date.now()
        // Находим позицию для вставки (по времени)
        let insertIdx = this.events.length
        for (let i = this.events.length - 1; i >= 0; i--) {
          if (this.events[i].time <= eventTime) {
            insertIdx = i + 1
            break
          }
          if (i === 0) {
            insertIdx = 0
          }
        }
        this.events.splice(insertIdx, 0, event)
        
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
