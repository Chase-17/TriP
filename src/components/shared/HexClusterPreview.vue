<script setup>
/**
 * HexClusterPreview - превью кластера из 7 гексов на одном Canvas
 * 
 * Центральный гекс + 6 соседей, расположенных вплотную.
 * Используется для предпросмотра редактируемого террейна с соседями.
 * 
 * Архитектура рендеринга v2:
 * 1. Находим ВСЕ границы между разными террейнами (не только с центром)
 * 2. Группируем смежные рёбра в цепочки (для сглаживания)
 * 3. Рисуем нижние террейны полностью под верхними
 * 4. Верхние террейны обрезаются по деформированным маскам
 * 5. Сетка и выделение рисуются поверх всего
 */
import { ref, computed, watch, onMounted } from 'vue'
import { TerrainLayerRenderer } from '@/utils/rendering/terrainLayerRenderer.js'
import { 
  HexClusterRenderer,
  getHexPath,
  getHexVertices,
  getNeighborOffsets,
  getElevationPriority
} from '@/utils/rendering/hexClusterRenderer.js'
import { useTerrainStore } from '@/stores/terrain.js'

const terrainStore = useTerrainStore()

const props = defineProps({
  // Центральный террейн (layers + color + categoryTags)
  centerTerrain: {
    type: Object,
    default: () => ({ layers: [], color: '#888888' })
  },
  // Массив из 6 соседних террейнов (null = пустой)
  // Для режима cluster7 используется как раньше
  // Для других режимов генерируется автоматически
  neighbors: {
    type: Array,
    default: () => [null, null, null, null, null, null]
  },
  // Радиус одного гекса в пикселях
  hexRadius: {
    type: Number,
    default: 70
  },
  // Индекс выбранного соседа (-1 = не выбран, 6 = центр)
  selectedIndex: {
    type: Number,
    default: -1
  },
  // Массив правил переходов для каждого соседа
  // Каждый элемент: { style: 'smooth-wave', params: {...} } или null
  transitions: {
    type: Array,
    default: () => []
  },
  // Показывать сетку поверх гексов
  showGrid: {
    type: Boolean,
    default: true
  },
  // Форма кластера: 'cluster7' | 'circle3' | 'rect5x5' | 'rect3x7' | 'diamond'
  clusterShape: {
    type: String,
    default: 'cluster7'
  },
  // Альтернативные террейны для заполнения (для тестов)
  // Массив террейнов, которые чередуются с центральным
  alternateTerrain: {
    type: Object,
    default: null
  },
  // Террейны для расширенных форм (Object как Map: index -> terrain)
  hexTerrains: {
    type: Object,
    default: () => ({})
  },
  // Правило перехода, которое редактируется (для live preview)
  // { level, from, to, fromTerrainId, toTerrainId, effects, zPriority }
  editingRule: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['select', 'rendered', 'paintstart', 'paintmove', 'paintend'])

const canvasRef = ref(null)
const isRendering = ref(false)

// Кэш рендерера текстур
let terrainRenderer = null
let clusterRenderer = null

// Кэш сгенерированных паттернов текстур
// Ключ: terrainId или hash слоёв
// Значение: { layersHash, size, canvas (с текстурой), pattern }
const patternCache = new Map()

// Минимальный размер паттерна
const MIN_PATTERN_SIZE = 128

/**
 * Проверяет, применяется ли редактируемое правило к паре террейнов
 */
function doesEditingRuleApply(rule, fromTerrain, toTerrain) {
  if (!rule || !fromTerrain || !toTerrain) return false
  
  const level = rule.level
  
  if (level === 'terrain-to-terrain') {
    // Правило между конкретными террейнами (двунаправленное)
    const matchDirect = (fromTerrain.id === rule.fromTerrainId && toTerrain.id === rule.toTerrainId)
    const matchReverse = (toTerrain.id === rule.fromTerrainId && fromTerrain.id === rule.toTerrainId)
    return matchDirect || matchReverse
  }
  
  if (level === 'terrain-to-tag') {
    // Правило террейн → тег
    const fromMatch = fromTerrain.id === rule.fromTerrainId
    const toMatch = rule.to && matchesTag(toTerrain, rule.to.category, rule.to.tag)
    
    const reverseFromMatch = toTerrain.id === rule.fromTerrainId
    const reverseToMatch = rule.to && matchesTag(fromTerrain, rule.to.category, rule.to.tag)
    
    return (fromMatch && toMatch) || (reverseFromMatch && reverseToMatch)
  }
  
  if (level === 'tag-to-tag') {
    // Правило тег → тег
    const fromMatch = rule.from && matchesTag(fromTerrain, rule.from.category, rule.from.tag)
    const toMatch = rule.to && matchesTag(toTerrain, rule.to.category, rule.to.tag)
    
    const reverseFromMatch = rule.from && matchesTag(toTerrain, rule.from.category, rule.from.tag)
    const reverseToMatch = rule.to && matchesTag(fromTerrain, rule.to.category, rule.to.tag)
    
    return (fromMatch && toMatch) || (reverseFromMatch && reverseToMatch)
  }
  
  return false
}

/**
 * Проверяет соответствие террейна тегу
 */
function matchesTag(terrain, category, tag) {
  if (!terrain || !category) return false
  if (tag === '*') return true
  const terrainTag = terrain.categoryTags?.[category]
  return terrainTag === tag
}

/**
 * Генерирует hash для массива слоёв террейна
 */
function getLayersHash(layers, color) {
  if (!layers || layers.length === 0) return `solid:${color}`
  return JSON.stringify(layers.map(l => ({
    type: l.type,
    color: l.color,
    opacity: l.opacity,
    noiseType: l.noiseType,
    noiseScale: l.noiseScale,
    noiseOctaves: l.noiseOctaves,
    noisePersistence: l.noisePersistence,
    noiseLacunarity: l.noiseLacunarity,
    noiseContrast: l.noiseContrast,
    noiseSeed: l.noiseSeed,
    patternType: l.patternType,
    patternSize: l.patternSize,
    patternSpacing: l.patternSpacing,
    patternAngle: l.patternAngle,
    blendMode: l.blendMode,
    enabled: l.enabled
  })))
}

/**
 * Очистить кэш паттернов (при смене контекста или принудительно)
 */
function clearPatternCache() {
  patternCache.clear()
}

/**
 * Инвалидировать конкретный паттерн в кэше
 */
function invalidatePattern(terrainId) {
  const key = terrainId ? `id:${terrainId}` : 'editing'
  patternCache.delete(key)
}

/**
 * Генерация позиций гексов для разных форм кластера
 * Возвращает массив { q, r } в axial coordinates
 * q = колонка, r = строка (для flat-top гексов)
 */
function generateClusterPositions(shape) {
  const positions = []
  
  switch (shape) {
    case 'cluster7':
      // Классический кластер: центр + 6 соседей
      positions.push({ q: 0, r: 0 }) // центр
      positions.push({ q: 1, r: -1 }) // СВ
      positions.push({ q: 1, r: 0 })  // ЮВ
      positions.push({ q: 0, r: 1 })  // Ю
      positions.push({ q: -1, r: 1 }) // ЮЗ
      positions.push({ q: -1, r: 0 }) // СЗ
      positions.push({ q: 0, r: -1 }) // С
      break
      
    case 'circle2':
      // Круг радиуса 2 (19 гексов)
      for (let q = -2; q <= 2; q++) {
        for (let r = -2; r <= 2; r++) {
          const s = -q - r
          if (Math.abs(s) <= 2) {
            positions.push({ q, r })
          }
        }
      }
      break
      
    case 'circle3':
      // Круг радиуса 3 (37 гексов)
      for (let q = -3; q <= 3; q++) {
        for (let r = -3; r <= 3; r++) {
          const s = -q - r
          if (Math.abs(s) <= 3) {
            positions.push({ q, r })
          }
        }
      }
      break
      
    case 'rect5x5':
      // Прямоугольник 5x5
      for (let row = -2; row <= 2; row++) {
        for (let col = -2; col <= 2; col++) {
          // Offset coordinates to axial
          const q = col - Math.floor(row / 2)
          const r = row
          positions.push({ q, r })
        }
      }
      break
      
    case 'rect3x7':
      // Вертикальный прямоугольник 3x7
      for (let row = -3; row <= 3; row++) {
        for (let col = -1; col <= 1; col++) {
          const q = col - Math.floor(row / 2)
          const r = row
          positions.push({ q, r })
        }
      }
      break
      
    case 'rect5x9':
      // Большой вертикальный прямоугольник 5x9
      for (let row = -4; row <= 4; row++) {
        for (let col = -2; col <= 2; col++) {
          const q = col - Math.floor(row / 2)
          const r = row
          positions.push({ q, r })
        }
      }
      break
      
    case 'diamond':
      // Ромб (diamond shape)
      for (let q = -2; q <= 2; q++) {
        for (let r = -2; r <= 2; r++) {
          if (Math.abs(q) + Math.abs(r) <= 3) {
            positions.push({ q, r })
          }
        }
      }
      break
      
    case 'line7':
      // Горизонтальная линия из 7 гексов
      for (let q = -3; q <= 3; q++) {
        positions.push({ q, r: 0 })
      }
      break
      
    default:
      // Fallback to cluster7
      return generateClusterPositions('cluster7')
  }
  
  return positions
}

/**
 * Конвертировать axial (q, r) в pixel coordinates
 */
function axialToPixel(q, r, radius, centerX, centerY) {
  // Flat-top hex
  const x = radius * (3/2 * q)
  const y = radius * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r)
  return { x: centerX + x, y: centerY + y }
}

/**
 * Вычислить bounding box для формы кластера
 */
function getClusterBounds(shape, radius) {
  const positions = generateClusterPositions(shape)
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  
  for (const { q, r } of positions) {
    const { x, y } = axialToPixel(q, r, radius, 0, 0)
    minX = Math.min(minX, x - radius)
    maxX = Math.max(maxX, x + radius)
    minY = Math.min(minY, y - radius * Math.sqrt(3) / 2)
    maxY = Math.max(maxY, y + radius * Math.sqrt(3) / 2)
  }
  
  return {
    width: maxX - minX,
    height: maxY - minY,
    offsetX: -minX,
    offsetY: -minY
  }
}

// Размер canvas (с запасом для всех гексов)
const canvasSize = computed(() => {
  const r = props.hexRadius
  const bounds = getClusterBounds(props.clusterShape, r)
  const padding = 20
  return { 
    width: Math.ceil(bounds.width + padding), 
    height: Math.ceil(bounds.height + padding) 
  }
})

// Центр canvas
const canvasCenter = computed(() => ({
  x: canvasSize.value.width / 2,
  y: canvasSize.value.height / 2
}))

/**
 * Получить заливку для террейна (pattern или color)
 * Использует кэш для предотвращения перегенерации шума
 * 
 * @param {CanvasRenderingContext2D} ctx - контекст canvas
 * @param {Object} terrain - объект террейна
 * @param {number} radius - радиус гекса (не используется напрямую)
 * @param {number} requiredSize - минимальный требуемый размер текстуры (без повторов)
 */
function getTerrainFill(ctx, terrain, radius, requiredSize = null) {
  if (!terrain) return null
  
  const layers = terrain.layers || []
  const color = terrain.color || '#888888'
  
  if (layers.length === 0) {
    return color
  }
  
  // Определяем требуемый размер текстуры
  // Если не указан — используем размер canvas (гарантирует покрытие всего кластера)
  const targetSize = Math.max(
    MIN_PATTERN_SIZE,
    requiredSize || canvasSize.value.width,
    requiredSize || canvasSize.value.height
  )
  
  // Генерируем ключ кэша на основе содержимого слоёв
  const cacheKey = terrain.id ? `id:${terrain.id}` : 'editing'
  const layersHash = getLayersHash(layers, color)
  
  // Проверяем кэш
  const cached = patternCache.get(cacheKey)
  if (cached && cached.layersHash === layersHash && cached.size >= targetSize && cached.pattern) {
    // Кэшированная текстура достаточного размера
    return cached.pattern
  }
  
  // Нужно сгенерировать новую текстуру (или увеличить существующую)
  const newSize = Math.max(targetSize, cached?.size || 0)
  
  // Создаём или обновляем рендерер нужного размера
  if (!terrainRenderer || terrainRenderer.width !== newSize || terrainRenderer.height !== newSize) {
    terrainRenderer = new TerrainLayerRenderer(newSize, newSize)
  }
  
  terrainRenderer.render(layers, { hexMask: false })
  
  // Создаём копию canvas для кэша (чтобы не потерять при следующем рендере)
  const cachedCanvas = document.createElement('canvas')
  cachedCanvas.width = newSize
  cachedCanvas.height = newSize
  cachedCanvas.getContext('2d').drawImage(terrainRenderer.canvas, 0, 0)
  
  // Создаём pattern
  const pattern = ctx.createPattern(cachedCanvas, 'repeat')
  
  // Сохраняем в кэш
  patternCache.set(cacheKey, { 
    layersHash, 
    size: newSize,
    canvas: cachedCanvas,
    pattern
  })
  
  return pattern
}

// Цвета для разных стилей переходов (индикаторы)
const transitionStyleColors = {
  'sharp': '#9CA3AF',
  'blend': '#60A5FA',
  'smooth-wave': '#34D399',
  'jagged': '#F87171',
  'gradient': '#A78BFA',
  'noise': '#FBBF24',
  'dither': '#F472B6'
}

/**
 * Отрисовать индикатор стиля перехода
 */
function drawTransitionIndicator(ctx, centerX, centerY, radius, transition) {
  if (!transition) return
  
  const style = transition.style || 'sharp'
  const color = transitionStyleColors[style] || '#9CA3AF'
  
  const indicatorRadius = radius * 0.12
  const indicatorX = centerX + radius * 0.55
  const indicatorY = centerY - radius * 0.45
  
  ctx.beginPath()
  ctx.arc(indicatorX, indicatorY, indicatorRadius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
  ctx.lineWidth = 1
  ctx.stroke()
}

/**
 * Отрисовать пустой гекс (placeholder)
 */
function drawEmptyHex(ctx, cx, cy, radius) {
  ctx.beginPath()
  
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 3
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  
  ctx.closePath()
  
  // Полупрозрачный фон
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
  ctx.fill()
  
  // Пунктирная граница
  ctx.setLineDash([5, 5])
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.setLineDash([])
  
  // Плюсик
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.font = `${radius * 0.5}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('+', cx, cy)
}

/**
 * Отрисовать выделение гекса
 */
function drawSelection(ctx, cx, cy, radius) {
  ctx.beginPath()
  
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 3
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  
  ctx.closePath()
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)'
  ctx.lineWidth = 3
  ctx.stroke()
}

/**
 * Основная функция рендеринга
 */
function render() {
  const canvas = canvasRef.value
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  const { width, height } = canvasSize.value
  const r = props.hexRadius
  const bounds = getClusterBounds(props.clusterShape, r)
  
  // Центр canvas с учётом offset
  const centerX = bounds.offsetX + 10
  const centerY = bounds.offsetY + 10
  
  // Очистка
  ctx.clearRect(0, 0, width, height)
  
  isRendering.value = true
  
  // Инициализируем рендерер кластера
  if (!clusterRenderer || clusterRenderer.width !== width || clusterRenderer.height !== height) {
    clusterRenderer = new HexClusterRenderer(width, height)
  }
  
  // Передаём настройки освещения из terrain store
  clusterRenderer.setLightingSettings(terrainStore.lightingSettings)
  
  // Функция получения заливки
  const getFill = (terrain) => getTerrainFill(ctx, terrain, r)
  
  // Генерируем позиции гексов для текущей формы
  const positions = generateClusterPositions(props.clusterShape)
  
  if (props.clusterShape === 'cluster7') {
    // Классический режим: используем centerTerrain + neighbors
    const offsets = getNeighborOffsets(r)
    
    // Собираем пустые гексы для отрисовки placeholder'ов
    const emptyPositions = []
    for (let i = 0; i < 6; i++) {
      if (!props.neighbors[i]) {
        const { dx, dy } = offsets[i]
        emptyPositions.push({ cx: centerX + dx, cy: centerY + dy, index: i })
      }
    }
    
    // Рисуем пустые гексы
    for (const pos of emptyPositions) {
      drawEmptyHex(ctx, pos.cx, pos.cy, r)
    }
    
    // Рендерим кластер с переходами
    clusterRenderer.render(ctx, {
      centerTerrain: props.centerTerrain,
      neighbors: props.neighbors,
      transitions: props.transitions,
      cx: centerX, 
      cy: centerY,
      radius: r,
      getFill,
      showGrid: props.showGrid
    })
    
    // Рисуем выделение
    if (props.selectedIndex >= 0) {
      let selX, selY
      
      if (props.selectedIndex === 6) {
        selX = centerX
        selY = centerY
      } else {
        const { dx, dy } = offsets[props.selectedIndex]
        selX = centerX + dx
        selY = centerY + dy
      }
      
      drawSelection(ctx, selX, selY, r)
    }
    
    // Рисуем индикаторы стилей переходов
    if (props.transitions?.length) {
      for (let i = 0; i < 6; i++) {
        const transition = props.transitions[i]
        if (transition && props.neighbors[i]) {
          const offsets = getNeighborOffsets(r)
          const { dx, dy } = offsets[i]
          drawTransitionIndicator(ctx, centerX + dx, centerY + dy, r, transition)
        }
      }
    }
  } else {
    // Расширенный режим: используем hexTerrains или генерируем шахматный паттерн
    const hexes = []
    
    for (let i = 0; i < positions.length; i++) {
      const { q, r: row } = positions[i]
      const { x, y } = axialToPixel(q, row, r, centerX, centerY)
      
      // Определяем террейн для этого гекса
      // 1. Если есть в hexTerrains (Map или Object) — используем его
      // 2. Иначе — шахматный паттерн из centerTerrain и alternateTerrain
      let terrain = null
      
      // Поддержка и Map и Object
      const hexTerrain = props.hexTerrains instanceof Map 
        ? props.hexTerrains.get(i) 
        : props.hexTerrains?.[i]
      
      if (hexTerrain !== undefined && hexTerrain !== null) {
        terrain = hexTerrain
      } else if (props.alternateTerrain) {
        // Шахматный паттерн: (q + r) % 2
        const isAlternate = (q + row) % 2 !== 0
        terrain = isAlternate ? props.alternateTerrain : props.centerTerrain
      } else {
        terrain = props.centerTerrain
      }
      
      if (terrain) {
        hexes.push({
          index: i,
          q,           // axial координаты для поиска соседей
          r: row,      // axial координаты для поиска соседей
          cx: x,
          cy: y,
          terrain,
          fill: getFill(terrain),
          elevation: getElevationPriority(terrain),
          radius: r
        })
      } else {
        // Пустой гекс — рисуем placeholder
        drawEmptyHex(ctx, x, y, r)
      }
    }
    
    // Рендерим через extended API
    clusterRenderer.renderExtended(ctx, {
      hexes,
      getTransitionForPair: (fromTerrain, toTerrain) => {
        // Сначала проверяем редактируемое правило
        if (props.editingRule) {
          const match = doesEditingRuleApply(props.editingRule, fromTerrain, toTerrain)
          if (match) {
            return {
              effects: props.editingRule.effects || [],
              zPriority: props.editingRule.zPriority || 'auto'
            }
          }
        }
        
        // Иначе используем terrain store для поиска правил переходов
        const rule = terrainStore.getTransitionRule(fromTerrain, toTerrain)
        if (rule) {
          return {
            effects: rule.effects || [],
            zPriority: rule.zPriority || 'auto'
          }
        }
        return null
      },
      radius: r,
      getFill,
      showGrid: props.showGrid
    })
    
    // Выделение для расширенного режима
    if (props.selectedIndex >= 0 && props.selectedIndex < positions.length) {
      const { q, r: row } = positions[props.selectedIndex]
      const { x, y } = axialToPixel(q, row, r, centerX, centerY)
      drawSelection(ctx, x, y, r)
    }
  }
  
  isRendering.value = false
  emit('rendered')
}

/**
 * Получить координаты мыши относительно canvas
 */
function getMouseCoords(event) {
  const canvas = canvasRef.value
  if (!canvas) return null
  
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  }
}

/**
 * Определить гекс по координатам
 */
function getHexAtPoint(x, y) {
  const r = props.hexRadius
  const bounds = getClusterBounds(props.clusterShape, r)
  const centerX = bounds.offsetX + 10
  const centerY = bounds.offsetY + 10
  
  const positions = generateClusterPositions(props.clusterShape)
  
  for (let i = 0; i < positions.length; i++) {
    const { q, r: row } = positions[i]
    const { x: hx, y: hy } = axialToPixel(q, row, r, centerX, centerY)
    
    if (isPointInHex(x, y, hx, hy, r)) {
      if (props.clusterShape === 'cluster7') {
        return i === 0 ? 6 : i - 1
      }
      return i
    }
  }
  
  return -1
}

/**
 * Определить какой гекс был кликнут
 */
function handleClick(event) {
  const coords = getMouseCoords(event)
  if (!coords) return
  
  const index = getHexAtPoint(coords.x, coords.y)
  emit('select', index)
}

/**
 * Начало рисования
 */
function handleMouseDown(event) {
  const coords = getMouseCoords(event)
  if (!coords) return
  
  const index = getHexAtPoint(coords.x, coords.y)
  emit('paintstart', index)
}

/**
 * Рисование при движении
 */
function handleMouseMove(event) {
  const coords = getMouseCoords(event)
  if (!coords) return
  
  const index = getHexAtPoint(coords.x, coords.y)
  emit('paintmove', index)
}

/**
 * Завершение рисования
 */
function handleMouseUp() {
  emit('paintend')
}

/**
 * Мышь покинула canvas
 */
function handleMouseLeave() {
  emit('paintend')
}

/**
 * Проверить, находится ли точка внутри гекса
 */
function isPointInHex(px, py, cx, cy, radius) {
  const dx = Math.abs(px - cx)
  const dy = Math.abs(py - cy)
  
  const h = radius * Math.sqrt(3) / 2
  
  if (dx > radius || dy > h) return false
  
  return radius * h - h * dx - radius / 2 * dy >= 0
}

// Следим за изменениями
watch(
  () => [
    props.centerTerrain, 
    props.neighbors, 
    props.hexRadius, 
    props.selectedIndex, 
    props.transitions, 
    props.showGrid,
    props.clusterShape,
    props.alternateTerrain,
    props.hexTerrains,
    props.editingRule,
    // Реактивность правил переходов для extended режимов
    terrainStore.allTransitionRules
  ],
  () => render(),
  { deep: true }
)

onMounted(() => {
  render()
})

defineExpose({ render, clearPatternCache, invalidatePattern })
</script>

<template>
  <div class="hex-cluster-preview">
    <canvas
      ref="canvasRef"
      :width="canvasSize.width"
      :height="canvasSize.height"
      class="hex-cluster-canvas"
      @click="handleClick"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseLeave"
    />
  </div>
</template>

<style scoped>
.hex-cluster-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.hex-cluster-canvas {
  cursor: pointer;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
