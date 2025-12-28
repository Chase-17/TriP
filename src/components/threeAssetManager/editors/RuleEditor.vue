<template>
  <div class="rule-editor">
    <!-- Header -->
    <div class="editor-section">
      <div class="field">
        <label>ID</label>
        <input 
          type="text" 
          :value="rule.id" 
          @input="emit('update', { id: $event.target.value })"
          placeholder="unique_id"
        />
      </div>

      <div class="field">
        <label>Название</label>
        <input 
          type="text" 
          :value="rule.name" 
          @input="emit('update', { name: $event.target.value })"
          placeholder="Название правила"
        />
      </div>
    </div>

    <!-- Match Configuration -->
    <div class="editor-section">
      <div class="section-header">
        <span class="section-icon">🎯</span>
        <span class="section-title">Условие</span>
      </div>

      <div class="field">
        <label>Уровень</label>
        <select 
          :value="rule.match?.level || 'id-to-id'" 
          @change="updateMatch({ level: $event.target.value })"
        >
          <option value="id-to-id">ID → ID (конкретные террейны)</option>
          <option value="id-to-any">ID → Любой</option>
          <option value="id-to-tag">ID → Тег</option>
          <option value="tag-to-tag">Тег → Тег</option>
          <option value="any-to-any">Любой → Любой (fallback)</option>
        </select>
      </div>

      <div class="match-row">
        <!-- From -->
        <div class="field match-field">
          <label>От</label>
          <select 
            v-if="matchLevel === 'id-to-id' || matchLevel === 'id-to-any' || matchLevel === 'id-to-tag'"
            :value="rule.match?.from" 
            @change="updateMatch({ from: $event.target.value || null })"
          >
            <option :value="null">-- Выбрать --</option>
            <option v-for="t in terrains" :key="t.id" :value="t.id">
              {{ t.name }}
            </option>
          </select>
          <div v-else class="tag-select">
            <select 
              :value="rule.match?.from?.category || 'surface'"
              @change="updateMatchTag('from', 'category', $event.target.value)"
            >
              <option value="surface">Поверхность</option>
              <option value="elevation">Высота</option>
            </select>
            <input 
              type="text"
              :value="rule.match?.from?.tag || '*'"
              @input="updateMatchTag('from', 'tag', $event.target.value)"
              placeholder="тег или *"
            />
          </div>
        </div>

        <span class="match-arrow">→</span>

        <!-- To -->
        <div class="field match-field">
          <label>К</label>
          <select 
            v-if="matchLevel === 'id-to-id'"
            :value="rule.match?.to" 
            @change="updateMatch({ to: $event.target.value || null })"
          >
            <option :value="null">-- Выбрать --</option>
            <option v-for="t in terrains" :key="t.id" :value="t.id">
              {{ t.name }}
            </option>
          </select>
          <span v-else-if="matchLevel === 'id-to-any'" class="any-marker">Любой</span>
          <div v-else class="tag-select">
            <select 
              :value="rule.match?.to?.category || 'surface'"
              @change="updateMatchTag('to', 'category', $event.target.value)"
            >
              <option value="surface">Поверхность</option>
              <option value="elevation">Высота</option>
            </select>
            <input 
              type="text"
              :value="rule.match?.to?.tag || '*'"
              @input="updateMatchTag('to', 'tag', $event.target.value)"
              placeholder="тег или *"
            />
          </div>
        </div>
      </div>

      <!-- Preview -->
      <div class="transition-preview">
        <div 
          class="preview-from" 
          :style="{ backgroundColor: fromTerrain?.previewColor || fromTerrain?.color || '#333' }"
        >
          {{ fromTerrain?.name || (rule.match?.from && typeof rule.match.from === 'object' ? `${rule.match.from.category}:${rule.match.from.tag}` : '?') }}
        </div>
        <div class="preview-arrow">→</div>
        <div 
          class="preview-to" 
          :style="{ backgroundColor: toTerrain?.previewColor || toTerrain?.color || '#333' }"
        >
          {{ toTerrain?.name || (matchLevel === 'id-to-any' ? 'Любой' : (rule.match?.to && typeof rule.match.to === 'object' ? `${rule.match.to.category}:${rule.match.to.tag}` : '?')) }}
        </div>
      </div>

      <!-- Priority & Z-order -->
      <div class="field-row">
        <div class="field">
          <label>Приоритет</label>
          <input 
            type="number" 
            :value="rule.priority || 100" 
            @input="emit('update', { priority: parseInt($event.target.value) || 100 })"
            min="0"
            max="1000"
          />
        </div>
        <div class="field">
          <label>Z-приоритет</label>
          <select 
            :value="rule.zPriority || 'auto'" 
            @change="emit('update', { zPriority: $event.target.value })"
          >
            <option value="auto">Авто</option>
            <option value="from">«От» сверху</option>
            <option value="to">«К» сверху</option>
          </select>
        </div>
      </div>
    </div>

    <!-- STAGE 1: Line Effects -->
    <div class="editor-section">
      <div class="section-header">
        <span class="section-icon">〰️</span>
        <span class="section-title">Линия</span>
        <span class="section-hint">Деформация границы</span>
        <button class="btn-add-effect" @click="addLineEffect" title="Добавить эффект">+</button>
      </div>

      <div class="effects-list" v-if="rule.lineEffects?.length">
        <div 
          v-for="(effect, index) in rule.lineEffects" 
          :key="index"
          :class="['effect-item', { disabled: !effect.enabled }]"
        >
          <div class="effect-header">
            <input 
              type="checkbox" 
              :checked="effect.enabled"
              @change="toggleLineEffect(index, $event.target.checked)"
            />
            <span class="effect-icon">{{ LINE_EFFECTS[effect.type]?.icon || '?' }}</span>
            <span class="effect-name">{{ LINE_EFFECTS[effect.type]?.name || effect.type }}</span>
            <div class="effect-actions">
              <button v-if="index > 0" @click="moveLineEffect(index, -1)" title="Вверх">↑</button>
              <button v-if="index < rule.lineEffects.length - 1" @click="moveLineEffect(index, 1)" title="Вниз">↓</button>
              <button @click="removeLineEffect(index)" title="Удалить">×</button>
            </div>
          </div>
          <div class="effect-params" v-if="effect.enabled">
            <template v-if="effect.type === 'subdivide'">
              <div class="param">
                <label>Сегментов</label>
                <input type="number" :value="effect.segments" @input="updateLineEffect(index, { segments: parseInt($event.target.value) })" min="2" max="32" />
              </div>
            </template>
            <template v-else-if="effect.type === 'wave'">
              <div class="param">
                <label>Амплитуда</label>
                <input type="range" :value="effect.amplitude" @input="updateLineEffect(index, { amplitude: parseFloat($event.target.value) })" min="0" max="0.3" step="0.01" />
                <span class="param-value">{{ effect.amplitude?.toFixed(2) }}</span>
              </div>
              <div class="param">
                <label>Частота</label>
                <input type="range" :value="effect.frequency" @input="updateLineEffect(index, { frequency: parseFloat($event.target.value) })" min="0.5" max="10" step="0.1" />
                <span class="param-value">{{ effect.frequency?.toFixed(1) }}</span>
              </div>
            </template>
            <template v-else-if="effect.type === 'noise'">
              <div class="param">
                <label>Амплитуда</label>
                <input type="range" :value="effect.amplitude" @input="updateLineEffect(index, { amplitude: parseFloat($event.target.value) })" min="0" max="0.2" step="0.005" />
                <span class="param-value">{{ effect.amplitude?.toFixed(3) }}</span>
              </div>
              <div class="param">
                <label>Масштаб</label>
                <input type="range" :value="effect.scale" @input="updateLineEffect(index, { scale: parseFloat($event.target.value) })" min="0.01" max="1" step="0.01" />
                <span class="param-value">{{ effect.scale?.toFixed(2) }}</span>
              </div>
            </template>
            <template v-else-if="effect.type === 'jagged'">
              <div class="param">
                <label>Амплитуда</label>
                <input type="range" :value="effect.amplitude" @input="updateLineEffect(index, { amplitude: parseFloat($event.target.value) })" min="0" max="0.3" step="0.01" />
                <span class="param-value">{{ effect.amplitude?.toFixed(2) }}</span>
              </div>
              <div class="param">
                <label>Острота</label>
                <input type="range" :value="effect.sharpness" @input="updateLineEffect(index, { sharpness: parseFloat($event.target.value) })" min="0.1" max="1" step="0.1" />
                <span class="param-value">{{ effect.sharpness?.toFixed(1) }}</span>
              </div>
            </template>
            <template v-else-if="effect.type === 'straighten'">
              <div class="param">
                <label>Сила</label>
                <input type="range" :value="effect.strength" @input="updateLineEffect(index, { strength: parseFloat($event.target.value) })" min="0" max="1" step="0.1" />
                <span class="param-value">{{ effect.strength?.toFixed(1) }}</span>
              </div>
              <div class="param">
                <label>Ghost рёбер</label>
                <input type="number" :value="effect.ghostEdges ?? 2" @input="updateLineEffect(index, { ghostEdges: parseInt($event.target.value) })" min="0" max="10" />
              </div>
            </template>
            <template v-else-if="effect.type === 'smooth'">
              <div class="param">
                <label>Итераций</label>
                <input type="number" :value="effect.iterations" @input="updateLineEffect(index, { iterations: parseInt($event.target.value) })" min="1" max="8" />
              </div>
              <div class="param">
                <label>Ghost рёбер</label>
                <input type="number" :value="effect.ghostEdges ?? 2" @input="updateLineEffect(index, { ghostEdges: parseInt($event.target.value) })" min="0" max="10" />
              </div>
            </template>
          </div>
        </div>
      </div>
      <div v-else class="empty-effects">Нет эффектов линии</div>
    </div>

    <!-- STAGE 2: Mask Effects -->
    <div class="editor-section">
      <div class="section-header">
        <span class="section-icon">▓</span>
        <span class="section-title">Маска</span>
        <span class="section-hint">Прозрачность перехода</span>
        <button class="btn-add-effect" @click="addMaskEffect" title="Добавить эффект">+</button>
      </div>

      <div class="effects-list" v-if="rule.maskEffects?.length">
        <div 
          v-for="(effect, index) in rule.maskEffects" 
          :key="index"
          :class="['effect-item', { disabled: !effect.enabled }]"
        >
          <div class="effect-header">
            <input type="checkbox" :checked="effect.enabled" @change="toggleMaskEffect(index, $event.target.checked)" />
            <span class="effect-icon">{{ MASK_EFFECTS[effect.type]?.icon || '?' }}</span>
            <span class="effect-name">{{ MASK_EFFECTS[effect.type]?.name || effect.type }}</span>
            <select class="effect-side" :value="effect.side" @change="updateMaskEffect(index, { side: $event.target.value })">
              <option value="from">← От</option>
              <option value="to">→ К</option>
              <option value="both">↔ Оба</option>
            </select>
            <div class="effect-actions">
              <button v-if="index > 0" @click="moveMaskEffect(index, -1)">↑</button>
              <button v-if="index < rule.maskEffects.length - 1" @click="moveMaskEffect(index, 1)">↓</button>
              <button @click="removeMaskEffect(index)">×</button>
            </div>
          </div>
          <div class="effect-params" v-if="effect.enabled">
            <template v-if="effect.type === 'blend'">
              <div class="param">
                <label>Ширина</label>
                <input type="range" :value="effect.width" @input="updateMaskEffect(index, { width: parseFloat($event.target.value) })" min="0" max="0.5" step="0.01" />
                <span class="param-value">{{ effect.width?.toFixed(2) }}</span>
              </div>
              <div class="param">
                <label>Кривая</label>
                <select :value="effect.curve" @change="updateMaskEffect(index, { curve: $event.target.value })">
                  <option value="linear">Линейная</option>
                  <option value="smooth">Плавная</option>
                  <option value="sharp">Резкая</option>
                </select>
              </div>
            </template>
            <template v-else-if="effect.type === 'scatter'">
              <div class="param">
                <label>Ширина</label>
                <input type="range" :value="effect.width" @input="updateMaskEffect(index, { width: parseFloat($event.target.value) })" min="0" max="0.5" step="0.01" />
                <span class="param-value">{{ effect.width?.toFixed(2) }}</span>
              </div>
              <div class="param">
                <label>Плотность</label>
                <input type="range" :value="effect.density" @input="updateMaskEffect(index, { density: parseFloat($event.target.value) })" min="0" max="1" step="0.1" />
                <span class="param-value">{{ effect.density?.toFixed(1) }}</span>
              </div>
            </template>
            <template v-else-if="effect.type === 'noiseBlend'">
              <div class="param">
                <label>Ширина</label>
                <input type="range" :value="effect.width" @input="updateMaskEffect(index, { width: parseFloat($event.target.value) })" min="0" max="0.5" step="0.01" />
                <span class="param-value">{{ effect.width?.toFixed(2) }}</span>
              </div>
              <div class="param">
                <label>Контраст</label>
                <input type="range" :value="effect.contrast" @input="updateMaskEffect(index, { contrast: parseFloat($event.target.value) })" min="0" max="1" step="0.1" />
                <span class="param-value">{{ effect.contrast?.toFixed(1) }}</span>
              </div>
            </template>
          </div>
        </div>
      </div>
      <div v-else class="empty-effects">Нет эффектов маски</div>
    </div>

    <!-- STAGE 3: Draw Effects -->
    <div class="editor-section">
      <div class="section-header">
        <span class="section-icon">✨</span>
        <span class="section-title">Рисование</span>
        <span class="section-hint">Тени, обводки, свечение</span>
        <button class="btn-add-effect" @click="addDrawEffect" title="Добавить эффект">+</button>
      </div>

      <div class="effects-list" v-if="rule.drawEffects?.length">
        <div 
          v-for="(effect, index) in rule.drawEffects" 
          :key="index"
          :class="['effect-item', { disabled: !effect.enabled }]"
        >
          <div class="effect-header">
            <input type="checkbox" :checked="effect.enabled" @change="toggleDrawEffect(index, $event.target.checked)" />
            <span class="effect-icon">{{ DRAW_EFFECTS[effect.type]?.icon || '?' }}</span>
            <span class="effect-name">{{ DRAW_EFFECTS[effect.type]?.name || effect.type }}</span>
            <select class="effect-side" :value="effect.side" @change="updateDrawEffect(index, { side: $event.target.value })">
              <option value="from">← От</option>
              <option value="to">→ К</option>
              <option value="both">↔ Оба</option>
              <option value="center">⊙ Центр</option>
            </select>
            <div class="effect-actions">
              <button v-if="index > 0" @click="moveDrawEffect(index, -1)">↑</button>
              <button v-if="index < rule.drawEffects.length - 1" @click="moveDrawEffect(index, 1)">↓</button>
              <button @click="removeDrawEffect(index)">×</button>
            </div>
          </div>
          <div class="effect-params" v-if="effect.enabled">
            <template v-if="effect.type === 'shadow'">
              <div class="param">
                <label>Ширина</label>
                <input type="range" :value="effect.width" @input="updateDrawEffect(index, { width: parseFloat($event.target.value) })" min="0" max="0.2" step="0.01" />
                <span class="param-value">{{ effect.width?.toFixed(2) }}</span>
              </div>
              <div class="param">
                <label>Прозрачность</label>
                <input type="range" :value="effect.opacity" @input="updateDrawEffect(index, { opacity: parseFloat($event.target.value) })" min="0" max="1" step="0.05" />
                <span class="param-value">{{ effect.opacity?.toFixed(2) }}</span>
              </div>
            </template>
            <template v-else-if="effect.type === 'glow'">
              <div class="param">
                <label>Ширина</label>
                <input type="range" :value="effect.width" @input="updateDrawEffect(index, { width: parseFloat($event.target.value) })" min="0" max="0.2" step="0.01" />
                <span class="param-value">{{ effect.width?.toFixed(2) }}</span>
              </div>
              <div class="param">
                <label>Цвет</label>
                <input type="color" :value="effect.color" @input="updateDrawEffect(index, { color: $event.target.value })" />
              </div>
              <div class="param">
                <label>Интенсивность</label>
                <input type="range" :value="effect.intensity" @input="updateDrawEffect(index, { intensity: parseFloat($event.target.value) })" min="0" max="1" step="0.05" />
                <span class="param-value">{{ effect.intensity?.toFixed(2) }}</span>
              </div>
            </template>
            <template v-else-if="effect.type === 'stroke'">
              <div class="param">
                <label>Ширина</label>
                <input type="range" :value="effect.width" @input="updateDrawEffect(index, { width: parseFloat($event.target.value) })" min="0" max="0.1" step="0.005" />
                <span class="param-value">{{ effect.width?.toFixed(3) }}</span>
              </div>
              <div class="param">
                <label>Цвет</label>
                <input type="color" :value="effect.color" @input="updateDrawEffect(index, { color: $event.target.value })" />
              </div>
            </template>
            <template v-else-if="effect.type === 'highlight'">
              <div class="param">
                <label>Ширина</label>
                <input type="range" :value="effect.width" @input="updateDrawEffect(index, { width: parseFloat($event.target.value) })" min="0" max="0.1" step="0.005" />
                <span class="param-value">{{ effect.width?.toFixed(3) }}</span>
              </div>
              <div class="param">
                <label>Цвет</label>
                <input type="color" :value="effect.color" @input="updateDrawEffect(index, { color: $event.target.value })" />
              </div>
            </template>
          </div>
        </div>
      </div>
      <div v-else class="empty-effects">Нет эффектов рисования</div>
    </div>
  </div>

  <!-- Effect Type Picker Modal -->
  <Teleport to="body">
    <div v-if="showEffectPicker" class="effect-picker-overlay" @click="closeEffectPicker">
      <div class="effect-picker" @click.stop>
        <div class="effect-picker-header">
          <span>{{ effectPickerTitle }}</span>
          <button @click="closeEffectPicker">×</button>
        </div>
        <div class="effect-picker-list">
          <button 
            v-for="(def, type) in effectPickerOptions" 
            :key="type"
            class="effect-picker-item"
            @click="selectEffectType(type)"
          >
            <span class="picker-icon">{{ def.icon }}</span>
            <span class="picker-name">{{ def.name }}</span>
            <span class="picker-desc">{{ def.description }}</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed } from 'vue'
import { 
  LINE_EFFECTS, 
  MASK_EFFECTS, 
  DRAW_EFFECTS,
  createLineEffect,
  createMaskEffect,
  createDrawEffect,
} from '@/stores/threeAssets'

const props = defineProps({
  rule: { type: Object, required: true },
  terrains: { type: Array, default: () => [] },
})

const emit = defineEmits(['update'])

// Effect picker state
const showEffectPicker = ref(false)
const effectPickerMode = ref(null)
const effectPickerTitle = computed(() => {
  const titles = { line: 'Добавить эффект линии', mask: 'Добавить эффект маски', draw: 'Добавить эффект рисования' }
  return titles[effectPickerMode.value] || ''
})
const effectPickerOptions = computed(() => {
  const options = { line: LINE_EFFECTS, mask: MASK_EFFECTS, draw: DRAW_EFFECTS }
  return options[effectPickerMode.value] || {}
})

const matchLevel = computed(() => props.rule.match?.level || 'id-to-id')
const fromTerrain = computed(() => typeof props.rule.match?.from === 'string' ? props.terrains.find(t => t.id === props.rule.match.from) : null)
const toTerrain = computed(() => typeof props.rule.match?.to === 'string' ? props.terrains.find(t => t.id === props.rule.match.to) : null)

function updateMatch(updates) {
  const newMatch = { ...props.rule.match, ...updates }
  if (updates.level) {
    if (['id-to-id', 'id-to-any', 'id-to-tag'].includes(updates.level)) {
      if (typeof newMatch.from === 'object') newMatch.from = null
    } else {
      if (typeof newMatch.from === 'string') newMatch.from = { category: 'surface', tag: '*' }
    }
    if (updates.level === 'id-to-id') {
      if (typeof newMatch.to === 'object') newMatch.to = null
    } else if (updates.level !== 'id-to-any') {
      if (typeof newMatch.to === 'string') newMatch.to = { category: 'surface', tag: '*' }
    }
  }
  emit('update', { match: newMatch })
}

function updateMatchTag(field, prop, value) {
  const current = props.rule.match?.[field] || { category: 'surface', tag: '*' }
  updateMatch({ [field]: { ...current, [prop]: value } })
}

// Line Effects
function addLineEffect() { effectPickerMode.value = 'line'; showEffectPicker.value = true }
function toggleLineEffect(i, enabled) { const e = [...props.rule.lineEffects]; e[i] = { ...e[i], enabled }; emit('update', { lineEffects: e }) }
function updateLineEffect(i, u) { const e = [...props.rule.lineEffects]; e[i] = { ...e[i], ...u }; emit('update', { lineEffects: e }) }
function moveLineEffect(i, d) { const e = [...props.rule.lineEffects]; const [r] = e.splice(i, 1); e.splice(i + d, 0, r); emit('update', { lineEffects: e }) }
function removeLineEffect(i) { const e = [...props.rule.lineEffects]; e.splice(i, 1); emit('update', { lineEffects: e }) }

// Mask Effects  
function addMaskEffect() { effectPickerMode.value = 'mask'; showEffectPicker.value = true }
function toggleMaskEffect(i, enabled) { const e = [...props.rule.maskEffects]; e[i] = { ...e[i], enabled }; emit('update', { maskEffects: e }) }
function updateMaskEffect(i, u) { const e = [...props.rule.maskEffects]; e[i] = { ...e[i], ...u }; emit('update', { maskEffects: e }) }
function moveMaskEffect(i, d) { const e = [...props.rule.maskEffects]; const [r] = e.splice(i, 1); e.splice(i + d, 0, r); emit('update', { maskEffects: e }) }
function removeMaskEffect(i) { const e = [...props.rule.maskEffects]; e.splice(i, 1); emit('update', { maskEffects: e }) }

// Draw Effects
function addDrawEffect() { effectPickerMode.value = 'draw'; showEffectPicker.value = true }
function toggleDrawEffect(i, enabled) { const e = [...props.rule.drawEffects]; e[i] = { ...e[i], enabled }; emit('update', { drawEffects: e }) }
function updateDrawEffect(i, u) { const e = [...props.rule.drawEffects]; e[i] = { ...e[i], ...u }; emit('update', { drawEffects: e }) }
function moveDrawEffect(i, d) { const e = [...props.rule.drawEffects]; const [r] = e.splice(i, 1); e.splice(i + d, 0, r); emit('update', { drawEffects: e }) }
function removeDrawEffect(i) { const e = [...props.rule.drawEffects]; e.splice(i, 1); emit('update', { drawEffects: e }) }

// Effect picker
function closeEffectPicker() { showEffectPicker.value = false; effectPickerMode.value = null }
function selectEffectType(type) {
  const mode = effectPickerMode.value
  closeEffectPicker()
  if (mode === 'line') { const e = createLineEffect(type); if (e) emit('update', { lineEffects: [...(props.rule.lineEffects || []), e] }) }
  else if (mode === 'mask') { const e = createMaskEffect(type); if (e) emit('update', { maskEffects: [...(props.rule.maskEffects || []), e] }) }
  else if (mode === 'draw') { const e = createDrawEffect(type); if (e) emit('update', { drawEffects: [...(props.rule.drawEffects || []), e] }) }
}
</script>

<style scoped>
.rule-editor { padding: 12px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; max-height: 100%; }
.editor-section { background: #1a1a3a; border-radius: 8px; padding: 12px; }
.section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #2a2a4a; }
.section-icon { font-size: 16px; }
.section-title { font-weight: 600; color: #e0e0e0; }
.section-hint { font-size: 11px; color: #666; flex: 1; }
.btn-add-effect { width: 24px; height: 24px; border: none; border-radius: 4px; background: #3a3a5a; color: #aaa; font-size: 16px; cursor: pointer; }
.btn-add-effect:hover { background: #4a4a7a; color: #fff; }
.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.field label { font-size: 11px; color: #888; font-weight: 500; }
.field input[type="text"], .field input[type="number"], .field select { padding: 6px 8px; background: #12122a; border: 1px solid #2a2a4a; border-radius: 4px; color: #e0e0e0; font-size: 13px; }
.field input:focus, .field select:focus { outline: none; border-color: #4a4a7a; }
.field-row { display: flex; gap: 12px; }
.field-row .field { flex: 1; }
.match-row { display: flex; align-items: flex-end; gap: 12px; }
.match-field { flex: 1; }
.match-arrow { font-size: 20px; color: #666; padding-bottom: 8px; }
.tag-select { display: flex; gap: 4px; }
.tag-select select { flex: 1; padding: 6px; background: #12122a; border: 1px solid #2a2a4a; border-radius: 4px; color: #e0e0e0; font-size: 12px; }
.tag-select input { width: 60px; padding: 6px; background: #12122a; border: 1px solid #2a2a4a; border-radius: 4px; color: #e0e0e0; font-size: 12px; }
.any-marker { padding: 6px 8px; background: #2a2a4a; border-radius: 4px; color: #888; font-size: 13px; font-style: italic; }
.transition-preview { display: flex; align-items: center; gap: 8px; padding: 10px; background: #12122a; border-radius: 4px; margin-top: 8px; }
.preview-from, .preview-to { flex: 1; padding: 10px; border-radius: 4px; text-align: center; font-size: 11px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.preview-arrow { font-size: 18px; color: #666; }
.effects-list { display: flex; flex-direction: column; gap: 8px; }
.effect-item { background: #12122a; border-radius: 6px; padding: 8px; }
.effect-item.disabled { opacity: 0.5; }
.effect-header { display: flex; align-items: center; gap: 8px; }
.effect-header input[type="checkbox"] { margin: 0; }
.effect-icon { font-size: 14px; }
.effect-name { flex: 1; font-size: 13px; color: #ccc; }
.effect-side { padding: 2px 6px; background: #2a2a4a; border: 1px solid #3a3a5a; border-radius: 3px; color: #aaa; font-size: 11px; }
.effect-actions { display: flex; gap: 4px; }
.effect-actions button { width: 20px; height: 20px; border: none; border-radius: 3px; background: #2a2a4a; color: #888; font-size: 12px; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; }
.effect-actions button:hover { background: #3a3a5a; color: #fff; }
.effect-params { margin-top: 8px; padding-top: 8px; border-top: 1px solid #2a2a4a; }
.param { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.param label { width: 80px; font-size: 11px; color: #888; flex-shrink: 0; }
.param input[type="range"] { flex: 1; height: 4px; background: #2a2a4a; border-radius: 2px; appearance: none; }
.param input[type="range"]::-webkit-slider-thumb { appearance: none; width: 12px; height: 12px; background: #5a5a8a; border-radius: 50%; cursor: pointer; }
.param input[type="number"] { width: 60px; padding: 4px 6px; background: #2a2a4a; border: 1px solid #3a3a5a; border-radius: 3px; color: #e0e0e0; font-size: 12px; }
.param input[type="color"] { width: 40px; height: 24px; padding: 0; border: none; border-radius: 3px; cursor: pointer; }
.param select { flex: 1; padding: 4px 6px; background: #2a2a4a; border: 1px solid #3a3a5a; border-radius: 3px; color: #e0e0e0; font-size: 12px; }
.param-value { min-width: 45px; text-align: right; font-size: 11px; color: #888; font-family: monospace; }
.empty-effects { padding: 16px; text-align: center; color: #555; font-size: 12px; font-style: italic; }
.effect-picker-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 10000; }
.effect-picker { background: #1a1a3a; border-radius: 12px; min-width: 300px; max-width: 400px; max-height: 80vh; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.5); }
.effect-picker-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #12122a; border-bottom: 1px solid #2a2a4a; }
.effect-picker-header span { font-weight: 600; color: #e0e0e0; }
.effect-picker-header button { width: 28px; height: 28px; border: none; border-radius: 6px; background: #2a2a4a; color: #888; font-size: 18px; cursor: pointer; }
.effect-picker-header button:hover { background: #3a3a5a; color: #fff; }
.effect-picker-list { padding: 8px; overflow-y: auto; max-height: 60vh; }
.effect-picker-item { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 12px; border: none; border-radius: 6px; background: transparent; cursor: pointer; text-align: left; }
.effect-picker-item:hover { background: #2a2a4a; }
.picker-icon { font-size: 20px; width: 30px; text-align: center; }
.picker-name { font-weight: 500; color: #e0e0e0; min-width: 100px; }
.picker-desc { font-size: 11px; color: #888; flex: 1; }
</style>
