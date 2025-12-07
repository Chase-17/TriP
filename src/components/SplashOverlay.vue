<script setup>
/**
 * SplashOverlay - компонент для отображения сплеш-сообщений
 * 
 * Типы:
 * - damage: красный "БАХ!" с числом урона
 * - heal: зелёный эффект исцеления
 * - effect: произвольный эффект с текстом
 * - notification: простое уведомление
 * - image: полноэкранное изображение
 * - note: текстовая заметка (пергамент, письмо и т.д.)
 */
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/stores/session'

const sessionStore = useSessionStore()
const { currentSplash } = storeToRefs(sessionStore)

const dismiss = () => {
  if (currentSplash.value?.dismissible !== false) {
    sessionStore.dismissSplash()
  }
}

// Стили в зависимости от типа
const splashClass = computed(() => {
  if (!currentSplash.value) return ''
  
  const type = currentSplash.value.splashType
  const baseClass = 'splash-overlay'
  
  switch (type) {
    case 'damage':
      return `${baseClass} splash-damage`
    case 'heal':
      return `${baseClass} splash-heal`
    case 'effect':
      return `${baseClass} splash-effect`
    case 'notification':
      return `${baseClass} splash-notification`
    case 'image':
      return `${baseClass} splash-image`
    case 'note':
      return `${baseClass} splash-note`
    default:
      return baseClass
  }
})

// Иконки для урона
const damageIcons = ['💥', '⚔️', '🔥', '⚡', '💀']
const healIcons = ['✨', '💚', '🌿', '💫']

const randomDamageIcon = computed(() => {
  return damageIcons[Math.floor(Math.random() * damageIcons.length)]
})

const randomHealIcon = computed(() => {
  return healIcons[Math.floor(Math.random() * healIcons.length)]
})
</script>

<template>
  <Teleport to="body">
    <Transition name="splash">
      <div
        v-if="currentSplash"
        :class="splashClass"
        @click="dismiss"
      >
        <!-- Урон -->
        <template v-if="currentSplash.splashType === 'damage'">
          <div class="splash-damage-content">
            <div class="damage-icon">{{ randomDamageIcon }}</div>
            <div class="damage-amount">-{{ currentSplash.content?.amount || '?' }}</div>
            <div v-if="currentSplash.content?.source" class="damage-source">
              {{ currentSplash.content.source }}
            </div>
          </div>
        </template>
        
        <!-- Исцеление -->
        <template v-else-if="currentSplash.splashType === 'heal'">
          <div class="splash-heal-content">
            <div class="heal-icon">{{ randomHealIcon }}</div>
            <div class="heal-amount">+{{ currentSplash.content?.amount || '?' }}</div>
          </div>
        </template>
        
        <!-- Эффект -->
        <template v-else-if="currentSplash.splashType === 'effect'">
          <div class="splash-effect-content">
            <div class="effect-text">{{ currentSplash.content }}</div>
          </div>
        </template>
        
        <!-- Уведомление -->
        <template v-else-if="currentSplash.splashType === 'notification'">
          <div class="splash-notification-content">
            <div class="notification-text">{{ currentSplash.content }}</div>
          </div>
        </template>
        
        <!-- Изображение -->
        <template v-else-if="currentSplash.splashType === 'image'">
          <div class="splash-image-content">
            <button
              v-if="currentSplash.dismissible !== false"
              class="image-close-btn"
              @click.stop="dismiss"
            >
              ✕
            </button>
            
            <h2 v-if="currentSplash.content?.title" class="image-title">
              {{ currentSplash.content.title }}
            </h2>
            
            <div class="image-container">
              <img
                :src="currentSplash.content?.url"
                :alt="currentSplash.content?.caption || ''"
                class="splash-img"
              />
            </div>
            
            <p v-if="currentSplash.content?.caption" class="image-caption">
              {{ currentSplash.content.caption }}
            </p>
          </div>
        </template>
        
        <!-- Заметка -->
        <template v-else-if="currentSplash.splashType === 'note'">
          <div 
            class="splash-note-content"
            :class="`note-style-${currentSplash.content?.style || 'parchment'}`"
          >
            <button
              class="note-close-btn"
              @click.stop="dismiss"
            >
              ✕
            </button>
            
            <h2 v-if="currentSplash.content?.title" class="note-title">
              {{ currentSplash.content.title }}
            </h2>
            
            <div class="note-text">
              {{ currentSplash.content?.text }}
            </div>
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.splash-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
}

/* Урон */
.splash-damage {
  background: radial-gradient(circle, rgba(239, 68, 68, 0.3) 0%, rgba(0, 0, 0, 0.7) 100%);
}

.splash-damage-content {
  text-align: center;
  animation: shake 0.5s ease-in-out;
}

.damage-icon {
  font-size: 6rem;
  animation: pulse 0.3s ease-out;
}

.damage-amount {
  font-size: 5rem;
  font-weight: 900;
  color: #ef4444;
  text-shadow: 0 0 20px rgba(239, 68, 68, 0.8), 0 4px 8px rgba(0, 0, 0, 0.5);
  animation: zoomIn 0.2s ease-out;
}

.damage-source {
  font-size: 1.5rem;
  color: #fca5a5;
  margin-top: 0.5rem;
}

/* Исцеление */
.splash-heal {
  background: radial-gradient(circle, rgba(34, 197, 94, 0.2) 0%, rgba(0, 0, 0, 0.5) 100%);
}

.splash-heal-content {
  text-align: center;
  animation: float 0.8s ease-out;
}

.heal-icon {
  font-size: 5rem;
}

.heal-amount {
  font-size: 4rem;
  font-weight: 700;
  color: #22c55e;
  text-shadow: 0 0 20px rgba(34, 197, 94, 0.8);
}

/* Эффект */
.splash-effect {
  background: rgba(0, 0, 0, 0.7);
}

.splash-effect-content {
  text-align: center;
}

.effect-text {
  font-size: 3rem;
  font-weight: 600;
  color: white;
  text-shadow: 0 0 30px currentColor;
}

/* Уведомление */
.splash-notification {
  background: rgba(0, 0, 0, 0.6);
  align-items: flex-start;
  padding-top: 20vh;
}

.splash-notification-content {
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 1rem;
  padding: 2rem 3rem;
  max-width: 80%;
}

.notification-text {
  font-size: 1.5rem;
  color: white;
}

/* Изображение */
.splash-image {
  background: rgba(0, 0, 0, 0.9);
}

.splash-image-content {
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.image-close-btn {
  position: absolute;
  top: -2rem;
  right: -2rem;
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 1.5rem;
  cursor: pointer;
  transition: all 0.2s;
}

.image-close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.image-title {
  font-size: 1.5rem;
  color: white;
  margin-bottom: 1rem;
  text-align: center;
}

.image-container {
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.splash-img {
  max-width: 80vw;
  max-height: 70vh;
  object-fit: contain;
}

.image-caption {
  margin-top: 1rem;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.7);
  font-style: italic;
  text-align: center;
}

/* Заметка */
.splash-note {
  background: rgba(0, 0, 0, 0.8);
}

.splash-note-content {
  max-width: 600px;
  max-height: 80vh;
  padding: 3rem;
  border-radius: 0.5rem;
  position: relative;
  overflow-y: auto;
}

.note-style-parchment {
  background: linear-gradient(to bottom, #f5e6c8 0%, #e8d5a3 100%);
  color: #3d2914;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  font-family: Georgia, serif;
}

.note-style-scroll {
  background: linear-gradient(to right, #d4c4a8 0%, #f0e6d2 10%, #f0e6d2 90%, #d4c4a8 100%);
  color: #2d1b0e;
  font-family: 'Times New Roman', serif;
}

.note-style-letter {
  background: #fefefe;
  color: #1a1a1a;
  border: 1px solid #ddd;
  font-family: 'Courier New', monospace;
}

.note-style-book {
  background: #1e1b18;
  color: #c9b896;
  border: 4px double #8b7355;
  font-family: Georgia, serif;
}

.note-close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.1);
  border: none;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s;
}

.note-close-btn:hover {
  background: rgba(0, 0, 0, 0.2);
}

.note-title {
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
  text-align: center;
  border-bottom: 1px solid currentColor;
  padding-bottom: 0.5rem;
}

.note-text {
  font-size: 1.1rem;
  line-height: 1.8;
  white-space: pre-wrap;
}

/* Анимации */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}

@keyframes pulse {
  0% { transform: scale(0.5); opacity: 0; }
  50% { transform: scale(1.2); }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes zoomIn {
  0% { transform: scale(0); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes float {
  0% { transform: translateY(20px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}

/* Transition */
.splash-enter-active {
  animation: fadeIn 0.2s ease-out;
}

.splash-leave-active {
  animation: fadeOut 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
</style>
