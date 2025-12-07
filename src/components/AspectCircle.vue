<script setup>
import { computed } from 'vue'
import racesData from '@/data/races.json'
import aspectsData from '@/data/aspects.json'

const props = defineProps({
  raceId: {
    type: String,
    default: null
  },
  size: {
    type: Number,
    default: 200
  }
})

const aspects = aspectsData.aspects
const race = computed(() => 
  racesData.races.find(r => r.id === props.raceId)
)

// Цвета для аспектов (из aspects.json)
const aspectColors = computed(() => {
  const colors = {}
  aspects.forEach(aspect => {
    colors[aspect.id] = aspect.color
  })
  return colors
})

// Вычисляем координаты точек для шестиугольника
const getPointPosition = (angle, value, maxValue = 5) => {
  const radius = (props.size / 2) * 0.7 // 70% от радиуса для максимального значения
  const normalizedValue = value / maxValue
  const actualRadius = radius * normalizedValue
  
  const radians = (angle - 90) * (Math.PI / 180) // -90 чтобы начать сверху
  const x = props.size / 2 + actualRadius * Math.cos(radians)
  const y = props.size / 2 + actualRadius * Math.sin(radians)
  
  return { x, y }
}

// Генерируем путь для SVG polygon используя circularOrder
const aspectPath = computed(() => {
  if (!race.value) return ''
  
  const points = aspectsData.metadata.circularOrder.map(aspectId => {
    const aspect = aspects.find(a => a.id === aspectId)
    const value = race.value.aspects[aspectId] || 0
    const pos = getPointPosition(aspect.position.angle, value)
    return `${pos.x},${pos.y}`
  })
  
  return points.join(' ')
})

// Путь для фоновой сетки (максимальные значения)
const gridPath = computed(() => {
  const points = aspectsData.metadata.circularOrder.map(aspectId => {
    const aspect = aspects.find(a => a.id === aspectId)
    const pos = getPointPosition(aspect.position.angle, 5)
    return `${pos.x},${pos.y}`
  })
  return points.join(' ')
})

// Генерируем линии сетки для каждого уровня
const gridLevels = [1, 2, 3, 4, 5]

const getGridLevelPath = (level) => {
  const points = aspectsData.metadata.circularOrder.map(aspectId => {
    const aspect = aspects.find(a => a.id === aspectId)
    const pos = getPointPosition(aspect.position.angle, level)
    return `${pos.x},${pos.y}`
  })
  return points.join(' ')
}

// Позиции меток аспектов
const aspectLabels = computed(() => {
  return aspects.map(aspect => {
    const labelRadius = (props.size / 2) * 0.85
    const radians = (aspect.position.angle - 90) * (Math.PI / 180)
    const x = props.size / 2 + labelRadius * Math.cos(radians)
    const y = props.size / 2 + labelRadius * Math.sin(radians)
    
    return {
      ...aspect,
      x,
      y,
      value: race.value?.aspects[aspect.id] || 0
    }
  })
})
</script>

<template>
  <div class="aspect-circle flex items-center justify-center">
    <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" class="overflow-visible">
      <!-- Фоновая сетка -->
      <g class="grid-lines" opacity="0.2">
        <!-- Линии уровней -->
        <polygon
          v-for="level in gridLevels"
          :key="`grid-${level}`"
          :points="getGridLevelPath(level)"
          fill="none"
          stroke="currentColor"
          stroke-width="0.5"
          class="text-slate-500"
        />
        
        <!-- Радиальные линии -->
        <line
          v-for="aspect in aspects"
          :key="`line-${aspect.id}`"
          :x1="size / 2"
          :y1="size / 2"
          :x2="getPointPosition(aspect.position.angle, 5).x"
          :y2="getPointPosition(aspect.position.angle, 5).y"
          stroke="currentColor"
          stroke-width="0.5"
          class="text-slate-600"
        />
      </g>
      
      <!-- Заполненная область расы -->
      <polygon
        v-if="race"
        :points="aspectPath"
        fill="#3b82f6"
        fill-opacity="0.2"
        stroke="currentColor"
        :stroke-width="2"
        class="text-sky-400 transition-all duration-300"
      />
      
      <!-- Точки значений -->
      <g v-if="race">
        <circle
          v-for="(label, index) in aspectLabels"
          :key="`point-${label.id}`"
          :cx="getPointPosition(label.position.angle, label.value).x"
          :cy="getPointPosition(label.position.angle, label.value).y"
          r="4"
          :fill="aspectColors[label.id]"
          class="transition-all duration-300"
        />
      </g>
      
      <!-- Метки аспектов -->
      <g class="aspect-labels">
        <g
          v-for="label in aspectLabels"
          :key="`label-${label.id}`"
        >
          <!-- Фон для иконки -->
          <circle
            :cx="label.x"
            :cy="label.y"
            r="16"
            :fill="aspectColors[label.id]"
            fill-opacity="0.2"
            class="transition-all"
          />
          
          <!-- Иконка аспекта -->
          <text
            :x="label.x"
            :y="label.y"
            text-anchor="middle"
            dominant-baseline="central"
            class="text-xl"
          >
            {{ label.icon }}
          </text>
          
          <!-- Значение -->
          <text
            v-if="race"
            :x="label.x"
            :y="label.y + 28"
            text-anchor="middle"
            class="text-xs font-bold fill-slate-200"
          >
            {{ label.value }}
          </text>
        </g>
      </g>
      
      <!-- Центральный круг с иконкой расы -->
      <g v-if="race" class="race-center">
        <circle
          :cx="size / 2"
          :cy="size / 2"
          r="24"
          fill="currentColor"
          class="text-slate-800"
        />
        <text
          :x="size / 2"
          :y="size / 2"
          text-anchor="middle"
          dominant-baseline="central"
          class="text-3xl"
        >
          {{ race.icon }}
        </text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.aspect-circle {
  user-select: none;
}
</style>
