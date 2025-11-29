<script setup>
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import racesData from '@/data/races.json'
import aspectsData from '@/data/aspects.json'
import subracesData from '@/data/subraces.json'

const emit = defineEmits(['close', 'created'])

// ===== STATE =====
const step = ref(1) // 1: gender, 2: race, 3: subrace, 4: class, 5: stats, 6: skills
const totalSteps = 6

// Form data
const formData = ref({
  gender: 'm',
  race: null,
  subrace: null,
  class: null,
  name: '',
  stats: {
    might: 10,
    reason: 10,
    charisma: 10,
    cunning: 10,
    intuition: 10,
    perception: 10
  },
  skills: [],
  avatar: null
})

// Canvas state
const canvasSize = 800 // Content size (positions calculated based on this)
const viewBoxSize = 1600 // Larger viewBox for pan space
const zoom = ref(1.55) // Start at 155% zoom - maximizes schema while keeping it fully visible
const pan = ref({ x: 0, y: 0 })
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const isDragging = ref(false) // Track if user is dragging vs clicking
const dragThreshold = 5 // pixels to move before considering it a drag

// Touch state
const touchStartDistance = ref(0)
const touchStartZoom = ref(1)
const touchStartPan = ref({ x: 0, y: 0 })

// Hover states
const hoveredRace = ref(null)
const hoveredAspect = ref(null)
const clickedAspect = ref(null) // For highlighting races connected to clicked aspect

// Animation state
const transitioning = ref(false)
const transitionDirection = ref('forward') // 'forward' or 'backward'

// Gender selection animation
const genderAnimating = ref(false)

// Double-click detection
const lastClickTime = ref(0)
const lastClickTarget = ref(null)
const DOUBLE_CLICK_DELAY = 300 // ms

// ===== DATA =====
const races = racesData.races
const aspects = aspectsData.aspects
const allAspects = aspectsData.metadata.circularOrder

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
    case 4: return formData.value.class !== null
    case 5: return true
    case 6: return true
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

// Get race image URL with optional subrace (aspect)
// Structure: /images/races/{raceId}/{gender}/base.png or {aspectId}.png
// Fallback: subrace portrait → base portrait
const getRaceImageUrl = (raceId, gender, aspectId = null) => {
  if (aspectId) {
    // Try subrace portrait first
    return `/images/races/${raceId}/${gender}/${aspectId}.png`
  }
  // Base portrait
  return `/images/races/${raceId}/${gender}/base.png`
}

// Fallback handler for image load errors
const handleImageError = (event, raceId, gender, aspectId = null) => {
  const imgElement = event.target
  if (!imgElement) return
  
  const currentSrc = imgElement.src || ''
  
  // Check if this is a subrace portrait that failed
  if (aspectId && currentSrc.includes(`/${raceId}/${gender}/${aspectId}.png`)) {
    console.log(`Subrace portrait not found: ${raceId}/${gender}/${aspectId}.png, falling back to base`)
    // Fallback to base portrait
    imgElement.src = `/images/races/${raceId}/${gender}/base.png`
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
    const angle = (Math.PI / 3) * i - Math.PI / 6
    const x = cx + size * Math.cos(angle)
    const y = cy + size * Math.sin(angle)
    points.push(`${x},${y}`)
  }
  return points.join(' ')
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
    // Zoom to mouse position
    const zoomFactor = newZoom / zoom.value
    
    // Adjust pan to keep mouse position stationary
    pan.value = {
      x: mouseX - (mouseX - pan.value.x) * zoomFactor,
      y: mouseY - (mouseY - pan.value.y) * zoomFactor
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
    
    // Calculate center point
    const centerX = (touch1.clientX + touch2.clientX) / 2
    const centerY = (touch1.clientY + touch2.clientY) / 2
    
    // Calculate new zoom
    const newZoom = Math.max(1, Math.min(4, touchStartZoom.value * (distance / touchStartDistance.value)))
    const zoomFactor = newZoom / zoom.value
    
    // Zoom to center point
    pan.value = {
      x: centerX - (centerX - touchStartPan.value.x) * zoomFactor,
      y: centerY - (centerY - touchStartPan.value.y) * zoomFactor
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
  zoom.value = 1.55 // Reset to default 155% zoom - maximizes schema visibility
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
const selectGender = (gender) => {
  if (isDragging.value) return // Don't select if user was dragging
  
  formData.value.gender = gender
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
    formData.value.race = raceId
    clickedAspect.value = null // Clear aspect highlight
    confirmSelection()
  } else {
    // Single click: just select
    formData.value.race = raceId
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
      formData.value.race = null
    }
  } else if (step.value === 3) {
    // On subrace step: select subrace
    formData.value.subrace = `${formData.value.race}-${aspectId}`
  }
}

const selectSubrace = (aspectId) => {
  if (isDragging.value) return // Don't select if user was dragging
  formData.value.subrace = `${formData.value.race}-${aspectId}`
}

// Click on canvas background to deselect
const handleCanvasClick = (event) => {
  if (isDragging.value) return
  
  // Only on step 2
  if (step.value === 2) {
    formData.value.race = null
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
  
  // Calculate click position in canvas space (accounting for current transform)
  const canvasX = (clickX - pan.value.x) / zoom.value
  const canvasY = (clickY - pan.value.y) / zoom.value
  
  // Toggle between default (1.55x) and zoomed (2.8x)
  const newZoom = zoom.value < 2.2 ? 2.8 : 1.55
  
  // Keep the clicked point stationary
  pan.value = {
    x: clickX - canvasX * newZoom,
    y: clickY - canvasY * newZoom
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
    if (step.value === 2 && formData.value.race) {
      // Trigger animation when confirming race selection
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
    <!-- Main Canvas Area -->
    <div 
      class="flex-1 relative overflow-hidden touch-none"
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
          <!-- Male half -->
          <g 
            :transform="`translate(${canvasSize/2 - 100}, ${canvasSize/2})`"
            :style="genderAnimating ? 'transition: transform 400ms ease-in; transform: translateX(-200px);' : ''"
          >
            <rect 
              x="0" 
              y="-60" 
              width="80" 
              height="120" 
              rx="12"
              :fill="formData.gender === 'm' ? '#3b82f6' : '#1e293b'"
              :stroke="formData.gender === 'm' ? '#60a5fa' : '#334155'"
              stroke-width="2"
              class="cursor-pointer transition-all duration-200 hover:stroke-sky-400"
              @click="selectGender('m')"
            />
            <text 
              x="40" 
              y="0" 
              text-anchor="middle" 
              dominant-baseline="middle"
              class="text-6xl select-none pointer-events-none"
            >
              ♂
            </text>
          </g>

          <!-- Female half -->
          <g 
            :transform="`translate(${canvasSize/2 + 20}, ${canvasSize/2})`"
            :style="genderAnimating ? 'transition: transform 400ms ease-in; transform: translateX(200px);' : ''"
          >
            <rect 
              x="0" 
              y="-60" 
              width="80" 
              height="120" 
              rx="12"
              :fill="formData.gender === 'f' ? '#ec4899' : '#1e293b'"
              :stroke="formData.gender === 'f' ? '#f472b6' : '#334155'"
              stroke-width="2"
              class="cursor-pointer transition-all duration-200 hover:stroke-pink-400"
              @click="selectGender('f')"
            />
            <text 
              x="40" 
              y="0" 
              text-anchor="middle" 
              dominant-baseline="middle"
              class="text-6xl select-none pointer-events-none"
            >
              ♀
            </text>
          </g>
        </g>

        <!-- Aspects (visible from step 2+) -->
        <g v-if="step >= 2 && step !== 3" class="aspects">
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
                  :href="getRaceImageUrl(race.id, formData.gender)"
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
                :href="getRaceImageUrl(selectedRace.id, formData.gender, selectedAspectId)"
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
        </g> <!-- Close main transform group -->
      </svg>
    </div>

    <!-- Info Panel (responsive: bottom on mobile, right on desktop) -->
    <div class="w-full lg:w-96 bg-slate-900 border-t lg:border-t-0 lg:border-l border-white/10 p-6 flex flex-col relative">
      <!-- Close button -->
      <button
        type="button"
        class="absolute top-4 right-4 w-10 h-10 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 z-10"
        @click="emit('close')"
      >
        <span class="text-2xl">&times;</span>
      </button>
      
      <!-- Title -->
      <div class="mb-4">
        <h2 class="text-2xl font-bold text-slate-100">
          {{ step === 1 ? 'Выберите пол' : 
             step === 2 ? 'Выберите расу' : 
             step === 3 ? 'Выберите подрасу' : 
             step === 4 ? 'Выберите класс' : 
             step === 5 ? 'Распределите характеристики' : 
             'Выберите навыки' }}
        </h2>
        <p class="text-sm text-slate-400 mt-1">
          {{ step === 1 ? 'Выберите пол персонажа для начала' :
             step === 2 ? 'Выберите расу, расположенную между двумя аспектами' :
             step === 3 ? 'Подраса добавляет связь с одним из аспектов' :
             step === 4 ? 'Выберите класс персонажа' :
             step === 5 ? 'Распределите характеристики' :
             'Выберите навыки персонажа' }}
        </p>
      </div>

      <!-- Details area -->
      <div class="flex-1 overflow-y-auto">
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
      </div>

      <!-- Actions -->
      <div class="mt-6 flex gap-3">
        <button
          v-if="step > 1"
          type="button"
          class="px-4 py-2 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 transition"
          @click="prevStep"
        >
          Назад
        </button>

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
             'Далее' }}
        </button>

        <button
          v-else
          type="button"
          class="flex-1 px-4 py-2 rounded-lg bg-emerald-500/20 border border-emerald-400/60 text-emerald-100 font-semibold hover:bg-emerald-500/30 transition"
          :disabled="!canProceed"
          @click="emit('created', formData)"
        >
          Создать персонажа
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Smooth zoom transition, but not for pan (would make dragging laggy) */
.canvas-group {
  transition: transform 0.2s ease-out;
  will-change: transform;
}

/* Disable transition during active panning */
.canvas-group.panning {
  transition: none;
}
</style>
