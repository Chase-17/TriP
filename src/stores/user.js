import { defineStore } from 'pinia'
import { generateAvatar, generateRandomNickname } from '@/utils/avatar'

export const useUserStore = defineStore('user', {
  state: () => ({
    userId: '',
    nickname: '',
    avatar: null,
    characters: [], // Массив персонажей пользователя
    activeCharacterId: null, // ID активного персонажа
    currentView: 'chat', // chat | character-sheet | battle-map
    showCharacterWizard: false, // Открыт ли визард создания персонажа
    _profileUpdateCallback: null // Внутренний коллбэк для уведомления об изменениях
  }),
  
  persist: {
    key: 'trip-user-v1',
    paths: ['userId', 'nickname', 'avatar', 'characters', 'activeCharacterId', 'currentView', 'showCharacterWizard']
  },
  
  getters: {
    displayName: (state) => state.nickname || 'Гость',
    hasProfile: (state) => Boolean(state.nickname && state.avatar),
    activeCharacter: (state) => 
      state.characters.find(c => c.id === state.activeCharacterId) || null,
    hasCharacters: (state) => state.characters.length > 0
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
    
    // Методы для работы с персонажами
    addCharacter(character) {
      const id = crypto.randomUUID ? crypto.randomUUID() : 
        Math.random().toString(36).slice(2) + Date.now().toString(36)
      
      const newCharacter = {
        id,
        name: character.name || 'Безымянный',
        portrait: character.portrait || null,
        gender: character.gender || null,
        race: character.race || null,
        subrace: character.subrace || null,
        avatar: character.avatar || generateAvatar(character.name || 'Character'),
        class: character.class || '',
        level: character.level || 1,
        hp: character.hp || { current: 10, max: 10 },
        healthType: character.healthType || 'hp', // 'hp' или 'wounds'
        wounds: character.wounds || {
          scratch: { current: 0 },
          light: { current: 0 },
          heavy: { current: 0 },
          deadly: { current: 0 }
        },
        stats: character.stats || {},
        skills: character.skills || [],
        equipment: character.equipment || {
          armor: 'clothes',
          weaponSets: [
            { name: 'Набор 1', weapons: [] },
            { name: 'Набор 2', weapons: [] }
          ],
          activeSetIndex: 0
        },
        inventory: character.inventory || [],
        notes: character.notes || '',
        createdAt: Date.now()
      }
      
      this.characters.push(newCharacter)
      
      // Если это первый персонаж, делаем его активным
      if (this.characters.length === 1) {
        this.activeCharacterId = id
      }
      
      return newCharacter
    },
    
    updateCharacter(characterId, updates) {
      const character = this.characters.find(c => c.id === characterId)
      if (character) {
        Object.assign(character, updates)
      }
    },
    
    deleteCharacter(characterId) {
      this.characters = this.characters.filter(c => c.id !== characterId)
      if (this.activeCharacterId === characterId) {
        this.activeCharacterId = this.characters[0]?.id || null
      }
    },
    
    setActiveCharacter(characterId) {
      if (this.characters.find(c => c.id === characterId)) {
        this.activeCharacterId = characterId
      }
    },
    
    updateCharacter(updatedCharacter) {
      const index = this.characters.findIndex(c => c.id === updatedCharacter.id)
      if (index !== -1) {
        this.characters[index] = updatedCharacter
      }
    },
    
    deleteCharacter(characterId) {
      this.characters = this.characters.filter(c => c.id !== characterId)
      // Если удаляем активного персонажа, сбрасываем выбор
      if (this.activeCharacterId === characterId) {
        this.activeCharacterId = this.characters.length > 0 ? this.characters[0].id : null
      }
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
      this.characters = []
    }
  }
})
