<template>
  <div class="flex flex-col items-center gap-4">
    <!-- Toggle switch -->
    <div class="flex items-center gap-2 bg-slate-800/50 rounded-lg p-1 border border-slate-700/50">
      <button
        @click="viewMode = 'stats'"
        class="px-4 py-2 rounded-md text-sm font-medium transition-all"
        :class="viewMode === 'stats' 
          ? 'bg-sky-500/20 text-sky-200 border border-sky-400/40' 
          : 'text-slate-400 hover:text-slate-300'"
      >
        <Icon icon="game-icons:embrassed-energy" class="w-4 h-4 inline mr-1.5" />
        Характеристики
      </button>
      <button
        @click="viewMode = 'checks'"
        class="px-4 py-2 rounded-md text-sm font-medium transition-all"
        :class="viewMode === 'checks' 
          ? 'bg-purple-500/20 text-purple-200 border border-purple-400/40' 
          : 'text-slate-400 hover:text-slate-300'"
      >
        <Icon icon="mdi:dice-d20" class="w-4 h-4 inline mr-1.5" />
        Бонусы проверок
      </button>
    </div>

    <!-- Chart container -->
    <div class="relative" :style="{ width: size + 'px', height: size + 'px' }">
      <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`">
        <!-- Background hexagon grid (for stats) / circles (for checks) -->
        <g v-if="viewMode === 'stats'">
          <g v-for="level in [0, 2, 4, 6, 8, 10]" :key="level">
            <polygon
              :points="getHexagonPoints(level)"
              fill="none"
              :stroke="level === 10 ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.1)'"
              :stroke-width="level === 10 ? 1.5 : 1"
            />
          </g>
        </g>
        
        <g v-else>
          <g v-for="level in [0, 2, 4, 6, 8, 10, 12]" :key="level">
            <circle
              :cx="center"
              :cy="center"
              :r="getRadius(level)"
              fill="none"
              :stroke="level === 12 ? 'rgba(148, 163, 184, 0.3)' : 'rgba(148, 163, 184, 0.1)'"
              :stroke-width="level === 12 ? 1.5 : 1"
            />
          </g>
        </g>

        <!-- Axis lines -->
        <g v-for="(aspect, index) in aspects" :key="aspect.id">
          <line
            :x1="center"
            :y1="center"
            :x2="getAxisPoint(index).x"
            :y2="getAxisPoint(index).y"
            stroke="rgba(148, 163, 184, 0.2)"
            stroke-width="1"
          />
        </g>

        <!-- Data polygon -->
        <polygon
          v-if="viewMode === 'stats'"
          :points="getStatsPoints()"
          fill="rgba(56, 189, 248, 0.3)"
          stroke="rgba(56, 189, 248, 0.7)"
          stroke-width="2"
          class="transition-all duration-300"
        />
        <polygon
          v-else
          :points="getChecksPoints()"
          fill="rgba(139, 92, 246, 0.2)"
          stroke="rgba(139, 92, 246, 0.6)"
          stroke-width="2"
          class="transition-all duration-300"
        />

        <!-- Data points -->
        <g v-for="(aspect, index) in aspects" :key="'point-' + aspect.id">
          <circle
            v-if="viewMode === 'stats' && propsStats[aspect.id] > 0"
            :cx="getStatPoint(index, propsStats[aspect.id]).x"
            :cy="getStatPoint(index, propsStats[aspect.id]).y"
            :r="4"
            :fill="aspectColors[aspect.id]"
            :stroke="aspectColors[aspect.id]"
            stroke-width="2"
            class="transition-all duration-300"
          />
          <circle
            v-else-if="viewMode === 'checks'"
            :cx="getCheckPoint(index, checkBonuses[aspect.id]?.bonus || 0).x"
            :cy="getCheckPoint(index, checkBonuses[aspect.id]?.bonus || 0).y"
            :r="5"
            :fill="aspectColors[aspect.id]"
            :stroke="aspectColors[aspect.id]"
            stroke-width="2"
            class="transition-all duration-300"
          />
        </g>

        <!-- Labels with icons at axis endpoints -->
        <g v-for="(aspect, index) in aspects" :key="'label-' + aspect.id">
          <!-- Icon at axis endpoint with tooltip -->
          <g>
            <title>{{ viewMode === 'stats' ? aspect.characteristic.name : aspect.check?.name }}</title>
            <foreignObject
              :x="getAxisPoint(index).x - 20"
              :y="getAxisPoint(index).y - 20"
              width="40"
              height="40"
            >
              <div class="w-full h-full flex items-center justify-center" xmlns="http://www.w3.org/1999/xhtml">
                <div 
                  class="w-10 h-10 rounded-full flex items-center justify-center shadow-lg"
                  :style="{ 
                    backgroundColor: aspectColors[aspect.id] + '25',
                    borderColor: aspectColors[aspect.id] + '70',
                    borderWidth: '2px'
                  }"
                  :title="viewMode === 'stats' ? aspect.characteristic.name : aspect.check?.name"
                >
                  <Icon 
                    :icon="viewMode === 'stats' ? aspect.characteristicIcon : aspect.checkIcon" 
                    class="w-6 h-6"
                    :style="{ color: aspectColors[aspect.id] }"
                  />
                </div>
              </div>
            </foreignObject>
          </g>

          <!-- Value badge next to icon (stats mode) -->
          <foreignObject
            v-if="viewMode === 'stats'"
            :x="getValueLabelPosition(index).x - 20"
            :y="getValueLabelPosition(index).y - 16"
            width="40"
            height="32"
          >
            <div class="flex items-center justify-center" xmlns="http://www.w3.org/1999/xhtml">
              <div 
                class="text-lg font-bold text-center min-w-[36px]"
                :style="{ 
                  color: aspectColors[aspect.id]
                }"
              >
                {{ propsStats[aspect.id] }}
              </div>
            </div>
          </foreignObject>

          <!-- Bonus badge next to icon (checks mode) -->
          <foreignObject
            v-if="viewMode === 'checks'"
            :x="getValueLabelPosition(index).x - 22"
            :y="getValueLabelPosition(index).y - 16"
            width="44"
            height="32"
          >
            <div class="flex items-center justify-center" xmlns="http://www.w3.org/1999/xhtml">
              <div 
                class="text-lg font-bold text-center min-w-[40px]"
                :style="{ 
                  color: aspectColors[aspect.id]
                }"
              >
                {{ checkBonuses[aspect.id]?.bonus || 0 }}
              </div>
            </div>
          </foreignObject>
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, toRefs } from 'vue'
import { Icon } from '@iconify/vue'
import aspectsData from '@/data/aspects.json'

const props = defineProps({
  stats: {
    type: Object,
    required: true
  },
  size: {
    type: Number,
    default: 340
  }
})

const emit = defineEmits(['swap-stats'])

// Use toRefs for reactivity
const { stats: propsStats } = toRefs(props)

const aspects = aspectsData.aspects
const viewMode = ref('stats') // 'stats' or 'checks'
const center = computed(() => props.size / 2)
const chartRadius = computed(() => (props.size / 2) * 0.6) // 60% of half size for better label spacing

// Aspect colors
const aspectColors = computed(() => {
  const colors = {}
  aspects.forEach(aspect => {
    colors[aspect.id] = aspect.color
  })
  return colors
})

// Calculate check bonuses - make it reactive to stats changes
const checkBonuses = computed(() => {
  const bonuses = {}
  
  aspects.forEach(aspect => {
    const statValue = propsStats.value[aspect.id] || 0
    const neighbors = aspect.neighbors || []
    const opposite = aspect.opposite
    
    // Primary bonus: full stat + half of each neighbor (rounded down)
    const neighbor1Value = propsStats.value[neighbors[0]] || 0
    const neighbor2Value = propsStats.value[neighbors[1]] || 0
    const primaryBonus = statValue + Math.floor(neighbor1Value / 2) + Math.floor(neighbor2Value / 2)
    
    // Alternative bonus: half of opposite (rounded down)
    const oppositeValue = propsStats.value[opposite] || 0
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

// Get point for stats (hexagon, max 10) - rotated 30° clockwise (flat-top)
function getStatPoint(index, value) {
  const maxValue = 10
  const angle = (index * 60 - 120) * (Math.PI / 180) // -120° puts war at top-left (flat-top orientation)
  const distance = (chartRadius.value * value) / maxValue
  
  return {
    x: center.value + distance * Math.cos(angle),
    y: center.value + distance * Math.sin(angle)
  }
}

// Get point for stats with offset (for label positioning)
function getStatPointWithOffset(index, value) {
  const maxValue = 10
  const angle = (index * 60 - 120) * (Math.PI / 180)
  const distance = (chartRadius.value * value) / maxValue
  const offset = 15 // Distance from point to label
  
  return {
    x: center.value + (distance + offset) * Math.cos(angle),
    y: center.value + (distance + offset) * Math.sin(angle)
  }
}

// Get point for checks (circle, max 12) - rotated 30° clockwise (flat-top)
function getCheckPoint(index, value) {
  const angle = (index * 60 - 120) * (Math.PI / 180) // -120° puts war at top-left (flat-top orientation)
  const distance = getRadius(value)
  
  return {
    x: center.value + distance * Math.cos(angle),
    y: center.value + distance * Math.sin(angle)
  }
}

// Get point for checks with offset (for label positioning)
function getCheckPointWithOffset(index, value) {
  const angle = (index * 60 - 120) * (Math.PI / 180)
  const distance = getRadius(value)
  const offset = 15 // Distance from point to label
  
  return {
    x: center.value + (distance + offset) * Math.cos(angle),
    y: center.value + (distance + offset) * Math.sin(angle)
  }
}

// Get radius for check level
function getRadius(level) {
  const maxLevel = 12
  return (chartRadius.value * level) / maxLevel
}

// Get axis endpoint
function getAxisPoint(index) {
  const angle = (index * 60 - 120) * (Math.PI / 180) // -120° puts war at top-left (flat-top orientation)
  const distance = chartRadius.value
  
  return {
    x: center.value + distance * Math.cos(angle),
    y: center.value + distance * Math.sin(angle)
  }
}

// Get hexagon points for background grid
function getHexagonPoints(level) {
  const points = []
  for (let i = 0; i < 6; i++) {
    const point = getStatPoint(i, level)
    points.push(`${point.x},${point.y}`)
  }
  return points.join(' ')
}

// Get stats polygon points
function getStatsPoints() {
  const points = []
  aspects.forEach((aspect, index) => {
    const value = propsStats.value[aspect.id] || 0
    const point = getStatPoint(index, value)
    points.push(`${point.x},${point.y}`)
  })
  return points.join(' ')
}

// Get checks polygon points
function getChecksPoints() {
  const points = []
  aspects.forEach((aspect, index) => {
    const bonus = checkBonuses.value[aspect.id]?.bonus || 0
    const point = getCheckPoint(index, bonus)
    points.push(`${point.x},${point.y}`)
  })
  return points.join(' ')
}

// Get value label position (next to icon, further from center)
function getValueLabelPosition(index) {
  const angle = (index * 60 - 120) * (Math.PI / 180)
  const labelDistance = chartRadius.value * 1.25 // Further out from icon
  
  return {
    x: center.value + labelDistance * Math.cos(angle),
    y: center.value + labelDistance * Math.sin(angle)
  }
}
</script>
