<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useBattleMapStore, MAP_SCALES, TERRAIN_TYPES, LAYER_TYPES } from '@/stores/battleMap'
import { useTerrainStore } from '@/stores/terrain'
import { useFillProfileStore } from '@/stores/fillProfile'
import { useSessionStore } from '@/stores/session'
import { useCharactersStore } from '@/stores/characters'
import { useUserStore } from '@/stores/user'
import { usePointerStore, POINTER_TOOLS } from '@/stores/pointer'
import { useInteractionStore, INTERACTION_STATE, DRAG_ZONE } from '@/stores/interaction'
import { HexGrid, HEX_ORIENTATIONS, hexKey, getReachableHexes, reachableMapToArray, findPath, segmentPath, tokenAnimationManager, getHexDirection, direction6to12 } from '@/utils/hex'
import { playRemoteTokenAnimation } from '@/composables/useTokenMovement'
import { 
  SelectionManager, 
  SELECTION_SHAPES, 
  SELECTION_MODES, 
  SELECTION_BEHAVIORS 
} from '@/utils/hex/selection'
import { applyFillProfile, generateFillPreview, getFillStats } from '@/utils/hex/fill'
import { getDefenceData } from '@/utils/character/defence'
import { drawTokens, drawToken, preloadTokenImages, loadImage, findTokenAtPoint, canvasToWorld, drawPortrait, drawDefence, getPortraitUrl } from '@/utils/rendering/tokenRenderer'
import FillProfilePanel from '../layout/FillProfilePanel.vue'
import ProfileEditorModal from '../master/ProfileEditorModal.vue'
import MapPointer from './MapPointer.vue'
import PointerToolbar from './PointerToolbar.vue'
import MapControlPanel from '../master/MapControlPanel.vue'
import BattleControlPanel from '../master/BattleControlPanel.vue'
import EditorToolsPanel from '../master/EditorToolsPanel.vue'

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

import { safeStoreToRefs, safeUseStore } from '@/utils/safeStoreRefs'

// Инициализация сторов с защитой от HMR ошибок
const battleMapStore = safeUseStore(useBattleMapStore, 'battleMap')
const terrainStore = safeUseStore(useTerrainStore, 'terrain')
const fillProfileStore = safeUseStore(useFillProfileStore, 'fillProfile')
const sessionStore = safeUseStore(useSessionStore, 'session')
const charactersStore = safeUseStore(useCharactersStore, 'characters')
const userStore = safeUseStore(useUserStore, 'user')
const pointerStore = safeUseStore(usePointerStore, 'pointer')
const interactionStore = safeUseStore(useInteractionStore, 'interaction')

const { 
  activeMap = ref(null), 
  editingMap = ref(null), 
  editorMode = ref(null), 
  selectedTerrain = ref(null),
  activeLayerId = ref(null),
  camera = ref({ x: 0, y: 0, zoom: 1 }),
  maps = ref([]),
  publishedMaps = ref([]),
  selection = ref(null),
  brush = ref(null)
} = safeStoreToRefs(battleMapStore, 'battleMap')

const { activeTool: pointerTool = ref('none') } = safeStoreToRefs(pointerStore, 'pointer')

const { isMaster = ref(false) } = safeStoreToRefs(sessionStore, 'session')
const { characters = ref([]), npcs = ref([]), otherTokens = ref([]) } = safeStoreToRefs(charactersStore, 'characters')

// Реактивные refs из interactionStore для отслеживания состояния
const { 
  state: interactionState = ref('idle'), 
  targetHex: interactionTargetHex = ref(null),
  selectedFacing: interactionSelectedFacing = ref(null)
} = safeStoreToRefs(interactionStore, 'interaction')

// Все сущности для размещения на карте (персонажи + NPC для мастера)
const tokensToPlace = computed(() => {
  const result = [...(characters.value || [])]
  if (isMaster.value) {
    const npcsList = npcs.value || []
    npcsList.forEach(npc => {
      result.push({
        ...npc,
        isNpc: true
      })
    })
  }
  return result
})

/**
 * Проверяет, может ли пользователь управлять токеном
 * Мастер может управлять всеми токенами
 */
const canControlToken = (token) => {
  if (!token) return false
  if (isMaster.value) return true
  return token.character?.ownerId === userStore.userId
}

// Режим только для чтения (для игроков)
const isReadonly = computed(() => props.readonly || !isMaster.value)
const canEdit = computed(() => !isReadonly.value)

// Находимся ли в режиме редактирования карты (boolean)
const isEditingMap = computed(() => !!editingMap.value)

// Высота инфопанели для позиционирования BattleControlPanel
// Обращаемся напрямую к реактивному state для отслеживания изменений
const infoPanelHeight = computed(() => {
  const isOpen = userStore.infoPanelState?.['battle-map'] ?? false
  return isOpen ? 200 : 56 // Развёрнутая ~200px, свёрнутая 56px
})

// Отступ от инфопанели до BattleControlPanel (6px)
const battlePanelTopOffset = computed(() => infoPanelHeight.value -50 )

// Canvas refs
const canvasContainer = ref(null)
const terrainCanvas = ref(null)
const gridCanvas = ref(null)
const uiCanvas = ref(null)
const mapPointerRef = ref(null)

// Размеры контейнера (обновляются при resize)
const containerSize = ref({ width: 800, height: 600 })

// Состояние UI
const showMapList = ref(false)
const showNewMapDialog = ref(false)
const showTerrainPalette = ref(false)
const showSelectionPanel = ref(false) // Панель настроек выделения
const showFillPanel = ref(false) // Панель профилей заливки
const showProfileModal = ref(false) // Модальное окно редактирования профилей
const showTokenPanel = ref(false) // Панель размещения токенов
const showPointerToolbar = ref(false) // Панель инструментов указки
const tokenSearch = ref('') // Поиск по токенам
const hoveredHex = ref(null)
const hoveredToken = ref(null) // Токен под курсором
const selectedToken = ref(null) // Выбранный токен
const isDragging = ref(false)
const isPainting = ref(false) // Для рисования с зажатой кнопкой
const strokeHexes = ref(new Set()) // Гексы, затронутые текущим мазком (для профилей)

// Состояние перетаскивания токена (только для мастера)
const isDraggingToken = ref(false)
const draggingToken = ref(null) // Токен, который перетаскиваем
const dragTokenOffset = ref({ x: 0, y: 0 }) // Смещение курсора от центра токена

// Состояние для отложенного начала drag (чтобы отличить клик от drag)
const pendingTokenDrag = ref(null) // { token, startX, startY, offset }
const DRAG_THRESHOLD = 5 // Пиксели, которые нужно переместить для начала drag

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

// Состояние drag для выбора направления (ring или конец пути)
const isDraggingFacing = ref(false)
const facingDragSource = ref(null) // 'ring' | 'path-end'
const facingDragCenter = ref({ x: 0, y: 0 }) // Центр в screen coords для расчёта угла

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

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ДЛЯ ГЕКСОВ ==========

/**
 * Расстояние между двумя гексами (в гексах)
 */
const hexDistance = (q1, r1, q2, r2) => {
  return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2
}

/**
 * Получить линию гексов от (q1,r1) до (q2,r2)
 */
const getHexLine = (q1, r1, q2, r2) => {
  const N = hexDistance(q1, r1, q2, r2)
  if (N === 0) return [{ q: q1, r: r1 }]
  
  const results = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    // Линейная интерполяция в кубических координатах
    const q = q1 + (q2 - q1) * t
    const r = r1 + (r2 - r1) * t
    const s1 = -q1 - r1
    const s2 = -q2 - r2
    const s = s1 + (s2 - s1) * t
    
    // Округляем к ближайшему гексу
    let rq = Math.round(q)
    let rr = Math.round(r)
    let rs = Math.round(s)
    
    const qDiff = Math.abs(rq - q)
    const rDiff = Math.abs(rr - r)
    const sDiff = Math.abs(rs - s)
    
    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs
    } else if (rDiff > sDiff) {
      rr = -rq - rs
    }
    
    results.push({ q: rq, r: rr })
  }
  
  return results
}

/**
 * Получить все гексы в радиусе от центра (геометрический)
 */
const getHexesInRange = (centerQ, centerR, radius) => {
  const hexes = []
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      hexes.push({ q: centerQ + q, r: centerR + r })
    }
  }
  return hexes
}

// isPointInRotateRing и isPointNearPathEnd удалены - rotation ring больше не используется
// Вместо этого используется упрощённая drag-схема на токене/пути

/**
 * Вычисляет facing (0-11) по углу от центра (для drag)
 * Использует схему "рогатка" - тянем в противоположную сторону от желаемого направления
 */
const getFacingFromDragAngle = (centerX, centerY, pointX, pointY) => {
  const dx = pointX - centerX
  const dy = pointY - centerY
  
  // atan2 возвращает угол от оси X (вправо=0°, вниз=90°, влево=180°, вверх=-90°=270°)
  let angle = Math.atan2(dy, dx) * (180 / Math.PI)
  
  // Инвертируем на 180° — схема "рогатка": тянем назад, смотрим вперёд
  // Плюс корректировка 90° для соответствия системе координат гексов
  angle = angle + 180 + 90
  
  // Нормализуем угол в 0-360
  while (angle < 0) angle += 360
  while (angle >= 360) angle -= 360
  
  // Для flat-top гексов: отрисовка использует rotation = facing * 30 + 90
  // Значит angle = facing * 30 + 90, то есть facing = (angle - 90) / 30
  // Для pointy-top: rotation = facing * 30, то есть facing = angle / 30
  const isPointy = hexGrid.value?.orientation === 'pointy'
  const orientationOffset = isPointy ? 0 : 90
  
  // Вычитаем offset ориентации чтобы получить "логический" угол
  let logicalAngle = angle - orientationOffset
  while (logicalAngle < 0) logicalAngle += 360
  
  // Преобразуем в сектор 0-11 (каждый сектор 30 градусов)
  // Добавляем 15° (половину сектора) для округления к ближайшему сектору
  const sector = Math.floor((logicalAngle + 15) / 30) % 12
  return sector
}

/**
 * Получить функцию для определения данных террейна по координатам
 * Возвращает объект с полем movementCost и другими данными
 * @param {Object} character - персонаж (для определения способностей и союзников)
 */
const getTerrainAtFn = (character = null) => {
  const map = activeMap.value
  if (!map) return () => null
  
  // Собираем теги способностей персонажа
  const characterTags = new Set()
  if (character) {
    const abilities = character.movementModifiers || character.abilities || {}
    if (abilities.flight) characterTags.add('flight')
    if (abilities.swimming) characterTags.add('swimming')
    if (abilities.phasing) characterTags.add('phasing')
    if (abilities.climbing) characterTags.add('climbing')
    
    if (character.movementTags) {
      character.movementTags.forEach(tag => characterTags.add(tag))
    }
  }
  
  return (q, r) => {
    return battleMapStore.getHexPathfindingData(map.id, q, r, terrainStore, {
      viewerId: character?.id,
      characterTags
    })
  }
}

/**
 * Показать зону досягаемости от гекса с учётом цены перемещения
 * @param {number} q - координата Q
 * @param {number} r - координата R
 * @param {number} movementPoints - очки движения (по умолчанию 6)
 * @param {Object} modifiers - модификаторы персонажа
 */
const showRangeFromHex = (q, r, movementPoints = 6, modifiers = null) => {
  const getTerrainAt = getTerrainAtFn()
  const reachableMap = getReachableHexes({ q, r }, movementPoints, getTerrainAt, { modifiers })
  const hexes = reachableMapToArray(reachableMap)
  pointerStore.showRange(q, r, movementPoints, hexes)
}

/**
 * Показать зону движения для выбранного персонажа
 * Вызывается при выборе своего токена
 */
const showMovementRangeForToken = (token) => {
  if (!token || !activeMap.value) {
    pointerStore.hideMovementRange()
    return
  }
  
  // Проверяем, что это свой токен (или мастер)
  const isOwn = token.character?.ownerId === userStore.userId
  if (!isOwn && !isMaster.value) {
    pointerStore.hideMovementRange()
    return
  }
  
  // Получаем АКТУАЛЬНУЮ позицию токена из store (не из кэшированного объекта)
  const currentPosition = battleMapStore.findTokenPosition(activeMap.value.id, token.characterId)
  if (!currentPosition) {
    pointerStore.hideMovementRange()
    return
  }
  
  // Получаем доступные очки движения (fallback на 5 если не задано)
  let movementPoints = charactersStore.getAvailableMovement(token.characterId)
  if (movementPoints === 0) {
    // Возможно у персонажа ещё нет combat.movement - используем дефолт
    movementPoints = token.character?.combat?.movement?.current ?? 5
  }
  
  console.log('📍 showMovementRangeForToken:', {
    characterId: token.characterId,
    position: currentPosition,
    movementPoints
  })
  
  if (movementPoints <= 0) {
    pointerStore.hideMovementRange()
    return
  }
  
  // Вычисляем зону досягаемости от АКТУАЛЬНОЙ позиции
  const getTerrainAt = getTerrainAtFn()
  const reachableMap = getReachableHexes(
    currentPosition, 
    movementPoints, 
    getTerrainAt, 
    { modifiers: token.character?.movementModifiers || {} }
  )
  const hexes = reachableMapToArray(reachableMap)
  
  // Показываем зону движения
  pointerStore.showMovementRange(
    token.characterId,
    currentPosition,
    hexes,
    movementPoints
  )
}

// ========== ТОКЕНЫ ПЕРСОНАЖЕЙ ==========

// Получить все токены на активной карте с позициями в пикселях
const mapTokens = computed(() => {
  if (!activeMap.value || !hexGrid.value) return []
  
  // Добавляем зависимость от npcs, characters и otherTokens для реактивности
  const _npcs = npcs.value
  const _chars = characters.value
  const _otherTokens = otherTokens.value
  
  const tokens = battleMapStore.getAllTokens(activeMap.value.id)
  const grid = hexGrid.value
  
  return tokens.map(token => {
    const character = charactersStore.getCharacterById(token.characterId)
    if (!character) {
      // Персонаж не найден - возможно ещё не синхронизирован или удалён
      // Тихо пропускаем чтобы не спамить консоль
      return null
    }
    
    // Проверяем, анимируется ли токен
    const animatedPos = tokenAnimationManager.getAnimatedPosition(token.characterId)
    
    let pixelX, pixelY, facing
    if (animatedPos) {
      // Используем анимированную позицию
      pixelX = animatedPos.x
      pixelY = animatedPos.y
      facing = animatedPos.facing
    } else {
      // Конвертируем координаты гекса в пиксели
      const pixelPos = grid.hexToPixel(token.q, token.r)
      pixelX = pixelPos.x
      pixelY = pixelPos.y
      facing = token.facing
    }
    
    return {
      ...token,
      character,
      pixelX,
      pixelY,
      facing,
      isAnimating: !!animatedPos,
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

// selectedTokenPositionForRing удалён - rotation ring больше не используется

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

/**
 * Обработчик анимации токена от удалённого пира
 * Воспроизводит анимацию движения с учётом времени синхронизации
 */
const handleRemoteTokenAnimation = (payload) => {
  console.log('[BattleMap] Получена анимация токена:', payload, 'myUserId:', userStore.userId, 'isMaster:', isMaster.value)
  
  playRemoteTokenAnimation({
    payload,
    myUserId: userStore.userId,
    battleMapStore,
    getHexGrid: () => hexGrid.value,
    getActiveMap: () => activeMap.value
  })
}

// Инициализация
onMounted(() => {
  updateContainerSize()
  
  // Устанавливаем callback для рендеринга анимаций
  tokenAnimationManager.setRenderCallback(() => {
    renderAll()
  })
  
  // Слушатель анимаций токенов от других пиров
  sessionStore.onMessage('token-animation', handleRemoteTokenAnimation)
  
  // Обработчик клавиатуры для ESC
  window.addEventListener('keydown', handleKeyDown)
  
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
  window.removeEventListener('keydown', handleKeyDown)
  tokenAnimationManager.setRenderCallback(null)
  tokenAnimationManager.stopAll()
})

/**
 * Обработчик клавиатуры
 */
const handleKeyDown = (event) => {
  // Используем event.code для независимости от раскладки
  const code = event.code
  
  // Ctrl+Z - Undo (только в режиме редактора)
  if ((event.ctrlKey || event.metaKey) && code === 'KeyZ' && !event.shiftKey) {
    if (editorMode.value) {
      battleMapStore.undo()
      renderAll()
      event.preventDefault()
      return
    }
  }
  
  // Ctrl+Y или Ctrl+Shift+Z - Redo (только в режиме редактора)
  if ((event.ctrlKey || event.metaKey) && (code === 'KeyY' || (code === 'KeyZ' && event.shiftKey))) {
    if (editorMode.value) {
      battleMapStore.redo()
      renderAll()
      event.preventDefault()
      return
    }
  }
  
  // ESC - отмена текущего действия
  if (event.key === 'Escape') {
    // Если активен facing picker - отменяем его
    if (longPressState.value.showFacingPicker) {
      resetLongPressState()
      event.preventDefault()
      return
    }
    
    // Если есть путь или выбран токен - отменяем через interaction store
    if (interactionStore.state !== INTERACTION_STATE.IDLE) {
      interactionStore.cancel()
      
      // Синхронизируем локальное состояние
      if (interactionStore.state === INTERACTION_STATE.IDLE) {
        selectedToken.value = null
        selectedPathTarget.value = null
        pointerStore.hideHoveredPath()
        pointerStore.hideMovementRange()
        emit('token-selected', null)
      } else if (interactionStore.state === INTERACTION_STATE.TOKEN_SELECTED) {
        selectedPathTarget.value = null
        pointerStore.hideHoveredPath()
      }
      
      renderUI()
      event.preventDefault()
      return
    }
    
    // Сбрасываем выбор токена
    if (selectedToken.value) {
      selectedToken.value = null
      selectedPathTarget.value = null
      pointerStore.hideHoveredPath()
      pointerStore.hideMovementRange()
      emit('token-selected', null)
      renderUI()
      event.preventDefault()
    }
  }
}

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

// Показ зоны движения при выборе своего токена
watch(selectedToken, (token) => {
  if (token && canControlToken(token)) {
    showMovementRangeForToken(token)
  } else {
    pointerStore.hideMovementRange()
  }
}, { immediate: true })

// Следим за изменением ОД выбранного персонажа для перерисовки зоны движения
const selectedTokenMovement = computed(() => {
  const token = selectedToken.value
  if (!token) return null
  return charactersStore.getAvailableMovement(token.characterId)
})

watch(selectedTokenMovement, (newMovement, oldMovement) => {
  // Перерисовываем зону если ОД изменились и токен выбран
  if (selectedToken.value && canControlToken(selectedToken.value) && newMovement !== oldMovement) {
    showMovementRangeForToken(selectedToken.value)
    // Очищаем путь - он может быть неактуальным
    pointerStore.hideHoveredPath()
    selectedPathTarget.value = null
    renderUI()
  }
})

// Выбранный гекс для показа пути (первый тап)
const selectedPathTarget = ref(null)

/**
 * Показать путь до выбранного гекса с сегментацией по ресурсам
 * Возвращает объект с результатом: { action: 'show' | 'confirm', facing }
 */
const showPathToHex = (hex) => {
  if (!hex || !selectedToken.value || !canControlToken(selectedToken.value)) {
    pointerStore.hideHoveredPath()
    selectedPathTarget.value = null
    interactionStore.cancel()
    return null
  }
  
  const token = selectedToken.value
  const map = activeMap.value
  if (!map) {
    pointerStore.hideHoveredPath()
    return null
  }
  
  // Находим позицию токена
  const tokenPos = battleMapStore.findTokenPosition(map.id, token.characterId)
  if (!tokenPos) {
    pointerStore.hideHoveredPath()
    return null
  }
  
  // Если выбран тот же гекс где стоит токен - скрываем
  if (hex.q === tokenPos.q && hex.r === tokenPos.r) {
    pointerStore.hideHoveredPath()
    selectedPathTarget.value = null
    return null
  }
  
  // Получаем персонажа
  const character = charactersStore.characters.find(c => c.id === token.characterId)
    || charactersStore.npcs.find(n => n.id === token.characterId)
  
  // Вычисляем путь
  const getTerrainAt = getTerrainAtFn(character)
  const pathResult = findPath(
    { q: tokenPos.q, r: tokenPos.r },
    { q: hex.q, r: hex.r },
    getTerrainAt,
    { modifiers: character?.movementModifiers || {}, maxCost: 100 } // Увеличенный лимит для визуализации
  )
  
  if (!pathResult.found) {
    // Путь не найден
    pointerStore.showHoveredPath([], Infinity, hex, {})
    return null
  }
  
  // Получаем ресурсы персонажа
  const resources = charactersStore.getMovementResources(token.characterId)
  
  // Сегментируем путь
  const { segments, usedResources, reachable } = segmentPath(pathResult.path, {
    movement: resources.movement.current,
    surges: resources.surges.current,
    movementPerSurge: resources.surges.movementPerSurge
  })
  
  // Вычисляем предполагаемое направление по последнему шагу пути
  // Используем пиксельные координаты для правильного учёта ориентации
  let suggestedFacing = null
  if (pathResult.path.length >= 2 && hexGrid.value) {
    const lastHex = pathResult.path[pathResult.path.length - 1]
    const prevHex = pathResult.path[pathResult.path.length - 2]
    
    // Получаем пиксельные координаты
    const lastPixel = hexGrid.value.hexToPixel(lastHex.q, lastHex.r)
    const prevPixel = hexGrid.value.hexToPixel(prevHex.q, prevHex.r)
    
    // Вычисляем угол в пиксельных координатах
    const dx = lastPixel.x - prevPixel.x
    const dy = lastPixel.y - prevPixel.y
    const angle = Math.atan2(dy, dx) // 0 = вправо, π/2 = вниз (экранные координаты)
    
    // Конвертируем в градусы и затем в facing
    let degrees = angle * (180 / Math.PI)
    while (degrees < 0) degrees += 360
    while (degrees >= 360) degrees -= 360
    
    // 12 секторов по 30°, +15° для центрирования
    let sector = Math.floor((degrees + 15) / 30) % 12
    
    // Для pointy-top нужна коррекция +3 сектора (90°)
    // Flat-top работает без коррекции
    const isPointy = hexGrid.value.orientation === 'pointy'
    if (isPointy) {
      sector = (sector + 3) % 12
    }
    
    suggestedFacing = sector
    console.log('[showPathToHex] suggestedFacing:', suggestedFacing, 
      'angle:', (angle * 180 / Math.PI).toFixed(1) + '°',
      'isPointy:', isPointy)
  }
  
  // Синхронизируем с interaction store
  const result = interactionStore.setPath(hex, pathResult.path, suggestedFacing)
  
  selectedPathTarget.value = hex
  pointerStore.showHoveredPath(segments, pathResult.totalCost, hex, usedResources, suggestedFacing)
  
  return result
}

/**
 * Обновить выбранное направление на конечной точке пути по положению мыши
 * Работает только когда курсор находится вблизи конечной точки
 */
const updatePathFacingFromMouse = (event) => {
  const pathData = pointerStore.hoveredPath
  if (!pathData || !pathData.targetHex || !hexGrid.value) return
  
  const { targetHex, suggestedFacing } = pathData
  const grid = hexGrid.value
  
  // Получаем позицию курсора в мировых координатах
  const rect = event.target.getBoundingClientRect()
  const canvasX = event.clientX - rect.left
  const canvasY = event.clientY - rect.top
  const worldPos = canvasToWorld(canvasX, canvasY, camera.value)
  
  // Получаем центр целевого гекса
  const targetCenter = grid.hexToPixel(targetHex.q, targetHex.r)
  
  // Вычисляем расстояние от центра
  const dx = worldPos.x - targetCenter.x
  const dy = worldPos.y - targetCenter.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  // Радиус зоны выбора направления (примерно размер индикатора)
  const indicatorRadius = 30 // пикселей
  
  if (distance < indicatorRadius) {
    // Курсор в зоне выбора направления
    // Вычисляем угол и конвертируем в facing
    const angle = Math.atan2(dy, dx) // радианы
    let degrees = angle * (180 / Math.PI)
    
    // Для flat-top ориентации корректируем угол
    const isPointy = activeMap.value?.orientation === 'pointy'
    if (!isPointy) {
      degrees -= 90
    }
    
    // Нормализуем к 0-360
    while (degrees < 0) degrees += 360
    while (degrees >= 360) degrees -= 360
    
    // Вычисляем facing (12 секторов по 30°)
    const rawFacing = Math.round(degrees / 30) % 12
    
    // Ограничиваем выбор: ±2 от suggestedFacing
    const base = suggestedFacing ?? 0
    const diff = ((rawFacing - base + 6 + 12) % 12) - 6 // -6..+5
    const clampedDiff = Math.max(-2, Math.min(2, diff))
    const newFacing = ((base + clampedDiff) % 12 + 12) % 12
    
    pointerStore.setPathFacing(newFacing)
  } else {
    // Курсор далеко - сбрасываем на suggestedFacing
    if (pathData.selectedFacing !== null) {
      pointerStore.setPathFacing(null)
    }
  }
}

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
  // Во время анимации получаем актуальные позиции напрямую
  // Если идёт drag для ПОВОРОТА НА МЕСТЕ - показываем preview на оригинальном токене
  // Если перемещение с выбором направления - preview показывается на ghost, оригинал не крутим
  const isRotateInPlace = touchState.value.isRotateInPlace || facingDragSource.value === 'ring'
  const previewFacing = (isDraggingFacing.value && isRotateInPlace) ? interactionSelectedFacing.value : null
  const previewTokenId = (isDraggingFacing.value && isRotateInPlace && selectedToken.value) ? selectedToken.value.characterId : null
  
  const tokens = mapTokens.value.map(token => {
    const animatedPos = tokenAnimationManager.getAnimatedPosition(token.characterId)
    
    // Если это токен для которого выбираем facing НА МЕСТЕ - подменяем на preview
    const isPreviewToken = token.characterId === previewTokenId
    const facingToShow = isPreviewToken && previewFacing !== null ? previewFacing : (animatedPos?.facing ?? token.facing)
    
    if (animatedPos) {
      return {
        ...token,
        pixelX: animatedPos.x,
        pixelY: animatedPos.y,
        facing: facingToShow,
        isAnimating: true
      }
    }
    return {
      ...token,
      facing: facingToShow
    }
  })
  
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
  
  // === GHOST TOKEN PREVIEW ===
  // Показываем призрачный токен на конце маршрута при выборе направления
  if (interactionTargetHex.value && selectedToken.value && hexGrid.value) {
    const isPointy = activeMap.value?.orientation === HEX_ORIENTATIONS.POINTY
    const facingOffset = isPointy ? 0 : 90
    
    // Получаем facing для preview
    const previewFacing = interactionSelectedFacing.value ?? 
      (pointerStore.hoveredPath?.suggestedFacing ?? selectedToken.value.facing ?? 0)
    
    // Позиция ghost token
    const ghostCenter = hexGrid.value.hexToPixel(interactionTargetHex.value.q, interactionTargetHex.value.r)
    
    // Проверяем, что ghost не на той же позиции что и текущий токен
    const tokenCenter = hexGrid.value.hexToPixel(selectedToken.value.q, selectedToken.value.r)
    const isOnSameHex = Math.abs(ghostCenter.x - tokenCenter.x) < 1 && Math.abs(ghostCenter.y - tokenCenter.y) < 1
    
    // Рисуем ghost только если он не на текущей позиции токена
    if (!isOnSameHex) {
      // Полупрозрачность для ghost
      ctx.save()
      ctx.globalAlpha = 0.6
      
      // Находим character данные
      const character = selectedToken.value.character || 
        charactersStore.characters.find(c => c.id === selectedToken.value.characterId) ||
        charactersStore.npcs.find(n => n.id === selectedToken.value.characterId)
      
      if (character) {
        const ghostToken = {
          characterId: selectedToken.value.characterId,
          character,
          pixelX: ghostCenter.x,
          pixelY: ghostCenter.y,
          facing: previewFacing,
          meleeDefence: getDefenceData(character, 'melee'),
          rangedDefence: getDefenceData(character, 'ranged')
        }
        
        drawToken(ctx, ghostToken, {
          tokenSize: tokenSize.value,
          showFacing: true,
          showDefence: true, // Показываем защиту на preview
          canSeeDefence: true,
          isSelected: true,
          facingOffset
        })
      }
      
      ctx.restore()
    }
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
  // Обработка инструментов указки (мастер)
  if (isMaster.value && pointerTool.value !== POINTER_TOOLS.NONE) {
    const worldPos = getMouseWorld(event)
    const hex = getMouseHex(event)
    if (worldPos) {
      if (pointerTool.value === POINTER_TOOLS.POINTER) {
        pointerStore.updatePointer(worldPos.x, worldPos.y)
      } else if (pointerTool.value === POINTER_TOOLS.DRAW && pointerStore.currentDrawing) {
        pointerStore.continueDrawing(worldPos.x, worldPos.y)
      } else if (pointerTool.value === POINTER_TOOLS.MEASURE && pointerStore.measurement && hex) {
        // Обновляем измерение
        const startHex = pointerStore.measurement.start
        const distance = hexDistance(startHex.q, startHex.r, hex.q, hex.r)
        const path = getHexLine(startHex.q, startHex.r, hex.q, hex.r)
        pointerStore.updateMeasurement(worldPos.x, worldPos.y, hex.q, hex.r, distance, path)
      } else if (pointerStore.currentShape) {
        pointerStore.updateShape(worldPos.x, worldPos.y)
      }
    }
  }
  
  // Если активен facing picker - обновляем превью направления
  if (longPressState.value.showFacingPicker) {
    updateFacingPreview(event.clientX, event.clientY)
    return
  }
  
  // Drag для выбора направления (ring или path-end)
  if (isDraggingFacing.value) {
    const facing = getFacingFromDragAngle(facingDragCenter.value.x, facingDragCenter.value.y, event.clientX, event.clientY)
    interactionStore.setFacing(facing)
    // hexRadius в экранных координатах (учитываем zoom камеры)
    const hexRadius = hexGrid.value ? hexGrid.value.hexSize * camera.value.zoom : 32
    interactionStore.updateDrag(event.clientX, event.clientY, hexRadius, facingDragCenter.value)
    renderUI() // Перерисовываем UI для обновления индикатора
    return
  }
  
  if (isDragging.value) {
    const dx = event.clientX - dragStart.value.x
    const dy = event.clientY - dragStart.value.y
    battleMapStore.panCamera(dx, dy)
    dragStart.value = { x: event.clientX, y: event.clientY }
    renderAll()
    return
  }
  
  // Проверяем, нужно ли начать drag токена (мастер)
  if (pendingTokenDrag.value && !isDraggingToken.value) {
    const dx = event.clientX - pendingTokenDrag.value.startX
    const dy = event.clientY - pendingTokenDrag.value.startY
    const distance = Math.hypot(dx, dy)
    
    if (distance >= DRAG_THRESHOLD) {
      // Начинаем настоящий drag
      isDraggingToken.value = true
      draggingToken.value = pendingTokenDrag.value.token
      dragTokenOffset.value = pendingTokenDrag.value.offset
      
      interactionStore.startDrag(event.clientX, event.clientY, 'token')
      
      // Скрываем зону движения при начале drag
      pointerStore.hideMovementRange()
      pointerStore.hideHoveredPath()
      interactionStore.reset()
      
      console.log('[BattleMap] Начат drag токена после порога', DRAG_THRESHOLD, 'px')
    }
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
    
    // Обновляем выбранное направление при наведении на конечную точку пути
    updatePathFacingFromMouse(event)
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

// === MOUSE события для desktop ===

// Состояние для двойного клика мышью
const lastMouseClick = ref({ x: 0, y: 0, time: 0 })

const onCanvasMouseDown = (event) => {
  // Закрываем открытые dropdown при клике на canvas
  showMapList.value = false
  showTerrainPalette.value = false
  showSelectionPanel.value = false
  
  // Обновляем hoveredToken перед обработкой клика (на случай если мышь не двигалась)
  const rect = event.target.getBoundingClientRect()
  const canvasX = event.clientX - rect.left
  const canvasY = event.clientY - rect.top
  const worldPos = canvasToWorld(canvasX, canvasY, camera.value)
  const tokenUnderCursor = findTokenAtPoint(worldPos.x, worldPos.y, mapTokens.value, tokenSize.value)
  if (tokenUnderCursor !== hoveredToken.value) {
    hoveredToken.value = tokenUnderCursor
  }
  
  // Обработка инструментов указки (мастер)
  if (isMaster.value && event.button === 0 && pointerTool.value !== POINTER_TOOLS.NONE) {
    const worldPosForTool = getMouseWorld(event)
    const hex = getMouseHex(event)
    if (worldPosForTool) {
      if (pointerTool.value === POINTER_TOOLS.PING) {
        pointerStore.addPing(worldPosForTool.x, worldPosForTool.y)
        return
      } else if (pointerTool.value === POINTER_TOOLS.DRAW) {
        pointerStore.startDrawing(worldPosForTool.x, worldPosForTool.y)
        return
      } else if (pointerTool.value === POINTER_TOOLS.MEASURE && hex) {
        pointerStore.startMeasurement(worldPosForTool.x, worldPosForTool.y, hex.q, hex.r)
        return
      } else if (pointerTool.value === POINTER_TOOLS.RANGE && hex) {
        // Показываем зону досягаемости от выбранного гекса
        showRangeFromHex(hex.q, hex.r)
        return
      } else if ([POINTER_TOOLS.ARROW, POINTER_TOOLS.CIRCLE, POINTER_TOOLS.CONE, POINTER_TOOLS.LINE].includes(pointerTool.value)) {
        pointerStore.startShape(worldPosForTool.x, worldPosForTool.y)
        return
      }
      // POINTER tool не требует обработки mousedown
    }
  }
  
  // Если активен facing picker - любой клик подтверждает выбор
  if (longPressState.value.showFacingPicker) {
    confirmFacing()
    event.preventDefault()
    return
  }
  
  // Rotation ring удалён - больше не используется
  
  // ПРИОРИТЕТ: Если путь показан — любой drag (не по токену) = выбор направления
  if (event.button === 0 && 
      !event.ctrlKey &&
      interactionState.value === INTERACTION_STATE.PATH_SHOWN && 
      interactionTargetHex.value &&
      !hoveredToken.value) {
    console.log('[BattleMap] Начинаем drag для выбора направления (путь показан)')
    isDraggingFacing.value = true
    facingDragSource.value = 'path-end'
    
    // Вычисляем центр целевого гекса в screen coords (с учётом позиции канваса)
    const rect = event.target.getBoundingClientRect()
    const targetCenter = hexGrid.value.hexToPixel(interactionTargetHex.value.q, interactionTargetHex.value.r)
    facingDragCenter.value = {
      x: targetCenter.x * camera.value.zoom + camera.value.x + rect.left,
      y: targetCenter.y * camera.value.zoom + camera.value.y + rect.top
    }
    
    // Сразу вычисляем и устанавливаем facing
    const facing = getFacingFromDragAngle(facingDragCenter.value.x, facingDragCenter.value.y, event.clientX, event.clientY)
    interactionStore.setFacing(facing)
    interactionStore.startDrag(event.clientX, event.clientY, 'path-end')
    
    event.preventDefault()
    return
  }
  
  if (event.button === 1 || (event.button === 0 && event.ctrlKey && !hoveredToken.value)) {
    // Middle click or Ctrl+Left click (not on token) for panning
    isDragging.value = true
    dragStart.value = { x: event.clientX, y: event.clientY }
    event.preventDefault()
    return
  }
  
  // Мастер может перетаскивать токены только с зажатым Ctrl (админский режим)
  // Без Ctrl мастер работает как игрок: выбор направления драгом
  if (event.button === 0 && hoveredToken.value && isMaster.value && event.ctrlKey) {
    // Вычисляем смещение курсора от центра токена
    const rect = event.target.getBoundingClientRect()
    const canvasX = event.clientX - rect.left
    const canvasY = event.clientY - rect.top
    const worldPos = canvasToWorld(canvasX, canvasY, camera.value)
    
    // Сохраняем потенциальный drag, но не начинаем его сразу
    pendingTokenDrag.value = {
      token: hoveredToken.value,
      startX: event.clientX,
      startY: event.clientY,
      offset: {
        x: worldPos.x - hoveredToken.value.pixelX,
        y: worldPos.y - hoveredToken.value.pixelY
      }
    }
    
    // Выбираем токен сразу (для показа зоны движения)
    selectedToken.value = hoveredToken.value
    emit('token-selected', hoveredToken.value)
    
    // Синхронизируем с interaction store (мастер может управлять всеми)
    interactionStore.selectToken(
      hoveredToken.value.characterId,
      { q: hoveredToken.value.q, r: hoveredToken.value.r },
      true // мастер
    )
    
    // Показываем зону движения
    showMovementRangeForToken(hoveredToken.value)
    
    event.preventDefault()
    renderUI()
    return
  }
  
  // Мастер без Ctrl кликает на токен - выбирает его или начинает разворот на месте
  if (event.button === 0 && hoveredToken.value && isMaster.value && !event.ctrlKey) {
    // Если это уже выбранный токен - начинаем drag для разворота на месте
    if (selectedToken.value?.characterId === hoveredToken.value.characterId) {
      console.log('[BattleMap] Мастер кликает на выбранный токен - начинаем разворот на месте')
      isDraggingFacing.value = true
      facingDragSource.value = 'ring'
      
      // Вычисляем центр токена в screen coords
      const rect = event.target.getBoundingClientRect()
      const tokenCenter = hexGrid.value.hexToPixel(hoveredToken.value.q, hoveredToken.value.r)
      facingDragCenter.value = {
        x: tokenCenter.x * camera.value.zoom + camera.value.x + rect.left,
        y: tokenCenter.y * camera.value.zoom + camera.value.y + rect.top
      }
      
      interactionStore.startDrag(event.clientX, event.clientY, 'ring')
      event.preventDefault()
      return
    }
    
    // Иначе выбираем токен
    selectedToken.value = hoveredToken.value
    emit('token-selected', hoveredToken.value)
    
    interactionStore.selectToken(
      hoveredToken.value.characterId,
      { q: hoveredToken.value.q, r: hoveredToken.value.r },
      true
    )
    
    showMovementRangeForToken(hoveredToken.value)
    
    event.preventDefault()
    renderUI()
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
      interactionStore.reset()
      pointerStore.hideMovementRange()
      pointerStore.hideHoveredPath()
      emit('token-selected', null)
    } else {
      selectedToken.value = hoveredToken.value
      emit('token-selected', hoveredToken.value)
      
      // Синхронизируем с interaction store
      const isOwn = canControlToken(hoveredToken.value)
      interactionStore.selectToken(
        hoveredToken.value.characterId,
        { q: hoveredToken.value.q, r: hoveredToken.value.r },
        isOwn
      )
      
      // Если свой токен - показываем зону движения
      if (isOwn) {
        showMovementRangeForToken(hoveredToken.value)
      }
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
    
    // НОВАЯ ЛОГИКА: Если есть выбранный токен и мы можем им управлять - 
    // сразу начинаем drag для выбора направления (как в touch)
    if (hoveredHex.value && selectedToken.value && canControlToken(selectedToken.value)) {
      // Показываем путь к гексу
      const result = showPathToHex(hoveredHex.value)
      
      if (result) {
        console.log('[BattleMap] Mousedown на гекс с выбранным токеном - начинаем drag')
        
        // Начинаем drag для выбора направления (как в touch)
        isDraggingFacing.value = true
        facingDragSource.value = 'path-end'
        
        // Вычисляем центр целевого гекса в screen coords (с учётом позиции канваса)
        const rect = event.target.getBoundingClientRect()
        const targetCenter = hexGrid.value.hexToPixel(hoveredHex.value.q, hoveredHex.value.r)
        facingDragCenter.value = {
          x: targetCenter.x * camera.value.zoom + camera.value.x + rect.left,
          y: targetCenter.y * camera.value.zoom + camera.value.y + rect.top
        }
        
        // Устанавливаем suggestedFacing как начальное направление
        interactionStore.startDrag(event.clientX, event.clientY, 'path-end')
        
        emit('hex-selected', getHexWithTerrain(hoveredHex.value))
        event.preventDefault()
        return
      }
    }
    
    // ПРИОРИТЕТ 2: Двойной клик на пустой гекс (без своего токена) — facing picker
    if (hoveredHex.value) {
      const now = Date.now()
      const last = lastMouseClick.value
      const dx = event.clientX - last.x
      const dy = event.clientY - last.y
      const distance = Math.hypot(dx, dy)
      
      if (distance < 20 && (now - last.time) < 400) {
        // Двойной клик - открываем facing picker для перемещения/вращения
        longPressState.value.startPos = { x: event.clientX, y: event.clientY }
        longPressState.value.targetHex = hoveredHex.value
        activateFacingPicker(false)
        lastMouseClick.value = { x: 0, y: 0, time: 0 }
        return
      }
      
      // Сохраняем последний клик
      lastMouseClick.value = { x: event.clientX, y: event.clientY, time: now }
      emit('hex-selected', getHexWithTerrain(hoveredHex.value))
    } else {
      // Кликнули на пустое место - снимаем выделение токена
      if (selectedToken.value) {
        selectedToken.value = null
        selectedPathTarget.value = null
        pointerStore.hideHoveredPath()
        pointerStore.hideMovementRange()
        interactionStore.reset()
        emit('token-selected', null)
        renderUI()
      }
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
      // Начинаем транзакцию для группировки изменений в один undo
      const opType = editorMode.value === 'erase' ? 'ERASE_STROKE' : 'BRUSH_STROKE'
      battleMapStore.beginHistoryTransaction(opType, editingMap.value.id)
      applyTool(hoveredHex.value)
    }
  }
}

const onCanvasMouseUp = (event) => {
  // Обработка инструментов указки (мастер)
  if (isMaster.value && pointerTool.value !== POINTER_TOOLS.NONE) {
    if (pointerTool.value === POINTER_TOOLS.DRAW && pointerStore.currentDrawing) {
      pointerStore.finishDrawing()
      return
    } else if (pointerTool.value === POINTER_TOOLS.MEASURE && pointerStore.measurement) {
      // Измерение остаётся видимым до следующего клика или смены инструмента
      // Ничего не делаем - измерение уже показано
      return
    } else if (pointerStore.currentShape) {
      pointerStore.finishShape()
      return
    }
  }
  
  // Завершение drag для выбора направления
  if (isDraggingFacing.value) {
    // Определяем был ли это реальный drag или просто клик
    const dragDistance = interactionStore.getDragDistance()
    const isRealDrag = dragDistance > 10 // 10 пикселей - порог для drag
    
    // Если это клик (не drag) - используем suggestedFacing, иначе selectedFacing
    const facing = isRealDrag 
      ? (interactionStore.selectedFacing ?? interactionStore.suggestedFacing ?? 0)
      : (interactionStore.suggestedFacing ?? 0)
    
    console.log('[BattleMap] Завершаем drag для направления:', facingDragSource.value, 'facing:', facing, 'dragDistance:', dragDistance, 'isRealDrag:', isRealDrag)
    
    if (facingDragSource.value === 'ring') {
      // Поворот на месте - применяем сразу
      if (selectedToken.value && activeMap.value) {
        battleMapStore.rotateToken(activeMap.value.id, selectedToken.value.q, selectedToken.value.r, facing)
        
        // Отправляем обновление (для игрока - мастеру, для мастера - игрокам)
        if (sessionStore.status === 'in-room') {
          sessionStore.broadcastCharacterMove(selectedToken.value.characterId, selectedToken.value.q, selectedToken.value.r, facing)
        }
        
        emit('token-rotate', { facing })
      }
    } else if (facingDragSource.value === 'path-end') {
      // Перемещение с выбранным направлением
      if (interactionTargetHex.value) {
        emit('hex-double-tap', { 
          q: interactionTargetHex.value.q, 
          r: interactionTargetHex.value.r,
          facing,
          wasDrag: isRealDrag  // true только если был реальный drag
        })
        
        // Сбрасываем состояние
        selectedPathTarget.value = null
        pointerStore.hideHoveredPath()
        interactionStore.reset()
      }
    }
    
    isDraggingFacing.value = false
    facingDragSource.value = null
    interactionStore.endDrag()
    renderUI()
    return
  }
  
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
    pendingTokenDrag.value = null
    
    renderUI()
    return
  }
  
  // Если был pending drag, но не начался настоящий drag - это просто клик
  // Токен уже выбран в mousedown, ничего дополнительного не нужно
  if (pendingTokenDrag.value) {
    console.log('[BattleMap] Клик по токену (без drag) - токен выбран')
    pendingTokenDrag.value = null
    // Не делаем return - продолжаем обработку
  }
  
  if (isSelecting.value && selectionStart.value && hoveredHex.value) {
    // Завершаем выделение и применяем его
    applySelection()
  }
  
  // Завершаем транзакцию если было рисование
  if (isPainting.value) {
    battleMapStore.endHistoryTransaction()
  }
  
  isDragging.value = false
  isPainting.value = false
  strokeHexes.value = new Set() // Сбрасываем память мазка
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
  
  // Завершаем транзакцию если было рисование
  if (isPainting.value) {
    battleMapStore.endHistoryTransaction()
  }
  
  isPainting.value = false
  strokeHexes.value = new Set() // Сбрасываем память мазка
  
  // Очищаем указку при выходе за пределы
  if (isMaster.value && pointerTool.value === POINTER_TOOLS.POINTER) {
    pointerStore.clearPointer()
  }
  
  // Отменяем рисование
  if (pointerStore.currentDrawing) {
    pointerStore.cancelDrawing()
  }
  if (pointerStore.currentShape) {
    pointerStore.cancelShape()
  }
  
  // При выходе за пределы - отменяем перетаскивание токена
  if (isDraggingToken.value) {
    isDraggingToken.value = false
    draggingToken.value = null
    dragTokenOffset.value = { x: 0, y: 0 }
  }
  pendingTokenDrag.value = null
  
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
  
  // Получаем размер кисти
  const brushSize = brush.value?.size ?? 1
  
  // Получаем все гексы в радиусе кисти
  const grid = hexGrid.value
  if (!grid) return
  const hexesToApply = grid.getHexesInRadius(hex.q, hex.r, brushSize)
  
  if (editorMode.value === 'paint') {
    // Рисуем террейном или профилем
    const brushType = brush.value?.type ?? 'terrain'
    
    if (brushType === 'terrain') {
      // Рисуем выбранным террейном
      for (const h of hexesToApply) {
        battleMapStore.setHexTerrain(editingMap.value.id, h.q, h.r, selectedTerrain.value)
      }
    } else if (brushType === 'profile') {
      // Рисуем профилем (рандомная заливка)
      const profile = fillProfileStore.currentProfile
      if (profile) {
        // Фильтруем гексы, которые уже затронуты текущим мазком
        const newHexes = hexesToApply.filter(h => {
          const key = `${h.q},${h.r}`
          return !strokeHexes.value.has(key)
        })
        
        if (newHexes.length === 0) return // Все гексы уже обработаны
        
        // Добавляем новые гексы в память мазка
        for (const h of newHexes) {
          strokeHexes.value.add(`${h.q},${h.r}`)
        }
        
        const hexKeys = newHexes.map(h => `${h.q},${h.r}`)
        const result = applyFillProfile(profile, hexKeys, terrainStore, { probabilistic: true })
        // Применяем результат к карте (result - это Map)
        result.forEach((terrainId, key) => {
          const [q, r] = key.split(',').map(Number)
          battleMapStore.setHexTerrain(editingMap.value.id, q, r, terrainId)
        })
      }
    }
    renderTerrain()
    renderGrid()
  } else if (editorMode.value === 'erase') {
    // Удаляем гексы из карты
    const map = activeMap.value
    const terrainLayer = map?.layers.find(l => l.type === LAYER_TYPES.TERRAIN)
    if (terrainLayer) {
      for (const h of hexesToApply) {
        const key = hexKey(h.q, h.r)
        terrainLayer.data.delete(key)
      }
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
  
  // Начинаем транзакцию для группировки в один undo
  battleMapStore.beginHistoryTransaction('FILL_TERRAIN', editingMap.value.id)
  
  selectedHexes.value.forEach(key => {
    const [q, r] = key.split(',').map(Number)
    battleMapStore.setHexTerrain(editingMap.value.id, q, r, selectedTerrain.value)
  })
  
  battleMapStore.endHistoryTransaction()
  
  renderTerrain()
  renderGrid()
}

const deleteSelection = () => {
  if (selectedHexes.value.size === 0 || !activeMap.value) return
  
  const terrainLayer = activeMap.value.layers.find(l => l.type === LAYER_TYPES.TERRAIN)
  if (!terrainLayer) return
  
  // Начинаем транзакцию для группировки в один undo
  battleMapStore.beginHistoryTransaction('DELETE_HEXES', activeMap.value.id)
  
  // Удаляем через setHexTerrain с null чтобы записать в историю
  selectedHexes.value.forEach(key => {
    const [q, r] = key.split(',').map(Number)
    battleMapStore.setHexTerrain(activeMap.value.id, q, r, null)
  })
  
  battleMapStore.endHistoryTransaction()
  
  clearSelection()
  renderTerrain()
  renderGrid()
}

// ===== UNDO/REDO ОБРАБОТЧИКИ =====

const handleUndo = () => {
  battleMapStore.undo()
  renderAll()
}

const handleRedo = () => {
  battleMapStore.redo()
  renderAll()
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
  isRotateInPlace: false,    // Режим поворота на месте (long press на своём токене)
  activeToken: null          // Токен, которым управляем (для мастера)
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
    isRotateInPlace: false,
    activeToken: null
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
  
  longPressState.value.isActive = true
  longPressState.value.showFacingPicker = true
  longPressState.value.isDraggingFacing = true // Палец/мышь ещё зажаты
  longPressState.value.isRotateInPlace = isRotateInPlace
  
  // Сохраняем текущее направление персонажа
  // Для мастера: если поворот на месте — токен на гексе, если перемещение — выбранный токен
  // Для игрока — его токен
  let activeToken
  if (isMaster.value) {
    if (isRotateInPlace) {
      // Поворот на месте — берём токен на гексе
      activeToken = mapTokens.value.find(t => t.q === hex.q && t.r === hex.r)
    } else {
      // Перемещение — берём выбранный токен
      activeToken = selectedToken.value
    }
  } else {
    activeToken = mapTokens.value.find(t => t.character?.ownerId === userStore.userId)
  }
  longPressState.value.originalFacing = activeToken?.facing || 0
  longPressState.value.previewFacing = longPressState.value.originalFacing // Уже 12 направлений
  
  // Запоминаем токен для мастера
  longPressState.value.activeToken = activeToken
  
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
 * Обновить превью направления на основе позиции пальца/мыши
 * @param {number} clientX - event.clientX (экранные координаты)
 * @param {number} clientY - event.clientY (экранные координаты)
 */
const updateFacingPreview = (clientX, clientY) => {
  if (!longPressState.value.showFacingPicker || !longPressState.value.targetHex) return
  if (!uiCanvas.value) return
  
  const hex = longPressState.value.targetHex
  const grid = hexGrid.value
  if (!grid) return
  
  // Преобразуем экранные координаты мыши в координаты относительно canvas
  const rect = uiCanvas.value.getBoundingClientRect()
  const mouseCanvasX = clientX - rect.left
  const mouseCanvasY = clientY - rect.top
  
  // Центр целевого гекса в canvas-координатах
  const hexCenter = grid.hexToPixel(hex.q, hex.r)
  const screenPos = worldToCanvas(hexCenter.x, hexCenter.y)
  
  // Вектор от центра гекса к мыши (оба в canvas-координатах)
  const dx = mouseCanvasX - screenPos.x
  const dy = mouseCanvasY - screenPos.y
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
  
  // Для мастера - напрямую вращаем токен
  if (isMaster.value && longPressState.value.isRotateInPlace) {
    const activeToken = longPressState.value.activeToken
    if (activeToken && activeMap.value) {
      battleMapStore.rotateToken(activeMap.value.id, activeToken.q, activeToken.r, finalFacing)
    }
    resetLongPressState()
    return
  }
  
  // Для мастера - перемещение токена с выбором направления
  if (isMaster.value && !longPressState.value.isRotateInPlace) {
    const activeToken = longPressState.value.activeToken
    const targetHex = longPressState.value.targetHex
    if (activeToken && activeMap.value && targetHex) {
      // Перемещаем токен
      const success = battleMapStore.moveToken(
        activeMap.value.id, 
        activeToken.q, 
        activeToken.r, 
        targetHex.q, 
        targetHex.r
      )
      if (success) {
        // Устанавливаем направление
        battleMapStore.rotateToken(activeMap.value.id, targetHex.q, targetHex.r, finalFacing)
      }
    }
    resetLongPressState()
    return
  }
  
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
    // Очищаем путь после подтверждения перемещения
    pointerStore.hideHoveredPath()
    selectedPathTarget.value = null
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
  
  // Получаем активный токен (для мастера - сохранённый, для игрока - его токен)
  const activeToken = longPressState.value.activeToken ||
    mapTokens.value.find(t => t.character?.ownerId === userStore.userId)
  const character = activeToken?.character
  
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
  
  // 4. СЛОЙ: Сначала facing picker, потом поверх — защита и портрет
  // (чтобы портрет и защита были поверх секторов выбора)

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
  // 6. Защита персонажа (вращается с preview facing)
  if (activeToken && (activeToken.meleeDefence || activeToken.rangedDefence)) {
    drawDefence(
      ctx, 
      center.x, 
      center.y, 
      portraitRadius, 
      activeToken.meleeDefence, 
      activeToken.rangedDefence, 
      previewRotation, 
      { bothSides: true }
    )
  }
}

const onCanvasTouchStart = (event) => {
  event.preventDefault()
  const touches = Array.from(event.touches)
  touchState.value.touches = touches
  touchState.value.isMultiTouch = touches.length > 1

  if (touches.length === 1) {
    const touch = touches[0]
    touchState.value.lastTap = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now()
    }
    touchState.value.isPanning = false
    
    // Определяем гекс под пальцем
    const rect = event.target.getBoundingClientRect()
    const canvasX = touch.clientX - rect.left
    const canvasY = touch.clientY - rect.top
    const worldPos = canvasToWorld(canvasX, canvasY, camera.value)
    
    let touchHex = null
    if (hexGrid.value) {
      touchHex = hexGrid.value.pixelToHex(worldPos.x, worldPos.y)
    }
    
    // Проверяем токен под пальцем
    const tokenUnderFinger = findTokenAtPoint(worldPos.x, worldPos.y, mapTokens.value, tokenSize.value)
    
    // НОВАЯ ЛОГИКА: Если есть выбранный токен и мы можем им управлять
    if (selectedToken.value && canControlToken(selectedToken.value)) {
      // Запоминаем начало drag для выбора направления
      touchState.value.dragStartHex = touchHex
      touchState.value.dragStartWorld = { x: worldPos.x, y: worldPos.y }
      touchState.value.isDragForFacing = true
      isDraggingFacing.value = true // Синхронизируем с общим флагом для preview
      
      // Если touch на том же гексе где стоит токен — это будет поворот на месте
      if (touchHex && touchHex.q === selectedToken.value.q && touchHex.r === selectedToken.value.r) {
        touchState.value.isRotateInPlace = true
      } else {
        touchState.value.isRotateInPlace = false
      }
      
      console.log('[BattleMap] Touch start с выбранным токеном:', { 
        touchHex, 
        tokenPos: { q: selectedToken.value.q, r: selectedToken.value.r },
        isRotateInPlace: touchState.value.isRotateInPlace 
      })
      return
    }
    
    // Токен не выбран — обычная логика: проверяем тап по токену
    if (tokenUnderFinger) {
      // Тап по токену — запоминаем для обработки в touchEnd
      touchState.value.tappedToken = tokenUnderFinger
    }
    
  } else if (touches.length === 2) {
    // Два пальца - начало щипка для зума
    // Отменяем любой drag
    touchState.value.isDragForFacing = false
    touchState.value.isRotateInPlace = false
    isDraggingFacing.value = false // Синхронизируем
    cancelLongPress()
    
    const touch1 = touches[0]
    const touch2 = touches[1]
    const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)
    
    touchState.value.initialDistance = distance
    touchState.value.initialZoom = camera.value.zoom
    touchState.value.isPanning = false
    touchState.value.wasZooming = true
  }
}

const onCanvasTouchMove = (event) => {
  event.preventDefault()
  const touches = Array.from(event.touches)
  touchState.value.touches = touches

  // Если активен facing picker (старая логика) - обрабатываем
  if (longPressState.value.showFacingPicker && touches.length === 1) {
    const touch = touches[0]
    updateFacingPreview(touch.clientX, touch.clientY)
    return
  }

  if (touches.length === 1 && !touchState.value.isMultiTouch && !touchState.value.wasZooming) {
    const touch = touches[0]
    
    // НОВАЯ ЛОГИКА: Если есть выбранный токен и drag для facing
    if (touchState.value.isDragForFacing && selectedToken.value && canControlToken(selectedToken.value)) {
      const dx = touch.clientX - touchState.value.lastTap.x
      const dy = touch.clientY - touchState.value.lastTap.y
      const distance = Math.hypot(dx, dy)
      
      // Начинаем показывать путь после небольшого движения
      if (distance > 10) {
        // Показываем путь к начальному гексу (если не поворот на месте)
        if (!touchState.value.isRotateInPlace && touchState.value.dragStartHex) {
          // Показываем путь только при первом движении
          if (!touchState.value.pathShown) {
            showPathToHex(touchState.value.dragStartHex)
            touchState.value.pathShown = true
          }
        }
        
        // Вычисляем направление по углу drag от начальной точки
        const facing = getFacingFromDragAngle(
          touchState.value.lastTap.x, 
          touchState.value.lastTap.y, 
          touch.clientX, 
          touch.clientY
        )
        interactionStore.setFacing(facing)
        
        // Обновляем превью направления в pointerStore
        pointerStore.setPathFacing(facing)
        
        renderUI()
      }
      return
    }
    
    // Токен НЕ выбран — обычный пан
    if (touchState.value.lastTap && !touchState.value.isPanning) {
      const dx = touch.clientX - touchState.value.lastTap.x
      const dy = touch.clientY - touchState.value.lastTap.y
      const distance = Math.hypot(dx, dy)
      
      if (distance > 10) {
        touchState.value.isPanning = true
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
    // Два пальца - зум щипком + пан (даже когда токен выбран)
    
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
  const changedTouches = Array.from(event.changedTouches) // Убранные пальцы
  const remainingTouches = Array.from(event.touches)
  touchState.value.touches = remainingTouches

  // Если остались касания, обновляем состояние
  if (remainingTouches.length > 0) {
    touchState.value.isMultiTouch = remainingTouches.length > 1
    return
  }

  // Если активен facing picker (старая логика) - подтверждаем
  if (longPressState.value.showFacingPicker) {
    confirmFacing()
    resetTouchState()
    return
  }
  
  // НОВАЯ ЛОГИКА: Завершение drag для facing (когда токен выбран)
  if (touchState.value.isDragForFacing && selectedToken.value && canControlToken(selectedToken.value)) {
    const lastTouch = changedTouches[0]
    
    // Проверяем, закончился ли touch за пределами canvas
    const rect = event.target.getBoundingClientRect()
    const isOutside = !lastTouch || 
      lastTouch.clientX < rect.left || lastTouch.clientX > rect.right ||
      lastTouch.clientY < rect.top || lastTouch.clientY > rect.bottom
    
    if (isOutside) {
      // Отпустили за пределами canvas — сбрасываем выбор
      console.log('[BattleMap] Touch end вне canvas — сбрасываем выбор')
      selectedToken.value = null
      selectedPathTarget.value = null
      pointerStore.hideHoveredPath()
      pointerStore.hideMovementRange()
      interactionStore.reset()
      emit('token-selected', null)
      resetTouchState()
      renderUI()
      return
    }
    
    const facing = interactionStore.selectedFacing ?? interactionStore.suggestedFacing ?? 0
    
    // Проверяем, был ли это drag или просто тап
    const dx = lastTouch.clientX - touchState.value.lastTap.x
    const dy = lastTouch.clientY - touchState.value.lastTap.y
    const distance = Math.hypot(dx, dy)
    
    if (distance > 10) {
      // Это был drag — выполняем действие
      console.log('[BattleMap] Touch drag завершён, facing:', facing, 'isRotateInPlace:', touchState.value.isRotateInPlace)
      
      if (touchState.value.isRotateInPlace) {
        // Поворот на месте
        if (activeMap.value) {
          battleMapStore.rotateToken(activeMap.value.id, selectedToken.value.q, selectedToken.value.r, facing)
          
          if (sessionStore.status === 'in-room') {
            sessionStore.broadcastCharacterMove(selectedToken.value.characterId, selectedToken.value.q, selectedToken.value.r, facing)
          }
          
          emit('token-rotate', { facing })
        }
      } else if (touchState.value.dragStartHex) {
        // Перемещение с выбранным направлением
        emit('hex-double-tap', { 
          q: touchState.value.dragStartHex.q, 
          r: touchState.value.dragStartHex.r,
          facing,
          wasDrag: true  // Пользователь явно выбрал направление через drag
        })
        
        selectedPathTarget.value = null
        pointerStore.hideHoveredPath()
        interactionStore.reset()
      }
    } else {
      // Это был тап на выбранном токене или на другом гексе
      // Обрабатываем как обычный тап
      const canvasX = lastTouch.clientX - rect.left
      const canvasY = lastTouch.clientY - rect.top
      const worldPos = canvasToWorld(canvasX, canvasY, camera.value)
      
      let hex = null
      if (hexGrid.value) {
        hex = hexGrid.value.pixelToHex(worldPos.x, worldPos.y)
      }
      
      const tokenUnderFinger = findTokenAtPoint(worldPos.x, worldPos.y, mapTokens.value, tokenSize.value)
      handleTouchTap(tokenUnderFinger, hex)
    }
    
    resetTouchState()
    renderUI()
    return
  }

  // Отменяем long press если он ещё не активировался
  cancelLongPress()

  // Все пальцы убраны - проверяем тап (когда токен НЕ выбран)
  if (!touchState.value.isPanning && touchState.value.lastTap) {
    const timeDiff = Date.now() - touchState.value.lastTap.time
    
    if (timeDiff < 300) {
      const lastTouch = changedTouches[0]
      if (!lastTouch) {
        resetTouchState()
        return
      }
      
      const rect = event.target.getBoundingClientRect()
      const canvasX = lastTouch.clientX - rect.left
      const canvasY = lastTouch.clientY - rect.top
      const worldPos = canvasToWorld(canvasX, canvasY, camera.value)
      
      let hex = null
      if (hexGrid.value) {
        hex = hexGrid.value.pixelToHex(worldPos.x, worldPos.y)
        hoveredHex.value = hex
      }
      
      const tokenUnderFinger = findTokenAtPoint(worldPos.x, worldPos.y, mapTokens.value, tokenSize.value)
      hoveredToken.value = tokenUnderFinger
      
      handleTouchTap(tokenUnderFinger, hex)
    }
  }

  resetTouchState()
  renderUI()
}

/**
 * Сброс состояния touch
 */
const resetTouchState = () => {
  touchState.value.touches = []
  touchState.value.lastTap = null
  touchState.value.isMultiTouch = false
  touchState.value.isPanning = false
  touchState.value.wasZooming = false
  touchState.value.initialDistance = 0
  touchState.value.initialZoom = 1
  touchState.value.isDragForFacing = false
  touchState.value.isRotateInPlace = false
  touchState.value.dragStartHex = null
  touchState.value.dragStartWorld = null
  touchState.value.pathShown = false
  touchState.value.tappedToken = null
  isDraggingFacing.value = false // Синхронизируем
  
  renderUI()
}

const handleTouchTap = (token, hex) => {
  // Логика обработки тапа — унифицирована с interactionStore
  
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
      interactionStore.reset()
      pointerStore.hideMovementRange()
      pointerStore.hideHoveredPath()
      emit('token-selected', null)
    } else {
      selectedToken.value = token
      emit('token-selected', token)
      
      // Синхронизируем с interaction store
      const isOwn = canControlToken(token)
      interactionStore.selectToken(
        token.characterId,
        { q: token.q, r: token.r },
        isOwn
      )
      
      // Если свой токен - показываем зону движения
      if (isOwn) {
        showMovementRangeForToken(token)
      }
    }
    renderUI()
    return
  }
  
  // Тап в пустое место (на гекс)
  if (!token && hex) {
    // В мобильном режиме с активным действием движения - выбираем гекс
    if (props.mobileMode && props.pendingAction && props.pendingAction.id === 'move') {
      emit('action-target-selected', { type: 'hex', hex: getHexWithTerrain(hex) })
      return
    }
    
    // Сообщаем о выбранном гексе (для мобильной инфокарточки)
    emit('hex-selected', getHexWithTerrain(hex))
    
    // Если есть выбранный токен - используем interactionStore
    if (selectedToken.value && canControlToken(selectedToken.value)) {
      // Проверяем повторный тап по тому же гексу через interactionStore
      if (interactionState.value === INTERACTION_STATE.PATH_SHOWN &&
          interactionTargetHex.value?.q === hex.q &&
          interactionTargetHex.value?.r === hex.r) {
        // Повторный тап — подтверждаем перемещение
        console.log('[BattleMap] Touch: повторный тап на путь — подтверждаем перемещение')
        const facing = pointerStore.getPathFacing() ?? interactionStore.finalFacing
        emit('hex-double-tap', { ...getHexWithTerrain(hex), facing, wasDrag: false })
        selectedPathTarget.value = null
        pointerStore.hideHoveredPath()
        interactionStore.reset()
        return
      }
      
      // Первый тап на гекс - показать путь
      showPathToHex(hex)
      renderUI()
      return // Не снимаем выделение токена!
    }
    
    // Нет выбранного токена - запоминаем для возможного двойного тапа
    if (props.mobileMode) {
      const now = Date.now()
      const last = lastSelectedHex.value
      
      if (last && last.q === hex.q && last.r === hex.r && (now - last.time) < 500) {
        const facing = pointerStore.getPathFacing()
        emit('hex-double-tap', { ...getHexWithTerrain(hex), facing, wasDrag: false })
        lastSelectedHex.value = null
        return
      }
      
      lastSelectedHex.value = { q: hex.q, r: hex.r, time: now }
    }
    return
  }
  
  // Тап вне карты - снимаем выделение
  if (!token && !hex) {
    if (selectedToken.value) {
      selectedToken.value = null
      selectedPathTarget.value = null
      pointerStore.hideHoveredPath()
      pointerStore.hideMovementRange()
      interactionStore.reset()
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

const setEditorMode = (mode) => {
  battleMapStore.setEditorMode(mode)
  // Если включили режим fill — открываем панель профилей
  if (mode === 'fill') {
    showFillPanel.value = true
  }
}

const selectTerrainType = (type) => {
  battleMapStore.selectTerrain(type)
  // Переключаем на paint только если не в режиме выделения или fill
  if (editorMode.value !== 'select' && editorMode.value !== 'fill') {
    battleMapStore.setEditorMode('paint')
  }
  showTerrainPalette.value = false
}

const selectProfileType = (profileId) => {
  battleMapStore.setSelectedProfile(profileId)
  fillProfileStore.selectProfile(profileId)
}

const toggleMapPublished = () => {
  if (activeMap.value) {
    battleMapStore.toggleMapPublished(activeMap.value.id)
  }
}

const selectTokenByCharacter = (character) => {
  // Находим токен по персонажу
  const token = mapTokens.value.find(t => t.characterId === character.id)
  if (token) {
    selectedToken.value = token
    emit('token-selected', token)
    interactionStore.selectToken(
      token.characterId,
      { q: token.q, r: token.r },
      true
    )
    showMovementRangeForToken(token)
    renderUI()
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
  
  // Начинаем транзакцию для группировки в один undo
  battleMapStore.beginHistoryTransaction('FILL_PROFILE', activeMap.value.id)
  
  // Применяем результат к карте
  result.forEach((terrainId, key) => {
    const [q, r] = key.split(',').map(Number)
    battleMapStore.setHexTerrain(activeMap.value.id, q, r, terrainId)
  })
  
  battleMapStore.endHistoryTransaction()
  
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
 * Обработчик выбора профиля из модального окна
 * Устанавливает профиль для рисования кистью
 */
const onProfileSelected = (profile) => {
  if (!profile) return
  
  // Выбираем профиль в сторе
  fillProfileStore.selectProfile(profile.id)
  
  // Переключаем кисть на режим профиля
  battleMapStore.setBrushType('profile')
  
  // Закрываем модал
  showProfileModal.value = false
}

/**
 * Залить выделение текущим профилем
 */
const fillSelectionWithProfile = () => {
  const profile = fillProfileStore.currentProfile
  
  if (!profile) {
    // Если профиль не выбран - открываем модал для выбора
    showProfileModal.value = true
    return
  }
  
  if (selectedHexes.value.size === 0) {
    alert('Сначала выделите область на карте')
    return
  }
  
  applyFillToSelection(profile)
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
      sessionStore.broadcastTokens() // Синхронизируем токены (включая NPC)
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

// Экспортируем функции для родительского компонента
defineExpose({
  hexGrid,
  renderAll
})
</script>

<template>
  <div class="h-full bg-slate-950 text-slate-50 flex flex-col overflow-hidden relative">
    <!-- Тулбар (z-index выше canvas) - только для игроков на десктопе или мастера на мобильном -->
    <header v-if="(!mobileMode && !isMaster) || (mobileMode && isMaster)" class="bg-slate-900/90 backdrop-blur border-b border-white/10 px-4 py-2 flex items-center justify-between flex-shrink-0 gap-2 relative z-20">
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
        
        <!-- Панель размещения токенов (в режиме token) -->
        <template v-if="editorMode === 'token'">
          <div class="w-px h-6 bg-white/10 mx-1"></div>
          <div class="relative">
            <button
              type="button"
              class="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 transition text-xs"
              :class="showTokenPanel ? 'bg-sky-500/20 border-sky-400/60' : ''"
              @click.stop="showTokenPanel = !showTokenPanel; showTerrainPalette = false; showSelectionPanel = false; showMapList = false"
            >
              <span>👤</span>
              <span>Токены ({{ tokensToPlace.length }})</span>
              <span class="text-slate-400">▼</span>
            </button>
            
            <!-- Выпадающая панель токенов -->
            <div
              v-if="showTokenPanel"
              class="absolute top-full left-0 mt-1 w-72 bg-slate-800 border border-white/10 rounded-lg shadow-xl z-50 max-h-96 overflow-hidden flex flex-col"
              @click.stop
            >
              <!-- Поиск -->
              <div class="p-2 border-b border-white/10">
                <input
                  v-model="tokenSearch"
                  type="text"
                  class="w-full px-2 py-1.5 rounded bg-slate-900 border border-white/10 text-xs placeholder-slate-500"
                  placeholder="Поиск по имени..."
                />
              </div>
              
              <!-- Список токенов -->
              <div class="overflow-y-auto flex-1 p-2">
                <!-- Игроки -->
                <div v-if="tokensToPlace.filter(c => !c.isNpc).length" class="mb-3">
                  <p class="text-xs text-slate-400 mb-1.5 px-1">👥 Игроки</p>
                  <div class="grid grid-cols-2 gap-1">
                    <button
                      v-for="char in tokensToPlace.filter(c => !c.isNpc && (!tokenSearch || c.name.toLowerCase().includes(tokenSearch.toLowerCase())))"
                      :key="char.id"
                      type="button"
                      class="flex items-center gap-2 px-2 py-1.5 rounded text-xs border border-white/10 hover:bg-white/10 transition text-left"
                      :class="battleMapStore.findTokenPosition(activeMap?.id, char.id) ? 'bg-emerald-500/20 border-emerald-400/40' : ''"
                      @click="placeTokenOnSelected(char.id)"
                    >
                      <span class="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] flex-shrink-0 overflow-hidden">
                        <img v-if="char.portrait" :src="getPortraitUrl(char.portrait)" class="w-full h-full object-cover" />
                        <span v-else>{{ char.name?.charAt(0)?.toUpperCase() }}</span>
                      </span>
                      <span class="truncate flex-1">{{ char.name }}</span>
                      <span v-if="battleMapStore.findTokenPosition(activeMap?.id, char.id)" class="text-emerald-400">✓</span>
                    </button>
                  </div>
                </div>
                
                <!-- NPC -->
                <div v-if="tokensToPlace.filter(c => c.isNpc).length">
                  <p class="text-xs text-slate-400 mb-1.5 px-1">👹 NPC</p>
                  <div class="grid grid-cols-2 gap-1">
                    <button
                      v-for="char in tokensToPlace.filter(c => c.isNpc && (!tokenSearch || c.name.toLowerCase().includes(tokenSearch.toLowerCase())))"
                      :key="char.id"
                      type="button"
                      class="flex items-center gap-2 px-2 py-1.5 rounded text-xs border border-amber-500/30 hover:bg-amber-500/10 transition text-left"
                      :class="battleMapStore.findTokenPosition(activeMap?.id, char.id) ? 'bg-emerald-500/20 border-emerald-400/40' : ''"
                      @click="placeTokenOnSelected(char.id)"
                    >
                      <span class="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] flex-shrink-0 overflow-hidden">
                        <img v-if="char.portrait" :src="getPortraitUrl(char.portrait)" class="w-full h-full object-cover" />
                        <span v-else>{{ char.name?.charAt(0)?.toUpperCase() }}</span>
                      </span>
                      <span class="truncate flex-1">{{ char.name }}</span>
                      <span v-if="battleMapStore.findTokenPosition(activeMap?.id, char.id)" class="text-emerald-400">✓</span>
                    </button>
                  </div>
                </div>
                
                <p v-if="!tokensToPlace.length" class="text-xs text-slate-500 italic text-center py-4">Нет персонажей</p>
              </div>
            </div>
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
        :class="isDragging ? 'cursor-grabbing' : (pointerTool !== POINTER_TOOLS.NONE ? 'cursor-crosshair' : (editingMap ? 'cursor-crosshair' : 'cursor-grab'))"
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
      
      <!-- Слой указки и меток -->
      <MapPointer
        ref="mapPointerRef"
        :width="containerSize.width"
        :height="containerSize.height"
        :camera="camera"
        :hex-grid="hexGrid"
        :selected-token-position="null"
        :token-size="tokenSize"
      />
      
      <!-- Панель инструментов указки (мастер) -->
      <div 
        v-if="isMaster && showPointerToolbar" 
        class="absolute top-2 left-1/2 -translate-x-1/2 z-20"
      >
        <PointerToolbar />
      </div>
      
      <!-- Кнопка открытия панели указки (мастер) -->
      <button
        v-if="isMaster && !showPointerToolbar"
        type="button"
        class="absolute top-2 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-lg bg-slate-800/90 border border-white/10 hover:bg-slate-700 transition text-sm flex items-center gap-2"
        @click="showPointerToolbar = true"
      >
        👆 Указка
      </button>
      
      <!-- Кнопка закрытия панели указки -->
      <button
        v-if="isMaster && showPointerToolbar"
        type="button"
        class="absolute top-14 left-1/2 -translate-x-1/2 z-20 px-2 py-1 rounded bg-slate-800/80 border border-white/10 hover:bg-slate-700 transition text-xs"
        @click="showPointerToolbar = false; pointerStore.setTool(POINTER_TOOLS.NONE)"
      >
        ✕ Закрыть
      </button>
      
      <!-- Координаты под курсором - скрыты в мобильном режиме для игроков -->
      <div 
        v-if="hoveredHex && (!mobileMode || isMaster)" 
        class="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-white/10 text-xs font-mono pointer-events-none"
      >
        q: {{ hoveredHex.q }}, r: {{ hoveredHex.r }}
      </div>
      
      <!-- Zoom indicator - теперь в MapControlPanel для мастера, здесь только для игроков -->
      <div v-if="!isMaster && !mobileMode" class="absolute bottom-4 right-4 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-white/10 text-xs pointer-events-none">
        {{ Math.round(camera.zoom * 100) }}%
      </div>
      
      <!-- Левая панель инструментов редактирования (мастер) -->
      <EditorToolsPanel
        v-if="isMaster && !mobileMode"
        :editing-map="isEditingMap"
        :editor-mode="editorMode"
        :top-offset="battlePanelTopOffset"
        :selected-terrain="selectedTerrain"
        :selected-hex-count="selectedHexes.size"
        @set-editor-mode="setEditorMode"
        @toggle-editing="toggleEditing"
        @select-terrain="selectTerrainType"
        @select-profile="selectProfileType"
        @edit-profile="showProfileModal = true"
        @fill-selection="fillSelection"
        @fill-profile="fillSelectionWithProfile"
        @delete-selection="deleteSelection"
        @clear-selection="clearSelection"
        @undo="handleUndo"
        @redo="handleRedo"
      />
      
      <!-- Правая панель управления боем (мастер) -->
      <BattleControlPanel
        v-if="isMaster"
        :selected-token="selectedToken"
        :top-offset="battlePanelTopOffset"
        @select-token="selectTokenByCharacter"
        @open-character-sheet="$emit('open-character-sheet', $event)"
      />
      </div>
    </div>

    <!-- Выдвижные панели над нижней панелью -->
    <div class="relative z-30">
      <!-- Панель профилей заливки -->
      <Transition name="slide-up">
        <FillProfilePanel
          v-if="showFillPanel && isMaster && !mobileMode"
          class="absolute bottom-full left-0 right-0 max-h-[60vh] overflow-y-auto border-t border-white/10 shadow-2xl"
          @close="showFillPanel = false; clearFillPreview()"
          @preview="showFillPreview"
          @apply="applyFillToSelection"
        />
      </Transition>

      <!-- Нижняя панель управления картой (мастер) -->
      <MapControlPanel
        v-if="isMaster && !mobileMode"
        :editing-map="isEditingMap"
        :zoom="camera.zoom"
        @toggle-editing="toggleEditing"
        @toggle-visibility="toggleMapPublished"
        @delete-map="deleteCurrentMap"
        @create-map="showNewMapDialog = true"
        @select-map="selectMap"
        @center-camera="centerCamera(); renderAll()"
      />
    </div>
    
    <!-- Нижняя панель - для игроков или подсказки редактирования -->
    <footer v-if="!isMaster && !mobileMode" class="bg-slate-900/80 backdrop-blur border-t border-white/10 px-4 py-2 flex-shrink-0 relative z-10">
      <div class="flex items-center justify-between text-sm">
        <p class="text-slate-400 text-xs">
          <template v-if="editingMap">
            Рисуйте кликом/перетаскиванием • Ctrl+drag для навигации • Колёсико для зума • 🎯 центр (0,0)
          </template>
          <template v-else>
            Ctrl+перетаскивание для навигации
          </template>
        </p>
      </div>
    </footer>

    <!-- Диалог создания карты -->
    <Teleport to="body">
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
    </Teleport>
    
    <!-- Модальное окно редактора профилей -->
    <ProfileEditorModal
      :visible="showProfileModal"
      @close="showProfileModal = false"
      @select="onProfileSelected"
    />
  </div>
</template>

<style scoped>
/* Анимация выезжающих панелей */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.2s ease-out, opacity 0.2s ease-out;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>