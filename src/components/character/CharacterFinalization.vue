<template>
  <div class="finalization-step">
    <!-- Name input row -->
    <div class="flex gap-4 items-start mb-6">
      <!-- Portrait preview -->
      <div class="portrait-block">
        <div class="portrait-preview">
          <img
            v-if="customPortrait"
            :src="customPortrait"
            alt="Свой портрет"
            class="portrait-img"
          />
          <img
            v-else-if="selectedPortrait"
            :src="presetUrl(selectedPortrait)"
            :alt="`Портрет ${selectedPortrait}`"
            class="portrait-img"
          />
          <div v-else class="portrait-placeholder">
            <Icon icon="mdi:account-circle" class="w-12 h-12 text-slate-600" />
          </div>
        </div>
        
        <!-- Upload button -->
        <button @click="triggerUpload" class="upload-btn">
          <Icon icon="mdi:upload" class="w-4 h-4" />
          Загрузить
        </button>
        
        <!-- Clear custom -->
        <button
          v-if="customPortrait"
          @click="clearCustomPortrait"
          class="clear-btn"
        >
          Убрать
        </button>
        
        <!-- Hidden file input -->
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleFileUpload"
        />
      </div>

      <!-- Name input -->
      <div class="flex-1">
        <input
          v-model="characterName"
          type="text"
          placeholder="Имя персонажа"
          maxlength="50"
          class="name-input"
          @input="emit('update:name', characterName)"
        />
        <div class="name-hint">
          {{ characterName.length < 2 ? 'Минимум 2 символа' : '' }}
        </div>
      </div>
      
      <!-- Ready indicator -->
      <div v-if="isValid" class="ready-badge">
        <Icon icon="mdi:check-circle" class="w-5 h-5" />
      </div>
    </div>

    <!-- Collapsible gallery -->
    <div class="gallery-section">
      <button @click="galleryOpen = !galleryOpen" class="gallery-toggle">
        <Icon 
          :icon="galleryOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'" 
          class="w-5 h-5" 
        />
        <span>Выбрать из готовых вариантов</span>
        <span class="text-slate-500 text-sm">({{ totalPortraits }})</span>
      </button>
      
      <Transition name="slide">
        <div v-if="galleryOpen" class="gallery-container">
          <div class="gallery-grid">
            <div
              v-for="num in totalPortraits"
              :key="num"
              @click="selectPortrait(num)"
              class="gallery-item"
              :class="{ selected: selectedPortrait === num && !customPortrait }"
            >
              <img
                :src="presetUrl(num)"
                :alt="`Портрет ${num}`"
                loading="lazy"
              />
              <div v-if="selectedPortrait === num && !customPortrait" class="check-icon">
                <Icon icon="mdi:check" class="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { Icon } from '@iconify/vue'
import { presetUrl } from '@/utils/assets'

const props = defineProps({
  name: {
    type: String,
    default: ''
  },
  portrait: {
    type: [Number, String],
    default: null
  }
})

const emit = defineEmits(['update:name', 'update:portrait'])

const characterName = ref(props.name || '')
const selectedPortrait = ref(typeof props.portrait === 'number' ? props.portrait : null)
const customPortrait = ref(typeof props.portrait === 'string' ? props.portrait : null)
const totalPortraits = 96
const fileInput = ref(null)
const galleryOpen = ref(false)

const isValid = computed(() => {
  const hasName = characterName.value.trim().length >= 2
  const hasPortrait = selectedPortrait.value !== null || customPortrait.value !== null
  return hasName && hasPortrait
})

// Watch for external changes
watch(() => props.name, (newVal) => {
  characterName.value = newVal
})

watch(() => props.portrait, (newVal) => {
  if (typeof newVal === 'number') {
    selectedPortrait.value = newVal
    customPortrait.value = null
  } else if (typeof newVal === 'string') {
    customPortrait.value = newVal
    selectedPortrait.value = null
  }
})

const selectPortrait = (num) => {
  selectedPortrait.value = num
  customPortrait.value = null
  emit('update:portrait', num)
  galleryOpen.value = false // Close gallery after selection
}

const triggerUpload = () => {
  fileInput.value?.click()
}

const handleFileUpload = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  
  // Validate file size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    alert('Файл слишком большой. Максимум 2 МБ.')
    return
  }
  
  const reader = new FileReader()
  reader.onload = (e) => {
    customPortrait.value = e.target.result
    selectedPortrait.value = null
    emit('update:portrait', e.target.result)
  }
  reader.readAsDataURL(file)
}

const clearCustomPortrait = () => {
  customPortrait.value = null
  fileInput.value.value = ''
  // Restore previous preset or clear
  if (selectedPortrait.value) {
    emit('update:portrait', selectedPortrait.value)
  } else {
    emit('update:portrait', null)
  }
}
</script>

<style scoped>
.finalization-step {
  padding: 0;
}

.portrait-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.portrait-preview {
  width: 80px;
  height: 80px;
  border-radius: 0.5rem;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.5);
  border: 2px solid rgba(148, 163, 184, 0.3);
}

.portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.portrait-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.upload-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.75rem;
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.3);
  border-radius: 0.375rem;
  color: #7dd3fc;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s;
}

.upload-btn:hover {
  background: rgba(56, 189, 248, 0.25);
}

.clear-btn {
  font-size: 0.7rem;
  color: #64748b;
  background: none;
  border: none;
  cursor: pointer;
}

.clear-btn:hover {
  color: #f87171;
}

.name-input {
  width: 100%;
  padding: 0.75rem 1rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 0.5rem;
  color: #e2e8f0;
  font-size: 1.125rem;
  outline: none;
  transition: border-color 0.2s;
}

.name-input:focus {
  border-color: rgba(56, 189, 248, 0.5);
}

.name-input::placeholder {
  color: #64748b;
}

.name-hint {
  height: 1.25rem;
  font-size: 0.75rem;
  color: #f59e0b;
  margin-top: 0.25rem;
}

.ready-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(16, 185, 129, 0.2);
  border-radius: 50%;
  color: #10b981;
  flex-shrink: 0;
  margin-top: 0.5rem;
}

.gallery-section {
  border-top: 1px solid rgba(148, 163, 184, 0.1);
  padding-top: 1rem;
}

.gallery-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem;
  background: rgba(30, 41, 59, 0.3);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 0.5rem;
  color: #94a3b8;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.gallery-toggle:hover {
  background: rgba(30, 41, 59, 0.5);
  color: #e2e8f0;
}

.gallery-container {
  margin-top: 1rem;
  max-height: 400px;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 0.5rem;
}

.gallery-item {
  aspect-ratio: 1;
  border-radius: 0.375rem;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.15s;
  position: relative;
}

.gallery-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery-item:hover {
  border-color: rgba(148, 163, 184, 0.4);
  transform: scale(1.05);
  z-index: 1;
}

.gallery-item.selected {
  border-color: #10b981;
}

.check-icon {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  background: #10b981;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.slide-enter-from,
.slide-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
}

.slide-enter-to,
.slide-leave-from {
  max-height: 500px;
  opacity: 1;
}

/* Scrollbar */
.gallery-container::-webkit-scrollbar {
  width: 6px;
}

.gallery-container::-webkit-scrollbar-track {
  background: rgba(15, 23, 42, 0.3);
  border-radius: 3px;
}

.gallery-container::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.3);
  border-radius: 3px;
}

@media (max-width: 640px) {
  .portrait-preview {
    width: 64px;
    height: 64px;
  }
  
  .gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  }
}
</style>
