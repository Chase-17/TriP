/**
 * Универсальная утилита для работы с изображениями из разных источников:
 * - Локальные файлы (assets)
 * - URL из сети
 * - Загруженные пользователем (base64/blob)
 * - P2P передача
 */

import { assetUrl } from './assets'

/**
 * Типы источников изображений
 */
export const ImageSourceType = {
  ASSET: 'asset',     // Локальный файл из /public/images/
  URL: 'url',         // Внешняя ссылка
  BASE64: 'base64',   // Base64 строка (загруженное)
  BLOB: 'blob'        // Blob URL (временный)
}

/**
 * Структура источника изображения
 * @typedef {Object} ImageSource
 * @property {string} type - тип источника (asset/url/base64/blob)
 * @property {string} value - значение (путь/URL/base64)
 * @property {string} [assetPath] - путь к ассету для type=asset
 */

/**
 * Создать источник изображения из ассета
 * @param {string} category - категория (items/classes/races/presets/etc)
 * @param {string} id - ID ресурса
 * @returns {ImageSource}
 */
export const assetImage = (category, id) => ({
  type: ImageSourceType.ASSET,
  value: assetUrl(`/images/${category}/${id}.png`),
  assetPath: `/images/${category}/${id}.png`
})

/**
 * Создать источник изображения из URL
 * @param {string} url - URL изображения
 * @returns {ImageSource}
 */
export const urlImage = (url) => ({
  type: ImageSourceType.URL,
  value: url
})

/**
 * Создать источник изображения из base64
 * @param {string} base64 - base64 строка (с или без data: prefix)
 * @returns {ImageSource}
 */
export const base64Image = (base64) => ({
  type: ImageSourceType.BASE64,
  value: base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
})

/**
 * Создать источник изображения из Blob
 * @param {Blob} blob - Blob объект
 * @returns {ImageSource}
 */
export const blobImage = (blob) => ({
  type: ImageSourceType.BLOB,
  value: URL.createObjectURL(blob)
})

/**
 * Распознать тип источника из строки/объекта
 * @param {string|ImageSource|null} source - источник изображения
 * @param {string} [defaultCategory] - категория по умолчанию для asset
 * @returns {ImageSource|null}
 */
export const parseImageSource = (source, defaultCategory = 'items') => {
  if (!source) return null
  
  // Уже объект ImageSource
  if (typeof source === 'object' && source.type) {
    return source
  }
  
  const str = String(source)
  
  // Base64
  if (str.startsWith('data:image')) {
    return base64Image(str)
  }
  
  // URL (http/https)
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return urlImage(str)
  }
  
  // Blob URL
  if (str.startsWith('blob:')) {
    return { type: ImageSourceType.BLOB, value: str }
  }
  
  // Путь начинающийся с /images/ - asset
  if (str.startsWith('/images/')) {
    return {
      type: ImageSourceType.ASSET,
      value: assetUrl(str),
      assetPath: str
    }
  }
  
  // Просто ID - считаем это asset ID
  return assetImage(defaultCategory, str)
}

/**
 * Получить URL для отображения из любого источника
 * @param {string|ImageSource|null} source - источник изображения
 * @param {string} [defaultCategory] - категория по умолчанию
 * @param {string} [fallbackId] - ID для fallback
 * @returns {string}
 */
export const getImageUrl = (source, defaultCategory = 'items', fallbackId = null) => {
  const parsed = parseImageSource(source, defaultCategory)
  if (parsed) return parsed.value
  if (fallbackId) return assetUrl(`/images/${defaultCategory}/${fallbackId}.png`)
  return ''
}

/**
 * Сериализовать источник для хранения/передачи
 * Для asset сохраняем только путь, для base64 - всю строку
 * @param {ImageSource} source
 * @returns {string|object}
 */
export const serializeImageSource = (source) => {
  if (!source) return null
  
  switch (source.type) {
    case ImageSourceType.ASSET:
      return source.assetPath || source.value
    case ImageSourceType.URL:
    case ImageSourceType.BASE64:
      return source.value
    case ImageSourceType.BLOB:
      // Blob URL нельзя сериализовать, нужно конвертировать в base64
      console.warn('Cannot serialize blob URL, convert to base64 first')
      return null
    default:
      return source.value || source
  }
}

/**
 * Конвертировать File/Blob в base64
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
export const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Изменить размер изображения
 * @param {string} src - URL или base64 изображения
 * @param {number} maxWidth - максимальная ширина
 * @param {number} maxHeight - максимальная высота
 * @param {string} format - формат (image/png, image/jpeg, image/webp)
 * @param {number} quality - качество для jpeg/webp (0-1)
 * @returns {Promise<string>} base64 строка
 */
export const resizeImage = (src, maxWidth = 256, maxHeight = 256, format = 'image/png', quality = 0.85) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      let { width, height } = img
      
      // Вычисляем новые размеры сохраняя пропорции
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      
      resolve(canvas.toDataURL(format, quality))
    }
    img.onerror = reject
    img.src = src
  })
}

/**
 * Загрузить изображение из URL и конвертировать в base64
 * @param {string} url
 * @param {number} [maxSize] - максимальный размер для ресайза
 * @returns {Promise<string>}
 */
export const fetchImageAsBase64 = async (url, maxSize = 512) => {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const base64 = await fileToBase64(blob)
    if (maxSize) {
      return resizeImage(base64, maxSize, maxSize)
    }
    return base64
  } catch (error) {
    console.error('Failed to fetch image:', error)
    throw error
  }
}

/**
 * Проверить, является ли строка валидным URL изображения
 * @param {string} str
 * @returns {boolean}
 */
export const isValidImageUrl = (str) => {
  if (!str) return false
  try {
    const url = new URL(str)
    return ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}

/**
 * Проверить, является ли строка base64 изображением
 * @param {string} str
 * @returns {boolean}
 */
export const isBase64Image = (str) => {
  return str?.startsWith('data:image')
}
