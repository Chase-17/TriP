<script setup>
/**
 * PointerToolbar - панель инструментов указки и меток
 * 
 * Отображает кнопки инструментов и выбор цвета
 */

import { ref, computed } from 'vue'
import { usePointerStore, POINTER_TOOLS, POINTER_COLORS } from '@/stores/pointer'
import { safeStoreToRefs, safeUseStore } from '@/utils/safeStoreRefs'

const pointerStore = safeUseStore(usePointerStore, 'pointer')

const { activeTool = ref('none'), activeColor = ref('#ffffff'), lineWidth = ref(3) } = safeStoreToRefs(pointerStore, 'pointer')

const tools = [
  { id: POINTER_TOOLS.POINTER, icon: '👆', label: 'Указка', title: 'Указка - курсор виден всем', group: 'pointer' },
  { id: POINTER_TOOLS.PING, icon: '📍', label: 'Пинг', title: 'Пинг - временный маркер', group: 'pointer' },
  { id: POINTER_TOOLS.MEASURE, icon: '📐', label: 'Линейка', title: 'Измерить расстояние', group: 'measure' },
  { id: POINTER_TOOLS.RANGE, icon: '🎯', label: 'Радиус', title: 'Показать зону досягаемости', group: 'measure' },
  { id: POINTER_TOOLS.DRAW, icon: '✏️', label: 'Рисовать', title: 'Свободное рисование', group: 'draw' },
  { id: POINTER_TOOLS.ARROW, icon: '➡️', label: 'Стрелка', title: 'Нарисовать стрелку', group: 'draw' },
  { id: POINTER_TOOLS.CIRCLE, icon: '⭕', label: 'Круг', title: 'Нарисовать круг', group: 'draw' },
  { id: POINTER_TOOLS.CONE, icon: '🔺', label: 'Конус', title: 'Нарисовать конус', group: 'draw' },
  { id: POINTER_TOOLS.LINE, icon: '📏', label: 'Линия', title: 'Нарисовать линию', group: 'draw' }
]

const colors = [
  { id: POINTER_COLORS.RED, label: 'Красный' },
  { id: POINTER_COLORS.ORANGE, label: 'Оранжевый' },
  { id: POINTER_COLORS.YELLOW, label: 'Жёлтый' },
  { id: POINTER_COLORS.GREEN, label: 'Зелёный' },
  { id: POINTER_COLORS.BLUE, label: 'Синий' },
  { id: POINTER_COLORS.PURPLE, label: 'Фиолетовый' },
  { id: POINTER_COLORS.WHITE, label: 'Белый' }
]

const isActive = computed(() => activeTool.value !== POINTER_TOOLS.NONE)

const selectTool = (toolId) => {
  if (activeTool.value === toolId) {
    pointerStore.setTool(POINTER_TOOLS.NONE)
  } else {
    pointerStore.setTool(toolId)
  }
}

const selectColor = (colorId) => {
  pointerStore.setColor(colorId)
}

const setLineWidth = (event) => {
  pointerStore.setLineWidth(parseInt(event.target.value))
}

const clearAll = () => {
  pointerStore.clearAll()
}

const clearDrawings = () => {
  pointerStore.clearDrawings()
}
</script>

<template>
  <div class="flex items-center gap-2 p-2 bg-slate-800/90 rounded-lg border border-white/10 backdrop-blur">
    <!-- Инструменты -->
    <div class="flex items-center gap-1">
      <button
        v-for="tool in tools"
        :key="tool.id"
        :title="tool.title"
        class="w-8 h-8 flex items-center justify-center rounded transition-all text-lg"
        :class="activeTool === tool.id 
          ? 'bg-amber-500/30 ring-2 ring-amber-400' 
          : 'hover:bg-white/10'"
        @click="selectTool(tool.id)"
      >
        {{ tool.icon }}
      </button>
    </div>
    
    <div class="w-px h-6 bg-white/20" />
    
    <!-- Цвета -->
    <div class="flex items-center gap-1">
      <button
        v-for="color in colors"
        :key="color.id"
        :title="color.label"
        class="w-6 h-6 rounded-full border-2 transition-all"
        :style="{ backgroundColor: color.id }"
        :class="activeColor === color.id 
          ? 'border-white scale-110' 
          : 'border-transparent hover:border-white/50'"
        @click="selectColor(color.id)"
      />
    </div>
    
    <div class="w-px h-6 bg-white/20" />
    
    <!-- Толщина линии (только для рисования) -->
    <div 
      v-if="activeTool === 'draw' || activeTool === 'line'"
      class="flex items-center gap-2"
    >
      <span class="text-xs text-white/60">Толщина:</span>
      <input
        type="range"
        min="1"
        max="15"
        :value="lineWidth"
        class="w-16 h-1 bg-white/20 rounded appearance-none cursor-pointer"
        @input="setLineWidth"
      />
      <span class="text-xs text-white/80 w-4">{{ lineWidth }}</span>
    </div>
    
    <div v-if="activeTool === 'draw' || activeTool === 'line'" class="w-px h-6 bg-white/20" />
    
    <!-- Очистка -->
    <div class="flex items-center gap-1">
      <button
        title="Очистить рисунки"
        class="px-2 py-1 text-xs rounded bg-white/5 hover:bg-white/10 transition-colors"
        @click="clearDrawings"
      >
        🗑️ Рисунки
      </button>
      <button
        title="Очистить всё"
        class="px-2 py-1 text-xs rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
        @click="clearAll"
      >
        🗑️ Всё
      </button>
    </div>
    
    <!-- Индикатор активного инструмента -->
    <div 
      v-if="isActive"
      class="ml-auto px-2 py-1 text-xs rounded bg-amber-500/20 text-amber-300"
    >
      {{ tools.find(t => t.id === activeTool)?.label || 'Активно' }}
    </div>
  </div>
</template>
