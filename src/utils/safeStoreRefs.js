/**
 * Утилита для безопасного использования storeToRefs
 * Защищает от ошибок при HMR (Hot Module Replacement)
 */

import { ref } from 'vue'
import { storeToRefs } from 'pinia'

/**
 * Безопасно извлекает refs из Pinia store
 * При ошибке возвращает пустой объект
 * 
 * @param {Object} store - Pinia store instance
 * @param {string} storeName - Имя стора для логирования
 * @returns {Object} - Объект с refs или пустой объект
 */
export function safeStoreToRefs(store, storeName = 'unknown') {
  if (!store || !store.$state) {
    console.warn(`[safeStoreToRefs] Store "${storeName}" is not initialized`)
    return {}
  }
  
  try {
    return storeToRefs(store)
  } catch (e) {
    console.warn(`[safeStoreToRefs] Error with store "${storeName}":`, e.message)
    return {}
  }
}

/**
 * Безопасно инициализирует store
 * При ошибке возвращает null
 * 
 * @param {Function} useStore - Функция useXxxStore
 * @param {string} storeName - Имя стора для логирования
 * @returns {Object|null} - Store instance или null
 */
export function safeUseStore(useStore, storeName = 'unknown') {
  try {
    return useStore()
  } catch (e) {
    console.warn(`[safeUseStore] Error initializing "${storeName}":`, e.message)
    return null
  }
}

/**
 * Создаёт fallback ref если значение из store undefined
 * 
 * @param {any} storeValue - Значение из storeToRefs
 * @param {any} defaultValue - Значение по умолчанию
 * @returns {Ref} - Ref со значением или fallback
 */
export function withDefault(storeValue, defaultValue) {
  if (storeValue === undefined) {
    return ref(defaultValue)
  }
  return storeValue
}
