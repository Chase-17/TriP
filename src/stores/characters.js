import { defineStore } from 'pinia'
import { calculateMaxHP, calculateWoundSlots } from '@/utils/character/wounds'
import { useUserStore } from '@/stores/user'

/**
 * Генератор уникальных ID
 */
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/**
 * Создать пустого персонажа
 */
const createEmptyCharacter = (ownerId, options = {}) => ({
  id: generateId(),
  ownerId,              // ID игрока-владельца (peerId или userId)
  ownerNickname: options.ownerNickname || 'Игрок',
  
  // Базовая информация
  name: options.name || 'Новый персонаж',
  portrait: options.portrait || null,
  gender: options.gender || null,
  race: options.race || null,
  subrace: options.subrace || null,
  class: options.class || null,
  
  // Характеристики
  stats: {
    war: 0,
    knowledge: 0,
    community: 0,
    shadow: 0,
    mysticism: 0,
    nature: 0,
    ...options.stats
  },
  
  // Навыки
  skills: options.skills || [],
  
  // Инвентарь (предметы не в руках)
  inventory: options.inventory || [],
  
  // Экипировка
  equipment: {
    armor: 'clothes',
    weaponSets: [
      { name: 'Набор 1', weapons: [] },
      { name: 'Набор 2', weapons: [] }
    ],
    activeSetIndex: 0,
    wealth: 5,
    epoch: 10,
    ...options.equipment
  },
  
  // Боевые параметры
  combat: {
    // Тип системы здоровья: 'simple' (HP) или 'wounds' (продвинутые ранения)
    healthType: options.combat?.healthType || 'simple',
    
    // Простое HP (для healthType === 'simple')
    hp: options.combat?.hp || 8,
    maxHp: options.combat?.maxHp || 8,
    
    // Продвинутые ранения (для healthType === 'wounds')
    // Структура: { scratch: number, light: number, heavy: number, deadly: number }
    // Число означает количество ЗАПОЛНЕННЫХ (повреждённых) слотов
    wounds: options.combat?.wounds || {
      scratch: 0,
      light: 0,
      heavy: 0,
      deadly: 0
    },
    
    // Бонусные смертельные слоты от умений/артефактов
    bonusDeadlySlots: options.combat?.bonusDeadlySlots || 0,
    
    // Прочие боевые параметры
    mp: options.combat?.mp || 0,
    maxMp: options.combat?.maxMp || 0,
    armor: options.combat?.armor || 0,
    initiative: options.combat?.initiative || 0,
    
    // Движение
    baseMovement: options.combat?.baseMovement || 5,  // Базовые очки движения
    movementModifier: options.combat?.movementModifier || 0,  // Модификатор от брони/умений
    currentMovement: options.combat?.currentMovement ?? null,  // Текущие ОД (null = начало хода)
    
    // Способности для pathfinding
    movementAbilities: options.combat?.movementAbilities || {
      flight: false,
      swimming: false,
      phasing: false,
      forestKnowledge: false,
      swampWalker: false,
      climbing: false
    },
    
    // Состояния/эффекты
    conditions: [],
    
    // Позиция на карте (если размещён)
    position: null  // { mapId, q, r }
  },
  
  // Метаданные
  createdAt: Date.now(),
  updatedAt: Date.now(),
  
  // Для NPC мастера
  isNpc: options.isNpc || false,
  npcType: options.npcType || null,  // 'friendly', 'hostile', 'neutral'
  
  // Видимость для игроков (только для NPC мастера)
  // true = виден на карте для игроков, false = скрыт
  visibleToPlayers: options.visibleToPlayers !== undefined ? options.visibleToPlayers : true
})

/**
 * Стор персонажей
 * 
 * Логика синхронизации:
 * - Игрок видит только своих персонажей + публичную инфо о других (токены на карте)
 * - Мастер видит всех персонажей всех игроков
 * - При изменении персонажа игроком → отправляем мастеру
 * - При изменении мастером персонажа игрока → отправляем только этому игроку
 */
export const useCharactersStore = defineStore('characters', {
  state: () => ({
    // Все персонажи (для мастера - все, для игрока - только свои + токены)
    characters: [],
    
    // ID текущего активного персонажа (для игрока)
    activeCharacterId: null,
    
    // Публичная информация о персонажах других игроков (только для отображения токенов)
    // { id, name, portrait, position, ownerId, isNpc }
    otherTokens: [],
    
    // NPC мастера (монстры, торговцы и т.д.)
    npcs: []
  }),
  
  persist: {
    key: 'trip-characters-v1',
    paths: ['characters', 'activeCharacterId', 'npcs']
  },
  
  getters: {
    /**
     * Все персонажи текущего пользователя (только свои, не NPC)
     */
    myCharacters: (state) => {
      const userStore = useUserStore()
      const userId = userStore.userId
      return state.characters.filter(c => c.ownerId === userId && !c.isNpc)
    },
    
    /**
     * Получить персонажей по userId владельца
     */
    getCharactersByUserId: (state) => (userId) => {
      return state.characters.filter(c => c.ownerId === userId && !c.isNpc)
    },
    
    /**
     * Активный персонаж (включая NPC для мастера)
     */
    activeCharacter: (state) => {
      // Сначала ищем в персонажах
      const char = state.characters.find(c => c.id === state.activeCharacterId)
      if (char) return char
      // Потом в NPC
      return state.npcs.find(n => n.id === state.activeCharacterId) || null
    },
    
    /**
     * Все токены для отображения на карте (свои + чужие + NPC)
     */
    allTokens: (state) => {
      const myTokens = state.characters
        .filter(c => c.combat?.position)
        .map(c => ({
          id: c.id,
          name: c.name,
          portrait: c.portrait,
          position: c.combat.position,
          ownerId: c.ownerId,
          isNpc: c.isNpc,
          isMine: true
        }))
      
      const otherTokens = state.otherTokens
        .filter(t => t.position)
        .map(t => ({ ...t, isMine: false }))
      
      const npcTokens = state.npcs
        .filter(n => n.combat?.position)
        .map(n => ({
          id: n.id,
          name: n.name,
          portrait: n.portrait,
          position: n.combat.position,
          isNpc: true,
          npcType: n.npcType,
          isMine: false
        }))
      
      return [...myTokens, ...otherTokens, ...npcTokens]
    },
    
    /**
     * Получить персонажа по ID
     */
    getCharacterById: (state) => (characterId) => {
      if (!characterId) return null
      // Сначала ищем среди персонажей
      const char = state.characters.find(c => c.id === characterId)
      if (char) return char
      // Потом среди NPC мастера
      const npc = state.npcs.find(n => n.id === characterId)
      if (npc) return npc
      // Потом среди токенов других игроков (для отображения на карте)
      const token = state.otherTokens.find(t => t.id === characterId)
      return token || null
    },
    
    /**
     * Персонажи по владельцу (для мастера)
     */
    charactersByOwner: (state) => (ownerId) => {
      return state.characters.filter(c => c.ownerId === ownerId && !c.isNpc)
    },
    
    /**
     * Все персонажи игроков (для мастера)
     */
    allPlayerCharacters: (state) => {
      return state.characters.filter(c => !c.isNpc)
    },
    
    /**
     * Все NPC мастера
     */
    allNpcs: (state) => {
      return state.npcs
    },
    
    /**
     * Получить NPC по ID
     */
    getNpcById: (state) => (npcId) => {
      return state.npcs.find(n => n.id === npcId) || null
    },
    
    // ====== MOVEMENT GETTERS ======
    
    /**
     * Получить доступные очки движения персонажа
     */
    getAvailableMovement: (state) => (characterId) => {
      const character = state.characters.find(c => c.id === characterId)
        || state.npcs.find(n => n.id === characterId)
      if (!character) return 5 // Дефолт для ненайденного персонажа
      return character.combat?.movement?.current ?? 5 // Дефолт если нет структуры
    },
    
    /**
     * Проверить, остались ли очки движения
     */
    hasMovementLeft: (state) => (characterId) => {
      const character = state.characters.find(c => c.id === characterId)
      if (!character) return false
      return (character.combat?.movement?.current ?? 0) > 0
    },
    
    /**
     * Получить базовые очки движения
     */
    getBaseMovement: (state) => (characterId) => {
      const character = state.characters.find(c => c.id === characterId)
      if (!character) return 5
      return character.combat?.movement?.base ?? 5
    },
    
    /**
     * Получить доступные порывы персонажа
     */
    getAvailableSurges: (state) => (characterId) => {
      const character = state.characters.find(c => c.id === characterId)
        || state.npcs.find(n => n.id === characterId)
      if (!character) return 2
      return character.combat?.surges?.current ?? 2
    },
    
    /**
     * Получить базовые порывы
     */
    getBaseSurges: (state) => (characterId) => {
      const character = state.characters.find(c => c.id === characterId)
      if (!character) return 2
      return character.combat?.surges?.base ?? 2
    },
    
    /**
     * Получить очки движения за один порыв
     */
    getSurgeMovement: (state) => (characterId) => {
      const character = state.characters.find(c => c.id === characterId)
      if (!character) return 2
      return character.combat?.surges?.movementPerSurge ?? 2
    },
    
    /**
     * Получить полную информацию о ресурсах движения
     */
    getMovementResources: (state) => (characterId) => {
      const character = state.characters.find(c => c.id === characterId)
        || state.npcs.find(n => n.id === characterId)
      
      if (!character) {
        return {
          movement: { current: 5, base: 5 },
          surges: { current: 2, base: 2, movementPerSurge: 2 }
        }
      }
      
      return {
        movement: {
          current: character.combat?.movement?.current ?? 5,
          base: character.combat?.movement?.base ?? 5
        },
        surges: {
          current: character.combat?.surges?.current ?? 2,
          base: character.combat?.surges?.base ?? 2,
          movementPerSurge: character.combat?.surges?.movementPerSurge ?? 2
        }
      }
    }
  },
  
  actions: {
    /**
     * Создать нового персонажа
     */
    createCharacter(ownerId, options = {}) {
      const character = createEmptyCharacter(ownerId, options)
      this.characters.push(character)
      this.activeCharacterId = character.id
      return character
    },
    
    /**
     * Создать персонажа из данных CharacterCreation store
     */
    createFromWizard(ownerId, ownerNickname, formData) {
      const stats = formData.stats || {}
      
      // Рассчитываем максимальное HP на основе атрибутов
      const maxHp = calculateMaxHP(stats)
      
      const character = createEmptyCharacter(ownerId, {
        ownerNickname,
        name: formData.name || 'Безымянный',
        portrait: formData.portrait,
        gender: formData.gender,
        race: formData.race,
        subrace: formData.subrace,
        class: formData.class,
        stats: stats,
        skills: formData.skills ? Object.values(formData.skills).filter(Boolean) : [],
        equipment: formData.equipment,
        inventory: formData.inventory || [],
        combat: {
          // Начинаем с простой системы HP, мастер может переключить на ранения
          healthType: 'simple',
          hp: maxHp,
          maxHp: maxHp,
          wounds: { scratch: 0, light: 0, heavy: 0, deadly: 0 },
          bonusDeadlySlots: 0,
          mp: stats.mysticism || 0,
          maxMp: stats.mysticism || 0
        }
      })
      
      this.characters.push(character)
      this.activeCharacterId = character.id
      return character
    },
    
    /**
     * Обновить персонажа (или NPC)
     */
    updateCharacter(characterId, updates) {
      // Сначала ищем в персонажах
      let character = this.characters.find(c => c.id === characterId)
      if (character) {
        Object.assign(character, updates, { updatedAt: Date.now() })
        return character
      }
      // Потом в NPC
      character = this.npcs.find(n => n.id === characterId)
      if (character) {
        Object.assign(character, updates, { updatedAt: Date.now() })
        return character
      }
      return null
    },
    
    // ====== MOVEMENT ACTIONS ======
    
    /**
     * Потратить очки движения
     * @returns {boolean} Успешно ли потрачены очки
     */
    spendMovement(characterId, cost) {
      const character = this.characters.find(c => c.id === characterId) 
        || this.npcs.find(n => n.id === characterId)
      
      if (!character) return false
      
      // Автосоздаём структуру combat.movement если её нет
      if (!character.combat) character.combat = {}
      if (!character.combat.movement) {
        character.combat.movement = { base: 5, current: 5 }
      }
      
      const current = character.combat.movement.current ?? 5
      if (current < cost) return false
      
      character.combat.movement.current = current - cost
      character.updatedAt = Date.now()
      console.log(`[Characters] spendMovement: ${character.name} потратил ${cost} ОД, осталось ${character.combat.movement.current}`)
      return true
    },
    
    /**
     * Восстановить очки движения (новый ход)
     */
    resetMovement(characterId) {
      const character = this.characters.find(c => c.id === characterId)
        || this.npcs.find(n => n.id === characterId)
      
      if (!character || !character.combat?.movement) return
      
      character.combat.movement.current = character.combat.movement.base ?? 5
      character.updatedAt = Date.now()
    },
    
    /**
     * Начать новый ход для всех персонажей на карте
     * Восстанавливает очки движения и порывы
     */
    startNewTurn() {
      // Восстановить движение и порывы всем персонажам
      this.characters.forEach(char => {
        if (char.combat?.movement) {
          char.combat.movement.current = char.combat.movement.base ?? 5
        }
        if (char.combat?.surges) {
          char.combat.surges.current = char.combat.surges.base ?? 2
        }
      })
      // И всем NPC
      this.npcs.forEach(npc => {
        if (npc.combat?.movement) {
          npc.combat.movement.current = npc.combat.movement.base ?? 5
        }
        if (npc.combat?.surges) {
          npc.combat.surges.current = npc.combat.surges.base ?? 2
        }
      })
    },
    
    /**
     * Установить базовые очки движения персонажу
     */
    setBaseMovement(characterId, baseMovement) {
      const character = this.characters.find(c => c.id === characterId)
        || this.npcs.find(n => n.id === characterId)
      
      if (!character) return
      
      if (!character.combat) character.combat = {}
      if (!character.combat.movement) character.combat.movement = { base: 5, current: 5 }
      
      character.combat.movement.base = baseMovement
      character.updatedAt = Date.now()
    },
    
    /**
     * Потратить порыв на движение
     * @returns {{ success: boolean, movementGained: number }}
     */
    spendSurge(characterId) {
      const character = this.characters.find(c => c.id === characterId)
        || this.npcs.find(n => n.id === characterId)
      
      if (!character) return { success: false, movementGained: 0 }
      
      // Автосоздаём структуру если её нет
      if (!character.combat) character.combat = {}
      if (!character.combat.surges) {
        character.combat.surges = { base: 2, current: 2, movementPerSurge: 2 }
      }
      
      const currentSurges = character.combat.surges.current ?? 2
      if (currentSurges < 1) return { success: false, movementGained: 0 }
      
      const movementGained = character.combat.surges.movementPerSurge ?? 2
      
      character.combat.surges.current = currentSurges - 1
      
      // Добавляем очки движения
      if (!character.combat.movement) {
        character.combat.movement = { base: 5, current: 5 }
      }
      character.combat.movement.current += movementGained
      
      character.updatedAt = Date.now()
      console.log(`[Characters] spendSurge: ${character.name} потратил порыв, +${movementGained} ОД`)
      
      return { success: true, movementGained }
    },
    
    /**
     * Удалить персонажа
     */
    deleteCharacter(characterId) {
      const index = this.characters.findIndex(c => c.id === characterId)
      if (index !== -1) {
        this.characters.splice(index, 1)
        
        // Если удалённый персонаж был активным, переключаемся на первого из своих
        if (this.activeCharacterId === characterId) {
          const userStore = useUserStore()
          const myChars = this.characters.filter(c => c.ownerId === userStore.userId && !c.isNpc)
          this.activeCharacterId = myChars[0]?.id || null
        }
      }
    },
    
    /**
     * Очистить персонажей других игроков из локального хранилища
     * Вызывается при входе в комнату как игрок
     */
    cleanupOtherPlayersCharacters() {
      const userStore = useUserStore()
      const userId = userStore.userId
      
      // Оставляем только своих персонажей и NPC
      const before = this.characters.length
      this.characters = this.characters.filter(c => c.ownerId === userId || c.isNpc)
      const removed = before - this.characters.length
      
      if (removed > 0) {
        console.log('[Characters] Cleaned up', removed, 'other players characters from localStorage')
      }
      
      // Сбрасываем activeCharacterId если он указывает на удалённого персонажа
      if (this.activeCharacterId) {
        const exists = this.characters.find(c => c.id === this.activeCharacterId)
        if (!exists) {
          const myChars = this.characters.filter(c => c.ownerId === userId && !c.isNpc)
          this.activeCharacterId = myChars[0]?.id || null
        }
      }
    },
    
    /**
     * Переключить видимость NPC для игроков
     */
    toggleNpcVisibility(characterId) {
      const character = this.characters.find(c => c.id === characterId)
      if (character && character.isNpc) {
        character.visibleToPlayers = !character.visibleToPlayers
        character.updatedAt = Date.now()
        return character.visibleToPlayers
      }
      return null
    },
    
    /**
     * Установить видимость NPC для игроков
     */
    setNpcVisibility(characterId, visible) {
      const character = this.characters.find(c => c.id === characterId)
      if (character && character.isNpc) {
        character.visibleToPlayers = visible
        character.updatedAt = Date.now()
      }
    },
    
    /**
     * Установить активного персонажа
     */
    setActiveCharacter(characterId) {
      this.activeCharacterId = characterId
    },
    
    /**
     * Разместить персонажа на карте
     */
    placeOnMap(characterId, mapId, q, r) {
      const character = this.characters.find(c => c.id === characterId)
      if (character) {
        character.combat.position = { mapId, q, r }
        character.updatedAt = Date.now()
      }
    },
    
    /**
     * Убрать персонажа с карты
     */
    removeFromMap(characterId) {
      const character = this.characters.find(c => c.id === characterId)
      if (character) {
        character.combat.position = null
        character.updatedAt = Date.now()
      }
    },
    
    /**
     * Переместить персонажа на карте
     */
    moveOnMap(characterId, q, r) {
      const character = this.characters.find(c => c.id === characterId)
      if (character?.combat?.position) {
        character.combat.position.q = q
        character.combat.position.r = r
        character.updatedAt = Date.now()
      }
    },
    
    /**
     * Нанести урон персонажу (для простого HP)
     */
    dealDamage(characterId, amount) {
      const character = this.characters.find(c => c.id === characterId)
      if (!character) return null
      
      if (character.combat.healthType === 'simple') {
        character.combat.hp = Math.max(0, character.combat.hp - amount)
        character.updatedAt = Date.now()
        return {
          newHp: character.combat.hp,
          isDead: character.combat.hp <= 0
        }
      }
      
      return null
    },
    
    /**
     * Исцелить персонажа (для простого HP)
     */
    healDamage(characterId, amount) {
      const character = this.characters.find(c => c.id === characterId)
      if (!character) return null
      
      if (character.combat.healthType === 'simple') {
        character.combat.hp = Math.min(character.combat.maxHp, character.combat.hp + amount)
        character.updatedAt = Date.now()
        return { newHp: character.combat.hp }
      }
      
      return null
    },
    
    /**
     * Добавить ранение (для продвинутой системы)
     * @param {string} characterId 
     * @param {string} woundType - 'scratch' | 'light' | 'heavy' | 'deadly'
     */
    addWound(characterId, woundType) {
      const character = this.characters.find(c => c.id === characterId)
      if (!character || character.combat.healthType !== 'wounds') return null
      
      const slots = calculateWoundSlots(character.stats, character.combat.bonusDeadlySlots)
      const maxSlots = slots[woundType].base + slots[woundType].bonus
      const current = character.combat.wounds[woundType] || 0
      
      if (current < maxSlots) {
        // Есть свободные слоты
        character.combat.wounds[woundType] = current + 1
      } else {
        // Переполнение - эскалируем ранение
        const escalation = {
          scratch: 'light',
          light: 'heavy',
          heavy: 'deadly',
          deadly: null
        }
        
        if (woundType === 'scratch') {
          // Царапины при переполнении сбрасываются и добавляется лёгкое
          character.combat.wounds.scratch = 0
          return this.addWound(characterId, 'light')
        } else if (escalation[woundType]) {
          return this.addWound(characterId, escalation[woundType])
        } else {
          // Смертельные переполнены - персонаж мёртв
          character.combat.wounds.deadly = current + 1
        }
      }
      
      character.updatedAt = Date.now()
      return { wounds: character.combat.wounds }
    },
    
    /**
     * Удалить ранение (исцеление)
     * @param {string} characterId 
     * @param {string} woundType - 'scratch' | 'light' | 'heavy' | 'deadly'
     */
    removeWound(characterId, woundType) {
      const character = this.characters.find(c => c.id === characterId)
      if (!character || character.combat.healthType !== 'wounds') return null
      
      const current = character.combat.wounds[woundType] || 0
      if (current > 0) {
        character.combat.wounds[woundType] = current - 1
        character.updatedAt = Date.now()
      }
      
      return { wounds: character.combat.wounds }
    },
    
    /**
     * Послебоевое восстановление
     * Все раны смещаются на одну категорию вниз:
     * - Царапины исчезают
     * - Лёгкие → царапины (сколько помещается)
     * - Тяжёлые → лёгкие (сколько помещается)
     * - Смертельные → тяжёлые (сколько помещается)
     */
    postCombatRecovery(characterId) {
      const character = this.characters.find(c => c.id === characterId)
      if (!character || character.combat.healthType !== 'wounds') return null
      
      const slots = calculateWoundSlots(character.stats, character.combat.bonusDeadlySlots)
      const wounds = character.combat.wounds
      
      // Расчёт максимальных слотов для каждого типа
      const maxSlots = {
        scratch: slots.scratch.base + slots.scratch.bonus,
        light: slots.light.base + slots.light.bonus,
        heavy: slots.heavy.base + slots.heavy.bonus,
        deadly: slots.deadly.base + slots.deadly.bonus
      }
      
      // Сохраняем текущие значения
      const oldScratch = wounds.scratch
      const oldLight = wounds.light
      const oldHeavy = wounds.heavy
      const oldDeadly = wounds.deadly
      
      // Царапины исчезают полностью
      wounds.scratch = 0
      
      // Лёгкие → царапины (сколько помещается)
      const lightToScratch = Math.min(oldLight, maxSlots.scratch)
      wounds.scratch = lightToScratch
      wounds.light = oldLight - lightToScratch
      
      // Тяжёлые → лёгкие (сколько помещается в освободившиеся слоты)
      const freeLight = maxSlots.light - wounds.light
      const heavyToLight = Math.min(oldHeavy, freeLight)
      wounds.light += heavyToLight
      wounds.heavy = oldHeavy - heavyToLight
      
      // Смертельные → тяжёлые (сколько помещается в освободившиеся слоты)
      const freeHeavy = maxSlots.heavy - wounds.heavy
      const deadlyToHeavy = Math.min(oldDeadly, freeHeavy)
      wounds.heavy += deadlyToHeavy
      wounds.deadly = oldDeadly - deadlyToHeavy
      
      character.updatedAt = Date.now()
      
      return { 
        wounds: character.combat.wounds,
        recovered: {
          scratch: oldScratch, // полностью вылечено
          light: lightToScratch, // понижено до царапин
          heavy: heavyToLight, // понижено до лёгких
          deadly: deadlyToHeavy // понижено до тяжёлых
        }
      }
    },
    
    /**
     * Переключить тип системы здоровья
     * @param {string} characterId 
     * @param {string} healthType - 'simple' | 'wounds'
     */
    setHealthType(characterId, healthType) {
      const character = this.characters.find(c => c.id === characterId)
      if (!character) return null
      
      character.combat.healthType = healthType
      
      // При переключении на ранения - сбрасываем их
      if (healthType === 'wounds') {
        character.combat.wounds = { scratch: 0, light: 0, heavy: 0, deadly: 0 }
      }
      
      // При переключении на HP - восстанавливаем полное здоровье
      if (healthType === 'simple') {
        const maxHp = calculateMaxHP(character.stats)
        character.combat.hp = maxHp
        character.combat.maxHp = maxHp
      }
      
      character.updatedAt = Date.now()
      return { healthType: character.combat.healthType }
    },
    
    /**
     * Получить полную информацию о здоровье персонажа
     */
    getHealthInfo(characterId) {
      const character = this.characters.find(c => c.id === characterId)
      if (!character) return null
      
      const stats = character.stats || {}
      const combat = character.combat
      
      if (combat.healthType === 'simple') {
        return {
          type: 'simple',
          hp: combat.hp,
          maxHp: combat.maxHp,
          // Группы по 3 для отображения
          groups: Math.ceil(combat.maxHp / 3),
          penaltyThreshold: 3 // каждые 3 потерянных HP = штраф
        }
      } else {
        const slots = calculateWoundSlots(stats, combat.bonusDeadlySlots)
        return {
          type: 'wounds',
          slots: {
            scratch: {
              base: slots.scratch.base,
              bonus: slots.scratch.bonus,
              total: slots.scratch.base + slots.scratch.bonus,
              filled: combat.wounds.scratch
            },
            light: {
              base: slots.light.base,
              bonus: slots.light.bonus,
              total: slots.light.base + slots.light.bonus,
              filled: combat.wounds.light
            },
            heavy: {
              base: slots.heavy.base,
              bonus: slots.heavy.bonus,
              total: slots.heavy.base + slots.heavy.bonus,
              filled: combat.wounds.heavy
            },
            deadly: {
              base: slots.deadly.base,
              bonus: slots.deadly.bonus,
              total: slots.deadly.base + slots.deadly.bonus,
              filled: combat.wounds.deadly
            }
          }
        }
      }
    },
    
    /**
     * Исцелить персонажа
     */
    heal(characterId, amount) {
      const character = this.characters.find(c => c.id === characterId)
      if (character) {
        character.combat.hp = Math.min(character.combat.maxHp, character.combat.hp + amount)
        character.updatedAt = Date.now()
        return { newHp: character.combat.hp }
      }
      return null
    },
    
    // ============= СИНХРОНИЗАЦИЯ =============
    
    /**
     * Получить персонажа для отправки (сериализация)
     */
    serializeCharacter(characterId) {
      const character = this.characters.find(c => c.id === characterId)
      return character ? { ...character } : null
    },
    
    /**
     * Получить всех персонажей пользователя для отправки мастеру
     */
    serializeMyCharacters(ownerId) {
      return this.characters
        .filter(c => c.ownerId === ownerId && !c.isNpc)
        .map(c => ({ ...c }))
    },
    
    /**
     * Получить публичную информацию о токене (для других игроков)
     */
    serializeTokenInfo(characterId) {
      const character = this.characters.find(c => c.id === characterId)
      if (!character) return null
      
      return {
        id: character.id,
        name: character.name,
        portrait: character.portrait,
        position: character.combat?.position,
        ownerId: character.ownerId,
        isNpc: character.isNpc,
        npcType: character.npcType
      }
    },
    
    /**
     * Применить полученного персонажа (для мастера - от игрока, или для игрока - от мастера)
     * Использует updatedAt для разрешения конфликтов
     * Сохраняет локальные данные (skills, inventory, equipment) если они не пусты
     */
    applyReceivedCharacter(characterData) {
      if (!characterData?.id) return
      
      const existingIndex = this.characters.findIndex(c => c.id === characterData.id)
      
      if (existingIndex !== -1) {
        const existing = this.characters[existingIndex]
        // Обновляем только если полученные данные новее
        if (!existing.updatedAt || !characterData.updatedAt || characterData.updatedAt >= existing.updatedAt) {
          // Сохраняем локальные данные, если входящие пусты или undefined
          // Это защищает от случаев, когда мастер/другой пир не имеет полных данных
          const mergedData = { ...characterData }
          
          // Сохраняем skills если входящие пусты/undefined, а локальные нет
          if ((!mergedData.skills || mergedData.skills.length === 0) && 
              existing.skills && existing.skills.length > 0) {
            mergedData.skills = existing.skills
            console.log('[Characters] Сохраняем локальные skills:', existing.skills.length)
          }
          
          // Сохраняем inventory если входящий пустой/undefined, а локальный нет
          if ((!mergedData.inventory || mergedData.inventory.length === 0) && 
              existing.inventory && existing.inventory.length > 0) {
            mergedData.inventory = existing.inventory
            console.log('[Characters] Сохраняем локальный inventory:', existing.inventory.length)
          }
          
          // Сохраняем equipment полностью если входящий пустой/undefined/дефолтный
          if (existing.equipment) {
            if (!mergedData.equipment) {
              mergedData.equipment = existing.equipment
              console.log('[Characters] Сохраняем всё equipment')
            } else {
              // Проверяем weaponSets - сохраняем если входящий пустой
              if (existing.equipment.weaponSets) {
                const incomingHasWeapons = mergedData.equipment.weaponSets?.some(
                  ws => ws.weapons && ws.weapons.length > 0
                )
                const existingHasWeapons = existing.equipment.weaponSets.some(
                  ws => ws.weapons && ws.weapons.length > 0
                )
                if (!incomingHasWeapons && existingHasWeapons) {
                  mergedData.equipment.weaponSets = existing.equipment.weaponSets
                  console.log('[Characters] Сохраняем локальные weaponSets')
                }
              }
              
              // Сохраняем armor если входящий дефолтный ('clothes'), а локальный нет
              if ((!mergedData.equipment.armor || mergedData.equipment.armor === 'clothes') && 
                  existing.equipment.armor && existing.equipment.armor !== 'clothes') {
                mergedData.equipment.armor = existing.equipment.armor
                console.log('[Characters] Сохраняем локальную armor:', existing.equipment.armor)
              }
              
              // Сохраняем activeSetIndex
              if (mergedData.equipment.activeSetIndex === undefined && 
                  existing.equipment.activeSetIndex !== undefined) {
                mergedData.equipment.activeSetIndex = existing.equipment.activeSetIndex
              }
            }
          }
          
          this.characters[existingIndex] = mergedData
        }
      } else {
        // Добавляем нового
        this.characters.push({ ...characterData })
      }
    },
    
    /**
     * Применить обновление своего персонажа (для игрока - от мастера)
     */
    applyCharacterUpdate(characterId, updates) {
      const character = this.characters.find(c => c.id === characterId)
      if (character) {
        Object.assign(character, updates)
      }
    },
    
    /**
     * Обновить информацию о токенах других игроков
     */
    updateOtherTokens(tokens) {
      this.otherTokens = tokens
    },
    
    /**
     * Добавить/обновить один токен
     */
    updateOtherToken(tokenInfo) {
      const index = this.otherTokens.findIndex(t => t.id === tokenInfo.id)
      if (index !== -1) {
        this.otherTokens[index] = tokenInfo
      } else {
        this.otherTokens.push(tokenInfo)
      }
    },
    
    /**
     * Удалить токен
     */
    removeOtherToken(tokenId) {
      this.otherTokens = this.otherTokens.filter(t => t.id !== tokenId)
    },
    
    // ============= NPC (для мастера) =============
    
    /**
     * Создать NPC
     */
    createNpc(options = {}) {
      const npc = createEmptyCharacter('master', {
        ...options,
        isNpc: true,
        npcType: options.npcType || 'neutral'
      })
      this.npcs.push(npc)
      return npc
    },
    
    /**
     * Обновить NPC
     */
    updateNpc(npcId, updates) {
      const npc = this.npcs.find(n => n.id === npcId)
      if (npc) {
        Object.assign(npc, updates, { updatedAt: Date.now() })
      }
      return npc
    },
    
    /**
     * Удалить NPC
     */
    deleteNpc(npcId) {
      this.npcs = this.npcs.filter(n => n.id !== npcId)
    },
    
    /**
     * Разместить NPC на карте
     */
    placeNpcOnMap(npcId, mapId, q, r) {
      const npc = this.npcs.find(n => n.id === npcId)
      if (npc) {
        npc.combat.position = { mapId, q, r }
        npc.updatedAt = Date.now()
      }
    }
  }
})
