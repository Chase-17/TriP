import { defineStore } from 'pinia'

export const useCharacterCreationStore = defineStore('characterCreation', {
  state: () => ({
    step: 1,
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
    key: 'trip-character-creation-v2', // Updated to reset old cached data
    paths: ['step', 'formData']
  },
  getters: {
    isComplete: (state) => {
      return state.step === 7 && 
             state.formData.gender &&
             state.formData.race &&
             state.formData.class
    }
  },
  actions: {
    setStep(step) {
      this.step = step
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
