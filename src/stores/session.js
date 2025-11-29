import { defineStore } from 'pinia'
import Peer from 'peerjs'
import { useUserStore } from './user'

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
    masterProfile: null // Профиль мастера для игроков
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
      })
      
      conn.on('data', (payload) => {
        // Обработка обновления профиля
        if (payload.type === 'profile-update') {
          this.handleProfileUpdate(payload)
          // Транслируем обновление остальным участникам
          this.broadcastPayload(payload, conn.peer)
        } else {
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
      })
      
      conn.on('data', (payload) => {
        // Обработка обновления профиля
        if (payload.type === 'profile-update') {
          this.handleProfileUpdate(payload)
        } else {
          // При первом сообщении от мастера сохраняем его профиль
          if (!this.masterProfile && payload.userId && payload.type === 'chat') {
            this.masterProfile = {
              userId: payload.userId,
              nickname: null, // Будет заполнено при profile-update
              avatar: null
            }
          }
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
    }
  }
})
