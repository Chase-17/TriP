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
    
    // Иконка игрока (как фигурка в монополии)
    playerIcon: null, // id иконки из списка PLAYER_ICONS
    playerColor: null, // hex цвет иконки
    
    // Флаг, был ли профиль полностью настроен (имя + иконка + цвет)
    profileComplete: false,
    
    // UI-состояния
    currentView: 'chat', // chat | character-sheet | battle-map
    showCharacterWizard: false, // Открыт ли визард создания персонажа
    mobileActiveScreen: 'battle-map', // Активный экран на мобильной версии
    
    // Предпочтение layout: 'auto' (по размеру экрана), 'mobile', 'desktop'
    layoutPreference: 'auto',
    
    // Режимы действий по персонажам
    // Формат: { [characterId]: 'modeId' }
    characterModes: {},
    
    // Предпочтения навыков по персонажам
    // Формат: { [characterId]: { expandedSkills: ['skillId1', 'skillId2'], allExpanded: false } }
    skillPreferences: {},
    
    // Состояние инфопанелей на разных экранах
    // По умолчанию все закрыты
    infoPanelState: {
      'battle-map': false,
      'character-sheet': false,
      'chat': false,
      'scene': false
    },
    
    // Внутренний коллбэк для уведомления об изменениях профиля
    _profileUpdateCallback: null
  }),
  
  persist: {
    key: 'trip-user-v2',
    paths: ['userId', 'nickname', 'avatar', 'playerIcon', 'playerColor', 'profileComplete', 'currentView', 'showCharacterWizard', 'mobileActiveScreen', 'layoutPreference', 'characterModes', 'skillPreferences', 'infoPanelState']
  },
  
  getters: {
    displayName: (state) => state.nickname || 'Гость',
    hasProfile: (state) => Boolean(state.nickname && state.avatar),
    isProfileComplete: (state) => Boolean(state.nickname && state.playerIcon && state.playerColor && state.profileComplete)
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
    
    setPlayerIcon(iconId) {
      this.playerIcon = iconId
      this.notifyProfileUpdate()
    },
    
    setPlayerColor(color) {
      this.playerColor = color
      this.notifyProfileUpdate()
    },
    
    completeProfile() {
      this.profileComplete = true
    },
    
    // Установить все данные профиля одним действием
    setFullProfile({ nickname, playerIcon, playerColor }) {
      if (nickname?.trim()) {
        this.nickname = nickname.trim()
        this.avatar = generateAvatar(nickname.trim())
      }
      if (playerIcon) {
        this.playerIcon = playerIcon
      }
      if (playerColor) {
        this.playerColor = playerColor
      }
      this.profileComplete = true
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
        this._profileUpdateCallback(this.userId, this.nickname, this.avatar, this.playerIcon, this.playerColor)
      }
    },
    
    setProfileUpdateCallback(callback) {
      this._profileUpdateCallback = callback
    },
    
    setCurrentView(view) {
      this.currentView = view
    },
    
    setMobileActiveScreen(screen) {
      this.mobileActiveScreen = screen
    },
    
    // === Layout preference ===
    setLayoutPreference(preference) {
      if (['auto', 'mobile', 'desktop'].includes(preference)) {
        this.layoutPreference = preference
      }
    },

    // === Режимы действий ===
    getCharacterMode(characterId) {
      return this.characterModes[characterId] || null
    },
    
    setCharacterMode(characterId, modeId) {
      this.characterModes[characterId] = modeId
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
    
    // === Предпочтения навыков ===
    getSkillPreferences(characterId) {
      return this.skillPreferences[characterId] || { expandedSkills: [], allExpanded: true }
    },
    
    setSkillExpanded(characterId, skillId, expanded) {
      if (!this.skillPreferences[characterId]) {
        this.skillPreferences[characterId] = { expandedSkills: [], allExpanded: true }
      }
      const prefs = this.skillPreferences[characterId]
      const idx = prefs.expandedSkills.indexOf(skillId)
      
      if (expanded && idx === -1) {
        prefs.expandedSkills.push(skillId)
      } else if (!expanded && idx !== -1) {
        prefs.expandedSkills.splice(idx, 1)
      }
    },
    
    setAllSkillsExpanded(characterId, expanded) {
      if (!this.skillPreferences[characterId]) {
        this.skillPreferences[characterId] = { expandedSkills: [], allExpanded: expanded }
      } else {
        this.skillPreferences[characterId].allExpanded = expanded
        this.skillPreferences[characterId].expandedSkills = []
      }
    },

    // === Инфопанели ===
    getInfoPanelOpen(screenId) {
      return this.infoPanelState?.[screenId] ?? false
    },
    
    setInfoPanelOpen(screenId, isOpen) {
      if (!this.infoPanelState) {
        this.infoPanelState = {}
      }
      this.infoPanelState[screenId] = isOpen
    },
    
    toggleInfoPanel(screenId) {
      if (!this.infoPanelState) {
        this.infoPanelState = {}
      }
      this.infoPanelState[screenId] = !this.infoPanelState[screenId]
    },

    reset() {
      this.nickname = ''
      this.avatar = null
    }
  }
})

