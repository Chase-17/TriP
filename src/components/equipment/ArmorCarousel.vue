<template>
  <div class="armor-carousel">
    <!-- 1. Header: название + стрелки -->
    <div class="armor-header">
      <button
        :disabled="currentIndex === 0"
        @click="previousArmor"
        class="nav-btn"
      >
        <Icon icon="mdi:chevron-left" />
      </button>
      
      <div class="armor-title">
        <span class="armor-name">{{ currentArmor.name }}</span>
        <span class="armor-index">{{ currentIndex + 1 }} / {{ armors.length }}</span>
      </div>
      
      <button
        :disabled="currentIndex === armors.length - 1"
        @click="nextArmor"
        class="nav-btn"
      >
        <Icon icon="mdi:chevron-right" />
      </button>
    </div>

    <!-- 2-3. Content: картинка + статы -->
    <div
      class="armor-content"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
    >
      <!-- 2. Картинка брони (компактная) -->
      <div class="armor-image-block">
        <img
          :src="itemImageUrl(currentArmor.id)"
          :alt="currentArmor.name"
          class="armor-img"
          @error="(e) => e.target.style.display = 'none'"
        />
      </div>

      <!-- 3. Статы брони (горизонтально 4x1) -->
      <div class="armor-stats-row">
        <div 
          class="stat-cell" 
          @click="showStatTooltip('defence')"
        >
          <Icon icon="mdi:shield" class="stat-icon" />
          <span class="stat-value">{{ currentArmor.defence }}</span>
          <span class="stat-label">Защита</span>
        </div>
        
        <div 
          class="stat-cell"
          @click="showStatTooltip('resist')"
        >
          <Icon icon="mdi:shield-check" class="stat-icon" />
          <span class="stat-value">{{ currentArmor.resist }}</span>
          <span class="stat-label">Снижение</span>
        </div>
        
        <div 
          class="stat-cell"
          @click="showStatTooltip('movement')"
        >
          <Icon icon="mdi:run-fast" class="stat-icon" />
          <span class="stat-value" :class="currentArmor.movement < 0 ? 'negative' : ''">
            {{ currentArmor.movement }}
          </span>
          <span class="stat-label">Ход</span>
        </div>
        
        <div 
          class="stat-cell"
          @click="showStatTooltip('bursts')"
        >
          <Icon icon="mdi:lightning-bolt" class="stat-icon" />
          <span class="stat-value" :class="currentArmor.bursts < 0 ? 'negative' : ''">
            {{ currentArmor.bursts }}
          </span>
          <span class="stat-label">Порывы</span>
        </div>
      </div>
    </div>

    <!-- 4. Доступность -->
    <div class="armor-availability" :class="getAvailabilityClass(currentArmor)">
      <Icon :icon="getAvailabilityIcon(currentArmor)" class="avail-icon" />
      <span class="avail-text">{{ getAvailabilityMessage(currentArmor) }}</span>
    </div>

    <!-- Tooltip -->
    <div v-if="activeTooltip" class="stat-tooltip" @click="activeTooltip = null">
      {{ tooltipText }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import itemsData from '@/data/items.json'
import epochsData from '@/data/epochs.json'
import { itemImageUrl } from '@/utils/assets'

const props = defineProps({
  modelValue: {
    type: String,
    default: 'clothes'
  },
  wealth: {
    type: Number,
    default: 5
  },
  epoch: {
    type: Number,
    default: 10
  }
})

const emit = defineEmits(['update:modelValue'])

const epochs = epochsData
const armors = itemsData.items.filter(item => item.category === 'armor')

const currentIndex = ref(armors.findIndex(a => a.id === props.modelValue))
if (currentIndex.value === -1) currentIndex.value = 0

watch(() => props.modelValue, (newVal) => {
  const index = armors.findIndex(a => a.id === newVal)
  if (index !== -1) currentIndex.value = index
})

const currentArmor = computed(() => armors[currentIndex.value])

const previousArmor = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--
    emit('update:modelValue', currentArmor.value.id)
  }
}

const nextArmor = () => {
  if (currentIndex.value < armors.length - 1) {
    currentIndex.value++
    emit('update:modelValue', currentArmor.value.id)
  }
}

// Swipe handling
const touchStart = ref({ x: 0, y: 0 })
const handleTouchStart = (e) => {
  touchStart.value = { x: e.touches[0].clientX, y: e.touches[0].clientY }
}
const handleTouchMove = (e) => {
  // Prevent default to handle swipe
}
const handleTouchEnd = (e) => {
  const dx = e.changedTouches[0].clientX - touchStart.value.x
  const dy = e.changedTouches[0].clientY - touchStart.value.y
  
  // Horizontal swipe detection (more horizontal than vertical)
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    if (dx > 0) previousArmor()
    else nextArmor()
  }
}

// Availability
const getAvailabilityClass = (armor) => {
  const priceDiff = armor.price - props.wealth
  const epochOk = armor.epoch <= props.epoch
  
  if (!epochOk) return 'avail-blocked'
  if (priceDiff < 0) return 'avail-easy'
  if (priceDiff === 0) return 'avail-normal'
  if (priceDiff === 1) return 'avail-hard'
  return 'avail-blocked'
}

const getAvailabilityIcon = (armor) => {
  const priceDiff = armor.price - props.wealth
  const epochOk = armor.epoch <= props.epoch
  
  if (!epochOk) return 'mdi:clock-alert'
  if (priceDiff < 0) return 'mdi:check-circle'
  if (priceDiff === 0) return 'mdi:alert-circle'
  if (priceDiff === 1) return 'mdi:alert'
  return 'mdi:close-circle'
}

const getAvailabilityMessage = (armor) => {
  const priceDiff = armor.price - props.wealth
  const epochOk = armor.epoch <= props.epoch
  
  if (!epochOk) return `Требует эпоху ${epochs[armor.epoch]?.name || armor.epoch}`
  if (priceDiff < 0) return 'Легко доступно'
  if (priceDiff === 0) return 'Значительная трата'
  if (priceDiff === 1) return 'Огромная трата — нужна история'
  return 'Недоступно по цене'
}

// Tooltips
const activeTooltip = ref(null)
const tooltipTexts = {
  defence: 'Чем выше Ваша защита, тем больше шанс, что противник не сможет нанести вам ощутимого урона своим ударом. Атака противника тем эффективнее, чем больше он превысил вашу защиту — вплоть до полной бесполезности, если защита оказалась выше.',
  resist: 'Даже самая эффектная атака может превратиться в пшик, если ваша броня действительно хороша. Снижение урона не мешает врагам попадать по Вам, зато после попадания снижает урон сразу на целые категории. При значении снижения в 1, тяжёлые ранения превращаются в лёгкие, лёгкие — в безопасные царапины. При значении в 2 вы вовсе игнорируете первые две категории урона.',
  movement: 'Броня может сковывать движения, накладывая штраф на ваше значение очков хода. Даже с небольшим штрафом вы можете отставать от своих более быстрых союзников (или от ловких врагов!), либо же Вам придётся тратить особые ресурсы на то, чтобы догонять их.',
  bursts: 'Порывы — особый ресурс, который можно тратить на дополнительное движение или атаки, реакции или проверки. Большинство персонажей на старте имеют 2 порыва в ход, потому штраф который может накладывать тяжёлая броня — довольно весомый.'
}
const tooltipText = computed(() => tooltipTexts[activeTooltip.value] || '')
const showStatTooltip = (stat) => {
  activeTooltip.value = activeTooltip.value === stat ? null : stat
  if (activeTooltip.value) {
    setTimeout(() => { activeTooltip.value = null }, 5000)
  }
}
</script>

<style scoped>
.armor-carousel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* 1. Header */
.armor-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-btn {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.375rem;
  color: #e2e8f0;
  cursor: pointer;
  transition: all 0.15s;
}

.nav-btn:hover:not(:disabled) {
  background: rgba(51, 65, 85, 0.8);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.armor-title {
  flex: 1;
  text-align: center;
}

.armor-name {
  display: block;
  font-size: 1rem;
  font-weight: 700;
  color: #e2e8f0;
}

.armor-index {
  font-size: 0.65rem;
  color: #64748b;
}

/* 2. Content */
.armor-content {
  touch-action: pan-y;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

/* 2. Image block (компактная) */
.armor-image-block {
  height: 180px;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.armor-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  padding: 0.5rem;
}

/* 3. Stats row (горизонтально 4x1) */
.armor-stats-row {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: stretch;
  gap: 0.375rem;
}

.stat-cell {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 0.25rem;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 0.15s;
  min-width: 0;
}

.stat-cell:hover {
  background: rgba(15, 23, 42, 0.6);
}

.stat-icon {
  width: 1rem;
  height: 1rem;
  color: #64748b;
  margin-bottom: 0.125rem;
}

.stat-value {
  font-size: 1rem;
  font-weight: 700;
  color: #e2e8f0;
}

.stat-value.negative {
  color: #f87171;
}

.stat-label {
  font-size: 0.55rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

/* 4. Availability */
.armor-availability {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
}

.avail-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

.avail-easy {
  background: rgba(34, 197, 94, 0.1);
  color: #4ade80;
}

.avail-normal {
  background: rgba(234, 179, 8, 0.1);
  color: #facc15;
}

.avail-hard {
  background: rgba(249, 115, 22, 0.1);
  color: #fb923c;
}

.avail-blocked {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
}

/* Tooltip */
.stat-tooltip {
  position: fixed;
  bottom: 5rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.625rem 1rem;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  color: #cbd5e1;
  font-size: 0.75rem;
  z-index: 100;
  max-width: 300px;
  text-align: center;
  line-height: 1.4;
}
</style>
