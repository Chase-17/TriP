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
    soundVolume: 0.7,
    
    // === AssetManager состояние ===
    assetManager: {
      // Режим превью: 'cluster' | 'map'
      previewMode: 'map',
      // Режим рендера: 'primitive' | 'live' | 'cached'
      renderMode: 'primitive',
      // Показывать сетку
      showGrid: true,
      // Активная вкладка редактора
      editorTab: 'basic',
      // Камера карты
      camera: { x: 150, y: 150, zoom: 1 },
      // Открыто ли окно редактирования
      editorOpen: false,
      // ID редактируемого террейна
      editingTerrainId: null
    },

    // === Three.js Asset Manager Layout ===
    threeAssetManager: {
      // Ширина левой панели в процентах (20-50%)
      leftPanelWidth: 30,
      // Ширина правой панели в процентах (20-50%)
      rightPanelWidth: 30,
      // Режим отображения в 3D превью: '3d' | '2d'
      viewMode: '2d',
      // Камера превью
      camera: { x: 0, z: 0, zoom: 1, phi: Math.PI / 4, theta: 0 },
      // Активная вкладка (terrains, structures, objects, rules, profiles)
      activeTab: 'terrains',
      // ID выбранного элемента
      selectedItemId: null,
      // ID текущего шаблона карты
      currentTemplateId: null,
      // Режим рисования активен
      paintMode: false,
      // ID террейна для рисования
      paintTerrainId: null
    }
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
      'soundVolume',
      'assetManager',
      'threeAssetManager'
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
    },
    
    /**
     * Обновить настройки AssetManager
     */
    updateAssetManager(updates) {
      this.assetManager = { ...this.assetManager, ...updates }
    },
    
    /**
     * Обновить камеру AssetManager
     */
    updateAssetManagerCamera(camera) {
      this.assetManager.camera = { ...this.assetManager.camera, ...camera }
    },

    /**
     * Обновить настройки Three.js Asset Manager
     */
    updateThreeAssetManager(updates) {
      this.threeAssetManager = { ...this.threeAssetManager, ...updates }
    },

    /**
     * Обновить ширину панелей Three.js Asset Manager
     */
    setThreeAssetManagerPanelWidths(leftWidth, rightWidth) {
      this.threeAssetManager.leftPanelWidth = Math.max(20, Math.min(50, leftWidth))
      this.threeAssetManager.rightPanelWidth = Math.max(20, Math.min(50, rightWidth))
    }
  }
})
