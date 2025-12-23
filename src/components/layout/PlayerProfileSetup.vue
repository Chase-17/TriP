<script setup>
/**
 * PlayerProfileSetup - модальное окно для настройки профиля игрока
 * Показывается при первом входе в комнату (если профиль не настроен)
 * Позволяет выбрать: имя, иконку (как в монополии), цвет иконки
 */
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import playerIconsData from '@/data/playerIcons.json'

const props = defineProps({
  /** Занятые иконки другими игроками: [{ iconId, colorId, playerName }] */
  takenIcons: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['complete', 'cancel'])

const userStore = useUserStore()
const { nickname, playerIcon, playerColor } = storeToRefs(userStore)

// Локальные значения для редактирования
const localNickname = ref(nickname.value || '')
const localIconId = ref(playerIcon.value || null)
const localColorId = ref(playerColor.value || null)

// Синхронизация при открытии
watch(() => nickname.value, (val) => {
  if (!localNickname.value && val) localNickname.value = val
}, { immediate: true })

// Данные иконок и цветов
const icons = computed(() => playerIconsData.icons)
const colors = computed(() => playerIconsData.colors)

// Проверка, занята ли комбинация иконка + цвет
const isIconTaken = (iconId, colorId) => {
  return props.takenIcons.some(t => t.iconId === iconId && t.colorId === colorId)
}

// Кто занял эту комбинацию
const getTakenBy = (iconId, colorId) => {
  const taken = props.takenIcons.find(t => t.iconId === iconId && t.colorId === colorId)
  return taken?.playerName || null
}

// Выбранная иконка
const selectedIcon = computed(() => {
  return icons.value.find(i => i.id === localIconId.value)
})

// Выбранный цвет
const selectedColor = computed(() => {
  return colors.value.find(c => c.id === localColorId.value)
})

// Валидация формы
const isValid = computed(() => {
  if (!localNickname.value.trim()) return false
  if (!localIconId.value) return false
  if (!localColorId.value) return false
  // Проверяем, не занята ли комбинация
  if (isIconTaken(localIconId.value, localColorId.value)) return false
  return true
})

// Выбор иконки
const selectIcon = (iconId) => {
  localIconId.value = iconId
}

// Выбор цвета
const selectColor = (colorId) => {
  // Если комбинация занята, не разрешаем
  if (localIconId.value && isIconTaken(localIconId.value, colorId)) return
  localColorId.value = colorId
}

// Сохранение профиля
const saveProfile = () => {
  if (!isValid.value) return
  
  userStore.setFullProfile({
    nickname: localNickname.value.trim(),
    playerIcon: localIconId.value,
    playerColor: localColorId.value
  })
  
  emit('complete', {
    nickname: localNickname.value.trim(),
    iconId: localIconId.value,
    colorId: localColorId.value
  })
}

const cancel = () => {
  emit('cancel')
}
</script>

<template>
  <div class="profile-setup-overlay" @click.self="cancel">
    <div class="profile-setup-modal">
      <div class="modal-header">
        <h2 class="modal-title">Настройка профиля</h2>
        <p class="modal-subtitle">Выберите имя, иконку и цвет для игры</p>
      </div>
      
      <!-- Имя -->
      <div class="form-section">
        <label class="section-label">Ваше имя</label>
        <input
          v-model="localNickname"
          type="text"
          placeholder="Введите имя..."
          class="name-input"
          maxlength="20"
        />
      </div>
      
      <!-- Выбор иконки -->
      <div class="form-section">
        <label class="section-label">Выберите фигурку</label>
        <div class="icons-grid">
          <button
            v-for="icon in icons"
            :key="icon.id"
            class="icon-option"
            :class="{ 
              selected: localIconId === icon.id,
              taken: localColorId && isIconTaken(icon.id, localColorId)
            }"
            @click="selectIcon(icon.id)"
            :title="icon.name"
          >
            <span class="icon-emoji">{{ icon.emoji }}</span>
            <span v-if="localColorId && isIconTaken(icon.id, localColorId)" class="taken-badge">
              {{ getTakenBy(icon.id, localColorId)?.slice(0, 1) || '?' }}
            </span>
          </button>
        </div>
      </div>
      
      <!-- Выбор цвета -->
      <div class="form-section">
        <label class="section-label">Выберите цвет</label>
        <div class="colors-grid">
          <button
            v-for="color in colors"
            :key="color.id"
            class="color-option"
            :class="{ 
              selected: localColorId === color.id,
              taken: localIconId && isIconTaken(localIconId, color.id)
            }"
            :style="{ backgroundColor: color.value }"
            @click="selectColor(color.id)"
            :title="localIconId && isIconTaken(localIconId, color.id) 
              ? `Занято: ${getTakenBy(localIconId, color.id)}` 
              : color.name"
          >
            <span v-if="localIconId && isIconTaken(localIconId, color.id)" class="taken-x">✕</span>
          </button>
        </div>
      </div>
      
      <!-- Превью -->
      <div v-if="selectedIcon && selectedColor" class="preview-section">
        <div class="preview-label">Ваша фигурка:</div>
        <div class="preview-icon" :style="{ color: selectedColor.value }">
          <span class="preview-emoji">{{ selectedIcon.emoji }}</span>
          <span class="preview-name">{{ localNickname || 'Игрок' }}</span>
        </div>
      </div>
      
      <!-- Кнопки -->
      <div class="modal-actions">
        <button type="button" class="btn-cancel" @click="cancel">
          Отмена
        </button>
        <button 
          type="button" 
          class="btn-save" 
          :disabled="!isValid"
          @click="saveProfile"
        >
          Начать игру
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-setup-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.profile-setup-modal {
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 16px;
  padding: 24px;
  width: 100%;
  max-width: 420px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-header {
  text-align: center;
  margin-bottom: 24px;
}

.modal-title {
  font-size: 24px;
  font-weight: 700;
  color: #e2e8f0;
  margin: 0 0 8px;
}

.modal-subtitle {
  font-size: 14px;
  color: #94a3b8;
  margin: 0;
}

.form-section {
  margin-bottom: 20px;
}

.section-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.name-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 16px;
  color: #e2e8f0;
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  outline: none;
  transition: border-color 0.2s;
}

.name-input:focus {
  border-color: #3b82f6;
}

.name-input::placeholder {
  color: #475569;
}

.icons-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 8px;
}

.icon-option {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.icon-option:hover {
  background: #334155;
  transform: scale(1.05);
}

.icon-option.selected {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.2);
}

.icon-option.taken {
  opacity: 0.4;
  cursor: not-allowed;
}

.icon-emoji {
  font-size: 20px;
}

.taken-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: 700;
  border-radius: 50%;
}

.colors-grid {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  gap: 8px;
}

.color-option {
  aspect-ratio: 1;
  border: 2px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}

.color-option:hover {
  transform: scale(1.15);
}

.color-option.selected {
  border-color: white;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
}

.color-option.taken {
  opacity: 0.3;
  cursor: not-allowed;
}

.taken-x {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 14px;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.preview-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: #0f172a;
  border-radius: 12px;
  margin-bottom: 20px;
}

.preview-label {
  font-size: 13px;
  color: #64748b;
}

.preview-icon {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preview-emoji {
  font-size: 32px;
  filter: drop-shadow(0 2px 4px currentColor);
}

.preview-name {
  font-size: 16px;
  font-weight: 600;
  color: currentColor;
}

.modal-actions {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  flex: 1;
  padding: 12px;
  font-size: 14px;
  font-weight: 500;
  color: #94a3b8;
  background: transparent;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-cancel:hover {
  background: rgba(148, 163, 184, 0.1);
  color: #e2e8f0;
}

.btn-save {
  flex: 1;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
  color: white;
  background: #3b82f6;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-save:hover:not(:disabled) {
  background: #2563eb;
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Адаптивность для мобильных */
@media (max-width: 480px) {
  .profile-setup-modal {
    margin: 16px;
    padding: 20px;
  }
  
  .icons-grid {
    grid-template-columns: repeat(6, 1fr);
  }
  
  .colors-grid {
    grid-template-columns: repeat(6, 1fr);
  }
  
  .icon-emoji {
    font-size: 18px;
  }
}
</style>
