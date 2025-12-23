/**
 * Map History Store - управление историей изменений карты для Undo/Redo
 * 
 * Архитектура:
 * - Храним стек операций (не полных снапшотов) для экономии памяти
 * - Каждая операция содержит данные для отмены и повтора
 * - Группировка операций в транзакции для batch-операций (заливка)
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// Типы операций
export const OPERATION_TYPES = {
  SET_TERRAIN: 'set_terrain',      // Установка террейна одного гекса (клик)
  BRUSH_STROKE: 'brush_stroke',    // Мазок кистью (terrain или profile)
  ERASE_STROKE: 'erase_stroke',    // Мазок ластиком
  FILL_TERRAIN: 'fill_terrain',    // Заливка выделения террейном
  FILL_PROFILE: 'fill_profile',    // Заливка выделения профилем
  DELETE_HEXES: 'delete_hexes',    // Удаление гексов
  PLACE_TOKEN: 'place_token',      // Размещение токена
  MOVE_TOKEN: 'move_token',        // Перемещение токена
  REMOVE_TOKEN: 'remove_token'     // Удаление токена
}

// Максимальное количество операций в истории
const MAX_HISTORY_SIZE = 100

export const useMapHistoryStore = defineStore('mapHistory', () => {
  // Стек отмены (undo) - операции для отмены
  const undoStack = ref([])
  
  // Стек повтора (redo) - операции для повтора
  const redoStack = ref([])
  
  // Флаг выполнения undo/redo (чтобы не записывать в историю)
  const isUndoRedoInProgress = ref(false)
  
  // Текущая транзакция (для группировки операций)
  const currentTransaction = ref(null)
  
  // Computed
  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)
  const undoCount = computed(() => undoStack.value.length)
  const redoCount = computed(() => redoStack.value.length)
  
  // Получить описание последней операции для отмены
  const undoDescription = computed(() => {
    if (undoStack.value.length === 0) return null
    const op = undoStack.value[undoStack.value.length - 1]
    return getOperationDescription(op)
  })
  
  // Получить описание последней операции для повтора
  const redoDescription = computed(() => {
    if (redoStack.value.length === 0) return null
    const op = redoStack.value[redoStack.value.length - 1]
    return getOperationDescription(op)
  })
  
  /**
   * Получить человекочитаемое описание операции
   */
  function getOperationDescription(operation) {
    if (!operation) return ''
    const count = operation.changes?.length || 0
    
    switch (operation.type) {
      case OPERATION_TYPES.SET_TERRAIN:
        return 'Рисование'
      case OPERATION_TYPES.BRUSH_STROKE:
        return `Мазок кистью (${count})`
      case OPERATION_TYPES.ERASE_STROKE:
        return `Стирание (${count})`
      case OPERATION_TYPES.FILL_TERRAIN:
        return `Заливка (${count})`
      case OPERATION_TYPES.FILL_PROFILE:
        return `Профиль (${count})`
      case OPERATION_TYPES.DELETE_HEXES:
        return `Удаление (${count})`
      case OPERATION_TYPES.PLACE_TOKEN:
        return 'Размещение токена'
      case OPERATION_TYPES.MOVE_TOKEN:
        return 'Перемещение токена'
      case OPERATION_TYPES.REMOVE_TOKEN:
        return 'Удаление токена'
      default:
        return 'Изменение'
    }
  }
  
  /**
   * Начать транзакцию (группировку операций)
   * Все операции до endTransaction будут объединены в одну
   */
  function beginTransaction(type, mapId) {
    if (currentTransaction.value) {
      console.warn('Transaction already in progress, ending previous')
      endTransaction()
    }
    
    currentTransaction.value = {
      type,
      mapId,
      changes: [],
      timestamp: Date.now()
    }
  }
  
  /**
   * Завершить транзакцию
   */
  function endTransaction() {
    if (!currentTransaction.value) return
    
    const transaction = currentTransaction.value
    currentTransaction.value = null
    
    // Если есть изменения - добавляем в историю
    if (transaction.changes.length > 0) {
      pushOperation(transaction)
    }
  }
  
  /**
   * Отменить транзакцию без сохранения
   */
  function cancelTransaction() {
    currentTransaction.value = null
  }
  
  /**
   * Записать операцию изменения террейна
   */
  function recordTerrainChange(mapId, q, r, oldTerrainId, newTerrainId) {
    if (isUndoRedoInProgress.value) return
    if (oldTerrainId === newTerrainId) return // Нет изменений
    
    const change = {
      q,
      r,
      oldValue: oldTerrainId,
      newValue: newTerrainId
    }
    
    // Если есть активная транзакция - добавляем туда
    if (currentTransaction.value) {
      // Проверяем, есть ли уже изменение для этого гекса
      const existingIdx = currentTransaction.value.changes.findIndex(
        c => c.q === q && c.r === r
      )
      
      if (existingIdx >= 0) {
        // Обновляем newValue, сохраняя oldValue
        currentTransaction.value.changes[existingIdx].newValue = newTerrainId
      } else {
        currentTransaction.value.changes.push(change)
      }
      return
    }
    
    // Иначе создаём отдельную операцию
    pushOperation({
      type: OPERATION_TYPES.SET_TERRAIN,
      mapId,
      changes: [change],
      timestamp: Date.now()
    })
  }
  
  /**
   * Записать пакетное изменение террейнов
   */
  function recordBatchTerrainChange(mapId, changes) {
    if (isUndoRedoInProgress.value) return
    if (!changes || changes.length === 0) return
    
    // Фильтруем изменения без реального эффекта
    const effectiveChanges = changes.filter(c => c.oldValue !== c.newValue)
    if (effectiveChanges.length === 0) return
    
    pushOperation({
      type: OPERATION_TYPES.BATCH_TERRAIN,
      mapId,
      changes: effectiveChanges,
      timestamp: Date.now()
    })
  }
  
  /**
   * Записать удаление гексов
   */
  function recordDeleteHexes(mapId, deletedHexes) {
    if (isUndoRedoInProgress.value) return
    if (!deletedHexes || deletedHexes.length === 0) return
    
    pushOperation({
      type: OPERATION_TYPES.DELETE_HEXES,
      mapId,
      changes: deletedHexes, // [{q, r, oldValue}]
      timestamp: Date.now()
    })
  }
  
  /**
   * Добавить операцию в стек undo
   */
  function pushOperation(operation) {
    undoStack.value.push(operation)
    
    // Очищаем redo при новой операции
    redoStack.value = []
    
    // Ограничиваем размер истории
    while (undoStack.value.length > MAX_HISTORY_SIZE) {
      undoStack.value.shift()
    }
  }
  
  /**
   * Отменить последнюю операцию
   * @returns {Object|null} Операция для применения или null
   */
  function undo() {
    if (undoStack.value.length === 0) return null
    
    const operation = undoStack.value.pop()
    redoStack.value.push(operation)
    
    return {
      ...operation,
      // Инвертируем изменения для отмены
      changes: operation.changes.map(c => ({
        ...c,
        // Меняем old и new местами
        oldValue: c.newValue,
        newValue: c.oldValue
      }))
    }
  }
  
  /**
   * Повторить отменённую операцию
   * @returns {Object|null} Операция для применения или null
   */
  function redo() {
    if (redoStack.value.length === 0) return null
    
    const operation = redoStack.value.pop()
    undoStack.value.push(operation)
    
    // Возвращаем оригинальные изменения
    return operation
  }
  
  /**
   * Очистить историю для карты
   */
  function clearHistory(mapId = null) {
    if (mapId) {
      undoStack.value = undoStack.value.filter(op => op.mapId !== mapId)
      redoStack.value = redoStack.value.filter(op => op.mapId !== mapId)
    } else {
      undoStack.value = []
      redoStack.value = []
    }
    currentTransaction.value = null
  }
  
  /**
   * Установить флаг выполнения undo/redo
   */
  function setUndoRedoInProgress(value) {
    isUndoRedoInProgress.value = value
  }
  
  return {
    // State
    undoStack,
    redoStack,
    isUndoRedoInProgress,
    currentTransaction,
    
    // Computed
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    undoDescription,
    redoDescription,
    
    // Actions
    beginTransaction,
    endTransaction,
    cancelTransaction,
    recordTerrainChange,
    recordBatchTerrainChange,
    recordDeleteHexes,
    undo,
    redo,
    clearHistory,
    setUndoRedoInProgress
  }
})
