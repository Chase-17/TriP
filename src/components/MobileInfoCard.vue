<template>
  <div 
    class="mobile-info-card"
    :class="{ 'collapsed': collapsed, 'own-token': isOwnToken }"
    @click="handleCardClick"
  >
    <!-- Свёрнутое состояние -->
    <div v-if="collapsed" class="collapsed-preview">
      <div class="collapsed-avatar">
        <img 
          v-if="displayCharacter?.portrait" 
          :src="getPortraitUrl(displayCharacter.portrait)" 
          :alt="displayCharacter.name"
        />
        <div v-else class="avatar-fallback">
          {{ displayCharacter?.name?.charAt(0)?.toUpperCase() || '?' }}
        </div>
      </div>
      <div class="collapsed-info">
        <span class="collapsed-name">{{ displayCharacter?.name || 'Неизвестно' }}</span>
        <span v-if="!isOwnToken" class="collapsed-hint">нажмите для подробностей</span>
      </div>
      <Icon icon="mdi:chevron-up" class="collapse-icon" />
    </div>
    
    <!-- Развёрнутое состояние -->
    <div v-else class="expanded-content">
      <!-- Заголовок -->
      <div class="card-header">
        <button class="collapse-btn" @click.stop="$emit('toggle-collapse')">
          <Icon icon="mdi:chevron-down" class="w-5 h-5" />
        </button>
        <span class="character-name">{{ displayCharacter?.name || 'Неизвестно' }}</span>
        <span v-if="!isOwnToken" class="other-token-badge">Чужой</span>
      </div>
      
      <!-- Контент карточки -->
      <div class="card-body">
        <!-- Canvas с портретом и защитой -->
        <div class="portrait-section">
          <canvas 
            ref="defenceCanvas" 
            :width="canvasSize" 
            :height="canvasSize"
            class="defence-canvas"
          ></canvas>
        </div>
        
        <!-- Информация справа -->
        <div class="info-section">
          <!-- Ранения (только для своего токена) -->
          <div v-if="isOwnToken && displayCharacter" class="wounds-display">
            <div class="wounds-row">
              <span class="wound-label">Царапины:</span>
              <div class="wound-slots">
                <div 
                  v-for="i in totalScratchSlots" 
                  :key="'scratch-' + i"
                  class="wound-slot scratch"
                  :class="{ filled: i <= currentWounds.scratch }"
                ></div>
              </div>
            </div>
            <div class="wounds-row">
              <span class="wound-label">Лёгкие:</span>
              <div class="wound-slots">
                <div 
                  v-for="i in totalLightSlots" 
                  :key="'light-' + i"
                  class="wound-slot light"
                  :class="{ filled: i <= currentWounds.light }"
                ></div>
              </div>
            </div>
            <div class="wounds-row">
              <span class="wound-label">Тяжёлые:</span>
              <div class="wound-slots">
                <div 
                  v-for="i in totalHeavySlots" 
                  :key="'heavy-' + i"
                  class="wound-slot heavy"
                  :class="{ filled: i <= currentWounds.heavy }"
                ></div>
              </div>
            </div>
            <div class="wounds-row">
              <span class="wound-label">Смерт.:</span>
              <div class="wound-slots">
                <div 
                  v-for="i in totalDeadlySlots" 
                  :key="'deadly-' + i"
                  class="wound-slot deadly"
                  :class="{ filled: i <= currentWounds.deadly }"
                ></div>
              </div>
            </div>
          </div>
          
          <!-- Для чужих токенов - базовая информация -->
          <div v-else-if="!isOwnToken && displayCharacter" class="other-info">
            <div class="info-row">
              <Icon icon="mdi:account" class="w-4 h-4 text-slate-400" />
              <span>{{ displayCharacter.race || 'Неизвестная раса' }}</span>
            </div>
            <div class="info-row">
              <Icon icon="mdi:sword" class="w-4 h-4 text-slate-400" />
              <span>{{ displayCharacter.class || 'Неизвестный класс' }}</span>
            </div>
          </div>
          
          <!-- Для террейна -->
          <div v-else-if="selectedHex && !selectedToken" class="terrain-info">
            <div class="info-row">
              <Icon icon="mdi:map-marker" class="w-4 h-4 text-slate-400" />
              <span>Гекс {{ selectedHex.q }}, {{ selectedHex.r }}</span>
            </div>
            <div v-if="selectedHex.terrain" class="info-row">
              <Icon icon="mdi:terrain" class="w-4 h-4 text-slate-400" />
              <span>{{ selectedHex.terrain.name || 'Неизвестная местность' }}</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Кнопки действий (только для своего токена) -->
      <div v-if="isOwnToken" class="card-actions">
        <button class="action-btn" @click.stop="$emit('open-character-sheet', displayCharacter?.id)">
          <Icon icon="mdi:file-document-outline" class="w-4 h-4" />
          <span>Лист</span>
        </button>
        <button class="action-btn" @click.stop="$emit('switch-equipment')">
          <Icon icon="mdi:shield-sword" class="w-4 h-4" />
          <span>Снаряжение</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { getPortraitUrl, loadImage, drawPortrait, drawScratches, drawLightWounds } from '@/utils/tokenRenderer'
import { getDefenceData } from '@/utils/defence'
import diffsData from '@/data/diffs.json'
import { calculateWoundSlots } from '@/utils/wounds'

const props = defineProps({
  selectedToken: {
    type: Object,
    default: null
  },
  selectedHex: {
    type: Object,
    default: null
  },
  playerCharacter: {
    type: Object,
    default: null
  },
  playerFacing: {
    type: Number,
    default: 0
  },
  collapsed: {
    type: Boolean,
    default: false
  },
  isPlayerTurn: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['toggle-collapse', 'open-character-sheet', 'switch-equipment'])

const defenceCanvas = ref(null)
const canvasSize = 176 // Увеличенный размер (2x от 88)

// Определение своего токена
const isOwnToken = computed(() => {
  // Если ничего не выбрано - показываем своего персонажа
  if (!props.selectedToken) return true
  if (!props.playerCharacter) return false
  return props.selectedToken.characterId === props.playerCharacter.id
})

// Персонаж для отображения
const displayCharacter = computed(() => {
  // Если выбран токен - показываем его персонажа
  if (props.selectedToken?.character) {
    return props.selectedToken.character
  }
  // Иначе показываем персонажа игрока
  return props.playerCharacter
})

// Текущие ранения
const currentWounds = computed(() => {
  return displayCharacter.value?.combat?.wounds || { scratch: 0, light: 0, heavy: 0, deadly: 0 }
})

// Слоты ранений
const woundSlots = computed(() => {
  if (!displayCharacter.value) return null
  // calculateWoundSlots принимает stats и bonusDeadlySlots
  const stats = displayCharacter.value.stats || {}
  const bonusDeadly = displayCharacter.value.combat?.bonusDeadlySlots || 0
  return calculateWoundSlots(stats, bonusDeadly)
})

const totalScratchSlots = computed(() => {
  if (!woundSlots.value?.scratch) return 0
  return woundSlots.value.scratch.base + woundSlots.value.scratch.bonus
})

const totalLightSlots = computed(() => {
  if (!woundSlots.value?.light) return 0
  return woundSlots.value.light.base + woundSlots.value.light.bonus
})

const totalHeavySlots = computed(() => {
  if (!woundSlots.value?.heavy) return 0
  return woundSlots.value.heavy.base + woundSlots.value.heavy.bonus
})

const totalDeadlySlots = computed(() => {
  if (!woundSlots.value?.deadly) return 0
  return woundSlots.value.deadly.base + woundSlots.value.deadly.bonus
})

// Найти сложность по значению защиты
const findDifficulty = (value) => {
  if (value === undefined || value === null) return null
  
  const diffs = Object.entries(diffsData)
    .map(([val, data]) => ({ value: parseInt(val), ...data }))
    .filter(d => d.value >= 0)
    .sort((a, b) => a.value - b.value)
  
  let closest = diffs[0]
  for (const diff of diffs) {
    if (diff.value <= value) {
      closest = diff
    } else {
      break
    }
  }
  return closest
}

// Получить точку на окружности
const getPoint = (cx, cy, radius, angleDeg) => {
  const rad = (angleDeg - 90) * Math.PI / 180
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad)
  }
}

// Рисование защиты от ударов (hex-сегменты)
const drawMeleeDefenceSegment = (ctx, cx, cy, radius, segment, difficulty, rotation = 0, side = 'left') => {
  if (!difficulty) return
  
  const color = difficulty.color || '#FFFFFF'
  const linetype = difficulty.linetype || 'single'
  
  let angles
  if (side === 'left') {
    angles = { top: 0, upper: 300, lower: 240, bottom: 180 }
  } else {
    angles = { top: 0, upper: 60, lower: 120, bottom: 180 }
  }
  
  const top = getPoint(cx, cy, radius, angles.top + rotation)
  const upper = getPoint(cx, cy, radius, angles.upper + rotation)
  const lower = getPoint(cx, cy, radius, angles.lower + rotation)
  const bottom = getPoint(cx, cy, radius, angles.bottom + rotation)
  
  let p1, p2
  if (segment === 'front') {
    p1 = top
    p2 = upper
  } else if (segment === 'flank') {
    p1 = upper
    p2 = lower
  } else if (segment === 'back') {
    p1 = lower
    p2 = bottom
  } else {
    return
  }
  
  ctx.lineCap = 'butt'
  ctx.strokeStyle = color
  
  if (linetype === 'dashed') {
    ctx.setLineDash([4, 5])
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    ctx.setLineDash([])
  } else if (linetype === 'double') {
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
    
    const outerRadius = radius + 3
    const outerP1 = getPoint(cx, cy, outerRadius, (segment === 'front' ? angles.top : segment === 'flank' ? angles.upper : angles.lower) + rotation)
    const outerP2 = getPoint(cx, cy, outerRadius, (segment === 'front' ? angles.upper : segment === 'flank' ? angles.lower : angles.bottom) + rotation)
    
    ctx.setLineDash([4, 5])
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(outerP1.x, outerP1.y)
    ctx.lineTo(outerP2.x, outerP2.y)
    ctx.stroke()
    ctx.setLineDash([])
  } else {
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.stroke()
  }
}

// Рисование защиты от снарядов (дуги)
const drawRangedDefenceSegment = (ctx, cx, cy, radius, segment, difficulty, rotation = 0, side = 'left') => {
  if (!difficulty) return
  
  const color = difficulty.color || '#FFFFFF'
  const linetype = difficulty.linetype || 'single'
  
  let startAngle, endAngle
  
  if (side === 'left') {
    if (segment === 'front') {
      startAngle = 300
      endAngle = 360
    } else if (segment === 'flank') {
      startAngle = 240
      endAngle = 300
    } else if (segment === 'back') {
      startAngle = 180
      endAngle = 240
    } else {
      return
    }
  } else {
    if (segment === 'front') {
      startAngle = 0
      endAngle = 60
    } else if (segment === 'flank') {
      startAngle = 60
      endAngle = 120
    } else if (segment === 'back') {
      startAngle = 120
      endAngle = 180
    } else {
      return
    }
  }
  
  startAngle += rotation
  endAngle += rotation
  
  const startRad = (startAngle - 90) * Math.PI / 180
  const endRad = (endAngle - 90) * Math.PI / 180
  
  ctx.lineCap = 'butt'
  ctx.strokeStyle = color
  
  if (linetype === 'dashed') {
    ctx.setLineDash([4, 5])
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, radius, startRad, endRad)
    ctx.stroke()
    ctx.setLineDash([])
  } else if (linetype === 'double') {
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, radius, startRad, endRad)
    ctx.stroke()
    
    const outerRadius = radius + 3
    ctx.setLineDash([4, 5])
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, outerRadius, startRad, endRad)
    ctx.stroke()
    ctx.setLineDash([])
  } else {
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, radius, startRad, endRad)
    ctx.stroke()
  }
}

// Отрисовка canvas
const renderCanvas = async () => {
  const canvas = defenceCanvas.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  const size = canvasSize
  const cx = size / 2
  const cy = size / 2
  const portraitRadius = size / 2 - 30 // Уменьшенный портрет для места под защиту
  
  // Очистка
  ctx.clearRect(0, 0, size, size)
  
  const character = displayCharacter.value
  if (!character) {
    // Рисуем заглушку
    ctx.fillStyle = '#1e293b'
    ctx.beginPath()
    ctx.arc(cx, cy, portraitRadius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.fillStyle = '#64748b'
    ctx.font = `bold ${portraitRadius}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('?', cx, cy)
    return
  }
  
  // Загружаем портрет
  const portraitUrl = getPortraitUrl(character.portrait)
  if (portraitUrl) {
    await loadImage(portraitUrl)
  }
  
  // Рисуем портрет
  const wounds = currentWounds.value
  const slots = woundSlots.value
  drawPortrait(ctx, cx, cy, portraitRadius, character.portrait, character.name, wounds, slots)
  
  // Рисуем царапины и лёгкие ранения на портрете
  if (wounds && slots) {
    drawScratches(ctx, cx, cy, portraitRadius, wounds, slots)
    drawLightWounds(ctx, cx, cy, portraitRadius, wounds, slots)
  }
  
  // Получаем защиту - сначала с токена, потом вычисляем из персонажа
  let meleeDefence = props.selectedToken?.meleeDefence
  let rangedDefence = props.selectedToken?.rangedDefence
  
  // Если защита не пришла с токеном, вычисляем из персонажа
  if (!meleeDefence && character) {
    meleeDefence = getDefenceData(character, 'melee')
  }
  if (!rangedDefence && character) {
    rangedDefence = getDefenceData(character, 'ranged')
  }
  
  if (!meleeDefence && !rangedDefence) return
  
  // Facing приходит как 0-5, переводим в градусы (0-300)
  const rotation = (props.playerFacing || 0) * 60
  const meleeRadius = portraitRadius + 14 // Отступ для царапин
  const rangedRadius = meleeRadius + 6    // Дуги снаружи гекса
  
  // Рисуем защиту от ударов (melee) - внутренний контур
  const segments = ['front', 'flank', 'back']
  const sides = ['left', 'right']
  
  if (meleeDefence) {
    for (const side of sides) {
      for (const segment of segments) {
        const value = meleeDefence[segment]
        if (value !== undefined && value !== null) {
          const diff = findDifficulty(value)
          drawMeleeDefenceSegment(ctx, cx, cy, meleeRadius, segment, diff, rotation, side)
        }
      }
    }
  }
  
  // Рисуем защиту от снарядов (ranged) - внешний контур
  if (rangedDefence) {
    for (const side of sides) {
      for (const segment of segments) {
        const value = rangedDefence[segment]
        if (value !== undefined && value !== null) {
          const diff = findDifficulty(value)
          drawRangedDefenceSegment(ctx, cx, cy, rangedRadius, segment, diff, rotation, side)
        }
      }
    }
  }
}

// Обработка клика по карточке
const handleCardClick = () => {
  if (props.collapsed) {
    emit('toggle-collapse')
  }
}

// Watch для перерисовки
watch(
  () => [props.selectedToken, props.playerCharacter, props.playerFacing, props.collapsed],
  async () => {
    await nextTick()
    if (!props.collapsed) {
      renderCanvas()
    }
  },
  { immediate: true, deep: true }
)

onMounted(async () => {
  await nextTick()
  if (!props.collapsed) {
    renderCanvas()
  }
})
</script>

<style scoped>
.mobile-info-card {
  background: rgba(15, 23, 42, 0.95);
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  overflow: hidden;
  min-height: 200px;
}

.mobile-info-card.collapsed {
  min-height: auto;
}

.mobile-info-card.own-token {
  border-color: rgba(56, 189, 248, 0.3);
}

/* Свёрнутое состояние */
.collapsed-preview {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  cursor: pointer;
}

.collapsed-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: #1e293b;
}

.collapsed-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  color: #64748b;
}

.collapsed-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.collapsed-name {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
}

.collapsed-hint {
  font-size: 11px;
  color: #64748b;
}

.collapse-icon {
  width: 20px;
  height: 20px;
  color: #64748b;
}

/* Развёрнутое состояние */
.expanded-content {
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.1);
}

.collapse-btn {
  padding: 4px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
}

.collapse-btn:hover {
  background: rgba(148, 163, 184, 0.1);
}

.character-name {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
}

.other-token-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(251, 146, 60, 0.2);
  color: #fb923c;
}

.card-body {
  display: flex;
  gap: 12px;
  padding: 12px;
}

.portrait-section {
  flex-shrink: 0;
}

.defence-canvas {
  display: block;
}

.info-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}

/* Ранения */
.wounds-display {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wounds-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wound-label {
  font-size: 11px;
  color: #94a3b8;
  width: 60px;
  flex-shrink: 0;
}

.wound-slots {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.wound-slot {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid;
}

.wound-slot.scratch {
  border-color: #fbbf24;
}

.wound-slot.scratch.filled {
  background: #fbbf24;
}

.wound-slot.light {
  border-color: #fb923c;
}

.wound-slot.light.filled {
  background: #fb923c;
}

.wound-slot.heavy {
  border-color: #ef4444;
}

.wound-slot.heavy.filled {
  background: #ef4444;
}

.wound-slot.deadly {
  border-color: #dc2626;
}

.wound-slot.deadly.filled {
  background: #dc2626;
}

/* Информация о других */
.other-info,
.terrain-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #cbd5e1;
}

/* Действия */
.card-actions {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid rgba(148, 163, 184, 0.1);
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  border-radius: 6px;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  font-size: 12px;
  cursor: pointer;
}

.action-btn:hover {
  background: rgba(56, 189, 248, 0.2);
}
</style>
