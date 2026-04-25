<template>
  <Teleport to="body">
    <div
      v-if="state.isOpen"
      class="debug-panel"
      :style="{ left: position.x + 'px', top: position.y + 'px' }"
    >
      <!-- Header -->
      <div class="debug-header" @mousedown="startDrag">
        <span class="debug-title">🔧 Debug Panel</span>
        <div class="debug-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="debug-tab"
            :class="{ active: state.activeTab === tab.id }"
            @click="debug.setTab(tab.id)"
          >
            {{ tab.icon }} {{ tab.label }}
          </button>
        </div>
        <button class="debug-close" @click="debug.close">✕</button>
      </div>

      <!-- Content -->
      <div class="debug-content">
        <!-- Segments Tab -->
        <template v-if="state.activeTab === 'segments'">
          <div class="debug-section">
            <div class="debug-row">
              <label>Segment:</label>
              <select v-model="selectedSegmentId" @change="onSegmentChange">
                <option :value="null">— Select —</option>
                <option v-for="seg in state.segments" :key="seg.id" :value="seg.id">
                  {{ seg.id }} ({{ seg.points?.length || 0 }} pts)
                </option>
              </select>
            </div>
            
            <div v-if="selectedSegment" class="debug-row">
              <label>Fragment:</label>
              <button class="nav-btn" @click="debug.prevFragment()" :disabled="state.selectedFragmentIdx <= 0">◀</button>
              <span class="fragment-idx">{{ state.selectedFragmentIdx }} / {{ fragmentCount - 1 }}</span>
              <button class="nav-btn" @click="debug.nextFragment()" :disabled="state.selectedFragmentIdx >= fragmentCount - 1">▶</button>
            </div>

            <div class="debug-row checkboxes">
              <label><input type="checkbox" v-model="showSegmentHighlight" @change="onOptionChange"> Segment</label>
              <label><input type="checkbox" v-model="showFragmentHighlight" @change="onOptionChange"> Fragment</label>
              <label><input type="checkbox" v-model="showNormals" @change="onOptionChange"> Normals</label>
              <label><input type="checkbox" v-model="showHexCenters" @change="onOptionChange"> HexCenters</label>
            </div>
          </div>

          <!-- Fragment Details -->
          <div v-if="currentFragment" class="debug-section">
            <div class="debug-subtitle">Fragment {{ state.selectedFragmentIdx }}</div>
            
            <div class="debug-grid">
              <div class="debug-cell">
                <span class="label">P0:</span>
                <span class="value">{{ fmt(currentFragment.p0.x) }}, {{ fmt(currentFragment.p0.z) }}</span>
              </div>
              <div class="debug-cell">
                <span class="label">P1:</span>
                <span class="value">{{ fmt(currentFragment.p1.x) }}, {{ fmt(currentFragment.p1.z) }}</span>
              </div>
              <div class="debug-cell">
                <span class="label">Mid:</span>
                <span class="value">{{ fmt(currentFragment.mid.x) }}, {{ fmt(currentFragment.mid.z) }}</span>
              </div>
              <div class="debug-cell">
                <span class="label">Len:</span>
                <span class="value">{{ fmt(currentFragment.length) }}</span>
              </div>
            </div>

            <div class="debug-grid">
              <div class="debug-cell">
                <span class="label">Dir:</span>
                <span class="value">{{ fmt(currentFragment.direction.x) }}, {{ fmt(currentFragment.direction.z) }}</span>
              </div>
              <div class="debug-cell">
                <span class="label">LeftPerp:</span>
                <span class="value blue">{{ fmt(currentFragment.leftPerp.x) }}, {{ fmt(currentFragment.leftPerp.z) }}</span>
              </div>
            </div>

            <div class="debug-grid">
              <div class="debug-cell">
                <span class="label">StoredN:</span>
                <span class="value green">{{ fmt(currentFragment.storedNormal.x) }}, {{ fmt(currentFragment.storedNormal.z) }}</span>
              </div>
              <div class="debug-cell">
                <span class="label">Flipped:</span>
                <span class="value" :class="currentFragment.isFlipped ? 'red' : 'green'">
                  {{ currentFragment.isFlipped ? 'YES' : 'NO' }}
                </span>
              </div>
            </div>

            <div v-if="currentFragment.nearestEdge" class="debug-grid">
              <div class="debug-cell">
                <span class="label">HexCenter:</span>
                <span class="value cyan">
                  {{ fmt(currentFragment.nearestEdge.hexCenter.x) }}, {{ fmt(currentFragment.nearestEdge.hexCenter.z) }}
                </span>
              </div>
              <div class="debug-cell">
                <span class="label">Cross:</span>
                <span class="value" :class="currentFragment.crossProduct > 0 ? 'yellow' : 'white'">
                  {{ fmt(currentFragment.crossProduct) }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="selectedSegment" class="debug-section">
            <div class="debug-subtitle">Segment Info</div>
            <div class="debug-mini">
              <div>ID: {{ selectedSegment.id }}</div>
              <div>Left: {{ selectedSegment.patchLeft?.terrain }}</div>
              <div>Right: {{ selectedSegment.patchRight?.terrain }}</div>
              <div>Effect: {{ selectedSegment.effect }}</div>
            </div>
          </div>
        </template>

        <!-- Log Tab -->
        <template v-else-if="state.activeTab === 'log'">
          <div class="debug-toolbar">
            <button @click="debug.clearLogs()">Clear</button>
            <span class="log-count">{{ state.logs.length }} entries</span>
          </div>
          <div class="log-list">
            <div v-for="entry in state.logs" :key="entry.id" class="log-entry" :class="entry.level">
              <span class="log-time">{{ entry.timestamp }}</span>
              <span class="log-label">{{ entry.label }}</span>
              <pre class="log-data">{{ formatLogData(entry.data) }}</pre>
            </div>
            <div v-if="state.logs.length === 0" class="log-empty">
              No logs. Use debug.log(label, data) to add entries.
            </div>
          </div>
        </template>

        <!-- Inspect Tab -->
        <template v-else-if="state.activeTab === 'inspect'">
          <div v-if="state.inspectData" class="inspect-view">
            <div class="debug-subtitle">{{ state.inspectData.label }}</div>
            <pre class="inspect-data">{{ JSON.stringify(state.inspectData.data, null, 2) }}</pre>
          </div>
          <div v-else class="log-empty">
            No data. Use debug.inspect(data, label) to inspect objects.
          </div>
        </template>
      </div>

      <!-- Resize handle -->
      <div class="debug-resize" @mousedown="startResize"></div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useGlobalDebug } from '@/composables/useGlobalDebug'

const debug = useGlobalDebug()
const state = debug.state

const tabs = [
  { id: 'segments', label: 'Segments', icon: '📐' },
  { id: 'log', label: 'Log', icon: '📋' },
  { id: 'inspect', label: 'Inspect', icon: '🔎' },
]

// Position & size
const position = ref({ x: 20, y: 60 })
const size = ref({ width: 380, height: 500 })

// Local state bound to debug state
const selectedSegmentId = ref(null)
const showSegmentHighlight = ref(true)
const showFragmentHighlight = ref(true)
const showNormals = ref(true)
const showHexCenters = ref(true)

// Computed
const selectedSegment = computed(() => 
  state.segments.find(s => s.id === selectedSegmentId.value)
)

const fragmentCount = computed(() => 
  selectedSegment.value?.points?.length || 0
)

const currentFragment = computed(() => debug.getCurrentFragment())

// Sync with debug state
watch(() => state.selectedSegmentId, (id) => {
  selectedSegmentId.value = id
})

watch(selectedSegmentId, (id) => {
  debug.selectSegment(id)
})

// Event handlers
function onSegmentChange() {
  debug.selectSegment(selectedSegmentId.value)
}

function onOptionChange() {
  state.showSegmentHighlight = showSegmentHighlight.value
  state.showFragmentHighlight = showFragmentHighlight.value
  state.showNormals = showNormals.value
  state.showHexCenters = showHexCenters.value
  debug.updateHighlights()
}

// Drag
let dragging = false
let dragOffset = { x: 0, y: 0 }

function startDrag(e) {
  if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return
  dragging = true
  dragOffset = { x: e.clientX - position.value.x, y: e.clientY - position.value.y }
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
}

function onDrag(e) {
  if (!dragging) return
  position.value.x = e.clientX - dragOffset.x
  position.value.y = e.clientY - dragOffset.y
}

function stopDrag() {
  dragging = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
}

// Resize
let resizing = false

function startResize(e) {
  resizing = true
  window.addEventListener('mousemove', onResize)
  window.addEventListener('mouseup', stopResize)
}

function onResize(e) {
  if (!resizing) return
  size.value.width = Math.max(300, e.clientX - position.value.x)
  size.value.height = Math.max(200, e.clientY - position.value.y)
}

function stopResize() {
  resizing = false
  window.removeEventListener('mousemove', onResize)
  window.removeEventListener('mouseup', stopResize)
}

// Helpers
function fmt(n) {
  return typeof n === 'number' ? n.toFixed(3) : '—'
}

function formatLogData(data) {
  if (typeof data === 'string') return data
  if (typeof data === 'number') return String(data)
  return JSON.stringify(data, null, 2)
}

// Auto-select first segment when loaded
watch(() => state.segments.length, (len) => {
  if (len > 0 && !selectedSegmentId.value) {
    selectedSegmentId.value = state.segments[0].id
  }
})
</script>

<style scoped>
.debug-panel {
  position: fixed;
  width: 380px;
  max-height: 80vh;
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  z-index: 99999;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 11px;
  color: #cdd6f4;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.debug-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  background: #313244;
  cursor: move;
  border-bottom: 1px solid #45475a;
}

.debug-title {
  font-weight: bold;
  color: #f5c2e7;
  margin-right: auto;
}

.debug-tabs {
  display: flex;
  gap: 2px;
}

.debug-tab {
  padding: 3px 8px;
  border: none;
  background: transparent;
  color: #6c7086;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
}

.debug-tab:hover { background: #45475a; color: #cdd6f4; }
.debug-tab.active { background: #585b70; color: #f5e0dc; }

.debug-close {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #6c7086;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
}
.debug-close:hover { background: #f38ba8; color: #1e1e2e; }

.debug-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.debug-section {
  margin-bottom: 12px;
  padding: 8px;
  background: #181825;
  border-radius: 6px;
}

.debug-subtitle {
  color: #89b4fa;
  font-weight: bold;
  margin-bottom: 6px;
  font-size: 10px;
  text-transform: uppercase;
}

.debug-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.debug-row label { color: #a6adc8; min-width: 60px; }

.debug-row select {
  flex: 1;
  padding: 4px;
  background: #313244;
  border: 1px solid #45475a;
  color: #cdd6f4;
  border-radius: 4px;
  font-size: 10px;
}

.nav-btn {
  width: 24px;
  height: 24px;
  border: 1px solid #45475a;
  background: #313244;
  color: #cdd6f4;
  border-radius: 4px;
  cursor: pointer;
}
.nav-btn:hover:not(:disabled) { background: #45475a; }
.nav-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.fragment-idx {
  min-width: 50px;
  text-align: center;
  font-weight: bold;
}

.checkboxes {
  flex-wrap: wrap;
}
.checkboxes label {
  min-width: auto;
  font-size: 10px;
  display: flex;
  align-items: center;
  gap: 3px;
}
.checkboxes input[type="checkbox"] {
  width: 12px;
  height: 12px;
}

.debug-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 8px;
  margin-bottom: 4px;
}

.debug-cell {
  display: flex;
  gap: 4px;
}

.debug-cell .label {
  color: #6c7086;
  min-width: 55px;
}

.debug-cell .value {
  color: #cdd6f4;
  font-weight: 500;
}

.debug-cell .value.blue { color: #89b4fa; }
.debug-cell .value.green { color: #a6e3a1; }
.debug-cell .value.red { color: #f38ba8; }
.debug-cell .value.yellow { color: #f9e2af; }
.debug-cell .value.cyan { color: #94e2d5; }
.debug-cell .value.white { color: #ffffff; }

.debug-mini {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px;
  font-size: 10px;
  color: #a6adc8;
}

/* Log tab */
.debug-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.debug-toolbar button {
  padding: 4px 8px;
  border: 1px solid #45475a;
  background: #313244;
  color: #cdd6f4;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
}
.debug-toolbar button:hover { background: #45475a; }

.log-count { color: #6c7086; font-size: 10px; }

.log-list {
  max-height: 350px;
  overflow-y: auto;
}

.log-entry {
  padding: 4px;
  border-bottom: 1px solid #313244;
  font-size: 10px;
}
.log-entry.warn { background: rgba(249, 226, 175, 0.1); }
.log-entry.error { background: rgba(243, 139, 168, 0.1); }

.log-time { color: #6c7086; margin-right: 6px; }
.log-label { color: #89b4fa; font-weight: bold; margin-right: 6px; }
.log-data { margin: 2px 0 0 0; color: #a6adc8; white-space: pre-wrap; word-break: break-all; }

.log-empty {
  color: #6c7086;
  text-align: center;
  padding: 20px;
  font-style: italic;
}

/* Inspect tab */
.inspect-view { }
.inspect-data {
  background: #181825;
  padding: 8px;
  border-radius: 4px;
  max-height: 350px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 10px;
}

/* Resize handle */
.debug-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  cursor: se-resize;
  background: linear-gradient(135deg, transparent 50%, #45475a 50%);
  border-radius: 0 0 8px 0;
}
</style>
