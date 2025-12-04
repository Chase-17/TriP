<script setup>
import { computed, ref } from 'vue'
import { Icon } from '@iconify/vue'
import itemsData from '@/data/items.json'
import { 
  calculateMaxHP, 
  applyDamageToHP, 
  getDamageType,
  calculateWoundSlots, 
  addWound, 
  removeWound, 
  calculateWoundPenalties, 
  getHealthStatus 
} from '@/utils/wounds'

const props = defineProps({
  character: {
    type: Object,
    required: true
  },
  isActive: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['click', 'update-hp', 'update-wounds', 'toggle-status', 'toggle-health-type'])

// Получить полный путь к портрету
const getPortraitUrl = (portrait) => {
  if (!portrait || portrait === 'none') return null
  // Приводим к строке на всякий случай
  const portraitStr = String(portrait)
  // Если это уже полный URL или путь
  if (portraitStr.startsWith('http') || portraitStr.startsWith('/')) return portraitStr
  // Если это пресет (например, "preset1"), добавляем путь
  return `/images/presets/${portraitStr}.png`
}

const portraitUrl = computed(() => getPortraitUrl(props.character.portrait))

// Получить защиту по направлениям
const getDefenceByDirection = (direction, attackType) => {
  let defence = props.character.defence?.base || 0
  
  // Добавляем бонусы от характеристики
  if (props.character.stats?.cunning) {
    defence += props.character.stats.cunning
  }
  
  // Бонус от брони
  const armorId = props.character.equipment?.armor
  if (armorId && armorId !== 'clothes') {
    const armor = itemsData.items.find(item => item.id === armorId)
    if (armor?.resist) {
      defence += armor.resist
    }
  }
  
  // Бонус от щитов в активном наборе
  const activeSetIndex = props.character.equipment?.activeSetIndex ?? 0
  const weaponSets = props.character.equipment?.weaponSets || []
  const activeSet = weaponSets[activeSetIndex]
  
  if (activeSet?.weapons) {
    activeSet.weapons.forEach(weaponId => {
      const weapon = itemsData.items.find(item => item.id === weaponId)
      if (weapon?.category === 'shield' && weapon.defence && typeof weapon.defence === 'object') {
        const directionMap = { front: 'front', flank: 'side', back: 'back' }
        const shieldDir = directionMap[direction]
        if (weapon.defence[shieldDir]?.[attackType]) {
          defence += weapon.defence[shieldDir][attackType]
        }
      }
    })
  }
  
  return defence
}

// Защита по всем направлениям
const defences = computed(() => ({
  front: {
    melee: getDefenceByDirection('front', 'melee'),
    ranged: getDefenceByDirection('front', 'ranged')
  },
  flank: {
    melee: getDefenceByDirection('flank', 'melee'),
    ranged: getDefenceByDirection('flank', 'ranged')
  },
  back: {
    melee: getDefenceByDirection('back', 'melee'),
    ranged: getDefenceByDirection('back', 'ranged')
  }
}))

// Максимальное значение защиты для нормализации
const maxDefence = computed(() => {
  const allValues = [
    defences.value.front.melee,
    defences.value.front.ranged,
    defences.value.flank.melee,
    defences.value.flank.ranged,
    defences.value.back.melee,
    defences.value.back.ranged
  ]
  return Math.max(...allValues, 20) // минимум 20 для масштаба
})

// SVG paths для шестиугольника (меле) и дуг (дальний бой)
const defencePolygonPoints = computed(() => {
  const cx = 30, cy = 30
  const maxRadius = 25
  
  // Нормализуем значения защиты
  const frontMelee = (defences.value.front.melee / maxDefence.value) * maxRadius
  const flankMelee = (defences.value.flank.melee / maxDefence.value) * maxRadius
  const backMelee = (defences.value.back.melee / maxDefence.value) * maxRadius
  
  // Шестиугольник (3 стороны, каждая удвоена для симметрии)
  const points = [
    [cx, cy - frontMelee], // верх
    [cx + frontMelee * 0.866, cy - frontMelee * 0.5], // верх-право
    [cx + flankMelee * 0.866, cy + flankMelee * 0.5], // низ-право
    [cx, cy + backMelee], // низ
    [cx - flankMelee * 0.866, cy + flankMelee * 0.5], // низ-лево
    [cx - frontMelee * 0.866, cy - frontMelee * 0.5], // верх-лево
  ]
  
  return points.map(p => p.join(',')).join(' ')
})

// Дуги для дальнего боя
const defenceArcs = computed(() => {
  const cx = 30, cy = 30
  const maxRadius = 25
  const arcOffset = 5 // отступ от меле защиты
  
  const frontRanged = ((defences.value.front.ranged / maxDefence.value) * maxRadius) + arcOffset
  const flankRanged = ((defences.value.flank.ranged / maxDefence.value) * maxRadius) + arcOffset
  const backRanged = ((defences.value.back.ranged / maxDefence.value) * maxRadius) + arcOffset
  
  // Создаём дуги (упрощённо, через path)
  return [
    { // front arc (top)
      d: `M ${cx - frontRanged * 0.866} ${cy - frontRanged * 0.5} A ${frontRanged} ${frontRanged} 0 0 1 ${cx + frontRanged * 0.866} ${cy - frontRanged * 0.5}`,
      value: defences.value.front.ranged
    },
    { // right/flank arc
      d: `M ${cx + flankRanged * 0.5} ${cy - flankRanged * 0.866} A ${flankRanged} ${flankRanged} 0 0 1 ${cx + flankRanged * 0.5} ${cy + flankRanged * 0.866}`,
      value: defences.value.flank.ranged
    },
    { // back arc (bottom)
      d: `M ${cx + backRanged * 0.866} ${cy + backRanged * 0.5} A ${backRanged} ${backRanged} 0 0 1 ${cx - backRanged * 0.866} ${cy + backRanged * 0.5}`,
      value: defences.value.back.ranged
    }
  ]
})

// HP или Wounds система
const healthType = computed(() => props.character.healthType || 'hp') // 'hp' или 'wounds'

// HP система (квадратики)
const maxHP = computed(() => {
  if (healthType.value !== 'hp') return 0
  return calculateMaxHP(props.character.stats || {})
})

const hpBlocks = computed(() => {
  if (healthType.value !== 'hp') return []
  const current = props.character.hp?.current || 0
  const max = maxHP.value
  return Array.from({ length: max }, (_, i) => i < current)
})

// Wounds система (травмы) с расчётом дополнительных слотов
const woundSlots = computed(() => {
  if (healthType.value !== 'wounds') return null
  return calculateWoundSlots(props.character.stats || {})
})

const wounds = computed(() => {
  if (healthType.value !== 'wounds') return null
  
  const slots = woundSlots.value
  const currentWounds = props.character.wounds || {
    scratch: { current: 0 },
    light: { current: 0 },
    heavy: { current: 0 },
    deadly: { current: 0 }
  }
  
  // Объединяем слоты и текущие значения
  return {
    scratch: { ...slots.scratch, current: currentWounds.scratch?.current || 0 },
    light: { ...slots.light, current: currentWounds.light?.current || 0 },
    heavy: { ...slots.heavy, current: currentWounds.heavy?.current || 0 },
    deadly: { ...slots.deadly, current: currentWounds.deadly?.current || 0 }
  }
})

// Получить штрафы от ранений
const woundPenalties = computed(() => {
  if (healthType.value !== 'wounds' || !wounds.value || !woundSlots.value) return 0
  
  const currentWounds = {
    scratch: { current: wounds.value.scratch.current },
    light: { current: wounds.value.light.current },
    heavy: { current: wounds.value.heavy.current },
    deadly: { current: wounds.value.deadly.current }
  }
  
  return calculateWoundPenalties(currentWounds, woundSlots.value)
})

// Статус здоровья
const healthStatus = computed(() => {
  if (healthType.value !== 'wounds' || !wounds.value || !woundSlots.value) return null
  
  const currentWounds = {
    scratch: { current: wounds.value.scratch.current },
    light: { current: wounds.value.light.current },
    heavy: { current: wounds.value.heavy.current },
    deadly: { current: wounds.value.deadly.current }
  }
  
  return getHealthStatus(currentWounds, woundSlots.value)
})

// Статус-эффекты
const statusEffects = computed(() => props.character.statusEffects || [])

// Клик по карточке
const handleClick = () => {
  emit('click', props.character.id)
}

// Изменение HP
const changeHP = (delta) => {
  const current = props.character.hp?.current || 0
  const max = maxHP.value
  const newHP = Math.max(0, Math.min(max, current + delta))
  emit('update-hp', props.character.id, newHP)
}

// Нанести урон (для HP системы)
const applyDamage = (damage) => {
  const current = props.character.hp?.current || 0
  const max = maxHP.value
  const newHP = applyDamageToHP(current, max, damage)
  emit('update-hp', props.character.id, newHP)
}

// Нанести ранение (для Wounds системы)
const applyWound = (woundType) => {
  if (!woundSlots.value) return
  
  const currentWounds = {
    scratch: { current: wounds.value.scratch.current },
    light: { current: wounds.value.light.current },
    heavy: { current: wounds.value.heavy.current },
    deadly: { current: wounds.value.deadly.current }
  }
  
  const newWounds = addWound(currentWounds, woundSlots.value, woundType)
  emit('update-wounds', props.character.id, newWounds)
}

// Изменение травм с логикой переполнения
const changeWound = (type, delta) => {
  if (delta === 0 || !woundSlots.value) return
  
  const currentWounds = {
    scratch: { current: wounds.value.scratch.current },
    light: { current: wounds.value.light.current },
    heavy: { current: wounds.value.heavy.current },
    deadly: { current: wounds.value.deadly.current }
  }
  
  let newWounds
  if (delta > 0) {
    // Добавление ранения с логикой переполнения
    newWounds = addWound(currentWounds, woundSlots.value, type)
  } else {
    // Удаление ранения
    newWounds = removeWound(currentWounds, type)
  }
  
  emit('update-wounds', props.character.id, newWounds)
}

// Переключение статуса
const toggleStatus = (statusId) => {
  emit('toggle-status', props.character.id, statusId)
}

// Переключение типа здоровья
const toggleHealthType = () => {
  emit('toggle-health-type', props.character.id)
}
</script>

<template>
  <div 
    class="character-card-compact"
    :class="{ 'card-active': isActive }"
    @click="handleClick"
  >
    <!-- Левая часть: защита (SVG) -->
    <div class="defence-visual">
      <svg viewBox="0 0 60 60" class="defence-svg">
        <!-- Сетка фона -->
        <circle cx="30" cy="30" r="5" fill="none" stroke="rgba(148, 163, 184, 0.1)" stroke-width="0.5" />
        <circle cx="30" cy="30" r="10" fill="none" stroke="rgba(148, 163, 184, 0.1)" stroke-width="0.5" />
        <circle cx="30" cy="30" r="15" fill="none" stroke="rgba(148, 163, 184, 0.1)" stroke-width="0.5" />
        <circle cx="30" cy="30" r="20" fill="none" stroke="rgba(148, 163, 184, 0.1)" stroke-width="0.5" />
        <circle cx="30" cy="30" r="25" fill="none" stroke="rgba(148, 163, 184, 0.1)" stroke-width="0.5" />
        
        <!-- Шестиугольник защиты (ближний бой) -->
        <polygon 
          :points="defencePolygonPoints"
          fill="rgba(16, 185, 129, 0.3)"
          stroke="rgba(16, 185, 129, 0.8)"
          stroke-width="1.5"
        />
        
        <!-- Дуги защиты (дальний бой) -->
        <path
          v-for="(arc, i) in defenceArcs"
          :key="i"
          :d="arc.d"
          fill="none"
          stroke="rgba(56, 189, 248, 0.8)"
          stroke-width="2"
          stroke-linecap="round"
        />
        
        <!-- Центральная точка -->
        <circle cx="30" cy="30" r="2" fill="rgba(148, 163, 184, 0.5)" />
        
        <!-- Значения защиты (текст) -->
        <!-- Спереди -->
        <text x="30" y="9" text-anchor="middle" font-size="8" fill="#10b981" font-weight="bold">{{ defences.front.melee }}</text>
        <text x="30" y="4" text-anchor="middle" font-size="7" fill="#38bdf8" font-weight="bold">{{ defences.front.ranged }}</text>
        
        <!-- С флангов -->
        <text x="48" y="32" text-anchor="middle" font-size="8" fill="#10b981" font-weight="bold">{{ defences.flank.melee }}</text>
        <text x="54" y="32" text-anchor="middle" font-size="7" fill="#38bdf8" font-weight="bold">{{ defences.flank.ranged }}</text>
        
        <text x="12" y="32" text-anchor="middle" font-size="8" fill="#10b981" font-weight="bold">{{ defences.flank.melee }}</text>
        <text x="6" y="32" text-anchor="middle" font-size="7" fill="#38bdf8" font-weight="bold">{{ defences.flank.ranged }}</text>
        
        <!-- Сзади -->
        <text x="30" y="54" text-anchor="middle" font-size="8" fill="#10b981" font-weight="bold">{{ defences.back.melee }}</text>
        <text x="30" y="59" text-anchor="middle" font-size="7" fill="#38bdf8" font-weight="bold">{{ defences.back.ranged }}</text>
      </svg>
    </div>

    <!-- Центр: портрет и имя -->
    <div class="portrait-section">
      <div class="portrait-container">
        <img 
          v-if="portraitUrl" 
          :src="portraitUrl" 
          :alt="character.name"
          class="portrait-img"
          @error="(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex' }"
        />
        <div 
          class="portrait-placeholder"
          :style="{ display: portraitUrl ? 'none' : 'flex' }"
        >
          {{ character.name?.charAt(0)?.toUpperCase() || '?' }}
        </div>
      </div>
      <div class="character-name">{{ character.name || 'Безымянный' }}</div>
      
      <!-- Переключатель типа здоровья (DEBUG) -->
      <button 
        @click.stop="toggleHealthType" 
        class="health-toggle-btn"
        :title="`Переключить на ${healthType === 'hp' ? 'Раны' : 'HP'}`"
      >
        <Icon :icon="healthType === 'hp' ? 'mdi:heart-pulse' : 'mdi:bandage'" class="w-4 h-4" />
      </button>
    </div>

    <!-- Здоровье -->
    <div class="health-section" @click.stop>
      <!-- HP система (горизонтальные квадратики) -->
      <div v-if="healthType === 'hp'" class="hp-container">
        <!-- Кнопки урона -->
        <div class="damage-buttons">
          <button @click.stop="applyDamage(1)" class="damage-btn scratch" title="Царапина (-1 HP)">Ц</button>
          <button @click.stop="applyDamage(3)" class="damage-btn light" title="Лёгкое ранение (-3 HP)">Л</button>
          <button @click.stop="applyDamage(9)" class="damage-btn heavy" title="Тяжёлое ранение (-9 HP)">Т</button>
          <button @click.stop="applyDamage(27)" class="damage-btn deadly" title="Смертельное ранение (-27 HP)">С</button>
        </div>
        
        <!-- HP блоки (горизонтально) -->
        <div class="hp-blocks-horizontal">
          <div
            v-for="(filled, i) in hpBlocks"
            :key="i"
            class="hp-block"
            :class="{ 'hp-filled': filled }"
            @click="changeHP(filled ? -1 : 1)"
          ></div>
        </div>
        
        <!-- Кнопки +/- -->
        <div class="hp-controls-inline">
          <button @click.stop="changeHP(-1)" class="hp-btn" title="Отнять HP">−</button>
          <span class="hp-text">{{ character.hp?.current || 0 }}/{{ maxHP }}</span>
          <button @click.stop="changeHP(1)" class="hp-btn" title="Добавить HP">+</button>
        </div>
      </div>

      <!-- Wounds система (травмы) -->
      <div v-else-if="healthType === 'wounds'" class="wounds-container">
        <!-- Кнопки нанесения ранений -->
        <div class="damage-buttons">
          <button @click.stop="applyWound('scratch')" class="damage-btn scratch" title="Нанести царапину">Ц</button>
          <button @click.stop="applyWound('light')" class="damage-btn light" title="Нанести лёгкое ранение">Л</button>
          <button @click.stop="applyWound('heavy')" class="damage-btn heavy" title="Нанести тяжёлое ранение">Т</button>
          <button @click.stop="applyWound('deadly')" class="damage-btn deadly" title="Нанести смертельное ранение">С</button>
        </div>
        
        <div class="wounds-grid">
        <!-- Царапины (3 базовых + бонус) -->
        <div class="wound-column" @click.stop>
          <div class="wound-label">Ц</div>
          <!-- Базовые слоты -->
          <div
            v-for="i in wounds.scratch.base"
            :key="`scratch-base-${i}`"
            class="wound-cell wound-scratch"
            :class="{ 'wound-marked': i <= wounds.scratch.current }"
            @click="changeWound('scratch', wounds.scratch.current >= i ? -1 : 1)"
          ></div>
          <!-- Бонусные слоты (визуально отличаются) -->
          <div
            v-for="i in wounds.scratch.bonus"
            :key="`scratch-bonus-${i}`"
            class="wound-cell wound-scratch wound-bonus"
            :class="{ 'wound-marked': (wounds.scratch.base + i) <= wounds.scratch.current }"
            @click="changeWound('scratch', wounds.scratch.current >= (wounds.scratch.base + i) ? -1 : 1)"
          ></div>
        </div>

        <!-- Лёгкие (2 базовых + бонус) -->
        <div class="wound-column" @click.stop>
          <div class="wound-label">Л</div>
          <div
            v-for="i in wounds.light.base"
            :key="`light-base-${i}`"
            class="wound-cell wound-light"
            :class="{ 'wound-marked': i <= wounds.light.current, 'wound-penalty': i <= wounds.light.current && i > wounds.light.bonus }"
            @click="changeWound('light', wounds.light.current >= i ? -1 : 1)"
          ></div>
          <div
            v-for="i in wounds.light.bonus"
            :key="`light-bonus-${i}`"
            class="wound-cell wound-light wound-bonus"
            :class="{ 'wound-marked': (wounds.light.base + i) <= wounds.light.current }"
            @click="changeWound('light', wounds.light.current >= (wounds.light.base + i) ? -1 : 1)"
          ></div>
        </div>

        <!-- Тяжёлые (1 базовый + бонус) -->
        <div class="wound-column" @click.stop>
          <div class="wound-label">Т</div>
          <div
            v-for="i in wounds.heavy.base"
            :key="`heavy-base-${i}`"
            class="wound-cell wound-heavy"
            :class="{ 'wound-marked': i <= wounds.heavy.current, 'wound-penalty': i <= wounds.heavy.current && i > wounds.heavy.bonus }"
            @click="changeWound('heavy', wounds.heavy.current >= i ? -1 : 1)"
          ></div>
          <div
            v-for="i in wounds.heavy.bonus"
            :key="`heavy-bonus-${i}`"
            class="wound-cell wound-heavy wound-bonus"
            :class="{ 'wound-marked': (wounds.heavy.base + i) <= wounds.heavy.current }"
            @click="changeWound('heavy', wounds.heavy.current >= (wounds.heavy.base + i) ? -1 : 1)"
          ></div>
        </div>

        <!-- Смертельные (1 базовый + бонус) -->
        <div class="wound-column" @click.stop>
          <div class="wound-label">С</div>
          <div
            v-for="i in wounds.deadly.base"
            :key="`deadly-base-${i}`"
            class="wound-cell wound-deadly"
            :class="{ 'wound-marked': i <= wounds.deadly.current, 'wound-penalty': true }"
            @click="changeWound('deadly', wounds.deadly.current >= i ? -1 : 1)"
          ></div>
          <div
            v-for="i in wounds.deadly.bonus"
            :key="`deadly-bonus-${i}`"
            class="wound-cell wound-deadly wound-bonus"
            :class="{ 'wound-marked': (wounds.deadly.base + i) <= wounds.deadly.current }"
            @click="changeWound('deadly', wounds.deadly.current >= (wounds.deadly.base + i) ? -1 : 1)"
          ></div>
        </div>
      </div>
      </div>
      
      <!-- Отображение штрафов от ранений -->
      <div v-if="healthType === 'wounds' && woundPenalties < 0" class="wound-penalties">
        <Icon icon="mdi:alert" class="w-3 h-3" />
        <span class="text-xs font-bold">{{ woundPenalties }}</span>
      </div>
    </div>

    <!-- Статус-эффекты -->
    <div v-if="statusEffects.length > 0" class="status-effects" @click.stop>
      <div
        v-for="status in statusEffects"
        :key="status.id"
        class="status-icon"
        :title="status.name"
        @click="toggleStatus(status.id)"
      >
        {{ status.icon || '●' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-card-compact {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  background: rgba(30, 41, 59, 0.6);
  border: 2px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 70px;
}

.character-card-compact:hover {
  border-color: rgba(56, 189, 248, 0.6);
  background: rgba(30, 41, 59, 0.8);
}

.card-active {
  border-color: rgba(16, 185, 129, 0.8);
  background: rgba(16, 185, 129, 0.1);
}

/* Защита (SVG) */
.defence-visual {
  width: 60px;
  height: 60px;
  flex-shrink: 0;
}

.defence-svg {
  width: 100%;
  height: 100%;
}

/* Портрет */
.portrait-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  min-width: 60px;
}

.portrait-container {
  width: 48px;
  height: 48px;
  border-radius: 0.375rem;
  overflow: hidden;
  border: 2px solid rgba(148, 163, 184, 0.3);
}

.portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portrait-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #334155 0%, #1e293b 100%);
  font-size: 1.5rem;
  font-weight: 700;
  color: #94a3b8;
}

.character-name {
  font-size: 0.75rem;
  font-weight: 600;
  color: #e2e8f0;
  text-align: center;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Кнопка переключения типа здоровья */
.health-toggle-btn {
  margin-top: 0.25rem;
  padding: 0.25rem;
  background: rgba(56, 189, 248, 0.1);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 0.25rem;
  color: #38bdf8;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.health-toggle-btn:hover {
  background: rgba(56, 189, 248, 0.2);
  border-color: rgba(56, 189, 248, 0.5);
  transform: scale(1.05);
}

/* Здоровье */
.health-section {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 50px;
  padding: 0 0.5rem;
}

/* HP контейнер */
.hp-container {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  flex: 1;
}

/* Кнопки урона */
.damage-buttons {
  display: flex;
  gap: 0.25rem;
  justify-content: center;
}

.damage-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(15, 23, 42, 0.5);
}

.damage-btn.scratch {
  border-color: rgba(34, 197, 94, 0.6);
  color: #22c55e;
}

.damage-btn.light {
  border-color: rgba(234, 179, 8, 0.6);
  color: #eab308;
}

.damage-btn.heavy {
  border-color: rgba(249, 115, 22, 0.6);
  color: #f97316;
}

.damage-btn.deadly {
  border-color: rgba(239, 68, 68, 0.6);
  color: #ef4444;
}

.damage-btn:hover {
  transform: scale(1.1);
  filter: brightness(1.3);
}

.damage-btn.scratch:hover { background: rgba(34, 197, 94, 0.2); }
.damage-btn.light:hover { background: rgba(234, 179, 8, 0.2); }
.damage-btn.heavy:hover { background: rgba(249, 115, 22, 0.2); }
.damage-btn.deadly:hover { background: rgba(239, 68, 68, 0.2); }

/* HP блоки горизонтально */
.hp-blocks-horizontal {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  justify-content: center;
}

.hp-block {
  width: 10px;
  height: 10px;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 2px;
  transition: all 0.2s;
  cursor: pointer;
}

.hp-block:hover {
  transform: scale(1.15);
  border-color: rgba(148, 163, 184, 0.6);
}

.hp-filled {
  background: rgba(16, 185, 129, 0.8);
  border-color: rgba(16, 185, 129, 1);
}

/* HP контролы inline */
.hp-controls-inline {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  justify-content: center;
}

.hp-text {
  font-size: 0.75rem;
  font-weight: 600;
  color: #cbd5e1;
  min-width: 3ch;
  text-align: center;
}

.hp-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(71, 85, 105, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 0.25rem;
  color: #cbd5e1;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.hp-btn:hover {
  background: rgba(71, 85, 105, 0.8);
  border-color: rgba(148, 163, 184, 0.5);
  transform: scale(1.1);
}

/* Wounds контейнер */
.wounds-container {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  flex: 1;
}

/* Травмы */
.wounds-grid {
  display: flex;
  gap: 0.25rem;
  align-items: flex-end;
}

.wound-column {
  display: flex;
  flex-direction: column-reverse;
  gap: 2px;
  align-items: center;
}

.wound-label {
  font-size: 0.625rem;
  color: #64748b;
  font-weight: 600;
  margin-top: 0.125rem;
}

.wound-cell {
  border: 1.5px solid;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(15, 23, 42, 0.5);
}

.wound-scratch {
  width: 8px;
  height: 14px;
  border-color: rgba(34, 197, 94, 0.4);
}

.wound-light {
  width: 12px;
  height: 18px;
  border-color: rgba(234, 179, 8, 0.4);
}

.wound-heavy {
  width: 16px;
  height: 22px;
  border-color: rgba(249, 115, 22, 0.4);
}

.wound-deadly {
  width: 16px;
  height: 22px;
  border-color: rgba(239, 68, 68, 0.4);
}

.wound-marked.wound-scratch {
  background: rgba(34, 197, 94, 0.7);
  border-color: rgba(34, 197, 94, 1);
}

.wound-marked.wound-light {
  background: rgba(234, 179, 8, 0.7);
  border-color: rgba(234, 179, 8, 1);
}

.wound-marked.wound-heavy {
  background: rgba(249, 115, 22, 0.7);
  border-color: rgba(249, 115, 22, 1);
}

.wound-marked.wound-deadly {
  background: rgba(239, 68, 68, 0.7);
  border-color: rgba(239, 68, 68, 1);
}

.wound-cell:hover {
  transform: scale(1.1);
  filter: brightness(1.2);
}

/* Бонусные слоты (от характеристик) */
.wound-bonus {
  opacity: 0.7;
  border-style: dashed !important;
}

.wound-bonus.wound-marked {
  opacity: 1;
  border-style: solid !important;
}

/* Слоты с штрафом (подсветка) */
.wound-penalty {
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
}

/* Штрафы от ранений */
.wound-penalties {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 0.25rem;
  color: #ef4444;
  font-weight: 700;
  margin-left: 0.5rem;
}

/* Статус-эффекты */
.status-effects {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  max-width: 80px;
}

.status-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(139, 92, 246, 0.2);
  border: 1px solid rgba(139, 92, 246, 0.4);
  border-radius: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.status-icon:hover {
  background: rgba(139, 92, 246, 0.3);
  transform: scale(1.1);
}
</style>
