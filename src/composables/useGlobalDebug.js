/**
 * Global Debug System
 * 
 * Usage:
 *   - Console: window.debug.open(), window.debug.close(), window.debug.toggle()
 *   - Console: window.debug.setSegments(segments), window.debug.log(data)
 *   - Keyboard: Ctrl+Shift+D to toggle panel
 * 
 * From components:
 *   import { useGlobalDebug } from '@/composables/useGlobalDebug'
 *   const debug = useGlobalDebug()
 *   debug.setSegments(segments)
 *   debug.setOriginalEdges(segmentId, edges)
 */

import { ref, reactive, readonly } from 'vue'

// Singleton state
const state = reactive({
  isOpen: false,
  activeTab: 'segments', // 'segments' | 'log' | 'performance'
  
  // Segment debug data
  segments: [],
  originalEdgesMap: new Map(),
  selectedSegmentId: null,
  selectedFragmentIdx: 0,
  
  // Highlight options
  showSegmentHighlight: true,
  showFragmentHighlight: true,
  showNormals: true,
  showHexCenters: true,
  
  // Log entries
  logs: [],
  maxLogs: 500,
  
  // Custom data for inspection
  inspectData: null,
})

// Callbacks for visualization (set by preview component)
const callbacks = {
  onHighlightSegment: null,
  onHighlightFragment: null,
}

// ========== API Methods ==========

function open() {
  state.isOpen = true
  console.log('[Debug] Panel opened. Use window.debug for API.')
}

function close() {
  state.isOpen = false
}

function toggle() {
  state.isOpen = !state.isOpen
  if (state.isOpen) {
    console.log('[Debug] Panel opened. Use window.debug for API.')
  }
}

function setTab(tab) {
  state.activeTab = tab
}

// Segment data
function setSegments(segments, originalEdgesMap = null) {
  state.segments = segments || []
  if (originalEdgesMap) {
    state.originalEdgesMap = originalEdgesMap
  }
  console.log(`[Debug] Loaded ${state.segments.length} segments`)
}

function setOriginalEdges(segmentId, edges) {
  state.originalEdgesMap.set(segmentId, edges)
}

function selectSegment(id) {
  state.selectedSegmentId = id
  state.selectedFragmentIdx = 0
  updateHighlights()
}

function selectFragment(idx) {
  state.selectedFragmentIdx = idx
  updateHighlights()
}

function nextFragment() {
  const seg = state.segments.find(s => s.id === state.selectedSegmentId)
  if (seg && state.selectedFragmentIdx < seg.points.length - 2) {
    state.selectedFragmentIdx++
    updateHighlights()
  }
}

function prevFragment() {
  if (state.selectedFragmentIdx > 0) {
    state.selectedFragmentIdx--
    updateHighlights()
  }
}

// Logging
function log(label, data, level = 'info') {
  const entry = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString().substr(11, 12),
    level,
    label,
    data: typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : data,
  }
  state.logs.unshift(entry)
  if (state.logs.length > state.maxLogs) {
    state.logs.pop()
  }
  
  // Also console log
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  consoleFn(`[Debug:${label}]`, data)
}

function clearLogs() {
  state.logs = []
}

// Inspect arbitrary data
function inspect(data, label = 'Inspect') {
  state.inspectData = { label, data, timestamp: Date.now() }
  state.activeTab = 'inspect'
  state.isOpen = true
}

// Register visualization callbacks
function registerCallbacks(cbs) {
  if (cbs.onHighlightSegment) callbacks.onHighlightSegment = cbs.onHighlightSegment
  if (cbs.onHighlightFragment) callbacks.onHighlightFragment = cbs.onHighlightFragment
}

function updateHighlights() {
  const seg = state.segments.find(s => s.id === state.selectedSegmentId)
  
  if (callbacks.onHighlightSegment) {
    callbacks.onHighlightSegment(state.showSegmentHighlight ? seg : null)
  }
  
  if (callbacks.onHighlightFragment && seg) {
    const fragment = getFragmentData(seg, state.selectedFragmentIdx)
    callbacks.onHighlightFragment(state.showFragmentHighlight ? {
      segment: seg,
      fragmentIdx: state.selectedFragmentIdx,
      fragment,
      showNormals: state.showNormals,
      showHexCenters: state.showHexCenters,
    } : null)
  }
}

// Get computed fragment data
function getFragmentData(seg, idx) {
  if (!seg?.points || idx < 0 || idx >= seg.points.length - 1) return null
  
  const p0 = seg.points[idx]
  const p1 = seg.points[idx + 1]
  
  const dx = p1.x - p0.x
  const dz = p1.z - p0.z
  const len = Math.sqrt(dx * dx + dz * dz)
  
  const direction = len > 0.0001 ? { x: dx / len, z: dz / len } : { x: 0, z: 0 }
  const leftPerp = { x: -direction.z, z: direction.x }
  
  const storedNormal = seg.normals?.[idx] || { nx: 0, nz: 0 }
  
  const dot = leftPerp.x * storedNormal.nx + leftPerp.z * storedNormal.nz
  const isFlipped = dot < 0
  
  const mid = { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2 }
  
  // Find nearest original edge
  const originalEdges = state.originalEdgesMap.get(seg.id) || []
  let nearestEdge = null
  let nearestDist = Infinity
  let crossProduct = 0
  
  for (const edge of originalEdges) {
    if (!edge.from || !edge.to || !edge.hexCenter) continue
    const edgeMid = { x: (edge.from.x + edge.to.x) / 2, z: (edge.from.z + edge.to.z) / 2 }
    const d = Math.sqrt((edgeMid.x - mid.x) ** 2 + (edgeMid.z - mid.z) ** 2)
    if (d < nearestDist) {
      nearestDist = d
      nearestEdge = { mid: edgeMid, hexCenter: edge.hexCenter, distance: d }
      crossProduct = (edge.hexCenter.x - p0.x) * dz - (edge.hexCenter.z - p0.z) * dx
    }
  }
  
  return {
    p0, p1, mid, length: len,
    direction, leftPerp,
    storedNormal: { x: storedNormal.nx, z: storedNormal.nz },
    isFlipped, nearestEdge, crossProduct,
  }
}

// Get current fragment data (for panel display)
function getCurrentFragment() {
  const seg = state.segments.find(s => s.id === state.selectedSegmentId)
  if (!seg) return null
  return getFragmentData(seg, state.selectedFragmentIdx)
}

// ========== Keyboard handler ==========
function handleKeydown(e) {
  // F12 to toggle debug panel (or Ctrl+`)
  if (e.key === 'F12' || (e.ctrlKey && e.key === '`')) {
    e.preventDefault()
    toggle()
  }
  
  // Arrow keys for fragment navigation when panel is open
  if (state.isOpen && state.activeTab === 'segments' && state.selectedSegmentId !== null) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      prevFragment()
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      nextFragment()
    }
  }
}

// ========== Init ==========
let initialized = false

function init() {
  if (initialized) return
  initialized = true
  
  // Register keyboard handler
  window.addEventListener('keydown', handleKeydown)
  
  // Expose to console
  window.debug = {
    // Panel control
    open,
    close,
    toggle,
    setTab,
    
    // Segment debug
    setSegments,
    setOriginalEdges,
    selectSegment,
    selectFragment,
    nextFragment,
    prevFragment,
    
    // Logging
    log,
    clearLogs,
    inspect,
    
    // State access (readonly)
    get state() { return state },
    get segments() { return state.segments },
    get selectedSegment() { return state.segments.find(s => s.id === state.selectedSegmentId) },
    get currentFragment() { return getCurrentFragment() },
    
    // Helpers
    help() {
      console.log(`
=== Debug Panel API ===

Panel Control:
  debug.open()          - Open debug panel
  debug.close()         - Close debug panel  
  debug.toggle()        - Toggle panel (or Ctrl+Shift+D)
  debug.setTab(name)    - Switch tab: 'segments', 'log', 'inspect'

Segment Debug:
  debug.segments        - List all segments
  debug.selectSegment(id) - Select segment by ID
  debug.selectFragment(idx) - Select fragment by index
  debug.nextFragment()  - Next fragment (or Arrow Right)
  debug.prevFragment()  - Previous fragment (or Arrow Left)
  debug.selectedSegment - Get selected segment
  debug.currentFragment - Get current fragment with computed data

Logging:
  debug.log(label, data) - Add log entry
  debug.clearLogs()      - Clear all logs
  debug.inspect(data)    - Open inspect tab with data

State:
  debug.state           - Full debug state object
      `)
    }
  }
  
  console.log('[Debug] System initialized. Press Ctrl+Shift+D or run debug.help()')
}

// ========== Composable ==========
export function useGlobalDebug() {
  init()
  
  return {
    state: readonly(state),
    
    // Panel
    open,
    close,
    toggle,
    setTab,
    
    // Segments
    setSegments,
    setOriginalEdges,
    selectSegment,
    selectFragment,
    nextFragment,
    prevFragment,
    getCurrentFragment,
    getFragmentData,
    
    // Logging
    log,
    clearLogs,
    inspect,
    
    // Callbacks
    registerCallbacks,
    updateHighlights,
  }
}
