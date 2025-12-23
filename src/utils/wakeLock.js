/**
 * Wake Lock утилита для предотвращения блокировки экрана
 * Использует NoSleep.js - проверенная библиотека для всех платформ
 * 
 * @see https://github.com/richtr/NoSleep.js
 */

import NoSleep from 'nosleep.js'

const noSleep = new NoSleep()
let isEnabled = false

/**
 * Проверяет, поддерживается ли Wake Lock API
 */
export function isWakeLockSupported() {
  return true // NoSleep.js работает везде
}

/**
 * Запрашивает блокировку экрана (предотвращает засыпание)
 * Важно: должен вызываться из обработчика пользовательского события (click, touch)
 * @returns {Promise<boolean>} true если успешно, false если не удалось
 */
export async function requestWakeLock() {
  if (isEnabled) {
    console.log('[WakeLock] Уже активирован')
    return true
  }
  
  try {
    await noSleep.enable()
    isEnabled = true
    console.log('[WakeLock] ✅ Активирован - экран не будет гаснуть')
    return true
  } catch (err) {
    console.warn('[WakeLock] Ошибка активации:', err.message)
    return false
  }
}

/**
 * Освобождает блокировку экрана
 */
export async function releaseWakeLock() {
  if (!isEnabled) return
  
  try {
    noSleep.disable()
    isEnabled = false
    console.log('[WakeLock] Освобождён')
  } catch (err) {
    console.warn('[WakeLock] Ошибка при освобождении:', err.message)
  }
}

/**
 * Проверяет, активна ли блокировка
 */
export function isWakeLockActive() {
  return isEnabled
}

/**
 * Настраивает автоматическое восстановление Wake Lock при возврате на страницу
 * Вызывать один раз при монтировании компонента
 * @returns {Function} Функция для отписки (вызвать в onUnmounted)
 */
export function setupWakeLockAutoRestore() {
  let wakeLockEnabled = false
  
  const handleVisibilityChange = async () => {
    if (document.visibilityState === 'visible' && wakeLockEnabled) {
      // Страница снова видима, восстанавливаем Wake Lock
      await requestWakeLock()
    }
  }
  
  // Обработчик для активации после user interaction
  const handleUserInteraction = async () => {
    if (!wakeLockEnabled) {
      wakeLockEnabled = true
      const success = await requestWakeLock()
      if (success) {
        console.log('[WakeLock] Активирован после взаимодействия пользователя')
      }
    }
  }
  
  document.addEventListener('visibilitychange', handleVisibilityChange)
  // Ждём первого взаимодействия пользователя
  document.addEventListener('touchstart', handleUserInteraction, { passive: true })
  document.addEventListener('click', handleUserInteraction, { passive: true })
  
  // НЕ запрашиваем Wake Lock сразу — ждём user interaction
  console.log('[WakeLock] Ожидание взаимодействия пользователя для активации...')
  
  // Возвращаем функцию очистки
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    document.removeEventListener('touchstart', handleUserInteraction)
    document.removeEventListener('click', handleUserInteraction)
    releaseWakeLock()
  }
}
