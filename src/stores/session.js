import { defineStore } from 'pinia'
import Peer from 'peerjs'
import { useUserStore } from './user'
import { useBattleMapStore } from './battleMap'
import { useCharactersStore } from './characters'
import { useSceneLogStore } from './sceneLog'

const peerConfig = {
  host: '0.peerjs.com',
  secure: true,
  port: 443,
  path: '/',
  debug: 1
}

const MAX_PERSISTED_MESSAGES = 200

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

const generateRoomCode = () => createId().replace(/-/g, '').slice(0, 6).toUpperCase()

const systemMessage = (text) => ({
  id: createId(),
  type: 'system',
  text,
  sender: 'system',
  senderRole: 'system',
  senderId: 'system',
  time: Date.now()
})

export const useSessionStore = defineStore('session', {
  state: () => ({
    role: null,
    peer: null,
    peerId: '',
    roomId: '',
    status: 'idle',
    error: '',
    connections: [],
    activeConnection: null,
    messages: [],
    reconnectAttempts: 0,
    reconnectTimer: null,
    masterProfile: null, // Профиль мастера для игроков
    
    // Все игроки, которые когда-либо подключались (персистентно)
    // { userId, alias, avatar, lastSeen, characterId }
    knownPlayers: [],
    
    // Сплеш-сообщения (очередь для отображения)
    splashQueue: [],
    currentSplash: null,
    
    // Очередь сообщений для отложенной отправки (режим планирования мастера)
    // Накапливает любые сообщения (анимации, атаки, эффекты и т.д.)
    messageQueue: [],
    isQueuePaused: false, // true = накапливаем сообщения, false = отправляем сразу
    
    // Обработчики сообщений (для внешней регистрации слушателей)
    messageHandlers: {}
  }),
  persist: {
    key: 'trip-session-v1',
    paths: ['role', 'roomId', 'messages', 'knownPlayers'],
    afterRestore: (ctx) => {
      ctx.store.status = 'idle'
      ctx.store.peer = null
      ctx.store.peerId = ''
      ctx.store.connections = []
      ctx.store.activeConnection = null
      ctx.store.reconnectAttempts = 0
      ctx.store.reconnectTimer = null
      ctx.store.messages = Array.isArray(ctx.store.messages)
        ? ctx.store.messages.slice(-MAX_PERSISTED_MESSAGES)
        : []
      
      // Обработчик закрытия страницы - отключаемся от сервера (но не уничтожаем peer)
      // Используем disconnect() вместо destroy() - это позволит серверу быстрее освободить ID
      const handleBeforeUnload = () => {
        if (ctx.store.peer && !ctx.store.peer.destroyed) {
          try {
            // disconnect() отправляет сигнал серверу о закрытии
            ctx.store.peer.disconnect()
          } catch (_) {}
        }
      }
      
      // Обработчик для видимости страницы (mobile browsers)
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden' && ctx.store.peer && !ctx.store.peer.destroyed) {
          // Не отключаемся при скрытии - только при закрытии
        }
      }
      
      // Удаляем старые обработчики
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.addEventListener('beforeunload', handleBeforeUnload)
      
      // Автоматическое переподключение после восстановления состояния
      if (ctx.store.role && ctx.store.roomId) {
        setTimeout(() => {
          try {
            if (ctx.store.role === 'master') {
              ctx.store.addMessage(systemMessage('Восстановление комнаты...'))
              ctx.store.createRoom()
            } else if (ctx.store.role === 'player') {
              ctx.store.addMessage(systemMessage('Переподключение к комнате...'))
              ctx.store.joinRoom(ctx.store.roomId)
            }
          } catch (err) {
            console.error('Ошибка автоподключения:', err)
            ctx.store.addMessage(systemMessage('Не удалось автоматически восстановить соединение.'))
          }
        }, 1000)
      }
    }
  },
  getters: {
    isMaster: (state) => state.role === 'master',
    isPlayer: (state) => state.role === 'player',
    participants(state) {
      const list = []
      if (state.role === 'master' && state.peerId) {
        list.push({ id: state.peerId, label: 'Мастер', role: 'master', online: true })
      }
      state.connections.forEach((entry) => {
        list.push({
          id: entry.peerId,
          label: entry.alias,
          role: 'player',
          online: entry.ready
        })
      })
      return list
    },
    // Карта userId -> профиль для актуальных данных в сообщениях
    userProfiles(state) {
      const userStore = useUserStore()
      const profiles = new Map()
      
      // Текущий пользователь
      profiles.set(userStore.userId, {
        userId: userStore.userId,
        nickname: userStore.nickname,
        avatar: userStore.avatar
      })
      
      // Подключенные игроки (только для мастера)
      if (state.role === 'master') {
        state.connections.forEach(entry => {
          if (entry.userId) {
            profiles.set(entry.userId, {
              userId: entry.userId,
              nickname: entry.alias,
              avatar: entry.avatar
            })
          }
        })
      }
      
      // Мастер (для игроков)
      if (state.role === 'player' && state.masterProfile) {
        profiles.set(state.masterProfile.userId, {
          userId: state.masterProfile.userId,
          nickname: state.masterProfile.nickname,
          avatar: state.masterProfile.avatar
        })
      }
      
      return profiles
    },
    
    // Все игроки: онлайн + известные офлайн
    allPlayers(state) {
      const charactersStore = useCharactersStore()
      const onlineIds = new Set(state.connections.map(c => c.userId))
      
      // Начинаем с онлайн игроков
      const players = state.connections.map(conn => {
        const chars = charactersStore.getCharactersByUserId(conn.userId)
        const mainChar = chars.length > 0 ? chars[0] : null
        // Ищем данные в knownPlayers для получения playerIcon/playerColor
        const knownPlayer = state.knownPlayers.find(kp => kp.userId === conn.userId)
        return {
          userId: conn.userId,
          peerId: conn.peerId,
          alias: conn.alias,
          avatar: conn.avatar,
          playerIcon: conn.playerIcon || knownPlayer?.playerIcon || null,
          playerColor: conn.playerColor || knownPlayer?.playerColor || null,
          online: true,
          characterId: mainChar?.id || null,
          characterName: mainChar?.name || null,
          characterPortrait: mainChar?.portrait || null
        }
      })
      
      // Добавляем офлайн игроков из knownPlayers
      state.knownPlayers.forEach(kp => {
        if (!onlineIds.has(kp.userId)) {
          const chars = charactersStore.getCharactersByUserId(kp.userId)
          const mainChar = chars.length > 0 ? chars[0] : null
          players.push({
            userId: kp.userId,
            peerId: null,
            alias: kp.alias,
            avatar: kp.avatar,
            playerIcon: kp.playerIcon || null,
            playerColor: kp.playerColor || null,
            online: false,
            lastSeen: kp.lastSeen,
            characterId: mainChar?.id || kp.characterId || null,
            characterName: mainChar?.name || null,
            characterPortrait: mainChar?.portrait || null
          })
        }
      })
      
      return players
    }
  },
  actions: {
    // Регистрация обработчика сообщений определённого типа
    onMessage(messageType, handler) {
      if (!this.messageHandlers[messageType]) {
        this.messageHandlers[messageType] = []
      }
      this.messageHandlers[messageType].push(handler)
      
      // Возвращаем функцию отписки
      return () => {
        const handlers = this.messageHandlers[messageType]
        if (handlers) {
          const idx = handlers.indexOf(handler)
          if (idx !== -1) handlers.splice(idx, 1)
        }
      }
    },
    
    // Вызов всех зарегистрированных обработчиков для типа сообщения
    triggerMessageHandlers(messageType, payload) {
      const handlers = this.messageHandlers[messageType]
      if (handlers && handlers.length > 0) {
        handlers.forEach(handler => {
          try {
            handler(payload)
          } catch (err) {
            console.error(`Error in message handler for ${messageType}:`, err)
          }
        })
      }
    },
    
    // Отправка данных мастеру (для игрока)
    sendToMaster(payload) {
      if (!this.activeConnection?.open) {
        console.warn('Нет активного соединения для отправки мастеру')
        return false
      }
      
      const userStore = useUserStore()
      const fullPayload = {
        id: createId(),
        ...payload,
        senderId: userStore.userId,
        time: Date.now()
      }
      
      this.activeConnection.send(fullPayload)
      console.log('Отправлено мастеру:', fullPayload)
      return true
    },
    
    // Отправка ответа на реакцию мастеру (для игрока)
    sendReactionResponse(reactionId, accepted) {
      if (!this.activeConnection?.open) {
        console.warn('Нет активного соединения для отправки ответа на реакцию')
        return
      }
      
      const userStore = useUserStore()
      const payload = {
        id: createId(),
        type: 'reaction-response',
        reactionId,
        accepted,
        userId: userStore.userId,
        time: Date.now()
      }
      
      this.activeConnection.send(payload)
      console.log('Отправлен ответ на реакцию:', payload)
    },
    
    // Отправка уведомления об использовании приглашения на создание персонажа (для игрока)
    sendInviteUsed(inviteId, usage) {
      if (!this.activeConnection?.open) {
        console.warn('Нет активного соединения для отправки уведомления об использовании приглашения')
        return
      }
      
      const payload = {
        id: createId(),
        type: 'invite-used',
        inviteId,
        usage,
        time: Date.now()
      }
      
      this.activeConnection.send(payload)
      console.log('Отправлено уведомление об использовании приглашения:', payload)
    },
    
    // Отправка предложения реакции игроку (для мастера)
    sendReactionPrompt(connectionOrPeerId, reactionData) {
      const payload = {
        id: createId(),
        type: 'reaction-prompt',
        ...reactionData,
        time: Date.now()
      }
      
      // Если передан peerId - ищем соединение
      if (typeof connectionOrPeerId === 'string') {
        const entry = this.connections.find(c => c.peerId === connectionOrPeerId)
        if (entry?.conn?.open) {
          entry.conn.send(payload)
          console.log('Отправлено предложение реакции игроку:', entry.alias)
        }
      } else if (connectionOrPeerId?.open) {
        connectionOrPeerId.send(payload)
      }
    },
    
    clearReconnectTimer() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
    },
    scheduleReconnect() {
      // Если уже есть активный таймер переподключения, не создаём новый
      if (this.reconnectTimer) {
        console.log('[Session] Reconnect already scheduled, skipping')
        return
      }
      
      // Проверяем лимит попыток
      if (this.reconnectAttempts >= 5) {
        console.log('[Session] Max reconnect attempts reached')
        this.addMessage(systemMessage('Превышено количество попыток переподключения.'))
        return
      }
      
      this.clearReconnectTimer()
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
      this.reconnectAttempts += 1
      
      console.log(`[Session] Scheduling reconnect #${this.reconnectAttempts} in ${delay}ms`)
      this.addMessage(systemMessage(`Переподключение через ${Math.round(delay / 1000)} сек...`))
      
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null
        if (this.role === 'master' && this.roomId) {
          this.createRoom()
        } else if (this.role === 'player' && this.roomId) {
          this.joinRoom(this.roomId)
        }
      }, delay)
    },
    setRole(role) {
      if (!['master', 'player'].includes(role)) {
        this.reset()
        return
      }
      if (this.role === role) return
      this.disconnect({ resetRole: false })
      this.role = role
      this.status = 'idle'
      this.error = ''
      this.messages = []
      this.connections = []
      this.roomId = ''
    },
    reset() {
      this.disconnect({ resetRole: true })
      this.messages = []
    },
    disconnect({ resetRole = false, keepPeer = false } = {}) {
      this.clearReconnectTimer()
      
      // Очищаем таймауты создания/подключения
      if (this._createTimeout) {
        clearTimeout(this._createTimeout)
        this._createTimeout = null
      }
      if (this._connectTimeout) {
        clearTimeout(this._connectTimeout)
        this._connectTimeout = null
      }
      
      // Закрываем data connections, но не peer (если keepPeer=true)
      this.connections.forEach((entry) => {
        try {
          entry.conn?.close?.()
        } catch (_) {
          /* noop */
        }
      })
      if (this.activeConnection?.open) {
        try {
          this.activeConnection.close()
        } catch (_) {
          /* noop */
        }
      }
      this.connections = []
      this.activeConnection = null
      
      // Уничтожаем peer только если не keepPeer
      if (!keepPeer && this.peer) {
        try {
          this.peer.destroy?.()
        } catch (_) {
          /* noop */
        }
        this.peer = null
        this.peerId = ''
      }
      
      this.status = 'idle'
      this.error = ''
      if (resetRole) {
        this.role = null
        this.roomId = ''
      }
    },
    leaveRoom() {
      this.disconnect({ resetRole: false })
      this.addMessage(systemMessage('Вы вышли из комнаты.'))
    },
    createNewRoom() {
      // Принудительное создание новой комнаты с очисткой истории
      this.disconnect({ resetRole: false })
      this.role = 'master'
      this.roomId = ''
      this.messages = []
      this.masterProfile = null
      this.createRoom()
    },
    async createRoom() {
      // Защита от повторных вызовов
      if (this.status === 'connecting' && this.role === 'master') {
        console.log('[Session] Already creating room, skipping')
        return
      }
      
      // Если уже готова комната с этим ID, не пересоздаём
      if (this.status === 'ready' && this.peer?.open && this.roomId) {
        console.log('[Session] Room already ready:', this.roomId)
        return
      }
      
      if (this.role !== 'master') {
        this.setRole('master')
      }
      
      // Если roomId уже существует (переподключение), используем его
      if (!this.roomId) {
        this.roomId = generateRoomCode()
        this.messages = []
      }
      
      // Проверяем, можно ли переиспользовать существующий peer
      if (this.peer && !this.peer.destroyed && this.peer.id === this.roomId) {
        console.log('[Session] Reusing existing peer:', this.peer.id)
        
        // Peer уже существует и подключён к серверу
        if (this.peer.open) {
          this.status = 'ready'
          this.peerId = this.peer.id
          this.addMessage(systemMessage(`Комната ${this.roomId} активна.`))
          return
        }
        
        // Peer существует но отключён - пробуем reconnect
        if (this.peer.disconnected && !this.peer.destroyed) {
          console.log('[Session] Attempting peer.reconnect()...')
          this.status = 'connecting'
          this.peer.reconnect()
          return
        }
      }
      
      // Закрываем старые соединения, но создаём новый peer
      this.disconnect({ resetRole: false })
      
      this.error = ''
      this.status = 'connecting'
      
      console.log('[Session] Creating room with ID:', this.roomId)
      
      const peer = new Peer(this.roomId, peerConfig)
      this.peer = peer
      
      // Таймаут на создание комнаты (20 сек)
      this._createTimeout = setTimeout(() => {
        if (this.status === 'connecting') {
          console.log('[Session] Room creation timeout')
          this.error = 'Время ожидания создания комнаты истекло'
          this.status = 'error'
          this.addMessage(systemMessage('Не удалось создать комнату - сервер не отвечает. Попробуйте ещё раз.'))
        }
      }, 20000)
      
      // Устанавливаем коллбэк для уведомления об изменениях профиля
      const userStore = useUserStore()
      userStore.setProfileUpdateCallback((userId, nickname, avatar, playerIcon, playerColor) => {
        this.broadcastProfileUpdate(userId, nickname, avatar, playerIcon, playerColor)
      })
      
      peer.on('open', (id) => {
        if (this._createTimeout) {
          clearTimeout(this._createTimeout)
          this._createTimeout = null
        }
        console.log('[Session] Room created, peer ID:', id)
        this.peerId = id
        this.status = 'ready'
        this.reconnectAttempts = 0
        this.clearReconnectTimer()
        
        // Добавляем сообщение только если это новое создание, а не восстановление
        if (this.messages.length === 0 || !this.messages.some(m => m.text?.includes('готова'))) {
          this.addMessage(systemMessage(`Комната ${this.roomId} готова. Поделитесь кодом с игроками.`))
        } else {
          this.addMessage(systemMessage(`Комната ${this.roomId} восстановлена.`))
        }
      })
      
      peer.on('connection', (conn) => {
        this.handleIncomingConnection(conn)
      })
      
      peer.on('error', (err) => {
        if (this._createTimeout) {
          clearTimeout(this._createTimeout)
          this._createTimeout = null
        }
        const errorMessage = err?.message ?? String(err)
        this.error = errorMessage
        this.status = 'error'
        
        // Специальная обработка ошибки "ID is taken" (unavailable-id)
        // Это означает, что сервер ещё держит старое соединение
        if (errorMessage.includes('is taken') || errorMessage.includes('ID is taken') || err?.type === 'unavailable-id') {
          console.log('[Session] ID is taken - old session still exists on server')
          
          // Уничтожаем текущий peer
          if (this.peer) {
            try {
              this.peer.destroy()
            } catch (_) {}
            this.peer = null
          }
          
          // Пробуем несколько раз с небольшой задержкой
          // PeerJS сервер освобождает ID через ~5-10 секунд после disconnect
          if (this.reconnectAttempts < 5) {
            this.reconnectAttempts += 1
            const delay = 2000 // 2 секунды между попытками
            
            if (this.reconnectAttempts === 1) {
              this.addMessage(systemMessage('Ожидаем освобождения ID...'))
            }
            
            console.log(`[Session] Retry ${this.reconnectAttempts}/5 in ${delay}ms`)
            
            this.clearReconnectTimer()
            this.reconnectTimer = setTimeout(() => {
              this.reconnectTimer = null
              this.status = 'idle' // Сбрасываем статус для повторного вызова
              this.createRoom()
            }, delay)
          } else {
            // После 5 попыток (10 сек) - предлагаем новую комнату
            this.addMessage(systemMessage('Не удалось восстановить комнату. Создайте новую.'))
            this.reconnectAttempts = 0
            this.status = 'error'
          }
          return
        }
        
        // Попытка переподключения при других ошибках
        if (this.reconnectAttempts < 5) {
          this.scheduleReconnect()
        } else {
          this.addMessage(systemMessage('Не удалось восстановить комнату. Попробуйте создать новую.'))
        }
      })
      
      peer.on('disconnected', () => {
        this.status = 'error'
        this.addMessage(systemMessage('Соединение потеряно.'))
        
        if (this.reconnectAttempts < 5) {
          this.scheduleReconnect()
        }
      })
    },
    handleIncomingConnection(conn) {
      const alias = conn.metadata?.alias ?? `Игрок ${conn.peer.slice(-4)}`
      const avatar = conn.metadata?.avatar ?? null
      const userId = conn.metadata?.userId ?? conn.peer
      
      // Проверяем, есть ли уже соединение с таким userId
      const existingEntry = this.connections.find(c => c.userId === userId)
      
      let entry
      if (existingEntry) {
        // Обновляем существующее соединение
        existingEntry.peerId = conn.peer
        existingEntry.alias = alias
        existingEntry.avatar = avatar
        existingEntry.conn = conn
        existingEntry.ready = false
        entry = existingEntry
      } else {
        // Создаем новое соединение
        entry = { peerId: conn.peer, alias, avatar, userId, ready: false, conn }
        this.connections.push(entry)
      }
      
      conn.on('open', () => {
        entry.ready = true
        this.status = 'in-room'
        this.addMessage(systemMessage(`${alias} подключился к комнате.`))
        conn.send(systemMessage('Вы в комнате. Поприветствуйте остальных!'))
        
        // Добавляем/обновляем в knownPlayers
        this.updateKnownPlayer(userId, alias, avatar)
        
        // Отправляем игроку свой профиль
        const userStore = useUserStore()
        const masterProfilePayload = {
          id: createId(),
          type: 'profile-update',
          userId: userStore.userId,
          nickname: userStore.nickname,
          avatar: userStore.avatar,
          time: Date.now()
        }
        conn.send(masterProfilePayload)
        
        // Отправляем игроку последние N сообщений для синхронизации
        const recentMessages = this.messages.slice(-50)
        recentMessages.forEach((msg) => {
          if (msg.type !== 'system') {
            conn.send(msg)
          }
        })
        
        // Отправляем игроку текущую карту и персонажей (с небольшой задержкой для стабильности)
        setTimeout(() => {
          this.sendMapToConnection(conn)
          this.sendCharactersToConnection(conn)
          this.sendSceneEventsToConnection(conn, entry.userId)
        }, 100)
      })
      
      conn.on('data', (payload) => {
        console.log('[Session Master] Received from player:', payload.type, payload.action || '')
        // Обработка по типу сообщения
        if (payload.type === 'profile-update') {
          this.handleProfileUpdate(payload)
          this.broadcastPayload(payload, conn.peer)
        } else if (payload.type === 'character-sync') {
          this.handleCharacterSync(payload)
        } else if (payload.type === 'character-action') {
          // Обработка действий игрока (перемещение, атака и т.д.)
          this.handleCharacterAction(payload, conn)
        } else if (payload.type === 'token-animation') {
          // Анимация движения токена от игрока
          this.handleTokenAnimation(payload, conn)
        } else if (payload.type === 'reaction-response') {
          // Ответ игрока на предложение реакции
          console.log('Получен ответ на реакцию от игрока:', payload)
          this.triggerMessageHandlers('reaction-response', { ...payload, playerPeerId: conn.peer })
        } else if (payload.type === 'invite-used') {
          // Игрок использовал приглашение на создание персонажа
          console.log('[Session Master] Получено уведомление об использовании приглашения:', payload)
          const sceneLogStore = useSceneLogStore()
          sceneLogStore.markInviteUsed(payload.inviteId, payload.usage)
          // Рассылаем всем игрокам чтобы они видели обновление
          this.broadcastPayload(payload, conn.peer)
        } else if (payload.type === 'skill-check-result') {
          // Результат проверки навыка от игрока
          console.log('[Session Master] Получен результат проверки:', payload)
          this.triggerMessageHandlers('skill-check-result', { ...payload, playerPeerId: conn.peer })
          // Пересылаем всем остальным игрокам чтобы они видели результат
          this.broadcastPayload(payload, conn.peer)
        } else if (payload.type === 'scene-event') {
          // Событие сцены - передаём в обработчики (например, результат проверки от игрока)
          this.triggerMessageHandlers('scene-event', payload)
          // Пересылаем всем остальным игрокам
          this.broadcastPayload(payload, conn.peer)
        } else if (payload.type === 'chat') {
          this.addMessage(payload)
          this.broadcastPayload(payload, conn.peer)
        } else {
          // Остальные типы просто пересылаем
          this.addMessage(payload)
          this.broadcastPayload(payload, conn.peer)
        }
      })
      
      conn.on('close', () => {
        // Помечаем соединение как неактивное, но не удаляем сразу
        // (может быть переподключение)
        entry.ready = false
        
        // Удаляем только если это действительно старое соединение
        setTimeout(() => {
          // Если за 5 секунд не переподключился, удаляем
          if (entry.conn === conn && !entry.ready) {
            this.connections = this.connections.filter((item) => item !== entry)
            this.addMessage(systemMessage(`${entry.alias} отключился.`))
            if (this.connections.length === 0) {
              this.status = 'ready'
            }
          }
        }, 5000)
      })
      
      conn.on('error', (err) => {
        this.error = err?.message ?? String(err)
      })
    },
    joinRoom(code) {
      const trimmed = code?.trim().toUpperCase()
      if (!trimmed) {
        this.error = 'Введите код комнаты.'
        return
      }
      
      // Защита от повторных вызовов - если уже подключаемся к этой комнате, игнорируем
      if (this.status === 'connecting' && this.roomId === trimmed) {
        console.log('[Session] Already connecting to room:', trimmed)
        return
      }
      
      // Если уже в комнате, не переподключаемся
      if (this.status === 'in-room' && this.roomId === trimmed && this.activeConnection?.open) {
        console.log('[Session] Already in room:', trimmed)
        return
      }
      
      if (this.role !== 'player') {
        this.setRole('player')
      }
      
      // Очищаем персонажей других игроков из localStorage
      const charactersStore = useCharactersStore()
      charactersStore.cleanupOtherPlayersCharacters()
      
      // Сохраняем сообщения при переподключении
      const wasReconnect = this.roomId === trimmed && this.messages.length > 0
      
      if (!wasReconnect) {
        this.messages = []
      }
      
      this.roomId = trimmed
      this.error = ''
      this.status = 'connecting'
      
      console.log('[Session] Player joining room:', trimmed)
      
      // Проверяем, можно ли переиспользовать существующий peer
      if (this.peer && !this.peer.destroyed) {
        console.log('[Session] Reusing existing player peer:', this.peer.id)
        
        // Peer уже подключён к серверу - сразу подключаемся к мастеру
        if (this.peer.open) {
          this.connectToMaster(trimmed)
          return
        }
        
        // Peer отключён - пробуем reconnect
        if (this.peer.disconnected) {
          console.log('[Session] Attempting peer.reconnect()...')
          
          // Добавляем одноразовый слушатель для reconnect
          const onReconnectOpen = (id) => {
            console.log('[Session] Player peer reconnected with ID:', id)
            this.peerId = id
            this.connectToMaster(trimmed)
          }
          this.peer.once('open', onReconnectOpen)
          
          this.peer.reconnect()
          return
        }
      }
      
      // Закрываем старые соединения и создаём новый peer
      this.disconnect({ resetRole: false })
      this.status = 'connecting'
      
      console.log('[Session] Creating new player peer...')
      console.log('[Session] PeerJS config:', peerConfig)
      
      const peer = new Peer(undefined, peerConfig)
      this.peer = peer
      
      peer.on('open', (id) => {
        console.log('[Session] Player peer opened with ID:', id)
        this.peerId = id
        this.connectToMaster(trimmed)
      })
      
      // Устанавливаем коллбэк для уведомления об изменениях профиля
      const userStore = useUserStore()
      userStore.setProfileUpdateCallback((userId, nickname, avatar, playerIcon, playerColor) => {
        this.broadcastProfileUpdate(userId, nickname, avatar, playerIcon, playerColor)
      })
      
      peer.on('error', (err) => {
        console.log('[Session] Player peer error:', err)
        this.error = err?.message ?? String(err)
        this.status = 'error'
        
        // Переподключение при ошибке
        if (this.reconnectAttempts < 5) {
          this.scheduleReconnect()
        } else {
          this.addMessage(systemMessage('Не удалось подключиться к комнате.'))
        }
      })
      
      peer.on('disconnected', () => {
        this.status = 'error'
        this.addMessage(systemMessage('Соединение с сервером потеряно.'))
        
        if (this.reconnectAttempts < 5) {
          this.scheduleReconnect()
        }
      })
    },
    connectToMaster(roomCode) {
      if (!this.peer) return
      const userStore = useUserStore()
      const alias = userStore.displayName
      const avatar = userStore.avatar
      const userId = userStore.userId
      
      console.log('[Session] Connecting to master:', roomCode)
      
      const conn = this.peer.connect(roomCode, { 
        metadata: { alias, avatar, userId },
        reliable: true
      })
      this.activeConnection = conn
      
      // Таймаут на подключение к мастеру (15 сек)
      this._connectTimeout = setTimeout(() => {
        if (this.status === 'connecting') {
          console.log('[Session] Connection timeout to master')
          this.error = 'Время ожидания подключения истекло'
          this.status = 'error'
          this.addMessage(systemMessage('Не удалось подключиться - мастер не отвечает. Убедитесь, что комната создана.'))
          
          // Попробуем переподключиться
          if (this.reconnectAttempts < 3) {
            this.scheduleReconnect()
          }
        }
      }, 15000)
      
      conn.on('open', () => {
        if (this._connectTimeout) {
          clearTimeout(this._connectTimeout)
          this._connectTimeout = null
        }
        console.log('[Session] Connected to master!')
        this.status = 'in-room'
        this.reconnectAttempts = 0
        this.clearReconnectTimer()
        this.addMessage(systemMessage('Вы подключены к мастеру.'))
        
        // Отправляем своих персонажей мастеру
        setTimeout(() => {
          this.sendCharactersToMaster()
        }, 200)
      })
      
      conn.on('data', (payload) => {
        // Обработка по типу сообщения
        if (payload.type === 'profile-update') {
          this.handleProfileUpdate(payload)
        } else if (payload.type === 'map-sync') {
          this.handleMapSync(payload)
        } else if (payload.type === 'character-sync') {
          this.handleCharacterSync(payload)
        } else if (payload.type === 'pointer-update') {
          // Обновление указки мастера
          this.handlePointerUpdate(payload)
        } else if (payload.type === 'pointer-ping') {
          // Пинг-метка от мастера
          this.handlePointerPing(payload)
        } else if (payload.type === 'pointer-drawing') {
          // Рисунок от мастера
          this.handlePointerDrawing(payload)
        } else if (payload.type === 'pointer-shape') {
          // Фигура от мастера
          this.handlePointerShape(payload)
        } else if (payload.type === 'pointer-clear') {
          // Очистка меток
          this.handlePointerClear(payload)
        } else if (payload.type === 'pointer-measurement') {
          // Измерение расстояния
          this.handlePointerMeasurement(payload)
        } else if (payload.type === 'pointer-range') {
          // Зона досягаемости
          this.handlePointerRange(payload)
        } else if (payload.type === 'scene-sync') {
          // Синхронизация всех событий сцены при подключении
          this.triggerMessageHandlers('scene-sync', payload)
        } else if (payload.type === 'scene-event-hide') {
          // Мастер скрывает событие от этого игрока
          this.triggerMessageHandlers('scene-event-hide', payload)
        } else if (payload.type === 'scene-clear') {
          // Мастер очистил лог - очищаем и у игрока
          const sceneLogStore = useSceneLogStore()
          sceneLogStore.clearAllEvents(false) // false = не отправлять обратно
          console.log('[Session] Scene log cleared by master')
        } else if (payload.type === 'scene-remove-events') {
          // Мастер удалил конкретные события
          const sceneLogStore = useSceneLogStore()
          sceneLogStore.removeEvents(payload.eventIds, false)
          console.log('[Session] Events removed by master:', payload.eventIds?.length)
        } else if (payload.type === 'splash') {
          this.handleSplash(payload)
        } else if (payload.type === 'action-error') {
          // Ошибка действия от мастера
          this.handleActionError(payload)
        } else if (payload.type === 'token-animation') {
          // Анимация движения токена от другого игрока (через мастера)
          console.log('[Session Player] Received token animation:', payload)
          this.triggerMessageHandlers('token-animation', payload)
        } else if (payload.type === 'reaction-prompt') {
          // Предложение реакции от мастера
          this.triggerMessageHandlers('reaction-prompt', payload)
        } else if (payload.type === 'scene-event') {
          // Событие сцены от мастера или другого игрока
          this.triggerMessageHandlers('scene-event', payload)
        } else if (payload.type === 'invite-used') {
          // Другой игрок использовал приглашение - обновляем локально
          console.log('[Session Player] Получено уведомление об использовании приглашения:', payload)
          const sceneLogStore = useSceneLogStore()
          sceneLogStore.markInviteUsed(payload.inviteId, payload.usage)
        } else if (payload.type === 'chat') {
          if (!this.masterProfile && payload.userId) {
            this.masterProfile = {
              userId: payload.userId,
              nickname: null,
              avatar: null
            }
          }
          this.addMessage(payload)
        } else {
          this.addMessage(payload)
        }
      })
      
      conn.on('close', () => {
        console.log('[Session] Connection to master closed')
        this.status = 'error'
        this.addMessage(systemMessage('Мастер закрыл соединение.'))
        
        // Попытка переподключения
        if (this.reconnectAttempts < 5) {
          this.scheduleReconnect()
        } else {
          this.addMessage(systemMessage('Комната недоступна. Проверьте код или создайте новую.'))
        }
      })
      
      conn.on('error', (err) => {
        console.log('[Session] Connection error:', err)
        this.error = err?.message ?? String(err)
        this.status = 'error'
        
        if (this.reconnectAttempts < 5) {
          this.scheduleReconnect()
        }
      })
    },
    sendMessage(text) {
      const content = text?.trim()
      if (!content) return
      if (!this.peer) {
        this.error = 'Нет активного соединения.'
        return
      }
      const userStore = useUserStore()
      const payload = {
        id: createId(),
        type: 'chat',
        text: content,
        userId: userStore.userId, // Ссылка на ID пользователя
        senderRole: this.role ?? 'guest',
        time: Date.now()
      }
      this.addMessage(payload)
      if (this.role === 'master') {
        this.broadcastPayload(payload)
      } else if (this.activeConnection?.open) {
        this.activeConnection.send(payload)
      }
    },
    
    /**
     * Отправить всех персонажей всем игрокам (для синхронизации после создания/обновления)
     */
    broadcastAllCharacters() {
      if (this.role !== 'master') return
      if (!this.connections.length) return
      
      const charactersStore = useCharactersStore()
      
      // Собираем персонажей игроков для отправки
      const playerCharacters = charactersStore.characters
        .filter(c => !c.isNpc)
        .map(c => ({
          id: c.id,
          name: c.name,
          portrait: c.portrait,
          ownerId: c.ownerId,
          ownerNickname: c.ownerNickname,
          isNpc: false,
          combat: c.combat,
          stats: c.stats,
          health: c.health,
          class: c.class,
          race: c.race,
          gender: c.gender,
          skills: c.skills,
          equipment: c.equipment,
          inventory: c.inventory,
          customItems: c.customItems
        }))
      
      // Собираем видимых NPC для отправки
      const visibleNpcs = charactersStore.npcs
        .filter(n => n.visibleToPlayers !== false)
        .map(n => ({
          id: n.id,
          name: n.name,
          portrait: n.portrait,
          ownerId: 'master',
          isNpc: true,
          npcType: n.npcType,
          combat: n.combat,
          stats: n.stats,
          health: n.health,
          class: n.class,
          race: n.race,
          gender: n.gender,
          factions: n.factions,
          skills: n.skills
        }))
      
      const charactersForPlayer = [...playerCharacters, ...visibleNpcs]
      
      console.log('[Session] Broadcasting all characters:', charactersForPlayer.length)
      
      const payload = {
        id: createId(),
        type: 'character-sync',
        action: 'all-characters',
        characters: charactersForPlayer,
        time: Date.now()
      }
      
      this.broadcastPayload(payload)
    },
    
    broadcastPayload(payload, excludePeer) {
      if (!this.connections.length) return
      this.connections.forEach((entry) => {
        if (excludePeer && entry.peerId === excludePeer) return
        if (entry.conn?.open) {
          entry.conn.send(payload)
        }
      })
    },
    
    // Обновить/добавить игрока в список известных
    updateKnownPlayer(userId, alias, avatar, playerIcon, playerColor) {
      const existing = this.knownPlayers.find(p => p.userId === userId)
      if (existing) {
        existing.alias = alias
        existing.avatar = avatar
        if (playerIcon !== undefined) existing.playerIcon = playerIcon
        if (playerColor !== undefined) existing.playerColor = playerColor
        existing.lastSeen = Date.now()
      } else {
        this.knownPlayers.push({
          userId,
          alias,
          avatar,
          playerIcon: playerIcon || null,
          playerColor: playerColor || null,
          lastSeen: Date.now(),
          characterId: null
        })
      }
    },
    
    // Удалить игрока из списка известных
    removeKnownPlayer(userId) {
      this.knownPlayers = this.knownPlayers.filter(p => p.userId !== userId)
    },
    
    handleProfileUpdate(payload) {
      // Обновляем профиль пользователя в connections
      const { userId, nickname, avatar, playerIcon, playerColor } = payload
      if (!userId) return
      
      if (this.role === 'master') {
        // Мастер обновляет данные игрока
        const connection = this.connections.find(c => c.userId === userId)
        if (connection) {
          if (nickname !== undefined) connection.alias = nickname
          if (avatar !== undefined) connection.avatar = avatar
          if (playerIcon !== undefined) connection.playerIcon = playerIcon
          if (playerColor !== undefined) connection.playerColor = playerColor
          
          this.addMessage(systemMessage(`${nickname} обновил профиль.`))
          
          // Также обновляем knownPlayers
          this.updateKnownPlayer(userId, nickname, avatar, playerIcon, playerColor)
        }
      } else if (this.role === 'player') {
        // Игрок обновляет данные мастера
        if (!this.masterProfile) {
          this.masterProfile = { userId, nickname, avatar }
        } else {
          if (nickname !== undefined) this.masterProfile.nickname = nickname
          if (avatar !== undefined) this.masterProfile.avatar = avatar
        }
        
        if (nickname) {
          this.addMessage(systemMessage(`${nickname} обновил профиль.`))
        }
      }
    },
    broadcastProfileUpdate(userId, nickname, avatar, playerIcon, playerColor) {
      const payload = {
        id: createId(),
        type: 'profile-update',
        userId,
        nickname,
        avatar,
        playerIcon,
        playerColor,
        time: Date.now()
      }
      
      // Отправляем всем подключенным пирам
      if (this.role === 'master') {
        this.broadcastPayload(payload)
      } else if (this.activeConnection?.open) {
        this.activeConnection.send(payload)
      }
    },
    addMessage(payload) {
      if (!payload) return
      if (!payload.id) {
        payload.id = createId()
      }
      if (this.messages.some((msg) => msg.id === payload.id)) {
        return
      }
      this.messages.push(payload)
      if (this.messages.length > MAX_PERSISTED_MESSAGES) {
        this.messages = this.messages.slice(-MAX_PERSISTED_MESSAGES)
      }
    },
    
    // ============= СИНХРОНИЗАЦИЯ КАРТЫ =============
    
    /**
     * Отправить текущую карту одному подключению
     */
    sendMapToConnection(conn) {
      if (!conn?.open) {
        console.warn('[Session] sendMapToConnection: connection not open')
        return
      }
      
      const battleMapStore = useBattleMapStore()
      const serializedMap = battleMapStore.getSerializedMap()
      
      if (serializedMap) {
        console.log('[Session] Sending map to player:', serializedMap.name)
        conn.send({
          id: createId(),
          type: 'map-sync',
          action: 'full',
          map: serializedMap,
          time: Date.now()
        })
      } else {
        console.warn('[Session] No active map to send')
      }
    },
    
    /**
     * Отправить всех персонажей одному подключению
     */
    sendCharactersToConnection(conn) {
      if (!conn?.open) {
        console.warn('[Session] sendCharactersToConnection: connection not open')
        return
      }
      
      const charactersStore = useCharactersStore()
      
      // Собираем персонажей игроков для отправки
      const playerCharacters = charactersStore.characters
        .filter(c => !c.isNpc)
        .map(c => ({
          id: c.id,
          name: c.name,
          portrait: c.portrait,
          ownerId: c.ownerId,
          ownerNickname: c.ownerNickname,
          isNpc: false,
          combat: c.combat,
          stats: c.stats,
          class: c.class,
          race: c.race,
          gender: c.gender
        }))
      
      // Собираем видимых NPC для отправки
      const visibleNpcs = charactersStore.npcs
        .filter(n => n.visibleToPlayers !== false)
        .map(n => ({
          id: n.id,
          name: n.name,
          portrait: n.portrait,
          ownerId: 'master',
          isNpc: true,
          npcType: n.npcType,
          combat: n.combat,
          stats: n.stats,
          class: n.class,
          race: n.race,
          gender: n.gender,
          factions: n.factions
        }))
      
      const charactersForPlayer = [...playerCharacters, ...visibleNpcs]
      
      console.log('[Session] Sending characters to player:', charactersForPlayer.length, '(players:', playerCharacters.length, ', npcs:', visibleNpcs.length, ')')
      conn.send({
        id: createId(),
        type: 'character-sync',
        action: 'all-characters',
        characters: charactersForPlayer,
        time: Date.now()
      })
    },
    
    /**
     * Отправить события сцены одному подключению (при подключении/переподключении)
     * Фильтрует события для этого конкретного пользователя и его персонажей
     */
    sendSceneEventsToConnection(conn, userId) {
      if (!conn?.open) {
        console.warn('[Session] sendSceneEventsToConnection: connection not open')
        return
      }
      
      const sceneLogStore = useSceneLogStore()
      const charactersStore = useCharactersStore()
      
      // Получаем ID персонажей этого игрока
      const playerCharacterIds = charactersStore.characters
        .filter(c => c.ownerId === userId && !c.isNpc)
        .map(c => c.id)
      
      // Фильтруем события, которые должны быть видны этому игроку
      const eventsForPlayer = sceneLogStore.events.filter(event => {
        // Если игрок в hiddenFrom - не показываем
        if (event.hiddenFrom && event.hiddenFrom.includes(userId)) {
          return false
        }
        
        // Секретные события только для целевого пользователя
        if (event.isSecret && event.targetUserId !== userId && event.targetUserId !== 'all') {
          return false
        }
        
        // События с targetCharacterIds - показываем если персонаж игрока в списке
        if (event.targetCharacterIds && Array.isArray(event.targetCharacterIds)) {
          const hasPlayerCharacter = event.targetCharacterIds.some(charId => 
            playerCharacterIds.includes(charId)
          )
          if (!hasPlayerCharacter) return false
        }
        
        // События с targetUserIds (старый формат) - только если игрок в списке
        if (event.targetUserIds && Array.isArray(event.targetUserIds) && !event.targetUserIds.includes(userId)) {
          return false
        }
        
        return true
      })
      
      console.log('[Session] Sending scene events to player:', eventsForPlayer.length, 'for characters:', playerCharacterIds.length)
      
      // Помечаем события как доставленные
      eventsForPlayer.forEach(event => {
        if (!event.deliveredTo) event.deliveredTo = []
        if (!event.deliveredTo.includes(userId)) {
          event.deliveredTo.push(userId)
        }
      })
      
      // Отправляем события с пометкой о синхронизации
      conn.send({
        id: createId(),
        type: 'scene-sync',
        events: eventsForPlayer,
        currentImage: sceneLogStore.currentImage,
        time: Date.now()
      })
    },
    
    /**
     * Отправить текущую карту всем игрокам
     */
    broadcastMap() {
      if (this.role !== 'master') return
      
      const battleMapStore = useBattleMapStore()
      const serializedMap = battleMapStore.getSerializedMap()
      
      if (!serializedMap) return
      
      const payload = {
        id: createId(),
        type: 'map-sync',
        action: 'full',
        map: serializedMap,
        time: Date.now()
      }
      
      this.broadcastPayload(payload)
    },
    
    /**
     * Отправить инкрементальное обновление террейна
     */
    broadcastTerrainUpdate(mapId, updates) {
      if (this.role !== 'master') return
      
      const payload = {
        id: createId(),
        type: 'map-sync',
        action: 'terrain-update',
        mapId,
        updates, // [{ key: "0,0", terrain: "grass" }, ...]
        time: Date.now()
      }
      
      this.broadcastPayload(payload)
    },
    
    /**
     * Отправить обновление позиции токена всем игрокам
     * @param {string} mapId - ID карты
     * @param {string} characterId - ID персонажа
     * @param {number} q - новая координата q
     * @param {number} r - новая координата r
     */
    broadcastMapTokenMove(mapId, characterId, q, r) {
      if (this.role !== 'master') return
      
      const payload = {
        id: createId(),
        type: 'map-sync',
        action: 'token-move',
        mapId,
        characterId,
        q,
        r,
        time: Date.now()
      }
      
      this.broadcastPayload(payload)
    },

    /**
     * Игрок запрашивает перемещение своего персонажа
     */
    broadcastCharacterMove(characterId, q, r, facing = null) {
      if (this.role !== 'player') {
        console.warn('[Session] broadcastCharacterMove: not a player')
        return
      }
      
      if (!this.activeConnection?.open) {
        console.warn('[Session] broadcastCharacterMove: no active connection to master')
        return
      }
      
      const userStore = useUserStore()
      const payload = {
        id: createId(),
        type: 'character-action',
        action: 'move',
        characterId,
        q,
        r,
        facing,
        userId: userStore.userId,
        time: Date.now()
      }
      
      console.log('[Session] Sending character move to master:', payload)
      this.activeConnection.send(payload)
    },

    /**
     * Игрок отправляет анимацию движения для синхронизации с мастером
     * @param {string} characterId - ID персонажа
     * @param {Array} path - путь [{q, r}]
     * @param {number} duration - длительность анимации в мс
     * @param {number} finalFacing - финальное направление
     */
    broadcastTokenAnimation(characterId, path, duration, finalFacing = 0) {
      if (this.role !== 'player') {
        console.warn('[Session] broadcastTokenAnimation: not a player')
        return
      }
      
      if (!this.activeConnection?.open) {
        console.warn('[Session] broadcastTokenAnimation: no active connection to master')
        return
      }
      
      const userStore = useUserStore()
      const payload = {
        id: createId(),
        type: 'token-animation',
        characterId,
        path,
        duration,
        finalFacing,
        startTime: Date.now(),
        userId: userStore.userId
      }
      
      console.log('[Session] Sending token animation to master:', payload)
      this.activeConnection.send(payload)
    },
    
    /**
     * Мастер отправляет анимацию движения всем игрокам
     * @param {string} characterId - ID персонажа
     * @param {Array} path - путь [{q, r}]
     * @param {number} duration - длительность анимации в мс
     * @param {number} finalFacing - финальное направление
     * @param {boolean} [bypassQueue=false] - отправить в обход очереди
     */
    broadcastTokenAnimationToPlayers(characterId, path, duration, finalFacing = 0, bypassQueue = false) {
      if (this.role !== 'master') {
        console.warn('[Session] broadcastTokenAnimationToPlayers: not a master')
        return
      }
      
      const userStore = useUserStore()
      const payload = {
        id: createId(),
        type: 'token-animation',
        characterId,
        path,
        duration,
        finalFacing,
        startTime: Date.now(), // Будет обновлён при отправке из очереди
        userId: userStore.userId
      }
      
      // Используем систему очередей
      this.queueOrSend(payload, bypassQueue)
    },
    
    // ============= ОЧЕРЕДЬ СООБЩЕНИЙ (РЕЖИМ ПЛАНИРОВАНИЯ) =============
    
    /**
     * Включить режим планирования - сообщения накапливаются в очереди
     */
    pauseQueue() {
      if (this.role !== 'master') return
      this.isQueuePaused = true
      console.log('[Session] Очередь сообщений приостановлена (режим планирования)')
    },
    
    /**
     * Выключить режим планирования и отправить все накопленные сообщения
     * @param {Object} options
     * @param {boolean} [options.sequential=false] - true = отправлять последовательно (с задержками), false = все сразу
     * @param {number} [options.delay=0] - задержка между сообщениями при sequential режиме (мс)
     */
    flushQueue(options = {}) {
      if (this.role !== 'master') return
      
      const { sequential = false, delay = 0 } = options
      const queue = [...this.messageQueue]
      this.messageQueue = []
      this.isQueuePaused = false
      
      console.log('[Session] Отправка накопленных сообщений:', queue.length, sequential ? 'последовательно' : 'одновременно')
      
      if (!sequential || delay === 0) {
        // Отправляем все сразу с одинаковым startTime
        const now = Date.now()
        queue.forEach(msg => {
          if (msg.type === 'token-animation') {
            msg.startTime = now
          }
          this.broadcastPayload(msg)
          // Также воспроизводим локально для мастера
          this.triggerMessageHandlers(msg.type, msg)
        })
      } else {
        // Отправляем последовательно с задержками
        let currentDelay = 0
        queue.forEach((msg, index) => {
          setTimeout(() => {
            if (msg.type === 'token-animation') {
              msg.startTime = Date.now()
            }
            this.broadcastPayload(msg)
            this.triggerMessageHandlers(msg.type, msg)
          }, currentDelay)
          
          // Для анимаций добавляем их длительность + delay
          if (msg.duration) {
            currentDelay += msg.duration + delay
          } else {
            currentDelay += delay
          }
        })
      }
    },
    
    /**
     * Очистить очередь без отправки
     */
    clearQueue() {
      this.messageQueue = []
      console.log('[Session] Очередь сообщений очищена')
    },
    
    /**
     * Добавить сообщение в очередь или отправить сразу (в зависимости от режима)
     * @param {Object} payload - сообщение для отправки
     * @param {boolean} [bypassQueue=false] - true = отправить в обход очереди
     */
    queueOrSend(payload, bypassQueue = false) {
      if (this.role !== 'master') {
        // Игроки всегда отправляют сразу
        this.broadcastPayload(payload)
        return
      }
      
      if (bypassQueue || !this.isQueuePaused) {
        // Отправляем сразу
        this.broadcastPayload(payload)
        this.triggerMessageHandlers(payload.type, payload)
      } else {
        // Добавляем в очередь
        this.messageQueue.push(payload)
        console.log('[Session] Сообщение добавлено в очередь:', payload.type, 'Всего в очереди:', this.messageQueue.length)
      }
    },

    /**
     * Обработка полученных данных карты (для игроков)
     */
    handleMapSync(payload) {
      if (this.role !== 'player') return
      
      console.log('[Session] Received map sync:', payload.action)
      
      const battleMapStore = useBattleMapStore()
      
      if (payload.action === 'full' && payload.map) {
        console.log('[Session] Applying received map:', payload.map.name)
        battleMapStore.applyReceivedMap(payload.map)
        this.addMessage(systemMessage('Карта синхронизирована.'))
      } else if (payload.action === 'terrain-update' && payload.mapId && payload.updates) {
        battleMapStore.applyTerrainUpdate(payload.mapId, payload.updates)
      } else if (payload.action === 'token-move' && payload.mapId && payload.characterId) {
        // Обновляем позицию токена на карте
        console.log('[Session] Token move:', payload.characterId, 'to', payload.q, payload.r)
        battleMapStore.moveTokenByCharacterId(payload.mapId, payload.characterId, payload.q, payload.r)
      }
    },
    
    // ============= УКАЗКА И МЕТКИ =============
    
    /**
     * Обработка обновления указки (для игроков)
     */
    handlePointerUpdate(payload) {
      if (this.role !== 'player') return
      
      // Динамически импортируем store чтобы избежать циклической зависимости
      import('./pointer').then(({ usePointerStore }) => {
        const pointerStore = usePointerStore()
        pointerStore.receivePointerUpdate(payload)
      })
    },
    
    /**
     * Обработка пинга (для игроков)
     */
    handlePointerPing(payload) {
      if (this.role !== 'player') return
      
      import('./pointer').then(({ usePointerStore }) => {
        const pointerStore = usePointerStore()
        if (payload.ping) {
          pointerStore.receivePing(payload.ping)
        }
      })
    },
    
    /**
     * Обработка рисунка (для игроков)
     */
    handlePointerDrawing(payload) {
      if (this.role !== 'player') return
      
      import('./pointer').then(({ usePointerStore }) => {
        const pointerStore = usePointerStore()
        if (payload.drawing) {
          pointerStore.receiveDrawing(payload.drawing)
        }
      })
    },
    
    /**
     * Обработка фигуры (для игроков)
     */
    handlePointerShape(payload) {
      if (this.role !== 'player') return
      
      import('./pointer').then(({ usePointerStore }) => {
        const pointerStore = usePointerStore()
        if (payload.shape) {
          pointerStore.receiveShape(payload.shape)
        }
      })
    },
    
    /**
     * Обработка очистки меток (для игроков)
     */
    handlePointerClear(payload) {
      if (this.role !== 'player') return
      
      import('./pointer').then(({ usePointerStore }) => {
        const pointerStore = usePointerStore()
        pointerStore.receiveClear(payload.clearType || 'all')
      })
    },
    
    /**
     * Обработка измерения расстояния (для игроков)
     */
    handlePointerMeasurement(payload) {
      if (this.role !== 'player') return
      
      import('./pointer').then(({ usePointerStore }) => {
        const pointerStore = usePointerStore()
        pointerStore.receiveMeasurement(payload)
      })
    },
    
    /**
     * Обработка зоны досягаемости (для игроков)
     */
    handlePointerRange(payload) {
      if (this.role !== 'player') return
      
      import('./pointer').then(({ usePointerStore }) => {
        const pointerStore = usePointerStore()
        pointerStore.receiveRange(payload)
      })
    },
    
    // ============= СИНХРОНИЗАЦИЯ ПЕРСОНАЖЕЙ =============
    
    /**
     * Отправить своих персонажей мастеру (для игроков)
     */
    sendCharactersToMaster() {
      if (this.role !== 'player' || !this.activeConnection?.open) {
        console.log('[Session] sendCharactersToMaster: skipped, role=', this.role, 'connection open=', this.activeConnection?.open)
        return
      }
      
      const charactersStore = useCharactersStore()
      const userStore = useUserStore()
      
      // Убеждаемся что userId инициализирован
      if (!userStore.userId) {
        userStore.initializeProfile()
      }
      
      // Используем peerId как fallback для идентификации
      const ownerId = userStore.userId || this.peerId
      const nickname = userStore.nickname || 'Игрок'
      
      // Получаем всех персонажей пользователя (не NPC)
      const characters = charactersStore.myCharacters.map(c => ({ 
        ...c,
        // Проставляем ownerId если он пуст
        ownerId: c.ownerId || ownerId,
        ownerNickname: c.ownerNickname || nickname
      }))
      
      console.log('[Session] sendCharactersToMaster:', {
        ownerId,
        nickname,
        charactersCount: characters.length,
        characters
      })
      
      this.activeConnection.send({
        id: createId(),
        type: 'character-sync',
        action: 'player-characters',
        characters,
        ownerId,
        ownerNickname: nickname,
        time: Date.now()
      })
    },
    
    /**
     * Отправить обновление персонажа мастеру
     */
    sendCharacterUpdate(characterId) {
      if (this.role !== 'player' || !this.activeConnection?.open) return
      
      const charactersStore = useCharactersStore()
      const character = charactersStore.serializeCharacter(characterId)
      
      if (character) {
        this.activeConnection.send({
          id: createId(),
          type: 'character-sync',
          action: 'update',
          character,
          time: Date.now()
        })
      }
    },
    
    /**
     * Отправить уведомление об удалении персонажа
     * - Игрок отправляет мастеру
     * - Мастер отправляет всем игрокам (broadcast)
     */
    sendCharacterDelete(characterId) {
      const userStore = useUserStore()
      
      const payload = {
        id: createId(),
        type: 'character-sync',
        action: 'delete',
        characterId,
        ownerId: userStore.userId,
        time: Date.now()
      }
      
      if (this.role === 'master') {
        // Мастер отправляет всем игрокам
        this.broadcastPayload(payload)
      } else if (this.activeConnection?.open) {
        // Игрок отправляет мастеру
        this.activeConnection.send(payload)
      }
    },
    
    /**
     * Отправить обновление персонажа игроку (для мастера)
     */
    sendCharacterToPlayer(characterId, playerId) {
      if (this.role !== 'master') return
      
      const conn = this.connections.find(c => c.userId === playerId || c.peerId === playerId)
      if (!conn?.conn?.open) return
      
      const charactersStore = useCharactersStore()
      const character = charactersStore.serializeCharacter(characterId)
      
      if (character) {
        conn.conn.send({
          id: createId(),
          type: 'character-sync',
          action: 'your-character-update',
          character,
          time: Date.now()
        })
      }
    },
    
    /**
     * Отправить информацию о токенах всем игрокам (позиции на карте)
     */
    broadcastTokens() {
      if (this.role !== 'master') return
      
      const charactersStore = useCharactersStore()
      
      // Собираем публичную информацию о всех токенах
      const allTokens = [
        ...charactersStore.allPlayerCharacters.filter(c => c.combat?.position).map(c => charactersStore.serializeTokenInfo(c.id)),
        ...charactersStore.npcs.filter(n => n.combat?.position && n.visibleToPlayers !== false).map(n => ({
          id: n.id,
          name: n.name,
          portrait: n.portrait,
          position: n.combat.position,
          stats: n.stats,
          combat: {
            healthType: n.combat?.healthType,
            wounds: n.combat?.wounds,
            bonusDeadlySlots: n.combat?.bonusDeadlySlots
          },
          isNpc: true,
          npcType: n.npcType,
          factions: n.factions
        }))
      ].filter(Boolean)
      
      const payload = {
        id: createId(),
        type: 'character-sync',
        action: 'tokens',
        tokens: allTokens,
        time: Date.now()
      }
      
      this.broadcastPayload(payload)
    },
    
    /**
     * Обработка синхронизации персонажей
     */
    handleCharacterSync(payload) {
      console.log('[Session] handleCharacterSync:', payload.action, payload)
      const charactersStore = useCharactersStore()
      
      if (this.role === 'master') {
        // Мастер получает персонажей от игроков
        if (payload.action === 'player-characters' && payload.characters) {
          console.log('[Session] Received characters from player:', payload.ownerNickname, 'count:', payload.characters.length)
          
          // Сначала удаляем старых персонажей этого владельца, которых больше нет
          const ownerId = payload.ownerId
          const receivedIds = new Set(payload.characters.map(c => c.id))
          const toRemove = charactersStore.characters
            .filter(c => c.ownerId === ownerId && !c.isNpc && !receivedIds.has(c.id))
            .map(c => c.id)
          
          toRemove.forEach(id => {
            console.log('[Session] Removing stale character:', id)
            charactersStore.deleteCharacter(id)
          })
          
          // Добавляем/обновляем полученных персонажей
          payload.characters.forEach(char => {
            console.log('[Session] Applying character:', char.name, char.id)
            charactersStore.applyReceivedCharacter({
              ...char,
              ownerId: payload.ownerId,
              ownerNickname: payload.ownerNickname
            })
          })
          
          // Отправляем всех персонажей всем игрокам для синхронизации
          this.broadcastAllCharacters()
        } else if (payload.action === 'update' && payload.character) {
          charactersStore.applyReceivedCharacter(payload.character)
        } else if (payload.action === 'delete' && payload.characterId) {
          console.log('[Session] Deleting character:', payload.characterId)
          charactersStore.deleteCharacter(payload.characterId)
        }
      } else if (this.role === 'player') {
        // Игрок получает обновления от мастера
        if (payload.action === 'your-character-update' && payload.character) {
          console.log('[Session] Received character update from master')
          charactersStore.applyReceivedCharacter(payload.character)
        } else if (payload.action === 'delete' && payload.characterId) {
          // Мастер удалил персонажа или NPC
          console.log('[Session] Master deleted character/NPC:', payload.characterId)
          charactersStore.deleteCharacter(payload.characterId)
          charactersStore.deleteNpc(payload.characterId)
        } else if (payload.action === 'all-characters' && payload.characters) {
          // Получаем всех персонажей от мастера (другие игроки и видимые NPC)
          console.log('[Session] Received all characters from master:', payload.characters.length)
          const userStore = useUserStore()
          
          // Собираем ID полученных персонажей
          const receivedIds = new Set(payload.characters.map(c => c.id))
          
          // Удаляем персонажей которых больше нет (кроме своих)
          const toRemove = charactersStore.characters
            .filter(c => c.ownerId !== userStore.userId && !receivedIds.has(c.id))
            .map(c => c.id)
          toRemove.forEach(id => charactersStore.deleteCharacter(id))
          
          // Также удаляем NPC которых больше нет
          const npcToRemove = charactersStore.npcs
            .filter(n => !receivedIds.has(n.id))
            .map(n => n.id)
          npcToRemove.forEach(id => charactersStore.deleteNpc(id))
          
          // Удаляем из otherTokens токены которых больше нет
          charactersStore.otherTokens = charactersStore.otherTokens.filter(t => 
            t.ownerId === userStore.userId || receivedIds.has(t.id)
          )
          
          // Применяем персонажей - включая своих (applyReceivedCharacter использует updatedAt для разрешения конфликтов)
          payload.characters.forEach(char => {
            charactersStore.applyReceivedCharacter(char)
          })
        } else if (payload.action === 'tokens' && payload.tokens) {
          // Обновляем информацию о токенах других игроков и NPC
          // Фильтруем только своих персонажей, NPC (isNpc=true) пропускаем
          const userStore = useUserStore()
          charactersStore.updateOtherTokens(payload.tokens.filter(t => 
            t.isNpc || t.ownerId !== userStore.userId
          ))
        }
      }
    },
    
    /**
     * Обработка действий персонажа от игрока (на стороне мастера)
     */
    handleCharacterAction(payload, conn) {
      if (this.role !== 'master') return
      
      console.log('[Session] handleCharacterAction:', payload.action, payload)
      
      const battleMapStore = useBattleMapStore()
      const charactersStore = useCharactersStore()
      
      if (payload.action === 'move' && payload.characterId && payload.q !== undefined && payload.r !== undefined) {
        // Проверяем, что персонаж принадлежит этому игроку
        const character = charactersStore.characters.find(c => c.id === payload.characterId)
        if (!character) {
          console.warn('[Session] Character not found:', payload.characterId)
          this.sendActionError(conn, 'Персонаж не найден')
          return
        }
        
        // Проверяем, что игрок владеет этим персонажем
        const isOwner = character.ownerId === payload.userId || character.ownerId === conn.peer
        if (!isOwner) {
          console.warn('[Session] Player tried to move character they don\'t own')
          this.sendActionError(conn, 'Вы не можете управлять этим персонажем')
          // Отправляем актуальную карту для отката изменений
          this.sendMapToConnection(conn)
          return
        }
        
        const mapId = battleMapStore.activeMapId
        if (!mapId) {
          this.sendActionError(conn, 'Нет активной карты')
          return
        }
        
        // Проверяем, что целевая клетка свободна
        const targetOccupied = battleMapStore.getTokenAt(mapId, payload.q, payload.r)
        if (targetOccupied && targetOccupied.characterId !== payload.characterId) {
          this.sendActionError(conn, 'Эта клетка занята')
          this.sendMapToConnection(conn)
          return
        }
        
        // НЕ перемещаем токен на карте здесь!
        // Анимация (handleRemoteTokenAnimation в BattleMap) сама переместит токен пошагово.
        // Здесь только обновляем charactersStore для синхронизации состояния персонажа.
        
        // Обновляем позицию в charactersStore
        if (!character.combat?.position) {
          charactersStore.placeOnMap(payload.characterId, mapId, payload.q, payload.r)
        } else {
          charactersStore.moveOnMap(payload.characterId, payload.q, payload.r)
        }
        
        console.log('[Session] Character position updated (animation handles map token):', payload.characterId, 'to', payload.q, payload.r, 'facing:', payload.facing)
        
        // Рассылаем обновление персонажей всем игрокам (не карту - она обновляется анимацией)
        this.broadcastAllCharacters()
      }
    },

    /**
     * Обработка анимации движения токена от игрока (на стороне мастера)
     * Передаёт анимацию на UI для воспроизведения и пересылает другим игрокам
     */
    handleTokenAnimation(payload, conn) {
      if (this.role !== 'master') return
      
      console.log('[Session] handleTokenAnimation:', payload)
      
      const charactersStore = useCharactersStore()
      
      // Проверяем, что персонаж принадлежит этому игроку
      const character = charactersStore.characters.find(c => c.id === payload.characterId)
      if (!character) {
        console.warn('[Session] Character not found:', payload.characterId)
        return
      }
      
      console.log('[Session] handleTokenAnimation - character.ownerId:', character.ownerId, 'payload.userId:', payload.userId)
      
      // Проверяем владельца - может быть по peerId или userId
      const isOwner = character.ownerId === payload.userId || character.ownerId === conn.peer
      if (!isOwner) {
        console.warn('[Session] Player tried to animate character they don\'t own, ownerId:', character.ownerId, 'userId:', payload.userId, 'peerId:', conn.peer)
        return
      }
      
      // Передаём анимацию в обработчики UI
      console.log('[Session] Triggering token-animation handlers')
      this.triggerMessageHandlers('token-animation', payload)
      
      // Пересылаем другим игрокам (кроме отправителя)
      this.broadcastPayload(payload, conn.peer)
    },
    
    /**
     * Отправить сообщение об ошибке действия игроку
     */
    sendActionError(conn, message) {
      if (!conn?.open) return
      
      conn.send({
        id: createId(),
        type: 'action-error',
        message,
        time: Date.now()
      })
    },

    // ============= СПЛЕШ-СООБЩЕНИЯ И АССЕТЫ =============
    
    /**
     * Отправить сплеш-сообщение игроку (или всем)
     * @param {Object} options - { type, content, duration, targetPlayerId }
     * type: 'damage' | 'heal' | 'effect' | 'notification' | 'image' | 'note'
     */
    sendSplash(options) {
      if (this.role !== 'master') return
      
      const payload = {
        id: createId(),
        type: 'splash',
        splashType: options.type || 'notification',
        content: options.content,
        duration: options.duration || 1500,
        style: options.style || {},
        time: Date.now()
      }
      
      if (options.targetPlayerId) {
        // Отправить конкретному игроку
        const conn = this.connections.find(c => 
          c.userId === options.targetPlayerId || c.peerId === options.targetPlayerId
        )
        if (conn?.conn?.open) {
          conn.conn.send(payload)
        }
      } else {
        // Отправить всем
        this.broadcastPayload(payload)
      }
    },
    
    /**
     * Отправить урон (с эффектом)
     */
    sendDamageEffect(targetPlayerId, amount, source = '') {
      this.sendSplash({
        type: 'damage',
        content: { amount, source },
        duration: 1000,
        targetPlayerId,
        style: { color: '#ef4444' }
      })
    },
    
    /**
     * Отправить исцеление (с эффектом)
     */
    sendHealEffect(targetPlayerId, amount) {
      this.sendSplash({
        type: 'heal',
        content: { amount },
        duration: 1000,
        targetPlayerId,
        style: { color: '#22c55e' }
      })
    },
    
    /**
     * Отправить изображение игрокам (арт, локация, NPC)
     */
    sendImage(options) {
      if (this.role !== 'master') return
      
      const payload = {
        id: createId(),
        type: 'splash',
        splashType: 'image',
        content: {
          url: options.url,
          caption: options.caption || '',
          title: options.title || ''
        },
        duration: options.duration || 5000,
        dismissible: options.dismissible !== false,
        time: Date.now()
      }
      
      if (options.targetPlayerId) {
        const conn = this.connections.find(c => 
          c.userId === options.targetPlayerId || c.peerId === options.targetPlayerId
        )
        if (conn?.conn?.open) {
          conn.conn.send(payload)
        }
      } else {
        this.broadcastPayload(payload)
      }
    },
    
    /**
     * Отправить заметку/текст игрокам
     */
    sendNote(options) {
      if (this.role !== 'master') return
      
      const payload = {
        id: createId(),
        type: 'splash',
        splashType: 'note',
        content: {
          title: options.title || 'Заметка',
          text: options.text,
          style: options.style || 'parchment' // 'parchment', 'scroll', 'letter', 'book'
        },
        duration: options.duration || 0, // 0 = пока не закроют
        dismissible: true,
        time: Date.now()
      }
      
      if (options.targetPlayerId) {
        const conn = this.connections.find(c => 
          c.userId === options.targetPlayerId || c.peerId === options.targetPlayerId
        )
        if (conn?.conn?.open) {
          conn.conn.send(payload)
        }
      } else {
        this.broadcastPayload(payload)
      }
    },
    
    // ============= ОБРАБОТКА СПЛЕШ-СООБЩЕНИЙ =============
    
    /**
     * Обработка ошибки действия от мастера
     */
    handleActionError(payload) {
      console.warn('[Session] Action error from master:', payload.message)
      
      // Показываем ошибку как системное сообщение
      this.addMessage(systemMessage(`⚠️ ${payload.message}`))
      
      // Также можно показать как splash-уведомление
      this.splashQueue.push({
        id: payload.id,
        splashType: 'notification',
        content: payload.message,
        duration: 2000,
        style: { color: '#ff6b6b' }
      })
      
      if (!this.currentSplash) {
        this.showNextSplash()
      }
    },
    
    /**
     * Обработка входящего сплеш-сообщения
     */
    handleSplash(payload) {
      console.log('[Session] Received splash:', payload.splashType)
      
      // Добавляем в очередь
      this.splashQueue.push(payload)
      
      // Если нет активного сплеша - показываем
      if (!this.currentSplash) {
        this.showNextSplash()
      }
    },
    
    /**
     * Показать следующий сплеш из очереди
     */
    showNextSplash() {
      if (this.splashQueue.length === 0) {
        this.currentSplash = null
        return
      }
      
      this.currentSplash = this.splashQueue.shift()
      
      // Если есть duration и он не 0 - автоматически скрыть
      if (this.currentSplash.duration > 0) {
        setTimeout(() => {
          this.dismissSplash()
        }, this.currentSplash.duration)
      }
    },
    
    /**
     * Закрыть текущий сплеш
     */
    dismissSplash() {
      this.currentSplash = null
      
      // Показываем следующий если есть
      if (this.splashQueue.length > 0) {
        setTimeout(() => {
          this.showNextSplash()
        }, 200)
      }
    },
    
    /**
     * Очистить все сплеши
     */
    clearSplashes() {
      this.splashQueue = []
      this.currentSplash = null
    }
  }
})
