/**
 * Store для управления взаимодействием с картой
 * 
 * Унифицированная система (slingshot):
 * 1. Клик/тап на токен → выбор, показ зоны движения
 * 2. Клик на гекс в зоне → показ пути
 * 3. Drag от гекса (slingshot) → выбор направления противоположно драгу
 * 4. Отпускание → подтверждение хода с выбранным facing
 * 5. Drag от текущей позиции токена → поворот на месте
 * 
 * Preview:
 * - Ghost token на целевом гексе показывает facing и defense
 * - При повороте на месте оригинальный токен показывает новый facing
 * 
 * Мастер дополнительно:
 * - Drag токена → мгновенное перемещение
 */

import { defineStore } from 'pinia'

// Состояния взаимодействия
export const INTERACTION_STATE = {
  IDLE: 'idle',                          // Ничего не выбрано
  TOKEN_SELECTED: 'token-selected',      // Выбран токен, показана зона движения
  PATH_SHOWN: 'path-shown',              // Показан путь к гексу
  DRAGGING_FACING: 'dragging-facing',    // Drag для выбора направления (slingshot)
  DRAGGING_TOKEN: 'dragging-token',      // Drag токена (мастер)
}

// Зоны для drag
export const DRAG_ZONE = {
  CENTER: 'center',           // В центре гекса — подтверждение с auto-facing
  DIRECTION: 'direction',     // Вне центра — выбор направления
  CANCEL: 'cancel',           // Слишком далеко — отмена
}

// Радиусы зон (в пикселях, относительно размера гекса)
const CENTER_ZONE_RATIO = 0.3       // 30% от радиуса гекса — центральная зона
const DIRECTION_ZONE_RATIO = 1.5    // 150% — зона выбора направления  
const CANCEL_ZONE_RATIO = 3.0       // 300% — зона отмены

export const useInteractionStore = defineStore('interaction', {
  state: () => ({
    // Текущее состояние
    state: INTERACTION_STATE.IDLE,
    
    // Выбранный токен (characterId)
    selectedTokenId: null,
    
    // Позиция выбранного токена { q, r }
    selectedTokenPosition: null,
    
    // Целевой гекс для пути { q, r }
    targetHex: null,
    
    // Текущий путь (массив гексов)
    currentPath: null,
    
    // Предложенное направление (вычислено из последнего шага пути, 0-11)
    suggestedFacing: null,
    
    // Выбранное пользователем направление (при drag, 0-11 или null)
    selectedFacing: null,
    
    // Состояние drag
    dragState: {
      isActive: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      zone: DRAG_ZONE.CENTER,  // Текущая зона drag
      source: null,             // 'path-end' | 'token'
    },
    
    // Для отображения превью защитных зон
    showDefencePreview: false,
    defencePreviewFacing: null,
    
    // Режим мастера
    isMasterMode: false,
    
    // Состояние правой панели управления боем
    battlePanelExpanded: false,
  }),
  
  getters: {
    // Есть ли выбранный токен
    hasSelection: (state) => state.selectedTokenId !== null,
    
    // Показывать ли зону движения
    showMovementRange: (state) => 
      state.state === INTERACTION_STATE.TOKEN_SELECTED ||
      state.state === INTERACTION_STATE.PATH_SHOWN ||
      state.state === INTERACTION_STATE.DRAGGING_FACING,
    
    // Показывать ли путь
    showPath: (state) =>
      state.state === INTERACTION_STATE.PATH_SHOWN ||
      state.state === INTERACTION_STATE.DRAGGING_FACING,
    
    // Финальное направление для перемещения
    finalFacing: (state) => state.selectedFacing ?? state.suggestedFacing ?? 0,
    
    // Можно ли подтвердить перемещение
    canConfirmMove: (state) =>
      state.state === INTERACTION_STATE.PATH_SHOWN &&
      state.targetHex !== null,
    
    // Находимся ли в режиме drag
    isDragging: (state) => state.dragState.isActive,
  },
  
  actions: {
    /**
     * Сбросить состояние к IDLE
     */
    reset() {
      this.state = INTERACTION_STATE.IDLE
      this.selectedTokenId = null
      this.selectedTokenPosition = null
      this.targetHex = null
      this.currentPath = null
      this.suggestedFacing = null
      this.selectedFacing = null
      this.dragState = {
        isActive: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        zone: DRAG_ZONE.CENTER,
        source: null,
      }
      this.showDefencePreview = false
      this.defencePreviewFacing = null
    },
    
    /**
     * Выбрать токен
     * @param {string} tokenId - ID персонажа
     * @param {Object} position - позиция токена { q, r }
     * @param {boolean} isOwn - свой ли токен (или мастер)
     */
    selectToken(tokenId, position, isOwn = true) {
      // Если кликнули на уже выбранный токен — снимаем выделение
      if (this.selectedTokenId === tokenId && this.state !== INTERACTION_STATE.IDLE) {
        this.reset()
        return false
      }
      
      this.selectedTokenId = tokenId
      this.selectedTokenPosition = position ? { ...position } : null
      this.targetHex = null
      this.currentPath = null
      this.suggestedFacing = null
      this.selectedFacing = null
      
      // Если свой токен — показываем зону движения
      if (isOwn && position) {
        this.state = INTERACTION_STATE.TOKEN_SELECTED
      } else {
        // Чужой токен — просто выбран для просмотра
        this.state = INTERACTION_STATE.TOKEN_SELECTED
      }
      
      return true
    },
    
    /**
     * Установить путь к гексу
     * @param {Object} hex - целевой гекс { q, r }
     * @param {Array} path - массив гексов пути
     * @param {number} suggestedFacing - предложенное направление из последнего шага
     */
    setPath(hex, path, suggestedFacing) {
      // Если кликнули на тот же гекс, где уже показан путь
      if (this.state === INTERACTION_STATE.PATH_SHOWN &&
          this.targetHex?.q === hex.q && this.targetHex?.r === hex.r) {
        // Это повторный клик — вернуть true для подтверждения перемещения
        return { action: 'confirm', facing: this.finalFacing }
      }
      
      this.targetHex = { ...hex }
      this.currentPath = path ? [...path] : null
      this.suggestedFacing = suggestedFacing ?? 0
      this.selectedFacing = null
      this.state = INTERACTION_STATE.PATH_SHOWN
      
      return { action: 'show' }
    },
    
    /**
     * Начать drag
     * @param {number} x - экранная координата X
     * @param {number} y - экранная координата Y
     * @param {string} source - источник drag: 'path-end' | 'token'
     */
    startDrag(x, y, source) {
      this.dragState = {
        isActive: true,
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
        zone: DRAG_ZONE.CENTER,
        source,
      }
      
      if (source === 'path-end') {
        this.state = INTERACTION_STATE.DRAGGING_FACING
        this.showDefencePreview = true
      } else if (source === 'token') {
        this.state = INTERACTION_STATE.DRAGGING_TOKEN
      }
    },
    
    /**
     * Обновить позицию drag
     * @param {number} x - экранная координата X
     * @param {number} y - экранная координата Y
     * @param {number} hexRadius - радиус гекса в пикселях для вычисления зон
     * @param {Object} anchorPos - центр якорной точки (в экранных координатах)
     */
    updateDrag(x, y, hexRadius, anchorPos) {
      if (!this.dragState.isActive) return null
      
      this.dragState.currentX = x
      this.dragState.currentY = y
      
      // Вычисляем расстояние от центра
      const dx = x - anchorPos.x
      const dy = y - anchorPos.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      
      // Определяем зону
      const centerRadius = hexRadius * CENTER_ZONE_RATIO
      const directionRadius = hexRadius * DIRECTION_ZONE_RATIO
      const cancelRadius = hexRadius * CANCEL_ZONE_RATIO
      
      let zone = DRAG_ZONE.CENTER
      if (distance > cancelRadius) {
        zone = DRAG_ZONE.CANCEL
      } else if (distance > centerRadius) {
        zone = DRAG_ZONE.DIRECTION
      }
      
      this.dragState.zone = zone
      
      // Если в зоне направления — вычисляем facing
      if (zone === DRAG_ZONE.DIRECTION) {
        // Угол от центра
        let angle = Math.atan2(dy, dx) * (180 / Math.PI)
        // Нормализуем к 0-360
        while (angle < 0) angle += 360
        
        // Вычисляем facing (0-11) с учётом ориентации карты
        // Это будет сделано в компоненте, здесь просто сохраняем угол
        return { zone, angle, distance }
      }
      
      return { zone, angle: null, distance }
    },
    
    /**
     * Установить выбранное направление
     * @param {number} facing - направление 0-11
     */
    setFacing(facing) {
      this.selectedFacing = facing
      this.defencePreviewFacing = facing
    },
    
    /**
     * Завершить drag
     * @returns {Object} - результат: { action, facing, cancelled }
     */
    endDrag() {
      if (!this.dragState.isActive) return null
      
      const { zone, source } = this.dragState
      const facing = this.selectedFacing ?? this.suggestedFacing ?? 0
      
      let result
      
      if (zone === DRAG_ZONE.CANCEL) {
        // Отмена
        result = { action: 'cancel', cancelled: true }
        // Сбрасываем путь но оставляем токен выбранным
        this.targetHex = null
        this.currentPath = null
        this.suggestedFacing = null
        this.selectedFacing = null
        this.state = this.selectedTokenId ? INTERACTION_STATE.TOKEN_SELECTED : INTERACTION_STATE.IDLE
      } else if (source === 'path-end') {
        // Подтверждение перемещения
        result = { action: 'move', facing }
      }
      
      // Сбрасываем drag state
      this.dragState = {
        isActive: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        zone: DRAG_ZONE.CENTER,
        source: null,
      }
      this.showDefencePreview = false
      
      return result
    },
    
    /**
     * Отменить текущее действие (ESC, клик вне)
     */
    cancel() {
      if (this.state === INTERACTION_STATE.DRAGGING_FACING) {
        this.endDrag()
      } else if (this.state === INTERACTION_STATE.PATH_SHOWN) {
        // Убираем путь, оставляем выбор токена
        this.targetHex = null
        this.currentPath = null
        this.suggestedFacing = null
        this.selectedFacing = null
        this.state = this.selectedTokenId ? INTERACTION_STATE.TOKEN_SELECTED : INTERACTION_STATE.IDLE
      } else {
        this.reset()
      }
    },
    
    /**
     * Установить режим мастера
     */
    setMasterMode(isMaster) {
      this.isMasterMode = isMaster
    },
    
    /**
     * Получить расстояние от начала drag до текущей позиции
     * @returns {number} расстояние в пикселях
     */
    getDragDistance() {
      if (!this.dragState.isActive) return 0
      const dx = this.dragState.currentX - this.dragState.startX
      const dy = this.dragState.currentY - this.dragState.startY
      return Math.sqrt(dx * dx + dy * dy)
    },
    
    /**
     * Получить конфигурацию зон drag
     */
    getDragZoneConfig(hexRadius) {
      return {
        centerRadius: hexRadius * CENTER_ZONE_RATIO,
        directionRadius: hexRadius * DIRECTION_ZONE_RATIO,
        cancelRadius: hexRadius * CANCEL_ZONE_RATIO,
      }
    },
    
    /**
     * Переключить состояние правой панели боя
     */
    toggleBattlePanel() {
      this.battlePanelExpanded = !this.battlePanelExpanded
    },
    
    /**
     * Установить состояние правой панели боя
     */
    setBattlePanelExpanded(expanded) {
      this.battlePanelExpanded = expanded
    },
  },
})
