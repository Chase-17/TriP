import { defineStore } from 'pinia'
import { requestWakeLock, releaseWakeLock, isWakeLockActive } from '@/utils/wakeLock'

/**
 * Стор пользовательских настроек интерфейса
 * 
 * Отвечает за:
 * - Настройки отображения UI
 * - Предпочтения управления
 * - Системные функции (wake lock и т.д.)
 */
export const useUserPrefsStore = defineStore('userPrefs', {
  state: () => ({
    // === Системные функции ===
    // Не гасить экран (wake lock)
    keepScreenAwake: false,
    
    // === Настройки отображения ===
    // Компактный режим интерфейса
    compactMode: false,
    
    // Показывать подсказки для новичков
    showTutorialHints: true,
    
    // Размер шрифта: 'small' | 'normal' | 'large'
    fontSize: 'normal',
    
    // Анимации интерфейса
    enableAnimations: true,
    
    // === Настройки карты боя ===
    // Показывать сетку на карте
    showBattleGrid: true,
    
    // Показывать координаты на карте
    showGridCoordinates: false,
    
    // Зум по умолчанию
    defaultMapZoom: 1.0,
    
    // === Настройки управления ===
    // Управление касанием: 'tap' | 'hold' | 'swipe'
    touchControlMode: 'tap',
    
    // Подтверждать действия
    confirmActions: true,
    
    // === Настройки звука ===
    // Звуки интерфейса
    enableSounds: true,
    
    // Громкость (0-1)
    soundVolume: 0.7
  }),
  
  persist: {
    key: 'trip-user-prefs',
    // Сохраняем все настройки
    paths: [
      'keepScreenAwake',
      'compactMode',
      'showTutorialHints',
      'fontSize',
      'enableAnimations',
      'showBattleGrid',
      'showGridCoordinates',
      'defaultMapZoom',
      'touchControlMode',
      'confirmActions',
      'enableSounds',
      'soundVolume'
    ]
  },
  
  getters: {
    // Проверка, активен ли wake lock сейчас
    isScreenAwake: () => isWakeLockActive()
  },
  
  actions: {
    /**
     * Включить/выключить режим "не гасить экран"
     */
    async toggleKeepScreenAwake() {
      if (this.keepScreenAwake) {
        await releaseWakeLock()
        this.keepScreenAwake = false
      } else {
        const success = await requestWakeLock()
        if (success) {
          this.keepScreenAwake = true
        }
      }
      return this.keepScreenAwake
    },
    
    /**
     * Восстановить wake lock после перезагрузки страницы
     * Вызывать после взаимодействия пользователя
     */
    async restoreWakeLockIfNeeded() {
      if (this.keepScreenAwake && !isWakeLockActive()) {
        const success = await requestWakeLock()
        if (!success) {
          // Если не удалось восстановить, сбрасываем настройку
          this.keepScreenAwake = false
        }
      }
    },
    
    /**
     * Сбросить все настройки к значениям по умолчанию
     */
    resetToDefaults() {
      this.keepScreenAwake = false
      this.compactMode = false
      this.showTutorialHints = true
      this.fontSize = 'normal'
      this.enableAnimations = true
      this.showBattleGrid = true
      this.showGridCoordinates = false
      this.defaultMapZoom = 1.0
      this.touchControlMode = 'tap'
      this.confirmActions = true
      this.enableSounds = true
      this.soundVolume = 0.7
      
      releaseWakeLock()
    }
  }
})
