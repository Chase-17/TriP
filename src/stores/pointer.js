/**
 * Store для указки и временных меток на карте
 * 
 * Функционал:
 * - Указка мастера (курсор виден всем)
 * - Пинг-метки (временные маркеры с анимацией)
 * - Свободное рисование
 * - Синхронизация через PeerJS
 */

import { defineStore } from 'pinia'
import { useSessionStore } from './session'

// Типы элементов на карте
export const POINTER_TOOLS = {
  NONE: 'none',
  POINTER: 'pointer',     // Указка (курсор виден всем)
  PING: 'ping',           // Пинг-метка
  DRAW: 'draw',           // Свободное рисование
  ARROW: 'arrow',         // Стрелка
  CIRCLE: 'circle',       // Круг
  CONE: 'cone',           // Конус
  LINE: 'line',           // Линия
  MEASURE: 'measure',     // Измерение расстояния
  RANGE: 'range'          // Зона досягаемости
}

// Цвета для меток
export const POINTER_COLORS = {
  RED: '#ef4444',
  ORANGE: '#f97316',
  YELLOW: '#eab308',
  GREEN: '#22c55e',
  BLUE: '#3b82f6',
  PURPLE: '#a855f7',
  WHITE: '#ffffff'
}

// Время жизни пинга (мс)
const PING_LIFETIME = 3000
const PING_ANIMATION_DURATION = 500

// Время жизни рисунка (мс) - 0 = бессрочно до очистки
const DRAWING_LIFETIME = 0

export const usePointerStore = defineStore('pointer', {
  state: () => ({
    // Текущий инструмент
    activeTool: POINTER_TOOLS.NONE,
    
    // Цвет для рисования
    activeColor: POINTER_COLORS.YELLOW,
    
    // Позиция указки мастера (world coordinates)
    masterPointer: null, // { x, y, time }
    
    // Активные пинги
    pings: [], // [{ id, x, y, color, time, lifetime }]
    
    // Линии рисунка
    drawings: [], // [{ id, points: [{x, y}], color, width, time }]
    
    // Текущая рисуемая линия
    currentDrawing: null, // { points: [{x, y}], color, width }
    
    // Фигуры (стрелки, круги, конусы)
    shapes: [], // [{ id, type, start: {x,y}, end: {x,y}, color, time }]
    
    // Текущая рисуемая фигура
    currentShape: null,
    
    // Измерение расстояния
    measurement: null, // { start: {x, y, q, r}, end: {x, y, q, r}, path: [{q, r}] }
    
    // Зона досягаемости (для инструмента мастера)
    rangeDisplay: null, // { center: {q, r}, radius: number, hexes: [{q, r, cost}] }
    
    // Зона движения персонажа (при выборе своего токена)
    movementRange: null, // { characterId, center: {q, r}, hexes: [{q, r, cost}], maxCost }
    
    // Путь при наведении/выборе гекса (визуализация маршрута)
    // segments: массив сегментов с разными типами ресурсов
    // Каждый сегмент: { type: 'movement'|'surge1'|'surge2'|...|'unreachable', 
    //                   path: [{q, r, cost}], startCost, endCost }
    hoveredPath: null, // { segments: [], totalCost, targetHex: {q, r}, resources: {}, suggestedFacing, selectedFacing }
    
    // Автоочистка рисунков (секунды, 0 = выкл)
    autoCleanupSeconds: 0,
    
    // Толщина линии
    lineWidth: 3,
    
    // Показывать указку игрокам
    showPointerToPlayers: true
  }),
  
  getters: {
    isToolActive: (state) => state.activeTool !== POINTER_TOOLS.NONE,
    
    // Все активные пинги (фильтруем просроченные)
    activePings: (state) => {
      const now = Date.now()
      return state.pings.filter(p => now - p.time < p.lifetime)
    },
    
    // Все рисунки (фильтруем просроченные если включена автоочистка)
    activeDrawings: (state) => {
      if (state.autoCleanupSeconds === 0) return state.drawings
      
      const now = Date.now()
      const lifetime = state.autoCleanupSeconds * 1000
      return state.drawings.filter(d => now - d.time < lifetime)
    }
  },
  
  actions: {
    // ============ ИНСТРУМЕНТЫ ============
    
    setTool(tool) {
      // Очищаем измерение и зону при смене инструмента
      if (this.activeTool === POINTER_TOOLS.MEASURE && tool !== POINTER_TOOLS.MEASURE) {
        this.finishMeasurement()
      }
      if (this.activeTool === POINTER_TOOLS.RANGE && tool !== POINTER_TOOLS.RANGE) {
        this.hideRange()
      }
      this.activeTool = tool
    },
    
    setColor(color) {
      this.activeColor = color
    },
    
    setLineWidth(width) {
      this.lineWidth = Math.max(1, Math.min(20, width))
    },
    
    // ============ УКАЗКА ============
    
    updatePointer(x, y) {
      this.masterPointer = { x, y, time: Date.now() }
      this._broadcastPointerUpdate()
    },
    
    clearPointer() {
      this.masterPointer = null
      this._broadcastPointerClear()
    },
    
    // Получить данные указки (для игроков)
    receivePointerUpdate(data) {
      if (data.pointer) {
        this.masterPointer = data.pointer
      } else {
        this.masterPointer = null
      }
    },
    
    // ============ ПИНГИ ============
    
    addPing(x, y, color = null) {
      const ping = {
        id: crypto.randomUUID(),
        x,
        y,
        color: color || this.activeColor,
        time: Date.now(),
        lifetime: PING_LIFETIME
      }
      
      this.pings.push(ping)
      this._broadcastPing(ping)
      
      // Автоудаление
      setTimeout(() => {
        this.removePing(ping.id)
      }, PING_LIFETIME)
      
      return ping
    },
    
    removePing(id) {
      const index = this.pings.findIndex(p => p.id === id)
      if (index !== -1) {
        this.pings.splice(index, 1)
      }
    },
    
    // Получить пинг (для игроков)
    receivePing(ping) {
      this.pings.push(ping)
      
      // Автоудаление
      setTimeout(() => {
        this.removePing(ping.id)
      }, ping.lifetime)
    },
    
    // ============ РИСОВАНИЕ ============
    
    startDrawing(x, y) {
      this.currentDrawing = {
        points: [{ x, y }],
        color: this.activeColor,
        width: this.lineWidth
      }
    },
    
    continueDrawing(x, y) {
      if (!this.currentDrawing) return
      
      // Добавляем точку только если она достаточно далеко от предыдущей
      const lastPoint = this.currentDrawing.points[this.currentDrawing.points.length - 1]
      const dx = x - lastPoint.x
      const dy = y - lastPoint.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      
      if (dist > 2) { // Минимальное расстояние между точками
        this.currentDrawing.points.push({ x, y })
      }
    },
    
    finishDrawing() {
      if (!this.currentDrawing || this.currentDrawing.points.length < 2) {
        this.currentDrawing = null
        return null
      }
      
      const drawing = {
        id: crypto.randomUUID(),
        ...this.currentDrawing,
        time: Date.now()
      }
      
      this.drawings.push(drawing)
      this._broadcastDrawing(drawing)
      
      this.currentDrawing = null
      
      return drawing
    },
    
    cancelDrawing() {
      this.currentDrawing = null
    },
    
    // Получить рисунок (для игроков)
    receiveDrawing(drawing) {
      this.drawings.push(drawing)
    },
    
    // ============ ФИГУРЫ ============
    
    startShape(x, y) {
      this.currentShape = {
        type: this.activeTool,
        start: { x, y },
        end: { x, y },
        color: this.activeColor
      }
    },
    
    updateShape(x, y) {
      if (!this.currentShape) return
      this.currentShape.end = { x, y }
    },
    
    finishShape() {
      if (!this.currentShape) return null
      
      const shape = {
        id: crypto.randomUUID(),
        ...this.currentShape,
        time: Date.now()
      }
      
      this.shapes.push(shape)
      this._broadcastShape(shape)
      
      this.currentShape = null
      
      return shape
    },
    
    cancelShape() {
      this.currentShape = null
    },
    
    // Получить фигуру (для игроков)
    receiveShape(shape) {
      this.shapes.push(shape)
    },
    
    // ============ ИЗМЕРЕНИЕ РАССТОЯНИЯ ============
    
    /**
     * Начать измерение
     * @param {number} x - world X
     * @param {number} y - world Y
     * @param {number} q - hex Q
     * @param {number} r - hex R
     */
    startMeasurement(x, y, q, r) {
      this.measurement = {
        start: { x, y, q, r },
        end: { x, y, q, r },
        distance: 0,
        path: [{ q, r }]
      }
    },
    
    /**
     * Обновить измерение
     * @param {number} x - world X
     * @param {number} y - world Y  
     * @param {number} q - hex Q
     * @param {number} r - hex R
     * @param {number} distance - расстояние в гексах
     * @param {Array} path - путь [{q, r}]
     */
    updateMeasurement(x, y, q, r, distance, path) {
      if (!this.measurement) return
      
      this.measurement.end = { x, y, q, r }
      this.measurement.distance = distance
      this.measurement.path = path || []
      
      this._broadcastMeasurement()
    },
    
    /**
     * Завершить измерение
     */
    finishMeasurement() {
      this.measurement = null
      this._broadcastMeasurementClear()
    },
    
    /**
     * Получить измерение (для игроков)
     */
    receiveMeasurement(data) {
      this.measurement = data.measurement
    },
    
    // ============ ЗОНА ДОСЯГАЕМОСТИ ============
    
    /**
     * Показать зону досягаемости
     * @param {number} q - центр Q
     * @param {number} r - центр R
     * @param {number} maxCost - максимальная стоимость перемещения
     * @param {Array} hexes - массив гексов в зоне [{q, r, cost}]
     */
    showRange(q, r, maxCost, hexes) {
      this.rangeDisplay = {
        center: { q, r },
        radius: maxCost, // сохраняем для совместимости
        hexes: hexes || []
      }
      this._broadcastRange()
    },
    
    /**
     * Скрыть зону досягаемости
     */
    hideRange() {
      this.rangeDisplay = null
      this._broadcastRangeClear()
    },
    
    /**
     * Получить зону (для игроков)
     */
    receiveRange(data) {
      this.rangeDisplay = data.range
    },
    
    // ============ ЗОНА ДВИЖЕНИЯ ПЕРСОНАЖА ============
    
    /**
     * Показать зону движения для выбранного персонажа
     * Эта зона отображается только локально (не синхронизируется)
     * @param {string} characterId - ID персонажа
     * @param {Object} center - центр {q, r}
     * @param {Array} hexes - массив гексов [{q, r, cost}]
     * @param {number} maxCost - максимальные очки движения
     */
    showMovementRange(characterId, center, hexes, maxCost) {
      this.movementRange = {
        characterId,
        center,
        hexes: hexes || [],
        maxCost
      }
    },
    
    /**
     * Скрыть зону движения персонажа
     */
    hideMovementRange() {
      this.movementRange = null
      this.hoveredPath = null
    },
    
    /**
     * Показать путь до гекса с сегментацией по ресурсам
     * @param {Array} segments - сегменты пути [{type, path, startCost, endCost}]
     * @param {number} totalCost - полная стоимость пути
     * @param {Object} targetHex - целевой гекс {q, r}
     * @param {Object} resources - использованные ресурсы {movement, surges}
     * @param {number|null} suggestedFacing - предполагаемое направление по последнему шагу (0-11)
     */
    showHoveredPath(segments, totalCost, targetHex, resources = {}, suggestedFacing = null) {
      this.hoveredPath = {
        segments: segments || [],
        totalCost,
        targetHex,
        resources,
        suggestedFacing,       // Направление по касательной к пути (lastFacing)
        selectedFacing: null   // Выбранное пользователем направление (null = suggestedFacing)
      }
    },
    
    /**
     * Установить выбранное направление для пути
     * @param {number} facing - направление 0-11 
     */
    setPathFacing(facing) {
      if (this.hoveredPath) {
        this.hoveredPath.selectedFacing = facing
      }
    },
    
    /**
     * Получить финальное направление (выбранное или предложенное)
     */
    getPathFacing() {
      if (!this.hoveredPath) return 0
      return this.hoveredPath.selectedFacing ?? this.hoveredPath.suggestedFacing ?? 0
    },
    
    /**
     * Скрыть путь
     */
    hideHoveredPath() {
      this.hoveredPath = null
    },
    
    // ============ ОЧИСТКА ============
    
    clearAll() {
      this.pings = []
      this.drawings = []
      this.shapes = []
      this.currentDrawing = null
      this.currentShape = null
      this._broadcastClear()
    },
    
    clearDrawings() {
      this.drawings = []
      this.currentDrawing = null
      this._broadcastClearDrawings()
    },
    
    clearShapes() {
      this.shapes = []
      this.currentShape = null
      this._broadcastClearShapes()
    },
    
    // Получить команду очистки (для игроков)
    receiveClear(type) {
      switch (type) {
        case 'all':
          this.pings = []
          this.drawings = []
          this.shapes = []
          break
        case 'drawings':
          this.drawings = []
          break
        case 'shapes':
          this.shapes = []
          break
      }
    },
    
    // ============ СИНХРОНИЗАЦИЯ ============
    
    // Получить полное состояние (для новых игроков)
    getFullState() {
      return {
        pointer: this.masterPointer,
        pings: this.activePings,
        drawings: this.activeDrawings,
        shapes: this.shapes
      }
    },
    
    // Применить полное состояние (для игроков при подключении)
    applyFullState(state) {
      if (state.pointer) this.masterPointer = state.pointer
      if (state.pings) this.pings = state.pings
      if (state.drawings) this.drawings = state.drawings
      if (state.shapes) this.shapes = state.shapes
    },
    
    // ============ BROADCAST (внутренние методы) ============
    
    _broadcastPointerUpdate() {
      if (!this.showPointerToPlayers) return
      
      const sessionStore = useSessionStore()
      if (!sessionStore.isMaster) return
      
      sessionStore.broadcastPayload({
        type: 'pointer-update',
        pointer: this.masterPointer
      })
    },
    
    _broadcastPointerClear() {
      const sessionStore = useSessionStore()
      if (!sessionStore.isMaster) return
      
      sessionStore.broadcastPayload({
        type: 'pointer-update',
        pointer: null
      })
    },
    
    _broadcastPing(ping) {
      const sessionStore = useSessionStore()
      if (!sessionStore.isMaster) return
      
      sessionStore.broadcastPayload({
        type: 'pointer-ping',
        ping
      })
    },
    
    _broadcastDrawing(drawing) {
      const sessionStore = useSessionStore()
      if (!sessionStore.isMaster) return
      
      sessionStore.broadcastPayload({
        type: 'pointer-drawing',
        drawing
      })
    },
    
    _broadcastShape(shape) {
      const sessionStore = useSessionStore()
      if (!sessionStore.isMaster) return
      
      sessionStore.broadcastPayload({
        type: 'pointer-shape',
        shape
      })
    },
    
    _broadcastClear() {
      const sessionStore = useSessionStore()
      if (!sessionStore.isMaster) return
      
      sessionStore.broadcastPayload({
        type: 'pointer-clear',
        clearType: 'all'
      })
    },
    
    _broadcastClearDrawings() {
      const sessionStore = useSessionStore()
      if (!sessionStore.isMaster) return
      
      sessionStore.broadcastPayload({
        type: 'pointer-clear',
        clearType: 'drawings'
      })
    },
    
    _broadcastClearShapes() {
      const sessionStore = useSessionStore()
      if (!sessionStore.isMaster) return
      
      sessionStore.broadcastPayload({
        type: 'pointer-clear',
        clearType: 'shapes'
      })
    },
    
    _broadcastMeasurement() {
      const sessionStore = useSessionStore()
      if (!sessionStore.isMaster) return
      
      sessionStore.broadcastPayload({
        type: 'pointer-measurement',
        measurement: this.measurement
      })
    },
    
    _broadcastMeasurementClear() {
      const sessionStore = useSessionStore()
      if (!sessionStore.isMaster) return
      
      sessionStore.broadcastPayload({
        type: 'pointer-measurement',
        measurement: null
      })
    },
    
    _broadcastRange() {
      const sessionStore = useSessionStore()
      if (!sessionStore.isMaster) return
      
      sessionStore.broadcastPayload({
        type: 'pointer-range',
        range: this.rangeDisplay
      })
    },
    
    _broadcastRangeClear() {
      const sessionStore = useSessionStore()
      if (!sessionStore.isMaster) return
      
      sessionStore.broadcastPayload({
        type: 'pointer-range',
        range: null
      })
    }
  }
})
