<script setup>
/**
 * PlayerIcon - отображает иконку игрока (фигурку как в монополии)
 * с заданным цветом
 */
import { computed } from 'vue'
import playerIconsData from '@/data/playerIcons.json'

const props = defineProps({
  iconId: {
    type: String,
    default: null
  },
  color: {
    type: String, // hex цвет или id цвета
    default: null
  },
  size: {
    type: [Number, String],
    default: 24
  },
  showBackground: {
    type: Boolean,
    default: false
  }
})

const icon = computed(() => {
  if (!props.iconId) return null
  return playerIconsData.icons.find(i => i.id === props.iconId)
})

const resolvedColor = computed(() => {
  if (!props.color) return '#94a3b8'
  // Если это id цвета, ищем в данных
  const colorData = playerIconsData.colors.find(c => c.id === props.color)
  if (colorData) return colorData.value
  // Иначе это уже hex
  return props.color
})

const sizeNum = computed(() => {
  if (typeof props.size === 'string') {
    return parseInt(props.size, 10)
  }
  return props.size
})

const fontSize = computed(() => {
  return `${sizeNum.value}px`
})
</script>

<template>
  <span 
    v-if="icon"
    class="player-icon"
    :class="{ 'with-bg': showBackground }"
    :style="{ 
      color: resolvedColor, 
      fontSize: fontSize,
      '--icon-color': resolvedColor
    }"
    :title="icon.name"
  >
    {{ icon.emoji }}
  </span>
  <span 
    v-else 
    class="player-icon placeholder"
    :style="{ fontSize: fontSize }"
  >
    👤
  </span>
</template>

<style scoped>
.player-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  line-height: 1;
}

.player-icon.with-bg {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 50%;
  padding: 0.2em;
}

.player-icon.placeholder {
  color: #64748b;
  opacity: 0.5;
}
</style>
