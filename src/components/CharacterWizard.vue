<script setup>
import { ref, computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { generateAvatar } from '@/utils/avatar'
import { Icon } from '@iconify/vue'
import RaceGraph from './RaceGraph.vue'
import SubraceGraph from './SubraceGraph.vue'
import racesData from '@/data/races.json'
import subracesData from '@/data/subraces.json'
import aspectsData from '@/data/aspects.json'

const emit = defineEmits(['close', 'created'])

const userStore = useUserStore()

const currentStep = ref(1)
const totalSteps = 6 // Увеличили для двух шагов выбора расы (раса + подраса)

const viewMode = ref('graphic') // 'graphic' | 'list'
const selectedGender = ref('m') // 'm' | 'f'

const formData = ref({
  name: '',
  race: '',
  subrace: '',
  class: '',
  gender: 'm',
  avatar: null,
  stats: {
    might: 10,      // Мощь (War)
    reason: 10,     // Разум (Knowledge)
    charisma: 10,   // Харизма (Society)
    cunning: 10,    // Хитрость (Shadow)
    intuition: 10,  // Интуиция (Mysticism)
    perception: 10  // Восприятие (Nature)
  },
  skills: [],
  notes: ''
})

const races = racesData.races
const selectedRace = computed(() => races.find(r => r.id === formData.value.race))
const selectedSubrace = computed(() => {
  if (!selectedRace.value || !formData.value.subrace) return null
  
  // Parse subrace ID: {raceId}-{aspectId}
  const parts = formData.value.subrace.split('-')
  if (parts.length !== 2) return null
  
  const [raceId, aspectId] = parts
  const subrace = subracesData.subraces.find(sr => sr.aspect === aspectId)
  if (!subrace) return null
  
  // Get race-specific alias if exists
  const alias = selectedRace.value.subraceAliases?.[aspectId]
  
  return {
    ...subrace,
    id: formData.value.subrace,
    name: alias?.name || `${subrace.name} ${selectedRace.value.name.toLowerCase()}`,
    description: alias?.description || subrace.description
  }
})

// Helper functions for subrace display
const getSubraceAspectColor = (aspectId) => {
  const aspect = aspectsData.aspects.find(a => a.id === aspectId)
  return aspect?.color || '#666'
}

const getSubraceAspectIcon = (aspectId) => {
  const aspect = aspectsData.aspects.find(a => a.id === aspectId)
  return aspect?.icon || 'game-icons:perspective-dice-six-faces-random'
}

const availableClasses = [
  { id: 'warrior', name: 'Воин', icon: '⚔️' },
  { id: 'mage', name: 'Маг', icon: '🔮' },
  { id: 'rogue', name: 'Плут', icon: '🗡️' },
  { id: 'cleric', name: 'Жрец', icon: '✨' },
  { id: 'ranger', name: 'Следопыт', icon: '🏹' }
]

const availableSkills = [
  'Акробатика', 'Атлетика', 'Внимательность', 'Выживание',
  'Запугивание', 'Ловкость рук', 'Магия', 'Медицина',
  'Обман', 'Природа', 'Проницательность', 'Скрытность',
  'Убеждение', 'Уход за животными'
]

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 1:
      return formData.value.race.length > 0
    case 2:
      return formData.value.subrace.length > 0
    case 3:
      return formData.value.name.trim().length > 0
    case 4:
      return formData.value.class.length > 0
    case 5:
      return true // Характеристики имеют значения по умолчанию
    case 6:
      return true // Навыки необязательны
    default:
      return false
  }
})

const nextStep = () => {
  if (currentStep.value < totalSteps && canProceed.value) {
    currentStep.value++
  }
}

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

const toggleSkill = (skill) => {
  const index = formData.value.skills.indexOf(skill)
  if (index > -1) {
    formData.value.skills.splice(index, 1)
  } else {
    formData.value.skills.push(skill)
  }
}

const regenerateAvatar = () => {
  const seed = formData.value.name + Date.now()
  formData.value.avatar = generateAvatar(seed)
}

const createCharacter = () => {
  if (!canProceed.value) return
  
  // Генерируем аватар если его нет
  if (!formData.value.avatar) {
    formData.value.avatar = generateAvatar(formData.value.name)
  }
  
  const character = userStore.addCharacter({
    name: formData.value.name,
    class: formData.value.class,
    avatar: formData.value.avatar,
    level: 1,
    hp: { current: 10, max: 10 },
    stats: formData.value.stats,
    skills: formData.value.skills,
    notes: formData.value.notes
  })
  
  emit('created', character)
  emit('close')
}

// Функция для получения пути к портрету расы
const getRacePortraitUrl = (raceId, gender = 'm') => {
  return `/images/races/portraits/${raceId}_${gender}.png`
}

// Функция для получения иконки расы (временно используем портрет)
const getRaceIconUrl = (raceId, gender = 'm') => {
  return getRacePortraitUrl(raceId, gender)
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
    <div class="w-full max-w-6xl h-[90vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      <!-- Header -->
      <header class="bg-slate-950/60 border-b border-white/10 px-6 py-4 flex-shrink-0">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-2xl font-bold">Создание персонажа</h2>
            <p class="text-sm text-slate-400 mt-1">
              Шаг {{ currentStep }} из {{ totalSteps }}
            </p>
          </div>
          <button
            type="button"
            class="w-10 h-10 rounded-lg border border-white/10 hover:bg-white/5"
            @click="emit('close')"
          >
            <span class="text-2xl text-slate-300">&times;</span>
          </button>
        </div>
        
        <!-- Progress bar -->
        <div class="mt-4 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-300"
            :style="{ width: `${(currentStep / totalSteps) * 100}%` }"
          ></div>
        </div>
      </header>

      <!-- Content с прокруткой -->
      <div class="flex-1 overflow-y-auto px-6 py-6">
        <!-- Step 1: Race -->
        <div v-if="currentStep === 1" class="space-y-6">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-xl font-semibold mb-2">Раса персонажа</h3>
              <p class="text-slate-400 text-sm mb-4">
                Выберите расу для вашего героя на графе аспектов
              </p>
            </div>
            
            <div class="flex gap-2">
              <!-- Переключатель пола -->
              <div class="flex gap-1 bg-slate-950/60 p-1 rounded-lg border border-white/10">
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs rounded transition-all"
                  :class="selectedGender === 'm' 
                    ? 'bg-blue-500/20 text-blue-200' 
                    : 'text-slate-400 hover:text-slate-200'"
                  @click="selectedGender = 'm'; formData.gender = 'm'"
                >
                  ♂ Муж.
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs rounded transition-all"
                  :class="selectedGender === 'f' 
                    ? 'bg-pink-500/20 text-pink-200' 
                    : 'text-slate-400 hover:text-slate-200'"
                  @click="selectedGender = 'f'; formData.gender = 'f'"
                >
                  ♀ Жен.
                </button>
              </div>
              
              <!-- Переключатель режима -->
              <div class="flex gap-1 bg-slate-950/60 p-1 rounded-lg border border-white/10">
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs rounded transition-all"
                  :class="viewMode === 'graphic' 
                    ? 'bg-sky-500/20 text-sky-200' 
                    : 'text-slate-400 hover:text-slate-200'"
                  @click="viewMode = 'graphic'"
                >
                  📊 Графика
                </button>
                <button
                  type="button"
                  class="px-3 py-1.5 text-xs rounded transition-all"
                  :class="viewMode === 'list' 
                    ? 'bg-sky-500/20 text-sky-200' 
                    : 'text-slate-400 hover:text-slate-200'"
                  @click="viewMode = 'list'"
                >
                  📋 Список
                </button>
              </div>
            </div>
          </div>
          
          <!-- Графический режим -->
          <div v-if="viewMode === 'graphic'" class="space-y-4">
            <!-- Граф рас -->
            <div class="flex justify-center bg-slate-950/40 rounded-xl border border-white/10 p-3">
              <RaceGraph
                :selected-race="formData.race"
                :gender="selectedGender"
                @select-race="formData.race = $event"
              />
            </div>
            
            <!-- Описание выбранной расы -->
            <div v-if="selectedRace" class="bg-slate-950/60 rounded-xl border border-white/10 p-6">
              <div class="flex items-start gap-6">
                <!-- Портрет расы -->
                <div class="flex-shrink-0">
                  <img
                    :key="selectedRace.id + selectedGender"
                    :src="getRacePortraitUrl(selectedRace.id, selectedGender)"
                    :alt="`${selectedRace.name} ${selectedGender === 'm' ? '(мужчина)' : '(женщина)'}`"
                    class="w-64 h-80 object-cover rounded-xl border-2 border-white/20 shadow-lg"
                    @error="$event.target.style.display='none'"
                  />
                  <!-- Fallback если портрет не загрузился -->
                  <div 
                    v-if="false"
                    class="w-64 h-80 bg-slate-800 rounded-xl border-2 border-white/20 flex items-center justify-center text-8xl"
                  >
                    {{ selectedRace.icon }}
                  </div>
                </div>
                
                <!-- Информация о расе -->
                <div class="flex-1">
                  <h4 class="text-2xl font-bold mb-2">{{ selectedRace.name }}</h4>
                  <p class="text-slate-300 mb-3">{{ selectedRace.description }}</p>
                  
                  <!-- Позиция на графе аспектов -->
                  <div class="mb-4 text-sm text-slate-400">
                    <span class="font-semibold">Позиция:</span>
                    <span class="ml-2">{{ selectedRace.position.description }}</span>
                  </div>
                  
                  <div class="grid grid-cols-1 gap-4">
                    <!-- Модификаторы характеристик -->
                    <div>
                      <h5 class="text-sm font-semibold text-slate-400 mb-2">Бонусы к характеристикам:</h5>
                      <div class="flex flex-wrap gap-2">
                        <span
                          v-for="(value, stat) in selectedRace.statModifiers"
                          :key="stat"
                          class="px-2 py-1 rounded text-xs font-mono"
                          :class="value > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'"
                        >
                          {{ stat.toUpperCase() }} {{ value > 0 ? '+' : '' }}{{ value }}
                        </span>
                      </div>
                    </div>
                    
                    <!-- Особенности -->
                    <div>
                      <h5 class="text-sm font-semibold text-slate-400 mb-2">Особенности расы:</h5>
                      <div class="flex flex-wrap gap-2">
                        <span
                          v-for="trait in selectedRace.traits"
                          :key="trait"
                          class="px-2 py-1 rounded text-xs bg-sky-500/20 text-sky-300"
                        >
                          {{ trait }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Режим списка -->
          <div v-else class="space-y-3">
            <button
              v-for="race in races"
              :key="race.id"
              type="button"
              class="w-full p-4 rounded-xl border transition-all text-left flex items-start gap-4"
              :class="formData.race === race.id 
                ? 'border-sky-400/80 bg-sky-400/10' 
                : 'border-white/10 bg-slate-950/40 hover:border-white/30'"
              @click="formData.race = race.id"
            >
              <div class="text-3xl flex-shrink-0">{{ race.icon }}</div>
              <div class="flex-1 min-w-0">
                <h4 class="font-semibold mb-1">{{ race.name }}</h4>
                <p class="text-sm text-slate-400">{{ race.description }}</p>
                <div class="flex flex-wrap gap-1 mt-2">
                  <span
                    v-for="trait in race.traits"
                    :key="trait"
                    class="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300"
                  >
                    {{ trait }}
                  </span>
                </div>
              </div>
              <div 
                v-if="formData.race === race.id"
                class="w-6 h-6 rounded-full bg-sky-400 flex items-center justify-center flex-shrink-0"
              >
                <span class="text-white text-sm">✓</span>
              </div>
            </button>
          </div>
        </div>

        <!-- Step 2: Subrace -->
        <div v-else-if="currentStep === 2" class="space-y-6">
          <div>
            <h3 class="text-xl font-semibold mb-2">Подраса</h3>
            <p class="text-slate-400 text-sm mb-4">
              Выберите аспект для {{ selectedRace?.name }}. Каждая подраса добавляет связь с одним из аспектов.
            </p>
          </div>
          
          <div v-if="selectedRace" class="space-y-4">
            <!-- Графический выбор субрасы -->
            <div class="flex justify-center bg-slate-950/40 rounded-xl border border-white/10 p-3">
              <SubraceGraph
                :selected-race="formData.race"
                :selected-subrace="formData.subrace"
                :gender="selectedGender"
                @update:selected-subrace="formData.subrace = $event"
              />
            </div>
            
            <!-- Описание выбранной субрасы -->
            <div v-if="selectedSubrace" class="bg-slate-950/60 rounded-xl border border-white/10 p-6">
              <div class="flex items-start gap-4">
                <!-- Иконка аспекта -->
                <div class="flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center text-4xl"
                  :style="{ backgroundColor: getSubraceAspectColor(selectedSubrace.aspect) + '33' }"
                >
                  <Icon :icon="getSubraceAspectIcon(selectedSubrace.aspect)" />
                </div>
                
                <!-- Информация о субрасе -->
                <div class="flex-1">
                  <h4 class="text-2xl font-bold mb-2">{{ selectedSubrace.name }}</h4>
                  <p class="text-slate-300">{{ selectedSubrace.description }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: Name -->
        <div v-else-if="currentStep === 3" class="space-y-6">
          <div>
            <h3 class="text-xl font-semibold mb-2">Имя персонажа</h3>
            <p class="text-slate-400 text-sm mb-4">
              Как зовут вашего героя?
            </p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-2">
              Введите имя
            </label>
            <input
              v-model="formData.name"
              type="text"
              class="w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-950/60 text-slate-50 text-lg focus:border-sky-400/50 focus:outline-none"
              placeholder="Например: Арагорн"
              maxlength="30"
              @keyup.enter="nextStep"
            />
          </div>
        </div>

        <!-- Step 4: Class -->
        <div v-else-if="currentStep === 4" class="space-y-6">
          <div>
            <h3 class="text-xl font-semibold mb-2">Класс персонажа</h3>
            <p class="text-slate-400 text-sm mb-4">
              Выберите класс для {{ formData.name }}
            </p>
          </div>
          
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <button
              v-for="cls in availableClasses"
              :key="cls.id"
              type="button"
              class="p-4 rounded-xl border transition-all text-center"
              :class="formData.class === cls.id 
                ? 'border-sky-400/80 bg-sky-400/10' 
                : 'border-white/10 bg-slate-950/40 hover:border-white/30'"
              @click="formData.class = cls.id"
            >
              <div class="text-3xl mb-2">{{ cls.icon }}</div>
              <div class="text-sm font-semibold">{{ cls.name }}</div>
            </button>
          </div>
        </div>

        <!-- Step 5: Stats -->
        <div v-else-if="currentStep === 5" class="space-y-6">
          <div>
            <h3 class="text-xl font-semibold mb-2">Характеристики</h3>
            <p class="text-slate-400 text-sm mb-4">
              Распределите характеристики для {{ formData.name }}
            </p>
          </div>
          
          <div class="space-y-4">
            <div class="flex items-center gap-4">
              <label class="w-32 text-sm font-medium text-slate-300">
                <span class="text-red-400">⚔️</span> Мощь (MIG)
              </label>
              <input
                v-model.number="formData.stats.might"
                type="range"
                min="3"
                max="18"
                class="flex-1 h-2 bg-slate-800 rounded-full cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-sky-400
                       [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-webkit-slider-thumb]:border-2
                       [&::-webkit-slider-thumb]:border-sky-300
                       [&::-moz-range-thumb]:w-4
                       [&::-moz-range-thumb]:h-4
                       [&::-moz-range-thumb]:rounded-full
                       [&::-moz-range-thumb]:bg-sky-400
                       [&::-moz-range-thumb]:cursor-pointer
                       [&::-moz-range-thumb]:border-2
                       [&::-moz-range-thumb]:border-sky-300
                       [&::-moz-range-thumb]:border-none"
              />
              <span class="w-12 text-right text-2xl font-bold font-mono">
                {{ formData.stats.might }}
              </span>
            </div>
            
            <div class="flex items-center gap-4">
              <label class="w-32 text-sm font-medium text-slate-300">
                <span class="text-blue-400">📚</span> Разум (REA)
              </label>
              <input
                v-model.number="formData.stats.reason"
                type="range"
                min="3"
                max="18"
                class="flex-1 h-2 bg-slate-800 rounded-full cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-sky-400
                       [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-webkit-slider-thumb]:border-2
                       [&::-webkit-slider-thumb]:border-sky-300
                       [&::-moz-range-thumb]:w-4
                       [&::-moz-range-thumb]:h-4
                       [&::-moz-range-thumb]:rounded-full
                       [&::-moz-range-thumb]:bg-sky-400
                       [&::-moz-range-thumb]:cursor-pointer
                       [&::-moz-range-thumb]:border-2
                       [&::-moz-range-thumb]:border-sky-300
                       [&::-moz-range-thumb]:border-none"
              />
              <span class="w-12 text-right text-2xl font-bold font-mono">
                {{ formData.stats.reason }}
              </span>
            </div>
            
            <div class="flex items-center gap-4">
              <label class="w-32 text-sm font-medium text-slate-300">
                <span class="text-amber-400">👑</span> Харизма (CHA)
              </label>
              <input
                v-model.number="formData.stats.charisma"
                type="range"
                min="3"
                max="18"
                class="flex-1 h-2 bg-slate-800 rounded-full cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-sky-400
                       [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-webkit-slider-thumb]:border-2
                       [&::-webkit-slider-thumb]:border-sky-300
                       [&::-moz-range-thumb]:w-4
                       [&::-moz-range-thumb]:h-4
                       [&::-moz-range-thumb]:rounded-full
                       [&::-moz-range-thumb]:bg-sky-400
                       [&::-moz-range-thumb]:cursor-pointer
                       [&::-moz-range-thumb]:border-2
                       [&::-moz-range-thumb]:border-sky-300
                       [&::-moz-range-thumb]:border-none"
              />
              <span class="w-12 text-right text-2xl font-bold font-mono">
                {{ formData.stats.charisma }}
              </span>
            </div>
            
            <div class="flex items-center gap-4">
              <label class="w-32 text-sm font-medium text-slate-300">
                <span class="text-gray-400">🗡️</span> Хитрость (CUN)
              </label>
              <input
                v-model.number="formData.stats.cunning"
                type="range"
                min="3"
                max="18"
                class="flex-1 h-2 bg-slate-800 rounded-full cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-sky-400
                       [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-webkit-slider-thumb]:border-2
                       [&::-webkit-slider-thumb]:border-sky-300
                       [&::-moz-range-thumb]:w-4
                       [&::-moz-range-thumb]:h-4
                       [&::-moz-range-thumb]:rounded-full
                       [&::-moz-range-thumb]:bg-sky-400
                       [&::-moz-range-thumb]:cursor-pointer
                       [&::-moz-range-thumb]:border-2
                       [&::-moz-range-thumb]:border-sky-300
                       [&::-moz-range-thumb]:border-none"
              />
              <span class="w-12 text-right text-2xl font-bold font-mono">
                {{ formData.stats.cunning }}
              </span>
            </div>
            
            <div class="flex items-center gap-4">
              <label class="w-32 text-sm font-medium text-slate-300">
                <span class="text-purple-400">✨</span> Интуиция (INT)
              </label>
              <input
                v-model.number="formData.stats.intuition"
                type="range"
                min="3"
                max="18"
                class="flex-1 h-2 bg-slate-800 rounded-full cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-sky-400
                       [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-webkit-slider-thumb]:border-2
                       [&::-webkit-slider-thumb]:border-sky-300
                       [&::-moz-range-thumb]:w-4
                       [&::-moz-range-thumb]:h-4
                       [&::-moz-range-thumb]:rounded-full
                       [&::-moz-range-thumb]:bg-sky-400
                       [&::-moz-range-thumb]:cursor-pointer
                       [&::-moz-range-thumb]:border-2
                       [&::-moz-range-thumb]:border-sky-300
                       [&::-moz-range-thumb]:border-none"
              />
              <span class="w-12 text-right text-2xl font-bold font-mono">
                {{ formData.stats.intuition }}
              </span>
            </div>
            
            <div class="flex items-center gap-4">
              <label class="w-32 text-sm font-medium text-slate-300">
                <span class="text-green-400">🌿</span> Восприятие (PER)
              </label>
              <input
                v-model.number="formData.stats.perception"
                type="range"
                min="3"
                max="18"
                class="flex-1 h-2 bg-slate-800 rounded-full cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-4
                       [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-sky-400
                       [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-webkit-slider-thumb]:border-2
                       [&::-webkit-slider-thumb]:border-sky-300
                       [&::-moz-range-thumb]:w-4
                       [&::-moz-range-thumb]:h-4
                       [&::-moz-range-thumb]:rounded-full
                       [&::-moz-range-thumb]:bg-sky-400
                       [&::-moz-range-thumb]:cursor-pointer
                       [&::-moz-range-thumb]:border-2
                       [&::-moz-range-thumb]:border-sky-300
                       [&::-moz-range-thumb]:border-none"
              />
              <span class="w-12 text-right text-2xl font-bold font-mono">
                {{ formData.stats.perception }}
              </span>
            </div>
          </div>
        </div>

        <!-- Step 6: Skills -->
        <div v-else-if="currentStep === 6" class="space-y-6">
          <div>
            <h3 class="text-xl font-semibold mb-2">Навыки</h3>
            <p class="text-slate-400 text-sm mb-4">
              Выберите навыки для {{ formData.name }} (необязательно)
            </p>
          </div>
          
          <div class="flex flex-wrap gap-2">
            <button
              v-for="skill in availableSkills"
              :key="skill"
              type="button"
              class="px-4 py-2 rounded-lg border text-sm transition-all"
              :class="formData.skills.includes(skill)
                ? 'border-sky-400/80 bg-sky-400/10 text-sky-200'
                : 'border-white/10 bg-slate-950/40 text-slate-300 hover:border-white/30'"
              @click="toggleSkill(skill)"
            >
              {{ skill }}
            </button>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <footer class="bg-slate-950/60 border-t border-white/10 px-6 py-4 flex-shrink-0">
        <div class="flex items-center justify-between gap-4">
          <button
            v-if="currentStep > 1"
            type="button"
            class="px-6 py-2.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 transition"
            @click="prevStep"
          >
            Назад
          </button>
          <div v-else></div>
          
          <button
            v-if="currentStep < totalSteps"
            type="button"
            class="px-6 py-2.5 rounded-lg bg-sky-500/20 border border-sky-400/60 text-sky-100 font-semibold hover:bg-sky-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!canProceed"
            @click="nextStep"
          >
            Далее
          </button>
          <button
            v-else
            type="button"
            class="px-6 py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-400/60 text-emerald-100 font-semibold hover:bg-emerald-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!canProceed"
            @click="createCharacter"
          >
            Создать персонажа
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>
