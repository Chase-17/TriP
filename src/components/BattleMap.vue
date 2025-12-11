<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useBattleMapStore, MAP_SCALES, TERRAIN_TYPES, LAYER_TYPES } from '@/stores/battleMap'
import { useTerrainStore } from '@/stores/terrain'
import { useFillProfileStore } from '@/stores/fillProfile'
import { useSessionStore } from '@/stores/session'
import { useCharactersStore } from '@/stores/characters'
import { useUserStore } from '@/stores/user'
import { HexGrid, HEX_ORIENTATIONS, hexKey } from '@/utils/hexGrid'
import { 
  SelectionManager, 
  SELECTION_SHAPES, 
  SELECTION_MODES, 
  SELECTION_BEHAVIORS 
} from '@/utils/selection'
import { applyFillProfile, generateFillPreview, getFillStats } from '@/utils/randomFill'
import { getDefenceData } from '@/utils/defence'
import { drawTokens, preloadTokenImages, loadImage, findTokenAtPoint, canvasToWorld, drawPortrait, drawDefence } from '@/utils/tokenRenderer'
import FillProfilePanel from './FillProfilePanel.vue'

// Props
const props = defineProps({
  readonly: {
    type: Boolean,
    default: false
  },
  mobileMode: {
    type: Boolean,
    default: false
  },
  pendingAction: {
    type: Object,
    default: null
  }
})

// Emits
const emit = defineEmits([
  'action-target-selected', 
  'token-selected', 
  'hex-selected', 
  'hex-double-tap',
  'hex-long-press-move',    // Перемещение с long press (ещё выбирает направление)
  'hex-long-press-confirm', // Подтверждение направления после long press
  'token-rotate'            // Поворот токена на месте (long press на своём токене)
])

const battleMapStore = useBattleMapStore()
const terrainStore = useTerrainStore()
const fillProfileStore = useFillProfileStore()
const sessionStore = useSessionStore()
const charactersStore = useCharactersStore()
const userStore = useUserStore()

const { 
  activeMap, 
  editingMap, 
  editorMode, 
  selectedTerrain,
  activeLayerId,
  camera,
  maps,
  publishedMaps,
  selection
} = storeToRefs(battleMapStore)

const { isMaster } = storeToRefs(sessionStore)
const { characters } = storeToRefs(charactersStore)

// Режим только для чтения (для игроков)
const isReadonly = computed(() => props.readonly || !isMaster.value)
const canEdit = computed(() => !isReadonly.value)

// Canvas refs
const canvasContainer = ref(null)
const terrainCanvas = ref(null)
const gridCanvas = ref(null)
const uiCanvas = ref(null)

// Размеры контейнера (обновляются при resize)
const containerSize = ref({ width: 800, height: 600 })

// Состояние UI
const showMapList = ref(false)
const showNewMapDialog = ref(false)
const showTerrainPalette = ref(false)
const showSelectionPanel = ref(false) // Панель настроек выделения
const showFillPanel = ref(false) // Панель профилей заливки
const hoveredHex = ref(null)
const hoveredToken = ref(null) // Токен под курсором
const selectedToken = ref(null) // Выбранный токен
const isDragging = ref(false)
const isPainting = ref(false) // Для рисования с зажатой кнопкой

// Состояние перетаскивания токена (только для мастера)
const isDraggingToken = ref(false)
const draggingToken = ref(null) // Токен, который перетаскиваем
const dragTokenOffset = ref({ x: 0, y: 0 }) // Смещение курсора от центра токена

// Состояние превью заливки
const fillPreviewData = ref(null) // Map<key, terrainId> для превью

// Состояние фильтров палитры террейнов
const terrainSearch = ref('')
const terrainBiomeFilter = ref(null)
const terrainVisibilityFilter = ref(null)
const terrainPassabilityRange = ref({ min: 1, max: 5 })
const showTerrainFilters = ref(false)

// Состояние инструмента выделения
const isSelecting = ref(false) // Идёт выделение
const selectionStart = ref(null) // Начальный гекс выделения
const selectionStartPixel = ref(null) // Начальная точка в пикселях (для прямоугольника)
const selectionPreview = ref([]) // Превью выделяемых гексов
const selectedHexes = ref(new Set()) // Текущее выделение

// Для отслеживания двойного тапа по гексу
const lastSelectedHex = ref(null) // Последний выбранный гекс { q, r, time }

const dragStart = ref({ x: 0, y: 0 })

// Настройки новой карты (теперь без фиксированных размеров)
const newMapForm = ref({
  name: '',
  orientation: HEX_ORIENTATIONS.FLAT,
  scale: MAP_SCALES.BATTLE,
  hexSize: 32
})

// HexGrid instance - origin в центре canvas (0,0 будет в центре экрана)
const hexGrid = computed(() => {
  const map = activeMap.value
  if (!map) return null
  
  return new HexGrid({
    orientation: map.orientation,
    hexSize: map.hexSize,
    origin: { x: 0, y: 0 } // Центр координат - будем сдвигать через камеру
  })
})

// ========== ТОКЕНЫ ПЕРСОНАЖЕЙ ==========

// Получить все токены на активной карте с позициями в пикселях
const mapTokens = computed(() => {
  if (!activeMap.value || !hexGrid.value) return []
  
  const tokens = battleMapStore.getAllTokens(activeMap.value.id)
  const grid = hexGrid.value
  
  return tokens.map(token => {
    const character = charactersStore.getCharacterById(token.characterId)
    if (!character) return null
    
    // Конвертируем координаты гекса в пиксели
    const pixelPos = grid.hexToPixel(token.q, token.r)
    
    return {
      ...token,
      character,
      pixelX: pixelPos.x,
      pixelY: pixelPos.y,
      // Защита для отображения
      meleeDefence: getDefenceData(character, 'melee'),
      rangedDefence: getDefenceData(character, 'ranged')
    }
  }).filter(Boolean)
})

// Размер токена относительно гекса
const tokenSize = computed(() => {
  if (!activeMap.value) return 48
  // Токен немного меньше гекса
  return Math.floor(activeMap.value.hexSize * 1.6)
})

// SelectionManager instance
const selectionManager = computed(() => {
  if (!hexGrid.value) return null
  return new SelectionManager(hexGrid.value)
})

// Отфильтрованные террейны из нового стора
const filteredTerrains = computed(() => {
  return terrainStore.getFilteredTerrains({
    biome: terrainBiomeFilter.value,
    visibility: terrainVisibilityFilter.value,
    passabilityMin: terrainPassabilityRange.value.min,
    passabilityMax: terrainPassabilityRange.value.max,
    search: terrainSearch.value
  })
})

// Все террейны (база + кастомные)
const allTerrains = computed(() => {
  return [...terrainStore.baseTerrains, ...terrainStore.customTerrains]
})

// Текущий выбранный террейн (детали)
const currentTerrainInfo = computed(() => {
  // Сначала ищем в новом сторе
  const terrain = allTerrains.value.find(t => t.id === selectedTerrain.value)
  if (terrain) return terrain
  
  // Fallback на старые TERRAIN_TYPES
  if (TERRAIN_TYPES[selectedTerrain.value]) {
    const old = TERRAIN_TYPES[selectedTerrain.value]
    return {
      id: selectedTerrain.value,
      name: old.name,
      fallbackColor: old.color,
      passability: old.passable ? 1 : 0
    }
  }
  
  return { id: 'void', name: 'Пустота', fallbackColor: '#0d1117', passability: 0 }
})

// Получить информацию о гексе с terrain для мобильного интерфейса
const getHexWithTerrain = (hex) => {
  if (!hex || !activeMap.value) return hex
  const terrainId = battleMapStore.getHexTerrain(activeMap.value.id, hex.q, hex.r)
  const terrain = terrainStore.getTerrainById(terrainId)
  return {
    q: hex.q,
    r: hex.r,
    terrain: terrain || null
  }
}

// Инициализация
onMounted(() => {
  updateContainerSize()
  
  // Для мастера: создаём тестовую карту если нет карт
  // Для игрока: ждём синхронизации от мастера
  if (canEdit.value) {
    if (maps.value.length === 0) {
      createNewMap()
    } else if (!activeMap.value) {
      battleMapStore.setActiveMap(maps.value[0].id)
    }
  }
  
  // Центрируем камеру
  centerCamera()
  
  nextTick(() => {
    renderAll()
  })
  
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// Перерисовка при изменении карты
watch([activeMap, camera], () => {
  nextTick(() => {
    renderAll()
  })
}, { deep: true })

// Предзагрузка изображений токенов
watch(mapTokens, async (tokens) => {
  if (tokens.length > 0) {
    await preloadTokenImages(tokens)
    renderUI() // Перерисовываем после загрузки
  }
}, { immediate: true })

// Синхронизация карты с игроками (только для мастера)
let mapSyncTimeout = null
watch(() => activeMap.value?.updatedAt, (newVal, oldVal) => {
  if (!isMaster.value || !newVal) return
  
  // Дебаунс - отправляем обновление не чаще раза в 500мс
  if (mapSyncTimeout) clearTimeout(mapSyncTimeout)
  mapSyncTimeout = setTimeout(() => {
    sessionStore.broadcastMap()
  }, 500)
}, { flush: 'post' })

// Обновляем размеры контейнера
const updateContainerSize = () => {
  if (canvasContainer.value) {
    const rect = canvasContainer.value.getBoundingClientRect()
    containerSize.value = { 
      width: Math.floor(rect.width) || 800, 
      height: Math.floor(rect.height) || 600 
    }
  }
}

// Центрируем камеру на (0,0)
const centerCamera = () => {
  battleMapStore.$patch({
    camera: {
      x: containerSize.value.width / 2,
      y: containerSize.value.height / 2,
      zoom: 1
    }
  })
}

// ===== РЕНДЕРИНГ =====

const renderAll = () => {
  renderTerrain()
  renderGrid()
  renderUI()
}

// Получаем видимые гексы (для оптимизации - рисуем только то, что видно)
const getVisibleHexBounds = () => {
  if (!hexGrid.value) return null
  
  const grid = hexGrid.value
  const zoom = camera.value.zoom
  const camX = camera.value.x
  const camY = camera.value.y
  
  // Границы видимой области в мировых координатах
  const padding = grid.hexSize * 2
  const left = (-camX / zoom) - padding
  const right = ((containerSize.value.width - camX) / zoom) + padding
  const top = (-camY / zoom) - padding
  const bottom = ((containerSize.value.height - camY) / zoom) + padding
  
  // Конвертируем в hex координаты (примерные границы)
  const topLeft = grid.pixelToHex(left, top)
  const bottomRight = grid.pixelToHex(right, bottom)
  
  return {
    minQ: topLeft.q - 2,
    maxQ: bottomRight.q + 2,
    minR: topLeft.r - 2,
    maxR: bottomRight.r + 2
  }
}

const renderTerrain = () => {
  const canvas = terrainCanvas.value
  if (!canvas || !activeMap.value || !hexGrid.value) return
  
  const ctx = canvas.getContext('2d')
  const map = activeMap.value
  const grid = hexGrid.value
  
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  // Применяем трансформации камеры
  ctx.save()
  ctx.translate(camera.value.x, camera.value.y)
  ctx.scale(camera.value.zoom, camera.value.zoom)
  
  const terrainLayer = map.layers.find(l => l.type === LAYER_TYPES.TERRAIN)
  if (!terrainLayer) {
    ctx.restore()
    return
  }
  
  // Рисуем только гексы с данными (бесконечная карта)
  terrainLayer.data.forEach((terrainData, key) => {
    const [q, r] = key.split(',').map(Number)
    const center = grid.hexToPixel(q, r)
    const corners = grid.getHexCorners(center.x, center.y)
    
    // Проверяем есть ли превью для этого гекса
    let terrainType = terrainData?.terrain || 'void'
    let isPreview = false
    
    if (fillPreviewData.value && fillPreviewData.value.has(key)) {
      terrainType = fillPreviewData.value.get(key)
      isPreview = true
    }
    
    // Получаем цвет террейна из нового или старого стора
    let fillColor = '#0d1117' // Дефолт для void
    
    // Сначала проверяем новый стор
    const newTerrain = terrainStore.getTerrainById(terrainType)
    if (newTerrain) {
      fillColor = newTerrain.fallbackColor || newTerrain.color || fillColor
    } else if (TERRAIN_TYPES[terrainType]) {
      // Fallback на старую систему
      fillColor = TERRAIN_TYPES[terrainType].color
    }
    
    // Рисуем гекс
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(corners[i].x, corners[i].y)
    }
    ctx.closePath()
    
    ctx.fillStyle = fillColor
    ctx.fill()
    
    // Добавляем индикатор превью
    if (isPreview) {
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)'
      ctx.lineWidth = 2 / camera.value.zoom
      ctx.stroke()
    }
  })
  
  ctx.restore()
}

const renderGrid = () => {
  const canvas = gridCanvas.value
  if (!canvas || !activeMap.value || !hexGrid.value) return
  
  const ctx = canvas.getContext('2d')
  const map = activeMap.value
  const grid = hexGrid.value
  
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  if (!map.visibility.showGrid) return
  
  ctx.save()
  ctx.translate(camera.value.x, camera.value.y)
  ctx.scale(camera.value.zoom, camera.value.zoom)
  
  const terrainLayer = map.layers.find(l => l.type === LAYER_TYPES.TERRAIN)
  if (!terrainLayer) {
    ctx.restore()
    return
  }
  
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
  ctx.lineWidth = 1 / camera.value.zoom // Компенсируем толщину при зуме
  
  // Рисуем сетку только для существующих гексов
  terrainLayer.data.forEach((_, key) => {
    const [q, r] = key.split(',').map(Number)
    const center = grid.hexToPixel(q, r)
    const corners = grid.getHexCorners(center.x, center.y)
    
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(corners[i].x, corners[i].y)
    }
    ctx.closePath()
    ctx.stroke()
  })
  
  // Рисуем маркер центра (0,0)
  const centerPos = grid.hexToPixel(0, 0)
  ctx.beginPath()
  ctx.arc(centerPos.x, centerPos.y, 4 / camera.value.zoom, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(250, 204, 21, 0.8)'
  ctx.fill()
  
  ctx.restore()
}

const renderUI = () => {
  const canvas = uiCanvas.value
  if (!canvas || !activeMap.value || !hexGrid.value) return
  
  const ctx = canvas.getContext('2d')
  const grid = hexGrid.value
  
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  
  ctx.save()
  ctx.translate(camera.value.x, camera.value.y)
  ctx.scale(camera.value.zoom, camera.value.zoom)
  
  // Рендерим выбранные гексы
  if (selectedHexes.value.size > 0) {
    selectedHexes.value.forEach(key => {
      const [q, r] = key.split(',').map(Number)
      const center = grid.hexToPixel(q, r)
      const corners = grid.getHexCorners(center.x, center.y)
      
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(corners[i].x, corners[i].y)
      }
      ctx.closePath()
      
      ctx.fillStyle = 'rgba(250, 204, 21, 0.25)' // Жёлтая заливка
      ctx.fill()
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)'
      ctx.lineWidth = 2 / camera.value.zoom
      ctx.stroke()
    })
  }
  
  // Рендерим превью выделения (более прозрачный)
  if (selectionPreview.value.length > 0 && isSelecting.value) {
    // Определяем цвет в зависимости от режима
    const mode = selection.value.mode
    let fillColor, strokeColor
    
    if (mode === SELECTION_MODES.ADD) {
      fillColor = 'rgba(34, 197, 94, 0.3)' // Зелёный - добавление
      strokeColor = 'rgba(34, 197, 94, 0.9)'
    } else if (mode === SELECTION_MODES.SUBTRACT) {
      fillColor = 'rgba(239, 68, 68, 0.3)' // Красный - вычитание
      strokeColor = 'rgba(239, 68, 68, 0.9)'
    } else {
      fillColor = 'rgba(56, 189, 248, 0.3)' // Голубой - замена
      strokeColor = 'rgba(56, 189, 248, 0.9)'
    }
    
    selectionPreview.value.forEach(hex => {
      const center = grid.hexToPixel(hex.q, hex.r)
      const corners = grid.getHexCorners(center.x, center.y)
      
      ctx.beginPath()
      ctx.moveTo(corners[0].x, corners[0].y)
      for (let i = 1; i < 6; i++) {
        ctx.lineTo(corners[i].x, corners[i].y)
      }
      ctx.closePath()
      
      ctx.fillStyle = fillColor
      ctx.fill()
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 1.5 / camera.value.zoom
      ctx.stroke()
    })
    
    // Рисуем индикатор формы выделения
    if (selectionStartPixel.value && hoveredHex.value) {
      const shape = selection.value.shape
      const startPx = selectionStartPixel.value
      const endCenter = grid.hexToPixel(hoveredHex.value.q, hoveredHex.value.r)
      
      ctx.setLineDash([5 / camera.value.zoom, 5 / camera.value.zoom])
      ctx.strokeStyle = strokeColor
      ctx.lineWidth = 2 / camera.value.zoom
      
      if (shape === SELECTION_SHAPES.RECTANGLE) {
        const minX = Math.min(startPx.x, endCenter.x)
        const maxX = Math.max(startPx.x, endCenter.x)
        const minY = Math.min(startPx.y, endCenter.y)
        const maxY = Math.max(startPx.y, endCenter.y)
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY)
      } else if (shape === SELECTION_SHAPES.CIRCLE || shape === SELECTION_SHAPES.HEXAGON) {
        const dx = endCenter.x - startPx.x
        const dy = endCenter.y - startPx.y
        const radius = Math.sqrt(dx * dx + dy * dy)
        ctx.beginPath()
        ctx.arc(startPx.x, startPx.y, radius, 0, Math.PI * 2)
        ctx.stroke()
      } else if (shape === SELECTION_SHAPES.LINE) {
        ctx.beginPath()
        ctx.moveTo(startPx.x, startPx.y)
        ctx.lineTo(endCenter.x, endCenter.y)
        ctx.stroke()
      }
      
      ctx.setLineDash([])
    }
  }
  
  // Рисуем точку привязки начала выделения
  if (selectionStartPixel.value && isSelecting.value) {
    const sp = selectionStartPixel.value
    ctx.beginPath()
    ctx.arc(sp.x, sp.y, 6 / camera.value.zoom, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(250, 204, 21, 0.9)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.lineWidth = 1 / camera.value.zoom
    ctx.stroke()
  }
  
  // Подсветка гекса под курсором (если не идёт выделение)
  if (hoveredHex.value && !isSelecting.value) {
    const center = grid.hexToPixel(hoveredHex.value.q, hoveredHex.value.r)
    const corners = grid.getHexCorners(center.x, center.y)
    
    ctx.beginPath()
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i < 6; i++) {
      ctx.lineTo(corners[i].x, corners[i].y)
    }
    ctx.closePath()
    
    ctx.fillStyle = 'rgba(56, 189, 248, 0.3)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  
  // Рисуем токены персонажей
  const tokens = mapTokens.value
  if (tokens.length > 0) {
    // Смещение facing для ориентации карты: flat-top начинается с 90°, pointy-top с 0°
    const isPointy = activeMap.value?.orientation === HEX_ORIENTATIONS.POINTY
    const facingOffset = isPointy ? 0 : 90
    
    drawTokens(ctx, tokens, {
      tokenSize: tokenSize.value,
      showFacing: true,
      hoveredTokenId: hoveredToken.value?.characterId || null,
      selectedTokenId: selectedToken.value?.characterId || null,
      currentUserId: userStore.userId, // userId совпадает с ownerId токена
      isMaster: isMaster.value,
      draggingTokenId: isDraggingToken.value ? draggingToken.value?.characterId : null,
      facingOffset
    })
  }
  
  // Показываем целевой гекс при перетаскивании токена
  if (isDraggingToken.value && draggingToken.value && hexGrid.value) {
    const targetHex = hexGrid.value.pixelToHex(draggingToken.value.pixelX, draggingToken.value.pixelY)
    const targetCenter = hexGrid.value.hexToPixel(targetHex.q, targetHex.r)
    
    // Рисуем подсветку целевого гекса
    ctx.beginPath()
    // getHexCorners принимает пиксельные координаты центра, не q,r
    const corners = hexGrid.value.getHexCorners(targetCenter.x, targetCenter.y)
    ctx.moveTo(corners[0].x, corners[0].y)
    for (let i = 1; i < corners.length; i++) {
      ctx.lineTo(corners[i].x, corners[i].y)
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(250, 204, 21, 0.3)' // Жёлтая подсветка
    ctx.fill()
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
  }
  
  ctx.restore()
  
  // ===== FACING PICKER UI =====
  // Рисуем поверх всего остального (без трансформации камеры)
  if (longPressState.value.showFacingPicker && longPressState.value.targetHex && hexGrid.value) {
    drawFacingPicker(ctx)
  }
}

// ===== ОБРАБОТЧИКИ СОБЫТИЙ =====

const handleResize = () => {
  updateContainerSize()
  nextTick(() => {
    renderAll()
  })
}

const getMouseHex = (event) => {
  if (!hexGrid.value || !uiCanvas.value) return null
  
  const rect = uiCanvas.value.getBoundingClientRect()
  const x = (event.clientX - rect.left - camera.value.x) / camera.value.zoom
  const y = (event.clientY - rect.top - camera.value.y) / camera.value.zoom
  
  return hexGrid.value.pixelToHex(x, y)
}

/**
 * Получить координаты мыши в мировых пикселях
 */
const getMouseWorld = (event) => {
  if (!uiCanvas.value) return null
  
  const rect = uiCanvas.value.getBoundingClientRect()
  const x = (event.clientX - rect.left - camera.value.x) / camera.value.zoom
  const y = (event.clientY - rect.top - camera.value.y) / camera.value.zoom
  
  return { x, y }
}

/**
 * Найти ближайшую точку привязки (центр гекса или один из углов)
 */
const getSnapPoint = (event) => {
  if (!hexGrid.value || !hoveredHex.value) return null
  
  const mouseWorld = getMouseWorld(event)
  if (!mouseWorld) return null
  
  const grid = hexGrid.value
  const hex = hoveredHex.value
  
  // Центр гекса
  const center = grid.hexToPixel(hex.q, hex.r)
  
  // Углы гекса
  const corners = grid.getHexCorners(center.x, center.y)
  
  // Все возможные точки привязки
  const snapPoints = [
    { x: center.x, y: center.y, type: 'center' },
    ...corners.map((c, i) => ({ x: c.x, y: c.y, type: `corner${i}` }))
  ]
  
  // Находим ближайшую
  let minDist = Infinity
  let closest = snapPoints[0]
  
  for (const point of snapPoints) {
    const dx = point.x - mouseWorld.x
    const dy = point.y - mouseWorld.y
    const dist = dx * dx + dy * dy
    if (dist < minDist) {
      minDist = dist
      closest = point
    }
  }
  
  return { x: closest.x, y: closest.y }
}

const onCanvasMouseMove = (event) => {
  if (isDragging.value) {
    const dx = event.clientX - dragStart.value.x
    const dy = event.clientY - dragStart.value.y
    battleMapStore.panCamera(dx, dy)
    dragStart.value = { x: event.clientX, y: event.clientY }
    renderAll()
    return
  }
  
  // Перетаскивание токена (мастером)
  if (isDraggingToken.value && draggingToken.value) {
    const rect = event.target.getBoundingClientRect()
    const canvasX = event.clientX - rect.left
    const canvasY = event.clientY - rect.top
    const worldPos = canvasToWorld(canvasX, canvasY, camera.value)
    
    // Обновляем позицию токена (с учётом смещения)
    draggingToken.value.pixelX = worldPos.x - dragTokenOffset.value.x
    draggingToken.value.pixelY = worldPos.y - dragTokenOffset.value.y
    
    renderUI()
    return
  }
  
  const hex = getMouseHex(event)
  if (hex) {
    hoveredHex.value = hex
    
    // Обновляем превью выделения при перетаскивании
    if (isSelecting.value && selectionStart.value && selectionManager.value) {
      updateSelectionPreview(hex, event)
    }
    
    // Рисование с зажатой кнопкой (только в режиме paint/erase)
    if (isPainting.value && editingMap.value && editorMode.value !== 'select') {
      applyTool(hex)
    }
  } else {
    hoveredHex.value = null
  }
  
  // Определяем токен под курсором
  const rect = event.target.getBoundingClientRect()
  const canvasX = event.clientX - rect.left
  const canvasY = event.clientY - rect.top
  const worldPos = canvasToWorld(canvasX, canvasY, camera.value)
  const tokenUnderCursor = findTokenAtPoint(worldPos.x, worldPos.y, mapTokens.value, tokenSize.value)
  
  if (tokenUnderCursor !== hoveredToken.value) {
    hoveredToken.value = tokenUnderCursor
  }
  
  renderUI()
}

// Touch события для мобильных устройств


const onCanvasMouseDown = (event) => {
  // Закрываем открытые dropdown при клике на canvas
  showMapList.value = false
  showTerrainPalette.value = false
  showSelectionPanel.value = false
  
  if (event.button === 1 || (event.button === 0 && event.shiftKey)) {
    // Middle click or Shift+Left click for panning
    isDragging.value = true
    dragStart.value = { x: event.clientX, y: event.clientY }
    event.preventDefault()
    return
  }
  
  // Мастер может перетаскивать токены
  if (event.button === 0 && hoveredToken.value && isMaster.value) {
    isDraggingToken.value = true
    draggingToken.value = hoveredToken.value
    selectedToken.value = hoveredToken.value
    emit('token-selected', hoveredToken.value)
    
    // Вычисляем смещение курсора от центра токена
    const rect = event.target.getBoundingClientRect()
    const canvasX = event.clientX - rect.left
    const canvasY = event.clientY - rect.top
    const worldPos = canvasToWorld(canvasX, canvasY, camera.value)
    
    dragTokenOffset.value = {
      x: worldPos.x - hoveredToken.value.pixelX,
      y: worldPos.y - hoveredToken.value.pixelY
    }
    
    event.preventDefault()
    return
  }
  
  // Клик по токену (не мастер) - выделяем его или выбираем как цель
  if (event.button === 0 && hoveredToken.value) {
    // В мобильном режиме с активным действием - выбираем цель
    if (props.mobileMode && props.pendingAction && (props.pendingAction.id === 'attack' || props.pendingAction.id === 'skill')) {
      emit('action-target-selected', hoveredToken.value)
      return
    }
    
    if (selectedToken.value?.characterId === hoveredToken.value.characterId) {
      // Повторный клик - снимаем выделение
      selectedToken.value = null
      emit('token-selected', null)
    } else {
      selectedToken.value = hoveredToken.value
      emit('token-selected', hoveredToken.value)
    }
    renderUI()
    return
  }
  
  // Клик в пустое место
  if (event.button === 0 && !hoveredToken.value) {
    // В мобильном режиме с активным действием движения - выбираем гекс
    if (props.mobileMode && props.pendingAction && props.pendingAction.id === 'move' && hoveredHex.value) {
      emit('action-target-selected', { type: 'hex', hex: getHexWithTerrain(hoveredHex.value) })
      return
    }
    
    // Сообщаем о выбранном гексе (для мобильной инфокарточки)
    if (hoveredHex.value) {
      emit('hex-selected', getHexWithTerrain(hoveredHex.value))
    }
    
    // Снимаем выделение токена
    if (selectedToken.value) {
      selectedToken.value = null
      emit('token-selected', null)
      renderUI()
    }
  }
  
  // В readonly режиме разрешаем только навигацию и выделение токенов
  if (isReadonly.value) return
  
  if (event.button === 0 && hoveredHex.value && editingMap.value) {
    if (editorMode.value === 'select') {
      // Начинаем выделение с привязкой к ближайшей точке (центр или угол)
      isSelecting.value = true
      selectionStart.value = { ...hoveredHex.value }
      
      // Вычисляем точку привязки в пикселях
      const snapPoint = getSnapPoint(event)
      selectionStartPixel.value = snapPoint
      
      selectionPreview.value = [{ ...hoveredHex.value }]
    } else if (editorMode.value === 'token') {
      // В режиме токенов - выбираем гекс для размещения
      selectedHexes.value.clear()
      selectedHexes.value.add(`${hoveredHex.value.q},${hoveredHex.value.r}`)
      renderUI()
    } else {
      // Left click - apply tool (paint/erase)
      isPainting.value = true
      applyTool(hoveredHex.value)
    }
  }
}

const onCanvasMouseUp = (event) => {
  // Завершение перетаскивания токена
  if (isDraggingToken.value && draggingToken.value && hexGrid.value && activeMap.value) {
    // Привязываем токен к ближайшему гексу
    const targetHex = hexGrid.value.pixelToHex(draggingToken.value.pixelX, draggingToken.value.pixelY)
    
    // Получаем текущую позицию токена
    const fromQ = draggingToken.value.q
    const fromR = draggingToken.value.r
    
    // Перемещаем токен через стор (это обновит данные и вызовет перерисовку)
    if (fromQ !== targetHex.q || fromR !== targetHex.r) {
      const success = battleMapStore.moveToken(activeMap.value.id, fromQ, fromR, targetHex.q, targetHex.r)
      
      if (success) {
        // Синхронизируем с игроками (отправляем обновление карты)
        sessionStore.broadcastMapTokenMove(activeMap.value.id, draggingToken.value.characterId, targetHex.q, targetHex.r)
      } else {
        console.warn('Failed to move token - target hex may be occupied')
      }
    }
    
    isDraggingToken.value = false
    draggingToken.value = null
    dragTokenOffset.value = { x: 0, y: 0 }
    
    renderUI()
    return
  }
  
  if (isSelecting.value && selectionStart.value && hoveredHex.value) {
    // Завершаем выделение и применяем его
    applySelection()
  }
  
  isDragging.value = false
  isPainting.value = false
  isSelecting.value = false
  selectionStart.value = null
  selectionStartPixel.value = null
  selectionPreview.value = []
  
  renderUI()
}

const onCanvasMouseLeave = () => {
  hoveredHex.value = null
  hoveredToken.value = null
  isDragging.value = false
  isPainting.value = false
  
  // При выходе за пределы - отменяем перетаскивание токена
  if (isDraggingToken.value) {
    isDraggingToken.value = false
    draggingToken.value = null
    dragTokenOffset.value = { x: 0, y: 0 }
  }
  
  // При выходе за пределы - отменяем выделение
  if (isSelecting.value) {
    isSelecting.value = false
    selectionStart.value = null
    selectionStartPixel.value = null
    selectionPreview.value = []
  }
  
  renderUI()
}

const onCanvasWheel = (event) => {
  event.preventDefault()
  
  // Зум относительно позиции курсора
  const rect = uiCanvas.value.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  
  const oldZoom = camera.value.zoom
  const delta = event.deltaY > 0 ? 0.9 : 1.1
  const newZoom = Math.max(0.25, Math.min(4, oldZoom * delta))
  
  // Сохраняем позицию под курсором
  const worldX = (mouseX - camera.value.x) / oldZoom
  const worldY = (mouseY - camera.value.y) / oldZoom
  
  battleMapStore.$patch({
    camera: {
      x: mouseX - worldX * newZoom,
      y: mouseY - worldY * newZoom,
      zoom: newZoom
    }
  })
  
  renderAll()
}

const applyTool = (hex) => {
  if (!editingMap.value) return
  
  if (editorMode.value === 'paint') {
    battleMapStore.setHexTerrain(editingMap.value.id, hex.q, hex.r, selectedTerrain.value)
    renderTerrain()
    renderGrid()
  } else if (editorMode.value === 'erase') {
    // Удаляем гекс из карты
    const map = activeMap.value
    const terrainLayer = map?.layers.find(l => l.type === LAYER_TYPES.TERRAIN)
    if (terrainLayer) {
      const key = hexKey(hex.q, hex.r)
      terrainLayer.data.delete(key)
      map.updatedAt = Date.now()
      renderTerrain()
      renderGrid()
    }
  }
}

// ===== ФУНКЦИИ ВЫДЕЛЕНИЯ =====

const updateSelectionPreview = (endHex, event = null) => {
  if (!selectionManager.value || !selectionStartPixel.value) return
  
  const shape = selection.value.shape
  const behavior = selection.value.behavior
  const lineWidth = selection.value.lineWidth
  
  // Получаем террейн слой для проверки существующих гексов
  const map = activeMap.value
  const terrainLayer = map?.layers.find(l => l.type === LAYER_TYPES.TERRAIN)
  const existingHexes = terrainLayer ? terrainLayer.data : new Map()
  
  // Получаем конечную точку в пикселях (с привязкой к snap point)
  const endPixel = event ? (getSnapPoint(event) || getMouseWorld(event)) : null
  if (!endPixel) return
  
  let previewHexes = []
  
  switch (shape) {
    case SELECTION_SHAPES.RECTANGLE:
      previewHexes = selectionManager.value.calculateRectanglePreviewPixel(
        selectionStartPixel.value, endPixel, existingHexes, behavior
      )
      break
    case SELECTION_SHAPES.CIRCLE:
      previewHexes = selectionManager.value.calculateCirclePreviewPixel(
        selectionStartPixel.value, endPixel, existingHexes, behavior
      )
      break
    case SELECTION_SHAPES.HEXAGON:
      // Для шестиугольника используем hex-расстояние от начального гекса
      previewHexes = selectionManager.value.calculateHexagonPreviewPixel(
        selectionStartPixel.value, endPixel, existingHexes, behavior
      )
      break
    case SELECTION_SHAPES.LINE:
      previewHexes = selectionManager.value.calculateLinePreviewPixel(
        selectionStartPixel.value, endPixel, lineWidth, existingHexes, behavior
      )
      break
  }
  
  selectionPreview.value = previewHexes
}

const applySelection = () => {
  if (selectionPreview.value.length === 0) return
  
  const mode = selection.value.mode
  const newSelection = new Set(selectedHexes.value)
  
  selectionPreview.value.forEach(hex => {
    const key = hexKey(hex.q, hex.r)
    
    switch (mode) {
      case SELECTION_MODES.REPLACE:
        // Очищаем при первом добавлении
        if (newSelection.size === selectedHexes.value.size) {
          newSelection.clear()
        }
        newSelection.add(key)
        break
      case SELECTION_MODES.ADD:
        newSelection.add(key)
        break
      case SELECTION_MODES.SUBTRACT:
        newSelection.delete(key)
        break
    }
  })
  
  // В режиме REPLACE - просто заменяем
  if (mode === SELECTION_MODES.REPLACE) {
    selectedHexes.value = new Set(selectionPreview.value.map(h => hexKey(h.q, h.r)))
  } else {
    selectedHexes.value = newSelection
  }
}

const clearSelection = () => {
  selectedHexes.value = new Set()
  renderUI()
}

const fillSelection = () => {
  if (selectedHexes.value.size === 0 || !editingMap.value) return
  
  selectedHexes.value.forEach(key => {
    const [q, r] = key.split(',').map(Number)
    battleMapStore.setHexTerrain(editingMap.value.id, q, r, selectedTerrain.value)
  })
  
  renderTerrain()
  renderGrid()
}

const deleteSelection = () => {
  if (selectedHexes.value.size === 0 || !activeMap.value) return
  
  const terrainLayer = activeMap.value.layers.find(l => l.type === LAYER_TYPES.TERRAIN)
  if (!terrainLayer) return
  
  selectedHexes.value.forEach(key => {
    terrainLayer.data.delete(key)
  })
  
  activeMap.value.updatedAt = Date.now()
  clearSelection()
  renderTerrain()
  renderGrid()
}

// ===== TOUCH ОБРАБОТЧИКИ =====

// Touch состояние
const touchState = ref({
  touches: [],
  lastTap: null,
  isMultiTouch: false,
  isPanning: false,
  wasZooming: false, // Флаг "был зум" чтобы не начинать пан после отпускания одного пальца
  initialDistance: 0,
  initialZoom: 1
})

// ===== LONG PRESS + FACING PICKER =====

// Состояние для long press и выбора направления
const longPressState = ref({
  isActive: false,           // Идёт ли long press
  timer: null,               // Таймер для отслеживания long press
  startPos: null,            // Начальная позиция пальца { x, y }
  targetHex: null,           // Гекс, на который игрок хочет переместиться
  showFacingPicker: false,   // Показывать ли UI выбора направления
  previewFacing: null,       // Превью направления (0-11, где 0-5 основные, 6-11 промежуточные)
  originalFacing: 0,         // Исходное направление персонажа до перемещения
  isDraggingFacing: false,   // Перетаскивает ли палец для выбора направления
  movedToHex: false,         // Персонаж уже перемещён на гекс (ждём только выбор направления)
  isRotateInPlace: false     // Режим поворота на месте (long press на своём токене)
})

const LONG_PRESS_DURATION = 400 // ms для активации long press
const FACING_PICKER_RADIUS = 80 // Радиус кольца с направлениями
const FACING_DEAD_ZONE = 25 // Радиус "мёртвой зоны" в центре (сохраняет старое направление)

// Ширина секторов для основных и промежуточных направлений
const MAIN_SECTOR_WIDTH = 45 // градусов для основных направлений (на углы гекса)
const SECONDARY_SECTOR_WIDTH = 15 // градусов для промежуточных направлений

/**
 * Проверить, является ли направление основным (на угол гекса) для текущей ориентации карты
 * Pointy-top: основные на 0°, 60°, 120°, 180°, 240°, 300° (facing12: 0, 2, 4, 6, 8, 10) - чётные
 * Flat-top: основные на 90°, 150°, 210°, 270°, 330°, 30° (facing12: 3, 5, 7, 9, 11, 1) - нечётные
 */
const isMainDirection = (facing12) => {
  const map = activeMap.value
  if (!map) return facing12 % 2 === 0 // По умолчанию pointy-top
  
  if (map.orientation === HEX_ORIENTATIONS.POINTY) {
    return facing12 % 2 === 0 // 0, 2, 4, 6, 8, 10 (0°, 60°, 120°...)
  } else {
    return facing12 % 2 === 1 // 1, 3, 5, 7, 9, 11 (30°, 90°, 150°...)
  }
}

/**
 * Получить индекс направления (0-11) по углу с учётом разной ширины секторов
 * В системе экрана: 0° = вправо, по часовой стрелке (90° = вниз)
 * 
 * facing12 - это логический индекс направления (0-11), НЕ зависящий от ориентации карты.
 * При отрисовке токен-рендерер добавляет facingOffset (0 для pointy, 90 для flat).
 * 
 * Pointy-top (offset=0): facing 0 = 0° (вправо), facing 3 = 90° (вниз), facing 6 = 180° (влево), facing 9 = 270° (вверх)
 * Flat-top (offset=90): facing 0 + 90° = 90° (вниз), facing 3 + 90° = 180° (влево), и т.д.
 * 
 * Основные направления (вершины гекса):
 * Pointy-top: 0, 2, 4, 6, 8, 10 (каждые 60°)
 * Flat-top: 1, 3, 5, 7, 9, 11 (каждые 60°, со сдвигом на 30°)
 */
const getFacingFromAngle = (angleDeg) => {
  // Входной угол в стандартной системе: 0° = вправо, по часовой
  // Система токенов: 0° = вверх, по часовой
  // Конвертируем: вверх в стандартной системе это -90° (или 270°)
  // Так что угол_токена = угол_экрана + 90
  
  // Нормализуем угол к 0-360
  let normalized = ((angleDeg % 360) + 360) % 360
  
  // Переводим в систему токена (0° = вверх)
  let tokenAngle = (normalized + 90) % 360
  
  const map = activeMap.value
  const isPointy = map && map.orientation === HEX_ORIENTATIONS.POINTY
  
  // facingOffset для ориентации карты (0 для pointy, 90 для flat)
  // В flat-top гекс повёрнут на 90°, поэтому facing 0 указывает на 90° (вниз в системе токена)
  const facingOffset = isPointy ? 0 : 90
  
  // Переводим экранный угол в логический facing угол (без offset)
  let logicalAngle = (tokenAngle - facingOffset + 360) % 360
  
  // DEBUG
  console.log(`  getFacingFromAngle: screen=${normalized.toFixed(1)}°, token=${tokenAngle.toFixed(1)}°, offset=${facingOffset}, logical=${logicalAngle.toFixed(1)}°`)
  
  // Находим ближайшее направление простым делением
  const nearestFacing = Math.round(logicalAngle / 30) % 12
  
  // Проверяем попадает ли угол в сектор ближайшего направления
  const isMain = isMainDirection(nearestFacing)
  const halfWidth = isMain ? MAIN_SECTOR_WIDTH / 2 : SECONDARY_SECTOR_WIDTH / 2
  const facingAngle = nearestFacing * 30
  
  let dist = Math.abs(logicalAngle - facingAngle)
  if (dist > 180) dist = 360 - dist
  
  if (dist <= halfWidth) {
    return nearestFacing
  }
  
  // Если не попали в ближайший сектор (он узкий промежуточный),
  // проверяем соседние основные направления
  const prevFacing = (nearestFacing - 1 + 12) % 12
  const nextFacing = (nearestFacing + 1) % 12
  
  // Проверяем предыдущее направление
  if (isMainDirection(prevFacing)) {
    const prevAngle = prevFacing * 30
    let prevDist = Math.abs(logicalAngle - prevAngle)
    if (prevDist > 180) prevDist = 360 - prevDist
    if (prevDist <= MAIN_SECTOR_WIDTH / 2) {
      return prevFacing
    }
  }
  
  // Проверяем следующее направление
  if (isMainDirection(nextFacing)) {
    const nextAngle = nextFacing * 30
    let nextDist = Math.abs(logicalAngle - nextAngle)
    if (nextDist > 180) nextDist = 360 - nextDist
    if (nextDist <= MAIN_SECTOR_WIDTH / 2) {
      return nextFacing
    }
  }
  
  // Fallback - возвращаем ближайшее
  return nearestFacing
}

/**
 * Конвертировать 12-направление в 6-направление (для сохранения facing)
 * Промежуточные направления округляются к ближайшему основному
 * 
 * Pointy-top: основные 0, 2, 4, 6, 8, 10 → facing6 0, 1, 2, 3, 4, 5
 * Flat-top: основные 3, 5, 7, 9, 11, 1 → facing6 0, 1, 2, 3, 4, 5 (начиная с 90°)
 */
const facing12to6 = (facing12) => {
  const map = activeMap.value
  const isPointy = map && map.orientation === HEX_ORIENTATIONS.POINTY
  
  if (isPointy) {
    // Pointy-top: 0,1→0; 2,3→1; 4,5→2; 6,7→3; 8,9→4; 10,11→5
    return Math.floor((facing12 + 1) / 2) % 6
  } else {
    // Flat-top: основные на 90°, 150°, 210°, 270°, 330°, 30° (facing12: 3, 5, 7, 9, 11, 1)
    // Нужно сдвинуть так чтобы: 2,3,4→0 (90°); 4,5,6→1 (150°); и т.д.
    // Но проще: сдвигаем на -3 (чтобы 3 стало 0), потом делим
    const shifted = (facing12 - 3 + 12) % 12
    return Math.floor((shifted + 1) / 2) % 6
  }
}

/**
 * Получить угол в градусах для направления (0-11)
 */
const getFacingAngle = (facing12) => {
  return facing12 * 30
}

/**
 * Начать long press
 * @param {number} x - координата X пальца
 * @param {number} y - координата Y пальца  
 * @param {Object} hex - целевой гекс
 * @param {boolean} isOwnToken - long press на своём токене (поворот на месте)
 */
const startLongPress = (x, y, hex, isOwnToken = false) => {
  // Отменяем предыдущий таймер
  cancelLongPress()
  
  longPressState.value.startPos = { x, y }
  longPressState.value.targetHex = hex
  longPressState.value.isRotateInPlace = isOwnToken
  
  // Запускаем таймер
  longPressState.value.timer = setTimeout(() => {
    activateFacingPicker(isOwnToken)
  }, LONG_PRESS_DURATION)
}

/**
 * Отменить long press (палец сдвинулся или отпущен раньше времени)
 */
const cancelLongPress = () => {
  if (longPressState.value.timer) {
    clearTimeout(longPressState.value.timer)
    longPressState.value.timer = null
  }
  longPressState.value.isActive = false
}

/**
 * Полностью сбросить состояние long press и facing picker
 */
const resetLongPressState = () => {
  cancelLongPress()
  longPressState.value = {
    isActive: false,
    timer: null,
    startPos: null,
    targetHex: null,
    showFacingPicker: false,
    previewFacing: null,
    originalFacing: 0,
    isDraggingFacing: false,
    movedToHex: false,
    isRotateInPlace: false
  }
  renderUI()
}

/**
 * Активировать picker направления после long press
 * @param {boolean} isRotateInPlace - режим поворота на месте (long press на своём токене)
 */
const activateFacingPicker = (isRotateInPlace = false) => {
  const hex = longPressState.value.targetHex
  if (!hex) return
  
  // Проверяем что это режим игрока
  if (!props.mobileMode) return
  
  longPressState.value.isActive = true
  longPressState.value.showFacingPicker = true
  longPressState.value.isDraggingFacing = true // Палец ещё на экране
  longPressState.value.isRotateInPlace = isRotateInPlace
  
  // Сохраняем текущее направление персонажа
  const playerToken = mapTokens.value.find(t => t.character?.ownerId === userStore.userId)
  longPressState.value.originalFacing = playerToken?.facing || 0
  longPressState.value.previewFacing = longPressState.value.originalFacing // Уже 12 направлений
  
  if (!isRotateInPlace) {
    // Перемещаем персонажа на целевой гекс (визуально и в данных)
    emit('hex-long-press-move', { 
      hex: getHexWithTerrain(hex),
      facing: longPressState.value.originalFacing 
    })
    longPressState.value.movedToHex = true
  }
  
  // Вибрация для тактильной обратной связи (если поддерживается)
  if (navigator.vibrate) {
    navigator.vibrate(50)
  }
  
  renderUI()
}

/**
 * Обновить превью направления на основе позиции пальца
 */
const updateFacingPreview = (x, y) => {
  if (!longPressState.value.showFacingPicker || !longPressState.value.targetHex) return
  
  const hex = longPressState.value.targetHex
  const grid = hexGrid.value
  if (!grid) return
  
  // Центр целевого гекса в пикселях экрана
  const hexCenter = grid.hexToPixel(hex.q, hex.r)
  const screenPos = worldToCanvas(hexCenter.x, hexCenter.y)
  
  // Вектор от центра гекса к пальцу
  const dx = x - screenPos.x
  const dy = y - screenPos.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  // Если палец в мёртвой зоне - сохраняем исходное направление
  if (distance < FACING_DEAD_ZONE) {
    longPressState.value.previewFacing = longPressState.value.originalFacing
    renderUI()
    return
  }
  
  // Вычисляем угол
  // atan2(dy, dx) даёт угол от оси X (вправо)
  // Стандартная система: 0° = вправо, положительные углы по часовой стрелке (на экране Y вниз)
  let angle = Math.atan2(dy, dx) * 180 / Math.PI
  // Нормализуем к 0-360
  if (angle < 0) angle += 360
  
  // Получаем направление (0-11)
  const facing12 = getFacingFromAngle(angle)
  
  // DEBUG
  console.log(`Angle: ${angle.toFixed(1)}° → facing12: ${facing12} (screen: ${facing12 * 30}°)`)
  
  longPressState.value.previewFacing = facing12
  
  renderUI()
}

/**
 * Завершить выбор направления
 */
const confirmFacing = () => {
  if (!longPressState.value.showFacingPicker) return
  
  const facing12 = longPressState.value.previewFacing
  // Отправляем facing12 напрямую (0-11), без конвертации в 6
  const finalFacing = facing12 !== null ? facing12 : (longPressState.value.originalFacing || 0)
  
  if (longPressState.value.isRotateInPlace) {
    // Режим поворота на месте - отправляем событие token-rotate
    emit('token-rotate', {
      facing: finalFacing
    })
  } else {
    // Режим перемещения - отправляем событие с финальным facing
    emit('hex-long-press-confirm', {
      hex: longPressState.value.targetHex,
      facing: finalFacing
    })
  }
  
  resetLongPressState()
}

/**
 * Конвертация мировых координат в canvas-координаты
 */
const worldToCanvas = (worldX, worldY) => {
  return {
    x: worldX * camera.value.zoom + camera.value.x,
    y: worldY * camera.value.zoom + camera.value.y
  }
}

/**
 * Нарисовать UI для выбора направления (facing picker)
 * Рисуется в screen-координатах поверх карты
 */
const drawFacingPicker = (ctx) => {
  const hex = longPressState.value.targetHex
  const grid = hexGrid.value
  if (!hex || !grid) return
  
  // Получаем токен игрока для отображения портрета и защиты
  const playerToken = mapTokens.value.find(t => t.character?.ownerId === userStore.userId)
  const character = playerToken?.character
  
  // Центр целевого гекса в мировых координатах
  const hexCenterWorld = grid.hexToPixel(hex.q, hex.r)
  // Конвертируем в screen-координаты
  const center = worldToCanvas(hexCenterWorld.x, hexCenterWorld.y)
  
  const portraitRadius = 35 // Радиус портрета в центре
  const outerRadius = FACING_PICKER_RADIUS
  const previewFacing = longPressState.value.previewFacing
  
  // Определяем facingOffset для текущей ориентации карты
  const map = activeMap.value
  const isPointy = map && map.orientation === HEX_ORIENTATIONS.POINTY
  const facingOffset = isPointy ? 0 : 90
  
  // Текущий preview rotation (для защиты) - логический угол + facingOffset
  const currentFacing = previewFacing !== null ? previewFacing : longPressState.value.originalFacing
  const previewRotation = currentFacing * 30 + facingOffset
  
  // 1. Затемнённый фон (полупрозрачный круг)
  ctx.beginPath()
  ctx.arc(center.x, center.y, outerRadius + 30, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
  ctx.fill()
  
  // 2. Внешнее кольцо
  ctx.beginPath()
  ctx.arc(center.x, center.y, outerRadius, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'
  ctx.lineWidth = 2
  ctx.stroke()
  
  // 3. Рисуем 12 направлений с разной шириной секторов
  for (let i = 0; i < 12; i++) {
    const logicalAngle = i * 30 // Логический угол направления (в системе токена: 0° = вверх)
    const tokenAngle = logicalAngle + facingOffset // Угол в системе токена с учётом ориентации карты
    // Для отрисовки: система токена имеет 0° = вверх, а canvas использует 0° = вправо
    // Так что rad = (tokenAngle - 90) * PI / 180
    const rad = (tokenAngle - 90) * Math.PI / 180
    
    const isMain = isMainDirection(i)
    const isSelected = previewFacing === i
    
    // Ширина сектора в зависимости от типа
    const sectorWidth = isMain ? MAIN_SECTOR_WIDTH : SECONDARY_SECTOR_WIDTH
    
    // Позиция иконки направления
    const iconRadius = outerRadius - 15
    
    // Подсветка выбранного сектора
    if (isSelected) {
      const halfSector = sectorWidth / 2
      const sectorStart = (tokenAngle - 90 - halfSector) * Math.PI / 180
      const sectorEnd = (tokenAngle - 90 + halfSector) * Math.PI / 180
      
      ctx.beginPath()
      ctx.moveTo(center.x, center.y)
      ctx.arc(center.x, center.y, outerRadius, sectorStart, sectorEnd)
      ctx.closePath()
      ctx.fillStyle = 'rgba(250, 204, 21, 0.3)'
      ctx.fill()
    }
    
    // Треугольник направления
    const tipRadius = isMain ? iconRadius + 10 : iconRadius + 4
    const baseRadius = isMain ? iconRadius - 10 : iconRadius - 4
    const halfAngle = isMain ? 15 : 6
    
    const tip = {
      x: center.x + Math.cos(rad) * tipRadius,
      y: center.y + Math.sin(rad) * tipRadius
    }
    const baseLeft = {
      x: center.x + Math.cos(rad - halfAngle * Math.PI / 180) * baseRadius,
      y: center.y + Math.sin(rad - halfAngle * Math.PI / 180) * baseRadius
    }
    const baseRight = {
      x: center.x + Math.cos(rad + halfAngle * Math.PI / 180) * baseRadius,
      y: center.y + Math.sin(rad + halfAngle * Math.PI / 180) * baseRadius
    }
    
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(baseLeft.x, baseLeft.y)
    ctx.lineTo(baseRight.x, baseRight.y)
    ctx.closePath()
    
    const alpha = isSelected ? 1 : (isMain ? 0.7 : 0.35)
    
    if (isSelected) {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.95)'
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
    } else {
      ctx.fillStyle = `rgba(148, 163, 184, ${alpha})`
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'
    }
    ctx.fill()
    ctx.lineWidth = 1
    ctx.stroke()
  }
  
  // 4. Защита персонажа (вращается с preview facing)
  if (playerToken && (playerToken.meleeDefence || playerToken.rangedDefence)) {
    drawDefence(
      ctx, 
      center.x, 
      center.y, 
      portraitRadius, 
      playerToken.meleeDefence, 
      playerToken.rangedDefence, 
      previewRotation, 
      { bothSides: true }
    )
  }
  
  // 5. Портрет персонажа в центре
  if (character) {
    drawPortrait(ctx, center.x, center.y, portraitRadius, character.portrait, character.name)
  } else {
    // Fallback - просто круг
    ctx.beginPath()
    ctx.arc(center.x, center.y, portraitRadius, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(30, 41, 59, 0.9)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // Иконка поворота
    ctx.font = '16px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)'
    ctx.fillText('↻', center.x, center.y)
  }
}

const onCanvasTouchStart = (event) => {
  event.preventDefault()
  const touches = Array.from(event.touches)
  touchState.value.touches = touches
  touchState.value.isMultiTouch = touches.length > 1

  if (touches.length === 1) {
    // Один палец - подготовка к пану, тапу или long press
    const touch = touches[0]
    touchState.value.lastTap = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    }
    touchState.value.isPanning = false
    
    // Проверяем можно ли начать long press (только в мобильном режиме)
    if (props.mobileMode) {
      const rect = event.target.getBoundingClientRect()
      const canvasX = touch.clientX - rect.left
      const canvasY = touch.clientY - rect.top
      const worldPos = canvasToWorld(canvasX, canvasY, camera.value)
      
      if (hexGrid.value) {
        const hex = hexGrid.value.pixelToHex(worldPos.x, worldPos.y)
        const tokenAtHex = findTokenAtPoint(worldPos.x, worldPos.y, mapTokens.value, tokenSize.value)
        
        // Long press для свободных гексов (перемещение с выбором направления)
        // или для своего токена (поворот на месте)
        if (hex) {
          const isOwnToken = tokenAtHex && tokenAtHex.character?.ownerId === userStore.userId
          if (!tokenAtHex || isOwnToken) {
            startLongPress(touch.clientX, touch.clientY, hex, isOwnToken)
          }
        }
      }
    }
  } else if (touches.length === 2) {
    // Два пальца - начало щипка для зума
    // Отменяем long press
    cancelLongPress()
    
    const touch1 = touches[0]
    const touch2 = touches[1]
    const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)
    
    touchState.value.initialDistance = distance
    touchState.value.initialZoom = camera.value.zoom
    touchState.value.isPanning = false
    touchState.value.wasZooming = true // Отмечаем что был зум
  }
}

const onCanvasTouchMove = (event) => {
  event.preventDefault()
  const touches = Array.from(event.touches)
  touchState.value.touches = touches

  // Если активен facing picker - обрабатываем движение пальца для выбора направления
  if (longPressState.value.showFacingPicker && touches.length === 1) {
    const touch = touches[0]
    updateFacingPreview(touch.clientX, touch.clientY)
    return // Не обрабатываем другие жесты
  }

  if (touches.length === 1 && !touchState.value.isMultiTouch && !touchState.value.wasZooming) {
    // Один палец - пан (только если не было зума)
    const touch = touches[0]
    
    // Проверяем движение для отмены long press
    if (longPressState.value.timer && touchState.value.lastTap) {
      const dx = touch.clientX - touchState.value.lastTap.x
      const dy = touch.clientY - touchState.value.lastTap.y
      const distance = Math.hypot(dx, dy)
      
      // Отменяем long press если палец сдвинулся больше чем на 10px
      if (distance > 10) {
        cancelLongPress()
      }
    }
    
    if (touchState.value.lastTap && !touchState.value.isPanning) {
      const dx = touch.clientX - touchState.value.lastTap.x
      const dy = touch.clientY - touchState.value.lastTap.y
      const distance = Math.hypot(dx, dy)
      
      // Начинаем пан если палец сдвинулся больше чем на 10px
      if (distance > 10) {
        touchState.value.isPanning = true
        cancelLongPress() // Если начался пан - отменяем long press
      }
    }
    
    if (touchState.value.isPanning && touchState.value.lastTap) {
      const dx = touch.clientX - touchState.value.lastTap.x
      const dy = touch.clientY - touchState.value.lastTap.y
      
      battleMapStore.$patch({
        camera: {
          x: camera.value.x + dx,
          y: camera.value.y + dy,
          zoom: camera.value.zoom
        }
      })
      
      touchState.value.lastTap = { x: touch.clientX, y: touch.clientY, time: Date.now() }
      renderAll()
    }
  } else if (touches.length === 2) {
    // Два пальца - зум щипком
    cancelLongPress() // Отменяем long press при зуме
    
    const touch1 = touches[0]
    const touch2 = touches[1]
    const currentDistance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)
    
    if (touchState.value.initialDistance > 0) {
      const zoomFactor = currentDistance / touchState.value.initialDistance
      const newZoom = Math.max(0.25, Math.min(4, touchState.value.initialZoom * zoomFactor))
      
      // Центр щипка
      const centerX = (touch1.clientX + touch2.clientX) / 2
      const centerY = (touch1.clientY + touch2.clientY) / 2
      
      const rect = uiCanvas.value.getBoundingClientRect()
      const canvasX = centerX - rect.left
      const canvasY = centerY - rect.top
      
      // Зум относительно центра щипка
      const worldX = (canvasX - camera.value.x) / camera.value.zoom
      const worldY = (canvasY - camera.value.y) / camera.value.zoom
      
      battleMapStore.$patch({
        camera: {
          x: canvasX - worldX * newZoom,
          y: canvasY - worldY * newZoom,
          zoom: newZoom
        }
      })
      
      renderAll()
    }
  }
  
  // Обновляем hover для одного пальца
  if (touches.length === 1 && !touchState.value.isPanning) {
    const touch = touches[0]
    const rect = event.target.getBoundingClientRect()
    const canvasX = touch.clientX - rect.left
    const canvasY = touch.clientY - rect.top
    const worldPos = canvasToWorld(canvasX, canvasY, camera.value)
    
    // Обновляем hoveredHex
    if (hexGrid.value) {
      const hex = hexGrid.value.pixelToHex(worldPos.x, worldPos.y)
      hoveredHex.value = hex
    }
    
    // Обновляем hoveredToken
    const tokenUnderFinger = findTokenAtPoint(worldPos.x, worldPos.y, mapTokens.value, tokenSize.value)
    if (tokenUnderFinger !== hoveredToken.value) {
      hoveredToken.value = tokenUnderFinger
    }
    
    renderUI()
  }
}

const onCanvasTouchEnd = (event) => {
  event.preventDefault()
  const touches = Array.from(event.touches)
  touchState.value.touches = touches

  // Если остались касания, обновляем состояние
  if (touches.length > 0) {
    touchState.value.isMultiTouch = touches.length > 1
    return
  }

  // Если активен facing picker - подтверждаем выбор направления
  if (longPressState.value.showFacingPicker) {
    confirmFacing()
    // Сбрасываем touch состояние
    touchState.value.touches = []
    touchState.value.lastTap = null
    touchState.value.isMultiTouch = false
    touchState.value.isPanning = false
    touchState.value.wasZooming = false
    touchState.value.initialDistance = 0
    touchState.value.initialZoom = 1
    return
  }

  // Отменяем long press если он ещё не активировался
  cancelLongPress()

  // Все пальцы убраны - проверяем тап
  if (!touchState.value.isPanning && touchState.value.lastTap) {
    const timeDiff = Date.now() - touchState.value.lastTap.time
    
    // Если время меньше 300ms - это тап
    if (timeDiff < 300) {
      const rect = event.target.getBoundingClientRect()
      const canvasX = touchState.value.lastTap.x - rect.left
      const canvasY = touchState.value.lastTap.y - rect.top
      const worldPos = canvasToWorld(canvasX, canvasY, camera.value)
      
      // Находим что под пальцем
      let hex = null
      if (hexGrid.value) {
        hex = hexGrid.value.pixelToHex(worldPos.x, worldPos.y)
        hoveredHex.value = hex
      }
      
      const tokenUnderFinger = findTokenAtPoint(worldPos.x, worldPos.y, mapTokens.value, tokenSize.value)
      hoveredToken.value = tokenUnderFinger
      
      // Обрабатываем тап как клик
      handleTouchTap(tokenUnderFinger, hex)
    }
  }

  // Сбрасываем touch состояние
  touchState.value.touches = []
  touchState.value.lastTap = null
  touchState.value.isMultiTouch = false
  touchState.value.isPanning = false
  touchState.value.wasZooming = false
  touchState.value.initialDistance = 0
  touchState.value.initialZoom = 1
  
  renderUI()
}

const handleTouchTap = (token, hex) => {
  // Логика обработки тапа такая же как в onCanvasMouseDown
  
  // Тап по токену
  if (token) {
    // В мобильном режиме с активным действием - выбираем цель
    if (props.mobileMode && props.pendingAction && (props.pendingAction.id === 'attack' || props.pendingAction.id === 'skill')) {
      emit('action-target-selected', token)
      return
    }
    
    if (selectedToken.value?.characterId === token.characterId) {
      // Повторный тап - снимаем выделение
      selectedToken.value = null
      emit('token-selected', null)
    } else {
      selectedToken.value = token
      emit('token-selected', token)
    }
    renderUI()
    return
  }
  
  // Тап в пустое место
  if (!token) {
    // В мобильном режиме с активным действием движения - выбираем гекс
    if (props.mobileMode && props.pendingAction && props.pendingAction.id === 'move' && hex) {
      emit('action-target-selected', { type: 'hex', hex: getHexWithTerrain(hex) })
      return
    }
    
    // Проверяем двойной тап по тому же гексу
    if (hex && props.mobileMode) {
      const now = Date.now()
      const last = lastSelectedHex.value
      
      if (last && last.q === hex.q && last.r === hex.r && (now - last.time) < 500) {
        // Двойной тап - отправляем событие для перемещения
        emit('hex-double-tap', getHexWithTerrain(hex))
        lastSelectedHex.value = null
        return
      }
      
      // Сохраняем последний выбранный гекс
      lastSelectedHex.value = { q: hex.q, r: hex.r, time: now }
    }
    
    // Сообщаем о выбранном гексе (для мобильной инфокарточки)
    if (hex) {
      emit('hex-selected', getHexWithTerrain(hex))
    }
    
    // Снимаем выделение токена
    if (selectedToken.value) {
      selectedToken.value = null
      emit('token-selected', null)
      renderUI()
    }
  }
}

// ===== ДЕЙСТВИЯ =====

const createNewMap = () => {
  const map = battleMapStore.createMap({
    name: newMapForm.value.name || 'Новая карта',
    orientation: newMapForm.value.orientation,
    scale: newMapForm.value.scale,
    hexSize: newMapForm.value.hexSize
  })
  
  // Создаём начальную область вокруг центра (0,0)
  const initialRadius = 5
  for (let q = -initialRadius; q <= initialRadius; q++) {
    for (let r = -initialRadius; r <= initialRadius; r++) {
      // Проверяем hex distance от центра
      const dist = (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2
      if (dist <= initialRadius) {
        battleMapStore.setHexTerrain(map.id, q, r, 'grass')
      }
    }
  }
  
  battleMapStore.startEditing(map.id)
  showNewMapDialog.value = false
  newMapForm.value.name = ''
  
  // Центрируем камеру на новой карте
  nextTick(() => {
    centerCamera()
    renderAll()
  })
}

const selectMap = (mapId) => {
  battleMapStore.setActiveMap(mapId)
  showMapList.value = false
  nextTick(() => {
    centerCamera()
    renderAll()
  })
}

const toggleEditing = () => {
  if (editingMap.value) {
    battleMapStore.stopEditing()
  } else if (activeMap.value) {
    battleMapStore.startEditing(activeMap.value.id)
  }
}

const selectTerrainType = (type) => {
  battleMapStore.selectTerrain(type)
  // Переключаем на paint только если не в режиме выделения
  if (editorMode.value !== 'select') {
    battleMapStore.setEditorMode('paint')
  }
  showTerrainPalette.value = false
}

const toggleMapPublished = () => {
  if (activeMap.value) {
    battleMapStore.toggleMapPublished(activeMap.value.id)
  }
}

const deleteCurrentMap = () => {
  if (activeMap.value && confirm(`Удалить карту "${activeMap.value.name}"?`)) {
    battleMapStore.deleteMap(activeMap.value.id)
  }
}

// === Функции для рандомной заливки ===

/**
 * Показать превью заливки
 */
const showFillPreview = (profile) => {
  if (!profile || selectedHexes.value.size === 0) {
    alert('Сначала выделите область на карте')
    return
  }
  
  const hexKeys = [...selectedHexes.value]
  const preview = generateFillPreview(profile, hexKeys, terrainStore)
  fillPreviewData.value = preview
  
  // Перерисовываем с превью
  renderTerrain()
  renderUI()
}

/**
 * Применить профиль заливки к выделению
 */
const applyFillToSelection = (profile) => {
  if (!profile || selectedHexes.value.size === 0) {
    alert('Сначала выделите область на карте')
    return
  }
  
  const hexKeys = [...selectedHexes.value]
  const result = applyFillProfile(profile, hexKeys, terrainStore)
  
  // Применяем результат к карте
  result.forEach((terrainId, key) => {
    const [q, r] = key.split(',').map(Number)
    battleMapStore.setHexTerrain(activeMap.value.id, q, r, terrainId)
  })
  
  // Получаем статистику
  const stats = getFillStats(result, terrainStore)
  console.log('Заливка применена:', stats)
  
  // Очищаем превью и выделение
  fillPreviewData.value = null
  selectedHexes.value = new Set()
  
  // Закрываем панель
  showFillPanel.value = false
  
  // Перерисовываем
  renderAll()
}

/**
 * Очистить превью заливки
 */
const clearFillPreview = () => {
  fillPreviewData.value = null
  renderTerrain()
  renderUI()
}

// ========== ТОКЕНЫ ==========

/**
 * Разместить токен персонажа на выбранном гексе
 */
const placeTokenOnHex = (characterId, q, r) => {
  if (!activeMap.value) return false
  const result = battleMapStore.placeToken(activeMap.value.id, characterId, q, r, 0)
  if (result) {
    renderUI() // Перерисовать с новым токеном
    // Синхронизируем с игроками если мастер
    if (isMaster.value) {
      sessionStore.broadcastMap()
    }
  }
  return result
}

/**
 * Разместить токен на текущем выделенном гексе (или hoveredHex)
 */
const placeTokenOnSelected = (characterId) => {
  // Берём первый выбранный гекс или гекс под курсором
  let targetHex = null
  
  if (selectedHexes.value.size > 0) {
    const firstKey = selectedHexes.value.values().next().value
    const [q, r] = firstKey.split(',').map(Number)
    targetHex = { q, r }
  } else if (hoveredHex.value) {
    targetHex = hoveredHex.value
  }
  
  if (!targetHex) {
    console.warn('No hex selected for token placement')
    return false
  }
  
  return placeTokenOnHex(characterId, targetHex.q, targetHex.r)
}

/**
 * Удалить токен с гекса
 */
const removeTokenFromHex = (q, r) => {
  if (!activeMap.value) return false
  return battleMapStore.removeToken(activeMap.value.id, q, r)
}

// Подсчёт гексов на карте
const hexCount = computed(() => {
  const map = activeMap.value
  if (!map) return 0
  const terrainLayer = map.layers.find(l => l.type === LAYER_TYPES.TERRAIN)
  return terrainLayer?.data.size || 0
})

const orientationLabel = computed(() => {
  if (!activeMap.value) return ''
  return activeMap.value.orientation === HEX_ORIENTATIONS.FLAT ? 'Flat-top ⬡' : 'Pointy-top ⬢'
})

const scaleLabels = {
  [MAP_SCALES.BATTLE]: 'Бой',
  [MAP_SCALES.LOCATION]: 'Локация',
  [MAP_SCALES.DISTRICT]: 'Район',
  [MAP_SCALES.CITY]: 'Город',
  [MAP_SCALES.REGION]: 'Регион',
  [MAP_SCALES.WORLD]: 'Мир'
}

// Иконки и названия для инструмента выделения
const selectionShapeIcons = {
  [SELECTION_SHAPES.RECTANGLE]: '▭',
  [SELECTION_SHAPES.CIRCLE]: '○',
  [SELECTION_SHAPES.HEXAGON]: '⬡',
  [SELECTION_SHAPES.LINE]: '╱'
}

const selectionShapeNames = {
  [SELECTION_SHAPES.RECTANGLE]: 'Прямоугольник',
  [SELECTION_SHAPES.CIRCLE]: 'Круг',
  [SELECTION_SHAPES.HEXAGON]: 'Шестиугольник',
  [SELECTION_SHAPES.LINE]: 'Линия'
}

const selectionModeIcons = {
  [SELECTION_MODES.REPLACE]: '⬚',
  [SELECTION_MODES.ADD]: '+',
  [SELECTION_MODES.SUBTRACT]: '−'
}

const selectionModeNames = {
  [SELECTION_MODES.REPLACE]: 'Заменить',
  [SELECTION_MODES.ADD]: 'Добавить',
  [SELECTION_MODES.SUBTRACT]: 'Вычесть'
}

const selectionBehaviorNames = {
  [SELECTION_BEHAVIORS.AGGRESSIVE]: 'Все',
  [SELECTION_BEHAVIORS.STANDARD]: 'Станд.',
  [SELECTION_BEHAVIORS.PASSIVE]: 'Связн.'
}

const selectionBehaviorDescriptions = {
  [SELECTION_BEHAVIORS.AGGRESSIVE]: 'Все гексы в геометрической области',
  [SELECTION_BEHAVIORS.STANDARD]: 'Все гексы в геометрической области',
  [SELECTION_BEHAVIORS.PASSIVE]: 'Только связные существующие гексы (flood-fill)'
}
</script>

<template>
  <div class="h-full bg-slate-950 text-slate-50 flex flex-col overflow-hidden relative">
    <!-- Тулбар (z-index выше canvas) - скрыт для игроков в мобильном режиме -->
    <header v-if="!mobileMode || isMaster" class="bg-slate-900/90 backdrop-blur border-b border-white/10 px-4 py-2 flex items-center justify-between flex-shrink-0 gap-2 relative z-20">
      <!-- Левая часть: выбор карты (для мастера) или название карты (для игрока) -->
      <div class="flex items-center gap-2">
        <!-- Для мастера: dropdown выбора карты -->
        <div v-if="canEdit" class="relative">
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 hover:bg-slate-700 transition text-sm"
            @click.stop="showMapList = !showMapList; showTerrainPalette = false"
          >
            <span class="font-medium truncate max-w-32">{{ activeMap?.name || 'Выбрать карту' }}</span>
            <span class="text-slate-400">▼</span>
          </button>
          
          <!-- Dropdown список карт -->
          <div
            v-if="showMapList"
            class="absolute top-full left-0 mt-1 w-64 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 py-1 max-h-80 overflow-y-auto"
            @click.stop
          >
            <div
              v-for="map in maps"
              :key="map.id"
              class="px-3 py-2 hover:bg-slate-700 cursor-pointer flex items-center justify-between"
              :class="map.id === activeMap?.id ? 'bg-sky-500/20' : ''"
              @click="selectMap(map.id)"
            >
              <div>
                <p class="text-sm font-medium">{{ map.name }}</p>
                <p class="text-xs text-slate-400">{{ scaleLabels[map.scale] }}</p>
              </div>
              <span v-if="map.visibility?.published" class="text-xs text-emerald-400">●</span>
            </div>
            
            <div v-if="canEdit" class="border-t border-white/10 mt-1 pt-1">
              <button
                type="button"
                class="w-full px-3 py-2 text-left text-sm text-sky-400 hover:bg-slate-700"
                @click="showNewMapDialog = true; showMapList = false"
              >
                + Создать карту
              </button>
            </div>
          </div>
        </div>
        
        <!-- Для игрока: просто название карты или ожидание -->
        <div v-else class="flex items-center gap-2">
          <span v-if="activeMap" class="px-3 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-sm font-medium">
            🗺️ {{ activeMap.name }}
          </span>
          <span v-else class="px-3 py-1.5 rounded-lg bg-slate-800/50 border border-white/10 text-sm text-slate-400">
            ⏳ Ожидание карты...
          </span>
        </div>
        
        <!-- Информация о карте (только для мастера) -->
        <template v-if="isMaster">
          <span v-if="activeMap" class="text-xs px-2 py-1 rounded bg-slate-800 border border-white/10">
            {{ hexCount }} гексов • {{ orientationLabel }}
          </span>
          
          <!-- Индикатор режима просмотра -->
          <span v-if="isReadonly && activeMap" class="text-xs px-2 py-1 rounded bg-slate-700 text-slate-400">
            👁️ Просмотр
          </span>
        </template>
      </div>
      
      <!-- Центр: инструменты редактора (только для мастера) -->
      <div v-if="editingMap && canEdit" class="flex items-center gap-1">
        <button
          v-for="mode in ['select', 'paint', 'erase', 'token']"
          :key="mode"
          type="button"
          class="w-9 h-9 rounded-lg border flex items-center justify-center text-sm transition"
          :class="editorMode === mode 
            ? 'bg-sky-500/30 border-sky-400/60 text-sky-100' 
            : 'border-white/10 hover:bg-white/5 text-slate-300'"
          :title="mode === 'select' ? 'Выбор' : mode === 'paint' ? 'Рисовать' : mode === 'erase' ? 'Стереть' : 'Токены'"
          @click="battleMapStore.setEditorMode(mode)"
        >
          {{ mode === 'select' ? '👆' : mode === 'paint' ? '🖌️' : mode === 'erase' ? '🧹' : '👤' }}
        </button>
        
        <!-- Список персонажей для размещения (в режиме token) -->
        <template v-if="editorMode === 'token'">
          <div class="w-px h-6 bg-white/10 mx-1"></div>
          <div class="flex items-center gap-1">
            <span class="text-xs text-slate-400 mr-1">Персонажи:</span>
            <button
              v-for="char in characters"
              :key="char.id"
              type="button"
              class="px-2 py-1 rounded text-xs border border-white/10 hover:bg-white/10 transition truncate max-w-24"
              :class="battleMapStore.findTokenPosition(activeMap?.id, char.id) ? 'bg-emerald-500/20 border-emerald-400/40' : ''"
              :title="char.name + (battleMapStore.findTokenPosition(activeMap?.id, char.id) ? ' (на карте)' : ' - клик для размещения')"
              @click="placeTokenOnSelected(char.id)"
            >
              {{ char.name }}
            </button>
            <span v-if="!characters.length" class="text-xs text-slate-500 italic">Нет персонажей</span>
          </div>
        </template>
        
        <!-- Настройки выделения (показываем в режиме select) -->
        <template v-if="editorMode === 'select'">
          <div class="w-px h-6 bg-white/10 mx-1"></div>
          
          <!-- Форма выделения -->
          <div class="relative">
            <button
              type="button"
              class="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition text-xs"
              @click.stop="showSelectionPanel = !showSelectionPanel; showTerrainPalette = false; showMapList = false"
            >
              <span>{{ selectionShapeIcons[selection.shape] }}</span>
              <span class="text-slate-400">▼</span>
            </button>
            
            <!-- Панель настроек выделения -->
            <div
              v-if="showSelectionPanel"
              class="absolute top-full left-0 mt-1 w-56 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 p-3"
              @click.stop
            >
              <!-- Форма -->
              <div class="mb-3">
                <p class="text-xs text-slate-400 mb-1.5">Форма</p>
                <div class="flex gap-1">
                  <button
                    v-for="shape in Object.values(SELECTION_SHAPES)"
                    :key="shape"
                    type="button"
                    class="flex-1 py-1.5 rounded border text-sm transition"
                    :class="selection.shape === shape 
                      ? 'bg-sky-500/20 border-sky-400/60' 
                      : 'border-white/10 hover:bg-white/5'"
                    :title="selectionShapeNames[shape]"
                    @click="battleMapStore.setSelectionShape(shape)"
                  >
                    {{ selectionShapeIcons[shape] }}
                  </button>
                </div>
              </div>
              
              <!-- Режим -->
              <div class="mb-3">
                <p class="text-xs text-slate-400 mb-1.5">Режим</p>
                <div class="flex gap-1">
                  <button
                    v-for="mode in Object.values(SELECTION_MODES)"
                    :key="mode"
                    type="button"
                    class="flex-1 py-1.5 rounded border text-xs transition"
                    :class="selection.mode === mode 
                      ? 'bg-sky-500/20 border-sky-400/60' 
                      : 'border-white/10 hover:bg-white/5'"
                    :title="selectionModeNames[mode]"
                    @click="battleMapStore.setSelectionMode(mode)"
                  >
                    {{ selectionModeIcons[mode] }}
                  </button>
                </div>
              </div>
              
              <!-- Поведение -->
              <div class="mb-3">
                <p class="text-xs text-slate-400 mb-1.5">Поведение</p>
                <div class="flex gap-1">
                  <button
                    v-for="beh in Object.values(SELECTION_BEHAVIORS)"
                    :key="beh"
                    type="button"
                    class="flex-1 py-1 rounded border text-[10px] transition"
                    :class="selection.behavior === beh 
                      ? 'bg-sky-500/20 border-sky-400/60' 
                      : 'border-white/10 hover:bg-white/5'"
                    :title="selectionBehaviorDescriptions[beh]"
                    @click="battleMapStore.setSelectionBehavior(beh)"
                  >
                    {{ selectionBehaviorNames[beh] }}
                  </button>
                </div>
                <p class="text-[10px] text-slate-500 mt-1">
                  {{ selectionBehaviorDescriptions[selection.behavior] }}
                </p>
              </div>
              
              <!-- Ширина линии (только для линии) -->
              <div v-if="selection.shape === SELECTION_SHAPES.LINE">
                <p class="text-xs text-slate-400 mb-1">Ширина линии: {{ selection.lineWidth }}</p>
                <input
                  type="range"
                  min="1"
                  max="5"
                  :value="selection.lineWidth"
                  class="w-full"
                  @input="battleMapStore.setSelectionLineWidth(Number($event.target.value))"
                />
              </div>
            </div>
          </div>
          
          <!-- Действия с выделением -->
          <template v-if="selectedHexes.size > 0">
            <span class="text-xs text-slate-400 px-1">{{ selectedHexes.size }} выбрано</span>
            
            <button
              type="button"
              class="px-2 py-1.5 rounded-lg border border-emerald-400/60 bg-emerald-500/20 text-emerald-100 text-xs hover:bg-emerald-500/30 transition"
              title="Заполнить выбранным террейном"
              @click="fillSelection"
            >
              🎨 Залить
            </button>
            
            <button
              type="button"
              class="px-2 py-1.5 rounded-lg border border-amber-400/60 bg-amber-500/20 text-amber-100 text-xs hover:bg-amber-500/30 transition"
              title="Рандомная заливка по профилю"
              @click="showFillPanel = !showFillPanel; showTerrainPalette = false; showSelectionPanel = false"
            >
              🎲 Рандом
            </button>
            
            <button
              type="button"
              class="px-2 py-1.5 rounded-lg border border-rose-400/60 bg-rose-500/20 text-rose-100 text-xs hover:bg-rose-500/30 transition"
              title="Удалить выбранные гексы"
              @click="deleteSelection"
            >
              🗑️
            </button>
            
            <button
              type="button"
              class="px-2 py-1.5 rounded-lg border border-white/10 text-slate-300 text-xs hover:bg-white/5 transition"
              title="Снять выделение"
              @click="clearSelection"
            >
              ✕
            </button>
          </template>
        </template>
        
        <div class="w-px h-6 bg-white/10 mx-1"></div>
        
        <!-- Выбор террейна -->
        <div class="relative">
          <button
            type="button"
            class="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition text-sm"
            @click.stop="showTerrainPalette = !showTerrainPalette; showMapList = false; showSelectionPanel = false"
          >
            <span 
              class="w-5 h-5 rounded" 
              :style="{ backgroundColor: currentTerrainInfo.fallbackColor || currentTerrainInfo.color || '#888' }"
            ></span>
            <span class="text-xs">{{ currentTerrainInfo.name || selectedTerrain }}</span>
          </button>
          
          <!-- Палитра террейнов (улучшенная с фильтрами) -->
          <div
            v-if="showTerrainPalette"
            class="absolute top-full left-0 mt-1 w-80 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden"
            @click.stop
          >
            <!-- Заголовок и поиск -->
            <div class="p-2 border-b border-white/10">
              <div class="flex items-center gap-2">
                <input
                  v-model="terrainSearch"
                  type="text"
                  placeholder="Поиск террейна..."
                  class="flex-1 px-2 py-1 text-xs bg-slate-900/50 border border-white/10 rounded focus:outline-none focus:border-sky-400/50"
                />
                <button
                  type="button"
                  class="p-1 rounded hover:bg-white/10 transition text-xs"
                  :class="showTerrainFilters ? 'bg-sky-500/20 text-sky-400' : 'text-slate-400'"
                  @click="showTerrainFilters = !showTerrainFilters"
                  title="Показать фильтры"
                >
                  ⚙
                </button>
              </div>
              
              <!-- Панель фильтров -->
              <div v-if="showTerrainFilters" class="mt-2 space-y-2">
                <!-- Биом -->
                <div class="flex items-center gap-2">
                  <span class="text-xs text-slate-400 w-16">Биом:</span>
                  <select
                    v-model="terrainBiomeFilter"
                    class="flex-1 px-2 py-1 text-xs bg-slate-900/50 border border-white/10 rounded focus:outline-none"
                  >
                    <option :value="null">Все биомы</option>
                    <option v-for="biome in terrainStore.biomes" :key="biome.id" :value="biome.id">
                      {{ biome.name }}
                    </option>
                  </select>
                </div>
                
                <!-- Видимость -->
                <div class="flex items-center gap-2">
                  <span class="text-xs text-slate-400 w-16">Обзор:</span>
                  <select
                    v-model="terrainVisibilityFilter"
                    class="flex-1 px-2 py-1 text-xs bg-slate-900/50 border border-white/10 rounded focus:outline-none"
                  >
                    <option :value="null">Любой</option>
                    <option v-for="vis in terrainStore.visibilityTypes" :key="vis.id" :value="vis.id">
                      {{ vis.name }}
                    </option>
                  </select>
                </div>
                
                <!-- Проходимость -->
                <div class="flex items-center gap-2">
                  <span class="text-xs text-slate-400 w-16">Проход:</span>
                  <input
                    v-model.number="terrainPassabilityRange.max"
                    type="range"
                    min="1"
                    max="5"
                    step="1"
                    class="flex-1"
                  />
                  <span class="text-xs text-slate-300 w-8">≤{{ terrainPassabilityRange.max }}</span>
                </div>
                
                <!-- Сброс фильтров -->
                <button
                  type="button"
                  class="w-full px-2 py-1 text-xs bg-slate-700/50 hover:bg-slate-700 rounded transition"
                  @click="terrainBiomeFilter = null; terrainVisibilityFilter = null; terrainPassabilityRange = { min: 1, max: 5 }; terrainSearch = ''"
                >
                  Сбросить фильтры
                </button>
              </div>
            </div>
            
            <!-- Сетка террейнов -->
            <div class="p-2 max-h-64 overflow-y-auto">
              <!-- Базовые террейны из нового стора -->
              <div v-if="filteredTerrains.length > 0" class="grid grid-cols-5 gap-1">
                <button
                  v-for="terrain in filteredTerrains"
                  :key="terrain.id"
                  type="button"
                  class="w-12 h-12 rounded border border-white/10 hover:border-white/30 transition relative group"
                  :class="selectedTerrain === terrain.id ? 'ring-2 ring-sky-400' : ''"
                  :style="{ backgroundColor: terrain.color || terrain.fallbackColor || '#888' }"
                  :title="`${terrain.name}\nПроход: ${terrain.movementCost ?? 1}\nБлиж. бой: ${(terrain.meleeAdvantage ?? 0) > 0 ? '+' : ''}${terrain.meleeAdvantage ?? 0}`"
                  @click="selectTerrainType(terrain.id)"
                >
                  <!-- Индикаторы -->
                  <div class="absolute bottom-0 left-0 right-0 flex justify-center gap-0.5 p-0.5 bg-black/50 opacity-0 group-hover:opacity-100 transition">
                    <span v-if="terrain.movementCost >= 5" class="text-[8px]">🚫</span>
                    <span v-else-if="terrain.movementCost > 2" class="text-[8px]">⚠</span>
                    <span v-if="terrain.visibility === 'blocking'" class="text-[8px]">🔲</span>
                    <span v-else-if="terrain.visibility === 'partial'" class="text-[8px]">🌿</span>
                    <span v-if="(terrain.meleeAdvantage ?? 0) > 0" class="text-[8px] text-green-400">+{{ terrain.meleeAdvantage }}</span>
                    <span v-else-if="(terrain.meleeAdvantage ?? 0) < 0" class="text-[8px] text-red-400">{{ terrain.meleeAdvantage }}</span>
                  </div>
                </button>
              </div>
              
              <div v-else class="text-center text-xs text-slate-400 py-4">
                Террейны не найдены
              </div>
              
              <!-- Разделитель для старых типов -->
              <div v-if="!terrainSearch && !terrainBiomeFilter && !terrainVisibilityFilter" class="mt-2 pt-2 border-t border-white/10">
                <div class="text-xs text-slate-500 mb-1">Базовые (совместимость):</div>
                <div class="grid grid-cols-5 gap-1">
                  <button
                    v-for="(terrain, key) in TERRAIN_TYPES"
                    :key="key"
                    type="button"
                    class="w-12 h-12 rounded border border-white/10 hover:border-white/30 transition"
                    :class="selectedTerrain === key ? 'ring-2 ring-sky-400' : ''"
                    :style="{ backgroundColor: terrain.color }"
                    :title="terrain.name"
                    @click="selectTerrainType(key)"
                  ></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Правая часть: действия -->
      <div class="flex items-center gap-2">
        <template v-if="isMaster">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg border text-xs transition"
            :class="editingMap 
              ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-100' 
              : 'border-white/10 hover:bg-white/5 text-slate-300'"
            @click="toggleEditing"
          >
            {{ editingMap ? '✓ Готово' : '✏️ Редактировать' }}
          </button>
          
          <button
            v-if="activeMap"
            type="button"
            class="px-3 py-1.5 rounded-lg border text-xs transition"
            :class="activeMap.visibility?.published 
              ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-100' 
              : 'border-white/10 hover:bg-white/5 text-slate-300'"
            :title="activeMap.visibility?.published ? 'Карта видна игрокам' : 'Карта скрыта'"
            @click="toggleMapPublished"
          >
            {{ activeMap.visibility?.published ? '👁 Видима' : '🙈 Скрыта' }}
          </button>
        </template>
        
        <button
          type="button"
          class="w-9 h-9 rounded-lg border border-white/10 hover:bg-white/5 flex items-center justify-center text-sm"
          title="Центрировать (0,0)"
          @click="centerCamera(); renderAll()"
        >
          🎯
        </button>
      </div>
    </header>

    <!-- Основная область: карта + боковая панель -->
    <div class="flex-1 flex overflow-hidden">
      <!-- Карта (Canvas стек) -->
      <div 
        ref="canvasContainer"
        class="flex-1 overflow-hidden relative bg-slate-900/40 z-0"
      >
        <canvas
          ref="terrainCanvas"
          class="absolute top-0 left-0"
          :width="containerSize.width"
          :height="containerSize.height"
        ></canvas>
        <canvas
          ref="gridCanvas"
          class="absolute top-0 left-0"
        :width="containerSize.width"
        :height="containerSize.height"
      ></canvas>
      <canvas
        ref="uiCanvas"
        class="absolute top-0 left-0"
        :class="isDragging ? 'cursor-grabbing' : (editingMap ? 'cursor-crosshair' : 'cursor-grab')"
        :width="containerSize.width"
        :height="containerSize.height"
        @mousemove="onCanvasMouseMove"
        @mousedown="onCanvasMouseDown"
        @mouseup="onCanvasMouseUp"
        @mouseleave="onCanvasMouseLeave"
        @wheel="onCanvasWheel"
        @touchstart="onCanvasTouchStart"
        @touchmove="onCanvasTouchMove"
        @touchend="onCanvasTouchEnd"
        @contextmenu.prevent
      ></canvas>
      
      <!-- Координаты под курсором - скрыты в мобильном режиме для игроков -->
      <div 
        v-if="hoveredHex && (!mobileMode || isMaster)" 
        class="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-white/10 text-xs font-mono pointer-events-none"
      >
        q: {{ hoveredHex.q }}, r: {{ hoveredHex.r }}
      </div>
      
      <!-- Zoom indicator - скрыт в мобильном режиме для игроков -->
      <div v-if="!mobileMode || isMaster" class="absolute bottom-4 right-4 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-white/10 text-xs pointer-events-none">
        {{ Math.round(camera.zoom * 100) }}%
      </div>
      </div>
    
      <!-- Панель профилей заливки (боковая) -->
      <FillProfilePanel
        v-if="showFillPanel"
        class="flex-shrink-0 border-l border-white/10"
        @close="showFillPanel = false; clearFillPreview()"
        @preview="showFillPreview"
        @apply="applyFillToSelection"
      />
    </div>

    <!-- Нижняя панель - скрыта для игроков в мобильном режиме -->
    <footer v-if="!mobileMode || isMaster" class="bg-slate-900/80 backdrop-blur border-t border-white/10 px-4 py-2 flex-shrink-0 relative z-10">
      <div class="flex items-center justify-between text-sm">
        <p class="text-slate-400 text-xs">
          <template v-if="editingMap">
            Рисуйте кликом/перетаскиванием • Shift+drag для навигации • Колёсико для зума • 🎯 центр (0,0)
          </template>
          <template v-else>
            {{ isMaster ? 'Нажмите "Редактировать" для изменения карты' : 'Shift+перетаскивание для навигации' }}
          </template>
        </p>
        
        <div class="flex items-center gap-2">
          <button
            v-if="isMaster && activeMap"
            type="button"
            class="px-2 py-1 rounded text-xs text-rose-400 hover:bg-rose-500/10 transition"
            @click="deleteCurrentMap"
          >
            🗑️ Удалить
          </button>
        </div>
      </div>
    </footer>

    <!-- Диалог создания карты -->
    <div 
      v-if="showNewMapDialog" 
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      @click.self="showNewMapDialog = false"
    >
      <div class="bg-slate-800 border border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h3 class="text-lg font-semibold mb-4">Создать карту</h3>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-slate-400 mb-1">Название</label>
            <input
              v-model="newMapForm.name"
              type="text"
              class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-sm"
              placeholder="Новая карта"
            />
          </div>
          
          <div>
            <label class="block text-sm text-slate-400 mb-1">Ориентация гексов</label>
            <div class="flex gap-2">
              <button
                type="button"
                class="flex-1 py-2 rounded-lg border text-sm transition"
                :class="newMapForm.orientation === 'flat' 
                  ? 'bg-sky-500/20 border-sky-400/60' 
                  : 'border-white/10 hover:bg-white/5'"
                @click="newMapForm.orientation = 'flat'"
              >
                Flat-top ⬡
              </button>
              <button
                type="button"
                class="flex-1 py-2 rounded-lg border text-sm transition"
                :class="newMapForm.orientation === 'pointy' 
                  ? 'bg-sky-500/20 border-sky-400/60' 
                  : 'border-white/10 hover:bg-white/5'"
                @click="newMapForm.orientation = 'pointy'"
              >
                Pointy-top ⬢
              </button>
            </div>
          </div>
          
          <div>
            <label class="block text-sm text-slate-400 mb-1">Масштаб</label>
            <select
              v-model="newMapForm.scale"
              class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-sm"
            >
              <option v-for="(label, key) in scaleLabels" :key="key" :value="key">
                {{ label }}
              </option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm text-slate-400 mb-1">Размер гекса (пиксели)</label>
            <input
              v-model.number="newMapForm.hexSize"
              type="number"
              min="16"
              max="64"
              class="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-sm"
            />
          </div>
          
          <p class="text-xs text-slate-500">
            Карта не имеет фиксированных границ — она расширяется по мере рисования. 
            Центр карты находится в координатах (0, 0).
          </p>
        </div>
        
        <div class="flex justify-end gap-2 mt-6">
          <button
            type="button"
            class="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 text-sm"
            @click="showNewMapDialog = false"
          >
            Отмена
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-sm font-medium"
            @click="createNewMap"
          >
            Создать
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
