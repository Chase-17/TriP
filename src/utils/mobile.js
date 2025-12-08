/**
 * Утилиты для работы с мобильными устройствами
 */

/**
 * Определить, является ли устройство мобильным/планшетом
 * @returns {boolean}
 */
export const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

/**
 * Определить, поддерживает ли устройство hover
 * @returns {boolean}
 */
export const supportsHover = () => {
  return window.matchMedia('(hover: hover)').matches
}

/**
 * Определить размер экрана
 * @returns {'mobile' | 'tablet' | 'desktop'}
 */
export const getScreenSize = () => {
  const width = window.innerWidth
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

/**
 * Проверить, является ли экран маленьким (мобильный)
 * @returns {boolean}
 */
export const isMobileScreen = () => {
  return window.innerWidth < 768
}

/**
 * Добавить метатеги для мобильного viewport
 */
export const setupMobileViewport = () => {
  // Проверяем, что метатег viewport еще не установлен
  let viewport = document.querySelector('meta[name="viewport"]')
  if (!viewport) {
    viewport = document.createElement('meta')
    viewport.name = 'viewport'
    document.head.appendChild(viewport)
  }
  
  // Устанавливаем оптимальные настройки для игры
  viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'
}