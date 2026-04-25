<template>
  <div class="terrain-editor">
    <!-- Tabs -->
    <div class="editor-tabs">
      <button 
        :class="['tab', { active: activeTab === 'general' }]"
        @click="activeTab = 'general'"
      >Общее</button>
      <button 
        :class="['tab', { active: activeTab === 'layers' }]"
        @click="activeTab = 'layers'"
      >Слои ({{ terrain.layers?.length || 0 }})</button>
      <button 
        :class="['tab', { active: activeTab === 'elevation' }]"
        @click="activeTab = 'elevation'"
      >Высота</button>
    </div>

    <!-- General Tab -->
    <div class="tab-content" v-show="activeTab === 'general'">
      <div class="field">
        <label>ID</label>
        <input 
          type="text" 
          :value="terrain.id" 
          @input="emit('update', { id: $event.target.value })"
          placeholder="unique_id"
        />
      </div>

      <div class="field">
        <label>Название</label>
        <input 
          type="text" 
          :value="terrain.name" 
          @input="emit('update', { name: $event.target.value })"
          placeholder="Название террейна"
        />
      </div>

      <div class="field">
        <label>Цвет превью</label>
        <div class="color-input">
          <input 
            type="color" 
            :value="terrain.previewColor || '#808080'" 
            @input="emit('update', { previewColor: $event.target.value })"
          />
          <input 
            type="text" 
            :value="terrain.previewColor || '#808080'" 
            @input="emit('update', { previewColor: $event.target.value })"
            class="color-text"
          />
        </div>
      </div>

      <div class="field">
        <label>Стоимость передвижения</label>
        <div class="range-input">
          <input 
            type="range" 
            :value="terrain.movementCost || 1" 
            @input="emit('update', { movementCost: parseFloat($event.target.value) })"
            min="0.5"
            max="5"
            step="0.5"
          />
          <span class="range-value">{{ terrain.movementCost?.toFixed(1) || '1.0' }}×</span>
        </div>
      </div>

      <div class="field checkbox">
        <label>
          <input 
            type="checkbox" 
            :checked="terrain.passable" 
            @change="emit('update', { passable: $event.target.checked })"
          />
          Проходимый
        </label>
      </div>

      <div class="field checkbox">
        <label>
          <input 
            type="checkbox" 
            :checked="terrain.liquid" 
            @change="emit('update', { liquid: $event.target.checked })"
          />
          Жидкость
        </label>
      </div>

      <!-- HSLA Modifier -->
      <div class="section-header">HSLA модификатор</div>
      
      <div class="field">
        <label>Оттенок (Hue)</label>
        <div class="range-input">
          <input 
            type="range" 
            :value="terrain.hsla?.hue || 0" 
            @input="updateHsla('hue', parseFloat($event.target.value))"
            min="-180"
            max="180"
            step="1"
          />
          <span class="range-value">{{ terrain.hsla?.hue || 0 }}°</span>
        </div>
      </div>
      
      <div class="field">
        <label>Насыщенность</label>
        <div class="range-input">
          <input 
            type="range" 
            :value="terrain.hsla?.saturation || 0" 
            @input="updateHsla('saturation', parseFloat($event.target.value))"
            min="-100"
            max="100"
            step="1"
          />
          <span class="range-value">{{ terrain.hsla?.saturation || 0 }}%</span>
        </div>
      </div>
      
      <div class="field">
        <label>Яркость</label>
        <div class="range-input">
          <input 
            type="range" 
            :value="terrain.hsla?.lightness || 0" 
            @input="updateHsla('lightness', parseFloat($event.target.value))"
            min="-100"
            max="100"
            step="1"
          />
          <span class="range-value">{{ terrain.hsla?.lightness || 0 }}%</span>
        </div>
      </div>
      
      <div class="field">
        <label>Непрозрачность</label>
        <div class="range-input">
          <input 
            type="range" 
            :value="(terrain.hsla?.alpha ?? 1) * 100" 
            @input="updateHsla('alpha', parseFloat($event.target.value) / 100)"
            min="0"
            max="100"
            step="1"
          />
          <span class="range-value">{{ Math.round((terrain.hsla?.alpha ?? 1) * 100) }}%</span>
        </div>
      </div>
    </div>

    <!-- Layers Tab -->
    <div class="tab-content layers-tab" v-show="activeTab === 'layers'">
      <div class="layers-toolbar">
        <span class="layers-count">{{ terrain.layers?.length || 0 }} слоёв</span>
        <div class="layers-actions">
          <select v-model="newLayerType" class="layer-type-select">
            <option value="color">● Цвет</option>
            <option value="noise">░ Шум</option>
            <option value="pattern">⬡ Паттерн</option>
            <option value="gradient">▓ Градиент</option>
            <option value="texture">▦ Текстура</option>
            <option value="edge">○ Обводка</option>
          </select>
          <button class="btn-add-layer" @click="addLayer">+ Добавить</button>
        </div>
      </div>

      <draggable 
        v-if="terrain.layers?.length"
        v-model="layersModel"
        item-key="id"
        handle=".layer-header"
        ghost-class="layer-ghost"
        class="layers-list"
      >
        <template #item="{ element: layer, index }">
          <component
            :is="getLayerComponent(layer.type)"
            :layer="layer"
            :index="index"
            :is-first="index === 0"
            :is-last="index === terrain.layers.length - 1"
            @update="updateLayer(layer.id, $event)"
            @delete="deleteLayer(layer.id)"
          />
        </template>
      </draggable>

      <div v-if="!terrain.layers?.length" class="empty-layers">
        Нет слоёв. Добавьте первый слой.
      </div>
    </div>

    <!-- Elevation Tab -->
    <div class="tab-content" v-show="activeTab === 'elevation'">
      <div class="field">
        <label>Базовая высота</label>
        <div class="range-input">
          <input 
            type="range" 
            :value="terrain.elevation?.base || 0" 
            @input="updateElevation({ base: parseFloat($event.target.value) })"
            min="-5"
            max="10"
            step="0.25"
          />
          <span class="range-value">{{ terrain.elevation?.base?.toFixed(2) || '0.00' }}</span>
        </div>
      </div>

      <div class="field">
        <label>Вариация высоты</label>
        <div class="range-input">
          <input 
            type="range" 
            :value="terrain.elevation?.variation || 0" 
            @input="updateElevation({ variation: parseFloat($event.target.value) })"
            min="0"
            max="2"
            step="0.05"
          />
          <span class="range-value">± {{ terrain.elevation?.variation?.toFixed(2) || '0.00' }}</span>
        </div>
      </div>

      <div class="field">
        <label>Масштаб шума высоты</label>
        <div class="range-input">
          <input 
            type="range" 
            :value="terrain.elevation?.noiseScale || 1" 
            @input="updateElevation({ noiseScale: parseFloat($event.target.value) })"
            min="0.1"
            max="10"
            step="0.1"
          />
          <span class="range-value">{{ terrain.elevation?.noiseScale?.toFixed(1) || '1.0' }}</span>
        </div>
      </div>

      <div class="elevation-preview">
        <div class="elevation-bar">
          <div 
            class="elevation-indicator"
            :style="{ 
              bottom: `${((terrain.elevation?.base || 0) + 5) / 15 * 100}%`,
              height: `${(terrain.elevation?.variation || 0) / 15 * 100}%`
            }"
          ></div>
        </div>
        <div class="elevation-labels">
          <span>+10</span>
          <span>0</span>
          <span>-5</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import draggable from 'vuedraggable'
import { createLayer } from '@/stores/threeAssets'
import ColorLayer from './layers/ColorLayer.vue'
import NoiseLayer from './layers/NoiseLayer.vue'
import PatternLayer from './layers/PatternLayer.vue'
import GradientLayer from './layers/GradientLayer.vue'
import TextureLayer from './layers/TextureLayer.vue'
import EdgeLayer from './layers/EdgeLayer.vue'

const props = defineProps({
  terrain: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['update'])

const activeTab = ref('layers')
const newLayerType = ref('noise')

// Computed model for vuedraggable (two-way binding workaround for props)
const layersModel = computed({
  get: () => props.terrain.layers || [],
  set: (newLayers) => emit('update', { layers: newLayers })
})

const layerComponents = {
  color: ColorLayer,
  noise: NoiseLayer,
  pattern: PatternLayer,
  gradient: GradientLayer,
  texture: TextureLayer,
  edge: EdgeLayer,
}

function getLayerComponent(type) {
  return layerComponents[type] || ColorLayer
}

function addLayer() {
  const layer = createLayer(newLayerType.value)
  if (!layer) return
  
  const newLayers = [...(props.terrain.layers || []), layer]
  emit('update', { layers: newLayers })
}

function updateHsla(key, value) {
  const currentHsla = props.terrain.hsla || { hue: 0, saturation: 0, lightness: 0, alpha: 1 }
  emit('update', { 
    hsla: { ...currentHsla, [key]: value }
  })
}

function updateLayer(layerId, updates) {
  const newLayers = props.terrain.layers.map(layer => 
    layer.id === layerId ? { ...layer, ...updates } : layer
  )
  emit('update', { layers: newLayers })
}

function deleteLayer(layerId) {
  const newLayers = props.terrain.layers.filter(layer => layer.id !== layerId)
  emit('update', { layers: newLayers })
}

function moveLayer(layerId, direction) {
  const layers = [...props.terrain.layers]
  const index = layers.findIndex(l => l.id === layerId)
  if (index === -1) return
  
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= layers.length) return
  
  // Swap
  const temp = layers[index]
  layers[index] = layers[newIndex]
  layers[newIndex] = temp
  
  emit('update', { layers })
}

function updateElevation(updates) {
  emit('update', { 
    elevation: { 
      ...(props.terrain.elevation || { base: 0, variation: 0, noiseScale: 1 }), 
      ...updates 
    } 
  })
}
</script>

<style scoped>
.terrain-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-tabs {
  display: flex;
  gap: 2px;
  padding: 8px;
  background: #12122a;
  border-bottom: 1px solid #2a2a4a;
}

.tab {
  flex: 1;
  padding: 8px 12px;
  background: #1a1a3a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s;
}

.tab:hover {
  background: #252550;
  color: #aaa;
}

.tab.active {
  background: #3a3a6a;
  color: #fff;
  border-color: #5a5a8a;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.layers-tab {
  padding: 0;
  gap: 0;
}

.section-header {
  font-size: 12px;
  font-weight: 600;
  color: #9a9ac0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 16px 0 8px 0;
  padding-bottom: 4px;
  border-bottom: 1px solid #3a3a5a;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field label {
  font-size: 12px;
  color: #888;
  font-weight: 500;
}

.field.checkbox label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #ccc;
}

.field input[type="text"] {
  padding: 8px 10px;
  background: #1a1a3a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 13px;
}

.field input[type="text"]:focus {
  outline: none;
  border-color: #4a4a7a;
}

.color-input {
  display: flex;
  gap: 8px;
  align-items: center;
}

.color-input input[type="color"] {
  width: 40px;
  height: 32px;
  padding: 0;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
}

.color-text {
  flex: 1;
}

.range-input {
  display: flex;
  align-items: center;
  gap: 10px;
}

.range-input input[type="range"] {
  flex: 1;
  height: 4px;
  background: #2a2a4a;
  border-radius: 2px;
  appearance: none;
}

.range-input input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: #5a5a8a;
  border-radius: 50%;
  cursor: pointer;
}

.range-value {
  min-width: 50px;
  text-align: right;
  font-size: 13px;
  color: #aaa;
  font-family: monospace;
}

input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* Layers */
.layers-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #1a1a3a;
  border-bottom: 1px solid #2a2a4a;
}

.layers-count {
  font-size: 12px;
  color: #888;
}

.layers-actions {
  display: flex;
  gap: 6px;
}

.layer-type-select {
  padding: 6px 8px;
  background: #12122a;
  border: 1px solid #2a2a4a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 12px;
}

.btn-add-layer {
  padding: 6px 12px;
  background: #2a6a3a;
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}

.btn-add-layer:hover {
  background: #3a8a4a;
}

.layers-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-layers {
  padding: 40px 20px;
  text-align: center;
  color: #666;
  font-size: 13px;
}

/* Elevation Preview */
.elevation-preview {
  display: flex;
  gap: 8px;
  padding: 12px;
  background: #15152a;
  border-radius: 6px;
  margin-top: 8px;
}

.elevation-bar {
  width: 40px;
  height: 120px;
  background: linear-gradient(to top, #2a4a6a, #3a3a3a, #6a4a2a);
  border-radius: 4px;
  position: relative;
  border: 1px solid #2a2a4a;
}

.elevation-indicator {
  position: absolute;
  left: 4px;
  right: 4px;
  background: rgba(100, 200, 100, 0.5);
  border: 1px solid #6c6;
  border-radius: 2px;
  min-height: 4px;
}

.elevation-labels {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-size: 10px;
  color: #666;
  font-family: monospace;
}

/* Drag and drop (vuedraggable) */
:deep(.layer-ghost) {
  opacity: 0.4;
  background: #3a3a6a !important;
  border: 2px dashed #5a5a8a;
}
:deep(.sortable-drag) {
  opacity: 0.9;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
</style>
