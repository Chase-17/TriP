<script setup>
/**
 * CharacterPortrait - портрет персонажа с визуализацией ранений и защиты
 * 
 * Отображает:
 * - Царапины: тонкие дуги вокруг портрета (снизу вверх)
 * - Лёгкие ранения: красные точки внизу
 * - Тяжёлые ранения: красный оверлей снизу вверх
 * - Смертельные: пульсирующий эффект смерти
 * - Защита: полушестиугольник (melee) и полукруг (ranged) слева
 */
import { computed } from 'vue'
import { calculateWoundSlots } from '@/utils/wounds'
import { presetUrl } from '@/utils/assets'
import diffsData from '@/data/diffs.json'

const props = defineProps({
  // Изображение портрета (строка или число)
  portrait: {
    type: [String, Number],
    default: null
  },
  // Имя персонажа (для fallback)
  name: {
    type: String,
    default: ''
  },
  // Данные о бое
  combat: {
    type: Object,
    default: () => ({})
  },
  // Характеристики (для расчёта слотов)
  stats: {
    type: Object,
    default: () => ({})
  },
  // Защита от ударов (melee) - { front, flank, back }
  meleeDefence: {
    type: Object,
    default: null
  },
  // Защита от снарядов (ranged) - { front, flank, back }
  rangedDefence: {
    type: Object,
    default: null
  },
  // Режим отображения защиты
  // 'all' - обе защиты (melee и ranged)
  // 'melee' - только ближняя
  // 'ranged' - только дальняя
  // 'none' - не показывать
  defenceMode: {
    type: String,
    default: 'all',
    validator: (v) => ['all', 'melee', 'ranged', 'none'].includes(v)
  },
  // Расположение защиты
  // 'left' - только слева (melee внутри, ranged снаружи)
  // 'both' - melee слева, ranged справа
  defenceLayout: {
    type: String,
    default: 'left',
    validator: (v) => ['left', 'both'].includes(v)
  },
  // Угол поворота защиты (для направления на карте)
  // Кратно 30 градусам: 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330
  defenceRotation: {
    type: Number,
    default: 0
  },
  // Подсветка конкретного сегмента защиты при атаке
  // { type: 'melee'|'ranged', direction: 'front'|'flank'|'back' } или null
  highlightSegment: {
    type: Object,
    default: null
  },
  // Показывать ли защиту
  showDefence: {
    type: Boolean,
    default: false
  },
  // Размер портрета
  size: {
    type: String,
    default: 'md', // sm, md, lg, xl
    validator: (v) => ['sm', 'md', 'lg', 'xl'].includes(v)
  },
  // Показывать ли эффекты ранений
  showWounds: {
    type: Boolean,
    default: true
  }
})

// Размеры в пикселях
const sizeMap = {
  sm: 48,
  md: 80,
  lg: 120,
  xl: 160
}

const pixelSize = computed(() => sizeMap[props.size])

// URL изображения портрета
// Если это URL (начинается с http:// или https:// или /) - используем напрямую
// Иначе считаем это пресетом и формируем путь
const portraitImageUrl = computed(() => {
  const p = props.portrait
  if (!p) return null
  if (typeof p === 'string' && (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('data:'))) {
    return p
  }
  return presetUrl(p)
})

// Тип здоровья
const healthType = computed(() => props.combat?.healthType || 'simple')

// Раны
const wounds = computed(() => props.combat?.wounds || { scratch: 0, light: 0, heavy: 0, deadly: 0 })

// Слоты ранений
const woundSlots = computed(() => {
  if (healthType.value !== 'wounds') return null
  return calculateWoundSlots(props.stats, props.combat?.bonusDeadlySlots || 0)
})

// ===== ЦАРАПИНЫ: дуги внизу портрета =====
// Размер дуги зависит от ОБЩЕГО количества слотов
// Заполненные всегда симметрично центрированы внизу
const scratchArcs = computed(() => {
  if (!woundSlots.value) return []
  
  const total = woundSlots.value.scratch.base + woundSlots.value.scratch.bonus
  const bonus = woundSlots.value.scratch.bonus
  const filled = wounds.value.scratch
  
  // Показываем только заполненные ранения
  if (filled === 0) return []
  
  const gapDegrees = 10 // Фиксированный промежуток 10°
  
  // Вычисляем длину дуги на основе ОБЩЕГО количества слотов
  const totalGaps = total * gapDegrees
  const arcLength = (360 - totalGaps) / total
  
  // Заполненные дуги всегда симметрично центрированы относительно 180° (низ)
  // Общая ширина заполненных = filled дуг + (filled-1) промежутков
  const filledTotalWidth = filled * arcLength + (filled - 1) * gapDegrees
  const startAngle = 180 - filledTotalWidth / 2
  
  const arcs = []
  for (let i = 0; i < filled; i++) {
    const angle = startAngle + i * (arcLength + gapDegrees)
    arcs.push({
      index: i,
      startAngle: angle,
      endAngle: angle + arcLength,
      filled: true,
      isBonus: i < bonus
    })
  }
  
  return arcs
})

// SVG путь для дуги
const getArcPath = (startAngle, endAngle, radius, strokeWidth) => {
  const size = pixelSize.value
  const cx = size / 2
  const cy = size / 2
  const r = radius
  
  const startRad = (startAngle - 90) * Math.PI / 180
  const endRad = (endAngle - 90) * Math.PI / 180
  
  const x1 = cx + r * Math.cos(startRad)
  const y1 = cy + r * Math.sin(startRad)
  const x2 = cx + r * Math.cos(endRad)
  const y2 = cy + r * Math.sin(endRad)
  
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}

// ===== ЛЁГКИЕ РАНЕНИЯ: точки по дуге на границе круга =====
// Показываем только заполненные, расположены на грани круга
// Бонусные слоты СЛЕВА, базовые СПРАВА
const lightDots = computed(() => {
  if (!woundSlots.value) return []
  
  const bonus = woundSlots.value.light.bonus
  const filled = wounds.value.light
  
  // Показываем только заполненные ранения
  if (filled === 0) return []
  
  const dots = []
  const size = pixelSize.value
  const dotRadius = size * 0.08
  const circleRadius = size / 2 // Точки на самой границе круга
  const cx = size / 2
  const cy = size / 2
  
  // Угловой промежуток между точками (в градусах)
  const gapDegrees = 25
  
  // Центрируем заполненные точки относительно низа (90° = низ в SVG)
  // Чем больше ран - тем выше они забираются по дуге
  // Бонусные слева (меньший угол), базовые справа (больший угол)
  const totalAngle = (filled - 1) * gapDegrees
  const startAngle = 90 + totalAngle / 2 // Начинаем справа, идём влево
  
  for (let i = 0; i < filled; i++) {
    // Идём справа налево (от большего угла к меньшему)
    const angle = startAngle - i * gapDegrees
    const rad = angle * Math.PI / 180
    
    dots.push({
      index: i,
      cx: cx + circleRadius * Math.cos(rad),
      cy: cy + circleRadius * Math.sin(rad),
      r: dotRadius,
      filled: true,
      // Бонусные слоты заполняются первыми (и будут слева)
      isBonus: i < bonus
    })
  }
  
  return dots
})

// ===== ТЯЖЁЛЫЕ РАНЕНИЯ: красный оверлей снизу вверх =====
const heavyOverlayPercent = computed(() => {
  if (!woundSlots.value) return 0
  
  const total = woundSlots.value.heavy.base + woundSlots.value.heavy.bonus
  const filled = wounds.value.heavy
  
  if (total === 0 || filled === 0) return 0
  
  return (filled / total) * 70 // Максимум 70% покрытия
})

// ===== СМЕРТЕЛЬНЫЕ: эффект близости к смерти =====
const deadlyLevel = computed(() => {
  if (!woundSlots.value) return 0
  
  const total = woundSlots.value.deadly.base + woundSlots.value.deadly.bonus
  const filled = wounds.value.deadly
  
  if (total === 0) return 0
  
  return filled / total // 0..1
})

const isDying = computed(() => deadlyLevel.value > 0)
const isDead = computed(() => deadlyLevel.value >= 1)

// ===== ПРОСТОЕ HP =====
const hpPercent = computed(() => {
  if (healthType.value !== 'simple') return 100
  
  const hp = props.combat?.hp || 0
  const maxHp = props.combat?.maxHp || 1
  
  return (hp / maxHp) * 100
})

const hpOverlayPercent = computed(() => {
  return Math.max(0, 100 - hpPercent.value) * 0.7 // Максимум 70% покрытия
})

// Fallback - первая буква имени
const nameFallback = computed(() => {
  return props.name?.charAt(0)?.toUpperCase() || '?'
})

// ===== ЗАЩИТА =====

// Находим сложность по значению защиты
const findDifficulty = (value) => {
  const diffs = Object.entries(diffsData.default || diffsData)
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

// Получаем данные защиты для сегмента (melee)
const getMeleeDefenceSegment = (direction) => {
  if (!props.meleeDefence) return null
  const value = props.meleeDefence[direction]
  if (value === undefined || value === null) return null
  return findDifficulty(value)
}

// Получаем данные защиты для сегмента (ranged)
const getRangedDefenceSegment = (direction) => {
  if (!props.rangedDefence) return null
  const value = props.rangedDefence[direction]
  if (value === undefined || value === null) return null
  return findDifficulty(value)
}

// Сегменты защиты от ударов (melee)
const meleeDefenceSegments = computed(() => {
  if (!props.showDefence || !props.meleeDefence) return null
  if (props.defenceMode === 'none' || props.defenceMode === 'ranged') return null
  
  return {
    front: getMeleeDefenceSegment('front'),
    flank: getMeleeDefenceSegment('flank'),
    back: getMeleeDefenceSegment('back')
  }
})

// Сегменты защиты от снарядов (ranged)
const rangedDefenceSegments = computed(() => {
  if (!props.showDefence || !props.rangedDefence) return null
  if (props.defenceMode === 'none' || props.defenceMode === 'melee') return null
  
  return {
    front: getRangedDefenceSegment('front'),
    flank: getRangedDefenceSegment('flank'),
    back: getRangedDefenceSegment('back')
  }
})

// Проверка подсветки сегмента
const isSegmentHighlighted = (type, direction) => {
  if (!props.highlightSegment) return false
  return props.highlightSegment.type === type && props.highlightSegment.direction === direction
}

// Показывать ли только подсвеченный сегмент (режим атаки)
const isHighlightOnlyMode = computed(() => props.highlightSegment !== null)

// Transform для поворота защиты
const defenceTransform = computed(() => {
  if (props.defenceRotation === 0) return ''
  const size = pixelSize.value
  const padding = defencePadding.value
  const cx = size / 2 + padding
  const cy = size / 2 + padding
  return `rotate(${props.defenceRotation} ${cx} ${cy})`
})

// Генерация SVG пути для сегмента полу-шестиугольника (melee)
// Pointy-top hexagon: верхушка сверху, левая половина
// front (верхняя наклонная), flank (вертикальная боковая), back (нижняя наклонная)
const getHexSegmentPath = (segment, offset = 0) => {
  const size = pixelSize.value
  const padding = defencePadding.value
  const cx = size / 2 + padding
  const cy = size / 2 + padding
  const radius = size / 2 + 14 + offset // Отступ от портрета
  
  const getPoint = (angleDeg) => {
    const rad = (angleDeg - 90) * Math.PI / 180
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad)
    }
  }
  
  // Ключевые точки pointy-top гексагона (левая половина)
  const top = getPoint(0)        // Верхушка
  const bottom = getPoint(180)   // Низ
  const botLeft = getPoint(240)  // Низ-лево
  const topLeft = getPoint(300)  // Верх-лево
  
  if (segment === 'front') {
    // Верхняя наклонная: от верхушки к верх-лево
    return `M ${top.x} ${top.y} L ${topLeft.x} ${topLeft.y}`
  } else if (segment === 'flank') {
    // Вертикальная боковая: от верх-лево к низ-лево
    return `M ${topLeft.x} ${topLeft.y} L ${botLeft.x} ${botLeft.y}`
  } else if (segment === 'back') {
    // Нижняя наклонная: от низ-лево к низу
    return `M ${botLeft.x} ${botLeft.y} L ${bottom.x} ${bottom.y}`
  }
  return ''
}

// Генерация SVG дуги для сегмента полукруга (ranged)
// Левая половина (снаружи гексагона): front (верхняя дуга), flank (средняя), back (нижняя)
// Углы: front: 300°-360°(0°), flank: 240°-300°, back: 180°-240°
const getArcSegmentPath = (segment, offset = 0, side = 'left') => {
  const size = pixelSize.value
  const padding = defencePadding.value
  const cx = size / 2 + padding
  const cy = size / 2 + padding
  // Полукруг снаружи гексагона
  const hexRadius = size / 2 + 14
  const arcRadius = hexRadius + 8 + offset // Дуга снаружи гексагона
  
  let startAngle, endAngle
  
  if (side === 'left') {
    // Левая половина (180° - 360°), но рисуем против часовой для правильного порядка
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
      return ''
    }
  } else {
    // Правая половина (0° - 180°) для режима both
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
      return ''
    }
  }
  
  // Конвертируем в радианы (SVG: 0° = вправо, поэтому -90°)
  const startRad = (startAngle - 90) * Math.PI / 180
  const endRad = (endAngle - 90) * Math.PI / 180
  
  const x1 = cx + arcRadius * Math.cos(startRad)
  const y1 = cy + arcRadius * Math.sin(startRad)
  const x2 = cx + arcRadius * Math.cos(endRad)
  const y2 = cy + arcRadius * Math.sin(endRad)
  
  // Дуга (sweep = 1 для часовой стрелки)
  return `M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 0 1 ${x2} ${y2}`
}

// Получаем стиль основной линии для сегмента защиты
// below (dashed) = только пунктир
// base (single) = только сплошная
// above (double) = сплошная (внутренняя линия)
const getDefenceLineStyle = (difficulty) => {
  if (!difficulty) return {}
  
  const linetype = difficulty.linetype || 'single'
  const color = difficulty.color || '#FFFFFF'
  
  // Базовый стиль - сплошная линия
  // Используем kebab-case для SVG атрибутов
  const baseStyle = {
    stroke: color,
    'stroke-width': 2,
    fill: 'none',
    'stroke-linecap': 'butt' // Ровные концы для "слипания"
  }
  
  if (linetype === 'dashed') {
    // Только пунктир для "ниже"
    return { ...baseStyle, 'stroke-dasharray': '4 3' }
  }
  
  // single и double - сплошная линия
  return baseStyle
}

// Дополнительная внешняя пунктирная линия для double (модификатор "выше")
// Располагается снаружи, вплотную к основной
const getDefenceOuterDashedStyle = (difficulty) => {
  if (!difficulty || difficulty.linetype !== 'double') return null
  
  return {
    stroke: difficulty.color || '#FFFFFF',
    'stroke-width': 2,
    fill: 'none',
    'stroke-linecap': 'butt',
    'stroke-dasharray': '4 3'
  }
}

// Смещение для double-линии (внешняя пунктирная)
const DOUBLE_OFFSET = 2

// Размер отступа для защиты (чтобы SVG не выходил за границы)
// Учитываем: отступ от портрета (14) + hex толщина (2) + gap (8) + arc толщина (2) + double offset (2) + запас
const defencePadding = computed(() => {
  if (!props.showDefence) return 0
  return 28 // px с каждой стороны
})

// Полный размер компонента с учётом защиты
const totalSize = computed(() => pixelSize.value + defencePadding.value * 2)
</script>

<template>
  <div 
    class="character-portrait"
    :class="[`size-${size}`, { dying: isDying, dead: isDead, 'with-defence': showDefence }]"
    :style="{ 
      width: `${totalSize}px`, 
      height: `${totalSize}px`
    }"
  >
    <!-- Контейнер с обрезкой для портрета и оверлеев -->
    <div 
      class="portrait-container" 
      :style="{ 
        width: `${pixelSize}px`, 
        height: `${pixelSize}px`,
        position: 'absolute',
        top: `${defencePadding}px`,
        left: `${defencePadding}px`
      }"
    >
      <!-- Основной портрет -->
      <div class="portrait-image">
        <img 
          v-if="portrait" 
          :src="portraitImageUrl"
          :alt="name"
          class="portrait-img"
          @error="$event.target.style.display = 'none'"
        />
        <div v-else class="portrait-fallback">
          {{ nameFallback }}
        </div>
      </div>
      
      <!-- Тяжёлые ранения: красный оверлей снизу -->
      <div 
        v-if="showWounds && healthType === 'wounds' && heavyOverlayPercent > 0"
        class="heavy-overlay"
        :style="{ height: `${heavyOverlayPercent}%` }"
      />
      
      <!-- Простое HP: красный оверлей сверху -->
      <div 
        v-if="showWounds && healthType === 'simple' && hpOverlayPercent > 0"
        class="hp-damage-overlay"
        :style="{ height: `${hpOverlayPercent}%` }"
      />
      
      <!-- Смертельные ранения: пульсация и затемнение -->
      <div 
        v-if="showWounds && isDying"
        class="deadly-overlay"
        :style="{ opacity: deadlyLevel * 0.8 }"
      />
      
      <!-- Смерть -->
      <div v-if="isDead" class="death-overlay">
        <span class="death-icon">💀</span>
      </div>
    </div>
    
    <!-- SVG слой защиты (рисуется ПЕРЕД ранениями, чтобы ранения были сверху) -->
    <svg 
      v-if="showDefence && (meleeDefenceSegments || rangedDefenceSegments)"
      class="defence-overlay"
      :viewBox="`0 0 ${totalSize} ${totalSize}`"
      :width="totalSize"
      :height="totalSize"
      style="position: absolute; top: 0; left: 0;"
    >
      <!-- Группа с вращением для направления персонажа -->
      <g :transform="defenceTransform">
        <!-- Защита от ударов (melee - полушестиугольник слева) -->
        <g v-if="meleeDefenceSegments" class="melee-defence">
          <!-- Front (верхняя наклонная) -->
          <template v-if="!isHighlightOnlyMode || isSegmentHighlighted('melee', 'front')">
            <path
              v-if="meleeDefenceSegments.front"
              :d="getHexSegmentPath('front', 0)"
              v-bind="getDefenceLineStyle(meleeDefenceSegments.front)"
            />
            <path
              v-if="getDefenceOuterDashedStyle(meleeDefenceSegments.front)"
              :d="getHexSegmentPath('front', DOUBLE_OFFSET)"
              v-bind="getDefenceOuterDashedStyle(meleeDefenceSegments.front)"
            />
          </template>
          
          <!-- Flank (вертикальная боковая) -->
          <template v-if="!isHighlightOnlyMode || isSegmentHighlighted('melee', 'flank')">
            <path
              v-if="meleeDefenceSegments.flank"
              :d="getHexSegmentPath('flank', 0)"
              v-bind="getDefenceLineStyle(meleeDefenceSegments.flank)"
            />
            <path
              v-if="getDefenceOuterDashedStyle(meleeDefenceSegments.flank)"
              :d="getHexSegmentPath('flank', DOUBLE_OFFSET)"
              v-bind="getDefenceOuterDashedStyle(meleeDefenceSegments.flank)"
            />
          </template>
          
          <!-- Back (нижняя наклонная) -->
          <template v-if="!isHighlightOnlyMode || isSegmentHighlighted('melee', 'back')">
            <path
              v-if="meleeDefenceSegments.back"
              :d="getHexSegmentPath('back', 0)"
              v-bind="getDefenceLineStyle(meleeDefenceSegments.back)"
            />
            <path
              v-if="getDefenceOuterDashedStyle(meleeDefenceSegments.back)"
              :d="getHexSegmentPath('back', DOUBLE_OFFSET)"
              v-bind="getDefenceOuterDashedStyle(meleeDefenceSegments.back)"
            />
          </template>
        </g>
        
        <!-- Защита от снарядов (ranged - полукруг слева, снаружи гексагона) -->
        <g v-if="rangedDefenceSegments" class="ranged-defence">
          <!-- Front (верхняя дуга) -->
          <template v-if="!isHighlightOnlyMode || isSegmentHighlighted('ranged', 'front')">
            <path
              v-if="rangedDefenceSegments.front"
              :d="getArcSegmentPath('front', 0, defenceLayout)"
              v-bind="getDefenceLineStyle(rangedDefenceSegments.front)"
            />
            <path
              v-if="getDefenceOuterDashedStyle(rangedDefenceSegments.front)"
              :d="getArcSegmentPath('front', DOUBLE_OFFSET, defenceLayout)"
              v-bind="getDefenceOuterDashedStyle(rangedDefenceSegments.front)"
            />
          </template>
          
          <!-- Flank (средняя дуга) -->
          <template v-if="!isHighlightOnlyMode || isSegmentHighlighted('ranged', 'flank')">
            <path
              v-if="rangedDefenceSegments.flank"
              :d="getArcSegmentPath('flank', 0, defenceLayout)"
              v-bind="getDefenceLineStyle(rangedDefenceSegments.flank)"
            />
            <path
              v-if="getDefenceOuterDashedStyle(rangedDefenceSegments.flank)"
              :d="getArcSegmentPath('flank', DOUBLE_OFFSET, defenceLayout)"
              v-bind="getDefenceOuterDashedStyle(rangedDefenceSegments.flank)"
            />
          </template>
          
          <!-- Back (нижняя дуга) -->
          <template v-if="!isHighlightOnlyMode || isSegmentHighlighted('ranged', 'back')">
            <path
              v-if="rangedDefenceSegments.back"
              :d="getArcSegmentPath('back', 0, defenceLayout)"
              v-bind="getDefenceLineStyle(rangedDefenceSegments.back)"
            />
            <path
              v-if="getDefenceOuterDashedStyle(rangedDefenceSegments.back)"
              :d="getArcSegmentPath('back', DOUBLE_OFFSET, defenceLayout)"
              v-bind="getDefenceOuterDashedStyle(rangedDefenceSegments.back)"
            />
          </template>
        </g>
      </g>
    </svg>
    
    <!-- SVG слой с царапинами и лёгкими ранениями (поверх защиты) -->
    <svg 
      v-if="showWounds"
      class="wounds-overlay"
      :viewBox="`0 0 ${pixelSize} ${pixelSize}`"
      :width="pixelSize"
      :height="pixelSize"
      :style="{ 
        position: 'absolute',
        top: showDefence ? `${defencePadding}px` : '0',
        left: showDefence ? `${defencePadding}px` : '0',
        overflow: 'visible'
      }"
    >
      <!-- Царапины: дуги (только заполненные) -->
      <path
        v-for="arc in scratchArcs"
        :key="`scratch-${arc.index}`"
        :d="getArcPath(arc.startAngle, arc.endAngle, pixelSize / 2 - 3, 2)"
        fill="none"
        :stroke="arc.isBonus ? '#a855f7' : '#fbbf24'"
        stroke-width="3"
        stroke-linecap="round"
        class="scratch-arc filled"
      />
      
      <!-- Лёгкие ранения: точки на границе круга (только заполненные) -->
      <circle
        v-for="dot in lightDots"
        :key="`light-${dot.index}`"
        :cx="dot.cx"
        :cy="dot.cy"
        :r="dot.r"
        :fill="dot.isBonus ? '#a855f7' : '#ef4444'"
        stroke="#1f2937"
        stroke-width="1.5"
        class="light-dot filled"
      />
    </svg>
  </div>
</template>

<style scoped>
.character-portrait {
  position: relative;
  /* Размер задаётся через inline style с учётом padding */
  box-sizing: border-box;
  flex-shrink: 0;
}

/* Контейнер с обрезкой для портрета и оверлеев */
.portrait-container {
  position: relative;
  /* Размер задаётся через inline style */
  border-radius: 50%;
  overflow: hidden;
}

.portrait-image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
}

.portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portrait-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #64748b;
  background: linear-gradient(135deg, #334155 0%, #1e293b 100%);
}

.size-sm .portrait-fallback { font-size: 1.25rem; }
.size-md .portrait-fallback { font-size: 2rem; }
.size-lg .portrait-fallback { font-size: 3rem; }
.size-xl .portrait-fallback { font-size: 4rem; }

/* SVG слой ранений - позиционируется относительно portrait-container */
.wounds-overlay {
  position: absolute;
  pointer-events: none;
  overflow: visible;
}

/* SVG слой защиты - позиционируется относительно portrait-container */
.defence-overlay {
  position: absolute;
  pointer-events: none;
  overflow: visible;
}

.defence-overlay path {
  transition: stroke 0.3s, stroke-width 0.3s;
}

.scratch-arc {
  transition: stroke 0.3s, stroke-width 0.3s;
}

.scratch-arc.filled {
  filter: drop-shadow(0 0 2px currentColor);
}

.light-dot {
  transition: fill 0.3s, r 0.3s;
}

.light-dot.filled {
  filter: drop-shadow(0 0 3px #ef4444);
}

/* Тяжёлые ранения оверлей - жёсткий градиент */
.heavy-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, 
    rgba(220, 38, 38, 0.85) 0%, 
    rgba(220, 38, 38, 0.7) 70%, 
    rgba(220, 38, 38, 0.3) 90%,
    rgba(220, 38, 38, 0) 100%
  );
  pointer-events: none;
  transition: height 0.3s;
  border-radius: 0 0 50% 50%;
}

/* HP урон оверлей (сверху) - жёсткий градиент */
.hp-damage-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to bottom, 
    rgba(220, 38, 38, 0.85) 0%, 
    rgba(220, 38, 38, 0.7) 70%, 
    rgba(220, 38, 38, 0.3) 90%,
    rgba(220, 38, 38, 0) 100%
  );
  pointer-events: none;
  transition: height 0.3s;
  border-radius: 50% 50% 0 0;
}

/* Смертельные ранения */
.deadly-overlay {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, transparent 30%, rgba(0, 0, 0, 0.8) 100%);
  pointer-events: none;
  transition: opacity 0.3s;
}

.character-portrait.dying {
  animation: dying-pulse 2s ease-in-out infinite;
}

@keyframes dying-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.4); }
  50% { box-shadow: 0 0 20px 5px rgba(220, 38, 38, 0.6); }
}

/* Смерть */
.death-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.death-icon {
  font-size: 2em;
  filter: grayscale(0.5);
}

.size-sm .death-icon { font-size: 1.25rem; }
.size-md .death-icon { font-size: 2rem; }
.size-lg .death-icon { font-size: 3rem; }
.size-xl .death-icon { font-size: 4rem; }
</style>
