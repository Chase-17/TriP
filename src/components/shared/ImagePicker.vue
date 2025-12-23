<script setup>
/**
 * ImagePicker - универсальный компонент для выбора изображения
 * Поддерживает:
 * - Выбор из существующих ассетов
 * - Ввод URL
 * - Загрузку файла
 */
import { ref, computed, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { 
  parseImageSource, 
  getImageUrl, 
  fileToBase64, 
  resizeImage,
  isValidImageUrl,
  isBase64Image,
  ImageSourceType
} from '@/utils/images'

const props = defineProps({
  modelValue: { type: [String, Object], default: null },
  category: { type: String, default: 'items' },
  fallbackId: { type: String, default: null },
  size: { type: Number, default: 80 },
  maxFileSize: { type: Number, default: 256 }, // Максимальный размер в пикселях для ресайза
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

const showPicker = ref(false)
const activeTab = ref('url') // 'url' | 'upload' | 'asset'
const urlInput = ref('')
const assetIdInput = ref('')
const isLoading = ref(false)
const error = ref('')

// Текущий URL для отображения
const currentUrl = computed(() => {
  return getImageUrl(props.modelValue, props.category, props.fallbackId)
})

// Определяем текущий тип источника
const currentSourceType = computed(() => {
  const parsed = parseImageSource(props.modelValue, props.category)
  return parsed?.type || ImageSourceType.ASSET
})

// Открыть picker
const openPicker = () => {
  if (props.disabled) return
  
  const parsed = parseImageSource(props.modelValue, props.category)
  
  if (parsed?.type === ImageSourceType.URL) {
    activeTab.value = 'url'
    urlInput.value = parsed.value
  } else if (parsed?.type === ImageSourceType.BASE64) {
    activeTab.value = 'upload'
  } else {
    activeTab.value = 'asset'
    assetIdInput.value = props.fallbackId || ''
  }
  
  error.value = ''
  showPicker.value = true
}

// Закрыть picker
const closePicker = () => {
  showPicker.value = false
  error.value = ''
}

// Применить URL
const applyUrl = async () => {
  const url = urlInput.value.trim()
  if (!url) {
    error.value = 'Введите URL'
    return
  }
  
  if (!isValidImageUrl(url)) {
    error.value = 'Некорректный URL'
    return
  }
  
  isLoading.value = true
  error.value = ''
  
  try {
    // Проверяем, что изображение загружается
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = () => reject(new Error('Не удалось загрузить изображение'))
      img.src = url
    })
    
    emit('update:modelValue', url)
    closePicker()
  } catch (e) {
    error.value = e.message || 'Ошибка загрузки'
  } finally {
    isLoading.value = false
  }
}

// Применить asset ID
const applyAssetId = () => {
  const id = assetIdInput.value.trim()
  if (!id) {
    error.value = 'Введите ID'
    return
  }
  emit('update:modelValue', id)
  closePicker()
}

// Обработка загрузки файла
const onFileSelect = async (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  
  if (!file.type.startsWith('image/')) {
    error.value = 'Выберите изображение'
    return
  }
  
  isLoading.value = true
  error.value = ''
  
  try {
    const base64 = await fileToBase64(file)
    // Ресайзим до максимального размера
    const resized = await resizeImage(base64, props.maxFileSize, props.maxFileSize, 'image/png', 0.9)
    emit('update:modelValue', resized)
    closePicker()
  } catch (e) {
    error.value = 'Ошибка обработки изображения'
  } finally {
    isLoading.value = false
  }
}

// Сбросить к дефолту
const resetToDefault = () => {
  emit('update:modelValue', null)
  closePicker()
}

// Триггер input file
const fileInputRef = ref(null)
const triggerFileInput = () => {
  fileInputRef.value?.click()
}
</script>

<template>
  <div class="image-picker">
    <!-- Preview -->
    <div 
      class="picker-preview" 
      :style="{ width: size + 'px', height: size + 'px' }"
      :class="{ disabled }"
      @click="openPicker"
    >
      <img v-if="currentUrl" :src="currentUrl" alt="Preview" />
      <Icon v-else icon="mdi:image-plus" class="placeholder-icon" />
      <div class="edit-overlay">
        <Icon icon="mdi:pencil" />
      </div>
      <div v-if="currentSourceType === 'base64'" class="source-badge uploaded">
        <Icon icon="mdi:upload" />
      </div>
      <div v-else-if="currentSourceType === 'url'" class="source-badge external">
        <Icon icon="mdi:link" />
      </div>
    </div>
    
    <!-- Picker Modal -->
    <Teleport to="body">
      <div v-if="showPicker" class="picker-overlay" @click.self="closePicker">
        <div class="picker-modal">
          <div class="picker-header">
            <h4>Выбор изображения</h4>
            <button @click="closePicker" class="close-btn">
              <Icon icon="mdi:close" />
            </button>
          </div>
          
          <!-- Tabs -->
          <div class="picker-tabs">
            <button 
              :class="{ active: activeTab === 'url' }" 
              @click="activeTab = 'url'"
            >
              <Icon icon="mdi:link" />URL
            </button>
            <button 
              :class="{ active: activeTab === 'upload' }" 
              @click="activeTab = 'upload'"
            >
              <Icon icon="mdi:upload" />Загрузить
            </button>
            <button 
              :class="{ active: activeTab === 'asset' }" 
              @click="activeTab = 'asset'"
            >
              <Icon icon="mdi:folder-image" />Файл игры
            </button>
          </div>
          
          <div class="picker-body">
            <!-- URL Tab -->
            <div v-if="activeTab === 'url'" class="tab-content">
              <div class="input-group">
                <input 
                  v-model="urlInput" 
                  type="url" 
                  placeholder="https://example.com/image.png"
                  @keyup.enter="applyUrl"
                />
                <button @click="applyUrl" :disabled="isLoading" class="apply-btn">
                  <Icon v-if="isLoading" icon="mdi:loading" class="spin" />
                  <Icon v-else icon="mdi:check" />
                </button>
              </div>
              <p class="hint">Вставьте прямую ссылку на изображение</p>
            </div>
            
            <!-- Upload Tab -->
            <div v-if="activeTab === 'upload'" class="tab-content">
              <input 
                ref="fileInputRef"
                type="file" 
                accept="image/*" 
                @change="onFileSelect"
                style="display: none"
              />
              <button @click="triggerFileInput" class="upload-btn" :disabled="isLoading">
                <Icon v-if="isLoading" icon="mdi:loading" class="spin" />
                <Icon v-else icon="mdi:cloud-upload" />
                <span>Выбрать файл</span>
              </button>
              <p class="hint">PNG, JPG, WebP. Будет сжато до {{ maxFileSize }}×{{ maxFileSize }}px</p>
            </div>
            
            <!-- Asset Tab -->
            <div v-if="activeTab === 'asset'" class="tab-content">
              <div class="input-group">
                <input 
                  v-model="assetIdInput" 
                  type="text" 
                  :placeholder="`ID (например: ${fallbackId || 'iron_sword'})`"
                  @keyup.enter="applyAssetId"
                />
                <button @click="applyAssetId" class="apply-btn">
                  <Icon icon="mdi:check" />
                </button>
              </div>
              <p class="hint">Файл: /images/{{ category }}/{ID}.png</p>
            </div>
            
            <!-- Error -->
            <div v-if="error" class="error-msg">
              <Icon icon="mdi:alert-circle" />{{ error }}
            </div>
          </div>
          
          <div class="picker-footer">
            <button @click="resetToDefault" class="reset-btn">
              <Icon icon="mdi:restore" />По умолчанию
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.image-picker {
  display: inline-block;
}

.picker-preview {
  position: relative;
  border-radius: 0.5rem;
  overflow: hidden;
  cursor: pointer;
  background: rgba(15, 23, 42, 0.5);
  border: 2px dashed rgba(100, 116, 139, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.picker-preview:hover {
  border-color: #3b82f6;
}
.picker-preview.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.picker-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.picker-preview .placeholder-icon {
  font-size: 2rem;
  color: #475569;
}
.picker-preview .edit-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  color: white;
  font-size: 1.25rem;
}
.picker-preview:hover .edit-overlay {
  opacity: 1;
}

.source-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
}
.source-badge.uploaded {
  background: #22c55e;
  color: white;
}
.source-badge.external {
  background: #3b82f6;
  color: white;
}

/* Modal */
.picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.picker-modal {
  background: #1e293b;
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.75rem;
  width: 100%;
  max-width: 360px;
  overflow: hidden;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(100, 116, 139, 0.2);
}
.picker-header h4 {
  margin: 0;
  font-size: 0.95rem;
  color: #f1f5f9;
}
.close-btn {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 0.25rem;
  display: flex;
  font-size: 1.25rem;
}
.close-btn:hover {
  color: #f1f5f9;
}

.picker-tabs {
  display: flex;
  border-bottom: 1px solid rgba(100, 116, 139, 0.2);
}
.picker-tabs button {
  flex: 1;
  padding: 0.625rem 0.5rem;
  background: none;
  border: none;
  color: #64748b;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}
.picker-tabs button:hover {
  color: #f1f5f9;
  background: rgba(100, 116, 139, 0.1);
}
.picker-tabs button.active {
  color: #3b82f6;
  border-bottom-color: #3b82f6;
}

.picker-body {
  padding: 1rem;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.input-group {
  display: flex;
  gap: 0.5rem;
}
.input-group input {
  flex: 1;
  padding: 0.5rem 0.75rem;
  background: rgba(15, 23, 42, 0.5);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.375rem;
  color: #f1f5f9;
  font-size: 0.85rem;
}
.input-group input:focus {
  outline: none;
  border-color: #3b82f6;
}
.apply-btn {
  padding: 0.5rem 0.75rem;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 0.375rem;
  color: #60a5fa;
  cursor: pointer;
  display: flex;
  align-items: center;
}
.apply-btn:hover:not(:disabled) {
  background: rgba(59, 130, 246, 0.3);
}
.apply-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.upload-btn {
  padding: 1rem;
  background: rgba(100, 116, 139, 0.1);
  border: 2px dashed rgba(100, 116, 139, 0.3);
  border-radius: 0.5rem;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  transition: all 0.15s;
}
.upload-btn:hover:not(:disabled) {
  border-color: #3b82f6;
  color: #60a5fa;
}
.upload-btn .iconify {
  font-size: 2rem;
}

.hint {
  font-size: 0.7rem;
  color: #64748b;
  margin: 0;
}

.error-msg {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.5rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.375rem;
  color: #f87171;
  font-size: 0.75rem;
  margin-top: 0.5rem;
}

.picker-footer {
  padding: 0.75rem 1rem;
  border-top: 1px solid rgba(100, 116, 139, 0.2);
  display: flex;
  justify-content: center;
}
.reset-btn {
  padding: 0.375rem 0.75rem;
  background: rgba(100, 116, 139, 0.1);
  border: 1px solid rgba(100, 116, 139, 0.3);
  border-radius: 0.375rem;
  color: #94a3b8;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.reset-btn:hover {
  background: rgba(100, 116, 139, 0.2);
}

.spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
