/**
 * Утилита для работы с путями ассетов с учётом base URL
 * 
 * Vite при сборке заменяет import.meta.env.BASE_URL на значение base из vite.config.js
 * В dev режиме это '/', в production для gh-pages это '/TriP/'
 */

/**
 * Получить путь к ассету с учётом base URL
 * @param {string} path - путь к ассету, начинающийся с /
 * @returns {string} - полный путь с учётом base
 * 
 * @example
 * assetUrl('/images/presets/1.png') 
 * // dev: '/images/presets/1.png'
 * // prod: '/TriP/images/presets/1.png'
 */
export const assetUrl = (path) => {
  const base = import.meta.env.BASE_URL || '/'
  // Убираем двойные слеши если path уже начинается с /
  if (path.startsWith('/')) {
    return base.endsWith('/') ? base + path.slice(1) : base + path
  }
  return base.endsWith('/') ? base + path : base + '/' + path
}

/**
 * Получить путь к изображению пресета портрета
 * @param {number|string} portrait - индекс или название пресета
 */
export const presetUrl = (portrait) => {
  return assetUrl(`/images/presets/${portrait}.png`)
}

/**
 * Получить путь к изображению класса
 * @param {string} classId - ID класса
 */
export const classImageUrl = (classId) => {
  return assetUrl(`/images/classes/${classId}.png`)
}

/**
 * Получить путь к изображению предмета
 * @param {string} itemId - ID предмета
 */
export const itemImageUrl = (itemId) => {
  return assetUrl(`/images/items/${itemId}.png`)
}

/**
 * Получить путь к изображению расы
 * @param {string} raceId - ID расы
 * @param {string} gender - пол (male/female)
 * @param {string} type - тип изображения (base, w, k, c, s, m, n)
 */
export const raceImageUrl = (raceId, gender, type = 'base') => {
  return assetUrl(`/images/races/${raceId}/${gender}/${type}.png`)
}

/**
 * Получить путь к портрету расы
 * @param {string} raceId - ID расы
 * @param {string} gender - пол
 */
export const racePortraitUrl = (raceId, gender) => {
  return assetUrl(`/images/races/portraits/${raceId}_${gender}.png`)
}

/**
 * Получить путь к иконке пола
 * @param {string} gender - male/female
 */
export const genderIconUrl = (gender) => {
  return assetUrl(`/images/gender/${gender}.png`)
}
