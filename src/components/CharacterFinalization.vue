<template>
  <div class="finalization-step">
    <div class="content-wrapper">
      <!-- Title -->
      <div class="text-center mb-8">
        <h2 class="text-3xl font-bold text-slate-100 mb-2">Последние штрихи</h2>
        <p class="text-slate-400">Выберите имя и портрет для вашего персонажа</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Left: Name and Selected Portrait -->
        <div class="space-y-6">
          <!-- Name Input -->
          <div class="input-card">
            <label class="input-label">
              <Icon icon="mdi:account" class="w-5 h-5" />
              Имя персонажа
            </label>
            <input
              v-model="characterName"
              type="text"
              placeholder="Введите имя..."
              maxlength="50"
              class="name-input"
              @input="emit('update:name', characterName)"
            />
            <div class="char-counter">
              {{ characterName.length }} / 50
            </div>
          </div>

          <!-- Selected Portrait Preview -->
          <div class="preview-card">
            <h3 class="preview-title">
              <Icon icon="mdi:image" class="w-5 h-5" />
              Выбранный портрет
            </h3>
            <div class="selected-portrait-container">
              <img
                v-if="selectedPortrait"
                :src="presetUrl(selectedPortrait)"
                :alt="`Портрет ${selectedPortrait}`"
                class="selected-portrait-image"
              />
              <div v-else class="no-portrait-placeholder">
                <Icon icon="mdi:account-circle" class="w-24 h-24 text-slate-600" />
                <p class="text-slate-500 text-sm mt-2">Выберите портрет</p>
              </div>
            </div>
            <div v-if="selectedPortrait" class="portrait-number">
              #{{ selectedPortrait }}
            </div>
          </div>
        </div>

        <!-- Right: Portrait Grid -->
        <div class="portraits-section">
          <div class="portraits-header">
            <h3 class="portraits-title">
              <Icon icon="mdi:view-grid" class="w-5 h-5" />
              Галерея портретов
            </h3>
            <div class="portraits-count">
              {{ totalPortraits }} доступно
            </div>
          </div>

          <div class="portraits-grid-container">
            <div class="portraits-grid">
              <div
                v-for="num in totalPortraits"
                :key="num"
                @click="selectPortrait(num)"
                class="portrait-card"
                :class="{ selected: selectedPortrait === num }"
              >
                <img
                  :src="presetUrl(num)"
                  :alt="`Портрет ${num}`"
                  class="portrait-image"
                  loading="lazy"
                />
                <div v-if="selectedPortrait === num" class="portrait-check">
                  <Icon icon="mdi:check-circle" class="w-6 h-6" />
                </div>
                <div class="portrait-overlay">
                  <span class="portrait-num">#{{ num }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Summary -->
      <div v-if="characterName && selectedPortrait" class="summary-card">
        <Icon icon="mdi:check-circle" class="w-6 h-6 text-emerald-400" />
        <div class="summary-text">
          <span class="text-slate-300">Персонаж</span>
          <strong class="text-slate-100">{{ characterName }}</strong>
          <span class="text-slate-300">готов к созданию!</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { presetUrl } from '@/utils/assets'

const props = defineProps({
  name: {
    type: String,
    default: ''
  },
  portrait: {
    type: Number,
    default: null
  }
})

const emit = defineEmits(['update:name', 'update:portrait'])

const characterName = ref(props.name || '')
const selectedPortrait = ref(props.portrait || null)
const totalPortraits = 96

// Watch for external changes
watch(() => props.name, (newVal) => {
  characterName.value = newVal
})

watch(() => props.portrait, (newVal) => {
  selectedPortrait.value = newVal
})

const selectPortrait = (num) => {
  selectedPortrait.value = num
  emit('update:portrait', num)
}
</script>

<style scoped>
.finalization-step {
  padding: 2rem 1.5rem;
}

.content-wrapper {
  max-width: 1400px;
  margin: 0 auto;
}

.input-card {
  background: rgba(30, 41, 59, 0.3);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 1.5rem;
}

.input-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 0.75rem;
  font-size: 1rem;
}

.name-input {
  width: 100%;
  padding: 0.875rem 1rem;
  background: rgba(15, 23, 42, 0.5);
  border: 2px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  color: #e2e8f0;
  font-size: 1.125rem;
  font-weight: 500;
  transition: all 0.2s;
  outline: none;
}

.name-input:focus {
  border-color: rgba(56, 189, 248, 0.6);
  background: rgba(15, 23, 42, 0.8);
}

.name-input::placeholder {
  color: #64748b;
}

.char-counter {
  text-align: right;
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 0.5rem;
}

.preview-card {
  background: rgba(30, 41, 59, 0.3);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 1.5rem;
}

.preview-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 1rem;
  font-size: 1rem;
}

.selected-portrait-container {
  width: 100%;
  aspect-ratio: 1;
  background: rgba(15, 23, 42, 0.5);
  border: 2px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.selected-portrait-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-portrait-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.portrait-number {
  text-align: center;
  margin-top: 0.75rem;
  font-size: 0.875rem;
  color: #94a3b8;
  font-weight: 600;
}

.portraits-section {
  background: rgba(30, 41, 59, 0.3);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.75rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
}

.portraits-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.portraits-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  color: #e2e8f0;
  font-size: 1rem;
}

.portraits-count {
  font-size: 0.875rem;
  color: #64748b;
  font-weight: 500;
}

.portraits-grid-container {
  flex: 1;
  overflow-y: auto;
  max-height: 600px;
  padding-right: 0.5rem;
}

.portraits-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 0.75rem;
}

.portrait-card {
  position: relative;
  aspect-ratio: 1;
  border-radius: 0.5rem;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid rgba(148, 163, 184, 0.2);
  transition: all 0.2s;
  background: rgba(15, 23, 42, 0.5);
}

.portrait-card:hover {
  border-color: rgba(148, 163, 184, 0.4);
  transform: scale(1.05);
  z-index: 10;
}

.portrait-card.selected {
  border-color: rgba(16, 185, 129, 0.8);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

.portrait-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portrait-check {
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
  color: #10b981;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5));
}

.portrait-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
  padding: 0.5rem 0.375rem 0.25rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.portrait-card:hover .portrait-overlay {
  opacity: 1;
}

.portrait-num {
  font-size: 0.75rem;
  color: white;
  font-weight: 600;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 0.75rem;
  margin-top: 2rem;
}

.summary-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.125rem;
}

/* Scrollbar styling */
.portraits-grid-container::-webkit-scrollbar {
  width: 8px;
}

.portraits-grid-container::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.3);
  border-radius: 4px;
}

.portraits-grid-container::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 4px;
}

.portraits-grid-container::-webkit-scrollbar-thumb:hover {
  background: rgba(148, 163, 184, 0.5);
}

@media (max-width: 1024px) {
  .portraits-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  }
}

@media (max-width: 640px) {
  .portraits-grid {
    grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
    gap: 0.5rem;
  }
}
</style>
