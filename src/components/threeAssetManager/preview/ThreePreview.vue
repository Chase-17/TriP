<template>
  <div class="three-preview" ref="containerRef">
    <canvas 
      ref="canvasRef"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @wheel="onWheel"
      @contextmenu.prevent
    ></canvas>
    
    <!-- Панель управления -->
    <div class="preview-controls">
      <button 
        :class="['control-btn', { active: viewMode === '3d' }]"
        @click="setViewMode('3d')"
        title="3D вид"
      >
        🎲
      </button>
      <button 
        :class="['control-btn', { active: viewMode === '2d' }]"
        @click="setViewMode('2d')"
        title="2D вид сверху"
      >
        ⬜
      </button>
      <div class="control-separator"></div>
      <button 
        class="control-btn"
        @click="resetCamera"
        title="Сбросить камеру"
      >
        ⌂
      </button>
      <button 
        class="control-btn"
        @click="zoomIn"
        title="Приблизить"
      >
        +
      </button>
      <button 
        class="control-btn"
        @click="zoomOut"
        title="Отдалить"
      >
        −
      </button>
    </div>
    
    <!-- Информация о выбранном гексе -->
    <div class="preview-info" v-if="hoveredHex">
      Гекс ({{ hoveredHex.q }}, {{ hoveredHex.r }})
      <span v-if="hoveredHex.terrain"> • {{ hoveredHex.terrain.name || hoveredHex.terrain.id }}</span>
    </div>
    
    <!-- Подсказка -->
    <div class="preview-hint">
      ЛКМ: выбор • ПКМ: вращение • Колёсико: масштаб • СКМ: панорама
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, shallowRef } from 'vue'
import * as THREE from 'three'
import { usePatchBoundaries, edgesToPolyline, smoothPolylineOpen, straightenPolylineOpen } from '@/composables/usePatchBoundaries'

const props = defineProps({
  terrain: {
    type: Object,
    default: null,
  },
  structure: {
    type: Object,
    default: null,
  },
  terrains: {
    type: Array,
    default: () => [],
  },
  // Transition rules for terrain edges
  rules: {
    type: Array,
    default: () => [],
  },
  // Режим рисования: если указан selectedTerrain, то ЛКМ рисует
  paintMode: {
    type: Boolean,
    default: false,
  },
  // ID выбранного террейна для рисования
  selectedTerrainId: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(['ready', 'hex-click', 'hex-hover', 'hex-paint', 'camera-change'])

const containerRef = ref(null)
const canvasRef = ref(null)
const hoveredHex = ref(null)
const viewMode = ref('2d') // '3d' | '2d' - по умолчанию ортогональная камера

// Map state - stores terrain for each hex
const hexMapState = ref(new Map()) // key: "q,r" -> terrainId

// Three.js objects
let renderer = null
let scene = null
let camera = null
let perspectiveCamera = null
let orthoCamera = null
let animationId = null
let hexMeshes = []  // Для обратной совместимости с raycasting
let highlightMesh = null
let groundPlane = null  // Невидимая плоскость для raycast при рисовании новых гексов

// Unified mesh objects
let unifiedMesh = null
let hexVertexMap = new Map()  // key: "q,r" -> { startIndex, vertexCount }
let hexCoordsArray = []       // Массив всех hex координат для итерации

// Terrain data texture
let terrainDataTexture = null
let terrainColorsTexture = null
let terrainLayersTexture = null  // Stores layer data for each terrain
let transitionRulesTexture = null  // Stores transition rules data
let patchSDFTexture = null  // CPU-computed SDF for patch boundaries
let debugBoundariesGroup = null  // Debug visualization of patch boundaries
const TERRAIN_DATA_SIZE = 32  // 32x32 grid for hex data (enough for radius 15)
const MAX_TERRAINS = 32
const MAX_LAYERS_PER_TERRAIN = 8
const LAYER_DATA_WIDTH = 8  // 8 floats per layer
const MAP_CENTER_OFFSET = 15  // Center offset in data texture
const MAX_RULES = 64  // Max transition rules
const RULE_DATA_WIDTH = 16  // 16 floats per rule (effects data)
const PATCH_SDF_SIZE = 256  // SDF texture size for patch boundaries (256 for fast testing, 1024 for production)

// Patch boundaries system (CPU-side computation)
const patchBoundaries = usePatchBoundaries()

// Debounce timer for patch SDF updates
let patchSDFUpdateTimer = null
const PATCH_SDF_DEBOUNCE_MS = 100  // Update SDF 100ms after last paint stroke

function schedulePatchSDFUpdate() {
  if (patchSDFUpdateTimer) {
    clearTimeout(patchSDFUpdateTimer)
  }
  patchSDFUpdateTimer = setTimeout(() => {
    updatePatchSDFTexture()
    patchSDFUpdateTimer = null
  }, PATCH_SDF_DEBOUNCE_MS)
}

// Camera state
let cameraState = {
  target: new THREE.Vector3(0, 0, 0),
  distance: 15,
  phi: Math.PI / 4,      // Угол от вертикали (0 = сверху, PI/2 = сбоку)
  theta: Math.PI / 4,    // Угол вращения вокруг Y
  zoom: 1,
}

// Mouse state
let mouseState = {
  isLeftDown: false,
  isRightDown: false,
  isMiddleDown: false,
  lastX: 0,
  lastY: 0,
}

// Constants
const HEX_SIZE = 1
const HEX_HEIGHT = 0.2
const DEFAULT_MAP_RADIUS = 3  // Начальный радиус карты
let currentMapRadius = DEFAULT_MAP_RADIUS  // Текущий радиус (расширяется автоматически)
const MIN_ZOOM = 0.3
const MAX_ZOOM = 3
const ROTATE_SPEED = 0.005

// Raycaster
const raycaster = new THREE.Raycaster()
const mouse = new THREE.Vector2()

// Create hex shape
function createHexShape(size) {
  const shape = new THREE.Shape()
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    const x = size * Math.cos(angle)
    const y = size * Math.sin(angle)
    if (i === 0) {
      shape.moveTo(x, y)
    } else {
      shape.lineTo(x, y)
    }
  }
  shape.closePath()
  return shape
}

// Hex to world position (pointy-top)
function hexToWorld(q, r) {
  const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2)
  const z = HEX_SIZE * 1.5 * r
  return { x, z }
}

// World position to hex coordinates (pointy-top)
function worldToHex(worldX, worldZ) {
  // Обратное преобразование от hexToWorld
  const r = worldZ / (HEX_SIZE * 1.5)
  const q = worldX / (HEX_SIZE * Math.sqrt(3)) - r / 2
  
  // Округление до ближайшего гекса (cube rounding)
  const s = -q - r
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
  
  return { q: rq, r: rr }
}

// Initialize Three.js
function init() {
  if (!containerRef.value || !canvasRef.value) return

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
  })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x0a0a1a)

  // Scene
  scene = new THREE.Scene()

  // Perspective Camera (для 3D режима)
  perspectiveCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
  
  // Orthographic Camera (для 2D режима)
  const frustumSize = 15
  const aspect = width / height
  orthoCamera = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.1,
    1000
  )
  
  // Устанавливаем камеру в соответствии с viewMode
  camera = viewMode.value === '2d' ? orthoCamera : perspectiveCamera
  updateCameraPosition()

  // Lights
  const ambientLight = new THREE.AmbientLight(0x606080, 0.7)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9)
  directionalLight.position.set(5, 15, 5)
  directionalLight.castShadow = true
  scene.add(directionalLight)

  // Hemisphere light for better ambient
  const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3d5c3d, 0.3)
  scene.add(hemiLight)

  // Create highlight mesh (для подсветки при наведении)
  // Создаём гексагональную обводку из линий
  const highlightPoints = []
  for (let i = 0; i <= 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6  // pointy-top
    highlightPoints.push(new THREE.Vector3(
      HEX_SIZE * 0.98 * Math.cos(angle),
      0,
      HEX_SIZE * 0.98 * Math.sin(angle)
    ))
  }
  const highlightGeometry = new THREE.BufferGeometry().setFromPoints(highlightPoints)
  const highlightMaterial = new THREE.LineBasicMaterial({ 
    color: 0xffff00, 
    linewidth: 2,
  })
  highlightMesh = new THREE.Line(highlightGeometry, highlightMaterial)
  highlightMesh.visible = false
  highlightMesh.position.y = 0.25
  scene.add(highlightMesh)

  // Create invisible ground plane for raycast (for painting new hexes)
  const planeGeometry = new THREE.PlaneGeometry(100, 100)
  planeGeometry.rotateX(-Math.PI / 2)  // Горизонтальная плоскость
  const planeMaterial = new THREE.MeshBasicMaterial({ visible: false })
  groundPlane = new THREE.Mesh(planeGeometry, planeMaterial)
  groundPlane.userData.isGroundPlane = true
  scene.add(groundPlane)

  // Create hex grid
  createHexGrid()

  // Emit ready
  emit('ready', { resetCamera, setViewMode, clearHexMap, getHexMap, setHexMap, getCameraState, setCameraState })

  // Start animation
  animate()
}

// Очистить карту нарисованных террейнов
function clearHexMap() {
  hexMapState.value.clear()
  currentMapRadius = DEFAULT_MAP_RADIUS
  createHexGrid() // Перестроить грид с дефолтными террейнами
}

// Получить текущую карту террейнов
function getHexMap() {
  return Object.fromEntries(hexMapState.value)
}

// Загрузить карту террейнов из объекта
function setHexMap(mapData) {
  hexMapState.value.clear()
  
  if (!mapData || Object.keys(mapData).length === 0) {
    // Пустая карта - создаём дефолтную
    currentMapRadius = DEFAULT_MAP_RADIUS
    createHexGrid()
    return
  }
  
  // Загружаем данные и вычисляем границы
  let maxCoord = 0
  for (const [key, terrainId] of Object.entries(mapData)) {
    hexMapState.value.set(key, terrainId)
    const [q, r] = key.split(',').map(Number)
    maxCoord = Math.max(maxCoord, Math.abs(q), Math.abs(r))
  }
  
  currentMapRadius = Math.max(DEFAULT_MAP_RADIUS, maxCoord)
  createHexGrid()
}

// Получить состояние камеры для сохранения
function getCameraState() {
  return {
    x: cameraState.target.x,
    z: cameraState.target.z,
    zoom: cameraState.zoom,
    phi: cameraState.phi,
    theta: cameraState.theta,
    viewMode: viewMode.value,
  }
}

// Восстановить состояние камеры
function setCameraState(state) {
  if (!state) return
  
  if (state.viewMode) {
    viewMode.value = state.viewMode
  }
  if (typeof state.x === 'number') {
    cameraState.target.x = state.x
  }
  if (typeof state.z === 'number') {
    cameraState.target.z = state.z
  }
  if (typeof state.zoom === 'number') {
    cameraState.zoom = state.zoom
  }
  if (typeof state.phi === 'number') {
    cameraState.phi = state.phi
  }
  if (typeof state.theta === 'number') {
    cameraState.theta = state.theta
  }
  
  updateCameraPosition()
}

// Update camera position based on state
function updateCameraPosition() {
  if (!camera) return

  const { target, distance, phi, theta, zoom } = cameraState
  
  if (viewMode.value === '2d') {
    // Orthographic - камера строго сверху
    camera.position.set(target.x, 50, target.z)
    camera.lookAt(target.x, 0, target.z)
    
    // Обновляем frustum для zoom
    if (camera.isOrthographicCamera && containerRef.value) {
      const frustumSize = 15 / zoom
      const aspect = containerRef.value.clientWidth / containerRef.value.clientHeight
      camera.left = -frustumSize * aspect / 2
      camera.right = frustumSize * aspect / 2
      camera.top = frustumSize / 2
      camera.bottom = -frustumSize / 2
      camera.updateProjectionMatrix()
    }
  } else {
    // Perspective - сферические координаты
    const x = target.x + distance * Math.sin(phi) * Math.cos(theta) / zoom
    const y = target.y + distance * Math.cos(phi) / zoom
    const z = target.z + distance * Math.sin(phi) * Math.sin(theta) / zoom

    camera.position.set(x, y, z)
    camera.lookAt(target)
    
    if (camera.isPerspectiveCamera) {
      camera.fov = 45 / zoom
      camera.updateProjectionMatrix()
    }
  }
}

// Set view mode
function setViewMode(mode) {
  viewMode.value = mode
  
  if (mode === '2d') {
    // Переключаемся на ортографическую камеру
    camera = orthoCamera
  } else {
    // Переключаемся на перспективную камеру
    camera = perspectiveCamera
    cameraState.phi = Math.PI / 4
    cameraState.theta = Math.PI / 4
  }
  
  // Обновляем освещение: плоское для 2D, 3D для перспективы
  updateLightingMode()
  updateCameraPosition()
}

// Обновить режим освещения в зависимости от камеры
function updateLightingMode() {
  if (!unifiedMesh || !unifiedMesh.material) return
  
  // В 2D режиме — полностью плоское освещение
  // В 3D режиме — классическое 3D освещение
  unifiedMesh.material.uniforms.uFlatLighting.value = viewMode.value === '2d' ? 1.0 : 0.0
}

// Reset camera
function resetCamera() {
  cameraState.target.set(0, 0, 0)
  cameraState.distance = 15
  cameraState.zoom = 1
  
  if (viewMode.value === '3d') {
    cameraState.phi = Math.PI / 4
    cameraState.theta = Math.PI / 4
  }
  
  updateCameraPosition()
}

// Zoom functions
function zoomIn() {
  cameraState.zoom = Math.min(MAX_ZOOM, cameraState.zoom * 1.2)
  updateCameraPosition()
}

function zoomOut() {
  cameraState.zoom = Math.max(MIN_ZOOM, cameraState.zoom / 1.2)
  updateCameraPosition()
}

// Mouse handlers
function onMouseDown(event) {
  const rect = canvasRef.value.getBoundingClientRect()
  mouseState.lastX = event.clientX - rect.left
  mouseState.lastY = event.clientY - rect.top

  if (event.button === 0) {
    mouseState.isLeftDown = true
    // Клик левой кнопкой - выбор гекса
    handleHexClick(event)
  } else if (event.button === 2) {
    mouseState.isRightDown = true
  } else if (event.button === 1) {
    mouseState.isMiddleDown = true
  }
}

function onMouseMove(event) {
  const rect = canvasRef.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  
  const deltaX = x - mouseState.lastX
  const deltaY = y - mouseState.lastY

  // Вращение камеры (ПКМ)
  if (mouseState.isRightDown && viewMode.value === '3d') {
    cameraState.theta -= deltaX * ROTATE_SPEED
    cameraState.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, cameraState.phi + deltaY * ROTATE_SPEED))
    updateCameraPosition()
  }

  // Панорамирование (СКМ или ПКМ в 2D)
  if (mouseState.isMiddleDown || (mouseState.isRightDown && viewMode.value === '2d')) {
    
    if (viewMode.value === '2d') {
      // В 2D режиме - точное соответствие пикселей экрана и мировых координат
      // Вычисляем размер frustum в мировых единицах
      const frustumSize = 15 / cameraState.zoom
      const aspect = rect.width / rect.height
      const worldWidth = frustumSize * aspect
      const worldHeight = frustumSize
      
      // Пиксели в мировые единицы
      const worldDeltaX = (deltaX / rect.width) * worldWidth
      const worldDeltaZ = (deltaY / rect.height) * worldHeight
      
      cameraState.target.x -= worldDeltaX
      cameraState.target.z -= worldDeltaZ
    } else {
      // В 3D режиме - приблизительное панорамирование
      const panSpeed = 0.02 / cameraState.zoom
      const cos = Math.cos(cameraState.theta)
      const sin = Math.sin(cameraState.theta)
      
      const panX = -deltaX * panSpeed
      const panZ = -deltaY * panSpeed
      
      cameraState.target.x += panX * cos + panZ * sin
      cameraState.target.z += -panX * sin + panZ * cos
    }
    
    updateCameraPosition()
  }

  mouseState.lastX = x
  mouseState.lastY = y

  // Raycast для подсветки гекса
  updateHexHover(event)
  
  // Paint mode - рисуем при перетаскивании ЛКМ
  if (mouseState.isLeftDown && props.paintMode && props.selectedTerrainId && hoveredHex.value) {
    paintHex(hoveredHex.value.q, hoveredHex.value.r)
  }
}

function onMouseUp(event) {
  const wasDragging = mouseState.isRightDown || mouseState.isMiddleDown
  mouseState.isLeftDown = false
  mouseState.isRightDown = false
  mouseState.isMiddleDown = false
  
  // Emit camera change after pan/rotate
  if (wasDragging) {
    emit('camera-change', getCameraState())
  }
}

function onWheel(event) {
  event.preventDefault()
  
  const delta = event.deltaY > 0 ? 0.9 : 1.1
  cameraState.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cameraState.zoom * delta))
  
  updateCameraPosition()
  
  // Emit camera change after zoom
  emit('camera-change', getCameraState())
}

// Raycast для определения гекса под курсором
function updateHexHover(event) {
  if (!canvasRef.value || !camera) return

  const rect = canvasRef.value.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  
  // Сначала проверяем существующие гексы
  const intersects = raycaster.intersectObjects(hexMeshes)
  
  if (intersects.length > 0) {
    const hit = intersects[0]
    const userData = hit.object.userData
    
    hoveredHex.value = {
      q: userData.q,
      r: userData.r,
      terrain: userData.terrain,
      isNew: false,
    }
    
    // Показываем подсветку - линия лежит в плоскости Y, поднимаем чуть выше гекса
    const { x, z } = hexToWorld(userData.q, userData.r)
    const elevation = (userData.terrain?.elevation || 0) * 0.3
    highlightMesh.position.set(x, elevation + HEX_HEIGHT + 0.02, z)
    highlightMesh.visible = true
    
    emit('hex-hover', hoveredHex.value)
  } else if (props.paintMode && groundPlane) {
    // В режиме рисования - проверяем пересечение с плоскостью для новых гексов
    const planeIntersects = raycaster.intersectObject(groundPlane)
    if (planeIntersects.length > 0) {
      const point = planeIntersects[0].point
      const hexCoord = worldToHex(point.x, point.z)
      
      // Проверяем что координаты в допустимых пределах
      if (Math.abs(hexCoord.q) <= MAP_CENTER_OFFSET && Math.abs(hexCoord.r) <= MAP_CENTER_OFFSET) {
        const isExisting = isHexInCurrentGrid(hexCoord.q, hexCoord.r)
        
        hoveredHex.value = {
          q: hexCoord.q,
          r: hexCoord.r,
          terrain: isExisting ? getTerrainForHex(hexCoord.q, hexCoord.r) : null,
          isNew: !isExisting,
        }
        
        // Показываем подсветку
        const { x, z } = hexToWorld(hexCoord.q, hexCoord.r)
        highlightMesh.position.set(x, HEX_HEIGHT + 0.02, z)
        highlightMesh.visible = true
        
        emit('hex-hover', hoveredHex.value)
      } else {
        hoveredHex.value = null
        highlightMesh.visible = false
      }
    } else {
      hoveredHex.value = null
      highlightMesh.visible = false
    }
  } else {
    hoveredHex.value = null
    highlightMesh.visible = false
  }
}

// Обработка клика на гекс
function handleHexClick(event) {
  if (!hoveredHex.value) return
  
  // В paint mode - рисуем террейн
  if (props.paintMode && props.selectedTerrainId) {
    paintHex(hoveredHex.value.q, hoveredHex.value.r)
    return
  }
  
  emit('hex-click', hoveredHex.value)
}

// Проверить, нужно ли пересоздать mesh (новый гекс за пределами текущей сетки)
function isHexInCurrentGrid(q, r) {
  return hexCoordsArray.some(h => h.q === q && h.r === r)
}

// Добавить новый гекс и пересоздать mesh
function addHexToGrid(q, r) {
  if (isHexInCurrentGrid(q, r)) return false
  
  // Добавляем гекс в массив
  hexCoordsArray.push({ q, r })
  
  // Пересоздаём mesh с новым гексом
  rebuildGridMesh()
  return true
}

// Пересоздать mesh для текущего набора гексов
function rebuildGridMesh() {
  if (!scene || !unifiedMesh) return
  
  // Удаляем старый mesh
  scene.remove(unifiedMesh)
  unifiedMesh.geometry.dispose()
  
  // Создаём новую geometry
  const { geometry, vertexMap } = createUnifiedHexGeometry(hexCoordsArray)
  hexVertexMap = vertexMap
  
  // Сохраняем старый material
  const material = unifiedMesh.material
  
  // Создаём новый mesh
  unifiedMesh = new THREE.Mesh(geometry, material)
  scene.add(unifiedMesh)
  
  // Обновляем terrain data для всех гексов
  fillTerrainDataTexture()
  
  // Пересоздаём proxy meshes для raycasting
  createProxyMeshes(hexCoordsArray)
}

// Рисование террейна на гексе
function paintHex(q, r) {
  if (!props.selectedTerrainId) return
  
  const key = `${q},${r}`
  const currentTerrainId = hexMapState.value.get(key)
  
  // Если уже этот террейн - ничего не делаем
  if (currentTerrainId === props.selectedTerrainId) return
  
  // Если гекса нет в сетке - добавляем
  const wasAdded = addHexToGrid(q, r)
  
  // Сохраняем в map
  hexMapState.value.set(key, props.selectedTerrainId)
  
  // Находим террейн и обновляем unified mesh + data texture для шейдера
  const terrain = props.terrains.find(t => t.id === props.selectedTerrainId)
  const terrainIndex = props.terrains.findIndex(t => t.id === props.selectedTerrainId)
  if (terrain && terrainIndex >= 0) {
    // Если гекс был добавлен, mesh уже пересоздан с правильными данными
    if (!wasAdded) {
      updateHexColor(q, r, terrain)
    }
    // Обновляем data texture для шейдера (realtime preview)
    const elevation = typeof terrain.elevation === 'object' 
      ? (terrain.elevation?.base || 0) 
      : (terrain.elevation || 0)
    updateTerrainDataTexture(q, r, terrainIndex, terrain.layers?.length || 0, elevation)
  }
  
  // Обновляем CPU-computed patch SDF (инкрементально)
  // Используем debounce для избежания частых пересчётов при рисовании
  schedulePatchSDFUpdate()
  
  emit('hex-paint', { q, r, terrainId: props.selectedTerrainId })
}

// Create hex grid - unified mesh version
function createHexGrid() {
  clearHexes()
  
  // Собираем все hex координаты из hexMapState или генерируем дефолтную карту
  hexCoordsArray = []
  
  if (hexMapState.value.size > 0) {
    // Используем гексы из сохранённой карты
    for (const key of hexMapState.value.keys()) {
      const [q, r] = key.split(',').map(Number)
      hexCoordsArray.push({ q, r })
    }
  } else {
    // Генерируем дефолтную карту в радиусе currentMapRadius
    for (let q = -currentMapRadius; q <= currentMapRadius; q++) {
      for (let r = -currentMapRadius; r <= currentMapRadius; r++) {
        const s = -q - r
        if (Math.abs(q) > currentMapRadius || Math.abs(r) > currentMapRadius || Math.abs(s) > currentMapRadius) {
          continue
        }
        hexCoordsArray.push({ q, r })
      }
    }
  }
  
  // Создаём unified geometry
  const { geometry, vertexMap } = createUnifiedHexGeometry(hexCoordsArray)
  hexVertexMap = vertexMap
  
  // Custom ShaderMaterial для terrain rendering
  const material = createTerrainShaderMaterial()
  
  unifiedMesh = new THREE.Mesh(geometry, material)
  scene.add(unifiedMesh)
  
  // Устанавливаем режим освещения согласно текущему режиму камеры
  updateLightingMode()
  
  // Заполняем terrain data texture для каждого гекса
  fillTerrainDataTexture()
  
  // Генерируем CPU-computed patch SDF для smooth transitions
  updatePatchSDFTexture()
  
  // Для совместимости с raycasting создаём невидимые proxy-меши
  createProxyMeshes(hexCoordsArray)
}

// Fill terrain data texture with hex terrain assignments
function fillTerrainDataTexture() {
  if (!terrainDataTexture) return
  
  const data = terrainDataTexture.image.data
  
  for (const { q, r } of hexCoordsArray) {
    const terrainDef = getTerrainForHex(q, r)
    
    // Find terrain index in props.terrains
    let terrainIndex = props.terrains.findIndex(t => t.id === terrainDef.id)
    if (terrainIndex < 0) terrainIndex = 0
    
    const layerCount = terrainDef.layers?.length || 0
    const elevation = typeof terrainDef.elevation === 'object' 
      ? (terrainDef.elevation?.base || 0) 
      : (terrainDef.elevation || 0)
    
    const x = q + MAP_CENTER_OFFSET
    const y = r + MAP_CENTER_OFFSET
    const idx = (y * TERRAIN_DATA_SIZE + x) * 4
    
    data[idx + 0] = terrainIndex / 255  // normalized terrainId
    data[idx + 1] = layerCount / 8      // normalized layerCount
    data[idx + 2] = elevation
    data[idx + 3] = 1
  }
  
  terrainDataTexture.needsUpdate = true
}

// Create terrain shader material
function createTerrainShaderMaterial() {
  // Create initial data textures
  createTerrainDataTextures()
  
  // Fill textures with terrain data
  updateTerrainColorsTexture()
  updateTerrainLayersTexture()
  updateTransitionRulesTexture()
  
  // Create patchSDF texture (CPU-computed signed distance field)
  createPatchSDFTexture()
  
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFlatLighting: { value: 1.0 },  // 1.0 = полностью плоское, 0.0 = 3D освещение
      uDebugSDFMode: { value: 0 },  // 0=off, 1=show SDF match, 2=show terrain IDs, 3=show SDF distance
      uAmbientLight: { value: new THREE.Color(0xffffff) },
      uDirectionalLight: { value: new THREE.Color(0xffffff) },
      uLightDirection: { value: new THREE.Vector3(0.3, 0.9, 0.3).normalize() },
      uTerrainData: { value: terrainDataTexture },
      uTerrainColors: { value: terrainColorsTexture },
      uTerrainLayers: { value: terrainLayersTexture },
      uTransitionRules: { value: transitionRulesTexture },
      uPatchSDF: { value: patchSDFTexture },
      uPatchSDFBounds: { value: new THREE.Vector4(-20, -20, 20, 20) },  // minX, minZ, maxX, maxZ
      uDataSize: { value: TERRAIN_DATA_SIZE },
      uHexRadius: { value: MAP_CENTER_OFFSET },
      uMaxLayers: { value: MAX_LAYERS_PER_TERRAIN },
      uLayerDataWidth: { value: LAYER_DATA_WIDTH },
      uMaxRules: { value: MAX_RULES },
      uRuleDataWidth: { value: RULE_DATA_WIDTH },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute vec2 hexCoord;  // q, r coordinates
      
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vHexCoord;
      varying vec2 vWorldXZ;
      
      void main() {
        vColor = color;
        vNormal = normalMatrix * normal;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vPosition = worldPos.xyz;
        vWorldXZ = worldPos.xz;
        vHexCoord = hexCoord;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uFlatLighting;
      uniform int uDebugSDFMode;  // 0=off, 1=show SDF match, 2=show terrain IDs, 3=show SDF distance
      uniform vec3 uAmbientLight;
      uniform vec3 uDirectionalLight;
      uniform vec3 uLightDirection;
      uniform sampler2D uTerrainData;
      uniform sampler2D uTerrainColors;
      uniform sampler2D uTerrainLayers;
      uniform sampler2D uTransitionRules;
      uniform sampler2D uPatchSDF;  // CPU-computed patch boundary SDF
      uniform vec4 uPatchSDFBounds;  // minX, minZ, maxX, maxZ
      uniform float uDataSize;
      uniform float uHexRadius;
      uniform float uMaxLayers;
      uniform float uLayerDataWidth;
      uniform float uMaxRules;
      uniform float uRuleDataWidth;
      
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vHexCoord;
      varying vec2 vWorldXZ;
      
      // ============ NOISE FUNCTIONS ============
      
      // Hash functions
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      
      float hash3(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }
      
      vec2 hash2(vec2 p) {
        return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
      }
      
      // Value noise
      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }
      
      // Perlin-like gradient noise
      vec2 grad(vec2 p) {
        float a = hash(p) * 6.283185;
        return vec2(cos(a), sin(a));
      }
      
      float perlinNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        
        float a = dot(grad(i), f);
        float b = dot(grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
        float c = dot(grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
        float d = dot(grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
        
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.5 + 0.5;
      }
      
      // Raw perlin noise returning -1 to 1 (for ridged noise)
      float perlinNoiseRaw(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        
        float a = dot(grad(i), f);
        float b = dot(grad(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
        float c = dot(grad(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
        float d = dot(grad(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
        
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);  // -1 to 1 range
      }
      
      // Simplex-like noise (simplified 2D)
      float simplexNoise(vec2 p) {
        const float K1 = 0.366025404; // (sqrt(3)-1)/2
        const float K2 = 0.211324865; // (3-sqrt(3))/6
        
        vec2 i = floor(p + (p.x + p.y) * K1);
        vec2 a = p - i + (i.x + i.y) * K2;
        float m = step(a.y, a.x);
        vec2 o = vec2(m, 1.0 - m);
        vec2 b = a - o + K2;
        vec2 c = a - 1.0 + 2.0 * K2;
        
        vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
        vec3 n = h * h * h * h * vec3(
          dot(a, grad(i)),
          dot(b, grad(i + o)),
          dot(c, grad(i + 1.0))
        );
        
        return dot(n, vec3(70.0)) * 0.5 + 0.5;
      }
      
      // Voronoi noise (distance to nearest cell)
      float voronoiNoise(vec2 p, float smoothness) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        
        float minDist = 1.0;
        
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = hash2(i + neighbor);
            vec2 diff = neighbor + point - f;
            float dist = length(diff);
            minDist = min(minDist, dist);
          }
        }
        
        return minDist;
      }
      
      // Cellular noise (F2 - F1 for cell boundaries)
      float cellularNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        
        float d1 = 1.0;  // distance to nearest
        float d2 = 1.0;  // distance to second nearest
        
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = hash2(i + neighbor);
            vec2 diff = neighbor + point - f;
            float dist = length(diff);
            
            if (dist < d1) {
              d2 = d1;
              d1 = dist;
            } else if (dist < d2) {
              d2 = dist;
            }
          }
        }
        
        return d2 - d1;  // Edge detection between cells
      }
      
      // Worley noise (F1 * F2 for different look)
      float worleyNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        
        float d1 = 1.0;
        float d2 = 1.0;
        
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 point = hash2(i + neighbor);
            vec2 diff = neighbor + point - f;
            float dist = dot(diff, diff);  // squared distance for different look
            
            if (dist < d1) {
              d2 = d1;
              d1 = dist;
            } else if (dist < d2) {
              d2 = dist;
            }
          }
        }
        
        return sqrt(d1);
      }
      
      // White noise (pure random per pixel)
      float whiteNoise(vec2 p) {
        return hash(floor(p * 100.0));
      }
      
      // FBM (Fractal Brownian Motion)
      float fbm(vec2 p, int octaves, float persistence, float lacunarity) {
        float value = 0.0;
        float amplitude = 1.0;
        float frequency = 1.0;
        float maxValue = 0.0;
        
        for (int i = 0; i < 8; i++) {
          if (i >= octaves) break;
          value += amplitude * valueNoise(p * frequency);
          maxValue += amplitude;
          amplitude *= persistence;
          frequency *= lacunarity;
        }
        
        return value / maxValue;
      }
      
      // FBM with Perlin base
      float fbmPerlin(vec2 p, int octaves, float persistence, float lacunarity) {
        float value = 0.0;
        float amplitude = 1.0;
        float frequency = 1.0;
        float maxValue = 0.0;
        
        for (int i = 0; i < 8; i++) {
          if (i >= octaves) break;
          value += amplitude * perlinNoise(p * frequency);
          maxValue += amplitude;
          amplitude *= persistence;
          frequency *= lacunarity;
        }
        
        return value / maxValue;
      }
      
      // Domain Warped FBM - organic, fibrous patterns perfect for vegetation
      float warpedNoise(vec2 p, float warpStrength, int octaves, float persistence, float lacunarity) {
        // First layer of warping
        vec2 warp1 = vec2(
          fbmPerlin(p + vec2(0.0, 0.0), octaves, persistence, lacunarity),
          fbmPerlin(p + vec2(5.2, 1.3), octaves, persistence, lacunarity)
        );
        
        // Second layer of warping for more complexity
        vec2 warp2 = vec2(
          fbmPerlin(p + warpStrength * warp1 + vec2(1.7, 9.2), octaves, persistence, lacunarity),
          fbmPerlin(p + warpStrength * warp1 + vec2(8.3, 2.8), octaves, persistence, lacunarity)
        );
        
        // Final noise with double warping
        return fbmPerlin(p + warpStrength * warp2, octaves, persistence, lacunarity);
      }
      
      // Directional/Fibrous warping - elongated streaks good for grass
      float fibrousNoise(vec2 p, float warpStrength, float direction, int octaves, float persistence, float lacunarity) {
        // Direction in radians
        float rad = direction * 3.14159 / 180.0;
        vec2 dir = vec2(cos(rad), sin(rad));
        vec2 perp = vec2(-sin(rad), cos(rad));
        
        // Stretch coordinates along direction
        vec2 stretched = vec2(dot(p, dir) * 0.5, dot(p, perp) * 2.0);
        
        // Warp along the stretch direction
        float warp = fbmPerlin(stretched + vec2(3.1, 7.4), octaves, persistence, lacunarity);
        
        // Apply directional warping
        vec2 warped = p + dir * warp * warpStrength;
        
        return fbmPerlin(warped, octaves, persistence, lacunarity);
      }
      
      // Ridged noise - sharp ridges, great for rocks, cracks, lightning, rivers
      float ridgedNoise(vec2 p, int octaves, float persistence, float lacunarity, float sharpness) {
        float sum = 0.0;
        float freq = 1.0;
        float amp = 1.0;
        float weight = 1.0;
        
        // Offset for ridge sharpness tuning
        float offset = 1.0;
        
        for (int i = 0; i < 8; i++) {
          if (i >= octaves) break;
          
          // Get RAW noise (-1 to 1) and create ridge
          float n = perlinNoiseRaw(p * freq);
          n = offset - abs(n);  // Create ridge: values near 0 become peaks
          n = n * n;            // Square for sharper ridges
          n *= weight;          // Weight by previous octave
          
          sum += n * amp;
          
          // Next octave weighted by current signal (more detail in peaks)
          weight = clamp(n * 2.0, 0.0, 1.0);
          
          freq *= lacunarity;
          amp *= persistence;
        }
        
        // Normalize and apply sharpness
        sum = clamp(sum * 0.5, 0.0, 1.0);
        return pow(sum, sharpness);
      }
      
      // ============ BLEND MODES ============
      
      vec3 blendNormal(vec3 base, vec3 blend, float opacity) {
        return mix(base, blend, opacity);
      }
      
      vec3 blendMultiply(vec3 base, vec3 blend, float opacity) {
        return mix(base, base * blend, opacity);
      }
      
      vec3 blendScreen(vec3 base, vec3 blend, float opacity) {
        return mix(base, 1.0 - (1.0 - base) * (1.0 - blend), opacity);
      }
      
      vec3 blendOverlay(vec3 base, vec3 blend, float opacity) {
        vec3 result;
        result.r = base.r < 0.5 ? 2.0 * base.r * blend.r : 1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r);
        result.g = base.g < 0.5 ? 2.0 * base.g * blend.g : 1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g);
        result.b = base.b < 0.5 ? 2.0 * base.b * blend.b : 1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b);
        return mix(base, result, opacity);
      }
      
      vec3 blendAdd(vec3 base, vec3 blend, float opacity) {
        return mix(base, min(base + blend, 1.0), opacity);
      }
      
      vec3 blendSubtract(vec3 base, vec3 blend, float opacity) {
        return mix(base, max(base - blend, 0.0), opacity);
      }
      
      vec3 blendDifference(vec3 base, vec3 blend, float opacity) {
        return mix(base, abs(base - blend), opacity);
      }
      
      vec3 blendSoftLight(vec3 base, vec3 blend, float opacity) {
        vec3 result = (1.0 - 2.0 * blend) * base * base + 2.0 * blend * base;
        return mix(base, result, opacity);
      }
      
      vec3 blendHardLight(vec3 base, vec3 blend, float opacity) {
        vec3 result;
        result.r = blend.r < 0.5 ? 2.0 * base.r * blend.r : 1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r);
        result.g = blend.g < 0.5 ? 2.0 * base.g * blend.g : 1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g);
        result.b = blend.b < 0.5 ? 2.0 * base.b * blend.b : 1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b);
        return mix(base, result, opacity);
      }
      
      // RGB to HSL conversion
      vec3 rgb2hsl(vec3 c) {
        float maxC = max(max(c.r, c.g), c.b);
        float minC = min(min(c.r, c.g), c.b);
        float l = (maxC + minC) * 0.5;
        
        if (maxC == minC) {
          return vec3(0.0, 0.0, l); // achromatic
        }
        
        float d = maxC - minC;
        float s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
        
        float h;
        if (maxC == c.r) {
          h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
        } else if (maxC == c.g) {
          h = (c.b - c.r) / d + 2.0;
        } else {
          h = (c.r - c.g) / d + 4.0;
        }
        h /= 6.0;
        
        return vec3(h, s, l);
      }
      
      // HSL to RGB conversion
      float hue2rgb(float p, float q, float t) {
        if (t < 0.0) t += 1.0;
        if (t > 1.0) t -= 1.0;
        if (t < 1.0/6.0) return p + (q - p) * 6.0 * t;
        if (t < 1.0/2.0) return q;
        if (t < 2.0/3.0) return p + (q - p) * (2.0/3.0 - t) * 6.0;
        return p;
      }
      
      vec3 hsl2rgb(vec3 c) {
        float h = c.x;
        float s = c.y;
        float l = c.z;
        
        if (s == 0.0) {
          return vec3(l); // achromatic
        }
        
        float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
        float p = 2.0 * l - q;
        
        float r = hue2rgb(p, q, h + 1.0/3.0);
        float g = hue2rgb(p, q, h);
        float b = hue2rgb(p, q, h - 1.0/3.0);
        
        return vec3(r, g, b);
      }
      
      // Apply HSLA modifier to RGB color
      vec3 applyHsla(vec3 rgb, vec4 hslaModifier) {
        // hslaModifier: x=hue shift (0-1, normalized from -180..180)
        //               y=saturation shift (0-1, normalized from -100..100)
        //               z=lightness shift (0-1, normalized from -100..100)
        //               w=alpha (0-1)
        
        // Convert normalized values back to actual shifts
        float hueShift = (hslaModifier.x - 0.5) * 2.0; // -1 to 1 (representing -180 to 180 degrees)
        float satShift = (hslaModifier.y - 0.5) * 2.0; // -1 to 1 (representing -100% to 100%)
        float lightShift = (hslaModifier.z - 0.5) * 2.0; // -1 to 1 (representing -100% to 100%)
        
        vec3 hsl = rgb2hsl(rgb);
        
        // Apply hue shift (wrapping around)
        hsl.x = fract(hsl.x + hueShift);
        
        // Apply saturation shift (clamped)
        hsl.y = clamp(hsl.y + satShift, 0.0, 1.0);
        
        // Apply lightness shift (clamped)
        hsl.z = clamp(hsl.z + lightShift, 0.0, 1.0);
        
        return hsl2rgb(hsl);
      }
      
      vec3 applyBlend(vec3 base, vec3 blend, float opacity, float blendMode) {
        if (blendMode < 0.5) return blendNormal(base, blend, opacity);
        if (blendMode < 1.5) return blendMultiply(base, blend, opacity);
        if (blendMode < 2.5) return blendScreen(base, blend, opacity);
        if (blendMode < 3.5) return blendOverlay(base, blend, opacity);
        if (blendMode < 4.5) return blendAdd(base, blend, opacity);
        if (blendMode < 5.5) return blendSubtract(base, blend, opacity);
        if (blendMode < 6.5) return blendDifference(base, blend, opacity);
        if (blendMode < 7.5) return blendSoftLight(base, blend, opacity);
        return blendHardLight(base, blend, opacity);
      }
      
      // ============ PATTERN FUNCTIONS ============
      
      // Rotate 2D coordinates by angle in degrees
      vec2 rotateCoord(vec2 p, float angleDeg) {
        float rad = angleDeg * 3.14159 / 180.0;
        float c = cos(rad);
        float s = sin(rad);
        return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
      }
      
      float stripePattern(vec2 p, float angle, float frequency) {
        float rad = angle * 3.14159 / 180.0;
        vec2 dir = vec2(cos(rad), sin(rad));
        return step(0.5, fract(dot(p, dir) * frequency));
      }
      
      float checkerPattern(vec2 p, float scale) {
        vec2 q = floor(p * scale);
        return mod(q.x + q.y, 2.0);
      }
      
      float hexPattern(vec2 p, float scale) {
        // Simplified hex pattern
        p *= scale;
        vec2 q = vec2(p.x * 2.0 * 0.5773503, p.y + p.x * 0.5773503);
        vec2 pi = floor(q);
        return mod(pi.x + pi.y, 3.0) / 2.0;
      }
      
      // Grid pattern (square grid lines)
      float gridPattern(vec2 p, float scale, float thickness) {
        vec2 f = fract(p * scale);
        float lineX = step(1.0 - thickness, f.x) + step(f.x, thickness);
        float lineY = step(1.0 - thickness, f.y) + step(f.y, thickness);
        return clamp(lineX + lineY, 0.0, 1.0);
      }
      
      // Dots pattern
      float dotsPattern(vec2 p, float scale, float dotSize) {
        vec2 f = fract(p * scale) - 0.5;
        float dist = length(f);
        return 1.0 - smoothstep(dotSize * 0.4, dotSize * 0.5, dist);
      }
      
      // Rings pattern (concentric circles)
      float ringsPattern(vec2 p, float scale, float thickness, float ringCount) {
        float dist = length(p) * scale;
        float ring = fract(dist / ringCount);
        return smoothstep(0.5 - thickness * 0.5, 0.5, ring) * 
               (1.0 - smoothstep(0.5, 0.5 + thickness * 0.5, ring));
      }
      
      // Waves pattern
      float wavesPattern(vec2 p, float scale, float amplitude, float angle) {
        float rad = angle * 3.14159 / 180.0;
        vec2 dir = vec2(cos(rad), sin(rad));
        vec2 perp = vec2(-sin(rad), cos(rad));
        float wave = sin(dot(p, dir) * scale * 3.14159) * amplitude;
        float coord = dot(p, perp) * scale + wave;
        return step(0.5, fract(coord));
      }
      
      // Crosshatch pattern
      float crosshatchPattern(vec2 p, float scale, float angle, float thickness) {
        float rad1 = angle * 3.14159 / 180.0;
        float rad2 = (angle + 90.0) * 3.14159 / 180.0;
        vec2 dir1 = vec2(cos(rad1), sin(rad1));
        vec2 dir2 = vec2(cos(rad2), sin(rad2));
        float line1 = abs(fract(dot(p, dir1) * scale) - 0.5);
        float line2 = abs(fract(dot(p, dir2) * scale) - 0.5);
        float v1 = 1.0 - smoothstep(thickness * 0.3, thickness * 0.5, line1);
        float v2 = 1.0 - smoothstep(thickness * 0.3, thickness * 0.5, line2);
        return clamp(v1 + v2, 0.0, 1.0);
      }
      
      // Diagonal stripes pattern (formerly "triangles" - renamed for accuracy)
      float diagonalPattern(vec2 p, float scale) {
        p *= scale;
        // Simple diagonal stripes
        float d = p.x + p.y;
        return step(0.5, fract(d));
      }
      
      // ============ GRADIENT FUNCTIONS ============
      
      float linearGradient(vec2 p, float angle, float scale) {
        float rad = angle * 3.14159 / 180.0;
        vec2 dir = vec2(cos(rad), sin(rad));
        return clamp(dot(p, dir) * scale * 0.1 + 0.5, 0.0, 1.0);
      }
      
      float radialGradient(vec2 p, float scale) {
        return clamp(length(p) * scale * 0.1, 0.0, 1.0);
      }
      
      float angularGradient(vec2 p) {
        return (atan(p.y, p.x) / 3.14159 + 1.0) * 0.5;
      }
      
      float diamondGradient(vec2 p, float scale) {
        return clamp((abs(p.x) + abs(p.y)) * scale * 0.1, 0.0, 1.0);
      }
      
      // ============ HEX SDF & TRANSITIONS ============
      
      // Hex constants - pointy-top orientation
      const float HEX_RATIO = 1.7320508;  // sqrt(3)
      const float PI = 3.14159265;
      
      // 6 neighbor offsets for pointy-top hex grid (axial coordinates)
      // Order: E, NE, NW, W, SW, SE (clockwise from east)
      vec2 getHexNeighborOffset(int idx) {
        if (idx == 0) return vec2(1.0, 0.0);   // East
        if (idx == 1) return vec2(1.0, -1.0);  // NE
        if (idx == 2) return vec2(0.0, -1.0);  // NW
        if (idx == 3) return vec2(-1.0, 0.0);  // West
        if (idx == 4) return vec2(-1.0, 1.0);  // SW
        return vec2(0.0, 1.0);                 // SE (idx == 5)
      }
      
      // Get local position within hex (from world position)
      vec2 getHexLocalPos(vec2 worldXZ, vec2 hexCenter) {
        return worldXZ - hexCenter;
      }
      
      // Convert axial hex coords to world position (must match JS hexToWorld)
      vec2 hexToWorldShader(vec2 hexCoord) {
        float hexSize = 1.0;  // Will be passed as uniform later
        float x = hexSize * HEX_RATIO * (hexCoord.x + hexCoord.y / 2.0);
        float z = hexSize * 1.5 * hexCoord.y;
        return vec2(x, z);
      }
      
      // SDF for hexagon - returns signed distance (negative inside, positive outside)
      float hexSDF(vec2 p, float radius) {
        // Pointy-top hexagon SDF
        p = abs(p);
        float c = dot(p, normalize(vec2(1.0, HEX_RATIO)));
        return max(c, p.y) - radius;
      }
      
      // Distance to specific hex edge (0-5, clockwise from E)
      // Returns distance from point to the infinite line containing that edge
      float distToHexEdge(vec2 localPos, int edgeIndex, float hexRadius) {
        // Edge normals for pointy-top hex
        float angle = float(edgeIndex) * 60.0 * PI / 180.0;
        vec2 normal = vec2(cos(angle), sin(angle));
        
        // Distance from center to edge (apothem)
        float apothem = hexRadius * HEX_RATIO / 2.0;
        
        // Signed distance to edge plane
        return apothem - dot(localPos, normal);
      }
      
      // Find which edge the point is closest to (0-5)
      int closestHexEdge(vec2 localPos) {
        float angle = atan(localPos.y, localPos.x);  // -PI to PI
        angle = angle * 180.0 / PI;  // Convert to degrees
        if (angle < 0.0) angle += 360.0;  // 0 to 360
        
        // Map angle to edge index (each edge covers 60 degrees)
        // Edge 0 (E) is centered at 0°, so offset by 30°
        int edge = int(mod((angle + 30.0) / 60.0, 6.0));
        return edge;
      }
      
      // Get distance to specific edge (0-5)
      float getEdgeDistance(vec2 localPos, float hexRadius, int edgeIdx) {
        float apothem = hexRadius * HEX_RATIO / 2.0;
        float angle = float(edgeIdx) * 60.0 * PI / 180.0;
        // Note: Z axis points "down" in screen space, so we negate sin
        vec2 normal = vec2(cos(angle), -sin(angle));
        return apothem - dot(localPos, normal);
      }
      
      // Read terrain ID for a neighbor hex
      float getNeighborTerrainId(vec2 hexCoord, int neighborIndex) {
        vec2 neighborCoord = hexCoord + getHexNeighborOffset(neighborIndex);
        vec2 neighborUV = (neighborCoord + uHexRadius + 0.5) / uDataSize;
        
        // Check bounds
        if (neighborUV.x < 0.0 || neighborUV.x > 1.0 || 
            neighborUV.y < 0.0 || neighborUV.y > 1.0) {
          return -1.0;  // Out of bounds
        }
        
        vec4 neighborData = texture2D(uTerrainData, neighborUV);
        return neighborData.r * 255.0;
      }
      
      // Get terrain color by ID
      vec3 getTerrainColorById(float terrainId) {
        vec4 color = texture2D(uTerrainColors, vec2((terrainId + 0.5) / 256.0, 0.25));
        return color.rgb;
      }
      
      // Get terrain ID at arbitrary hex coordinate
      float getTerrainIdAt(vec2 hexCoord) {
        vec2 uv = (hexCoord + uHexRadius + 0.5) / uDataSize;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          return -1.0;
        }
        vec4 data = texture2D(uTerrainData, uv);
        return data.r * 255.0;
      }
      
      // Second ring neighbor offsets (12 neighbors at distance 2)
      vec2 getSecondRingOffset(int idx) {
        // Ring 2 has 12 hexes
        if (idx == 0) return vec2(2.0, 0.0);
        if (idx == 1) return vec2(2.0, -1.0);
        if (idx == 2) return vec2(2.0, -2.0);
        if (idx == 3) return vec2(1.0, -2.0);
        if (idx == 4) return vec2(0.0, -2.0);
        if (idx == 5) return vec2(-1.0, -1.0);
        if (idx == 6) return vec2(-2.0, 0.0);
        if (idx == 7) return vec2(-2.0, 1.0);
        if (idx == 8) return vec2(-2.0, 2.0);
        if (idx == 9) return vec2(-1.0, 2.0);
        if (idx == 10) return vec2(0.0, 2.0);
        return vec2(1.0, 1.0);  // idx == 11
      }
      
      // Calculate patch-based SDF - distance to nearest hex with different terrain
      // Returns: x = signed distance (negative = inside current terrain patch)
      //          y = terrain ID of nearest different terrain
      //          z = blend factor for smooth transitions
      vec3 calculatePatchSDF(vec2 worldPos, vec2 hexCoord, float currentTerrainId) {
        float minDist = 999.0;
        float nearestDiffTerrain = -1.0;
        
        // Check first ring (6 neighbors)
        for (int i = 0; i < 6; i++) {
          vec2 neighborCoord = hexCoord + getHexNeighborOffset(i);
          float neighborTerrain = getTerrainIdAt(neighborCoord);
          
          if (neighborTerrain >= 0.0 && abs(neighborTerrain - currentTerrainId) > 0.5) {
            // Different terrain - calculate distance to this hex center
            vec2 neighborCenter = hexToWorldShader(neighborCoord);
            float dist = length(worldPos - neighborCenter);
            if (dist < minDist) {
              minDist = dist;
              nearestDiffTerrain = neighborTerrain;
            }
          }
        }
        
        // Check second ring (12 neighbors) for smoother SDF
        for (int i = 0; i < 12; i++) {
          vec2 neighborCoord = hexCoord + getSecondRingOffset(i);
          float neighborTerrain = getTerrainIdAt(neighborCoord);
          
          if (neighborTerrain >= 0.0 && abs(neighborTerrain - currentTerrainId) > 0.5) {
            vec2 neighborCenter = hexToWorldShader(neighborCoord);
            float dist = length(worldPos - neighborCenter);
            if (dist < minDist) {
              minDist = dist;
              nearestDiffTerrain = neighborTerrain;
            }
          }
        }
        
        // Also find distance to nearest same-terrain neighbor (for proper SDF)
        float minSameDist = 0.0;  // We're at our own hex center roughly
        vec2 currentCenter = hexToWorldShader(hexCoord);
        minSameDist = length(worldPos - currentCenter);
        
        // Signed distance: negative inside patch, positive outside
        // Using hex radius as reference
        float hexSize = 1.0;
        float signedDist = minDist - hexSize * 1.5;  // Offset so boundary is at hex edge
        
        return vec3(signedDist, nearestDiffTerrain, minDist);
      }
      
      // Compute terrain color for a given terrain ID at world position
      // This processes all layers - the same logic used in main()
      // layerCount: number of layers (pass -1 to auto-detect by checking enabled flags)
      vec3 computeTerrainLayers(float terrainId, vec2 worldPos, float layerCount) {
        vec3 resultColor = getTerrainColorById(terrainId);  // Start with preview color as fallback
        bool hasProcessedLayers = false;
        
        float texWidth = uMaxLayers * uLayerDataWidth;  // 64.0
        float layerY = (terrainId + 0.5) / 32.0;
        
        // Determine how many layers to process
        float maxLayers = layerCount < 0.0 ? 8.0 : layerCount;
        
        // Process layers from texture
        for (int layer = 0; layer < 8; layer++) {
          if (float(layer) >= maxLayers) break;
          
          float layerBaseX = float(layer) * uLayerDataWidth;
          
          // Layer data: [type, enabled, opacity, blendMode]
          vec4 layerInfo = texture2D(uTerrainLayers, vec2((layerBaseX + 0.5) / texWidth, layerY));
          vec4 layerColor = texture2D(uTerrainLayers, vec2((layerBaseX + 4.5) / texWidth, layerY));
          
          float layerType = layerInfo.r * 10.0;  // 0=color, 1=noise, 2=pattern, 3=gradient
          float enabled = layerInfo.g;
          float opacity = layerInfo.b;
          float blendMode = layerInfo.a * 8.0;  // 9 blend modes (0-8)
          
          if (enabled < 0.5) continue;
          
          vec3 layerResult = layerColor.rgb;
          float layerAlpha = opacity;
          
          // Read extended params (Pixel 2 and 3)
          vec4 extParams1 = texture2D(uTerrainLayers, vec2((layerBaseX + 2.5) / texWidth, layerY));
          vec4 extParams2 = texture2D(uTerrainLayers, vec2((layerBaseX + 3.5) / texWidth, layerY));
          
          float lacunarity = extParams1.r * 4.0 + 0.5;  // 0.5-4.5
          float amplitude = extParams1.g * 2.0;         // 0-2
          float threshold = extParams1.b;               // 0-1
          float seed = extParams1.a * 1000.0;           // 0-1000
          float offsetX = extParams2.r * 100.0;
          float offsetY = extParams2.g * 100.0;
          float invert = extParams2.b;
          float smoothness = extParams2.a;
          
          // Apply layer type
          if (layerType < 0.5) {
            // Solid color - already set
          }
          else if (layerType < 1.5) {
            // Noise layer
            vec4 noiseParams = texture2D(uTerrainLayers, vec2((layerBaseX + 1.5) / texWidth, layerY));
            float noiseType = noiseParams.r * 10.0;  // 0-9 noise types
            float scale = noiseParams.g * 10.0 + 0.1;
            float octaves = noiseParams.b * 8.0 + 1.0;
            float persistence = noiseParams.a;
            
            // Read warp strength from extParams
            float warpStrength = smoothness * 4.0;  // 0-4 range
            float fibrousDirection = threshold * 360.0;
            
            float noiseVal;
            vec2 noiseCoord = (worldPos + vec2(offsetX, offsetY) + seed * 0.1) * scale;
            
            if (noiseType < 0.5) {
              noiseVal = perlinNoise(noiseCoord);
            } else if (noiseType < 1.5) {
              noiseVal = simplexNoise(noiseCoord);
            } else if (noiseType < 2.5) {
              noiseVal = voronoiNoise(noiseCoord, smoothness);
              noiseVal = 1.0 - noiseVal;
            } else if (noiseType < 3.5) {
              noiseVal = cellularNoise(noiseCoord);
            } else if (noiseType < 4.5) {
              noiseVal = fbmPerlin(noiseCoord, int(octaves), persistence, lacunarity);
            } else if (noiseType < 5.5) {
              noiseVal = worleyNoise(noiseCoord);
              noiseVal = 1.0 - noiseVal;
            } else if (noiseType < 6.5) {
              noiseVal = whiteNoise(noiseCoord);
            } else if (noiseType < 7.5) {
              noiseVal = warpedNoise(noiseCoord, warpStrength + 0.5, int(octaves), persistence, lacunarity);
            } else if (noiseType < 8.5) {
              noiseVal = fibrousNoise(noiseCoord, warpStrength + 0.5, fibrousDirection, int(octaves), persistence, lacunarity);
            } else {
              float sharpness = warpStrength + 0.5;
              noiseVal = ridgedNoise(noiseCoord, int(octaves), persistence, lacunarity, sharpness);
            }
            
            noiseVal = noiseVal * amplitude;
            
            if (noiseType < 6.5 && threshold > 0.01) {
              noiseVal = smoothstep(threshold - 0.1, threshold + 0.1, noiseVal);
            }
            
            if (invert > 0.5) {
              noiseVal = 1.0 - noiseVal;
            }
            
            noiseVal = clamp(noiseVal, 0.0, 1.0);
            
            vec4 noiseColor2 = texture2D(uTerrainLayers, vec2((layerBaseX + 5.5) / texWidth, layerY));
            layerResult = mix(layerColor.rgb, noiseColor2.rgb, noiseVal);
          }
          else if (layerType < 2.5) {
            // Pattern layer
            vec4 patternParams = texture2D(uTerrainLayers, vec2((layerBaseX + 1.5) / texWidth, layerY));
            float patternType = patternParams.r * 10.0;
            float scale = patternParams.g * 10.0 + 0.1;
            float angle = patternParams.b * 360.0;
            float thickness = patternParams.a;
            
            float ringCount = amplitude * 10.0;
            float waveFreq = threshold * 10.0;
            
            vec2 patternCoord = worldPos + vec2(offsetX, offsetY);
            vec2 rotatedCoord = rotateCoord(patternCoord, angle);
            
            float patternVal;
            if (patternType < 0.5) {
              float rad = angle * 3.14159 / 180.0;
              vec2 dir = vec2(cos(rad), sin(rad));
              float t = fract(dot(patternCoord, dir) * scale);
              patternVal = smoothstep(0.5 - thickness * 0.5, 0.5, t) * 
                          (1.0 - smoothstep(0.5, 0.5 + thickness * 0.5, t));
              if (thickness < 0.01) patternVal = step(0.5, t);
            } else if (patternType < 1.5) {
              patternVal = checkerPattern(rotatedCoord, scale);
            } else if (patternType < 2.5) {
              patternVal = hexPattern(rotatedCoord, scale);
            } else if (patternType < 3.5) {
              patternVal = gridPattern(rotatedCoord, scale, thickness);
            } else if (patternType < 4.5) {
              patternVal = dotsPattern(rotatedCoord, scale, thickness);
            } else if (patternType < 5.5) {
              patternVal = ringsPattern(patternCoord, scale, thickness, ringCount + 1.0);
            } else if (patternType < 6.5) {
              patternVal = wavesPattern(patternCoord, scale * waveFreq, 0.3, angle);
            } else if (patternType < 7.5) {
              patternVal = crosshatchPattern(patternCoord, scale, angle, thickness);
            } else {
              patternVal = diagonalPattern(rotatedCoord, scale);
            }
            
            if (invert > 0.5) patternVal = 1.0 - patternVal;
            
            vec4 patternColor2 = texture2D(uTerrainLayers, vec2((layerBaseX + 5.5) / texWidth, layerY));
            layerResult = mix(layerColor.rgb, patternColor2.rgb, patternVal);
          }
          else if (layerType < 3.5) {
            // Gradient layer
            vec4 gradParams = texture2D(uTerrainLayers, vec2((layerBaseX + 1.5) / texWidth, layerY));
            float gradType = gradParams.r * 4.0;
            float angle = gradParams.g * 360.0;
            float gradScale = gradParams.b * 2.0 + 0.1;
            
            vec2 gradCoord = worldPos + vec2(offsetX, offsetY);
            
            float gradVal;
            if (gradType < 0.5) {
              gradVal = linearGradient(gradCoord, angle, gradScale);
            } else if (gradType < 1.5) {
              gradVal = radialGradient(gradCoord, gradScale);
            } else if (gradType < 2.5) {
              gradVal = angularGradient(gradCoord);
            } else {
              gradVal = diamondGradient(gradCoord, gradScale);
            }
            
            if (invert > 0.5) gradVal = 1.0 - gradVal;
            
            vec4 gradColor2 = texture2D(uTerrainLayers, vec2((layerBaseX + 5.5) / texWidth, layerY));
            layerResult = mix(layerColor.rgb, gradColor2.rgb, gradVal);
          }
          
          // Apply blend mode
          if (!hasProcessedLayers) {
            resultColor = layerResult;
            hasProcessedLayers = true;
          } else {
            resultColor = applyBlend(resultColor, layerResult, layerAlpha, blendMode);
          }
        }
        
        return resultColor;
      }
      
      // CPU SDF sample result structure
      struct SDFSample {
        float distance;      // Signed distance to boundary
        float fromTerrainId; // Terrain ID on "from" side (patch owner)
        float toTerrainId;   // Terrain ID on "to" side (neighbor)
        bool valid;          // Whether sample is valid
      };
      
      // Sample CPU-computed patch SDF texture with terrain pair info
      // Returns full sample: distance + terrain IDs for matching
      SDFSample samplePatchSDFWithInfo(vec2 worldPos) {
        SDFSample result;
        result.valid = false;
        result.distance = 999.0;
        result.fromTerrainId = -1.0;
        result.toTerrainId = -1.0;
        
        // Map world position to texture UV
        float u = (worldPos.x - uPatchSDFBounds.x) / (uPatchSDFBounds.z - uPatchSDFBounds.x);
        float v = (worldPos.y - uPatchSDFBounds.y) / (uPatchSDFBounds.w - uPatchSDFBounds.y);
        
        // Out of bounds check
        if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) {
          return result;
        }
        
        // Sample the SDF texture (RGBA)
        // R = signed distance, G = fromTerrain (normalized), B = toTerrain (normalized), A = valid
        vec4 sdfSample = texture2D(uPatchSDF, vec2(u, v));
        
        result.distance = sdfSample.r;
        result.fromTerrainId = sdfSample.g * 256.0 - 1.0;  // Decode: 0 means -1 (void)
        result.toTerrainId = sdfSample.b * 256.0 - 1.0;
        // Use stricter threshold (0.9) to avoid LinearFilter interpolation artifacts
        result.valid = sdfSample.a > 0.9 && abs(result.distance) < 100.0;
        
        return result;
      }
      
      // Legacy function for compatibility
      float samplePatchSDFTexture(vec2 worldPos) {
        SDFSample s = samplePatchSDFWithInfo(worldPos);
        return s.valid ? s.distance : 999.0;
      }
      
      // Apply line deformation to edge distance
      float applyLineDeformation(float dist, vec2 localPos, int effectType, float amplitude, float frequency, float phase) {
        // effectType: 0=none, 1=wave, 2=noise, 3=jagged, 4=sine, 5=zigzag
        float deform = 0.0;
        float coord = atan(localPos.y, localPos.x) * frequency + phase;
        
        if (effectType == 1) {
          // Wave - smooth sine wave
          deform = sin(coord * 3.0) * amplitude;
        } else if (effectType == 2) {
          // Noise - perlin noise along edge
          deform = (perlinNoise(localPos * frequency) * 2.0 - 1.0) * amplitude;
        } else if (effectType == 3) {
          // Jagged - sharp random displacement
          deform = (hash(floor(localPos * frequency)) * 2.0 - 1.0) * amplitude;
        } else if (effectType == 4) {
          // Sine - clean sine wave
          deform = sin(coord * 2.0) * amplitude;
        } else if (effectType == 5) {
          // Zigzag - triangle wave
          deform = (abs(fract(coord * 0.5) * 2.0 - 1.0) * 2.0 - 1.0) * amplitude;
        }
        
        return dist + deform;
      }
      
      // Simple edge transition blend 
      float calculateEdgeBlend(float edgeDist, float blendWidth) {
        // Smooth blend based on distance to edge
        return smoothstep(-blendWidth, blendWidth, edgeDist);
      }
      
      // Structure to hold rule data for a terrain pair transition
      struct TransitionRule {
        bool found;
        float blendWidth;
        float smoothAmount;  // 0=hex edges (sharp), 1=patch SDF (smooth)
        int lineEffectType;
        float lineAmplitude;
        float lineFrequency;
        float linePhase;
        int maskType;
        float maskWidth;
        float maskFalloff;
        float maskNoiseScale;
        int drawType;
        float drawOffset;
        float drawBlur;
        float drawOpacity;
      };
      
      // Find matching rule for terrain pair
      TransitionRule findTransitionRule(float fromId, float toId) {
        TransitionRule rule;
        rule.found = false;
        rule.blendWidth = 0.0;    // No blend by default
        rule.smoothAmount = 0.0;  // No smoothing by default (sharp hex edges)
        rule.lineEffectType = 0;  // Default: none
        rule.lineAmplitude = 0.0;
        rule.lineFrequency = 5.0;
        rule.linePhase = 0.0;
        rule.maskType = 0;  // none - no mask effect
        rule.maskWidth = 0.0;
        rule.maskFalloff = 0.0;
        rule.maskNoiseScale = 5.0;
        rule.drawType = 0;  // none
        rule.drawOffset = 0.0;
        rule.drawBlur = 0.0;
        rule.drawOpacity = 0.0;
        
        float bestPriority = -1.0;
        
        // Search through all rules
        for (int i = 0; i < 64; i++) {
          if (float(i) >= uMaxRules) break;
          
          float ruleY = (float(i) + 0.5) / uMaxRules;
          
          // Read rule match info (pixel 0)
          vec4 matchInfo = texture2D(uTransitionRules, vec2(0.5 / uRuleDataWidth, ruleY));
          
          float ruleFromId = matchInfo.r * 256.0 - 1.0;  // Decode: 0 means -1 (any)
          float ruleToId = matchInfo.g * 256.0 - 1.0;
          float matchLevel = matchInfo.b * 4.0;
          float enabled = matchInfo.a;
          
          if (enabled < 0.5) continue;
          
          // Check if rule matches
          bool matches = false;
          
          if (matchLevel < 0.5) {
            // Exact match
            matches = (abs(ruleFromId - fromId) < 0.5 && abs(ruleToId - toId) < 0.5) ||
                      (abs(ruleFromId - toId) < 0.5 && abs(ruleToId - fromId) < 0.5);  // Symmetric
          } else if (matchLevel < 1.5) {
            // Tag match - for now treat as any match if one terrain matches
            matches = (abs(ruleFromId - fromId) < 0.5 || abs(ruleFromId - toId) < 0.5 ||
                       ruleFromId < 0.0);
          } else {
            // Any match
            matches = true;
          }
          
          if (!matches) continue;
          
          // Read priority (pixel 1)
          vec4 priorityInfo = texture2D(uTransitionRules, vec2(1.5 / uRuleDataWidth, ruleY));
          float priority = priorityInfo.r * 100.0;
          
          if (priority > bestPriority) {
            bestPriority = priority;
            rule.found = true;
            rule.blendWidth = priorityInfo.b;
            rule.smoothAmount = priorityInfo.a;  // 0=sharp hex, 1=smooth patch
            
            // Read line effect (pixel 2)
            vec4 lineInfo = texture2D(uTransitionRules, vec2(2.5 / uRuleDataWidth, ruleY));
            rule.lineEffectType = int(lineInfo.r * 10.0);
            rule.lineAmplitude = lineInfo.g * 2.0;
            rule.lineFrequency = lineInfo.b * 20.0;
            rule.linePhase = lineInfo.a * 6.28318;
            
            // Read mask effect (pixel 3)
            vec4 maskInfo = texture2D(uTransitionRules, vec2(3.5 / uRuleDataWidth, ruleY));
            rule.maskType = int(maskInfo.r * 10.0);
            rule.maskWidth = maskInfo.g;
            rule.maskFalloff = maskInfo.b;
            rule.maskNoiseScale = maskInfo.a * 20.0;
            
            // Read draw effect (pixel 4)
            vec4 drawInfo = texture2D(uTransitionRules, vec2(4.5 / uRuleDataWidth, ruleY));
            rule.drawType = int(drawInfo.r * 10.0);
            rule.drawOffset = drawInfo.g;
            rule.drawBlur = drawInfo.b;
            rule.drawOpacity = drawInfo.a;
          }
        }
        
        return rule;
      }
      
      // ============ MAIN ============
      
      void main() {
        // Get terrain data from texture
        vec2 dataUV = (vHexCoord + uHexRadius + 0.5) / uDataSize;
        vec4 terrainData = texture2D(uTerrainData, dataUV);
        
        float terrainId = terrainData.r * 255.0;  // Terrain index (0-31)
        float layerCount = terrainData.g * 8.0;   // Number of layers
        
        // Compute terrain color using shared function
        // If no layers, use vertex color (CPU computed), otherwise use layers
        vec3 resultColor = layerCount < 0.5 ? vColor : computeTerrainLayers(terrainId, vWorldXZ, layerCount);
        float resultAlpha = 1.0;
        
        // ============ TERRAIN TRANSITIONS ============
        // Calculate local position within hex for SDF
        vec2 hexCenter = hexToWorldShader(vHexCoord);
        vec2 localPos = vWorldXZ - hexCenter;
        
        float hexRadius = 1.0;  // hex size
        
        // Calculate patch-based SDF (distance to nearest different terrain)
        vec3 patchSDF = calculatePatchSDF(vWorldXZ, vHexCoord, terrainId);
        float patchDist = patchSDF.x;  // Signed distance to patch boundary
        float nearestDiffTerrain = patchSDF.y;
        
        // Get CPU-computed SDF for smooth/straightened boundaries FIRST
        // We need this to decide whether to apply any effects
        SDFSample cpuSDFSample = samplePatchSDFWithInfo(vWorldXZ);
        
        // Only process if we have a neighbor with different terrain
        if (nearestDiffTerrain >= 0.0) {
          // Find matching transition rule
          TransitionRule rule = findTransitionRule(terrainId, nearestDiffTerrain);
          
          // Skip transition effects if:
          // 1. No rule found, OR
          // 2. CPU SDF is not valid for this pixel (outside transition zone)
          if (!rule.found || !cpuSDFSample.valid) {
            // No transition effects - just render terrain as-is
          } else {
          
          // Calculate hex-based edge distance (for sharp/angular look)
          float minEdgeDist = 999.0;
          for (int i = 0; i < 6; i++) {
            float neighborId = getNeighborTerrainId(vHexCoord, i);
            if (neighborId >= 0.0 && abs(neighborId - terrainId) > 0.5) {
              float edgeDist = getEdgeDistance(localPos, hexRadius, i);
              minEdgeDist = min(minEdgeDist, edgeDist);
            }
          }
          if (minEdgeDist > 100.0) minEdgeDist = patchDist;
          
          // CPU SDF was already sampled above (before rule check)
          // Check if current terrain is one of the pair (from or to)
          bool cpuSDFMatches = cpuSDFSample.valid && (
            abs(cpuSDFSample.fromTerrainId - terrainId) < 0.5 ||
            abs(cpuSDFSample.toTerrainId - terrainId) < 0.5
          );
          
          float cpuSDF = cpuSDFMatches ? cpuSDFSample.distance : 999.0;
          
          // If our terrain is the "to" side, we're on the other side of the boundary - flip sign
          if (cpuSDFMatches && abs(cpuSDFSample.toTerrainId - terrainId) < 0.5) {
            cpuSDF = -cpuSDF;
          }
          
          // Determine the neighbor terrain from CPU SDF (for blending and rule lookup)
          float cpuNeighborTerrain = -1.0;
          if (cpuSDFMatches) {
            if (abs(cpuSDFSample.fromTerrainId - terrainId) < 0.5) {
              cpuNeighborTerrain = cpuSDFSample.toTerrainId;
            } else {
              cpuNeighborTerrain = cpuSDFSample.fromTerrainId;
            }
          }
          
          // Use CPU neighbor if available, otherwise fall back to GPU-computed neighbor
          float effectiveNeighbor = nearestDiffTerrain;
          if (cpuSDFMatches) {
            effectiveNeighbor = cpuNeighborTerrain;
          }
          
          // Find transition rule based on effective neighbor
          TransitionRule effectiveRule = rule;
          if (cpuSDFMatches) {
            effectiveRule = findTransitionRule(terrainId, effectiveNeighbor);
          }
          
          // Blend between hex-edge SDF and CPU patch SDF based on smoothAmount
          // smoothAmount: 0 = sharp hex edges, 1 = smooth CPU-computed patch SDF
          // Use CPU SDF when available and matching, otherwise fall back to GPU patchDist
          float smoothSDF = cpuSDF < 100.0 ? cpuSDF : patchDist;
          float baseDist = mix(minEdgeDist, smoothSDF, rule.smoothAmount);
          
          // Apply line deformation using WORLD coordinates for continuity along patch boundary
          float deformedDist = baseDist;
          if (rule.lineEffectType >= 1 && rule.lineEffectType <= 6) {
            // Wave, noise, jagged, sine, zigzag effects
            // Use world position projected onto boundary direction for continuous deformation
            float boundaryCoord = length(vWorldXZ) * rule.lineFrequency + rule.linePhase;
            float deform = 0.0;
            
            if (rule.lineEffectType == 1 || rule.lineEffectType == 2) {
              // Wave/Noise - use perlin noise at world coords for continuous variation
              deform = (perlinNoise(vWorldXZ * rule.lineFrequency) * 2.0 - 1.0) * rule.lineAmplitude;
            } else if (rule.lineEffectType == 3) {
              // Jagged - sharp but continuous along world space
              vec2 cellCoord = floor(vWorldXZ * rule.lineFrequency);
              deform = (hash(cellCoord) * 2.0 - 1.0) * rule.lineAmplitude;
            } else if (rule.lineEffectType == 4 || rule.lineEffectType == 5) {
              // Sine - smooth wave along boundary
              deform = sin(boundaryCoord * 3.0) * rule.lineAmplitude;
            } else if (rule.lineEffectType == 6) {
              // Zigzag - triangle wave
              deform = (abs(fract(boundaryCoord * 0.5) * 2.0 - 1.0) * 2.0 - 1.0) * rule.lineAmplitude;
            }
            
            deformedDist = baseDist + deform;
          }
          
          // Calculate blend based on mask type
          // blend = 0: 100% current terrain, blend = 1: 100% neighbor terrain
          // At SDF = 0 (boundary): blend = 0.5 (50%/50%)
          // At SDF = +width (inside current): blend = 0
          // At SDF = -width (inside neighbor): blend = 1
          float blend = 0.0;
          float maskWidth = rule.maskWidth;
          
          // If smooth/straighten is enabled but no mask effect, use default blend based on CPU SDF
          // This allows smooth boundaries to work without requiring a mask effect
          if (rule.maskType == 0 && rule.smoothAmount > 0.5) {
            // Use CPU SDF distance for smooth blend with default width
            float defaultWidth = 0.3;  // Default blend width for smooth/straighten
            // Symmetric blend: -width -> 1.0, 0 -> 0.5, +width -> 0.0
            blend = 1.0 - smoothstep(-defaultWidth, defaultWidth, deformedDist);
          } else if (rule.maskType == 0) {
            // None - no mask effect, no smooth - blend stays 0
            blend = 0.0;
          } else if (rule.maskType == 1) {
            // Gradient blend - symmetric around boundary
            // deformedDist = -maskWidth -> blend = 1.0 (100% neighbor)
            // deformedDist = 0 -> blend = 0.5 (50%/50%)
            // deformedDist = +maskWidth -> blend = 0.0 (100% current)
            blend = 1.0 - smoothstep(-maskWidth, maskWidth, deformedDist);
          } else if (rule.maskType == 2) {
            // Scatter - use noise to create scattered transition (symmetric)
            float scatterNoise = perlinNoise(vWorldXZ * rule.maskNoiseScale);
            float normalizedDist = (deformedDist + maskWidth) / (2.0 * maskWidth);  // 0 to 1
            normalizedDist = clamp(normalizedDist, 0.0, 1.0);
            blend = step(scatterNoise, 1.0 - normalizedDist) * (1.0 - normalizedDist);
          } else if (rule.maskType == 3) {
            // Noise blend - blend with noise falloff (symmetric)
            float noiseVal = perlinNoise(vWorldXZ * rule.maskNoiseScale);
            float baseMask = 1.0 - smoothstep(-maskWidth, maskWidth, deformedDist);
            blend = baseMask * mix(1.0, noiseVal, rule.maskFalloff);
          }
          
          // Apply draw effects (shadow, glow, stroke) before color blend
          if (rule.drawType == 1 && blend > 0.01) {
            // Shadow - darken on one side of the edge
            float shadowDist = deformedDist - rule.drawOffset;
            float shadowMask = smoothstep(-rule.drawBlur, 0.0, shadowDist) * 
                               (1.0 - smoothstep(0.0, rule.drawBlur, shadowDist));
            resultColor = mix(resultColor, resultColor * 0.5, shadowMask * rule.drawOpacity);
          } else if (rule.drawType == 2 && blend > 0.01) {
            // Glow - brighten around the edge
            float glowDist = abs(deformedDist);
            float glowMask = 1.0 - smoothstep(0.0, rule.drawBlur, glowDist);
            resultColor = mix(resultColor, resultColor * 1.5, glowMask * rule.drawOpacity);
          } else if (rule.drawType == 3 && blend > 0.01) {
            // Stroke - add colored line at edge
            float strokeMask = smoothstep(-rule.drawBlur, 0.0, deformedDist) * 
                               (1.0 - smoothstep(0.0, rule.drawBlur, deformedDist));
            vec3 strokeColor = vec3(0.2, 0.15, 0.1);  // Dark brown stroke
            resultColor = mix(resultColor, strokeColor, strokeMask * rule.drawOpacity);
          }
          
          // Blend colors if we're near the edge
          if (blend > 0.01) {
            // Use full terrain color with all layers (pass -1 to auto-detect layer count)
            vec3 neighborColor = computeTerrainLayers(nearestDiffTerrain, vWorldXZ, -1.0);
            resultColor = mix(resultColor, neighborColor, blend);
          }
          }  // end if (rule.found)
        }
        
        // Apply terrain HSLA modifier (from second row of terrainColorsTexture)
        vec4 hslaModifier = texture2D(uTerrainColors, vec2((terrainId + 0.5) / 256.0, 0.75));
        if (hslaModifier.x != 0.5 || hslaModifier.y != 0.5 || hslaModifier.z != 0.5) {
          resultColor = applyHsla(resultColor, hslaModifier);
        }
        
        // Add subtle animated noise for life (reduced for 2D)
        float animNoise = valueNoise(vWorldXZ * 3.0 + uTime * 0.05) * 0.02;
        resultColor *= (0.99 + animNoise);
        
        // Lighting calculation
        // uFlatLighting: 1.0 = полностью плоское (2D), 0.0 = 3D освещение
        vec3 finalColor;
        if (uFlatLighting > 0.99) {
          // Полностью плоское освещение - цвета как есть
          finalColor = resultColor;
        } else {
          // 3D освещение с ambient и directional
          vec3 normal = normalize(vNormal);
          float diffuse = max(dot(normal, uLightDirection), 0.0);
          vec3 lighting3D = uAmbientLight * 0.4 + uDirectionalLight * diffuse * 0.6;
          vec3 color3D = resultColor * lighting3D;
          
          // Смешиваем между плоским и 3D
          finalColor = mix(color3D, resultColor, uFlatLighting);
        }
        
        // Debug SDF visualization
        if (uDebugSDFMode > 0) {
          SDFSample sdfDbg = samplePatchSDFWithInfo(vWorldXZ);
          if (uDebugSDFMode == 1) {
            // Mode 1: Show if SDF is valid (green) or invalid (red)
            if (sdfDbg.valid) {
              finalColor = mix(finalColor, vec3(0.0, 1.0, 0.0), 0.5);  // Green = valid
            } else {
              finalColor = mix(finalColor, vec3(1.0, 0.0, 0.0), 0.5);  // Red = invalid
            }
          } else if (uDebugSDFMode == 2) {
            // Mode 2: Show fromTerrainId as color (hue)
            float hue = sdfDbg.fromTerrainId / 10.0;
            vec3 c = vec3(sin(hue * 6.28) * 0.5 + 0.5, sin(hue * 6.28 + 2.09) * 0.5 + 0.5, sin(hue * 6.28 + 4.19) * 0.5 + 0.5);
            finalColor = mix(finalColor, c, 0.7);
          } else if (uDebugSDFMode == 3) {
            // Mode 3: Show SDF distance as gradient (blue near, white far)
            float d = clamp(abs(sdfDbg.distance) / 5.0, 0.0, 1.0);
            finalColor = vec3(d, d, 1.0);  // Blue to white
          } else if (uDebugSDFMode == 4) {
            // Mode 4: Show terrain matching - does current terrain appear in CPU SDF pair?
            float t = terrainData.r * 255.0;
            // New simpler matching: our terrain must be one of the pair (from or to)
            bool matches = sdfDbg.valid && (
              abs(sdfDbg.fromTerrainId - t) < 0.5 ||
              abs(sdfDbg.toTerrainId - t) < 0.5
            );
            if (!sdfDbg.valid) {
              finalColor = vec3(0.3, 0.3, 0.3);  // Gray = SDF not valid
            } else if (matches) {
              finalColor = vec3(0.0, 1.0, 1.0);  // Cyan = our terrain in SDF pair
            } else {
              finalColor = vec3(1.0, 0.0, 1.0);  // Magenta = SDF valid but different pair
            }
          } else if (uDebugSDFMode == 5) {
            // Mode 5: Show CORRECTED SDF for current terrain
            // Green = inside current terrain (should be rendered as this terrain)
            // Red = outside current terrain (near boundary going to neighbor)
            // Gray = SDF doesn't involve this terrain
            float t = terrainData.r * 255.0;
            float d = sdfDbg.distance;
            
            // Check if this terrain is in the SDF pair
            bool isFrom = abs(sdfDbg.fromTerrainId - t) < 0.5;
            bool isTo = abs(sdfDbg.toTerrainId - t) < 0.5;
            
            if (!sdfDbg.valid) {
              finalColor = vec3(0.2, 0.2, 0.2);  // Dark gray = no valid SDF
            } else if (!isFrom && !isTo) {
              finalColor = vec3(0.5, 0.5, 0.5);  // Light gray = SDF for different pair
            } else {
              // Correct the sign: if we're the "to" terrain, flip the sign
              float correctedSDF = isTo ? -d : d;
              // Now: negative = inside our terrain, positive = near boundary to neighbor
              if (correctedSDF < 0.0) {
                finalColor = vec3(0.0, clamp(-correctedSDF / 2.0, 0.0, 1.0), 0.0);  // Green = inside
              } else {
                finalColor = vec3(clamp(correctedSDF / 2.0, 0.0, 1.0), 0.0, 0.0);  // Red = near edge
              }
            }
          }
        }
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  })
}

// Create terrain data textures
function createTerrainDataTextures() {
  // Data texture: stores hex data (terrainId, elevation, etc.)
  const dataSize = TERRAIN_DATA_SIZE
  const data = new Float32Array(dataSize * dataSize * 4)
  
  // Initialize with default values
  for (let i = 0; i < dataSize * dataSize; i++) {
    data[i * 4 + 0] = 0     // terrainId (normalized)
    data[i * 4 + 1] = 0     // layerCount (normalized)
    data[i * 4 + 2] = 0     // elevation
    data[i * 4 + 3] = 1     // alpha
  }
  
  terrainDataTexture = new THREE.DataTexture(
    data, dataSize, dataSize,
    THREE.RGBAFormat, THREE.FloatType
  )
  terrainDataTexture.needsUpdate = true
  
  // Colors texture: stores terrain colors (up to 256 terrains)
  // Colors + HSLA texture: 256 terrains x 2 rows (row 0 = RGB color, row 1 = HSLA modifier)
  const colorsData = new Float32Array(256 * 2 * 4)
  for (let i = 0; i < 256; i++) {
    // Row 0: RGB color
    colorsData[i * 4 + 0] = 0.5  // R
    colorsData[i * 4 + 1] = 0.5  // G
    colorsData[i * 4 + 2] = 0.5  // B
    colorsData[i * 4 + 3] = 1.0  // A
    // Row 1: HSLA modifier (offset by 256*4)
    colorsData[256 * 4 + i * 4 + 0] = 0.5  // Hue (0.5 = 0 degree shift, normalized from -180..180 to 0..1)
    colorsData[256 * 4 + i * 4 + 1] = 0.5  // Saturation (0.5 = 0% shift)
    colorsData[256 * 4 + i * 4 + 2] = 0.5  // Lightness (0.5 = 0% shift)
    colorsData[256 * 4 + i * 4 + 3] = 1.0  // Alpha
  }
  
  terrainColorsTexture = new THREE.DataTexture(
    colorsData, 256, 2,
    THREE.RGBAFormat, THREE.FloatType
  )
  terrainColorsTexture.needsUpdate = true
  
  // Layers texture: 256 x 32 (width = layer data slots, height = terrain slots)
  // Each terrain has MAX_LAYERS_PER_TERRAIN * LAYER_DATA_WIDTH pixels of data
  const layersWidth = MAX_LAYERS_PER_TERRAIN * LAYER_DATA_WIDTH  // 8 * 8 = 64
  const layersHeight = MAX_TERRAINS  // 32
  const layersData = new Float32Array(layersWidth * layersHeight * 4)
  
  // Initialize with zeros
  for (let i = 0; i < layersWidth * layersHeight * 4; i++) {
    layersData[i] = 0
  }
  
  terrainLayersTexture = new THREE.DataTexture(
    layersData, layersWidth, layersHeight,
    THREE.RGBAFormat, THREE.FloatType
  )
  terrainLayersTexture.needsUpdate = true
  
  // Transition rules texture: stores rules for terrain pair transitions
  // Layout: MAX_RULES rows x RULE_DATA_WIDTH columns
  // Each rule: [fromId, toId, matchLevel, priority, zPriority, blendWidth, lineEffectType, lineAmplitude,
  //             lineFrequency, linePhase, maskType, maskStrength, drawEffectType, drawParams...]
  const rulesWidth = RULE_DATA_WIDTH  // 16 floats per rule
  const rulesHeight = MAX_RULES  // 64 rules max
  const rulesData = new Float32Array(rulesWidth * rulesHeight * 4)
  
  // Initialize with zeros (no rules)
  for (let i = 0; i < rulesWidth * rulesHeight * 4; i++) {
    rulesData[i] = 0
  }
  
  transitionRulesTexture = new THREE.DataTexture(
    rulesData, rulesWidth, rulesHeight,
    THREE.RGBAFormat, THREE.FloatType
  )
  transitionRulesTexture.needsUpdate = true
}

// Create patchSDF texture for CPU-computed patch boundaries
function createPatchSDFTexture() {
  const size = PATCH_SDF_SIZE
  const data = new Float32Array(size * size * 4)
  
  // Initialize with large distance and INVALID flag (no boundaries)
  for (let i = 0; i < size * size; i++) {
    data[i * 4 + 0] = 0        // R = signed distance (0 = at boundary, but invalid)
    data[i * 4 + 1] = 0        // G = fromTerrain (0 = void/-1)
    data[i * 4 + 2] = 0        // B = toTerrain (0 = void/-1)
    data[i * 4 + 3] = 0        // A = INVALID by default
  }
  
  patchSDFTexture = new THREE.DataTexture(
    data, size, size,
    THREE.RGBAFormat, THREE.FloatType
  )
  patchSDFTexture.minFilter = THREE.LinearFilter
  patchSDFTexture.magFilter = THREE.LinearFilter
  patchSDFTexture.needsUpdate = true
}

// Update patchSDF texture from CPU-computed data
function updatePatchSDFTexture() {
  if (!patchSDFTexture) return
  
  // Set world bounds based on current map radius
  const worldRadius = currentMapRadius * HEX_SIZE * 2
  patchBoundaries.worldBounds.value = {
    minX: -worldRadius,
    minZ: -worldRadius,
    maxX: worldRadius,
    maxZ: worldRadius,
  }
  patchBoundaries.sdfWidth.value = PATCH_SDF_SIZE
  patchBoundaries.sdfHeight.value = PATCH_SDF_SIZE
  
  // Rebuild patches from current hex map (pass HEX_SIZE for world->hex conversion)
  patchBoundaries.rebuildAll(hexMapState.value, props.rules, props.terrains, HEX_SIZE)
  
  // Debug: log patch info
  console.log('[PatchSDF] Patches:', patchBoundaries.patches.value.size, 'Rules:', props.rules?.length)
  console.log('[PatchSDF] hexMapState size:', hexMapState.value.size)
  console.log('[PatchSDF] worldBounds:', patchBoundaries.worldBounds.value)
  for (const [id, patch] of patchBoundaries.patches.value) {
    console.log(`  Patch ${id}: terrain=${patch.terrainId}, hexes=${patch.hexes.size}, rawBoundaries=${patch.boundary?.length}, processedBoundaries=${patch.processedBoundary?.length}`)
    if (patch.boundary?.[0]) {
      console.log(`    Raw boundary[0] points: ${patch.boundary[0].length}`)
    }
    if (patch.processedBoundary?.[0]) {
      console.log(`    Processed boundary[0] points: ${patch.processedBoundary[0].length}`)
      // Log first few points
      const pts = patch.processedBoundary[0].slice(0, 3)
      console.log(`    First 3 points:`, pts.map(p => `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})`).join(', '))
    }
  }
  
  // Copy SDF data to texture
  const sdfData = patchBoundaries.sdfTexture.value
  if (!sdfData) {
    console.log('[PatchSDF] No SDF data generated!')
    return
  }
  
  // Debug: check SDF values and terrain IDs
  let minVal = Infinity, maxVal = -Infinity
  const pixelCount = PATCH_SDF_SIZE * PATCH_SDF_SIZE
  const terrainPairCounts = new Map() // Track terrain pair frequencies
  let validPixels = 0
  
  for (let i = 0; i < pixelCount; i++) {
    const sdf = sdfData[i * 4]
    const fromT = sdfData[i * 4 + 1]
    const toT = sdfData[i * 4 + 2]
    const valid = sdfData[i * 4 + 3]
    
    if (valid > 0.5) {
      validPixels++
      // Decode terrain indices (they are normalized, *255 to get back)
      const fromIdx = Math.round(fromT * 255) - 1  // -1 because we added 1 in encoding
      const toIdx = Math.round(toT * 255) - 1
      const pairKey = `${fromIdx}->${toIdx}`
      terrainPairCounts.set(pairKey, (terrainPairCounts.get(pairKey) || 0) + 1)
    }
    
    if (sdf < 100) {
      minVal = Math.min(minVal, sdf)
      maxVal = Math.max(maxVal, sdf)
    }
  }
  console.log(`[PatchSDF] SDF range: ${minVal.toFixed(2)} to ${maxVal.toFixed(2)}`)
  console.log(`[PatchSDF] Valid pixels: ${validPixels}/${pixelCount}`)
  console.log(`[PatchSDF] Terrain pairs in SDF:`, Object.fromEntries(terrainPairCounts))
  
  // Copy SDF RGBA data to texture
  // R = signed distance, G = fromTerrain index, B = toTerrain index, A = valid
  const texData = patchSDFTexture.image.data
  for (let i = 0; i < pixelCount; i++) {
    texData[i * 4 + 0] = sdfData[i * 4 + 0]  // Signed distance
    texData[i * 4 + 1] = sdfData[i * 4 + 1]  // From terrain index (normalized)
    texData[i * 4 + 2] = sdfData[i * 4 + 2]  // To terrain index (normalized)
    texData[i * 4 + 3] = sdfData[i * 4 + 3]  // Valid flag
  }
  
  patchSDFTexture.needsUpdate = true
  
  // Update shader uniform with bounds
  if (unifiedMesh && unifiedMesh.material.uniforms) {
    const bounds = patchBoundaries.worldBounds.value
    unifiedMesh.material.uniforms.uPatchSDFBounds.value.set(
      bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ
    )
  }
  
  // Update debug visualization
  updateDebugBoundaries()
}

// Debug visualization: draw boundary SEGMENTS with rainbow colors
// Shows only SAND patches, each segment (consecutive edges with same neighbor) = different color
function updateDebugBoundaries() {
  if (!scene) return
  
  // Remove old debug group
  if (debugBoundariesGroup) {
    scene.remove(debugBoundariesGroup)
    debugBoundariesGroup.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) obj.material.dispose()
    })
  }
  
  debugBoundariesGroup = new THREE.Group()
  debugBoundariesGroup.name = 'debugBoundaries'
  
  const LINE_RADIUS = 0.06  // Толщина линии
  const LINE_Y = 0.45  // Высота над землёй
  
  // Rainbow + white colors for segments
  const SEGMENT_COLORS = [
    '#ff0000',  // Red
    '#ff8000',  // Orange
    '#ffff00',  // Yellow
    '#00ff00',  // Green
    '#00ffff',  // Cyan
    '#0080ff',  // Blue
    '#8000ff',  // Purple
    '#ffffff',  // White
  ]
  
  // DEBUG: Only show SAND patches
  const DEBUG_TERRAIN = 'sand'
  
  for (const [id, patch] of patchBoundaries.patches.value) {
    // Filter: only sand
    if (patch.terrainId !== DEBUG_TERRAIN) continue
    
    const segments = patch.segments || []
    console.log(`[Debug] Patch ${id}: ${segments.length} segments`)
    
    // Log segment info
    segments.forEach((seg, i) => {
      console.log(`  Segment ${i}: neighbor=${seg.neighborTerrain || 'null'}, edges=${seg.edges.length}`)
    })
    
    // Draw each segment with its rainbow color
    // Apply effects: test with straighten strength=0.8
    const DEBUG_STRAIGHTEN = 0.6
    const DEBUG_SMOOTH = 0  // 0 = off, 1-4 = iterations
    const GHOST_EDGES = 2  // How many neighbor edges to include for smoother transitions
    
    segments.forEach((segment, segmentIdx) => {
      const colorHex = SEGMENT_COLORS[segmentIdx % SEGMENT_COLORS.length]
      const color = new THREE.Color(colorHex)
      
      // Get previous and next segments (circular)
      const prevSegment = segments[(segmentIdx - 1 + segments.length) % segments.length]
      const nextSegment = segments[(segmentIdx + 1) % segments.length]
      
      // Build extended polyline with ghost edges from neighbors
      // Ghost edges: last N edges of previous segment + current + first N edges of next segment
      const ghostEdgesBefore = prevSegment.edges.slice(-GHOST_EDGES)
      const ghostEdgesAfter = nextSegment.edges.slice(0, GHOST_EDGES)
      
      // Convert to points
      const beforePoints = edgesToPolyline(ghostEdgesBefore)
      const currentPoints = edgesToPolyline(segment.edges)
      const afterPoints = edgesToPolyline(ghostEdgesAfter)
      
      // Combine: before (excluding last point to avoid duplicate) + current + after (excluding first point)
      let extendedPolyline = [
        ...beforePoints.slice(0, -1),  // Ghost before (без последней точки)
        ...currentPoints,               // Current segment
        ...afterPoints.slice(1)         // Ghost after (без первой точки)
      ]
      
      const ghostPointsBefore = beforePoints.length - 1  // How many ghost points at start
      const ghostPointsAfter = afterPoints.length - 1    // How many ghost points at end
      const originalLength = currentPoints.length
      
      console.log(`  Segment ${segmentIdx}: ${originalLength} pts, +${ghostPointsBefore} ghost before, +${ghostPointsAfter} ghost after`)
      
      // Apply effects to extended polyline
      if (DEBUG_SMOOTH > 0) {
        extendedPolyline = smoothPolylineOpen(extendedPolyline, DEBUG_SMOOTH)
      }
      if (DEBUG_STRAIGHTEN > 0) {
        extendedPolyline = straightenPolylineOpen(extendedPolyline, DEBUG_STRAIGHTEN)
      }
      
      // Calculate where current segment is in the processed polyline
      // After smoothing, point count may change, so we need to estimate proportionally
      const totalOriginalPoints = ghostPointsBefore + originalLength + ghostPointsAfter
      const ratio = extendedPolyline.length / totalOriginalPoints
      
      const startIdx = Math.round(ghostPointsBefore * ratio)
      const endIdx = extendedPolyline.length - Math.round(ghostPointsAfter * ratio)
      
      // Extract only the current segment's portion
      const polyline = extendedPolyline.slice(startIdx, endIdx)
      
      console.log(`  Segment ${segmentIdx}: extracted ${polyline.length} points from extended ${extendedPolyline.length}`)
      
      // Draw polyline as connected cylinders
      for (let i = 0; i < polyline.length - 1; i++) {
        const p1 = new THREE.Vector3(polyline[i].x, LINE_Y, polyline[i].z)
        const p2 = new THREE.Vector3(polyline[i+1].x, LINE_Y, polyline[i+1].z)
        
        const length = p1.distanceTo(p2)
        if (length < 0.001) continue  // Skip degenerate segments
        
        const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5)
        
        const geometry = new THREE.CylinderGeometry(LINE_RADIUS, LINE_RADIUS, length, 6)
        geometry.rotateX(Math.PI / 2)
        
        const material = new THREE.MeshBasicMaterial({ 
          color,
          depthTest: false,
        })
        const cylinder = new THREE.Mesh(geometry, material)
        
        cylinder.position.copy(center)
        cylinder.lookAt(p2)
        cylinder.renderOrder = 999
        
        debugBoundariesGroup.add(cylinder)
      }
    })
  }
  
  scene.add(debugBoundariesGroup)
  console.log('[Debug] Drew', debugBoundariesGroup.children.length, 'edge cylinders for', DEBUG_TERRAIN)
}

// Update transition rules texture from props.rules
function updateTransitionRulesTexture() {
  if (!transitionRulesTexture) return
  
  const data = transitionRulesTexture.image.data
  const rulesWidth = RULE_DATA_WIDTH
  
  // Clear all rules first
  for (let i = 0; i < rulesWidth * MAX_RULES * 4; i++) {
    data[i] = 0
  }
  
  // Encode each rule
  props.rules.forEach((rule, ruleIndex) => {
    if (ruleIndex >= MAX_RULES) return
    
    const baseIdx = ruleIndex * rulesWidth * 4
    
    // Pixel 0: Match info
    // r = fromTerrainId (or -1 for any), g = toTerrainId (or -1 for any)
    // b = matchLevel (0=id-to-id, 1=id-to-any/any-to-id, 2=any), a = enabled
    const fromId = rule.match?.from 
      ? props.terrains.findIndex(t => t.id === rule.match.from)
      : -1
    const toId = rule.match?.to
      ? props.terrains.findIndex(t => t.id === rule.match.to)
      : -1
    
    // Match level based on format: 'id-to-id', 'id-to-any', 'any-to-id', 'any-to-any'
    let matchLevel = 0
    if (rule.match?.level === 'id-to-id') matchLevel = 0
    else if (rule.match?.level === 'id-to-any' || rule.match?.level === 'any-to-id') matchLevel = 1
    else matchLevel = 2
    
    // DEBUG: Log rule encoding
    const hasSmoothEffect = rule.lineEffects?.find(e => e.enabled && e.type === 'smooth')
    const hasStraightenEffect = rule.lineEffects?.find(e => e.enabled && e.type === 'straighten')
    const hasSmooth = !!(hasSmoothEffect || hasStraightenEffect)
    console.log(`[Rule ${ruleIndex}] ${rule.match?.from || 'any'} → ${rule.match?.to || 'any'}, level=${matchLevel}, fromId=${fromId}, toId=${toId}, hasSmooth=${hasSmooth}`)
    
    data[baseIdx + 0] = (fromId + 1) / 256  // +1 so -1 becomes 0
    data[baseIdx + 1] = (toId + 1) / 256
    data[baseIdx + 2] = matchLevel / 4
    data[baseIdx + 3] = 1  // enabled
    
    // Pixel 1: Priority and blend settings
    // r = priority, g = zPriority, b = blendWidth, a = smoothAmount (0=hex edges, 1=full smooth)
    data[baseIdx + 4] = (rule.priority || 0) / 200  // normalize 0-200 to 0-1
    data[baseIdx + 5] = 0.5  // zPriority default
    data[baseIdx + 6] = 0.0  // No default blend width - must be set explicitly by mask effects
    
    // Check for smooth/straighten effects and encode as smoothAmount
    const smoothEffect = rule.lineEffects?.find(e => e.enabled && e.type === 'smooth')
    const straightenEffect = rule.lineEffects?.find(e => e.enabled && e.type === 'straighten')
    let smoothAmount = 0.0  // Default: sharp hex edges (no CPU SDF)
    if (smoothEffect || straightenEffect) {
      // Both smooth and straighten use CPU-computed SDF boundaries
      smoothAmount = 1.0
    }
    data[baseIdx + 7] = smoothAmount
    
    // Find first enabled deformation effect (wave, noise, jagged, etc.)
    // Pixel 2: Line effect
    // r = type, g = amplitude, b = frequency, a = phase/seed
    const lineEffect = rule.lineEffects?.find(e => e.enabled && 
      ['wave', 'noise', 'jagged', 'sine', 'zigzag'].includes(e.type))
    if (lineEffect) {
      const lineTypes = { none: 0, subdivide: 1, wave: 2, noise: 3, jagged: 4, sine: 5, zigzag: 6, straighten: 7, smooth: 8 }
      data[baseIdx + 8] = (lineTypes[lineEffect.type] || 0) / 10
      data[baseIdx + 9] = (lineEffect.amplitude || 0.1) / 0.5  // normalize to 0-1
      data[baseIdx + 10] = (lineEffect.frequency || 5) / 20
      data[baseIdx + 11] = (lineEffect.seed || 0) / 1000
    }
    
    // Pixel 3: Mask effect (first one)
    // r = type, g = width, b = falloff/density, a = noiseScale
    const maskEffect = rule.maskEffects?.find(e => e.enabled)
    if (maskEffect) {
      const maskTypes = { none: 0, blend: 1, scatter: 2, noiseBlend: 3 }
      data[baseIdx + 12] = (maskTypes[maskEffect.type] || 1) / 10
      data[baseIdx + 13] = maskEffect.width || 0.15
      data[baseIdx + 14] = maskEffect.density || maskEffect.falloff || 0.5
      data[baseIdx + 15] = (maskEffect.noiseScale || 0.2) * 5  // scale up
    }
    // No default mask effect - if no maskEffects defined, pixels stay at 0 (maskType = none)
    
    // Pixel 4: Draw effect (first one)
    // r = type, g = offset, b = width/blur, a = opacity
    const drawEffect = rule.drawEffects?.find(e => e.enabled)
    if (drawEffect) {
      const drawTypes = { none: 0, shadow: 1, glow: 2, stroke: 3, highlight: 4 }
      data[baseIdx + 16] = (drawTypes[drawEffect.type] || 0) / 10
      data[baseIdx + 17] = drawEffect.offsetX || drawEffect.offset || 0.02
      data[baseIdx + 18] = drawEffect.width || 0.04
      data[baseIdx + 19] = drawEffect.opacity || 0.3
    }
  })
  
  transitionRulesTexture.needsUpdate = true
}

// Update terrain data in texture
function updateTerrainDataTexture(q, r, terrainIndex, layerCount, elevation) {
  if (!terrainDataTexture) return
  
  const x = q + MAP_CENTER_OFFSET
  const y = r + MAP_CENTER_OFFSET
  const idx = (y * TERRAIN_DATA_SIZE + x) * 4
  
  const data = terrainDataTexture.image.data
  data[idx + 0] = terrainIndex / 255  // normalized terrainId
  data[idx + 1] = layerCount / 8      // normalized layerCount
  data[idx + 2] = elevation
  data[idx + 3] = 1
  terrainDataTexture.needsUpdate = true
}

// Update terrain colors texture from props.terrains
function updateTerrainColorsTexture() {
  if (!terrainColorsTexture) return
  
  const data = terrainColorsTexture.image.data
  
  props.terrains.forEach((terrain, index) => {
    const color = new THREE.Color(terrain.previewColor || terrain.color || '#808080')
    data[index * 4 + 0] = color.r
    data[index * 4 + 1] = color.g
    data[index * 4 + 2] = color.b
    data[index * 4 + 3] = 1.0
    
    // Row 1: HSLA modifier (offset by 256 pixels)
    const hsla = terrain.hsla || { hue: 0, saturation: 0, lightness: 0, alpha: 1 }
    const hslaOffset = 256 * 4
    data[hslaOffset + index * 4 + 0] = (hsla.hue + 180) / 360      // -180..180 -> 0..1
    data[hslaOffset + index * 4 + 1] = (hsla.saturation + 100) / 200  // -100..100 -> 0..1
    data[hslaOffset + index * 4 + 2] = (hsla.lightness + 100) / 200   // -100..100 -> 0..1
    data[hslaOffset + index * 4 + 3] = hsla.alpha ?? 1
  })
  
  terrainColorsTexture.needsUpdate = true
}

// Update terrain layers texture from props.terrains
function updateTerrainLayersTexture() {
  if (!terrainLayersTexture) return
  
  const data = terrainLayersTexture.image.data
  const layersWidth = MAX_LAYERS_PER_TERRAIN * LAYER_DATA_WIDTH
  
  props.terrains.forEach((terrain, terrainIndex) => {
    const layers = terrain.layers || []
    const layerCount = Math.min(layers.length, MAX_LAYERS_PER_TERRAIN)
    
    layers.forEach((layer, layerIdx) => {
      if (layerIdx >= MAX_LAYERS_PER_TERRAIN) return
      
      const baseX = layerIdx * LAYER_DATA_WIDTH
      const y = terrainIndex
      const baseIdx = (y * layersWidth + baseX) * 4
      
      // Layer type mapping
      const typeMap = { color: 0, noise: 1, pattern: 2, gradient: 3, texture: 1, edge: 0 }
      const layerType = (typeMap[layer.type] || 0) / 10  // normalized
      
      // Blend mode mapping (9 modes: 0-8)
      const blendMap = { normal: 0, multiply: 1, screen: 2, overlay: 3, add: 4, subtract: 5, difference: 6, softLight: 7, hardLight: 8 }
      const blendMode = (blendMap[layer.blendMode] || 0) / 8  // normalized for 9 modes
      
      // Pixel 0: [type, enabled, opacity, blendMode]
      data[baseIdx + 0] = layerType
      data[baseIdx + 1] = layer.enabled ? 1 : 0
      data[baseIdx + 2] = layer.opacity ?? 1.0
      data[baseIdx + 3] = blendMode
      
      // Pixel 1: layer-specific params (basic)
      const paramsIdx = baseIdx + 4
      if (layer.type === 'noise') {
        // Noise types: 0=perlin, 1=simplex, 2=voronoi, 3=cellular, 4=fbm, 5=worley, 6=white, 7=warped, 8=fibrous, 9=ridged
        const noiseTypeMap = { perlin: 0, simplex: 1, voronoi: 2, cellular: 3, fbm: 4, worley: 5, white: 6, warped: 7, fibrous: 8, ridged: 9, value: 0 }
        data[paramsIdx + 0] = (noiseTypeMap[layer.noiseType] ?? 0) / 10  // normalized for 10 types
        data[paramsIdx + 1] = (layer.scale || 1) / 10
        data[paramsIdx + 2] = (layer.octaves || 4) / 8
        data[paramsIdx + 3] = layer.persistence ?? 0.5
      } else if (layer.type === 'pattern') {
        // Pattern types: 0=stripes, 1=checker, 2=hexgrid, 3=grid, 4=dots, 5=rings, 6=waves, 7=crosshatch, 8=triangles
        const patternMap = { stripes: 0, checker: 1, hexgrid: 2, hexagonal: 2, grid: 3, dots: 4, rings: 5, waves: 6, crosshatch: 7, diagonal: 8, triangles: 8 }
        data[paramsIdx + 0] = (patternMap[layer.patternType] || 0) / 10  // normalized for 10 types
        data[paramsIdx + 1] = (layer.scale || 1) / 10
        // UI uses 'rotation', shader expects 'angle'
        data[paramsIdx + 2] = (layer.rotation ?? layer.angle ?? 0) / 360
        // UI uses 'lineWidth' for most patterns, 'dotSize' for dots
        data[paramsIdx + 3] = layer.lineWidth ?? layer.thickness ?? layer.dotSize ?? 0.1
      } else if (layer.type === 'gradient') {
        // Gradient types: 0=linear, 1=radial, 2=angular, 3=diamond
        const gradMap = { linear: 0, radial: 1, angular: 2, diamond: 3 }
        data[paramsIdx + 0] = (gradMap[layer.gradientType] || 0) / 4  // normalized for 4 types
        data[paramsIdx + 1] = (layer.angle || 0) / 360
        data[paramsIdx + 2] = layer.scale || 1
        data[paramsIdx + 3] = layer.offset || 0
      }
      
      // Pixel 2: extended params [lacunarity, amplitude/ringCount, threshold/waveFreq/direction, seed]
      const params2Idx = baseIdx + 8
      data[params2Idx + 0] = (layer.lacunarity || 2.0) / 4   // normalized (0-4 range)
      // For patterns: amplitude = ringCount (1-10), for noise = amplitude (0-2)
      data[params2Idx + 1] = (layer.amplitude ?? layer.ringCount ?? 1.0) / 10
      // For waves: threshold = waveFrequency, for fibrous: direction, for noise = threshold
      data[params2Idx + 2] = (layer.direction ?? layer.threshold ?? layer.waveFrequency ?? 0) / 360
      data[params2Idx + 3] = ((layer.seed || 0) % 1000) / 1000  // normalized seed
      
      // Pixel 3: offset and extra params [offsetX, offsetY, invert, smoothness/warpStrength]
      const params3Idx = baseIdx + 12
      // For gradient, centerX/Y are 0-1 normalized; for pattern offset.x/y are world units
      const offX = layer.offsetX ?? layer.offset?.x ?? ((layer.centerX ?? 0.5) - 0.5) * 20  // convert center to world offset
      const offY = layer.offsetY ?? layer.offset?.y ?? ((layer.centerY ?? 0.5) - 0.5) * 20
      data[params3Idx + 0] = (offX % 100) / 100
      data[params3Idx + 1] = (offY % 100) / 100
      data[params3Idx + 2] = layer.invert ? 1 : 0
      // Smoothness for voronoi, warpStrength for warped/fibrous
      data[params3Idx + 3] = (layer.warpStrength ?? layer.smoothness ?? 0.5) / 4  // normalized 0-4 range
      
      // Pixel 4: primary color (first gradient stop, colorMin, colorA, or color)
      const colorIdx = baseIdx + 16
      let color1Hex = '#808080'
      if (layer.colors && layer.colors.length > 0) {
        // Sort by stop and get first color
        const sorted = [...layer.colors].sort((a, b) => a.stop - b.stop)
        color1Hex = sorted[0].color
      } else {
        color1Hex = layer.colorMin || layer.colorA || layer.color || '#808080'
      }
      const color1 = new THREE.Color(color1Hex)
      data[colorIdx + 0] = color1.r
      data[colorIdx + 1] = color1.g
      data[colorIdx + 2] = color1.b
      data[colorIdx + 3] = 1.0
      
      // Pixel 5: secondary color (last gradient stop, colorMax, colorB, or color2)
      const color2Idx = baseIdx + 20
      let color2Hex = '#ffffff'
      if (layer.colors && layer.colors.length > 1) {
        // Sort by stop and get last color
        const sorted = [...layer.colors].sort((a, b) => a.stop - b.stop)
        color2Hex = sorted[sorted.length - 1].color
      } else {
        color2Hex = layer.colorMax || layer.colorB || layer.color2 || '#ffffff'
      }
      const color2 = new THREE.Color(color2Hex)
      data[color2Idx + 0] = color2.r
      data[color2Idx + 1] = color2.g
      data[color2Idx + 2] = color2.b
      data[color2Idx + 3] = 1.0
    })
  })
  
  terrainLayersTexture.needsUpdate = true
}

// Create unified BufferGeometry for all hexes
function createUnifiedHexGeometry(hexCoords) {
  // Каждый гекс = 6 треугольников (веер от центра) для верхней грани
  // + 6 прямоугольников (12 треугольников) для боковых граней
  // + 6 треугольников для нижней грани
  // Всего: 6 + 12 + 6 = 24 треугольника на гекс, но упростим до top surface only для начала
  
  const verticesPerHex = 7  // центр + 6 углов
  const trianglesPerHex = 6  // 6 треугольников в веере
  const indicesPerHex = trianglesPerHex * 3
  
  const totalVertices = hexCoords.length * verticesPerHex
  const totalIndices = hexCoords.length * indicesPerHex
  
  const positions = new Float32Array(totalVertices * 3)
  const colors = new Float32Array(totalVertices * 3)
  const normals = new Float32Array(totalVertices * 3)
  const hexCoordAttr = new Float32Array(totalVertices * 2)  // q, r for each vertex
  const indices = new Uint32Array(totalIndices)
  
  const vertexMap = new Map()
  let vertexOffset = 0
  let indexOffset = 0
  
  for (const { q, r } of hexCoords) {
    const key = `${q},${r}`
    const terrainDef = getTerrainForHex(q, r)
    const computedColor = computeTerrainColor(terrainDef, q, r)
    const color = new THREE.Color(computedColor)
    
    const elevation = typeof terrainDef.elevation === 'object' 
      ? (terrainDef.elevation?.base || 0) 
      : (terrainDef.elevation || 0)
    const y = elevation * 0.3 + HEX_HEIGHT
    
    const { x: centerX, z: centerZ } = hexToWorld(q, r)
    
    // Сохраняем маппинг для этого гекса
    vertexMap.set(key, {
      startVertex: vertexOffset,
      vertexCount: verticesPerHex,
      startIndex: indexOffset,
      indexCount: indicesPerHex,
    })
    
    // Центральный vertex
    const centerIdx = vertexOffset
    positions[centerIdx * 3] = centerX
    positions[centerIdx * 3 + 1] = y
    positions[centerIdx * 3 + 2] = centerZ
    colors[centerIdx * 3] = color.r
    colors[centerIdx * 3 + 1] = color.g
    colors[centerIdx * 3 + 2] = color.b
    normals[centerIdx * 3] = 0
    normals[centerIdx * 3 + 1] = 1
    normals[centerIdx * 3 + 2] = 0
    hexCoordAttr[centerIdx * 2] = q
    hexCoordAttr[centerIdx * 2 + 1] = r
    
    // 6 угловых vertices
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6  // pointy-top
      const vx = centerX + HEX_SIZE * Math.cos(angle)
      const vz = centerZ + HEX_SIZE * Math.sin(angle)
      
      const vIdx = centerIdx + 1 + i
      positions[vIdx * 3] = vx
      positions[vIdx * 3 + 1] = y
      positions[vIdx * 3 + 2] = vz
      colors[vIdx * 3] = color.r
      colors[vIdx * 3 + 1] = color.g
      colors[vIdx * 3 + 2] = color.b
      normals[vIdx * 3] = 0
      normals[vIdx * 3 + 1] = 1
      normals[vIdx * 3 + 2] = 0
      hexCoordAttr[vIdx * 2] = q
      hexCoordAttr[vIdx * 2 + 1] = r
    }
    
    // 6 треугольников (fan от центра) - CCW winding для верхней грани (Y+)
    for (let i = 0; i < 6; i++) {
      const next = (i + 1) % 6
      indices[indexOffset] = centerIdx
      indices[indexOffset + 1] = centerIdx + 1 + next  // Reversed for CCW
      indices[indexOffset + 2] = centerIdx + 1 + i
      indexOffset += 3
    }
    
    vertexOffset += verticesPerHex
  }
  
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setAttribute('hexCoord', new THREE.BufferAttribute(hexCoordAttr, 2))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  
  return { geometry, vertexMap }
}

// Create invisible proxy meshes for raycasting
function createProxyMeshes(hexCoords) {
  const hexShape = createHexShape(HEX_SIZE)
  const extrudeSettings = { steps: 1, depth: HEX_HEIGHT, bevelEnabled: false }
  const geometry = new THREE.ExtrudeGeometry(hexShape, extrudeSettings)
  geometry.rotateX(-Math.PI / 2)
  
  const invisibleMaterial = new THREE.MeshBasicMaterial({
    visible: false,
  })
  
  for (const { q, r } of hexCoords) {
    const terrainDef = getTerrainForHex(q, r)
    const elevation = typeof terrainDef.elevation === 'object' 
      ? (terrainDef.elevation?.base || 0) 
      : (terrainDef.elevation || 0)
    
    const { x, z } = hexToWorld(q, r)
    const mesh = new THREE.Mesh(geometry, invisibleMaterial)
    mesh.position.set(x, elevation * 0.3, z)
    mesh.userData = { q, r, terrain: terrainDef }
    
    scene.add(mesh)
    hexMeshes.push(mesh)
  }
}

// Update hex color in unified mesh
function updateHexColor(q, r, terrain) {
  if (!unifiedMesh) return
  
  const key = `${q},${r}`
  const mapping = hexVertexMap.get(key)
  if (!mapping) return
  
  const computedColor = computeTerrainColor(terrain, q, r)
  const color = new THREE.Color(computedColor)
  
  const colors = unifiedMesh.geometry.attributes.color.array
  const positions = unifiedMesh.geometry.attributes.position.array
  
  // Обновляем elevation
  const elevation = typeof terrain.elevation === 'object' 
    ? (terrain.elevation?.base || 0) 
    : (terrain.elevation || 0)
  const y = elevation * 0.3 + HEX_HEIGHT
  
  // Обновляем все vertices этого гекса
  for (let i = 0; i < mapping.vertexCount; i++) {
    const vIdx = mapping.startVertex + i
    colors[vIdx * 3] = color.r
    colors[vIdx * 3 + 1] = color.g
    colors[vIdx * 3 + 2] = color.b
    positions[vIdx * 3 + 1] = y  // Y coordinate
  }
  
  unifiedMesh.geometry.attributes.color.needsUpdate = true
  unifiedMesh.geometry.attributes.position.needsUpdate = true
  
  // Обновляем proxy mesh
  const proxyMesh = hexMeshes.find(m => m.userData.q === q && m.userData.r === r)
  if (proxyMesh) {
    const { x, z } = hexToWorld(q, r)
    proxyMesh.position.set(x, elevation * 0.3, z)
    proxyMesh.userData.terrain = terrain
  }
}

// Compute terrain color by compositing layers
function computeTerrainColor(terrain, q, r) {
  // If no layers, use previewColor or color
  if (!terrain.layers || terrain.layers.length === 0) {
    return terrain.previewColor || terrain.color || '#808080'
  }
  
  // Start with transparent
  let resultR = 0, resultG = 0, resultB = 0, resultA = 0
  
  // Process each enabled layer
  for (const layer of terrain.layers) {
    if (!layer.enabled) continue
    
    const layerColor = getLayerColor(layer, q, r)
    if (!layerColor) continue
    
    const opacity = layer.opacity ?? 1.0
    
    // Apply blend mode
    const blended = blendColors(
      { r: resultR, g: resultG, b: resultB, a: resultA },
      { r: layerColor.r, g: layerColor.g, b: layerColor.b, a: opacity },
      layer.blendMode || 'normal'
    )
    
    resultR = blended.r
    resultG = blended.g
    resultB = blended.b
    resultA = blended.a
  }
  
  // Convert back to hex
  const finalR = Math.round(Math.max(0, Math.min(255, resultR * 255)))
  const finalG = Math.round(Math.max(0, Math.min(255, resultG * 255)))
  const finalB = Math.round(Math.max(0, Math.min(255, resultB * 255)))
  
  return `#${finalR.toString(16).padStart(2, '0')}${finalG.toString(16).padStart(2, '0')}${finalB.toString(16).padStart(2, '0')}`
}

// Get color from a single layer
function getLayerColor(layer, q, r) {
  switch (layer.type) {
    case 'color':
      return hexToRgb(layer.color || '#808080')
    
    case 'noise': {
      // Simple noise approximation using position
      const seed = layer.seed || 0
      const scale = layer.scale || 1
      const noiseVal = simpleNoise(q * scale + seed, r * scale + seed)
      const t = layer.invert ? 1 - noiseVal : noiseVal
      
      // Interpolate between colorA and colorB
      const colorA = hexToRgb(layer.colorA || '#000000')
      const colorB = hexToRgb(layer.colorB || '#ffffff')
      
      return {
        r: colorA.r + (colorB.r - colorA.r) * t,
        g: colorA.g + (colorB.g - colorA.g) * t,
        b: colorA.b + (colorB.b - colorA.b) * t,
      }
    }
    
    case 'pattern': {
      const patternVal = getPatternValue(layer, q, r)
      const color = hexToRgb(layer.color || '#ffffff')
      return {
        r: color.r * patternVal,
        g: color.g * patternVal,
        b: color.b * patternVal,
      }
    }
    
    case 'gradient': {
      const gradientVal = getGradientValue(layer, q, r)
      // Get color from gradient stops
      const colors = layer.colors || [{ stop: 0, color: '#000000' }, { stop: 1, color: '#ffffff' }]
      return interpolateGradient(colors, gradientVal)
    }
    
    default:
      return null
  }
}

// Simple deterministic noise function
function simpleNoise(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return n - Math.floor(n)
}

// Get pattern value (0 or 1)
function getPatternValue(layer, q, r) {
  const scale = layer.scale || 1
  const x = q / scale
  const y = r / scale
  
  switch (layer.patternType) {
    case 'checker':
      return ((Math.floor(x) + Math.floor(y)) % 2 === 0) ? 1 : 0
    case 'stripes':
      return (Math.floor(x + y) % 2 === 0) ? 1 : 0
    case 'dots':
      const dist = Math.sqrt((x % 1 - 0.5) ** 2 + (y % 1 - 0.5) ** 2)
      return dist < (layer.dotSize || 0.2) ? 1 : 0
    case 'hexgrid':
      // Simplified - just show edges
      return 0.5
    default:
      return 1
  }
}

// Get gradient value based on position
function getGradientValue(layer, q, r) {
  const scale = layer.scale || 1
  const mapRadius = currentMapRadius || DEFAULT_MAP_RADIUS
  switch (layer.gradientType) {
    case 'radial':
      return Math.min(1, Math.sqrt(q * q + r * r) / (mapRadius * scale))
    case 'linear':
    default:
      const angle = (layer.angle || 0) * Math.PI / 180
      const proj = (q * Math.cos(angle) + r * Math.sin(angle)) / mapRadius
      return (proj + 1) / 2
  }
}

// Interpolate gradient colors
function interpolateGradient(colors, t) {
  const sorted = [...colors].sort((a, b) => a.stop - b.stop)
  
  // Find surrounding stops
  let lower = sorted[0]
  let upper = sorted[sorted.length - 1]
  
  for (let i = 0; i < sorted.length - 1; i++) {
    if (t >= sorted[i].stop && t <= sorted[i + 1].stop) {
      lower = sorted[i]
      upper = sorted[i + 1]
      break
    }
  }
  
  const range = upper.stop - lower.stop
  const localT = range > 0 ? (t - lower.stop) / range : 0
  
  const colorA = hexToRgb(lower.color)
  const colorB = hexToRgb(upper.color)
  
  return {
    r: colorA.r + (colorB.r - colorA.r) * localT,
    g: colorA.g + (colorB.g - colorA.g) * localT,
    b: colorA.b + (colorB.b - colorA.b) * localT,
  }
}

// Blend two colors
function blendColors(base, top, mode) {
  const a = top.a
  
  let r, g, b
  
  switch (mode) {
    case 'multiply':
      r = base.r * top.r
      g = base.g * top.g
      b = base.b * top.b
      break
    case 'screen':
      r = 1 - (1 - base.r) * (1 - top.r)
      g = 1 - (1 - base.g) * (1 - top.g)
      b = 1 - (1 - base.b) * (1 - top.b)
      break
    case 'overlay':
      r = base.r < 0.5 ? 2 * base.r * top.r : 1 - 2 * (1 - base.r) * (1 - top.r)
      g = base.g < 0.5 ? 2 * base.g * top.g : 1 - 2 * (1 - base.g) * (1 - top.g)
      b = base.b < 0.5 ? 2 * base.b * top.b : 1 - 2 * (1 - base.b) * (1 - top.b)
      break
    case 'add':
      r = Math.min(1, base.r + top.r)
      g = Math.min(1, base.g + top.g)
      b = Math.min(1, base.b + top.b)
      break
    case 'normal':
    default:
      r = top.r
      g = top.g
      b = top.b
      break
  }
  
  // Apply opacity
  return {
    r: base.r * (1 - a) + r * a,
    g: base.g * (1 - a) + g * a,
    b: base.b * (1 - a) + b * a,
    a: base.a + a * (1 - base.a),
  }
}

// Convert hex to RGB (0-1 range)
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return { r: 0.5, g: 0.5, b: 0.5 }
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  }
}

// Get terrain for specific hex
function getTerrainForHex(q, r) {
  // В первую очередь проверяем нарисованный террейн в hexMapState
  const key = `${q},${r}`
  const paintedTerrainId = hexMapState.value.get(key)
  if (paintedTerrainId) {
    const painted = props.terrains.find(t => t.id === paintedTerrainId)
    if (painted) return painted
  }
  
  // If editing a single terrain, show it on all hexes
  if (props.terrain) {
    return props.terrain
  }

  // If editing a structure, show its terrain in center
  if (props.structure && props.structure.terrainId) {
    const structureTerrain = props.terrains.find(t => t.id === props.structure.terrainId)
    
    // Structure in center
    if (props.structure.type === 'path') {
      // Show as horizontal path
      if (Math.abs(r) <= 0 && Math.abs(q) <= 2) {
        return structureTerrain || getDefaultTerrain()
      }
    } else if (props.structure.type === 'area') {
      // Show as circular area
      if (Math.abs(q) + Math.abs(r) <= 2) {
        return structureTerrain || getDefaultTerrain()
      }
    } else if (props.structure.type === 'point') {
      // Show as single hex
      if (q === 0 && r === 0) {
        return structureTerrain || getDefaultTerrain()
      }
    }
  }

  // Default: vary terrain based on position for visual interest
  return getVariedTerrain(q, r)
}

function getDefaultTerrain() {
  return {
    id: 'default',
    name: 'По умолчанию',
    previewColor: '#4a7c23',
    color: '#4a7c23',
    elevation: { base: 0, variation: 0, noiseScale: 1 },
    opacity: 1,
    layers: [],
  }
}

function getVariedTerrain(q, r) {
  // Simple noise-like variation using available terrains
  const terrains = props.terrains.length > 0 ? props.terrains : [getDefaultTerrain()]
  
  // Simple hash for variation
  const hash = Math.abs((q * 7 + r * 13) % 17)
  
  if (hash < 10) {
    return terrains[0] // Primary terrain (grass)
  } else if (hash < 14) {
    return terrains[1] || terrains[0] // Secondary (water)
  } else {
    return terrains[2] || terrains[0] // Tertiary (stone)
  }
}

// Clear existing hexes
function clearHexes() {
  // Clear unified mesh
  if (unifiedMesh) {
    scene.remove(unifiedMesh)
    unifiedMesh.geometry.dispose()
    unifiedMesh.material.dispose()
    unifiedMesh = null
  }
  hexVertexMap.clear()
  hexCoordsArray = []
  
  // Clear proxy meshes
  hexMeshes.forEach(mesh => {
    scene.remove(mesh)
    // Geometry shared, don't dispose per mesh
    mesh.material.dispose()
  })
  hexMeshes = []
}

// Animation loop
function animate() {
  animationId = requestAnimationFrame(animate)
  
  // Update shader uniforms
  if (unifiedMesh && unifiedMesh.material.uniforms) {
    unifiedMesh.material.uniforms.uTime.value = performance.now() * 0.001
  }
  
  renderer.render(scene, camera)
}

// Handle resize
function handleResize() {
  if (!containerRef.value || !renderer) return

  const width = containerRef.value.clientWidth
  const height = containerRef.value.clientHeight
  const aspect = width / height

  // Обновляем perspective камеру
  if (perspectiveCamera) {
    perspectiveCamera.aspect = aspect
    perspectiveCamera.updateProjectionMatrix()
  }
  
  // Обновляем ortho камеру
  if (orthoCamera) {
    const frustumSize = 15 / cameraState.zoom
    orthoCamera.left = -frustumSize * aspect / 2
    orthoCamera.right = frustumSize * aspect / 2
    orthoCamera.top = frustumSize / 2
    orthoCamera.bottom = -frustumSize / 2
    orthoCamera.updateProjectionMatrix()
  }

  renderer.setSize(width, height)
}

// Watch for terrain changes
watch(
  () => props.terrain,
  () => {
    if (scene) {
      updateTerrainColorsTexture()
      updateTerrainLayersTexture()
      createHexGrid()
    }
  },
  { deep: true }
)

// Watch for structure changes
watch(
  () => props.structure,
  () => {
    if (scene) {
      createHexGrid()
    }
  },
  { deep: true }
)

// Watch for terrains list changes
watch(
  () => props.terrains,
  () => {
    if (scene) {
      updateTerrainColorsTexture()
      updateTerrainLayersTexture()
      if (!props.terrain) {
        createHexGrid()
      }
    }
  },
  { deep: true }
)

// Watch for transition rules changes
watch(
  () => props.rules,
  () => {
    if (scene) {
      updateTransitionRulesTexture()
      // Also update CPU-computed SDF since rules may have changed smooth/straighten effects
      updatePatchSDFTexture()
    }
  },
  { deep: true }
)

onMounted(() => {
  init()
  window.addEventListener('resize', handleResize)
  
  // Expose debug function to console
  window.setSDFDebugMode = (mode) => {
    if (unifiedMesh && unifiedMesh.material.uniforms) {
      unifiedMesh.material.uniforms.uDebugSDFMode.value = mode
      console.log('[SDF Debug] Mode set to:', mode, '(0=off, 1=valid, 2=terrainIDs, 3=distance, 4=matching)')
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  
  // Clear debounce timer for patch SDF updates
  if (patchSDFUpdateTimer) {
    clearTimeout(patchSDFUpdateTimer)
  }
  
  if (animationId) {
    cancelAnimationFrame(animationId)
  }

  clearHexes()

  if (highlightMesh) {
    scene.remove(highlightMesh)
    highlightMesh.geometry.dispose()
    highlightMesh.material.dispose()
  }

  if (renderer) {
    renderer.dispose()
  }
})
</script>

<style scoped>
.three-preview {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.three-preview canvas {
  width: 100% !important;
  height: 100% !important;
  cursor: grab;
}

.three-preview canvas:active {
  cursor: grabbing;
}

/* Панель управления */
.preview-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 4px;
  background: rgba(20, 20, 40, 0.85);
  padding: 4px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.control-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(60, 60, 100, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #aaa;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.control-btn:hover {
  background: rgba(80, 80, 130, 0.7);
  color: #fff;
}

.control-btn.active {
  background: rgba(100, 100, 180, 0.8);
  color: #fff;
  border-color: rgba(150, 150, 255, 0.5);
}

.control-separator {
  width: 1px;
  background: rgba(255, 255, 255, 0.2);
  margin: 2px 4px;
}

/* Информация о гексе */
.preview-info {
  position: absolute;
  bottom: 30px;
  left: 10px;
  padding: 6px 10px;
  background: rgba(20, 20, 40, 0.85);
  border-radius: 4px;
  font-size: 12px;
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Подсказка */
.preview-hint {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  font-size: 10px;
  color: #666;
  white-space: nowrap;
}
</style>
