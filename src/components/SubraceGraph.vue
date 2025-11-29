<template>
  <div class="subrace-graph-container">
    <svg :width="size" :height="size" class="subrace-graph">
      <defs>
        <!-- Hexagon clip path for race portrait (увеличенный) -->
        <!-- Центр clipPath должен быть в центре SVG -->
        <clipPath id="hexClip-subrace">
          <polygon :points="getHexagonPath(size/2, size/2, 80)" />
        </clipPath>
      </defs>
      
      <!-- Center race portrait (увеличенный) - вне трансформированной группы -->
      <g class="transition-all duration-300">
        <!-- Hexagonal portrait (увеличенный) -->
        <g clip-path="url(#hexClip-subrace)">
          <image
            :href="getRaceImageUrl"
            :x="size/2 - 80"
            :y="size/2 - 80"
            width="160"
            height="160"
            preserveAspectRatio="xMidYMid slice"
          />
        </g>
        
        <!-- Hexagon border (белая базовая обводка) -->
        <polygon
          :points="getHexagonPath(size/2, size/2, 80)"
          fill="none"
          stroke="white"
          stroke-width="2"
          opacity="0.6"
        />
        
        <!-- Hexagon border (цветная обводка выбранного аспекта) -->
        <polygon
          v-if="selectedAspectId"
          :points="getHexagonPath(size/2, size/2, 80)"
          fill="none"
          :stroke="getAspectColor(selectedAspectId)"
          stroke-width="4"
          opacity="0.9"
          class="drop-shadow-lg transition-all duration-500"
        />
      </g>
      
      <!-- Аспекты и интерактивные элементы -->
      <g :transform="`translate(${size/2}, ${size/2})`">
        <!-- Connecting lines from center to selected aspect -->
        <g v-if="selectedAspectId" class="connection-lines">
          <line
            :x1="0"
            :y1="0"
            :x2="getAspectPosition(selectedAspectId).x"
            :y2="getAspectPosition(selectedAspectId).y"
            :stroke="getAspectColor(selectedAspectId)"
            stroke-width="3"
            stroke-opacity="0.6"
            class="transition-all duration-300"
          />
        </g>
        
        <!-- Аспекты (фоновые, как в RaceGraph) -->
        <g class="aspects">
          <g
            v-for="aspectId in allAspects"
            :key="`aspect-bg-${aspectId}`"
          >
            <!-- Круг аспекта (полупрозрачный, на заднем плане) -->
            <circle
              :cx="getAspectPosition(aspectId).x"
              :cy="getAspectPosition(aspectId).y"
              r="32"
              :fill="getAspectColor(aspectId)"
              fill-opacity="0.2"
              class="blur-sm"
            />
            
            <!-- Иконка аспекта -->
            <foreignObject
              :x="getAspectPosition(aspectId).x - 16"
              :y="getAspectPosition(aspectId).y - 16"
              width="32"
              height="32"
              class="pointer-events-none"
            >
              <div class="flex items-center justify-center w-full h-full opacity-30">
                <Icon :icon="getAspectIcon(aspectId)" class="text-2xl" />
              </div>
            </foreignObject>
          </g>
        </g>
        
        <!-- Clickable aspect areas -->
        <g class="aspect-buttons">
          <g 
            v-for="aspectId in allAspects" 
            :key="`aspect-btn-${aspectId}`"
            class="cursor-pointer"
            @click="selectSubrace(aspectId)"
            @mouseenter="hoveredAspect = aspectId"
            @mouseleave="hoveredAspect = null"
          >
            <!-- Invisible clickable circle -->
            <circle
              :cx="getAspectPosition(aspectId).x"
              :cy="getAspectPosition(aspectId).y"
              r="40"
              fill="transparent"
              class="transition-all duration-200"
            />
            
            <!-- Hover highlight -->
            <circle
              v-if="hoveredAspect === aspectId"
              :cx="getAspectPosition(aspectId).x"
              :cy="getAspectPosition(aspectId).y"
              r="36"
              :fill="getAspectColor(aspectId)"
              opacity="0.3"
              class="pointer-events-none transition-all duration-200"
            />
            
            <!-- Selection indicator ring -->
            <circle
              v-if="isAspectSelected(aspectId)"
              :cx="getAspectPosition(aspectId).x"
              :cy="getAspectPosition(aspectId).y"
              r="38"
              fill="none"
              :stroke="getAspectColor(aspectId)"
              stroke-width="3"
              opacity="0.8"
              class="pointer-events-none"
            />
          </g>
        </g>

        <!-- Aspect labels -->
        <g v-for="aspectId in allAspects" :key="`label-${aspectId}`">
          <text
            :x="getLabelPosition(aspectId).x"
            :y="getLabelPosition(aspectId).y"
            text-anchor="middle"
            class="text-xs font-medium select-none transition-all duration-200"
            :class="isAspectSelected(aspectId) ? 'fill-white opacity-100 font-bold' : 'fill-slate-400 opacity-50'"
          >
            {{ getAspectName(aspectId) }}
          </text>
        </g>
      </g>
    </svg>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import racesData from '@/data/races.json'
import aspectsData from '@/data/aspects.json'
import subracesData from '@/data/subraces.json'

const props = defineProps({
  selectedRace: {
    type: String,
    required: true
  },
  selectedSubrace: {
    type: String,
    default: null
  },
  gender: {
    type: String,
    default: 'm'
  },
  size: {
    type: Number,
    default: 500
  }
})

const emit = defineEmits(['update:selectedSubrace', 'select'])

const hoveredAspect = ref(null)

// Get selected race data
const raceData = computed(() => {
  return racesData.races.find(r => r.id === props.selectedRace)
})

// Get base aspects of the selected race
const raceBaseAspects = computed(() => {
  return raceData.value?.position?.aspects || []
})

// Get all aspects in circular order
const allAspects = computed(() => {
  return aspectsData.metadata.circularOrder
})

// Get aspect position on circle
const getAspectPosition = (aspectId) => {
  const aspect = aspectsData.aspects.find(a => a.id === aspectId)
  if (!aspect) return { x: 0, y: 0 }
  
  // Используем ту же формулу что и в RaceGraph: (angle - 90)
  const angle = aspect.position.angle
  const radius = props.size * 0.35 // 35% of size
  const radians = (angle - 90) * (Math.PI / 180)
  
  return {
    x: Math.cos(radians) * radius,
    y: Math.sin(radians) * radius
  }
}

// Get label position (further out than aspect)
const getLabelPosition = (aspectId) => {
  const aspect = aspectsData.aspects.find(a => a.id === aspectId)
  if (!aspect) return { x: 0, y: 0 }
  
  // Используем ту же формулу что и в RaceGraph: (angle - 90)
  const angle = aspect.position.angle
  const radius = props.size * 0.45 // 45% of size
  const radians = (angle - 90) * (Math.PI / 180)
  
  return {
    x: Math.cos(radians) * radius,
    y: Math.sin(radians) * radius
  }
}

// Get aspect color
const getAspectColor = (aspectId) => {
  const aspect = aspectsData.aspects.find(a => a.id === aspectId)
  return aspect?.color || '#666'
}

// Get race color (based on first aspect)
const getRaceColor = (race) => {
  if (!race?.position?.aspects?.[0]) return '#64748b'
  const aspect = aspectsData.aspects.find(a => a.id === race.position.aspects[0])
  return aspect?.color || '#64748b'
}

// Get aspect icon
const getAspectIcon = (aspectId) => {
  const aspect = aspectsData.aspects.find(a => a.id === aspectId)
  return aspect?.icon || 'game-icons:perspective-dice-six-faces-random'
}

// Get aspect name
const getAspectName = (aspectId) => {
  const aspect = aspectsData.aspects.find(a => a.id === aspectId)
  return aspect?.name || aspectId
}

// Get race image URL
const getRaceImageUrl = computed(() => {
  return `/images/races/portraits/${props.selectedRace}_${props.gender}.png`
})

// Generate hexagon path
const getHexagonPath = (cx, cy, size) => {
  const points = []
  for (let i = 0; i < 6; i++) {
    // Начинаем с угла -30° чтобы получить flat-top шестиугольник
    const angle = (Math.PI / 3) * i - Math.PI / 6
    const x = cx + size * Math.cos(angle)
    const y = cy + size * Math.sin(angle)
    points.push(`${x},${y}`)
  }
  return points.join(' ')
}

// Select subrace
const selectSubrace = (aspectId) => {
  const subraceId = `${props.selectedRace}-${aspectId}`
  emit('update:selectedSubrace', subraceId)
  emit('select', subraceId)
}

// Get selected aspect ID from subrace ID
const selectedAspectId = computed(() => {
  if (!props.selectedSubrace) return null
  const parts = props.selectedSubrace.split('-')
  return parts.length === 2 ? parts[1] : null
})

// Check if aspect is selected
const isAspectSelected = (aspectId) => {
  return selectedAspectId.value === aspectId
}
</script>

<style scoped>
.subrace-graph-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.subrace-graph {
  max-width: 100%;
  height: auto;
}
</style>
