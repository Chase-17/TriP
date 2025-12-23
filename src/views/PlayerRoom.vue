<script setup>
/**
 * PlayerRoom - игровая комната для игрока
 * Адаптивный интерфейс: десктоп и мобильная версия
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import { useCharactersStore } from '@/stores/characters'
import { useBattleMapStore } from '@/stores/battleMap'
import { useSceneLogStore } from '@/stores/sceneLog'
import { useTerrainStore } from '@/stores/terrain'
import { usePointerStore } from '@/stores/pointer'
import { findPath, getReachableHexes, reachableMapToArray, tokenAnimationManager, HexGrid } from '@/utils/hex'
import { useTokenMovement } from '@/composables/useTokenMovement'
import BattleMap from '@/components/battle/BattleMap.vue'
import UserAvatar from '@/components/shared/UserAvatar.vue'
import SplashOverlay from '@/components/layout/SplashOverlay.vue'
import GameLayout from '@/components/layout/GameLayout.vue'
import CharacterWizard from '@/components/character/CharacterWizard.vue'
import PlayerProfileSetup from '@/components/layout/PlayerProfileSetup.vue'
import { isMobileScreen, setupMobileViewport } from '@/utils/mobile'
import { safeStoreToRefs, safeUseStore } from '@/utils/safeStoreRefs'

const route = useRoute()
const router = useRouter()
const session = safeUseStore(useSessionStore, 'session')
const userStore = safeUseStore(useUserStore, 'user')
const charactersStore = safeUseStore(useCharactersStore, 'characters')
const battleMapStore = safeUseStore(useBattleMapStore, 'battleMap')
const sceneLogStore = safeUseStore(useSceneLogStore, 'sceneLog')
const terrainStore = safeUseStore(useTerrainStore, 'terrain')
const pointerStore = safeUseStore(usePointerStore, 'pointer')


const { roomId = ref(''), status = ref(''), connections = ref([]) } = safeStoreToRefs(session, 'session')
const { nickname = ref(''), avatar = ref(null), currentView = ref('') } = safeStoreToRefs(userStore, 'user')
const { characters = ref([]) } = safeStoreToRefs(charactersStore, 'characters')

// Computed свойства
const isConnected = computed(() => status.value === 'in-room' || status.value === 'ready')

// Текст статуса
const connectionStatusText = computed(() => {
  if (status.value === 'connecting') return 'Подключение...'
  if (status.value === 'in-room') return '● Подключено'
  if (status.value === 'error') return '○ Ошибка'
  return '○ Отключено'
})

const connectionStatusClass = computed(() => {
  if (status.value === 'in-room') return 'bg-emerald-500/20 text-emerald-400'
  if (status.value === 'connecting') return 'bg-amber-500/20 text-amber-400'
  return 'bg-rose-500/20 text-rose-400'
})

// Текущий вид
const activeView = ref('battle-map')

// Состояние подключения
const isConnecting = ref(true)
const connectionError = ref('')

// Мобильный интерфейс
const isMobile = ref(isMobileScreen())
const pendingAction = ref(null)

// Показывать модальное окно настройки профиля
const showProfileSetup = ref(false)

// Занятые иконки других игроков
const takenIcons = computed(() => {
  const players = session.allPlayers || []
  return players
    .filter(p => p.id !== userStore.userId && p.playerIcon && p.playerColor)
    .map(p => ({
      iconId: p.playerIcon,
      colorId: p.playerColor,
      playerName: p.name || 'Игрок'
    }))
})

// Модальное окно создания персонажа
const showCharacterCreator = ref(false)
// Данные приглашения для создания персонажа (constraints и inviteId)
const characterCreatorData = ref(null)

// Выбранные объекты на карте (для мобильной инфокарточки)
const selectedToken = ref(null)
const selectedHex = ref(null)

// Активное предложение реакции от мастера
const reactionPrompt = ref(null)

// Направление персонажа игрока
const playerFacing = computed(() => {
  if (!playerCharacter.value) return 0
  const mapId = battleMapStore.activeMapId
  if (!mapId) return 0
  // Получаем позицию токена персонажа из карты (включает facing)
  const tokenPos = battleMapStore.findTokenPosition(mapId, playerCharacter.value.id)
  return tokenPos?.facing || 0
})

// Позиция токена игрока на карте
const playerTokenPosition = computed(() => {
  if (!playerCharacter.value) return null
  const mapId = battleMapStore.activeMapId
  if (!mapId) return null
  return battleMapStore.findTokenPosition(mapId, playerCharacter.value.id)
})

// Активная карта
const activeMap = computed(() => battleMapStore.activeMap)

// HexGrid для конвертации координат
const hexGrid = computed(() => {
  if (!activeMap.value) return null
  return new HexGrid({
    orientation: activeMap.value.orientation || 'flat',
    hexSize: activeMap.value.hexSize || 32
  })
})

// Используем composable для перемещения токенов
const { moveToken } = useTokenMovement({
  battleMapStore,
  terrainStore,
  getHexGrid: () => hexGrid.value
})

// Порядок вкладок для навигации
const navItems = [
  { id: 'chat', label: 'Чат', icon: '💬' },
  { id: 'character-sheet', label: 'Персонаж', icon: '👤' },
  { id: 'battle-map', label: 'Карта', icon: '🗺️' }
]

// Персонаж игрока
const playerCharacter = computed(() => {
  const userId = userStore.userId
  console.log('Поиск персонажа игрока:', { userId, characters: characters.value.length })
  const character = characters.value.find(char => char.ownerId === userId)
  console.log('Найденный персонаж:', character)
  return character
})

// Определение, чей сейчас ход (заглушка)
const currentTurn = ref(null)
const isPlayerTurn = computed(() => {
  // TODO: реализовать логику определения хода
  return true // пока что всегда ход игрока для тестирования
})

onMounted(async () => {
  const roomIdParam = route.params.roomId
  
  if (!roomIdParam) {
    router.push('/')
    return
  }
  
  // Настройка мобильного viewport
  if (isMobile.value) {
    setupMobileViewport()
  }
  
  // Проверяем, настроен ли профиль игрока
  if (!userStore.isProfileComplete) {
    showProfileSetup.value = true
  }
  
  // Подключаемся к комнате
  try {
    session.joinRoom(roomIdParam)
    isConnecting.value = false
    
    // Настраиваем слушатель реакций после подключения
    setupReactionListener()
  } catch (error) {
    connectionError.value = 'Не удалось подключиться к комнате'
    isConnecting.value = false
  }
  
  // Слушаем изменения размера экрана
  const handleResize = () => {
    isMobile.value = isMobileScreen()
  }
  window.addEventListener('resize', handleResize)
  
  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
  })
})

onUnmounted(() => {
  session.leaveRoom()
})

const setView = (view) => {
  activeView.value = view
}

const leaveRoom = () => {
  session.leaveRoom()
  router.push('/')
}

// Обработчики настройки профиля
const handleProfileComplete = (profile) => {
  showProfileSetup.value = false
  // Профиль сохранён в store, уведомление отправлено через notifyProfileUpdate
}

const handleProfileCancel = () => {
  showProfileSetup.value = false
  // Если профиль не настроен и пользователь отменил, всё равно продолжаем
}

// Мобильные действия
const handleSelectAction = (action) => {
  pendingAction.value = {
    id: action.id,
    title: action.label,
    description: getActionDescription(action.id),
    icon: action.icon,
    canConfirm: false // будет изменяться в зависимости от выбора на карте
  }
}

const handleConfirmAction = () => {
  if (pendingAction.value && pendingAction.value.target) {
    console.log('Выполняем действие:', pendingAction.value.id, 'цель:', pendingAction.value.target)
    
    if (pendingAction.value.id === 'move' && pendingAction.value.target.type === 'hex') {
      // Перемещаем персонажа игрока
      movePlayerCharacter(pendingAction.value.target.hex)
    } else if (pendingAction.value.id === 'attack' && pendingAction.value.target.characterId) {
      // Атакуем цель
      attackTarget(pendingAction.value.target)
    }
    
    pendingAction.value = null
  }
}

/**
 * Функция получения данных террейна для pathfinding
 * Учитывает способности персонажа и блокировку токенами
 */
const getTerrainAtFn = (character = null) => {
  const mapId = battleMapStore.activeMapId
  if (!mapId) return () => null
  
  // Собираем теги способностей персонажа
  const characterTags = new Set()
  if (character) {
    // Базовые способности движения
    const abilities = character.movementModifiers || character.abilities || {}
    if (abilities.flight) characterTags.add('flight')
    if (abilities.swimming) characterTags.add('swimming')
    if (abilities.phasing) characterTags.add('phasing')
    if (abilities.climbing) characterTags.add('climbing')
    
    // Дополнительные теги из персонажа
    if (character.movementTags) {
      character.movementTags.forEach(tag => characterTags.add(tag))
    }
  }
  
  return (q, r) => {
    return battleMapStore.getHexPathfindingData(mapId, q, r, terrainStore, {
      viewerId: character?.id,
      characterTags
    })
  }
}

/**
 * Обновить отображение зоны движения для персонажа
 */
const updateMovementRange = (character) => {
  if (!character) {
    pointerStore.hideMovementRange()
    return
  }
  
  const mapId = battleMapStore.activeMapId
  if (!mapId) return
  
  const tokenPos = battleMapStore.findTokenPosition(mapId, character.id)
  if (!tokenPos) return
  
  // Получаем доступные очки движения
  let movementPoints = charactersStore.getAvailableMovement(character.id)
  if (movementPoints === 0) {
    movementPoints = character.combat?.movement?.current ?? 5
  }
  
  if (movementPoints <= 0) {
    pointerStore.hideMovementRange()
    return
  }
  
  // Вычисляем зону досягаемости с учётом способностей персонажа
  const getTerrainAt = getTerrainAtFn(character)
  const reachableMap = getReachableHexes(
    { q: tokenPos.q, r: tokenPos.r },
    movementPoints,
    getTerrainAt,
    { modifiers: character.movementModifiers || {} }
  )
  const hexes = reachableMapToArray(reachableMap)
  
  pointerStore.showMovementRange(
    character.id,
    { q: tokenPos.q, r: tokenPos.r },
    hexes,
    movementPoints
  )
}

const movePlayerCharacter = (targetHex, facing = null) => {
  const character = playerCharacter.value
  if (!character) {
    console.warn('Персонаж игрока не найден')
    return
  }
  
  // Получаем ID активной карты
  const mapId = battleMapStore.activeMapId
  if (!mapId) {
    console.warn('Нет активной карты для перемещения')
    return
  }
  
  // Находим текущую позицию токена
  const currentPos = battleMapStore.findTokenPosition(mapId, character.id)
  
  // Если токен уже на карте - вычисляем стоимость пути и анимируем
  if (currentPos) {
    // Предварительно вычисляем стоимость пути для проверки очков движения
    const getTerrainAt = getTerrainAtFn(character)
    const pathResult = findPath(
      { q: currentPos.q, r: currentPos.r },
      { q: targetHex.q, r: targetHex.r },
      getTerrainAt,
      { modifiers: character.movementModifiers || {} }
    )
    
    if (!pathResult.found) {
      console.warn('Путь до целевого гекса не найден')
      return
    }
    
    const movementCost = pathResult.totalCost
    const availableMovement = charactersStore.getAvailableMovement(character.id)
    
    console.log(`Перемещение: стоимость ${movementCost}, доступно ${availableMovement}`)
    
    if (movementCost > availableMovement) {
      console.warn(`Недостаточно очков движения: нужно ${movementCost}, есть ${availableMovement}`)
      return
    }
    
    // Списываем очки движения
    const spent = charactersStore.spendMovement(character.id, movementCost)
    if (!spent) {
      console.warn('Не удалось списать очки движения')
      return
    }
    console.log(`Потрачено ${movementCost} ОД, осталось ${charactersStore.getAvailableMovement(character.id)}`)
    
    const isConnectedToMaster = session.role === 'player' && session.status === 'in-room'
    
    // Перемещаем токен с анимацией через composable
    const result = moveToken({
      characterId: character.id,
      targetHex,
      facing,
      pathfindingOptions: { modifiers: character.movementModifiers || {} },
      
      // Отправляем анимацию мастеру ПЕРЕД началом локальной анимации
      onBeforeAnimate: ({ characterId, path, duration, facing: animFacing }) => {
        if (isConnectedToMaster) {
          console.log('Отправляем анимацию мастеру для синхронизации...')
          session.broadcastTokenAnimation(characterId, path, duration, animFacing)
        }
      },
      
      // По завершении анимации
      onComplete: ({ finalFacing, targetHex: finalHex }) => {
        console.log('Анимация перемещения завершена')
        
        // Обновляем позицию в charactersStore для синхронизации
        if (!character.combat?.position) {
          charactersStore.placeOnMap(character.id, mapId, finalHex.q, finalHex.r)
        } else {
          charactersStore.moveOnMap(character.id, finalHex.q, finalHex.r)
        }
        
        // Обновляем зону движения после перемещения
        updateMovementRange(character)
        
        // Отправляем финальную позицию мастеру
        if (isConnectedToMaster) {
          console.log('Отправляем финальную позицию мастеру, facing:', finalFacing)
          session.broadcastCharacterMove(character.id, finalHex.q, finalHex.r, finalFacing)
        }
      }
    })
    
    if (!result.success) {
      console.warn('Ошибка перемещения:', result.error)
      // Возвращаем потраченные очки движения при ошибке
      // TODO: charactersStore.refundMovement(character.id, movementCost)
    }
    
    return // Анимация запущена, выход из функции
  }
  
  // Токен не на карте - размещаем впервые (без анимации)
  console.log(`Размещаем персонажа ${character.name} на гекс q:${targetHex.q}, r:${targetHex.r}, facing:${facing}`)
  
  const placed = battleMapStore.placeToken(mapId, character.id, targetHex.q, targetHex.r, facing || 0)
  if (placed) {
    console.log('Токен успешно размещен на карте')
  } else {
    console.warn('Не удалось разместить токен на карте. Возможно гекс занят.')
    return
  }
  
  // Также обновляем позицию в charactersStore для синхронизации
  if (!character.combat?.position) {
    charactersStore.placeOnMap(character.id, mapId, targetHex.q, targetHex.r)
  } else {
    charactersStore.moveOnMap(character.id, targetHex.q, targetHex.r)
  }
  
  // Обновляем зону движения после перемещения
  updateMovementRange(character)
  
  // Если есть сессия, отправляем обновление мастеру
  const isConnectedToMaster = session.role === 'player' && session.status === 'in-room'
  console.log('Проверка сессии для отправки:', { 
    role: session.role, 
    status: session.status,
    isConnectedToMaster 
  })
  if (isConnectedToMaster) {
    console.log('Отправляем перемещение мастеру...')
    session.broadcastCharacterMove(character.id, targetHex.q, targetHex.r, facing)
  }
}

const attackTarget = (target) => {
  console.log('Атакуем цель:', target.characterId)
  // TODO: реализовать логику атаки
}

const handleActionTargetSelected = (target) => {
  if (pendingAction.value) {
    pendingAction.value.target = target
    pendingAction.value.canConfirm = true
    
    // Обновляем описание с информацией о цели
    if (target.type === 'hex') {
      pendingAction.value.description = `Переместиться на гекс (${target.hex.q}, ${target.hex.r})`
    } else if (target.characterId) {
      pendingAction.value.description = `Цель: ${target.character?.name || 'Неизвестный'}`
    }
  }
}

const handleCancelAction = () => {
  pendingAction.value = null
}

const getActionDescription = (actionId) => {
  const descriptions = {
    move: 'Выберите место для перемещения',
    attack: 'Выберите цель для атаки', 
    defend: 'Выберите сектор защиты',
    skill: 'Выберите навык и цель',
    ready: 'Сигнализировать о готовности',
    help: 'Показать справку'
  }
  return descriptions[actionId] || 'Выберите действие'
}

// Обработчики событий карты для мобильного интерфейса
const handleTokenSelected = (token) => {
  selectedToken.value = token
  // При выборе токена сбрасываем выбранный гекс
  if (token) {
    selectedHex.value = null
  }
}

const handleHexSelected = (hex) => {
  selectedHex.value = hex
  // При выборе гекса сбрасываем токен только если это пустой гекс
  // selectedToken остаётся если кликнули на гекс с токеном
}

// Обработчик перемещения на гекс (из инфокарточки)
const handleMoveToHex = (hex) => {
  if (!hex) return
  console.log('Перемещение на гекс из инфокарточки:', hex)
  movePlayerCharacter(hex)
  // Сбрасываем выбранный гекс после перемещения
  selectedHex.value = null
}

// Обработчик двойного тапа по гексу (перемещение)
const handleHexDoubleTap = (data) => {
  if (!data) return
  if (!isPlayerTurn.value) return
  // data теперь содержит { q, r, terrain, facing }
  const hex = { q: data.q, r: data.r }
  const facing = data.facing ?? null
  console.log('Двойной тап по гексу - перемещение:', hex, 'facing:', facing)
  movePlayerCharacter(hex, facing)
  // Сбрасываем выбранный гекс после перемещения
  selectedHex.value = null
}

// Обработчик long press - перемещение с выбором направления (промежуточный шаг)
const handleHexLongPressMove = (data) => {
  if (!data?.hex) return
  if (!isPlayerTurn.value) return
  console.log('Long press move - перемещение с выбором направления:', data)
  // Перемещаем персонажа с сохранением текущего направления
  // Финальное направление будет установлено в handleHexLongPressConfirm
  movePlayerCharacter(data.hex, data.facing)
}

// Обработчик подтверждения направления после long press
const handleHexLongPressConfirm = (data) => {
  if (!data?.hex) return
  if (!isPlayerTurn.value) return
  console.log('Long press confirm - финальное направление:', data)
  
  // Обновляем направление токена
  const character = playerCharacter.value
  if (!character) return
  
  const mapId = battleMapStore.activeMapId
  if (!mapId) return
  
  const position = battleMapStore.findTokenPosition(mapId, character.id)
  if (position) {
    battleMapStore.rotateToken(mapId, position.q, position.r, data.facing)
    console.log(`Направление персонажа обновлено на ${data.facing}`)
    
    // Отправляем обновление мастеру
    const isConnectedToMaster = session.role === 'player' && session.status === 'in-room'
    if (isConnectedToMaster) {
      session.broadcastCharacterMove(character.id, position.q, position.r, data.facing)
    }
  }
  
  // Сбрасываем выбранный гекс
  selectedHex.value = null
}

// Обработчик поворота токена на месте (long press на своём токене)
const handleTokenRotate = (data) => {
  if (!data) return
  if (!isPlayerTurn.value) return
  console.log('Token rotate - поворот на месте:', data)
  
  const character = playerCharacter.value
  if (!character) return
  
  const mapId = battleMapStore.activeMapId
  if (!mapId) return
  
  const position = battleMapStore.findTokenPosition(mapId, character.id)
  if (position) {
    battleMapStore.rotateToken(mapId, position.q, position.r, data.facing)
    console.log(`Направление персонажа обновлено на ${data.facing}`)
    
    // Отправляем обновление мастеру
    const isConnectedToMaster = session.role === 'player' && session.status === 'in-room'
    if (isConnectedToMaster) {
      session.broadcastCharacterMove(character.id, position.q, position.r, data.facing)
    }
  }
}

// Обработчик смены снаряжения
const handleSwitchEquipment = () => {
  // TODO: открыть модалку смены снаряжения
  console.log('Смена снаряжения')
}

// Открыть лист конкретного персонажа
const handleOpenCharacterSheet = (characterId) => {
  if (characterId) {
    // Устанавливаем активного персонажа перед открытием листа
    charactersStore.setActiveCharacter(characterId)
  }
  setView('character-sheet')
}

// Обработчики реакций
const handleReactionAccept = (reactionId) => {
  console.log('Игрок принял реакцию:', reactionId)
  // Отправляем ответ мастеру
  if (session.status === 'in-room') {
    session.sendReactionResponse(reactionId, true)
  }
  reactionPrompt.value = null
}

const handleReactionDecline = (reactionId) => {
  console.log('Игрок отклонил реакцию:', reactionId)
  // Отправляем ответ мастеру
  if (session.status === 'in-room') {
    session.sendReactionResponse(reactionId, false)
  }
  reactionPrompt.value = null
}

// Обработчик клика по приглашению создать персонажа
const handleCreateCharacter = (data) => {
  // data может быть объектом с constraints и inviteId или пустым
  characterCreatorData.value = data || null
  showCharacterCreator.value = true
}

// Закрытие окна создания персонажа
const closeCharacterCreator = () => {
  showCharacterCreator.value = false
  characterCreatorData.value = null
}

// Обработчик создания персонажа
const handleCharacterCreated = (character) => {
  console.log('Персонаж создан:', character)
  
  // Если персонаж создан по приглашению - обновляем событие
  if (characterCreatorData.value?.inviteId && character) {
    const inviteId = characterCreatorData.value.inviteId
    
    // Обновляем событие локально
    sceneLogStore.markInviteUsed(inviteId, {
      userId: userStore.userId,
      characterId: character.id,
      characterName: character.name,
      characterPortrait: character.portrait
    })
    
    // Отправляем мастеру уведомление об использовании приглашения
    session.sendInviteUsed(inviteId, {
      userId: userStore.userId,
      characterId: character.id,
      characterName: character.name,
      characterPortrait: character.portrait
    })
  }
  
  closeCharacterCreator()
}

// Слушатель сообщений от мастера о реакциях
const setupReactionListener = () => {
  // Это будет вызвано когда сессия установлена
  session.onMessage('reaction-prompt', (payload) => {
    console.log('Получено предложение реакции:', payload)
    reactionPrompt.value = {
      id: payload.id,
      title: payload.title || 'Реакция!',
      description: payload.description || 'Можете использовать реакцию',
      timeoutSeconds: payload.timeoutSeconds || 5,
      startedAt: Date.now()
    }
  })
  
  // Слушатель событий сцены от мастера
  session.onMessage('scene-event', (payload) => {
    console.log('Получено событие сцены:', payload)
    if (payload.event) {
      sceneLogStore.handleIncomingEvent(payload.event)
    }
  })
  
  // Слушатель синхронизации всех событий сцены (при подключении)
  session.onMessage('scene-sync', (payload) => {
    console.log('Получена синхронизация событий сцены:', payload.events?.length || 0, 'событий')
    if (payload.events && Array.isArray(payload.events)) {
      sceneLogStore.syncEvents(payload.events)
    }
    if (payload.currentImage) {
      sceneLogStore.setSceneImage(
        payload.currentImage.url,
        payload.currentImage.description,
        payload.currentImage.sentBy
      )
    }
  })
  
  // Слушатель скрытия события от мастера
  session.onMessage('scene-event-hide', (payload) => {
    console.log('Мастер скрыл событие:', payload.eventId)
    if (payload.eventId) {
      sceneLogStore.removeEvent(payload.eventId)
    }
  })
}
</script>

<template>
  <div class="h-screen bg-slate-950 text-slate-50 flex flex-col overflow-hidden">
    <!-- Loading state -->
    <div v-if="isConnecting" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="animate-spin text-4xl mb-4">⏳</div>
        <p class="text-slate-400">Подключение к комнате...</p>
      </div>
    </div>
    
    <!-- Error state -->
    <div v-else-if="connectionError" class="flex-1 flex items-center justify-center">
      <div class="text-center">
        <div class="text-4xl mb-4">😔</div>
        <p class="text-rose-400 mb-4">{{ connectionError }}</p>
        <button
          type="button"
          class="px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition"
          @click="router.push('/')"
        >
          Вернуться
        </button>
      </div>
    </div>
    
    <!-- Game Interface (adaptive for mobile and desktop) -->
    <template v-else>
      <GameLayout
        :character="playerCharacter"
        :characters="characters"
        :selected-token="selectedToken"
        :selected-hex="selectedHex"
        :player-facing="playerFacing"
        :player-token-position="playerTokenPosition"
        :is-master="false"
        :connection-status="status"
        :current-turn="currentTurn"
        :is-player-turn="isPlayerTurn"
        :pending-action="pendingAction"
        :reaction-prompt="reactionPrompt"
        @set-view="setView"
        @leave-room="leaveRoom"
        @select-action="handleSelectAction"
        @confirm-action="handleConfirmAction"
        @cancel-action="handleCancelAction"
        @switch-equipment="handleSwitchEquipment"
        @reaction-accept="handleReactionAccept"
        @reaction-decline="handleReactionDecline"
        @open-character-sheet="handleOpenCharacterSheet"
        @move-to-hex="handleMoveToHex"
        @token-selected="handleTokenSelected"
        @hex-selected="handleHexSelected"
        @hex-double-tap="handleHexDoubleTap"
        @hex-long-press-move="handleHexLongPressMove"
        @hex-long-press-confirm="handleHexLongPressConfirm"
        @token-rotate="handleTokenRotate"
        @action-target-selected="handleActionTargetSelected"
        @create-character="handleCreateCharacter"
      />
      
      <!-- Модальное окно создания персонажа -->
      <Teleport to="body">
        <div v-if="showCharacterCreator" class="character-creator-modal">
          <CharacterWizard 
            :constraints="characterCreatorData?.constraints"
            :invite-id="characterCreatorData?.inviteId"
            @close="closeCharacterCreator"
            @created="handleCharacterCreated"
          />
        </div>
      </Teleport>
      
      <!-- Модальное окно настройки профиля игрока -->
      <Teleport to="body">
        <PlayerProfileSetup
          v-if="showProfileSetup"
          :taken-icons="takenIcons"
          @complete="handleProfileComplete"
          @cancel="handleProfileCancel"
        />
      </Teleport>
    </template>
    
    <!-- Сплеш-оверлей для эффектов от мастера -->
    <SplashOverlay />
  </div>
</template>

<style scoped>
/* Модальное окно создания персонажа */
.character-creator-modal {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: #0f172a;
  overflow-y: auto;
}
</style>
