<template>
  <div class="space-y-6">
    <!-- Stats Distribution -->
    <div v-if="showStats">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Характеристики</h4>
        <button
          v-if="connectedAspects.length === 2"
          @click="swapStats"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 text-slate-300 transition"
        >
          <Icon icon="mdi:swap-horizontal" class="w-4 h-4" />
          <span>Поменять местами</span>
        </button>
      </div>

      <div class="space-y-2">
        <!-- Connected aspects (6/4 split) -->
        <div
          v-for="(aspectId, index) in connectedAspects"
          :key="aspectId"
          class="flex items-center justify-between p-3 rounded-lg border transition-colors"
          :style="{
            backgroundColor: getAspectColor(aspectId) + '15',
            borderColor: getAspectColor(aspectId) + '40'
          }"
        >
          <div class="flex items-center gap-3 flex-1">
            <Icon
              :icon="getAspect(aspectId)?.characteristicIcon || 'mdi:star'"
              class="w-6 h-6"
              :style="{ color: getAspectColor(aspectId) }"
            />
            <div class="flex-1">
              <div class="text-sm font-medium text-slate-200">
                {{ getAspect(aspectId)?.characteristic.name }}
              </div>
              <div class="text-xs text-slate-400">
                {{ getAspect(aspectId)?.name }}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <!-- Check bonus -->
            <div 
              class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border"
              :style="{
                backgroundColor: getAspectColor(aspectId) + '15',
                borderColor: getAspectColor(aspectId) + '30'
              }"
            >
              <Icon
                :icon="checkBonuses[aspectId]?.checkIcon"
                class="w-4 h-4"
                :style="{ color: getAspectColor(aspectId) + 'aa' }"
              />
              <div class="text-right">
                <div class="text-[10px] uppercase font-medium tracking-wide" :style="{ color: getAspectColor(aspectId) + 'cc' }">
                  {{ checkBonuses[aspectId]?.checkName }}
                </div>
                <div class="text-sm font-bold" :style="{ color: getAspectColor(aspectId) }">
                  +{{ checkBonuses[aspectId]?.bonus }}
                </div>
              </div>
            </div>
            <!-- Stat value -->
            <div
              class="text-2xl font-bold px-3 py-1 rounded"
              :style="{
                color: getAspectColor(aspectId),
                backgroundColor: getAspectColor(aspectId) + '20'
              }"
            >
              {{ stats[aspectId] }}
            </div>
          </div>
        </div>

        <!-- Neutral aspects (2 or 1 for paradoxical) -->
        <div
          v-for="aspectId in neutralAspects"
          :key="aspectId"
          class="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30"
        >
          <div class="flex items-center gap-3 flex-1">
            <Icon
              :icon="getAspect(aspectId)?.characteristicIcon || 'mdi:star'"
              class="w-6 h-6 text-slate-400"
            />
            <div class="flex-1">
              <div class="text-sm font-medium text-slate-300">
                {{ getAspect(aspectId)?.characteristic.name }}
              </div>
              <div class="text-xs text-slate-500">
                {{ getAspect(aspectId)?.name }}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <!-- Check bonus -->
            <div 
              class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-700/40 bg-slate-800/40"
            >
              <Icon
                :icon="checkBonuses[aspectId]?.checkIcon"
                class="w-4 h-4 text-slate-500"
              />
              <div class="text-right">
                <div class="text-[10px] uppercase font-medium tracking-wide text-slate-500">
                  {{ checkBonuses[aspectId]?.checkName }}
                </div>
                <div class="text-sm font-bold text-slate-400">
                  +{{ checkBonuses[aspectId]?.bonus }}
                </div>
              </div>
            </div>
            <!-- Stat value -->
            <div class="text-xl font-semibold text-slate-400 px-3 py-1">
              {{ stats[aspectId] }}
            </div>
          </div>
        </div>

        <!-- Opposite aspects (0) -->
        <div
          v-for="aspectId in oppositeAspects"
          :key="aspectId"
          class="flex items-center justify-between p-3 rounded-lg bg-slate-900/50 border border-slate-800/50 opacity-60"
        >
          <div class="flex items-center gap-3 flex-1">
            <Icon
              :icon="getAspect(aspectId)?.characteristicIcon || 'mdi:star'"
              class="w-6 h-6 text-slate-600"
            />
            <div class="flex-1">
              <div class="text-sm font-medium text-slate-500">
                {{ getAspect(aspectId)?.characteristic.name }}
              </div>
              <div class="text-xs text-slate-600">
                {{ getAspect(aspectId)?.name }}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <!-- Check bonus -->
            <div 
              class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-800/50 bg-slate-900/40"
            >
              <Icon
                :icon="checkBonuses[aspectId]?.checkIcon"
                class="w-4 h-4 text-slate-600"
              />
              <div class="text-right">
                <div class="text-[10px] uppercase font-medium tracking-wide text-slate-600">
                  {{ checkBonuses[aspectId]?.checkName }}
                </div>
                <div class="text-sm font-bold text-slate-600">
                  +{{ checkBonuses[aspectId]?.bonus }}
                </div>
              </div>
            </div>
            <!-- Stat value -->
            <div class="text-xl font-semibold text-slate-600 px-3 py-1">
              0
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Skills Selection -->
    <div v-if="showSkills">
      <h4 class="text-sm font-semibold text-slate-300 mb-3">Выбор навыков (3 из 9)</h4>
      
      <div class="space-y-3">
        <!-- Skill from Class -->
        <div>
          <div class="text-xs font-medium text-slate-400 mb-2 flex items-center gap-2">
            <Icon icon="game-icons:skills" class="w-4 h-4" />
            Навык класса (1 из {{ classTraits.length }})
          </div>
          <div class="grid grid-cols-1 gap-2">
            <div
              v-for="trait in classTraits"
              :key="trait.id"
              class="rounded-lg border transition-all overflow-hidden"
              :class="skills.fromClass === trait.id 
                ? 'bg-slate-700/40 border-slate-500/60 ring-2 ring-slate-500/30' 
                : 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-800/40 hover:border-slate-700/40'"
            >
              <button
                @click="selectSkill('fromClass', trait.id)"
                class="w-full text-left p-3 transition"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-slate-200 mb-1">{{ trait.name }}</div>
                    <div class="text-xs text-slate-500 leading-relaxed">{{ trait.levels[0].text }}</div>
                  </div>
                  <Icon
                    v-if="skills.fromClass === trait.id"
                    icon="mdi:check-circle"
                    class="w-5 h-5 text-slate-300 flex-shrink-0"
                  />
                </div>
              </button>
              
              <!-- Collapsible levels -->
              <div v-if="trait.levels.length > 1" class="border-t border-slate-700/30">
                <button
                  @click="toggleSkillExpand(trait.id)"
                  class="w-full px-3 py-2 text-xs text-slate-400 hover:text-slate-300 hover:bg-white/5 transition flex items-center gap-1.5"
                >
                  <Icon
                    :icon="expandedSkills.has(trait.id) ? 'mdi:chevron-up' : 'mdi:chevron-down'"
                    class="w-4 h-4"
                  />
                  <span>{{ expandedSkills.has(trait.id) ? 'Скрыть' : 'Показать' }} уровни 2-3</span>
                </button>
                
                <div
                  v-if="expandedSkills.has(trait.id)"
                  class="px-3 pb-3 space-y-2 bg-slate-900/30"
                >
                  <div
                    v-for="(level, index) in trait.levels.slice(1)"
                    :key="index"
                    class="p-2 rounded bg-slate-800/50 border border-slate-700/50"
                  >
                    <div class="text-xs font-medium text-slate-300 mb-1">Уровень {{ index + 2 }}</div>
                    <div class="text-xs text-slate-400">{{ level.text }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Skill from Aspect 1 -->
        <div>
          <div class="text-xs font-medium mb-2 flex items-center gap-2" :style="{ color: getAspectColor(connectedAspects[0]) }">
            <Icon :icon="getAspect(connectedAspects[0])?.icon" class="w-4 h-4" />
            Навык аспекта {{ getAspect(connectedAspects[0])?.name }} (1 из {{ aspectTraits[0]?.length || 0 }})
          </div>
          <div class="grid grid-cols-1 gap-2">
            <div
              v-for="trait in aspectTraits[0]"
              :key="trait.id"
              class="rounded-lg border transition-all overflow-hidden"
              :class="skills.fromAspect1 === trait.id 
                ? 'bg-slate-700/40 border-slate-500/60 ring-2 ring-slate-500/30' 
                : 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-800/40 hover:border-slate-700/40'"
            >
              <button
                @click="selectSkill('fromAspect1', trait.id)"
                class="w-full text-left p-3 transition"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-slate-200 mb-1">{{ trait.name }}</div>
                    <div class="text-xs text-slate-500 leading-relaxed">{{ trait.levels[0].text }}</div>
                  </div>
                  <Icon
                    v-if="skills.fromAspect1 === trait.id"
                    icon="mdi:check-circle"
                    class="w-5 h-5 text-slate-300 flex-shrink-0"
                  />
                </div>
              </button>
              
              <!-- Collapsible levels -->
              <div
                v-if="trait.levels.length > 1"
                class="border-t border-slate-700/30"
              >
                <button
                  @click="toggleSkillExpand(trait.id)"
                  class="w-full px-3 py-2 text-xs text-slate-400 hover:text-slate-300 hover:bg-white/5 transition flex items-center gap-1.5"
                >
                  <Icon
                    :icon="expandedSkills.has(trait.id) ? 'mdi:chevron-up' : 'mdi:chevron-down'"
                    class="w-4 h-4"
                  />
                  <span>{{ expandedSkills.has(trait.id) ? 'Скрыть' : 'Показать' }} уровни 2-3</span>
                </button>
                
                <div
                  v-if="expandedSkills.has(trait.id)"
                  class="px-3 pb-3 space-y-2 bg-slate-900/30"
                >
                  <div
                    v-for="(level, index) in trait.levels.slice(1)"
                    :key="index"
                    class="p-2 rounded border bg-slate-800/50 border-slate-700/50"
                  >
                    <div class="text-xs font-medium text-slate-300 mb-1">Уровень {{ index + 2 }}</div>
                    <div class="text-xs text-slate-400">{{ level.text }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Skill from Aspect 2 -->
        <div>
          <div class="text-xs font-medium mb-2 flex items-center gap-2" :style="{ color: getAspectColor(connectedAspects[1]) }">
            <Icon :icon="getAspect(connectedAspects[1])?.icon" class="w-4 h-4" />
            Навык аспекта {{ getAspect(connectedAspects[1])?.name }} (1 из {{ aspectTraits[1]?.length || 0 }})
          </div>
          <div class="grid grid-cols-1 gap-2">
            <div
              v-for="trait in aspectTraits[1]"
              :key="trait.id"
              class="rounded-lg border transition-all overflow-hidden"
              :class="skills.fromAspect2 === trait.id 
                ? 'bg-slate-700/40 border-slate-500/60 ring-2 ring-slate-500/30' 
                : 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-800/40 hover:border-slate-700/40'"
            >
              <button
                @click="selectSkill('fromAspect2', trait.id)"
                class="w-full text-left p-3 transition"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-slate-200 mb-1">{{ trait.name }}</div>
                    <div class="text-xs text-slate-500 leading-relaxed">{{ trait.levels[0].text }}</div>
                  </div>
                  <Icon
                    v-if="skills.fromAspect2 === trait.id"
                    icon="mdi:check-circle"
                    class="w-5 h-5 text-slate-300 flex-shrink-0"
                  />
                </div>
              </button>
              
              <!-- Collapsible levels -->
              <div
                v-if="trait.levels.length > 1"
                class="border-t border-slate-700/30"
              >
                <button
                  @click="toggleSkillExpand(trait.id)"
                  class="w-full px-3 py-2 text-xs text-slate-400 hover:text-slate-300 hover:bg-white/5 transition flex items-center gap-1.5"
                >
                  <Icon
                    :icon="expandedSkills.has(trait.id) ? 'mdi:chevron-up' : 'mdi:chevron-down'"
                    class="w-4 h-4"
                  />
                  <span>{{ expandedSkills.has(trait.id) ? 'Скрыть' : 'Показать' }} уровни 2-3</span>
                </button>
                
                <div
                  v-if="expandedSkills.has(trait.id)"
                  class="px-3 pb-3 space-y-2 bg-slate-900/30"
                >
                  <div
                    v-for="(level, index) in trait.levels.slice(1)"
                    :key="index"
                    class="p-2 rounded border bg-slate-800/50 border-slate-700/50"
                  >
                    <div class="text-xs font-medium text-slate-300 mb-1">Уровень {{ index + 2 }}</div>
                    <div class="text-xs text-slate-400">{{ level.text }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import aspectsData from '@/data/aspects.json'
import classesData from '@/data/classes.json'

const props = defineProps({
  classId: {
    type: String,
    required: true
  },
  modelValue: {
    type: Object,
    required: true
  },
  showStats: {
    type: Boolean,
    default: true
  },
  showSkills: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:modelValue'])

const aspects = aspectsData.aspects
const classes = classesData.classes

// Local reactive copies
const stats = ref({ ...props.modelValue.stats })
const skills = ref({ ...props.modelValue.skills })
const isInitializing = ref(false)

// Collapsible state for skill levels
const expandedSkills = ref(new Set())

// Watch for external changes (but not during initialization)
watch(() => props.modelValue, (newVal) => {
  if (!isInitializing.value) {
    // Only update if values actually changed to prevent loops
    const statsChanged = JSON.stringify(stats.value) !== JSON.stringify(newVal.stats)
    const skillsChanged = JSON.stringify(skills.value) !== JSON.stringify(newVal.skills)
    
    if (statsChanged) {
      stats.value = { ...newVal.stats }
    }
    if (skillsChanged) {
      skills.value = { ...newVal.skills }
    }
  }
}, { deep: true, flush: 'post' })

// Emit changes back to parent (but not during initialization)
watch([stats, skills], () => {
  if (!isInitializing.value) {
    emit('update:modelValue', {
      stats: { ...stats.value },
      skills: { ...skills.value }
    })
  }
}, { deep: true, flush: 'post' })

const selectedClass = computed(() => {
  return classes.find(c => c.id === props.classId)
})

const connectedAspects = computed(() => {
  if (!selectedClass.value) return []
  return selectedClass.value.aspects
})

// Check if class is paradoxical (opposite aspects)
const isParadoxical = computed(() => {
  if (connectedAspects.value.length !== 2) return false
  const aspect1 = getAspect(connectedAspects.value[0])
  const aspect2 = getAspect(connectedAspects.value[1])
  return aspect1?.opposite === connectedAspects.value[1]
})

const neutralAspects = computed(() => {
  if (!selectedClass.value) return []
  const allAspects = aspects.map(a => a.id)
  const connected = connectedAspects.value
  
  if (isParadoxical.value) {
    // For paradoxical classes, all non-connected aspects are neutral
    return allAspects.filter(id => !connected.includes(id))
  } else {
    // For normal classes, get opposite aspects of both connected aspects
    const opposite1 = getAspect(connected[0])?.opposite
    const opposite2 = getAspect(connected[1])?.opposite
    const opposites = [opposite1, opposite2].filter(Boolean)
    
    // Neutral are those that are not connected and not opposite
    return allAspects.filter(id => !connected.includes(id) && !opposites.includes(id))
  }
})

const oppositeAspects = computed(() => {
  if (isParadoxical.value) return []
  if (!selectedClass.value) return []
  
  const connected = connectedAspects.value
  const opposite1 = getAspect(connected[0])?.opposite
  const opposite2 = getAspect(connected[1])?.opposite
  
  return [opposite1, opposite2].filter(Boolean)
})

const classTraits = computed(() => {
  return selectedClass.value?.traits || []
})

const aspectTraits = computed(() => {
  if (!selectedClass.value) return [[], []]
  
  // Get traits directly from aspects
  const aspect1 = aspects.find(a => a.id === connectedAspects.value[0])
  const aspect2 = aspects.find(a => a.id === connectedAspects.value[1])
  
  const traits1 = aspect1?.traits || []
  const traits2 = aspect2?.traits || []
  
  return [traits1, traits2]
})

function getAspect(id) {
  return aspects.find(a => a.id === id)
}

function getAspectColor(id) {
  return getAspect(id)?.color || '#64748b'
}

// Calculate check bonuses
// Формула: floor(aspect + neighbor1/2 + neighbor2/2 + modifiers)
// Alternative: floor(opposite/2)
// Результат: max(primary, alternative)
// Примечание: floor на всю сумму, чтобы 0.5 + 0.5 = 1
const checkBonuses = computed(() => {
  const bonuses = {}
  
  // На этапе создания персонажа штрафов от ран нет, modifiers = 0
  const modifiers = 0
  
  aspects.forEach(aspect => {
    const statValue = stats.value[aspect.id] || 0
    const neighbors = aspect.neighbors || []
    const opposite = aspect.opposite
    
    // Primary bonus: floor(stat + neighbor1/2 + neighbor2/2 + modifiers)
    const neighbor1Value = stats.value[neighbors[0]] || 0
    const neighbor2Value = stats.value[neighbors[1]] || 0
    const primaryBonus = Math.floor(statValue + neighbor1Value / 2 + neighbor2Value / 2 + modifiers)
    
    // Alternative bonus: floor(opposite/2)
    const oppositeValue = stats.value[opposite] || 0
    const alternativeBonus = Math.floor(oppositeValue / 2)
    
    // Use the maximum of the two bonuses
    const maxBonus = Math.max(primaryBonus, alternativeBonus)
    
    bonuses[aspect.id] = {
      bonus: maxBonus,
      checkName: aspect.check?.name || '',
      checkIcon: aspect.checkIcon
    }
  })
  
  return bonuses
})

function getOppositeAspect() {
  if (!selectedClass.value || connectedAspects.value.length === 0) return null
  
  // Get opposite of first aspect
  const aspect1 = getAspect(connectedAspects.value[0])
  return aspect1?.opposite || null
}

// Initialize stats based on class
watch(() => props.classId, (newClassId) => {
  if (!newClassId) return
  
  isInitializing.value = true
  
  // Reset all stats
  const newStats = {
    war: 0,
    knowledge: 0,
    community: 0,
    shadow: 0,
    mysticism: 0,
    nature: 0
  }
  
  const connected = connectedAspects.value
  const neutral = neutralAspects.value
  const opposites = oppositeAspects.value
  
  if (connected.length === 2) {
    if (isParadoxical.value) {
      // Paradoxical: 6/4 in connected, 1 in all 4 neutral (no opposites)
      newStats[connected[0]] = 6
      newStats[connected[1]] = 4
      neutral.forEach(id => {
        newStats[id] = 1
      })
    } else {
      // Normal: 6/4 in connected, 2 in 2 neutral, 0 in 2 opposites
      newStats[connected[0]] = 6
      newStats[connected[1]] = 4
      neutral.forEach(id => {
        newStats[id] = 2
      })
      opposites.forEach(id => {
        newStats[id] = 0
      })
    }
  }
  
  stats.value = newStats
  
  // Allow updates after initialization
  setTimeout(() => {
    isInitializing.value = false
    
    // Force emit to trigger reactivity in parent and chart
    emit('update:modelValue', {
      stats: { ...stats.value },
      skills: { ...skills.value }
    })
  }, 0)
}, { immediate: true })

function swapStats() {
  const temp = stats.value[connectedAspects.value[0]]
  stats.value[connectedAspects.value[0]] = stats.value[connectedAspects.value[1]]
  stats.value[connectedAspects.value[1]] = temp
}

function selectSkill(slot, traitId) {
  skills.value[slot] = traitId
}

function toggleSkillExpand(traitId) {
  if (expandedSkills.value.has(traitId)) {
    expandedSkills.value.delete(traitId)
  } else {
    expandedSkills.value.add(traitId)
  }
}

// Check if all skills are selected
const allSkillsSelected = computed(() => {
  return skills.value.fromClass && skills.value.fromAspect1 && skills.value.fromAspect2
})

defineExpose({
  allSkillsSelected,
  swapStats
})
</script>
