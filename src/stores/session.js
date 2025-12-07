import { defineStore } from 'pinia'
import Peer from 'peerjs'
import { useUserStore } from './user'
import { useBattleMapStore } from './battleMap'
import { useCharactersStore } from './characters'

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
    
    // Сплеш-сообщения (очередь для отображения)
    splashQueue: [],
    currentSplash: null
  }),
  persist: {
    key: 'trip-session-v1',
    paths: ['role', 'roomId', 'messages'],
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
    }
  },
  actions: {
    clearReconnectTimer() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
    },
    scheduleReconnect() {
      this.clearReconnectTimer()
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000)
      this.reconnectAttempts += 1
      
      this.addMessage(systemMessage(`Переподключение через ${Math.round(delay / 1000)} сек...`))
      
      this.reconnectTimer = setTimeout(() => {
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
    disconnect({ resetRole = false } = {}) {
      this.clearReconnectTimer()
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
      if (this.peer) {
        try {
          this.peer.disconnect?.()
          this.peer.destroy?.()
        } catch (_) {
          /* noop */
        }
      }
      this.peer = null
      this.peerId = ''
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
      if (this.role !== 'master') {
        this.setRole('master')
      }
      this.disconnect({ resetRole: false })
      
      // Если roomId уже существует (переподключение), используем его
      if (!this.roomId) {
        this.roomId = generateRoomCode()
        this.messages = []
      }
      
      this.error = ''
      this.status = 'connecting'
      const peer = new Peer(this.roomId, peerConfig)
      this.peer = peer
      
      // Устанавливаем коллбэк для уведомления об изменениях профиля
      const userStore = useUserStore()
      userStore.setProfileUpdateCallback((userId, nickname, avatar) => {
        this.broadcastProfileUpdate(userId, nickname, avatar)
      })
      
      peer.on('open', (id) => {
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
        this.error = err?.message ?? String(err)
        this.status = 'error'
        
        // Попытка переподключения при ошибке
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
        
        // Отправляем игроку текущую карту (с небольшой задержкой для стабильности)
        setTimeout(() => {
          this.sendMapToConnection(conn)
        }, 100)
      })
      
      conn.on('data', (payload) => {
        // Обработка по типу сообщения
        if (payload.type === 'profile-update') {
          this.handleProfileUpdate(payload)
          this.broadcastPayload(payload, conn.peer)
        } else if (payload.type === 'character-sync') {
          this.handleCharacterSync(payload)
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
      if (this.role !== 'player') {
        this.setRole('player')
      }
      this.disconnect({ resetRole: false })
      
      // Сохраняем сообщения при переподключении
      const wasReconnect = this.roomId === trimmed && this.messages.length > 0
      
      if (!wasReconnect) {
        this.messages = []
      }
      
      this.roomId = trimmed
      this.error = ''
      this.status = 'connecting'
      const peer = new Peer(undefined, peerConfig)
      this.peer = peer
      
      // Устанавливаем коллбэк для уведомления об изменениях профиля
      const userStore = useUserStore()
      userStore.setProfileUpdateCallback((userId, nickname, avatar) => {
        this.broadcastProfileUpdate(userId, nickname, avatar)
      })
      
      peer.on('open', (id) => {
        this.peerId = id
        this.connectToMaster(trimmed)
      })
      
      peer.on('error', (err) => {
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
      
      const conn = this.peer.connect(roomCode, { 
        metadata: { alias, avatar, userId } 
      })
      this.activeConnection = conn
      
      conn.on('open', () => {
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
        } else if (payload.type === 'splash') {
          this.handleSplash(payload)
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
    broadcastPayload(payload, excludePeer) {
      if (!this.connections.length) return
      this.connections.forEach((entry) => {
        if (excludePeer && entry.peerId === excludePeer) return
        if (entry.conn?.open) {
          entry.conn.send(payload)
        }
      })
    },
    handleProfileUpdate(payload) {
      // Обновляем профиль пользователя в connections
      const { userId, nickname, avatar } = payload
      if (!userId) return
      
      if (this.role === 'master') {
        // Мастер обновляет данные игрока
        const connection = this.connections.find(c => c.userId === userId)
        if (connection) {
          if (nickname !== undefined) connection.alias = nickname
          if (avatar !== undefined) connection.avatar = avatar
          
          this.addMessage(systemMessage(`${nickname} обновил профиль.`))
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
    broadcastProfileUpdate(userId, nickname, avatar) {
      const payload = {
        id: createId(),
        type: 'profile-update',
        userId,
        nickname,
        avatar,
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
      const oderId = userStore.userId || this.peerId
      const nickname = userStore.nickname || 'Игрок'
      
      // Получаем всех персонажей пользователя (не NPC)
      const characters = charactersStore.myCharacters.map(c => ({ 
        ...c,
        // Проставляем ownerId если он пуст
        ownerId: c.ownerId || oderId,
        ownerNickname: c.ownerNickname || nickname
      }))
      
      console.log('[Session] sendCharactersToMaster:', {
        oderId,
        nickname,
        charactersCount: characters.length,
        characters
      })
      
      this.activeConnection.send({
        id: createId(),
        type: 'character-sync',
        action: 'player-characters',
        characters,
        ownerId: oderId,
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
     * Отправить уведомление об удалении персонажа мастеру
     */
    sendCharacterDelete(characterId) {
      if (this.role !== 'player' || !this.activeConnection?.open) return
      
      const userStore = useUserStore()
      
      this.activeConnection.send({
        id: createId(),
        type: 'character-sync',
        action: 'delete',
        characterId,
        ownerId: userStore.oderId || userStore.oderId,
        time: Date.now()
      })
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
        ...charactersStore.npcs.filter(n => n.combat?.position).map(n => ({
          id: n.id,
          name: n.name,
          portrait: n.portrait,
          position: n.combat.position,
          isNpc: true,
          npcType: n.npcType
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
        } else if (payload.action === 'tokens' && payload.tokens) {
          // Обновляем информацию о токенах других игроков
          charactersStore.updateOtherTokens(payload.tokens.filter(t => 
            t.ownerId !== useUserStore().userId
          ))
        }
      }
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
