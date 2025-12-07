<script setup>
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import aspectsData from '@/data/aspects.json'
import classesData from '@/data/classes.json'
import HealthDisplay from './HealthDisplay.vue'
import CharacterPortrait from './CharacterPortrait.vue'
import { getDefenceData } from '@/utils/defence'

const props = defineProps({
  characters: {
    type: Array,
    required: true
  },
  activeCharacterId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['select-character', 'create-character'])

// Маппинг классов
const classesMap = computed(() => {
  const map = {}
  classesData.classes.forEach(cls => {
    map[cls.id] = cls
  })
  return map
})

// Маппинг аспектов
const aspectsMap = computed(() => {
  const map = {}
  aspectsData.aspects.forEach(aspect => {
    map[aspect.id] = aspect
  })
  return map
})

// Получить уровень персонажа
const getCharacterLevel = (character) => {
  return character.level || 0
}

// Получить класс персонажа
const getCharacterClass = (character) => {
  return classesMap.value[character.classId]
}

// Получить доминирующий аспект (самый высокий)
const getDominantAspect = (character) => {
  if (!character.stats) return null
  
  let maxValue = -Infinity
  let dominantId = null
  
  Object.entries(character.stats).forEach(([aspectId, value]) => {
    if (value > maxValue) {
      maxValue = value
      dominantId = aspectId
    }
  })
  
  return dominantId ? aspectsMap.value[dominantId] : null
}



// Получить активное оружие
const getActiveWeapon = (character) => {
  const activeSetIndex = character.equipment?.activeSetIndex ?? 0
  const weaponSets = character.equipment?.weaponSets || []
  const activeSet = weaponSets[activeSetIndex]
  
  if (!activeSet || !activeSet.weapons || activeSet.weapons.length === 0) {
    return 'Невооружен'
  }
  
  return `${activeSet.weapons.length} предм.`
}

// Получить броню
const getArmor = (character) => {
  return character.equipment?.armor ? '🦺' : '—'
}

const selectCharacter = (characterId) => {
  emit('select-character', characterId)
}

const createCharacter = () => {
  emit('create-character')
}

</script>

<template>
  <div class="character-cards-container">
    <!-- Заголовок -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold text-slate-100">Персонажи</h1>
        <p class="text-slate-400 mt-1">Выберите персонажа для управления</p>
      </div>
      <div class="flex items-center gap-3">
        <button
          @click="createCharacter"
          class="px-4 py-2 rounded-lg bg-sky-500/20 border border-sky-400/60 text-sky-100 hover:bg-sky-500/30 transition flex items-center gap-2 font-semibold"
        >
          <Icon icon="mdi:plus" class="w-5 h-5" />
          Создать
        </button>
      </div>
    </div>

    <!-- Сетка карточек -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        v-for="character in characters"
        :key="character.id"
        @click="selectCharacter(character.id)"
        class="character-card"
        :class="{ 'character-card-active': character.id === activeCharacterId }"
      >
        <!-- Индикатор активности -->
        <div v-if="character.id === activeCharacterId" class="active-badge">
          <Icon icon="mdi:check-circle" class="w-4 h-4" />
          Активен
        </div>

        <!-- Шапка с портретом и основной инфой -->
        <div class="flex items-start gap-4 mb-4">
          <!-- Портрет с ранениями -->
          <div class="relative">
            <CharacterPortrait
              :portrait="character.portrait"
              :name="character.name"
              :combat="character.combat"
              :stats="character.stats"
              :meleeDefence="getDefenceData(character, 'melee')"
              :rangedDefence="getDefenceData(character, 'ranged')"
              :showDefence="true"
              defenceLayout="left"
              size="lg"
            />
            <!-- Уровень -->
            <div class="level-badge">
              {{ getCharacterLevel(character) }}
            </div>
          </div>

          <!-- Имя и класс -->
          <div class="flex-1 min-w-0">
            <h3 class="text-xl font-bold text-slate-100 mb-1 truncate">
              {{ character.name || 'Без имени' }}
            </h3>
            <div class="flex items-center gap-2 mb-2">
              <span 
                class="px-2 py-0.5 rounded text-xs font-semibold"
                :style="{ 
                  backgroundColor: `${getCharacterClass(character)?.color}20`,
                  color: getCharacterClass(character)?.color,
                  borderColor: `${getCharacterClass(character)?.color}40`,
                  borderWidth: '1px'
                }"
              >
                {{ getCharacterClass(character)?.name || 'Класс' }}
              </span>
              <span 
                v-if="getDominantAspect(character)"
                class="text-xs text-slate-400 flex items-center gap-1"
              >
                <Icon :icon="getDominantAspect(character).checkIcon" class="w-3 h-3" />
                {{ getDominantAspect(character).name }}
              </span>
            </div>
          </div>
        </div>

        <!-- Здоровье -->
        <div class="mb-4">
          <HealthDisplay
            :combat="character.combat || { healthType: 'simple', hp: 0, maxHp: 8, wounds: { scratch: 0, light: 0, heavy: 0, deadly: 0 } }"
            :stats="character.stats || {}"
            :readonly="true"
          />
        </div>

        <!-- Статистика -->
        <div class="stats-mini-grid">
          <div class="stat-mini">
            <Icon icon="mdi:sword" class="w-4 h-4 text-red-400" />
            <span class="text-xs text-slate-400">Оружие</span>
            <span class="text-sm font-bold text-slate-200">{{ getActiveWeapon(character) }}</span>
          </div>
          <div class="stat-mini">
            <Icon icon="mdi:shield" class="w-4 h-4 text-blue-400" />
            <span class="text-xs text-slate-400">Броня</span>
            <span class="text-sm font-bold text-slate-200">{{ getArmor(character) }}</span>
          </div>
          <div class="stat-mini">
            <Icon icon="mdi:bag-personal" class="w-4 h-4 text-amber-400" />
            <span class="text-xs text-slate-400">Предметы</span>
            <span class="text-sm font-bold text-slate-200">{{ character.inventory?.length || 0 }}</span>
          </div>
        </div>

        <!-- Ховер эффект -->
        <div class="card-hover-overlay">
          <Icon icon="mdi:arrow-right-circle" class="w-8 h-8" />
          <span class="text-sm font-semibold">Открыть</span>
        </div>
      </div>
    </div>

    <!-- Пустое состояние -->
    <div v-if="characters.length === 0" class="empty-state">
      <div class="empty-icon">
        <Icon icon="mdi:account-group" class="w-16 h-16" />
      </div>
      <h3 class="text-xl font-bold text-slate-300 mb-2">Нет персонажей</h3>
      <p class="text-slate-500 mb-4">Создайте первого персонажа для начала</p>
      <button
        @click="createCharacter"
        class="px-6 py-3 rounded-lg bg-sky-500/20 border border-sky-400/60 text-sky-100 hover:bg-sky-500/30 transition font-semibold"
      >
        Создать персонажа
      </button>
    </div>
  </div>
</template>

<style scoped>
.character-cards-container {
  padding: 2rem;
  min-height: 100%;
}

.character-card {
  position: relative;
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.5) 0%, rgba(15, 23, 42, 0.8) 100%);
  border: 2px solid rgba(148, 163, 184, 0.2);
  border-radius: 1rem;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
  overflow: hidden;
}

.character-card:hover {
  border-color: rgba(56, 189, 248, 0.5);
  background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%);
  transform: translateY(-4px);
  box-shadow: 0 12px 24px -8px rgba(0, 0, 0, 0.5);
}

.character-card:hover .card-hover-overlay {
  opacity: 1;
}

.character-card-active {
  border-color: rgba(16, 185, 129, 0.6);
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 0.9) 100%);
}

.active-badge {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(16, 185, 129, 0.2);
  border: 1px solid rgba(16, 185, 129, 0.4);
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: #10b981;
}

.level-badge {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  border: 2px solid #0f172a;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: white;
}

.stats-mini-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.stat-mini {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.1);
  border-radius: 0.5rem;
}

.card-hover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.9) 0%, rgba(2, 132, 199, 0.9) 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: white;
  opacity: 0;
  transition: opacity 0.3s ease;
  border-radius: 1rem;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  width: 120px;
  height: 120px;
  margin-bottom: 1.5rem;
  background: rgba(30, 41, 59, 0.5);
  border: 2px dashed rgba(148, 163, 184, 0.3);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(148, 163, 184, 0.5);
}

@media (max-width: 768px) {
  .character-cards-container {
    padding: 1rem;
  }
  
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
