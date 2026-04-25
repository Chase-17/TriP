<template>
  <div class="rule-editor">
    <!-- Header -->
    <div class="editor-section">
      <div class="field">
        <label>Название</label>
        <input 
          type="text" 
          :value="rule.name" 
          @input="emit('update', { name: $event.target.value })"
          placeholder="Название правила"
        />
      </div>

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
          <IconSelect 
            :modelValue="rule.zPriority || 'auto'"
            @update:modelValue="emit('update', { zPriority: $event })"
            :options="Z_PRIORITY_OPTIONS"
          />
        </div>
      </div>
    </div>

    <!-- Match Configuration -->
    <div class="editor-section">
      <div class="section-header">
        <span class="section-icon">◎</span>
        <span class="section-title">Условие</span>
      </div>

      <div class="match-level-selector">
        <button 
          v-for="opt in MATCH_LEVEL_OPTIONS" 
          :key="opt.value"
          :class="['match-level-btn', { active: matchLevel === opt.value }]"
          @click="updateMatch({ level: opt.value })"
          :title="opt.description"
        >
          {{ opt.label }}
        </button>
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
    </div>

    <!-- STAGE 1: Line Effects -->
    <div class="editor-section">
      <div class="section-header">
        <span class="section-icon">∿</span>
        <span class="section-title">Линия</span>
        <span class="section-hint">Деформация границы</span>
        <div class="add-effect-wrapper">
          <button class="btn-add-effect" @click="toggleDropdown('line')" title="Добавить эффект">+</button>
          <div class="effect-dropdown" v-if="showLineDropdown" v-click-outside="() => showLineDropdown = false">
            <button 
              v-for="(def, type) in LINE_EFFECTS" 
              :key="type"
              class="dropdown-item"
              @click="addEffectOfType('line', type)"
              :title="def.description"
            >
              <span class="dropdown-icon">{{ def.icon }}</span>
              <span class="dropdown-name">{{ def.name }}</span>
            </button>
          </div>
        </div>
      </div>

      <draggable 
        v-if="rule.lineEffects?.length"
        :list="rule.lineEffects"
        item-key="type"
        handle=".effect-header"
        ghost-class="effect-ghost"
        class="effects-list"
        @end="onLineEffectsReorder"
      >
        <template #item="{ element: effect, index }">
          <div :class="['effect-item', { disabled: !effect.enabled }]">
            <div class="effect-header">
              <span class="drag-dots">⋮⋮</span>
              <input 
                type="checkbox" 
                :checked="effect.enabled"
                @change="toggleLineEffect(index, $event.target.checked)"
              />
              <span class="effect-icon">{{ LINE_EFFECTS[effect.type]?.icon || '?' }}</span>
              <span class="effect-name">{{ LINE_EFFECTS[effect.type]?.name || effect.type }}</span>
              <div class="effect-actions">
                <button @click="removeLineEffect(index)" title="Удалить" class="btn-remove">×</button>
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
                  <label>Тип шума</label>
                  <IconSelect 
                    :modelValue="effect.noiseType || 'perlin'"
                    @update:modelValue="updateLineEffect(index, { noiseType: $event })"
                    :options="NOISE_TYPE_OPTIONS"
                  />
                </div>
                <div class="param">
                  <label>Амплитуда</label>
                  <input type="range" :value="effect.amplitude" @input="updateLineEffect(index, { amplitude: parseFloat($event.target.value) })" min="0" max="0.5" step="0.01" />
                  <span class="param-value">{{ effect.amplitude?.toFixed(2) }}</span>
                </div>
                <div class="param">
                  <label>Масштаб</label>
                  <input type="range" :value="effect.scale ?? 0.3" @input="updateLineEffect(index, { scale: parseFloat($event.target.value) })" min="0.05" max="2" step="0.05" />
                  <span class="param-value">{{ (effect.scale ?? 0.3).toFixed(2) }}</span>
                </div>
                <div class="param">
                  <label>Частота</label>
                  <input type="range" :value="effect.frequency" @input="updateLineEffect(index, { frequency: parseFloat($event.target.value) })" min="0.5" max="20" step="0.1" />
                  <span class="param-value">{{ effect.frequency?.toFixed(1) }}</span>
                </div>
                <div class="param">
                  <label>Острота</label>
                  <input type="range" :value="effect.sharpness ?? 0" @input="updateLineEffect(index, { sharpness: parseFloat($event.target.value) })" min="0" max="1" step="0.05" />
                  <span class="param-value">{{ (effect.sharpness ?? 0).toFixed(2) }}</span>
                </div>
                <div class="param">
                  <label>Макс. внутрь</label>
                  <input type="range" :value="effect.maxInward ?? 0.5" @input="updateLineEffect(index, { maxInward: parseFloat($event.target.value) })" min="0" max="1" step="0.05" />
                  <span class="param-value">{{ (effect.maxInward ?? 0.5).toFixed(2) }}</span>
                </div>
                <div class="param">
                  <label>Макс. наружу</label>
                  <input type="range" :value="effect.maxOutward ?? 0.5" @input="updateLineEffect(index, { maxOutward: parseFloat($event.target.value) })" min="0" max="1" step="0.05" />
                  <span class="param-value">{{ (effect.maxOutward ?? 0.5).toFixed(2) }}</span>
                </div>
                <div class="param">
                  <label>Октавы</label>
                  <input type="range" :value="effect.octaves ?? 1" @input="updateLineEffect(index, { octaves: parseInt($event.target.value) })" min="1" max="6" step="1" />
                  <span class="param-value">{{ effect.octaves ?? 1 }}</span>
                </div>
                <template v-if="(effect.octaves ?? 1) > 1">
                  <div class="param">
                    <label>Затухание</label>
                    <input type="range" :value="effect.persistence ?? 0.5" @input="updateLineEffect(index, { persistence: parseFloat($event.target.value) })" min="0.1" max="0.9" step="0.05" />
                    <span class="param-value">{{ (effect.persistence ?? 0.5).toFixed(2) }}</span>
                  </div>
                  <div class="param">
                    <label>Лакунарность</label>
                    <input type="range" :value="effect.lacunarity ?? 2.0" @input="updateLineEffect(index, { lacunarity: parseFloat($event.target.value) })" min="1.5" max="4" step="0.1" />
                    <span class="param-value">{{ (effect.lacunarity ?? 2.0).toFixed(1) }}</span>
                  </div>
                </template>
                <div class="param">
                  <label>Seed</label>
                  <input type="number" :value="effect.seed ?? 0" @input="updateLineEffect(index, { seed: parseInt($event.target.value) })" min="0" max="9999" />
                </div>
              </template>
              <template v-else-if="effect.type === 'noise'">
                <div class="param">
                  <label>Тип шума</label>
                  <IconSelect 
                    :modelValue="effect.noiseType || 'perlin'"
                    @update:modelValue="updateLineEffect(index, { noiseType: $event })"
                    :options="NOISE_TYPE_OPTIONS"
                  />
                </div>
                <div class="param">
                  <label>Амплитуда</label>
                  <input type="range" :value="effect.amplitude" @input="updateLineEffect(index, { amplitude: parseFloat($event.target.value) })" min="0" max="0.3" step="0.005" />
                  <span class="param-value">{{ effect.amplitude?.toFixed(3) }}</span>
                </div>
                <div class="param">
                  <label>Масштаб</label>
                  <input type="range" :value="effect.scale" @input="updateLineEffect(index, { scale: parseFloat($event.target.value) })" min="0.01" max="2" step="0.01" />
                  <span class="param-value">{{ effect.scale?.toFixed(2) }}</span>
                </div>
                <div class="param">
                  <label>Острота</label>
                  <input type="range" :value="effect.sharpness ?? 0" @input="updateLineEffect(index, { sharpness: parseFloat($event.target.value) })" min="0" max="1" step="0.05" />
                  <span class="param-value">{{ (effect.sharpness ?? 0).toFixed(2) }}</span>
                </div>
                <div class="param">
                  <label>Макс. внутрь</label>
                  <input type="range" :value="effect.maxInward ?? 0.3" @input="updateLineEffect(index, { maxInward: parseFloat($event.target.value) })" min="0" max="1" step="0.05" />
                  <span class="param-value">{{ (effect.maxInward ?? 0.3).toFixed(2) }}</span>
                </div>
                <div class="param">
                  <label>Макс. наружу</label>
                  <input type="range" :value="effect.maxOutward ?? 0.3" @input="updateLineEffect(index, { maxOutward: parseFloat($event.target.value) })" min="0" max="1" step="0.05" />
                  <span class="param-value">{{ (effect.maxOutward ?? 0.3).toFixed(2) }}</span>
                </div>
                <div class="param">
                  <label>Октавы</label>
                  <input type="range" :value="effect.octaves ?? 1" @input="updateLineEffect(index, { octaves: parseInt($event.target.value) })" min="1" max="6" step="1" />
                  <span class="param-value">{{ effect.octaves ?? 1 }}</span>
                </div>
                <template v-if="(effect.octaves ?? 1) > 1">
                  <div class="param">
                    <label>Затухание</label>
                    <input type="range" :value="effect.persistence ?? 0.5" @input="updateLineEffect(index, { persistence: parseFloat($event.target.value) })" min="0.1" max="0.9" step="0.05" />
                    <span class="param-value">{{ (effect.persistence ?? 0.5).toFixed(2) }}</span>
                  </div>
                  <div class="param">
                    <label>Лакунарность</label>
                    <input type="range" :value="effect.lacunarity ?? 2.0" @input="updateLineEffect(index, { lacunarity: parseFloat($event.target.value) })" min="1.5" max="4" step="0.1" />
                    <span class="param-value">{{ (effect.lacunarity ?? 2.0).toFixed(1) }}</span>
                  </div>
                </template>
                <div class="param">
                  <label>Seed</label>
                  <input type="number" :value="effect.seed ?? 0" @input="updateLineEffect(index, { seed: parseInt($event.target.value) })" min="0" max="9999" />
                </div>
              </template>
              <template v-else-if="effect.type === 'sine'">
              <div class="param">
                <label>Амплитуда</label>
                <input type="range" :value="effect.amplitude" @input="updateLineEffect(index, { amplitude: parseFloat($event.target.value) })" min="0" max="0.5" step="0.01" />
                <span class="param-value">{{ effect.amplitude?.toFixed(2) }}</span>
              </div>
              <div class="param">
                <label>Длина волны</label>
                <input type="range" :value="effect.wavelength" @input="updateLineEffect(index, { wavelength: parseFloat($event.target.value) })" min="0.05" max="2" step="0.01" />
                <span class="param-value">{{ effect.wavelength?.toFixed(2) }}</span>
              </div>
              <div class="param">
                <label>Фаза</label>
                <input type="range" :value="effect.phase ?? 0" @input="updateLineEffect(index, { phase: parseFloat($event.target.value) })" min="0" max="6.28" step="0.1" />
                <span class="param-value">{{ (effect.phase ?? 0).toFixed(1) }}</span>
              </div>
            </template>
            <template v-else-if="effect.type === 'zigzag'">
              <div class="param">
                <label>Амплитуда</label>
                <input type="range" :value="effect.amplitude" @input="updateLineEffect(index, { amplitude: parseFloat($event.target.value) })" min="0" max="0.5" step="0.01" />
                <span class="param-value">{{ effect.amplitude?.toFixed(2) }}</span>
              </div>
              <div class="param">
                <label>Длина волны</label>
                <input type="range" :value="effect.wavelength" @input="updateLineEffect(index, { wavelength: parseFloat($event.target.value) })" min="0.05" max="2" step="0.01" />
                <span class="param-value">{{ effect.wavelength?.toFixed(2) }}</span>
              </div>
              <div class="param">
                <label>Фаза</label>
                <input type="range" :value="effect.phase ?? 0" @input="updateLineEffect(index, { phase: parseFloat($event.target.value) })" min="0" max="6.28" step="0.1" />
                <span class="param-value">{{ (effect.phase ?? 0).toFixed(1) }}</span>
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
        </template>
      </draggable>
      <div v-else class="empty-effects">Нет эффектов линии</div>
    </div>

    <!-- STAGE 2: Mask Effects -->
    <div class="editor-section">
      <div class="section-header">
        <span class="section-icon">▒</span>
        <span class="section-title">Маска</span>
        <span class="section-hint">Прозрачность перехода</span>
        <div class="add-effect-wrapper">
          <button class="btn-add-effect" @click="toggleDropdown('mask')" title="Добавить эффект">+</button>
          <div class="effect-dropdown" v-if="showMaskDropdown" v-click-outside="() => showMaskDropdown = false">
            <button 
              v-for="(def, type) in MASK_EFFECTS" 
              :key="type"
              class="dropdown-item"
              @click="addEffectOfType('mask', type)"
              :title="def.description"
            >
              <span class="dropdown-icon">{{ def.icon }}</span>
              <span class="dropdown-name">{{ def.name }}</span>
            </button>
          </div>
        </div>
      </div>

      <draggable 
        v-if="rule.maskEffects?.length"
        :list="rule.maskEffects"
        item-key="type"
        handle=".effect-header"
        ghost-class="effect-ghost"
        class="effects-list"
        @end="onMaskEffectsReorder"
      >
        <template #item="{ element: effect, index }">
          <div :class="['effect-item', { disabled: !effect.enabled }]">
            <div class="effect-header">
              <span class="drag-dots">⋮⋮</span>
              <input type="checkbox" :checked="effect.enabled" @change="toggleMaskEffect(index, $event.target.checked)" />
              <span class="effect-icon">{{ MASK_EFFECTS[effect.type]?.icon || '?' }}</span>
              <span class="effect-name">{{ MASK_EFFECTS[effect.type]?.name || effect.type }}</span>
              <IconSelect 
                :modelValue="effect.side || 'from'"
                @update:modelValue="updateMaskEffect(index, { side: $event })"
                :options="SIDE_OPTIONS"
                class="side-select"
              />
              <div class="effect-actions">
                <button @click="removeMaskEffect(index)" class="btn-remove">×</button>
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
                  <IconSelect 
                    :modelValue="effect.curve || 'smooth'"
                    @update:modelValue="updateMaskEffect(index, { curve: $event })"
                    :options="CURVE_OPTIONS"
                  />
                </div>
              </template>
              <template v-else-if="effect.type === 'scatter'">
                <div class="param">
                  <label>Ширина</label>
                  <input type="range" :value="effect.width" @input="updateMaskEffect(index, { width: parseFloat($event.target.value) })" min="0" max="0.5" step="0.01" />
                  <span class="param-value">{{ effect.width?.toFixed(2) }}</span>
                </div>
                <div class="param">
                  <label>Размер зерна</label>
                  <input type="range" :value="effect.noiseScale ?? 0.2" @input="updateMaskEffect(index, { noiseScale: parseFloat($event.target.value) })" min="0.02" max="10" step="0.02" />
                  <span class="param-value">{{ (effect.noiseScale ?? 0.2).toFixed(2) }}</span>
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
                  <label>Размер зерна</label>
                  <input type="range" :value="effect.noiseScale ?? 0.15" @input="updateMaskEffect(index, { noiseScale: parseFloat($event.target.value) })" min="0.02" max="10" step="0.02" />
                  <span class="param-value">{{ (effect.noiseScale ?? 0.15).toFixed(2) }}</span>
                </div>
                <div class="param">
                  <label>Контраст</label>
                  <input type="range" :value="effect.contrast" @input="updateMaskEffect(index, { contrast: parseFloat($event.target.value) })" min="0" max="1" step="0.1" />
                  <span class="param-value">{{ effect.contrast?.toFixed(1) }}</span>
                </div>
              </template>
            </div>
          </div>
        </template>
      </draggable>
      <div v-else class="empty-effects">Нет эффектов маски</div>
    </div>

    <!-- STAGE 3: Draw Effects -->
    <div class="editor-section">
      <div class="section-header">
        <span class="section-icon">◈</span>
        <span class="section-title">Рисование</span>
        <span class="section-hint">Тени, обводки, свечение</span>
        <div class="add-effect-wrapper">
          <button class="btn-add-effect" @click="toggleDropdown('draw')" title="Добавить эффект">+</button>
          <div class="effect-dropdown" v-if="showDrawDropdown" v-click-outside="() => showDrawDropdown = false">
            <button 
              v-for="(def, type) in DRAW_EFFECTS" 
              :key="type"
              class="dropdown-item"
              @click="addEffectOfType('draw', type)"
              :title="def.description"
            >
              <span class="dropdown-icon">{{ def.icon }}</span>
              <span class="dropdown-name">{{ def.name }}</span>
            </button>
          </div>
        </div>
      </div>

      <draggable 
        v-if="rule.drawEffects?.length"
        :list="rule.drawEffects"
        item-key="type"
        handle=".effect-header"
        ghost-class="effect-ghost"
        class="effects-list"
        @end="onDrawEffectsReorder"
      >
        <template #item="{ element: effect, index }">
          <div :class="['effect-item', { disabled: !effect.enabled }]">
            <div class="effect-header">
              <span class="drag-dots">⋮⋮</span>
              <input type="checkbox" :checked="effect.enabled" @change="toggleDrawEffect(index, $event.target.checked)" />
              <span class="effect-icon">{{ DRAW_EFFECTS[effect.type]?.icon || '?' }}</span>
              <span class="effect-name">{{ DRAW_EFFECTS[effect.type]?.name || effect.type }}</span>
              <IconSelect 
                :modelValue="effect.side || 'from'"
                @update:modelValue="updateDrawEffect(index, { side: $event })"
                :options="DRAW_SIDE_OPTIONS"
                class="side-select"
              />
              <div class="effect-actions">
                <button @click="removeDrawEffect(index)" class="btn-remove">×</button>
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
                  <label>Смещение</label>
                  <input type="range" :value="effect.offset ?? 0.02" @input="updateDrawEffect(index, { offset: parseFloat($event.target.value) })" min="-0.1" max="0.1" step="0.005" />
                  <span class="param-value">{{ (effect.offset ?? 0.02).toFixed(3) }}</span>
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
                  <input type="range" :value="effect.width" @input="updateDrawEffect(index, { width: parseFloat($event.target.value) })" min="0" max="0.3" step="0.01" />
                  <span class="param-value">{{ effect.width?.toFixed(2) }}</span>
                </div>
                <div class="param">
                  <label>Цвет</label>
                  <input type="color" :value="effect.color" @input="updateDrawEffect(index, { color: $event.target.value })" />
                </div>
                <div class="param">
                  <label>Прозрачность</label>
                  <input type="range" :value="effect.opacity ?? 0.5" @input="updateDrawEffect(index, { opacity: parseFloat($event.target.value) })" min="0" max="1" step="0.05" />
                  <span class="param-value">{{ (effect.opacity ?? 0.5).toFixed(2) }}</span>
                </div>
              </template>
              <template v-else-if="effect.type === 'stroke'">
                <div class="param">
                  <label>Ширина</label>
                  <input type="range" :value="effect.width" @input="updateDrawEffect(index, { width: parseFloat($event.target.value) })" min="0" max="0.2" step="0.005" />
                  <span class="param-value">{{ effect.width?.toFixed(3) }}</span>
                </div>
                <div class="param">
                  <label>Цвет</label>
                  <input type="color" :value="effect.color" @input="updateDrawEffect(index, { color: $event.target.value })" />
                </div>
                <div class="param">
                  <label>Прозрачность</label>
                  <input type="range" :value="effect.opacity" @input="updateDrawEffect(index, { opacity: parseFloat($event.target.value) })" min="0" max="1" step="0.05" />
                  <span class="param-value">{{ effect.opacity?.toFixed(2) }}</span>
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
        </template>
      </draggable>
      <div v-else class="empty-effects">Нет эффектов рисования</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import draggable from 'vuedraggable'
import IconSelect from '@/components/shared/IconSelect.vue'
import { 
  LINE_EFFECTS, 
  MASK_EFFECTS, 
  DRAW_EFFECTS,
  NOISE_TYPES,
  createLineEffect,
  createMaskEffect,
  createDrawEffect,
} from '@/stores/threeAssets'

// Noise type options for IconSelect
const NOISE_TYPE_OPTIONS = Object.entries(NOISE_TYPES).map(([value, def]) => ({
  value,
  label: def.name,
  icon: def.icon,
}))

const props = defineProps({
  rule: { type: Object, required: true },
  terrains: { type: Array, default: () => [] },
})

const emit = defineEmits(['update'])

// Dropdown states
const showLineDropdown = ref(false)
const showMaskDropdown = ref(false)
const showDrawDropdown = ref(false)

// Click outside directive
const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (event) => {
      if (!(el === event.target || el.contains(event.target))) {
        binding.value(event)
      }
    }
    setTimeout(() => document.addEventListener('click', el._clickOutside), 0)
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutside)
  }
}

// Options for IconSelect
const Z_PRIORITY_OPTIONS = [
  { value: 'auto', label: 'Авто', icon: '⚡' },
  { value: 'from', label: '«От» ↑', icon: '↖' },
  { value: 'to', label: '«К» ↑', icon: '↘' },
]

const SIDE_OPTIONS = [
  { value: 'from', label: 'От', icon: '←' },
  { value: 'to', label: 'К', icon: '→' },
  { value: 'both', label: 'Оба', icon: '↔' },
]

const DRAW_SIDE_OPTIONS = [
  { value: 'from', label: 'От', icon: '←' },
  { value: 'to', label: 'К', icon: '→' },
  { value: 'both', label: 'Оба', icon: '↔' },
  { value: 'center', label: 'Центр', icon: '◯' },
]

const CURVE_OPTIONS = [
  { value: 'linear', label: 'Линейная', icon: '/' },
  { value: 'smooth', label: 'Плавная', icon: 'S' },
  { value: 'sharp', label: 'Резкая', icon: '⌐' },
]

const MATCH_LEVEL_OPTIONS = [
  { value: 'id-to-id', label: 'ID→ID', description: 'Конкретные террейны' },
  { value: 'id-to-any', label: 'ID→*', description: 'Один террейн ко всем' },
  { value: 'id-to-tag', label: 'ID→Тег', description: 'Террейн к группе' },
  { value: 'tag-to-tag', label: 'Тег→Тег', description: 'Группа к группе' },
  { value: 'any-to-any', label: '*→*', description: 'Fallback для всех' },
]

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

// Dropdown toggle
function toggleDropdown(mode) {
  showLineDropdown.value = mode === 'line' ? !showLineDropdown.value : false
  showMaskDropdown.value = mode === 'mask' ? !showMaskDropdown.value : false
  showDrawDropdown.value = mode === 'draw' ? !showDrawDropdown.value : false
}

// Add effect by type
function addEffectOfType(mode, type) {
  showLineDropdown.value = false
  showMaskDropdown.value = false
  showDrawDropdown.value = false
  
  if (mode === 'line') {
    const e = createLineEffect(type)
    if (e) emit('update', { lineEffects: [...(props.rule.lineEffects || []), e] })
  } else if (mode === 'mask') {
    const e = createMaskEffect(type)
    if (e) emit('update', { maskEffects: [...(props.rule.maskEffects || []), e] })
  } else if (mode === 'draw') {
    const e = createDrawEffect(type)
    if (e) emit('update', { drawEffects: [...(props.rule.drawEffects || []), e] })
  }
}

// Drag and Drop reorder handlers (vuedraggable modifies list in-place)
function onLineEffectsReorder() {
  emit('update', { lineEffects: [...props.rule.lineEffects] })
}

function onMaskEffectsReorder() {
  emit('update', { maskEffects: [...props.rule.maskEffects] })
}

function onDrawEffectsReorder() {
  emit('update', { drawEffects: [...props.rule.drawEffects] })
}

// Line Effects
function toggleLineEffect(i, enabled) { const e = [...props.rule.lineEffects]; e[i] = { ...e[i], enabled }; emit('update', { lineEffects: e }) }
function updateLineEffect(i, u) { const e = [...props.rule.lineEffects]; e[i] = { ...e[i], ...u }; emit('update', { lineEffects: e }) }
function removeLineEffect(i) { const e = [...props.rule.lineEffects]; e.splice(i, 1); emit('update', { lineEffects: e }) }

// Mask Effects  
function toggleMaskEffect(i, enabled) { const e = [...props.rule.maskEffects]; e[i] = { ...e[i], enabled }; emit('update', { maskEffects: e }) }
function updateMaskEffect(i, u) { const e = [...props.rule.maskEffects]; e[i] = { ...e[i], ...u }; emit('update', { maskEffects: e }) }
function removeMaskEffect(i) { const e = [...props.rule.maskEffects]; e.splice(i, 1); emit('update', { maskEffects: e }) }

// Draw Effects
function toggleDrawEffect(i, enabled) { const e = [...props.rule.drawEffects]; e[i] = { ...e[i], enabled }; emit('update', { drawEffects: e }) }
function updateDrawEffect(i, u) { const e = [...props.rule.drawEffects]; e[i] = { ...e[i], ...u }; emit('update', { drawEffects: e }) }
function removeDrawEffect(i) { const e = [...props.rule.drawEffects]; e.splice(i, 1); emit('update', { drawEffects: e }) }
</script>

<style scoped>
.rule-editor { padding: 12px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; max-height: 100%; }
.editor-section { background: #1a1a3a; border-radius: 8px; padding: 12px; }
.section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #2a2a4a; position: relative; }
.section-icon { font-size: 14px; color: #8888aa; }
.section-title { font-weight: 600; color: #e0e0e0; }
.section-hint { font-size: 11px; color: #666; flex: 1; }

/* Add effect dropdown */
.add-effect-wrapper { position: relative; }
.btn-add-effect { width: 24px; height: 24px; border: none; border-radius: 4px; background: #3a3a5a; color: #aaa; font-size: 16px; cursor: pointer; }
.btn-add-effect:hover { background: #4a4a7a; color: #fff; }
.effect-dropdown { position: absolute; right: 0; top: 100%; margin-top: 4px; background: #1a1a3a; border: 1px solid #3a3a5a; border-radius: 6px; padding: 4px; z-index: 100; min-width: 160px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
.dropdown-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: none; border-radius: 4px; background: transparent; color: #ccc; cursor: pointer; text-align: left; font-size: 13px; }
.dropdown-item:hover { background: #2a2a5a; color: #fff; }
.dropdown-icon { width: 20px; text-align: center; font-size: 14px; }
.dropdown-name { flex: 1; }

/* Match level buttons */
.match-level-selector { display: flex; gap: 4px; margin-bottom: 12px; }
.match-level-btn { flex: 1; padding: 6px 4px; border: 1px solid #2a2a4a; border-radius: 4px; background: #12122a; color: #888; font-size: 10px; cursor: pointer; transition: all 0.15s; }
.match-level-btn:hover { background: #2a2a4a; color: #aaa; }
.match-level-btn.active { background: #3a3a6a; border-color: #5a5a8a; color: #fff; }

/* Fields */
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

/* Effects list */
.effects-list { display: flex; flex-direction: column; gap: 8px; }
.effect-item { background: #12122a; border-radius: 6px; padding: 8px; transition: all 0.15s; }
.effect-item.disabled { opacity: 0.5; }
.effect-header { display: flex; align-items: center; gap: 8px; cursor: grab; user-select: none; }
.effect-header:active { cursor: grabbing; }
.effect-header input[type="checkbox"] { margin: 0; cursor: pointer; }
.drag-dots { color: #555; font-size: 12px; padding: 0 2px; }
.effect-header:hover .drag-dots { color: #888; }
.effect-icon { font-size: 14px; width: 20px; text-align: center; }
.effect-name { flex: 1; font-size: 13px; color: #ccc; }
.side-select { margin-right: 4px; }
.effect-actions { display: flex; gap: 4px; }
.effect-actions button { width: 20px; height: 20px; border: none; border-radius: 3px; background: #2a2a4a; color: #888; font-size: 12px; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; }
.effect-actions button:hover { background: #3a3a5a; color: #fff; }
.effect-actions .btn-remove:hover { background: #5a3a3a; color: #faa; }

/* Effect params */
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

/* Drag and drop (vuedraggable) */
.effect-ghost {
  opacity: 0.4;
  background: #3a3a6a !important;
  border: 2px dashed #5a5a8a;
}
.sortable-drag {
  opacity: 0.9;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}
</style>
