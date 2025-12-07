import { defineStore } from 'pinia'
import { generateAvatar, generateRandomNickname } from '@/utils/avatar'

/**
 * Стор пользователя
 * 
 * Отвечает только за:
 * - Идентификацию пользователя (userId, nickname, avatar)
 * - UI-состояния (currentView, showCharacterWizard)
 * 
 * Персонажи хранятся в отдельном stores/characters.js
 */
export const useUserStore = defineStore('user', {
  state: () => ({
    userId: '',
    nickname: '',
    avatar: null,
    
    // UI-состояния
    currentView: 'chat', // chat | character-sheet | battle-map
    showCharacterWizard: false, // Открыт ли визард создания персонажа
    
    // Внутренний коллбэк для уведомления об изменениях профиля
    _profileUpdateCallback: null
  }),
  
  persist: {
    key: 'trip-user-v2',
    paths: ['userId', 'nickname', 'avatar', 'currentView', 'showCharacterWizard']
  },
  
  getters: {
    displayName: (state) => state.nickname || 'Гость',
    hasProfile: (state) => Boolean(state.nickname && state.avatar)
  },
  
  actions: {
    initializeProfile() {
      // Генерируем уникальный userId если его нет
      if (!this.userId) {
        this.userId = crypto.randomUUID ? crypto.randomUUID() : 
          Math.random().toString(36).slice(2) + Date.now().toString(36)
      }
      if (!this.nickname) {
        this.nickname = generateRandomNickname()
      }
      if (!this.avatar) {
        this.avatar = generateAvatar(this.nickname)
      }
    },
    
    setNickname(name) {
      const trimmed = name?.trim()
      if (!trimmed) return
      
      this.nickname = trimmed
      // Регенерируем аватарку на основе нового имени
      this.avatar = generateAvatar(trimmed)
      
      // Уведомляем других участников об изменении профиля
      this.notifyProfileUpdate()
    },
    
    regenerateAvatar() {
      // Генерируем с случайным сидом для нового варианта
      const seed = this.nickname + Date.now()
      this.avatar = generateAvatar(seed)
      
      // Уведомляем других участников об изменении профиля
      this.notifyProfileUpdate()
    },
    
    notifyProfileUpdate() {
      // Вызываем коллбэк если он установлен
      if (typeof this._profileUpdateCallback === 'function') {
        this._profileUpdateCallback(this.userId, this.nickname, this.avatar)
      }
    },
    
    setProfileUpdateCallback(callback) {
      this._profileUpdateCallback = callback
    },
    
    setCurrentView(view) {
      this.currentView = view
    },
    
    openCharacterWizard() {
      this.showCharacterWizard = true
      // Автоматически переключаемся на вкладку персонажа
      if (this.currentView !== 'character-sheet') {
        this.currentView = 'character-sheet'
      }
    },
    
    closeCharacterWizard() {
      this.showCharacterWizard = false
    },
    
    reset() {
      this.nickname = ''
      this.avatar = null
    }
  }
})

