<script setup>
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import racesData from '@/data/races.json'
import aspectsData from '@/data/aspects.json'
import { racePortraitUrl } from '@/utils/assets'

const props = defineProps({
  selectedRace: {
    type: String,
    default: null
  },
  size: {
    type: Number,
    default: 700
  },
  gender: {
    type: String,
    default: 'm'
  }
})

const hoveredRace = ref(null)

const emit = defineEmits(['select-race'])

const races = racesData.races
const aspects = aspectsData.aspects

// Получаем аспект по ID
const getAspect = (aspectId) => {
  return aspects.find(a => a.id === aspectId)
}

// Вычисляем позиции аспектов на круге
const getAspectPosition = (aspectId) => {
  const aspect = aspects.find(a => a.id === aspectId)
  if (!aspect) return { x: 0, y: 0 }
  
  const angle = aspect.position.angle
  const radius = props.size * 0.38
  const radians = (angle - 90) * (Math.PI / 180)
  const x = props.size / 2 + radius * Math.cos(radians)
  const y = props.size / 2 + radius * Math.sin(radians)
  
  return { x, y }
}

// Вычисляем позицию расы между двумя аспектами
const getRacePosition = (race) => {
  const [aspect1Id, aspect2Id] = race.position.aspects
  const pos1 = getAspectPosition(aspect1Id)
  const pos2 = getAspectPosition(aspect2Id)
  
  // Среднее между двумя аспектами
  const x = (pos1.x + pos2.x) / 2
  const y = (pos1.y + pos2.y) / 2
  
  return { x, y }
}

// Вычисляем цвет расы на основе аспектов
const getRaceColor = (race) => {
  const aspect1 = getAspect(race.position.aspects[0])
  return aspect1?.color || '#64748b'
}

// Позиции аспектов
const aspectPositions = computed(() => {
  return aspects.map(aspect => ({
    ...aspect,
    ...getAspectPosition(aspect.id)
  }))
})

// Позиции рас
const racePositions = computed(() => {
  return races.map(race => ({
    ...race,
    ...getRacePosition(race),
    color: getRaceColor(race)
  }))
})

// Линии от рас к их аспектам
const raceConnections = computed(() => {
  const connections = []
  
  races.forEach(race => {
    const racePos = getRacePosition(race)
    const isActive = hoveredRace.value === race.id || props.selectedRace === race.id
    
    // Получаем цвета аспектов
    const [aspect1Id, aspect2Id] = race.position.aspects
    const aspect1 = getAspect(aspect1Id)
    const aspect2 = getAspect(aspect2Id)
    
    // Линия к первому аспекту
    const pos1 = getAspectPosition(aspect1Id)
    connections.push({
      id: `${race.id}-${aspect1Id}`,
      raceId: race.id,
      x1: racePos.x,
      y1: racePos.y,
      x2: pos1.x,
      y2: pos1.y,
      color: aspect1.color,
      isActive
    })
    
    // Линия ко второму аспекту
    const pos2 = getAspectPosition(aspect2Id)
    connections.push({
      id: `${race.id}-${aspect2Id}`,
      raceId: race.id,
      x1: racePos.x,
      y1: racePos.y,
      x2: pos2.x,
      y2: pos2.y,
      color: aspect2.color,
      isActive
    })
  })
  
  return connections
})

const selectRace = (raceId) => {
  emit('select-race', raceId)
}

// Функция для создания пути шестиугольника
const getHexagonPath = (cx, cy, size) => {
  const points = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2 // Начинаем сверху
    const x = cx + size * Math.cos(angle)
    const y = cy + size * Math.sin(angle)
    points.push(`${x},${y}`)
  }
  return points.join(' ')
}

// Функция для получения пути к изображению расы
const getRaceImageUrl = (raceId) => {
  return racePortraitUrl(raceId, props.gender)
}

// Проверка загрузки изображения
const imageLoaded = ref({})
const imageError = ref({})

const handleImageLoad = (raceId) => {
  imageLoaded.value[raceId] = true
}

const handleImageError = (raceId) => {
  imageError.value[raceId] = true
}
</script>

<template>
  <div class="race-graph flex items-center justify-center">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="overflow-visible">
      <!-- Линии от рас к аспектам -->
      <g class="race-connections">
        <line
          v-for="conn in raceConnections"
          :key="conn.id"
          :x1="conn.x1"
          :y1="conn.y1"
          :x2="conn.x2"
          :y2="conn.y2"
          :stroke="conn.color"
          :stroke-width="conn.isActive ? '3' : '1'"
          :stroke-opacity="conn.isActive ? '0.8' : '0.15'"
          class="transition-all duration-200"
        />
      </g>
      
      <!-- Аспекты (фоновые, крупные) -->
      <g class="aspects">
        <g
          v-for="aspect in aspectPositions"
          :key="aspect.id"
        >
          <!-- Круг аспекта (уменьшенный, полупрозрачный, на заднем плане) -->
          <circle
            :cx="aspect.x"
            :cy="aspect.y"
            r="32"
            :fill="aspect.color"
            fill-opacity="0.2"
            class="blur-sm"
          />
          
          <!-- Иконка аспекта -->
          <foreignObject
            :x="aspect.x - 16"
            :y="aspect.y - 16"
            width="32"
            height="32"
            class="pointer-events-none"
          >
            <div class="flex items-center justify-center w-full h-full opacity-30">
              <Icon :icon="aspect.icon" class="text-2xl" />
            </div>
          </foreignObject>
          
          <!-- Название аспекта -->
          <text
            :x="aspect.x"
            :y="aspect.y + size * 0.065"
            text-anchor="middle"
            class="text-xs font-medium fill-slate-400 select-none opacity-50"
          >
            {{ aspect.name }}
          </text>
        </g>
      </g>
      
      <!-- Расы -->
      <g class="races">
        <g
          v-for="race in racePositions"
          :key="race.id"
          class="cursor-pointer"
          @click="selectRace(race.id)"
          @mouseenter="hoveredRace = race.id"
          @mouseleave="hoveredRace = null"
        >
          <!-- Подсветка выбранной расы -->
          <polygon
            v-if="selectedRace === race.id"
            :points="getHexagonPath(race.x, race.y, 54)"
            fill="none"
            stroke="#38bdf8"
            stroke-width="3"
            class="animate-pulse"
          />
          
          <!-- Шестиугольник расы с портретом -->
          <defs>
            <clipPath :id="`clip-hex-${race.id}`">
              <polygon :points="getHexagonPath(race.x, race.y, 48)" />
            </clipPath>
          </defs>
          
          <!-- Фон шестиугольника -->
          <polygon
            :points="getHexagonPath(race.x, race.y, 48)"
            :fill="race.color"
            fill-opacity="0.25"
            :stroke="selectedRace === race.id ? '#38bdf8' : '#1e293b'"
            stroke-width="2"
            class="transition-all"
          />
          
          <!-- Изображение расы -->
          <image
            v-if="!imageError[race.id]"
            :key="race.id + props.gender"
            :href="getRaceImageUrl(race.id)"
            :x="race.x - 48"
            :y="race.y - 48"
            width="96"
            height="96"
            :clip-path="`url(#clip-hex-${race.id})`"
            class="pointer-events-none"
            preserveAspectRatio="xMidYMid slice"
            @load="handleImageLoad(race.id)"
            @error="handleImageError(race.id)"
          />
          
          <!-- Fallback иконка (эмодзи), если изображение не загрузилось -->
          <text
            v-if="imageError[race.id]"
            :x="race.x"
            :y="race.y"
            text-anchor="middle"
            dominant-baseline="central"
            class="text-4xl select-none pointer-events-none"
          >
            {{ race.icon }}
          </text>
          
          <!-- Название расы (при наведении/выборе) -->
          <text
            v-if="selectedRace === race.id"
            :x="race.x"
            :y="race.y + 60"
            text-anchor="middle"
            class="text-sm font-semibold fill-slate-200 select-none pointer-events-none drop-shadow-lg"
          >
            {{ race.name }}
          </text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.race-graph {
  user-select: none;
}
</style>
