/**
 * Composable для управления перемещением токенов на карте.
 * Единый источник логики для локального и удалённого перемещения.
 * Извлекает общую логику из PlayerRoom, MasterRoom и BattleMap.
 */

import { findPath } from '@/utils/hex/pathfinding.js'
import { animateTokenMovement, animateTokenFromRemote } from '@/utils/hex/animation.js'

/**
 * Опции для moveTokenWithAnimation
 * @typedef {Object} MoveTokenOptions
 * @property {string} characterId - ID персонажа
 * @property {{q: number, r: number}} currentPos - Текущая позиция токена
 * @property {{q: number, r: number}} targetHex - Целевой гекс
 * @property {number|null} facing - Выбранное направление (null = автовычисление)
 * @property {string} mapId - ID карты
 * @property {boolean} isPointy - Ориентация карты (pointy-top)
 * @property {Object} grid - HexGrid для преобразования координат
 * @property {Function} getTerrainAt - Функция получения террейна (q, r) => terrainData
 * @property {Object} [pathfindingOptions] - Опции для поиска пути (modifiers, maxCost)
 * @property {Object} battleMapStore - Store карты
 * @property {Function} [onBeforeAnimate] - Колбэк перед анимацией (для broadcast)
 * @property {Function} [onComplete] - Колбэк после завершения анимации (lastFacing, targetHex)
 */

/**
 * Результат перемещения
 * @typedef {Object} MoveResult
 * @property {boolean} success - Успешно ли перемещение
 * @property {string} [error] - Описание ошибки
 * @property {Array} [path] - Найденный путь
 * @property {number} [cost] - Стоимость пути
 */

/**
 * Перемещает токен с анимацией
 * @param {MoveTokenOptions} options
 * @returns {MoveResult}
 */
export function moveTokenWithAnimation(options) {
  const {
    characterId,
    currentPos,
    targetHex,
    facing,
    mapId,
    isPointy,
    grid,
    getTerrainAt,
    pathfindingOptions = { modifiers: {}, maxCost: 100 },
    battleMapStore,
    onBeforeAnimate,
    onComplete
  } = options

  // Валидация входных данных
  if (!characterId) {
    return { success: false, error: 'characterId is required' }
  }
  if (!currentPos) {
    return { success: false, error: 'currentPos is required' }
  }
  if (!targetHex) {
    return { success: false, error: 'targetHex is required' }
  }
  if (!mapId) {
    return { success: false, error: 'mapId is required' }
  }
  if (!grid) {
    return { success: false, error: 'grid is required for animation' }
  }
  if (!getTerrainAt) {
    return { success: false, error: 'getTerrainAt function is required' }
  }
  if (!battleMapStore) {
    return { success: false, error: 'battleMapStore is required' }
  }

  // Если целевой гекс совпадает с текущим - только поворот
  if (currentPos.q === targetHex.q && currentPos.r === targetHex.r) {
    if (facing != null) {
      battleMapStore.rotateToken(mapId, currentPos.q, currentPos.r, facing)
    }
    return { success: true, path: [], cost: 0, rotateOnly: true }
  }

  // Вычисляем путь
  const pathResult = findPath(
    { q: currentPos.q, r: currentPos.r },
    { q: targetHex.q, r: targetHex.r },
    getTerrainAt,
    pathfindingOptions
  )

  if (!pathResult.found) {
    console.warn('[useTokenMovement] Путь до целевого гекса не найден')
    return { success: false, error: 'path_not_found' }
  }

  console.log('[useTokenMovement] Найден путь:', pathResult.path.length, 'шагов, стоимость:', pathResult.totalCost)

  // Сохраняем финальный facing для установки после анимации
  const finalFacing = facing

  // Вычисляем длительность анимации (200мс на гекс)
  const animDuration = 200 * pathResult.path.length

  // Вызываем колбэк перед анимацией (для broadcast)
  if (onBeforeAnimate) {
    onBeforeAnimate({
      characterId,
      path: pathResult.path.map(h => ({ q: h.q, r: h.r })),
      duration: animDuration,
      facing: finalFacing ?? 0
    })
  }

  // Запускаем анимацию
  animateTokenMovement({
    characterId,
    path: pathResult.path,
    hexToPixel: (q, r) => grid.hexToPixel(q, r),
    duration: animDuration,
    isPointy,

    // Перемещение токена при достижении нового гекса
    moveToken: (q, r) => {
      const pos = battleMapStore.findTokenPosition(mapId, characterId)
      if (pos) {
        battleMapStore.moveToken(mapId, pos.q, pos.r, q, r)
      }
    },

    // По завершении анимации
    onComplete: (lastFacing) => {
      console.log('[useTokenMovement] Анимация завершена, lastFacing:', lastFacing, 'finalFacing:', finalFacing)

      // Приоритет: выбранное направление > направление из анимации
      const facingToSet = finalFacing ?? lastFacing ?? 0

      // Устанавливаем финальное направление
      const pos = battleMapStore.findTokenPosition(mapId, characterId)
      if (pos) {
        battleMapStore.rotateToken(mapId, pos.q, pos.r, facingToSet)
      }

      // Вызываем пользовательский колбэк
      if (onComplete) {
        onComplete({
          lastFacing,
          finalFacing: facingToSet,
          targetHex,
          path: pathResult.path
        })
      }
    }
  })

  return { 
    success: true, 
    path: pathResult.path, 
    cost: pathResult.totalCost,
    duration: animDuration
  }
}

/**
 * Composable для использования в компонентах Vue
 * @param {Object} options
 * @param {import('vue').Ref} options.battleMapStore - Store карты
 * @param {import('vue').Ref} options.terrainStore - Store террейнов
 * @param {Function} options.getHexGrid - Функция получения HexGrid
 */
export function useTokenMovement({ battleMapStore, terrainStore, getHexGrid }) {
  
  /**
   * Создает функцию getTerrainAt для персонажа
   * @param {string} characterId
   * @param {Set} [characterTags]
   */
  const createGetTerrainAt = (characterId, characterTags = new Set()) => {
    return (q, r) => {
      const mapId = battleMapStore.activeMapId
      return battleMapStore.getHexPathfindingData(mapId, q, r, terrainStore, {
        viewerId: characterId,
        characterTags
      })
    }
  }

  /**
   * Перемещает токен с анимацией
   * @param {Object} params
   * @param {string} params.characterId - ID персонажа
   * @param {{q: number, r: number}} params.targetHex - Целевой гекс
   * @param {number|null} [params.facing] - Выбранное направление
   * @param {Object} [params.pathfindingOptions] - Опции для поиска пути
   * @param {Function} [params.onBeforeAnimate] - Колбэк перед анимацией
   * @param {Function} [params.onComplete] - Колбэк после анимации
   */
  const moveToken = (params) => {
    const {
      characterId,
      targetHex,
      facing = null,
      pathfindingOptions,
      onBeforeAnimate,
      onComplete
    } = params

    const activeMap = battleMapStore.activeMap
    if (!activeMap) {
      console.warn('[useTokenMovement] Нет активной карты')
      return { success: false, error: 'no_active_map' }
    }

    const mapId = activeMap.id
    const isPointy = activeMap.orientation === 'pointy'

    // Находим текущую позицию токена
    const currentPos = battleMapStore.findTokenPosition(mapId, characterId)
    if (!currentPos) {
      console.warn('[useTokenMovement] Токен не найден на карте')
      return { success: false, error: 'token_not_found' }
    }

    // Получаем grid
    const grid = getHexGrid()
    if (!grid) {
      console.warn('[useTokenMovement] HexGrid не доступен')
      return { success: false, error: 'no_grid' }
    }

    // Создаем функцию для получения террейна
    const getTerrainAt = createGetTerrainAt(characterId)

    return moveTokenWithAnimation({
      characterId,
      currentPos,
      targetHex,
      facing,
      mapId,
      isPointy,
      grid,
      getTerrainAt,
      pathfindingOptions,
      battleMapStore,
      onBeforeAnimate,
      onComplete
    })
  }

  return {
    moveToken,
    createGetTerrainAt,
    moveTokenWithAnimation
  }
}

/**
 * Воспроизводит удалённую анимацию токена (полученную от другого пира)
 * @param {Object} options
 * @param {Object} options.payload - Данные анимации от пира
 * @param {string} options.payload.characterId - ID персонажа
 * @param {Array} options.payload.path - Путь анимации [{q, r}, ...]
 * @param {number} options.payload.duration - Длительность анимации
 * @param {number} options.payload.startTime - Время начала анимации (timestamp)
 * @param {number} [options.payload.finalFacing] - Финальное направление
 * @param {string} options.payload.userId - ID отправителя
 * @param {string} options.myUserId - ID текущего пользователя (для фильтрации своих анимаций)
 * @param {Object} options.battleMapStore - Store карты
 * @param {Function} options.getHexGrid - Функция получения HexGrid
 * @param {Function} options.getActiveMap - Функция получения активной карты
 * @param {Function} [options.onComplete] - Колбэк после завершения анимации
 */
export function playRemoteTokenAnimation(options) {
  const {
    payload,
    myUserId,
    battleMapStore,
    getHexGrid,
    getActiveMap,
    onComplete
  } = options

  // Не воспроизводим свою анимацию
  if (payload.userId === myUserId) {
    console.log('[useTokenMovement] Пропускаем свою анимацию')
    return { success: false, error: 'own_animation' }
  }

  const activeMap = getActiveMap()
  const mapId = activeMap?.id
  if (!mapId || !payload.path || payload.path.length < 2) {
    return { success: false, error: 'invalid_payload' }
  }

  const grid = getHexGrid()
  if (!grid) {
    return { success: false, error: 'no_grid' }
  }

  const isPointy = activeMap.orientation === 'pointy'

  console.log('[useTokenMovement] Воспроизводим удалённую анимацию:', payload.characterId)

  // Воспроизводим анимацию с учётом прошедшего времени
  animateTokenFromRemote({
    characterId: payload.characterId,
    path: payload.path,
    hexToPixel: (q, r) => grid.hexToPixel(q, r),
    duration: payload.duration,
    startTime: payload.startTime,
    finalFacing: payload.finalFacing || 0,
    isPointy,
    
    moveToken: (q, r) => {
      const pos = battleMapStore.findTokenPosition(mapId, payload.characterId)
      if (pos) {
        battleMapStore.moveToken(mapId, pos.q, pos.r, q, r)
      } else {
        // Токен ещё не на карте - размещаем его
        battleMapStore.placeToken(mapId, payload.characterId, q, r, payload.finalFacing || 0)
      }
    },
    
    onComplete: (lastFacing) => {
      console.log('[useTokenMovement] Удалённая анимация завершена для', payload.characterId, 'lastFacing:', lastFacing)
      
      // Устанавливаем финальное направление из payload
      const facingToSet = payload.finalFacing ?? lastFacing ?? 0
      const lastHex = payload.path[payload.path.length - 1]
      battleMapStore.rotateToken(mapId, lastHex.q, lastHex.r, facingToSet)
      
      if (onComplete) {
        onComplete({ lastFacing, finalFacing: facingToSet, targetHex: lastHex })
      }
    }
  })

  return { success: true }
}
