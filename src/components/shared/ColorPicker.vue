<template>
  <div class="color-picker" :class="{ expanded: isExpanded }">
    <!-- Color preview & native picker fallback -->
    <div class="color-preview-row">
      <div 
        class="color-swatch" 
        :style="{ backgroundColor: modelValue }"
        @click="toggleExpand"
        :title="isExpanded ? 'Свернуть' : 'Расширенный выбор'"
      ></div>
      <input 
        type="color" 
        :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)"
        class="native-picker"
      />
      <input 
        type="text" 
        :value="modelValue"
        @input="onHexInput($event.target.value)"
        class="hex-input"
        placeholder="#000000"
        maxlength="7"
      />
    </div>

    <!-- Expanded panel -->
    <div class="expanded-panel" v-if="isExpanded">
      <!-- Mode tabs -->
      <div class="mode-tabs">
        <button 
          :class="{ active: mode === 'rgb' }" 
          @click="mode = 'rgb'"
        >RGB</button>
        <button 
          :class="{ active: mode === 'hsl' }" 
          @click="mode = 'hsl'"
        >HSL</button>
      </div>

      <!-- RGB Mode -->
      <div class="sliders" v-if="mode === 'rgb'">
        <div class="slider-row">
          <label>R</label>
          <input 
            type="range" 
            :value="rgb.r" 
            @input="updateRGB('r', $event.target.value)"
            min="0" max="255" 
            class="slider slider-r"
          />
          <input 
            type="number" 
            :value="rgb.r" 
            @input="updateRGB('r', $event.target.value)"
            min="0" max="255"
            class="num-input"
          />
        </div>
        <div class="slider-row">
          <label>G</label>
          <input 
            type="range" 
            :value="rgb.g" 
            @input="updateRGB('g', $event.target.value)"
            min="0" max="255"
            class="slider slider-g"
          />
          <input 
            type="number" 
            :value="rgb.g" 
            @input="updateRGB('g', $event.target.value)"
            min="0" max="255"
            class="num-input"
          />
        </div>
        <div class="slider-row">
          <label>B</label>
          <input 
            type="range" 
            :value="rgb.b" 
            @input="updateRGB('b', $event.target.value)"
            min="0" max="255"
            class="slider slider-b"
          />
          <input 
            type="number" 
            :value="rgb.b" 
            @input="updateRGB('b', $event.target.value)"
            min="0" max="255"
            class="num-input"
          />
        </div>
      </div>

      <!-- HSL Mode -->
      <div class="sliders" v-if="mode === 'hsl'">
        <div class="slider-row">
          <label>H</label>
          <input 
            type="range" 
            :value="hsl.h" 
            @input="updateHSL('h', $event.target.value)"
            min="0" max="360"
            class="slider slider-h"
          />
          <input 
            type="number" 
            :value="hsl.h" 
            @input="updateHSL('h', $event.target.value)"
            min="0" max="360"
            class="num-input"
          />
        </div>
        <div class="slider-row">
          <label>S</label>
          <input 
            type="range" 
            :value="hsl.s" 
            @input="updateHSL('s', $event.target.value)"
            min="0" max="100"
            class="slider slider-s"
          />
          <input 
            type="number" 
            :value="hsl.s" 
            @input="updateHSL('s', $event.target.value)"
            min="0" max="100"
            class="num-input"
          />
        </div>
        <div class="slider-row">
          <label>L</label>
          <input 
            type="range" 
            :value="hsl.l" 
            @input="updateHSL('l', $event.target.value)"
            min="0" max="100"
            class="slider slider-l"
          />
          <input 
            type="number" 
            :value="hsl.l" 
            @input="updateHSL('l', $event.target.value)"
            min="0" max="100"
            class="num-input"
          />
        </div>
      </div>

      <!-- Alpha slider (if enabled) -->
      <div class="slider-row" v-if="showAlpha">
        <label>A</label>
        <input 
          type="range" 
          :value="alpha * 100" 
          @input="updateAlpha($event.target.value)"
          min="0" max="100"
          class="slider slider-a"
        />
        <input 
          type="number" 
          :value="Math.round(alpha * 100)" 
          @input="updateAlpha($event.target.value)"
          min="0" max="100"
          class="num-input"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: '#808080'
  },
  showAlpha: {
    type: Boolean,
    default: false
  },
  alphaValue: {
    type: Number,
    default: 1.0
  }
})

const emit = defineEmits(['update:modelValue', 'update:alphaValue'])

const isExpanded = ref(false)
const mode = ref('rgb')  // 'rgb' | 'hsl'
const alpha = ref(props.alphaValue)

// Parse hex to RGB
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 128, g: 128, b: 128 }
}

// RGB to hex
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

// RGB to HSL
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h, s, l = (max + min) / 2

  if (max === min) {
    h = s = 0
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  }
}

// HSL to RGB
function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100
  let r, g, b

  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  }
}

// Computed RGB from modelValue
const rgb = computed(() => hexToRgb(props.modelValue))

// Computed HSL from RGB
const hsl = computed(() => rgbToHsl(rgb.value.r, rgb.value.g, rgb.value.b))

function toggleExpand() {
  isExpanded.value = !isExpanded.value
}

function onHexInput(value) {
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
    emit('update:modelValue', value)
  }
}

function updateRGB(channel, value) {
  const newRgb = { ...rgb.value }
  newRgb[channel] = parseInt(value) || 0
  emit('update:modelValue', rgbToHex(newRgb.r, newRgb.g, newRgb.b))
}

function updateHSL(channel, value) {
  const newHsl = { ...hsl.value }
  newHsl[channel] = parseInt(value) || 0
  const newRgb = hslToRgb(newHsl.h, newHsl.s, newHsl.l)
  emit('update:modelValue', rgbToHex(newRgb.r, newRgb.g, newRgb.b))
}

function updateAlpha(value) {
  alpha.value = Math.max(0, Math.min(100, parseInt(value) || 0)) / 100
  emit('update:alphaValue', alpha.value)
}

// Sync alpha from props
watch(() => props.alphaValue, (val) => {
  alpha.value = val
})
</script>

<style scoped>
.color-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.color-preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.color-swatch {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: 2px solid #3a3a5a;
  cursor: pointer;
  transition: transform 0.15s;
}

.color-swatch:hover {
  transform: scale(1.1);
  border-color: #5a5a8a;
}

.native-picker {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  cursor: pointer;
  background: transparent;
}

.native-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.native-picker::-webkit-color-swatch {
  border-radius: 4px;
  border: 1px solid #3a3a5a;
}

.hex-input {
  flex: 1;
  background: #2a2a4a;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  color: #e0e0e0;
  padding: 6px 8px;
  font-family: monospace;
  font-size: 12px;
}

.hex-input:focus {
  outline: none;
  border-color: #5a5a8a;
}

.expanded-panel {
  background: #252540;
  border: 1px solid #3a3a5a;
  border-radius: 6px;
  padding: 10px;
}

.mode-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 10px;
}

.mode-tabs button {
  flex: 1;
  background: #2a2a4a;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  color: #888;
  padding: 4px 8px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}

.mode-tabs button.active {
  background: #3a3a6a;
  color: #e0e0e0;
  border-color: #5a5a9a;
}

.mode-tabs button:hover:not(.active) {
  background: #303050;
}

.sliders {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.slider-row label {
  width: 16px;
  font-size: 11px;
  color: #888;
  font-weight: 600;
}

.slider {
  flex: 1;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  border-radius: 3px;
  outline: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #e0e0e0;
  cursor: pointer;
  border: 2px solid #1a1a2e;
}

.slider-r { background: linear-gradient(to right, #000, #f00); }
.slider-g { background: linear-gradient(to right, #000, #0f0); }
.slider-b { background: linear-gradient(to right, #000, #00f); }
.slider-h { background: linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00); }
.slider-s { background: linear-gradient(to right, #888, currentColor); }
.slider-l { background: linear-gradient(to right, #000, #888, #fff); }
.slider-a { 
  background: linear-gradient(to right, transparent, currentColor),
    repeating-conic-gradient(#808080 0% 25%, #fff 0% 50%) 50% / 8px 8px;
}

.num-input {
  width: 48px;
  background: #2a2a4a;
  border: 1px solid #3a3a5a;
  border-radius: 4px;
  color: #e0e0e0;
  padding: 4px 6px;
  font-size: 11px;
  text-align: center;
}

.num-input:focus {
  outline: none;
  border-color: #5a5a8a;
}

/* Hide number input spinners */
.num-input::-webkit-outer-spin-button,
.num-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.num-input[type=number] {
  -moz-appearance: textfield;
}
</style>
