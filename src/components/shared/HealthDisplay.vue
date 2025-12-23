<script setup>
/**
 * HealthDisplay - компонент отображения здоровья персонажа
 * 
 * Поддерживает два режима:
 * 1. simple - простое HP (квадратики, сгруппированные по 3)
 * 2. wounds - продвинутые ранения (4 столбика: царапины, лёгкие, тяжёлые, смертельные)
 */
import { computed } from 'vue'
import { calculateWoundSlots } from '@/utils/character/wounds'

const props = defineProps({
  // Данные о здоровье персонажа
  combat: {
    type: Object,
    required: true
  },
  // Характеристики персонажа (для расчёта слотов)
  stats: {
    type: Object,
    default: () => ({})
  },
  // Компактный режим (для карточек)
  compact: {
    type: Boolean,
    default: false
  },
  // Только для чтения (без возможности клика)
  readonly: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits([
  'update:hp',        // Изменение HP (simple)
  'add-wound',        // Добавить ранение (wounds)
  'remove-wound',     // Удалить ранение (wounds)
  'toggle-health-type' // Переключить тип здоровья
])

// Тип системы здоровья
const healthType = computed(() => props.combat?.healthType || 'simple')

// ===== ПРОСТОЕ HP =====

const currentHp = computed(() => props.combat?.hp || 0)
const maxHp = computed(() => props.combat?.maxHp || 8)

// Группы по 3 HP для отображения (тройки начинаются с конца)
// Например: 8 HP = [2, 3, 3], 10 HP = [1, 3, 3, 3]
const hpGroups = computed(() => {
  const groups = []
  const groupSize = 3
  const total = maxHp.value
  
  // Остаток идёт в первую (неполную) группу
  const remainder = total % groupSize
  let currentIndex = 0
  
  // Первая группа (может быть неполной)
  if (remainder > 0) {
    const group = []
    for (let j = 0; j < remainder; j++) {
      group.push({
        index: currentIndex,
        filled: currentIndex < currentHp.value
      })
      currentIndex++
    }
    groups.push(group)
  }
  
  // Остальные полные группы по 3
  while (currentIndex < total) {
    const group = []
    for (let j = 0; j < groupSize && currentIndex < total; j++) {
      group.push({
        index: currentIndex,
        filled: currentIndex < currentHp.value
      })
      currentIndex++
    }
    groups.push(group)
  }
  
  return groups
})

// Штраф от потерянного HP (каждые 3 = -1)
const hpPenalty = computed(() => {
  const lost = maxHp.value - currentHp.value
  return Math.floor(lost / 3)
})

// ===== ПРОДВИНУТЫЕ РАНЕНИЯ =====

const wounds = computed(() => props.combat?.wounds || { scratch: 0, light: 0, heavy: 0, deadly: 0 })
const bonusDeadlySlots = computed(() => props.combat?.bonusDeadlySlots || 0)

// Слоты для каждого типа ранений
const woundSlots = computed(() => {
  const slots = calculateWoundSlots(props.stats, bonusDeadlySlots.value)
  
  return {
    scratch: {
      ...slots.scratch,
      total: slots.scratch.base + slots.scratch.bonus,
      filled: wounds.value.scratch,
      label: 'Царапины',
      icon: '🩹',
      color: 'amber'
    },
    light: {
      ...slots.light,
      total: slots.light.base + slots.light.bonus,
      filled: wounds.value.light,
      label: 'Лёгкие',
      icon: '🩸',
      color: 'orange'
    },
    heavy: {
      ...slots.heavy,
      total: slots.heavy.base + slots.heavy.bonus,
      filled: wounds.value.heavy,
      label: 'Тяжёлые',
      icon: '💔',
      color: 'rose'
    },
    deadly: {
      ...slots.deadly,
      total: slots.deadly.base + slots.deadly.bonus,
      filled: wounds.value.deadly,
      label: 'Смертельные',
      icon: '💀',
      color: 'red'
    }
  }
})

// Порядок типов ранений для отображения
const woundTypes = ['scratch', 'light', 'heavy', 'deadly']

// Создать массив слотов для отображения столбика
// Порядок: бонусные сверху, базовые снизу
// Урон идёт сверху вниз (сначала бонусные, потом базовые)
const getSlotArray = (type) => {
  const slot = woundSlots.value[type]
  const slots = []
  const totalSlots = slot.bonus + slot.base
  const filled = slot.filled
  
  // Бонусные слоты сверху (заполняются первыми)
  for (let i = 0; i < slot.bonus; i++) {
    slots.push({
      index: i,
      isBonus: true,
      filled: i < filled
    })
  }
  
  // Базовые слоты снизу (заполняются после бонусных)
  for (let i = 0; i < slot.base; i++) {
    slots.push({
      index: slot.bonus + i,
      isBonus: false,
      filled: slot.bonus + i < filled
    })
  }
  
  return slots
}

// Таймер для long tap
let longTapTimer = null
const LONG_TAP_DURATION = 500 // ms

// Обработчики кликов для HP
const onHpCellClick = (index) => {
  if (props.readonly) return
  
  // Клик по заполненной ячейке - уменьшить HP
  // Клик по пустой - увеличить HP
  if (index < currentHp.value) {
    emit('update:hp', currentHp.value - 1)
  } else {
    emit('update:hp', Math.min(maxHp.value, currentHp.value + 1))
  }
}

// Обработчики для столбиков ранений
// Любой клик = урон, ПКМ/long tap = лечение
const onWoundColumnClick = (type, event) => {
  if (props.readonly) return
  event.preventDefault()
  emit('add-wound', type)
}

const onWoundColumnContextMenu = (type, event) => {
  if (props.readonly) return
  event.preventDefault()
  emit('remove-wound', type)
}

// Long tap для тачскринов
const onWoundColumnTouchStart = (type, event) => {
  if (props.readonly) return
  
  longTapTimer = setTimeout(() => {
    emit('remove-wound', type)
    longTapTimer = null
  }, LONG_TAP_DURATION)
}

const onWoundColumnTouchEnd = (type, event) => {
  if (props.readonly) return
  
  if (longTapTimer) {
    // Короткое нажатие - урон
    clearTimeout(longTapTimer)
    longTapTimer = null
    emit('add-wound', type)
  }
  // Если longTapTimer === null, значит long tap уже сработал
}
</script>

<template>
  <div class="health-display" :class="{ compact }">
    <!-- Простое HP -->
    <div v-if="healthType === 'simple'" class="hp-display">
      <!-- Компактный режим - одна строка -->
      <div v-if="compact" class="hp-compact">
        <span class="hp-icon">❤️</span>
        <span class="hp-text">{{ currentHp }}/{{ maxHp }}</span>
        <span v-if="hpPenalty > 0" class="hp-penalty">-{{ hpPenalty }}</span>
      </div>
      
      <!-- Полный режим - квадратики по группам -->
      <div v-else class="hp-full">
        <div class="hp-header">
          <span class="hp-label">HP</span>
          <span class="hp-value">{{ currentHp }}/{{ maxHp }}</span>
          <span v-if="hpPenalty > 0" class="hp-penalty-badge">штраф: -{{ hpPenalty }}</span>
        </div>
        
        <div class="hp-groups">
          <div 
            v-for="(group, groupIndex) in hpGroups" 
            :key="groupIndex"
            class="hp-group"
          >
            <div
              v-for="cell in group"
              :key="cell.index"
              class="hp-cell"
              :class="{ 
                filled: cell.filled,
                clickable: !readonly
              }"
              @click="onHpCellClick(cell.index)"
            />
          </div>
        </div>
      </div>
    </div>
    
    <!-- Продвинутые ранения -->
    <div v-else class="wounds-display">
      <!-- Компактный режим -->
      <div v-if="compact" class="wounds-compact">
        <template v-for="type in woundTypes" :key="type">
          <span 
            v-if="woundSlots[type].filled > 0"
            class="wound-badge"
            :class="`wound-${woundSlots[type].color}`"
          >
            {{ woundSlots[type].icon }} {{ woundSlots[type].filled }}
          </span>
        </template>
        <span v-if="Object.values(wounds).every(v => v === 0)" class="wound-healthy">
          ✓ Здоров
        </span>
      </div>
      
      <!-- Полный режим - столбики -->
      <div v-else class="wounds-full">
        <div 
          v-for="type in woundTypes" 
          :key="type"
          class="wound-column"
          :class="[
            `wound-column-${woundSlots[type].color}`,
            `wound-column-${type}`,
            { clickable: !readonly }
          ]"
          @click="onWoundColumnClick(type, $event)"
          @contextmenu="onWoundColumnContextMenu(type, $event)"
          @touchstart="onWoundColumnTouchStart(type, $event)"
          @touchend="onWoundColumnTouchEnd(type, $event)"
        >
          <!-- Заголовок столбика -->
          <div class="wound-header">
            <span class="wound-icon">{{ woundSlots[type].icon }}</span>
            <span class="wound-label">{{ woundSlots[type].label }}</span>
          </div>
          
          <!-- Слоты -->
          <div class="wound-slots">
            <div
              v-for="slot in getSlotArray(type)"
              :key="slot.index"
              class="wound-slot"
              :class="{
                filled: slot.filled,
                bonus: slot.isBonus
              }"
            />
          </div>
          
          <!-- Счётчик -->
          <div class="wound-count">
            {{ woundSlots[type].filled }}/{{ woundSlots[type].total }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.health-display {
  font-size: 0.875rem;
}

/* ===== ПРОСТОЕ HP ===== */
.hp-compact {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.hp-icon {
  font-size: 1rem;
}

.hp-text {
  font-weight: 600;
}

.hp-penalty {
  color: #f87171;
  font-size: 0.75rem;
}

.hp-full {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.hp-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.hp-label {
  font-weight: 600;
  color: #f87171;
}

.hp-value {
  color: #e2e8f0;
}

.hp-penalty-badge {
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  background: rgba(248, 113, 113, 0.2);
  color: #f87171;
  border-radius: 0.25rem;
}

.hp-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.hp-group {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 0.25rem;
}

.hp-cell {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  background: #334155;
  border: 1px solid #475569;
  transition: all 0.15s;
}

.hp-cell.filled {
  background: #22c55e;
  border-color: #16a34a;
}

.hp-cell.clickable:hover {
  transform: scale(1.1);
  cursor: pointer;
}

.hp-cell.clickable.filled:hover {
  background: #ef4444;
  border-color: #dc2626;
}

/* ===== ПРОДВИНУТЫЕ РАНЕНИЯ ===== */
.wounds-compact {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.wound-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.wound-amber {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}

.wound-orange {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}

.wound-rose {
  background: rgba(244, 63, 94, 0.2);
  color: #fb7185;
}

.wound-red {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.wound-healthy {
  color: #4ade80;
  font-size: 0.75rem;
}

.wounds-full {
  display: flex;
  gap: 1rem;
}

.wound-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.25rem;
  border-radius: 0.375rem;
  transition: background-color 0.15s;
}

.wound-column.clickable {
  cursor: pointer;
}

.wound-column.clickable:hover {
  background: rgba(255, 255, 255, 0.05);
}

.wound-column.clickable:active {
  background: rgba(255, 255, 255, 0.1);
}

/* Разная ширина столбиков */
.wound-column-scratch {
  min-width: 40px;
}

.wound-column-light {
  min-width: 52px;
}

.wound-column-heavy {
  min-width: 64px;
}

.wound-column-deadly {
  min-width: 76px;
}

.wound-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
}

.wound-icon {
  font-size: 1.25rem;
}

.wound-label {
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
  white-space: nowrap;
}

.wound-slots {
  display: flex;
  flex-direction: column-reverse;
  gap: 3px;
}

.wound-slot {
  height: 12px;
  border-radius: 2px;
  background: #22c55e;
  border: 1px solid #16a34a;
  transition: all 0.15s;
}

/* Разная ширина слотов по типу */
.wound-column-scratch .wound-slot {
  width: 20px;
}

.wound-column-light .wound-slot {
  width: 32px;
}

.wound-column-heavy .wound-slot {
  width: 44px;
}

.wound-column-deadly .wound-slot {
  width: 56px;
}

.wound-slot.bonus {
  background: #38bdf8;
  border-color: #0ea5e9;
}

.wound-slot.filled {
  background: #ef4444;
  border-color: #dc2626;
}

.wound-slot.bonus.filled {
  background: #a855f7;
  border-color: #9333ea;
}

.wound-count {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 500;
}

/* Разные цвета рамок для столбиков */
.wound-column-amber .wound-header { color: #fbbf24; }
.wound-column-orange .wound-header { color: #fb923c; }
.wound-column-rose .wound-header { color: #fb7185; }
.wound-column-red .wound-header { color: #f87171; }

/* Компактный режим */
.health-display.compact {
  font-size: 0.75rem;
}

.health-display.compact .hp-cell {
  width: 12px;
  height: 12px;
}

.health-display.compact .wound-slot {
  width: 20px;
  height: 8px;
}
</style>
