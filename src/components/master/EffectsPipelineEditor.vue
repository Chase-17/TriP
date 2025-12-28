<template>
  <div class="effects-editor">
    <!-- Заголовок -->
    <div class="effects-header">
      <span class="effects-title">
        <Icon icon="mdi:layers-triple" />
        Эффекты границы
      </span>
      <div class="header-actions">
        <button 
          class="btn-icon"
          @click="showAddMenu = !showAddMenu"
          title="Добавить эффект"
        >
          <Icon icon="mdi:plus" />
        </button>
      </div>
    </div>

    <!-- Список эффектов -->
    <div class="effects-list" v-if="modelValue.length > 0">
      <div 
        v-for="(effect, index) in modelValue" 
        :key="effect.type + '_' + index"
        class="effect-item"
        :class="{ expanded: expandedIndex === index }"
      >
        <div class="effect-row" @click="toggleExpand(index)">
          <!-- Кнопка включения/выключения -->
          <button 
            class="toggle-btn"
            :class="{ disabled: effect.enabled === false }"
            @click.stop="toggleEnabled(index)"
            :title="effect.enabled === false ? 'Включить' : 'Выключить'"
          >
            <Icon :icon="effect.enabled === false ? 'mdi:eye-off' : 'mdi:eye'" />
          </button>
          
          <!-- Цветовой индикатор категории -->
          <div 
            class="effect-indicator"
            :style="{ backgroundColor: getCategoryColor(effect.type) }"
          ></div>
          
          <!-- Инфо -->
          <div class="effect-info" :class="{ 'effect-disabled': effect.enabled === false }">
            <span class="effect-name">{{ getEffectName(effect.type) }}</span>
            <span class="effect-params-summary">{{ getEffectSummary(effect) }}</span>
          </div>
          
          <!-- Экшены -->
          <div class="effect-actions" @click.stop>
            <button @click="moveUp(index)" :disabled="index === 0" title="Вверх">
              <Icon icon="mdi:arrow-up" />
            </button>
            <button @click="moveDown(index)" :disabled="index === modelValue.length - 1" title="Вниз">
              <Icon icon="mdi:arrow-down" />
            </button>
            <button @click="removeEffect(index)" class="delete" title="Удалить">
              <Icon icon="mdi:delete" />
            </button>
          </div>
        </div>
        
        <!-- Параметры (раскрытые) -->
        <div v-if="expandedIndex === index" class="effect-params">
          <!-- Описание эффекта -->
          <div class="effect-description" v-if="getEffectDescription(effect.type)">
            {{ getEffectDescription(effect.type) }}
          </div>
          
          <div 
            v-for="(paramDef, paramKey) in getEffectParams(effect.type)" 
            :key="paramKey"
            class="param-row"
          >
            <label class="param-label">{{ paramDef.label }}</label>
            
            <!-- Select для options -->
            <template v-if="paramDef.options">
              <select 
                class="param-select"
                :value="effect.params?.[paramKey] ?? paramDef.default"
                @change="updateParam(index, paramKey, $event.target.value)"
              >
                <option v-for="opt in paramDef.options" :key="opt" :value="opt">{{ opt }}</option>
              </select>
            </template>
            
            <!-- Color picker -->
            <template v-else-if="paramDef.type === 'color'">
              <div class="color-picker-row">
                <input 
                  type="color"
                  class="param-color"
                  :value="effect.params?.[paramKey] ?? paramDef.default"
                  @input="updateParam(index, paramKey, $event.target.value)"
                />
                <span class="color-value">{{ effect.params?.[paramKey] ?? paramDef.default }}</span>
              </div>
            </template>
            
            <!-- Slider для числовых значений -->
            <template v-else>
              <input 
                type="range"
                class="param-slider"
                :min="paramDef.min"
                :max="paramDef.max"
                :step="paramDef.step || 0.01"
                :value="effect.params?.[paramKey] ?? paramDef.default"
                @input="updateParam(index, paramKey, parseFloat($event.target.value))"
              />
              <span class="param-value">
                {{ formatValue(effect.params?.[paramKey] ?? paramDef.default, paramDef) }}{{ paramDef.suffix || '' }}
              </span>
            </template>
          </div>
          
          <!-- LOD: минимальный zoom для эффекта -->
          <div class="param-row lod-row">
            <label class="param-label">Мин. zoom</label>
            <input 
              type="range"
              class="param-slider"
              min="0"
              max="2"
              step="0.1"
              :value="effect.minZoom ?? 0"
              @input="updateEffectLod(index, 'minZoom', parseFloat($event.target.value))"
            />
            <span class="param-value">{{ (effect.minZoom ?? 0).toFixed(1) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Пусто -->
    <div v-else class="effects-empty">
      <span>Нет эффектов</span>
    </div>
    
    <!-- Кнопки добавления эффектов -->
    <div class="add-effects-row">
      <button 
        v-for="cat in effectCategories"
        :key="cat.id"
        class="add-effect-btn"
        @click="toggleCategoryMenu(cat.id)"
        :class="{ active: openCategory === cat.id }"
        :title="cat.label"
      >
        <Icon :icon="cat.icon" />
        <span>{{ cat.label }}</span>
      </button>
    </div>
    
    <!-- Подменю выбора эффекта -->
    <Transition name="slide">
      <div v-if="openCategory" class="category-submenu">
        <button 
          v-for="effect in getEffectsForCategory(openCategory)"
          :key="effect.id"
          class="effect-option"
          @click="addEffect(effect.id)"
          :title="effect.description"
        >
          {{ effect.name }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { getEffectsByCategory, getEffectDefaults, EFFECTS } from '@/utils/rendering/boundaryEffects.js'

const props = defineProps({
  modelValue: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const showAddMenu = ref(false)
const expandedIndex = ref(null)
const openCategory = ref(null)

// Категории эффектов
const effectCategories = [
  { id: 'deform', label: 'Деформация', icon: 'mdi:wave' },
  { id: 'smooth', label: 'Сглаживание', icon: 'mdi:blur' },
  { id: 'interpolate', label: 'Детализация', icon: 'mdi:dots-horizontal' },
  { id: 'offset', label: 'Смещение', icon: 'mdi:arrow-expand-horizontal' },
  { id: 'mask', label: 'Маска', icon: 'mdi:brush' },
  { id: 'visual', label: 'Визуал', icon: 'mdi:sparkles' }
]

// Цвета категорий
const categoryColors = {
  deform: '#f59e0b',
  smooth: '#8b5cf6', 
  interpolate: '#10b981',
  offset: '#3b82f6',
  mask: '#ec4899',
  visual: '#06b6d4'
}

// Эффекты по категориям
const effectsByCategory = computed(() => getEffectsByCategory())

function getEffectsForCategory(catId) {
  return effectsByCategory.value[catId] || []
}

function getCategoryColor(effectType) {
  const effect = EFFECTS[effectType]
  return categoryColors[effect?.category] || '#666'
}

function getEffectName(type) {
  return EFFECTS[type]?.name || type
}

function getEffectDescription(type) {
  return EFFECTS[type]?.description || ''
}

function getEffectSummary(effect) {
  const params = effect.params || {}
  const parts = []
  
  if (params.amplitude !== undefined) parts.push(`${params.amplitude.toFixed(0)}`)
  if (params.frequency !== undefined) parts.push(`×${params.frequency.toFixed(2)}`)
  if (params.strength !== undefined) parts.push(`${(params.strength * 100).toFixed(0)}%`)
  if (params.iterations !== undefined) parts.push(`${params.iterations}×`)
  
  return parts.join(' ')
}

function getEffectParams(type) {
  const paramDefs = {
    wave: {
      amplitude: { label: 'Сила', min: 0, max: 30, default: 8 },
      frequency: { label: 'Частота', min: 0.01, max: 0.5, step: 0.01, default: 0.12 }
    },
    jagged: {
      amplitude: { label: 'Сила', min: 0, max: 30, default: 10 },
      frequency: { label: 'Частота', min: 0.01, max: 0.5, step: 0.01, default: 0.18 },
      sharpness: { label: 'Резкость', min: 0.1, max: 1, step: 0.1, default: 0.4 }
    },
    noise: {
      amplitude: { label: 'Сила', min: 0, max: 30, default: 6 },
      scale: { label: 'Масштаб', min: 0.01, max: 0.5, step: 0.01, default: 0.1 }
    },
    sawtooth: {
      amplitude: { label: 'Сила', min: 0, max: 30, default: 8 },
      frequency: { label: 'Частота', min: 0.01, max: 0.3, step: 0.01, default: 0.1 }
    },
    steps: {
      amplitude: { label: 'Сила', min: 0, max: 30, default: 6 },
      frequency: { label: 'Частота', min: 0.01, max: 0.3, step: 0.01, default: 0.08 }
    },
    dither: {
      amplitude: { label: 'Сила', min: 0, max: 20, default: 4 },
      density: { label: 'Плотность', min: 0.1, max: 1, step: 0.1, default: 0.5 }
    },
    sine: {
      amplitude: { label: 'Сила', min: 0, max: 30, default: 6 },
      wavelength: { label: 'Длина волны', min: 5, max: 100, step: 1, default: 30, integer: true }
    },
    chaikin: {
      iterations: { label: 'Проходы', min: 1, max: 6, step: 1, default: 2, integer: true }
    },
    laplacian: {
      strength: { label: 'Сила', min: 0, max: 1, step: 0.05, default: 0.5 },
      iterations: { label: 'Проходы', min: 1, max: 20, step: 1, default: 5, integer: true }
    },
    subdivide: {
      segments: { label: 'Сегменты', min: 1, max: 12, step: 1, default: 4, integer: true }
    },
    offset: {
      amount: { label: 'Смещение', min: -20, max: 20, step: 0.5, default: 0 }
    },
    // Новые деформации
    zigzag: {
      amplitude: { label: 'Сила', min: 0, max: 30, default: 8 },
      wavelength: { label: 'Длина волны', min: 5, max: 50, step: 1, default: 20, integer: true }
    },
    fractal: {
      amplitude: { label: 'Сила', min: 0, max: 30, default: 10 },
      octaves: { label: 'Октавы', min: 1, max: 5, step: 1, default: 3, integer: true },
      persistence: { label: 'Затухание', min: 0.2, max: 0.8, step: 0.1, default: 0.5 },
      frequency: { label: 'Частота', min: 0.01, max: 0.3, step: 0.01, default: 0.1 }
    },
    pixelate: {
      gridSize: { label: 'Размер сетки', min: 2, max: 20, step: 1, default: 8, integer: true }
    },
    // Маска-эффекты
    alphaBlur: {
      width: { label: 'Ширина', min: 5, max: 60, step: 1, default: 20, integer: true },
      opacityStart: { label: 'Непрозр. на границе', min: 0, max: 100, step: 5, default: 100, integer: true, suffix: '%' },
      opacityEnd: { label: 'Непрозр. на краю', min: 0, max: 100, step: 5, default: 0, integer: true, suffix: '%' },
      falloff: { label: 'Кривая', options: ['linear', 'smooth', 'sharp'], default: 'linear' }
    },
    scatter: {
      width: { label: 'Ширина зоны', min: 0, max: 60, step: 1, default: 20, integer: true },
      density: { label: 'Плотность частиц', min: 0, max: 1, step: 0.05, default: 0.5 },
      noiseScale: { label: 'Масштаб шума', min: 0.01, max: 0.5, step: 0.01, default: 0.15 },
      strength: { label: 'Сила эффекта', min: 2, max: 5, step: 0.1, default: 3.0 },
      particleSize: { label: 'Размер частиц', min: 0.1, max: 1.5, step: 0.1, default: 0.5 },
      erosion: { label: 'Эрозия', min: 0, max: 1, step: 0.1, default: 0.5 },
      roughness: { label: 'Шероховатость', min: 0, max: 1, step: 0.1, default: 0.5 },
      seed: { label: 'Вариация', min: 0, max: 100, step: 1, default: 0, integer: true }
    },
    noiseBlend: {
      width: { label: 'Ширина', min: 5, max: 40, step: 1, default: 15, integer: true },
      noiseScale: { label: 'Масштаб шума', min: 0.05, max: 0.5, step: 0.05, default: 0.15 },
      contrast: { label: 'Контраст', min: 0, max: 1, step: 0.1, default: 0.5 }
    },
    stroke: {
      width: { label: 'Толщина', min: 1, max: 10, step: 0.5, default: 2 },
      color: { label: 'Цвет', type: 'color', default: '#000000' },
      opacity: { label: 'Прозрачность', min: 0, max: 1, step: 0.1, default: 0.5 }
    },
    // Визуальные эффекты
    glow: {
      width: { label: 'Размер', min: 2, max: 30, step: 1, default: 10, integer: true },
      offsetX: { label: 'Смещение X', min: -20, max: 20, step: 1, default: 0, integer: true },
      offsetY: { label: 'Смещение Y', min: -20, max: 20, step: 1, default: 0, integer: true },
      color: { label: 'Цвет', type: 'color', default: '#ffffff' },
      intensity: { label: 'Интенсивность', min: 0.1, max: 1, step: 0.1, default: 0.7 }
    },
    shadow: {
      width: { label: 'Размытие', min: 2, max: 30, step: 1, default: 8, integer: true },
      lengthMultiplier: { label: 'Множитель длины', min: 0, max: 5, step: 0.1, default: 1.0 },
      color: { label: 'Цвет', type: 'color', default: '#000000' },
      opacity: { label: 'Непрозрачность', min: 0, max: 1, step: 0.1, default: 0.4 }
    }
  }
  return paramDefs[type] || {}
}

function formatValue(value, paramDef) {
  if (typeof value === 'string') return value
  if (paramDef.integer) return Math.round(value).toString()
  if (Math.abs(value) < 1) return value.toFixed(2)
  return value.toFixed(1)
}

function toggleExpand(index) {
  expandedIndex.value = expandedIndex.value === index ? null : index
}

function toggleEnabled(index) {
  const newEffects = [...props.modelValue]
  const effect = { ...newEffects[index] }
  effect.enabled = effect.enabled === false ? true : false
  newEffects[index] = effect
  emit('update:modelValue', newEffects)
}

function toggleCategoryMenu(catId) {
  openCategory.value = openCategory.value === catId ? null : catId
}

function addEffect(type) {
  const defaults = getEffectDefaults(type)
  const newEffect = { type, params: { ...defaults } }
  emit('update:modelValue', [...props.modelValue, newEffect])
  openCategory.value = null
  expandedIndex.value = props.modelValue.length
}

function removeEffect(index) {
  const newEffects = [...props.modelValue]
  newEffects.splice(index, 1)
  emit('update:modelValue', newEffects)
  if (expandedIndex.value === index) expandedIndex.value = null
  else if (expandedIndex.value > index) expandedIndex.value--
}

function moveUp(index) {
  if (index === 0) return
  const newEffects = [...props.modelValue]
  ;[newEffects[index - 1], newEffects[index]] = [newEffects[index], newEffects[index - 1]]
  emit('update:modelValue', newEffects)
  if (expandedIndex.value === index) expandedIndex.value = index - 1
  else if (expandedIndex.value === index - 1) expandedIndex.value = index
}

function moveDown(index) {
  if (index === props.modelValue.length - 1) return
  const newEffects = [...props.modelValue]
  ;[newEffects[index], newEffects[index + 1]] = [newEffects[index + 1], newEffects[index]]
  emit('update:modelValue', newEffects)
  if (expandedIndex.value === index) expandedIndex.value = index + 1
  else if (expandedIndex.value === index + 1) expandedIndex.value = index
}

function updateParam(index, paramKey, value) {
  const newEffects = [...props.modelValue]
  newEffects[index] = {
    ...newEffects[index],
    params: { ...newEffects[index].params, [paramKey]: value }
  }
  emit('update:modelValue', newEffects)
}

function updateEffectLod(index, key, value) {
  const newEffects = [...props.modelValue]
  newEffects[index] = {
    ...newEffects[index],
    [key]: value
  }
  emit('update:modelValue', newEffects)
}
</script>

<style scoped>
.effects-editor {
  margin-top: 0.5rem;
}

/* Header */
.effects-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.effects-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.5);
}

.header-actions .btn-icon {
  padding: 0.25rem;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.4);
  cursor: pointer;
  border-radius: 0.25rem;
  font-size: 1rem;
  transition: all 0.15s;
}

.header-actions .btn-icon:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

/* Effects list */
.effects-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.375rem;
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.effect-item {
  background: rgba(0, 0, 0, 0.2);
}

.effect-item.expanded {
  background: rgba(59, 130, 246, 0.1);
}

.effect-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  cursor: pointer;
  transition: background 0.15s;
}

.effect-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

/* Кнопка включения/выключения */
.toggle-btn {
  padding: 0.25rem;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  transition: all 0.15s;
  flex-shrink: 0;
}

.toggle-btn:hover {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.toggle-btn.disabled {
  color: rgba(255, 255, 255, 0.2);
}

/* Индикатор категории */
.effect-indicator {
  width: 16px;
  height: 16px;
  border-radius: 0.25rem;
  flex-shrink: 0;
}

/* Инфо */
.effect-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.effect-name {
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.effect-disabled .effect-name,
.effect-disabled .effect-params-summary {
  opacity: 0.4;
  text-decoration: line-through;
}

.effect-params-summary {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
  font-family: 'JetBrains Mono', monospace;
}

/* Экшены */
.effect-actions {
  display: flex;
  gap: 0.125rem;
}

.effect-actions button {
  padding: 0.25rem;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  border-radius: 0.25rem;
  font-size: 0.875rem;
  transition: all 0.15s;
}

.effect-actions button:hover:not(:disabled) {
  color: white;
  background: rgba(255, 255, 255, 0.1);
}

.effect-actions button.delete:hover {
  color: rgb(239, 68, 68);
  background: rgba(239, 68, 68, 0.1);
}

.effect-actions button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Параметры */
.effect-params {
  padding: 0.5rem 0.5rem 0.5rem 2rem;
  background: rgba(0, 0, 0, 0.1);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.effect-description {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 0.5rem;
  line-height: 1.4;
  font-style: italic;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.param-row:last-child {
  margin-bottom: 0;
}

.param-label {
  flex: 0 0 70px;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}

.param-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  outline: none;
}

.param-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #6366f1;
  border-radius: 50%;
  cursor: pointer;
}

.param-value {
  width: 40px;
  text-align: right;
  font-size: 0.75rem;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.7);
}

.param-select {
  flex: 1;
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.25rem;
  color: white;
  font-size: 0.75rem;
  cursor: pointer;
}

.param-select option {
  background: #1e1e2e;
  color: white;
}

/* Color picker */
.color-picker-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
}

.param-color {
  width: 2rem;
  height: 1.5rem;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 0.25rem;
  background: none;
  cursor: pointer;
}

.param-color::-webkit-color-swatch-wrapper {
  padding: 2px;
}

.param-color::-webkit-color-swatch {
  border-radius: 0.125rem;
  border: none;
}

.color-value {
  font-size: 0.7rem;
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
}

/* Пустое состояние */
.effects-empty {
  padding: 1rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 0.8rem;
}

/* Кнопки добавления */
.add-effects-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.add-effect-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.375rem;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.add-effect-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.add-effect-btn.active {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.4);
  color: rgb(165, 180, 252);
}

/* Подменю категории */
.category-submenu {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.375rem;
}

.effect-option {
  padding: 0.375rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  border-radius: 0.25rem;
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.effect-option:hover {
  background: rgba(99, 102, 241, 0.3);
  color: white;
}

/* Анимации */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
