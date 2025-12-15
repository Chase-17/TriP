import { defineStore } from 'pinia'

export const useCharacterCreationStore = defineStore('characterCreation', {
  state: () => ({
    step: 1,
    // Ограничения от мастера
    constraints: {
      allowedRaces: [],      // Пустой = все разрешены
      allowedSubraces: [],   // Формат: ['human-war', 'elf-nature']
      allowedClasses: [],    // Пустой = все разрешены
      maxWealth: 10,
      maxEpoch: 10
    },
    formData: {
      name: '',
      portrait: null,
      gender: null,
      race: null,
      subrace: null,
      class: null,
      stats: {
        war: 0,      // Мощь (Might)
        knowledge: 0, // Разум (Reason)
        community: 0, // Харизма (Charisma)
        shadow: 0,    // Хитрость (Cunning)
        mysticism: 0, // Интуиция (Intuition)
        nature: 0     // Восприятие (Perception)
      },
      skills: {
        fromClass: null,    // Навык от класса
        fromAspect1: null,  // Навык от первого аспекта
        fromAspect2: null   // Навык от второго аспекта
      },
      equipment: {
        armor: 'clothes',   // Default to basic clothes
        weapons: [],
        wealth: 5,
        epoch: 10
      }
    }
  }),
  persist: {
    key: 'trip-character-creation-v3', // Updated for constraints support
    paths: ['step', 'formData', 'constraints']
  },
  getters: {
    isComplete: (state) => {
      return state.step === 7 && 
             state.formData.gender &&
             state.formData.race &&
             state.formData.class
    },
    // Проверка: разрешена ли раса
    isRaceAllowed: (state) => (raceId) => {
      if (!state.constraints.allowedRaces || state.constraints.allowedRaces.length === 0) {
        return true
      }
      return state.constraints.allowedRaces.includes(raceId)
    },
    // Проверка: разрешена ли подраса
    isSubraceAllowed: (state) => (subraceId) => {
      // subraceId в формате 'race-aspect'
      if (!state.constraints.allowedSubraces || state.constraints.allowedSubraces.length === 0) {
        return true
      }
      return state.constraints.allowedSubraces.includes(subraceId)
    },
    // Проверка: разрешён ли класс
    isClassAllowed: (state) => (classId) => {
      if (!state.constraints.allowedClasses || state.constraints.allowedClasses.length === 0) {
        return true
      }
      return state.constraints.allowedClasses.includes(classId)
    },
    // Максимальное благосостояние
    maxWealth: (state) => state.constraints.maxWealth ?? 10,
    // Максимальная эпоха
    maxEpoch: (state) => state.constraints.maxEpoch ?? 10,
    // Есть ли какие-либо ограничения
    hasConstraints: (state) => {
      const c = state.constraints
      return (c.allowedRaces?.length > 0) ||
             (c.allowedSubraces?.length > 0) ||
             (c.allowedClasses?.length > 0) ||
             (c.maxWealth < 10) ||
             (c.maxEpoch < 10)
    }
  },
  actions: {
    setStep(step) {
      this.step = step
    },
    // Установка ограничений от мастера
    setConstraints(constraints) {
      this.constraints = {
        allowedRaces: constraints.allowedRaces || [],
        allowedSubraces: constraints.allowedSubraces || [],
        allowedClasses: constraints.allowedClasses || [],
        maxWealth: constraints.maxWealth ?? 10,
        maxEpoch: constraints.maxEpoch ?? 10
      }
    },
    setName(name) {
      this.formData.name = name
    },
    setPortrait(portrait) {
      this.formData.portrait = portrait
    },
    setGender(gender) {
      this.formData.gender = gender
    },
    setRace(race) {
      this.formData.race = race
    },
    setSubrace(subrace) {
      this.formData.subrace = subrace
    },
    setClass(classId) {
      this.formData.class = classId
    },
    setStats(stats) {
      this.formData.stats = { ...this.formData.stats, ...stats }
    },
    setSkills(skills) {
      this.formData.skills = skills
    },
    setEquipment(equipment) {
      this.formData.equipment = equipment
    },
    // Сброс прогресса при закрытии окна создания или завершении
    reset() {
      this.step = 1
      this.constraints = {
        allowedRaces: [],
        allowedSubraces: [],
        allowedClasses: [],
        maxWealth: 10,
        maxEpoch: 10
      }
      this.formData = {
        name: '',
        portrait: null,
        gender: null,
        race: null,
        subrace: null,
        class: null,
        stats: {
          war: 0,
          knowledge: 0,
          community: 0,
          shadow: 0,
          mysticism: 0,
          nature: 0
        },
        skills: {
          fromClass: null,
          fromAspect1: null,
          fromAspect2: null
        },
        equipment: {
          armor: 'clothes',
          weapons: [],
          wealth: 5,
          epoch: 10
        }
      }
    }
  }
})
