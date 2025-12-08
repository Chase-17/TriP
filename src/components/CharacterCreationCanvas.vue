<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useCharacterCreationStore } from '@/stores/characterCreation'
import ClassStatsAndSkills from './ClassStatsAndSkills.vue'
import AspectChart from './AspectChart.vue'
import EquipmentSelector from './EquipmentSelector.vue'
import CharacterFinalization from './CharacterFinalization.vue'
import racesData from '@/data/races.json'
import aspectsData from '@/data/aspects.json'
import subracesData from '@/data/subraces.json'
import classesData from '@/data/classes.json'
import { raceImageUrl, genderIconUrl, classImageUrl } from '@/utils/assets'

const emit = defineEmits(['close', 'created'])

// ===== STORE =====
const creationStore = useCharacterCreationStore()

// ===== STATE =====
const step = computed({
  get: () => creationStore.step,
  set: (value) => creationStore.setStep(value)
})
const totalSteps = 6

// Form data - используем store
const formData = computed(() => creationStore.formData)

// Canvas state
const canvasSize = 800 // Content size (positions calculated based on this)
const viewBoxSize = 1600 // Larger viewBox for pan space
const zoom = ref(1.9) // Start at 190% zoom - larger schema while keeping fully visible
const pan = ref({ x: 0, y: 0 })
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const isDragging = ref(false) // Track if user is dragging vs clicking

onMounted(() => {
  // При монтировании компонента восстанавливаем состояние из store
  console.log('Восстановлено состояние:', creationStore.step, creationStore.formData)
})
const dragThreshold = 5 // pixels to move before considering it a drag

// Touch state
const touchStartDistance = ref(0)
const touchStartZoom = ref(1)
const touchStartPan = ref({ x: 0, y: 0 })

// Hover states
const hoveredRace = ref(null)
const hoveredAspect = ref(null)
const clickedAspect = ref(null) // For highlighting races connected to clicked aspect
const hoveredClass = ref(null)

// Animation state
const transitioning = ref(false)
const transitionDirection = ref('forward') // 'forward' or 'backward'

// Gender selection animation
const genderAnimating = ref(false)

// Double-click detection
const lastClickTime = ref(0)
const lastClickTarget = ref(null)
const DOUBLE_CLICK_DELAY = 300 // ms

// Stats and skills component ref
const statsAndSkillsRef = ref(null)
const statsAndSkillsData = ref({
  stats: { ...creationStore.formData.stats },
  skills: { ...creationStore.formData.skills }
})

// Equipment validation
const equipmentValid = ref(true)

// ===== DATA =====
const races = racesData.races
const aspects = aspectsData.aspects
const allAspects = aspectsData.metadata.circularOrder
const classes = classesData.classes

// ===== COMPUTED =====
const selectedRace = computed(() => races.find(r => r.id === formData.value.race))
const selectedSubrace = computed(() => {
  if (!selectedRace.value || !formData.value.subrace) return null
  
  const parts = formData.value.subrace.split('-')
  if (parts.length !== 2) return null
  
  const [raceId, aspectId] = parts
  const subrace = subracesData.subraces.find(sr => sr.aspect === aspectId)
  if (!subrace) return null
  
  const alias = selectedRace.value.subraceAliases?.[aspectId]
  
  return {
    ...subrace,
    id: formData.value.subrace,
    name: alias?.name || `${subrace.name} ${selectedRace.value.name.toLowerCase()}`,
    description: alias?.description || subrace.description
  }
})

const selectedAspectId = computed(() => {
  if (!formData.value.subrace) return null
  const parts = formData.value.subrace.split('-')
  return parts.length === 2 ? parts[1] : null
})

// Get highlighted aspects for selected race (on step 2)
const highlightedAspects = computed(() => {
  if (step.value !== 2 || !formData.value.race || transitioning.value) return []
  const race = races.find(r => r.id === formData.value.race)
  return race?.position.aspects || []
})

// Get highlighted races for clicked aspect (on step 2)
const highlightedRaces = computed(() => {
  if (step.value !== 2 || !clickedAspect.value || transitioning.value) return []
  return races
    .filter(race => race.position.aspects.includes(clickedAspect.value))
    .map(race => race.id)
})

const canProceed = computed(() => {
  switch (step.value) {
    case 1: return formData.value.gender !== null
    case 2: return formData.value.race !== null
    case 3: return formData.value.subrace !== null
    case 4: {
      // Need class selected AND all skills chosen
      if (!formData.value.class) return false
      const skills = statsAndSkillsData.value.skills
      return skills.fromClass && skills.fromAspect1 && skills.fromAspect2
    }
    case 5: {
      // Need equipment validation to pass
      return equipmentValid.value && formData.value.equipment.armor !== null
    }
    case 6: {
      // Need name and portrait
      return formData.value.name.trim().length > 0 && formData.value.portrait !== null
    }
    default: return false
  }
})

// ===== HELPERS =====
const getAspect = (aspectId) => aspects.find(a => a.id === aspectId)

const getAspectPosition = (aspectId) => {
  const aspect = aspects.find(a => a.id === aspectId)
  if (!aspect) return { x: 0, y: 0 }
  
  const angle = aspect.position.angle
  const radius = canvasSize * 0.32
  const radians = (angle - 90) * (Math.PI / 180)
  const x = canvasSize / 2 + radius * Math.cos(radians)
  const y = canvasSize / 2 + radius * Math.sin(radians)
  
  return { x, y }
}

const getRacePosition = (race) => {
  const [aspect1Id, aspect2Id] = race.position.aspects
  const pos1 = getAspectPosition(aspect1Id)
  const pos2 = getAspectPosition(aspect2Id)
  
  return {
    x: (pos1.x + pos2.x) / 2,
    y: (pos1.y + pos2.y) / 2
  }
}

const getRaceColor = (race) => {
  const aspect1 = getAspect(race.position.aspects[0])
  return aspect1?.color || '#64748b'
}

const getAspectColor = (aspectId) => {
  const aspect = aspects.find(a => a.id === aspectId)
  return aspect?.color || '#666'
}

const getAspectIcon = (aspectId) => {
  const aspect = aspects.find(a => a.id === aspectId)
  return aspect?.icon || 'game-icons:perspective-dice-six-faces-random'
}

const getWealthDescription = (wealth) => {
  if (wealth <= 1) return 'Нищий путешественник без гроша за душой'
  if (wealth <= 3) return 'Бедняк с минимальными средствами'
  if (wealth <= 5) return 'Обычный искатель приключений'
  if (wealth <= 7) return 'Состоятельный авантюрист'
  if (wealth <= 9) return 'Богатый и влиятельный персонаж'
  return 'Невероятно богатый аристократ'
}

// Map aspect IDs to single-letter codes for portrait filenames
const getAspectShortCode = (aspectId) => {
  const mapping = {
    'war': 'w',
    'knowledge': 'k',
    'community': 'c',
    'shadow': 's',
    'mysticism': 'm',
    'nature': 'n'
  }
  return mapping[aspectId] || aspectId
}

// Get race image URL with optional subrace (aspect)
// Structure: /images/races/{raceId}/{gender}/base.png or {shortCode}.png (w/k/c/s/m/n)
// Fallback: subrace portrait → base portrait
const getRaceImageUrlLocal = (raceId, gender, aspectId = null) => {
  if (aspectId) {
    // Use short code for subrace portrait (w/k/c/s/m/n)
    const shortCode = getAspectShortCode(aspectId)
    return raceImageUrl(raceId, gender, shortCode)
  }
  // Base portrait
  return raceImageUrl(raceId, gender, 'base')
}

// Fallback handler for image load errors
const handleImageError = (event, raceId, gender, aspectId = null) => {
  const imgElement = event.target
  if (!imgElement) return
  
  const currentSrc = imgElement.src || ''
  const shortCode = aspectId ? getAspectShortCode(aspectId) : null
  
  // Check if this is a subrace portrait that failed
  if (aspectId && shortCode && currentSrc.includes(`/${raceId}/${gender}/${shortCode}.png`)) {
    console.log(`Subrace portrait not found: ${raceId}/${gender}/${shortCode}.png (aspect: ${aspectId}), falling back to base`)
    // Fallback to base portrait
    imgElement.src = raceImageUrl(raceId, gender, 'base')
    return
  }
  
  // If base portrait failed, hide the image
  if (currentSrc.includes(`/${raceId}/${gender}/base.png`)) {
    console.error(`Base portrait not found for ${raceId} (${gender}), hiding image`)
    imgElement.style.display = 'none'
    return
  }
  
  // Unexpected error
  console.error(`Unexpected image load error for ${raceId} (${gender})`, currentSrc)
  imgElement.style.display = 'none'
}

const getHexagonPath = (cx, cy, size) => {
  const points = []
  for (let i = 0; i < 6; i++) {
    // Начинаем с угла 0° (правая сторона) для flat-top шестиугольника
    const angle = (Math.PI / 3) * i
    const x = cx + size * Math.cos(angle)
    const y = cy + size * Math.sin(angle)
    points.push(`${x},${y}`)
  }
  return points.join(' ')
}

// Generate path for a hexagon arc (partial border)
// startVertex: 0-5 (which vertex to start from)
// endVertex: 0-6 (which vertex to end at)
const getHexagonArc = (cx, cy, size, startVertex, endVertex) => {
  const points = []
  
  // Generate points from startVertex to endVertex
  for (let i = startVertex; i <= endVertex; i++) {
    const angle = (Math.PI / 3) * i
    const x = cx + size * Math.cos(angle)
    const y = cy + size * Math.sin(angle)
    points.push([x, y])
  }
  
  // Create path string: M (move to first point) then L (line to) each subsequent point
  if (points.length === 0) return ''
  
  let pathData = `M ${points[0][0]},${points[0][1]}`
  for (let i = 1; i < points.length; i++) {
    pathData += ` L ${points[i][0]},${points[i][1]}`
  }
  
  return pathData
}

// Determine which aspect is left and which is right based on their positions
const getLeftRightAspects = (classItem) => {
  // For outer classes, use the single aspect for both colors
  if (isOuterClass(classItem)) {
    const aspectId = classItem.aspects[0]
    return { left: aspectId, right: aspectId }
  }
  
  // For inner classes, determine left/right based on positions
  const aspect1Id = classItem.aspects[0]
  const aspect2Id = classItem.aspects[1]
  
  const pos1 = getAspectPosition(aspect1Id)
  const pos2 = getAspectPosition(aspect2Id)
  
  const deltaX = Math.abs(pos1.x - pos2.x)
  const deltaY = Math.abs(pos1.y - pos2.y)
  
  // If vertical alignment (deltaY > deltaX), use Y coordinate for "left/right"
  if (deltaY > deltaX) {
    // Top aspect is "left", bottom is "right" for consistent gradient direction
    if (pos1.y < pos2.y) {
      return { left: aspect1Id, right: aspect2Id }
    } else {
      return { left: aspect2Id, right: aspect1Id }
    }
  }
  
  // Horizontal or diagonal: compare X coordinates
  if (pos1.x < pos2.x) {
    return { left: aspect1Id, right: aspect2Id }
  } else if (pos1.x > pos2.x) {
    return { left: aspect2Id, right: aspect1Id }
  } else {
    // If X coordinates are equal, use first as left
    return { left: aspect1Id, right: aspect2Id }
  }
}

// Determine if class is "outer" (specialized) or "inner" (between aspects)
// Outer classes: only 1 aspect edge, no class edges
// Inner classes: 2 aspect edges
const isOuterClass = (classItem) => {
  const aspectEdges = classItem.edges.filter(e => e.type === 'aspect')
  return aspectEdges.length === 1
}

// Calculate gradient angle based on aspect positions
// Returns angle in degrees for linearGradient (0° = horizontal left to right, 90° = vertical top to bottom)
const getGradientAngle = (classItem) => {
  // For outer classes with single aspect, use radial direction from center
  if (isOuterClass(classItem)) {
    const aspectId = classItem.aspects[0]
    const aspectPos = getAspectPosition(aspectId)
    const centerX = canvasSize / 2
    const centerY = canvasSize / 2
    
    const deltaX = aspectPos.x - centerX
    const deltaY = aspectPos.y - centerY
    
    let angleDeg = Math.atan2(deltaY, deltaX) * (180 / Math.PI)
    if (angleDeg < 0) angleDeg += 360
    
    return angleDeg
  }
  
  // For inner classes, use direction between two aspects
  const aspect1Id = classItem.aspects[0]
  const aspect2Id = classItem.aspects[1]
  
  const pos1 = getAspectPosition(aspect1Id)
  const pos2 = getAspectPosition(aspect2Id)
  
  // Calculate angle from aspect1 to aspect2
  const deltaX = pos2.x - pos1.x
  const deltaY = pos2.y - pos1.y
  
  // atan2 returns angle in radians from -π to π
  // Convert to degrees and adjust to SVG coordinate system
  let angleDeg = Math.atan2(deltaY, deltaX) * (180 / Math.PI)
  
  // Normalize to 0-360
  if (angleDeg < 0) angleDeg += 360
  
  return angleDeg
}

// Calculate class position between two aspects based on edge costs
const getClassPosition = (classItem) => {
  const centerX = canvasSize / 2
  const centerY = canvasSize / 2
  
  // Handle outer (specialized) classes - positioned beyond their aspect
  if (isOuterClass(classItem)) {
    const aspectId = classItem.aspects[0]
    const aspectPos = getAspectPosition(aspectId)
    
    // Calculate direction from center through aspect
    const dx = aspectPos.x - centerX
    const dy = aspectPos.y - centerY
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // Normalize direction
    const dirX = dx / distance
    const dirY = dy / distance
    
    // Position class beyond aspect (aspect radius * 0.32, outer class at * 0.43)
    const outerRadius = canvasSize * 0.43
    
    let x = centerX + dirX * outerRadius
    let y = centerY + dirY * outerRadius
    
    // Check if this class has a connection to another class (meaning it's a "side" class, not pure specialist)
    const hasClassConnection = classItem.edges.some(e => e.type === 'class')
    
    if (hasClassConnection) {
      // Find the connected class to determine which direction to offset
      const classEdge = classItem.edges.find(e => e.type === 'class')
      const connectedClassId = classEdge?.id
      
      // Find the connected class and its aspect
      const connectedClass = classes.find(c => c.id === connectedClassId)
      if (connectedClass) {
        const connectedAspectId = connectedClass.aspects[0]
        
        // Get aspect data for angles
        const aspectData = aspects.find(a => a.id === aspectId)
        const connectedAspectData = aspects.find(a => a.id === connectedAspectId)
        
        if (aspectData && connectedAspectData) {
          const currentAngle = aspectData.position.angle
          const connectedAngle = connectedAspectData.position.angle
          
          // Calculate shortest angular distance from current aspect to connected aspect
          let angleDiff = connectedAngle - currentAngle
          // Normalize to -180..+180 range
          while (angleDiff > 180) angleDiff -= 360
          while (angleDiff < -180) angleDiff += 360
          
          // If connected aspect is clockwise from current (positive angle), offset clockwise (+14°)
          // If connected aspect is counterclockwise from current (negative angle), offset counterclockwise (-14°)
          const offsetAngle = (angleDiff > 0 ? 14 : -14) * (Math.PI / 180)
          
          // Calculate base angle from center to aspect
          const baseAngle = Math.atan2(dy, dx)
          
          // Apply offset
          const newAngle = baseAngle + offsetAngle
          
          x = centerX + Math.cos(newAngle) * outerRadius
          y = centerY + Math.sin(newAngle) * outerRadius
        }
      }
    }
    
    return { x, y }
  }
  
  // Handle inner classes - positioned between two aspects
  const aspect1Id = classItem.aspects[0]
  const aspect2Id = classItem.aspects[1]
  
  const pos1 = getAspectPosition(aspect1Id)
  const pos2 = getAspectPosition(aspect2Id)
  
  // Find costs from edges
  const edge1 = classItem.edges.find(e => e.id === aspect1Id)
  const edge2 = classItem.edges.find(e => e.id === aspect2Id)
  
  const cost1 = edge1?.cost || 3
  const cost2 = edge2?.cost || 3
  
  // Position is weighted average based on costs (lower cost = closer to that aspect)
  // weight2 represents how much to move towards aspect2
  const totalCost = cost1 + cost2
  const weight2 = cost1 / totalCost
  
  let x = pos1.x + (pos2.x - pos1.x) * weight2
  let y = pos1.y + (pos2.y - pos1.y) * weight2
  
  // For classes with uneven cost distribution (2-4 or 4-2), move them closer to center
  if ((cost1 === 2 && cost2 === 4) || (cost1 === 4 && cost2 === 2)) {
    // Calculate vector from center to class position
    const dx = x - centerX
    const dy = y - centerY
    
    // Move ~12.5% closer to center (halfway from original 25%)
    x = centerX + dx * 0.875
    y = centerY + dy * 0.875
  }
  
  // Special handling for 3 classes that overlap in center
  // Offset them at 120-degree angles to maintain symmetry
  const offsetDistance = 60 // pixels (increased from 40 for better spacing)
  
  if (classItem.id === 'seeker') {
    // Up (270 degrees from east = straight up)
    y -= offsetDistance
  } else if (classItem.id === 'heretic') {
    // Down-right (330 degrees from north = 30 degrees below horizontal)
    x += offsetDistance * Math.cos(-Math.PI / 6)
    y += offsetDistance * Math.sin(Math.PI / 6) // positive = down
  } else if (classItem.id === 'cutthroat') {
    // Down-left (210 degrees from north = 30 degrees below horizontal on left)
    x += offsetDistance * Math.cos(5 * Math.PI / 6)
    y += offsetDistance * Math.sin(Math.PI / 6) // positive = down
  }
  
  return { x, y }
}

// Generate curved path from class to aspect using quadratic Bezier
// Lines end at object boundaries instead of centers
const getClassToAspectPath = (classPos, aspectPos, curveFactor = 0.15) => {
  // Calculate direction from class to aspect
  const dx = aspectPos.x - classPos.x
  const dy = aspectPos.y - classPos.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  
  // Normalize direction
  const dirX = dx / distance
  const dirY = dy / distance
  
  // Class hexagon radius (approximate)
  const classRadius = 30
  // Aspect circle radius
  const aspectRadius = 18
  
  // Start point: edge of class hexagon
  const startX = classPos.x + dirX * classRadius
  const startY = classPos.y + dirY * classRadius
  
  // End point: edge of aspect circle
  const endX = aspectPos.x - dirX * aspectRadius
  const endY = aspectPos.y - dirY * aspectRadius
  
  // Calculate control point perpendicular to the line
  const perpX = -dirY
  const perpY = dirX
  
  // Control point offset from midpoint
  const midX = (startX + endX) / 2
  const midY = (startY + endY) / 2
  
  const ctrlX = midX + perpX * distance * curveFactor
  const ctrlY = midY + perpY * distance * curveFactor
  
  return `M ${startX},${startY} Q ${ctrlX},${ctrlY} ${endX},${endY}`
}

const getTransitionTransform = (race) => {
  const pos = getRacePosition(race)
  const isSelected = formData.value.race === race.id
  const isHighlightedByAspect = highlightedRaces.value.includes(race.id)
  
  // During confirmation transition (step 2 -> 3), selected race moves to center and scales up
  if (transitioning.value && isSelected) {
    const centerX = canvasSize / 2
    const centerY = canvasSize / 2
    return `translate(${centerX}, ${centerY}) scale(2.5)`
  }
  
  // On step 2, if race is selected (but not transitioning), scale it up in place
  if (showRaces.value && isSelected && !transitioning.value) {
    return `translate(${pos.x}, ${pos.y}) scale(1.2)`
  }
  
  // On step 2, if race is highlighted by aspect click, scale it slightly
  if (showRaces.value && isHighlightedByAspect && !transitioning.value) {
    return `translate(${pos.x}, ${pos.y}) scale(1.1)`
  }
  
  // Normal position
  return `translate(${pos.x}, ${pos.y})`
}

// ===== PAN & ZOOM =====
const handleWheel = (event) => {
  event.preventDefault()
  
  // Get mouse position relative to SVG
  const svg = event.currentTarget
  const rect = svg.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  
  // Calculate zoom
  const delta = -event.deltaY * 0.001
  const newZoom = Math.max(1, Math.min(4, zoom.value + delta))
  
  if (newZoom !== zoom.value) {
    // Convert mouse position to viewBox coordinates
    const viewBoxX = (mouseX / rect.width) * viewBoxSize
    const viewBoxY = (mouseY / rect.height) * viewBoxSize
    
    // Account for the complex transform: translate(center + pan) scale(zoom) translate(-contentCenter)
    const centerOffset = viewBoxSize / 2
    const contentCenter = canvasSize / 2
    
    // Calculate position in content space before zoom
    const contentX = (viewBoxX - centerOffset - pan.value.x) / zoom.value + contentCenter
    const contentY = (viewBoxY - centerOffset - pan.value.y) / zoom.value + contentCenter
    
    // Calculate new pan to keep content position under mouse
    pan.value = {
      x: viewBoxX - centerOffset - (contentX - contentCenter) * newZoom,
      y: viewBoxY - centerOffset - (contentY - contentCenter) * newZoom
    }
    
    zoom.value = newZoom
  }
}

const handleMouseDown = (event) => {
  if (event.button === 0) {
    isDragging.value = false
    const initialPos = { x: event.clientX, y: event.clientY }
    
    // Always allow pan with left button
    isPanning.value = true
    panStart.value = { 
      x: event.clientX - pan.value.x, 
      y: event.clientY - pan.value.y,
      initialX: initialPos.x,
      initialY: initialPos.y
    }
  } else if (event.button === 1 || event.button === 2) {
    // Middle or right mouse button also for pan
    event.preventDefault()
    isDragging.value = false
    isPanning.value = true
    panStart.value = { 
      x: event.clientX - pan.value.x, 
      y: event.clientY - pan.value.y,
      initialX: event.clientX,
      initialY: event.clientY
    }
  }
}

const handleMouseMove = (event) => {
  if (isPanning.value) {
    const dx = event.clientX - panStart.value.initialX
    const dy = event.clientY - panStart.value.initialY
    
    // Check if moved beyond threshold
    if (!isDragging.value && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
      isDragging.value = true
    }
    
    // Apply pan immediately if dragging
    if (isDragging.value) {
      pan.value = {
        x: event.clientX - panStart.value.x,
        y: event.clientY - panStart.value.y
      }
    }
  }
}

const handleMouseUp = () => {
  isPanning.value = false
  // Reset isDragging after a small delay to allow click handlers to check it
  setTimeout(() => {
    isDragging.value = false
  }, 10)
}

// Touch events
const handleTouchStart = (event) => {
  if (event.touches.length === 1) {
    // Single touch - pan
    const touch = event.touches[0]
    isPanning.value = true
    isDragging.value = false
    panStart.value = { 
      x: touch.clientX - pan.value.x, 
      y: touch.clientY - pan.value.y,
      initialX: touch.clientX,
      initialY: touch.clientY
    }
  } else if (event.touches.length === 2) {
    // Two touches - pinch zoom
    const touch1 = event.touches[0]
    const touch2 = event.touches[1]
    const distance = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    )
    touchStartDistance.value = distance
    touchStartZoom.value = zoom.value
    touchStartPan.value = { ...pan.value }
    isDragging.value = false
  }
}

const handleTouchMove = (event) => {
  event.preventDefault()
  
  if (event.touches.length === 1 && isPanning.value) {
    // Single touch - pan
    const touch = event.touches[0]
    const dx = touch.clientX - panStart.value.initialX
    const dy = touch.clientY - panStart.value.initialY
    
    // Check threshold
    if (!isDragging.value && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
      isDragging.value = true
    }
    
    if (isDragging.value) {
      pan.value = {
        x: touch.clientX - panStart.value.x,
        y: touch.clientY - panStart.value.y
      }
    }
  } else if (event.touches.length === 2) {
    // Two touches - pinch zoom
    const touch1 = event.touches[0]
    const touch2 = event.touches[1]
    const distance = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    )
    
    // Get SVG rect for coordinate conversion
    const svg = event.currentTarget.closest('svg')
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    
    // Calculate center point in screen coordinates
    const centerX = (touch1.clientX + touch2.clientX) / 2
    const centerY = (touch1.clientY + touch2.clientY) / 2
    
    // Convert to viewBox coordinates
    const viewBoxX = ((centerX - rect.left) / rect.width) * viewBoxSize
    const viewBoxY = ((centerY - rect.top) / rect.height) * viewBoxSize
    
    // Calculate new zoom
    const newZoom = Math.max(1, Math.min(4, touchStartZoom.value * (distance / touchStartDistance.value)))
    
    // Account for the complex transform
    const centerOffset = viewBoxSize / 2
    const contentCenter = canvasSize / 2
    
    // Calculate position in content space before zoom
    const contentX = (viewBoxX - centerOffset - touchStartPan.value.x) / touchStartZoom.value + contentCenter
    const contentY = (viewBoxY - centerOffset - touchStartPan.value.y) / touchStartZoom.value + contentCenter
    
    // Calculate new pan to keep content position under touch center
    pan.value = {
      x: viewBoxX - centerOffset - (contentX - contentCenter) * newZoom,
      y: viewBoxY - centerOffset - (contentY - contentCenter) * newZoom
    }
    
    zoom.value = newZoom
    isDragging.value = true
  }
}

const handleTouchEnd = () => {
  isPanning.value = false
  setTimeout(() => {
    isDragging.value = false
  }, 10)
}

const resetView = () => {
  zoom.value = 1.9 // Reset to default 190% zoom
  pan.value = { x: 0, y: 0 }
}

const canvasTransform = computed(() => {
  // Strategy: translate to center of viewBox, scale, then apply pan
  // This keeps the 800px content centered in the 1600px viewBox
  const centerOffset = viewBoxSize / 2 // Center point of viewBox (800px)
  const contentCenter = canvasSize / 2 // Center point of content (400px)
  
  // First translate to viewBox center, scale around that point, then subtract content center and add pan
  return `translate(${centerOffset + pan.value.x}, ${centerOffset + pan.value.y}) scale(${zoom.value}) translate(${-contentCenter}, ${-contentCenter})`
})

// ===== ACTIONS =====
const handleClose = () => {
  // Сбрасываем прогресс при закрытии окна
  creationStore.reset()
  emit('close')
}

const handleCreate = () => {
  // Создаем персонажа и сбрасываем прогресс
  emit('created', formData.value)
  creationStore.reset()
}

const selectGender = (gender) => {
  if (isDragging.value) return // Don't select if user was dragging
  
  creationStore.setGender(gender)
  genderAnimating.value = true
  
  // Animate gender panels sliding away, then move to next step
  setTimeout(() => {
    nextStep()
    setTimeout(() => {
      genderAnimating.value = false
    }, 100)
  }, 400) // Duration of slide-away animation
}

const selectRace = (raceId) => {
  if (isDragging.value) return // Don't select if user was dragging
  
  // Detect double-click
  const now = Date.now()
  const isDoubleClick = 
    lastClickTarget.value === raceId && 
    (now - lastClickTime.value) < DOUBLE_CLICK_DELAY
  
  lastClickTime.value = now
  lastClickTarget.value = raceId
  
  if (isDoubleClick && step.value === 2) {
    // Double-click: select and confirm immediately
    creationStore.setRace(raceId)
    clickedAspect.value = null // Clear aspect highlight
    confirmSelection()
  } else {
    // Single click: just select
    creationStore.setRace(raceId)
    clickedAspect.value = null // Clear aspect highlight when selecting race
  }
}

const selectAspect = (aspectId) => {
  if (isDragging.value) return
  
  if (step.value === 2) {
    // On race selection step: highlight connected races
    if (clickedAspect.value === aspectId) {
      // Click same aspect again: deselect
      clickedAspect.value = null
    } else {
      // Click new aspect: select and clear race selection
      clickedAspect.value = aspectId
      creationStore.setRace(null)
    }
  } else if (step.value === 3) {
    // On subrace step: select subrace
    creationStore.setSubrace(`${formData.value.race}-${aspectId}`)
  }
}

const selectSubrace = (aspectId) => {
  if (isDragging.value) return // Don't select if user was dragging
  creationStore.setSubrace(`${formData.value.race}-${aspectId}`)
}

const selectClass = (classId) => {
  if (isDragging.value) return // Don't select if user was dragging
  creationStore.setClass(classId)
}

// Click on canvas background to deselect
const handleCanvasClick = (event) => {
  if (isDragging.value) return
  
  // Only on step 2
  if (step.value === 2) {
    creationStore.setRace(null)
    clickedAspect.value = null
  }
}

// Double-click on background to toggle zoom
const handleCanvasDoubleClick = (event) => {
  if (isDragging.value) return
  
  // Get click position relative to SVG
  const svg = event.currentTarget.closest('svg')
  if (!svg) return
  
  const rect = svg.getBoundingClientRect()
  const clickX = event.clientX - rect.left
  const clickY = event.clientY - rect.top
  
  // Convert to viewBox coordinates
  const viewBoxX = (clickX / rect.width) * viewBoxSize
  const viewBoxY = (clickY / rect.height) * viewBoxSize
  
  // Account for the complex transform
  const centerOffset = viewBoxSize / 2
  const contentCenter = canvasSize / 2
  
  // Calculate position in content space before zoom
  const contentX = (viewBoxX - centerOffset - pan.value.x) / zoom.value + contentCenter
  const contentY = (viewBoxY - centerOffset - pan.value.y) / zoom.value + contentCenter
  
  // Toggle between default (1.9x) and zoomed (3.2x)
  const newZoom = zoom.value < 2.5 ? 3.2 : 1.9
  
  // Calculate new pan to keep content position under click point
  pan.value = {
    x: viewBoxX - centerOffset - (contentX - contentCenter) * newZoom,
    y: viewBoxY - centerOffset - (contentY - contentCenter) * newZoom
  }
  
  zoom.value = newZoom
}

const nextStep = () => {
  if (canProceed.value && step.value < totalSteps) {
    step.value++
  }
}

const prevStep = () => {
  if (step.value > 1) {
    if (step.value === 3 && formData.value.race) {
      // Trigger reverse animation when going back from subrace to race selection
      transitioning.value = true
      transitionDirection.value = 'backward'
      // Wait for animation to complete before changing step
      setTimeout(() => {
        transitioning.value = false
        step.value--
      }, 600)
    } else {
      step.value--
    }
  }
}

const confirmSelection = () => {
  if (canProceed.value) {
    // Save stats and skills to store when leaving step 4
    if (step.value === 4) {
      creationStore.setStats(statsAndSkillsData.value.stats)
      creationStore.setSkills(statsAndSkillsData.value.skills)
    }
    
    if ((step.value === 2 && formData.value.race) || 
        (step.value === 3 && formData.value.subrace) ||
        (step.value === 4 && formData.value.class)) {
      // Trigger animation when confirming race/subrace/class selection
      transitioning.value = true
      transitionDirection.value = 'forward'
      setTimeout(() => {
        nextStep()
        setTimeout(() => {
          transitioning.value = false
        }, 100)
      }, 600) // Duration matches CSS transition
    } else {
      nextStep()
    }
  }
}

// ===== ANIMATIONS =====
// Рассчитываем трансформации для разных шагов
const raceTransform = computed(() => {
  if (step.value < 3 || !selectedRace.value) return null
  
  // На шаге 3+ выбранная раса перемещается в центр и увеличивается
  const currentPos = getRacePosition(selectedRace.value)
  const centerX = canvasSize / 2
  const centerY = canvasSize / 2
  
  return {
    translateX: centerX - currentPos.x,
    translateY: centerY - currentPos.y,
    scale: 2.5
  }
})

// Видимость элементов на разных шагах
const showGenderChoice = computed(() => step.value === 1)
const showRaces = computed(() => step.value === 2)
const showAspectsForSubrace = computed(() => step.value === 3)
const showClasses = computed(() => step.value === 4)
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col lg:flex-row bg-slate-950 select-none">
    <!-- Main Canvas Area - Always Square, responsive sizing -->
    <div 
      class="canvas-container relative overflow-hidden touch-none bg-slate-950 flex-shrink-0"
      @wheel="handleWheel"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @contextmenu.prevent
    >
      <svg 
        :viewBox="`0 0 ${viewBoxSize} ${viewBoxSize}`"
        class="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <!-- Hexagon clip paths for race portraits -->
          <clipPath v-for="race in races" :key="`clip-${race.id}`" :id="`clip-${race.id}`">
            <polygon :points="getHexagonPath(0, 0, 48)" />
          </clipPath>
          
          <!-- Large clip path for centered race -->
          <clipPath id="clip-center-race">
            <polygon :points="getHexagonPath(0, 0, 120)" />
          </clipPath>
        </defs>

        <!-- Main group with zoom and pan transform -->
        <g 
          :transform="canvasTransform" 
          :class="['canvas-group', { 'panning': isPanning }]"
        >
          <!-- Background - clickable to deselect -->
          <rect 
            x="0"
            y="0"
            :width="canvasSize" 
            :height="canvasSize" 
            fill="#0f172a" 
            class="cursor-default"
            @click="handleCanvasClick"
            @dblclick="handleCanvasDoubleClick"
          />

        <!-- Step 1: Gender Selection -->
        <g v-if="showGenderChoice || genderAnimating" class="gender-selection">
          <!-- Male -->
          <g 
            class="gender-option"
            :class="{ 'gender-sliding-left': genderAnimating }"
          >
            <image
              :x="canvasSize/4 - 280"
              :y="canvasSize/2 - 350"
              width="560"
              height="700"
              :href="genderIconUrl('male')"
              class="cursor-pointer opacity-90 hover:opacity-100 transition-opacity"
              :class="{ 'brightness-110': formData.gender === 'm' }"
              @click="selectGender('m')"
            />
          </g>

          <!-- Female -->
          <g 
            class="gender-option"
            :class="{ 'gender-sliding-right': genderAnimating }"
          >
            <image
              :x="canvasSize * 3/4 - 280"
              :y="canvasSize/2 - 350"
              width="560"
              height="700"
              :href="genderIconUrl('female')"
              class="cursor-pointer opacity-90 hover:opacity-100 transition-opacity"
              :class="{ 'brightness-110': formData.gender === 'f' }"
              @click="selectGender('f')"
            />
          </g>
        </g>

        <!-- Aspects (visible from step 2, but not step 3 and 4) -->
        <g v-if="step >= 2 && step !== 3 && step !== 4" class="aspects">
          <g v-for="aspect in aspects" :key="aspect.id">
            <!-- Background circle with highlight for connected aspects or clicked aspect -->
            <circle
              :cx="getAspectPosition(aspect.id).x"
              :cy="getAspectPosition(aspect.id).y"
              r="32"
              :fill="aspect.color"
              :fill-opacity="
                clickedAspect === aspect.id ? 0.8 :
                highlightedAspects.includes(aspect.id) ? 0.7 : 0.4"
              class="transition-all duration-300 cursor-pointer"
              @click.stop="selectAspect(aspect.id)"
            />
            
            <!-- Selection ring for clicked aspect -->
            <circle
              v-if="clickedAspect === aspect.id"
              :cx="getAspectPosition(aspect.id).x"
              :cy="getAspectPosition(aspect.id).y"
              r="36"
              fill="none"
              :stroke="aspect.color"
              stroke-width="2"
              opacity="0.9"
              class="pointer-events-none animate-pulse"
            />
            
            <foreignObject
              :x="getAspectPosition(aspect.id).x - 16"
              :y="getAspectPosition(aspect.id).y - 16"
              width="32"
              height="32"
              class="pointer-events-none"
            >
              <div 
                class="flex items-center justify-center w-full h-full transition-opacity duration-300"
                :class="
                  clickedAspect === aspect.id ? 'opacity-90' :
                  highlightedAspects.includes(aspect.id) ? 'opacity-80' : 'opacity-50'"
              >
                <Icon :icon="aspect.icon" class="text-2xl" />
              </div>
            </foreignObject>

            <text
              :x="getAspectPosition(aspect.id).x"
              :y="getAspectPosition(aspect.id).y + canvasSize * 0.055"
              text-anchor="middle"
              class="text-xs font-medium select-none transition-all duration-300 pointer-events-none"
              :class="
                clickedAspect === aspect.id ? 'fill-white font-semibold' :
                highlightedAspects.includes(aspect.id) ? 'fill-slate-100' : 'fill-slate-300'"
            >
              {{ aspect.name }}
            </text>
          </g>
        </g>

        <!-- Connection lines between races and aspects (Step 2) -->
        <g v-if="showRaces && !transitioning" class="race-aspect-connections">
          <line
            v-for="race in races"
            :key="`line1-${race.id}`"
            :x1="getRacePosition(race).x"
            :y1="getRacePosition(race).y"
            :x2="getAspectPosition(race.position.aspects[0]).x"
            :y2="getAspectPosition(race.position.aspects[0]).y"
            :stroke="getAspectColor(race.position.aspects[0])"
            :stroke-opacity="formData.race === race.id ? 0.5 : 0.15"
            stroke-width="2"
            class="transition-all duration-300"
          />
          <line
            v-for="race in races"
            :key="`line2-${race.id}`"
            :x1="getRacePosition(race).x"
            :y1="getRacePosition(race).y"
            :x2="getAspectPosition(race.position.aspects[1]).x"
            :y2="getAspectPosition(race.position.aspects[1]).y"
            :stroke="getAspectColor(race.position.aspects[1])"
            :stroke-opacity="formData.race === race.id ? 0.5 : 0.15"
            stroke-width="2"
            class="transition-all duration-300"
          />
        </g>

        <!-- Step 2: Races (with animation to step 3) -->
        <g v-if="showRaces || transitioning" class="races">
          <g
            v-for="race in races"
            :key="race.id"
            :class="[
              'cursor-pointer',
              transitioning ? '' : 'transition-all duration-300'
            ]"
            :style="
              transitioning && formData.race !== race.id && transitionDirection === 'forward' ? 
                'opacity: 0; transition: opacity 600ms ease-out;' : 
              transitioning && transitionDirection === 'backward' && formData.race !== race.id ?
                'opacity: 0; transition: opacity 600ms ease-in;' : 
              transitioning && transitionDirection === 'backward' && formData.race === race.id ?
                'opacity: 1;' : ''"
            @click="selectRace(race.id)"
            @mouseenter="hoveredRace = race.id"
            @mouseleave="hoveredRace = null"
          >
            <g 
              :transform="getTransitionTransform(race)"
              :style="
                transitioning && formData.race === race.id ? 
                  'transition: transform 600ms cubic-bezier(0.4, 0, 0.2, 1);' : 
                !transitioning && (formData.race === race.id || highlightedRaces.includes(race.id)) ?
                  'transition: transform 200ms ease-out;' : ''"
            >
              <!-- Race portrait -->
              <g :clip-path="`url(#clip-${race.id})`">
                <image
                  :href="getRaceImageUrlLocal(race.id, formData.gender)"
                  x="-48"
                  y="-48"
                  width="96"
                  height="96"
                  preserveAspectRatio="xMidYMid slice"
                  @error="(e) => handleImageError(e, race.id, formData.gender)"
                />
              </g>

              <!-- Hexagon border (white on selected, gold on aspect-highlighted, gray on hover, dark on default) -->
              <polygon
                :points="getHexagonPath(0, 0, 48)"
                fill="none"
                :stroke="
                  formData.race === race.id && showRaces ? 'white' :
                  highlightedRaces.includes(race.id) && showRaces ? '#fbbf24' :
                  hoveredRace === race.id && showRaces ? '#64748b' : '#1e293b'"
                :stroke-width="
                  formData.race === race.id && showRaces ? 2.5 :
                  highlightedRaces.includes(race.id) && showRaces ? 2.5 : 2"
                :opacity="
                  formData.race === race.id && showRaces ? 0.9 :
                  highlightedRaces.includes(race.id) && showRaces ? 0.85 :
                  hoveredRace === race.id && showRaces ? 0.8 : 0.6"
                class="transition-all duration-200"
              />
            </g>
          </g>
        </g>

        <!-- Step 3: Centered Race + Aspect Selection -->
        <g v-if="showAspectsForSubrace && selectedRace" class="subrace-selection">
          <!-- Connection line from center to selected aspect -->
          <line
            v-if="selectedAspectId"
            :x1="canvasSize/2"
            :y1="canvasSize/2"
            :x2="getAspectPosition(selectedAspectId).x"
            :y2="getAspectPosition(selectedAspectId).y"
            :stroke="getAspectColor(selectedAspectId)"
            stroke-width="3"
            opacity="0.5"
            class="transition-all duration-300"
          />
          
          <!-- Aspect backgrounds (always visible) - DRAWN FIRST -->
          <g v-for="aspectId in allAspects" :key="`aspect-bg-${aspectId}`" class="pointer-events-none">
            <!-- Background circle with stroke to ensure visibility -->
            <circle
              :cx="getAspectPosition(aspectId).x"
              :cy="getAspectPosition(aspectId).y"
              r="36"
              :fill="getAspectColor(aspectId)"
              :fill-opacity="selectedAspectId === aspectId ? 0.6 : 0.3"
              :stroke="getAspectColor(aspectId)"
              :stroke-opacity="selectedAspectId === aspectId ? 0.4 : 0.2"
              stroke-width="1"
              class="transition-all duration-300"
            />
          </g>

          <!-- Aspect icons and labels - DRAWN SECOND -->
          <g v-for="aspect in aspects" :key="`aspect-full-${aspect.id}`" class="pointer-events-none">
            <foreignObject
              :x="getAspectPosition(aspect.id).x - 16"
              :y="getAspectPosition(aspect.id).y - 16"
              width="32"
              height="32"
            >
              <div class="flex items-center justify-center w-full h-full opacity-70">
                <Icon :icon="aspect.icon" class="text-2xl" />
              </div>
            </foreignObject>

            <text
              :x="getAspectPosition(aspect.id).x"
              :y="getAspectPosition(aspect.id).y + canvasSize * 0.055"
              text-anchor="middle"
              class="text-xs font-medium fill-slate-200 select-none"
            >
              {{ aspect.name }}
            </text>
          </g>

          <!-- Centered race portrait (enlarged) - DRAWN THIRD -->
          <g :transform="`translate(${canvasSize/2}, ${canvasSize/2})`">
            <g :clip-path="`url(#clip-center-race)`">
              <image
                :href="getRaceImageUrlLocal(selectedRace.id, formData.gender, selectedAspectId)"
                x="-120"
                y="-120"
                width="240"
                height="240"
                preserveAspectRatio="xMidYMid slice"
                @error="(e) => handleImageError(e, selectedRace.id, formData.gender, selectedAspectId)"
                class="transition-opacity duration-300"
              />
            </g>

            <!-- Always visible border (white or colored based on selection) -->
            <polygon
              :points="getHexagonPath(0, 0, 120)"
              fill="none"
              :stroke="selectedAspectId ? getAspectColor(selectedAspectId) : 'white'"
              :stroke-width="selectedAspectId ? 5 : 3"
              :opacity="selectedAspectId ? 0.95 : 0.7"
              class="transition-all duration-300"
            />
          </g>

          <!-- Clickable aspects - DRAWN LAST (on top) -->
          <g v-for="aspectId in allAspects" :key="`subrace-${aspectId}`">
            <circle
              :cx="getAspectPosition(aspectId).x"
              :cy="getAspectPosition(aspectId).y"
              r="40"
              fill="transparent"
              class="cursor-pointer"
              @click="selectSubrace(aspectId)"
              @mouseenter="hoveredAspect = aspectId"
              @mouseleave="hoveredAspect = null"
            />

            <!-- Hover effect -->
            <circle
              v-if="hoveredAspect === aspectId && selectedAspectId !== aspectId"
              :cx="getAspectPosition(aspectId).x"
              :cy="getAspectPosition(aspectId).y"
              r="36"
              :fill="getAspectColor(aspectId)"
              opacity="0.5"
              class="pointer-events-none"
            />

            <!-- Selection ring -->
            <circle
              v-if="selectedAspectId === aspectId"
              :cx="getAspectPosition(aspectId).x"
              :cy="getAspectPosition(aspectId).y"
              r="38"
              fill="none"
              :stroke="getAspectColor(aspectId)"
              stroke-width="3"
              opacity="0.8"
              class="pointer-events-none"
            />
          </g>
        </g>

        <!-- Step 4: Class Selection -->
        <g v-if="step === 4" class="class-selection">
          <!-- Background rect for click-outside-to-deselect -->
          <rect
            x="0"
            y="0"
            :width="canvasSize"
            :height="canvasSize"
            fill="transparent"
            class="cursor-default"
            @click="() => { if (formData.class) creationStore.setClass(null) }"
          />
          
          <!-- Circle connecting all aspects -->
          <circle
            :cx="canvasSize / 2"
            :cy="canvasSize / 2"
            :r="canvasSize * 0.32"
            fill="none"
            stroke="#ffffff"
            stroke-width="8"
            opacity="0.075"
            class="pointer-events-none"
          />
          
          <!-- Aspect circles (dimmed) -->
          <g v-for="aspect in aspects" :key="`aspect-bg-${aspect.id}`">
            <circle
              :cx="getAspectPosition(aspect.id).x"
              :cy="getAspectPosition(aspect.id).y"
              r="18"
              :fill="getAspectColor(aspect.id)"
              :fill-opacity="
                formData.class 
                  ? (classes.find(c => c.id === formData.class)?.aspects.includes(aspect.id) ? 0.35 : 0.15)
                  : 0.4
              "
              class="pointer-events-none transition-all duration-300"
            />
            <foreignObject
              :x="getAspectPosition(aspect.id).x - 16"
              :y="getAspectPosition(aspect.id).y - 16"
              width="32"
              height="32"
              class="pointer-events-none"
            >
              <div 
                class="flex items-center justify-center w-full h-full transition-opacity duration-300"
                :class="
                  formData.class 
                    ? (classes.find(c => c.id === formData.class)?.aspects.includes(aspect.id) ? 'opacity-60' : 'opacity-30')
                    : 'opacity-70'
                "
              >
                <Icon :icon="aspect.icon" class="text-2xl" />
              </div>
            </foreignObject>
          </g>

          <!-- Class connection lines (curved) -->
          <g v-for="classItem in classes" :key="`class-lines-${classItem.id}`" class="pointer-events-none">
            <!-- Only show lines to aspects, not to other classes -->
            <template v-for="edge in classItem.edges.filter(e => e.type === 'aspect')" :key="`edge-${classItem.id}-${edge.id}`">
              <!-- Shadow/glow effect for selected class -->
              <path
                v-if="formData.class === classItem.id"
                :d="getClassToAspectPath(getClassPosition(classItem), getAspectPosition(edge.id))"
                :stroke="getAspectColor(edge.id)"
                stroke-opacity="0.6"
                stroke-width="8"
                fill="none"
                class="transition-all duration-300"
                style="filter: blur(4px)"
              />
              
              <!-- Main connection line -->
              <path
                :d="getClassToAspectPath(getClassPosition(classItem), getAspectPosition(edge.id))"
                :stroke="formData.class === classItem.id ? getAspectColor(edge.id) : 
                         hoveredClass === classItem.id ? '#64748b' : '#475569'"
                :stroke-opacity="formData.class === classItem.id ? 0.9 : 
                                hoveredClass === classItem.id ? 0.5 : 0.2"
                :stroke-width="formData.class === classItem.id ? 3 : 
                              hoveredClass === classItem.id ? 2 : 1.5"
                fill="none"
                class="transition-all duration-300"
              />
            </template>
          </g>

          <!-- Dimming overlay when class is selected -->
          <rect
            v-if="formData.class"
            x="0"
            y="0"
            :width="canvasSize"
            :height="canvasSize"
            fill="#0a0f1a"
            opacity="0.85"
            class="transition-opacity duration-300 pointer-events-none"
          />
          
          <!-- Class icons -->
          <g v-for="classItem in classes" :key="`class-${classItem.id}`">
            <defs>
              <!-- Градиент для внутренних классов (между двумя аспектами) -->
              <!-- Для внешних классов - монохромный (один цвет) -->
              <linearGradient 
                :id="`class-gradient-${classItem.id}`"
                :gradientTransform="`rotate(${getGradientAngle(classItem)}, 0.5, 0.5)`"
              >
                <stop offset="0%" :stop-color="getAspectColor(classItem.aspects[0])" />
                <stop offset="15%" :stop-color="getAspectColor(classItem.aspects[0])" />
                <stop offset="85%" :stop-color="getAspectColor(classItem.aspects[classItem.aspects.length > 1 ? 1 : 0])" />
                <stop offset="100%" :stop-color="getAspectColor(classItem.aspects[classItem.aspects.length > 1 ? 1 : 0])" />
              </linearGradient>
              
              <!-- Clippath для обрезки круга до шестиугольника -->
              <clipPath :id="`hexclip-${classItem.id}`">
                <polygon :points="getHexagonPath(0, 0, 30)" />
              </clipPath>
            </defs>
            
            <g 
              :transform="`translate(${getClassPosition(classItem).x}, ${getClassPosition(classItem).y}) scale(${formData.class === classItem.id ? 1.5 : 1})`"
              class="cursor-pointer transition-all duration-300"
              :class="{ 'opacity-100': !formData.class || formData.class === classItem.id, 'opacity-40': formData.class && formData.class !== classItem.id }"
              @click="selectClass(classItem.id)"
              @mouseenter="hoveredClass = classItem.id"
              @mouseleave="hoveredClass = null"
            >
              <!-- Градиентный круг, обрезанный до шестиугольника -->
              <circle
                cx="0"
                cy="0"
                r="30"
                :fill="`url(#class-gradient-${classItem.id})`"
                :fill-opacity="formData.class === classItem.id ? 0.4 : 0.25"
                :clip-path="`url(#hexclip-${classItem.id})`"
                class="transition-all duration-300"
              />
              
              <!-- Тонкая обводка шестиугольника для чёткости -->
              <polygon
                :points="getHexagonPath(0, 0, 30)"
                fill="none"
                stroke="#ffffff"
                :stroke-opacity="formData.class === classItem.id ? 0.3 : 0.15"
                stroke-width="1"
                class="transition-all duration-300"
              />
              
              <!-- Class icon image -->
              <foreignObject
                :x="formData.class === classItem.id ? -38 : -30"
                :y="formData.class === classItem.id ? -38 : -30"
                :width="formData.class === classItem.id ? 76 : 60"
                :height="formData.class === classItem.id ? 76 : 60"
                class="pointer-events-none transition-all duration-300"
              >
                <img
                  :src="classImageUrl(classItem.id)"
                  :style="{
                    width: '100%',
                    height: '100%',
                    opacity: 1,
                    transition: 'all 0.3s'
                  }"
                />
              </foreignObject>
            </g>
          </g>
          
          <!-- Highlight connected aspects when class is selected -->
          <g v-if="formData.class" class="pointer-events-none">
            <g v-for="aspectId in classes.find(c => c.id === formData.class)?.aspects || []" :key="`highlight-${aspectId}`">
              <circle
                :cx="getAspectPosition(aspectId).x"
                :cy="getAspectPosition(aspectId).y"
                r="22"
                fill="none"
                :stroke="getAspectColor(aspectId)"
                stroke-width="2.5"
                opacity="0.9"
                class="transition-all duration-300"
              />
            </g>
          </g>
        </g>
        </g> <!-- Close main transform group -->
      </svg>
    </div>

    <!-- Info Panel (responsive: bottom on mobile, right on desktop) - Takes remaining space -->
    <div class="flex-1 bg-slate-900 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col relative overflow-hidden">
      <!-- Fixed header for all steps with navigation -->
      <div class="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-sm px-6 py-4 border-b border-slate-700/50">
        <div class="flex items-center justify-between">
          <button
            v-if="step > 1"
            @click="prevStep"
            class="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800/50 hover:bg-slate-700 border border-slate-700/50 text-slate-300 transition"
          >
            <Icon icon="mdi:arrow-left" class="w-5 h-5" />
            <span class="text-sm font-medium">Назад</span>
          </button>
          <div v-else></div>
          
          <button
            @click="handleClose"
            class="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/20 hover:bg-red-900/30 border border-red-700/50 text-red-300 transition"
          >
            <Icon icon="mdi:close" class="w-5 h-5" />
            <span class="text-sm font-medium">Закрыть</span>
          </button>
        </div>
      </div>
      
      <!-- Scrollable content area -->
      <div class="flex-1 overflow-y-auto p-6 pb-0">
        <!-- Title (skip for step 4 and 5 as we have custom layout) -->
        <div v-if="step !== 4 && step !== 5" class="mb-4">
          <h2 class="text-2xl font-bold text-slate-100">
            {{ step === 1 ? 'Выберите пол' : 
               step === 2 ? 'Выберите расу' : 
               step === 3 ? 'Выберите подрасу' : 
               'Выберите навыки' }}
          </h2>
          <p class="text-sm text-slate-400 mt-1">
            {{ step === 1 ? 'Выберите пол персонажа для начала' :
               step === 2 ? 'Выберите расу, расположенную между двумя аспектами' :
               step === 3 ? 'Подраса добавляет связь с одним из аспектов' :
               'Выберите навыки персонажа' }}
          </p>
        </div>

        <!-- Details area -->
        <div class="pb-6">
          <!-- Race details (step 2) -->
          <div v-if="step === 2 && selectedRace" class="space-y-4">
            <div>
              <h3 class="text-lg font-semibold text-slate-100 mb-2">{{ selectedRace.name }}</h3>
              <p class="text-sm text-slate-300">{{ selectedRace.description }}</p>
            </div>

            <div>
              <h4 class="text-sm font-semibold text-slate-400 mb-2">Особенности:</h4>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="trait in selectedRace.traits"
                  :key="trait"
                  class="px-2 py-1 rounded text-xs bg-sky-500/20 text-sky-300"
                >
                  {{ trait }}
                </span>
              </div>
            </div>
          </div>

          <!-- Subrace details (step 3) -->
          <div v-if="step === 3 && selectedSubrace" class="space-y-4">
            <div>
              <h3 class="text-lg font-semibold text-slate-100 mb-2">{{ selectedSubrace.name }}</h3>
              <p class="text-sm text-slate-300">{{ selectedSubrace.description }}</p>
            </div>
          </div>

          <!-- Class details (step 4) -->
          <div v-if="step === 4 && formData.class" class="space-y-6">
            <div v-if="classes.find(c => c.id === formData.class)" class="step-4-container">
              <!-- Main content grid: responsive based on container width -->
              <div class="step-4-grid gap-8 mb-6">
                <!-- Left half: Title + Image -->
                <div class="step-4-left-column space-y-4">
                  <div>
                    <h3 class="text-2xl font-bold text-slate-100 mb-1">
                      {{ classes.find(c => c.id === formData.class).name[formData.gender] }}
                    </h3>
                    <p class="text-sm text-slate-400">
                      {{ classes.find(c => c.id === formData.class).nameEn }}
                    </p>
                  </div>
                  
                  <img
                    :src="classImageUrl(formData.class)"
                    :alt="classes.find(c => c.id === formData.class).name[formData.gender]"
                    class="w-full aspect-square object-cover rounded-lg border-2 border-slate-700"
                  />
                </div>

                <!-- Right half: Chart -->
                <div class="flex items-center justify-center">
                  <AspectChart 
                    :stats="statsAndSkillsData.stats"
                    :size="360"
                    @swap-stats="statsAndSkillsRef?.swapStats()"
                  />
                </div>
              </div>

              <!-- Full width: Bonus calculation explanation + Swap button -->
              <div class="bg-slate-800/30 border border-slate-700/50 rounded-lg p-5 mb-6">
                <div class="flex items-start justify-between gap-6 flex-wrap">
                  <div class="flex-1 text-sm text-slate-400 leading-relaxed min-w-[280px]">
                    <p class="font-semibold text-slate-300 mb-2">Как рассчитываются бонусы проверок:</p>
                    <p class="mb-2">
                      Каждая проверка связана с аспектом и имеет соседние аспекты. 
                      Бонус проверки равен максимуму из двух формул:
                    </p>
                    <ul class="list-disc list-inside space-y-1 ml-2">
                      <li><span class="font-mono text-sky-300">Основной</span>: полное значение аспекта + половина (округлённая вниз) каждого соседнего</li>
                      <li><span class="font-mono text-purple-300">Альтернативный</span>: половина (округлённая вниз) противоположного аспекта</li>
                    </ul>
                  </div>
                  
                  <button
                    @click="statsAndSkillsRef?.swapStats()"
                    class="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 text-slate-300 transition"
                  >
                    <Icon icon="mdi:swap-horizontal" class="w-5 h-5" />
                    <span class="text-sm font-medium">Поменять 6 ↔ 4</span>
                  </button>
                </div>
              </div>

              <!-- Full width: Class description (if available) -->
              <div 
                v-if="classes.find(c => c.id === formData.class)?.description"
                class="bg-slate-800/20 border border-slate-700/30 rounded-lg p-5 mb-6"
              >
                <p class="text-sm text-slate-400 leading-relaxed italic">
                  {{ classes.find(c => c.id === formData.class).description }}
                </p>
              </div>

              <!-- Full width: Skills selection -->
              <ClassStatsAndSkills
                :class-id="formData.class"
                v-model="statsAndSkillsData"
                ref="statsAndSkillsRef"
                :show-stats="false"
                :show-skills="true"
              />
            </div>
          </div>

          <!-- STEP 5: Equipment Selection -->
          <div v-if="step === 5">
            <EquipmentSelector 
              v-model="formData.equipment"
              @validation-change="equipmentValid = $event"
            />
          </div>

          <!-- STEP 6: Name and Portrait -->
          <div v-if="step === 6">
            <CharacterFinalization
              :name="formData.name"
              :portrait="formData.portrait"
              @update:name="creationStore.setName($event)"
              @update:portrait="creationStore.setPortrait($event)"
            />
          </div>
        </div>
      </div>

      <!-- Fixed Actions at bottom -->
      <div class="p-6 pt-4 border-t border-white/5 bg-slate-900 flex gap-3 flex-shrink-0">
        <button
          v-if="step < totalSteps"
          type="button"
          class="flex-1 px-4 py-2 rounded-lg font-semibold transition"
          :class="canProceed 
            ? 'bg-sky-500/20 border border-sky-400/60 text-sky-100 hover:bg-sky-500/30' 
            : 'bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed'"
          :disabled="!canProceed"
          @click="confirmSelection"
        >
          {{ step === 2 ? 'Подтвердить расу' : 
             step === 3 ? 'Подтвердить подрасу' :
             step === 4 ? 'Подтвердить класс' :
             step === 5 ? 'Подтвердить снаряжение' :
             step === 6 ? 'Завершить' :
             'Далее' }}
        </button>

        <button
          v-else
          type="button"
          class="flex-1 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/60 text-emerald-100 font-semibold hover:bg-emerald-500/30 transition"
          :disabled="!canProceed"
          @click="handleCreate"
        >
          Создать персонажа
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Canvas container - always square, responsive sizing */
.canvas-container {
  aspect-ratio: 1 / 1;
  width: 100%;
  max-width: min(100vh, 100vw);
  max-height: 100vh;
}

/* On desktop (lg and up), reserve space for info panel */
@media (min-width: 1024px) {
  .canvas-container {
    max-width: min(100vh, calc(100vw - 24rem));
  }
}

/* Gender selection animations - slide away horizontally */
.gender-option {
  transition: transform 400ms ease-in;
  transform-origin: center center;
}

.gender-sliding-left {
  transform: translateX(-600px);
}

.gender-sliding-right {
  transform: translateX(600px);
}

/* Smooth zoom transition, but not for pan (would make dragging laggy) */
.canvas-group {
  transition: transform 0.2s ease-out;
  will-change: transform;
}

/* Disable transition during active panning */
.canvas-group.panning {
  transition: none;
}

/* Step 4 responsive grid - based on container width */
.step-4-container {
  container-type: inline-size;
}

.step-4-grid {
  display: grid;
  grid-template-columns: 1fr;
}

/* Two columns when container is wide enough (≥600px) */
@container (min-width: 600px) {
  .step-4-grid {
    grid-template-columns: 1fr 1fr;
  }
  
  .step-4-left-column {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
}
</style>
