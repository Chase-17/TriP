<script setup>
/**
 * MasterRoom - полнофункциональная комната мастера
 * Использует GameLayout с isMaster=true для единого интерфейса
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import { useBattleMapStore } from '@/stores/battleMap'
import { useSceneLogStore } from '@/stores/sceneLog'
import { useCharactersStore } from '@/stores/characters'
import { useInteractionStore } from '@/stores/interaction'
import { usePointerStore } from '@/stores/pointer'
import { useTerrainStore } from '@/stores/terrain'
import GameLayout from '@/components/layout/GameLayout.vue'
import { HexGrid } from '@/utils/hex'
import { useTokenMovement } from '@/composables/useTokenMovement'
import { safeStoreToRefs, safeUseStore } from '@/utils/safeStoreRefs'

const route = useRoute()
const router = useRouter()
const session = safeUseStore(useSessionStore, 'session')
const userStore = safeUseStore(useUserStore, 'user')
const battleMapStore = safeUseStore(useBattleMapStore, 'battleMap')
const sceneLogStore = safeUseStore(useSceneLogStore, 'sceneLog')
const charactersStore = safeUseStore(useCharactersStore, 'characters')
const interactionStore = safeUseStore(useInteractionStore, 'interaction')
const pointerStore = safeUseStore(usePointerStore, 'pointer')
const terrainStore = safeUseStore(useTerrainStore, 'terrain')

const { roomId = ref(''), status = ref(''), connections = ref([]) } = safeStoreToRefs(session, 'session')
const { characters = ref([]) } = safeStoreToRefs(charactersStore, 'characters')

// Computed свойства для отображения в GameLayout
const players = computed(() => connections.value || [])

onMounted(async () => {
  const roomIdParam = route.params.roomId
  
  if (!roomIdParam) {
    router.push('/master')
    return
  }
  
  // Устанавливаем роль мастера и roomId
  session.setRole('master')
  session.roomId = roomIdParam
  
  // Создаём комнату как мастер (хост)
  try {
    await session.createRoom()
    
    // Слушатель событий сцены от игроков (результаты проверок и т.д.)
    session.onMessage('scene-event', (payload) => {
      console.log('Получено событие сцены от игрока:', payload)
      if (payload.event) {
        sceneLogStore.handleIncomingEvent(payload.event)
      }
    })
    
    // Обработка результатов проверки навыков от игроков
    session.onMessage('skill-check-result', (payload) => {
      console.log('Получен результат проверки от игрока:', payload)
      // Обновляем событие в логе мастера
      if (payload.eventId && payload.result) {
        sceneLogStore.updateEvent(payload.eventId, {
          completed: true,
          result: payload.result,
          completedBy: payload.senderId,
          completedAt: Date.now(),
          characterName: payload.characterName
        })
      }
    })
  } catch (error) {
    console.error('Ошибка создания комнаты:', error)
  }
})

onUnmounted(() => {
  session.leaveRoom()
})

const leaveRoom = () => {
  session.leaveRoom()
  router.push('/master')
}

// Выбранный токен/гекс (для совместимости с GameLayout)
const selectedToken = ref(null)
const selectedHex = ref(null)

// Получить HexGrid для активной карты
const getActiveHexGrid = () => {
  const map = battleMapStore.activeMap
  if (!map) return null
  return new HexGrid({
    orientation: map.orientation || 'flat',
    hexSize: map.hexSize || 32,
    origin: { x: 0, y: 0 }
  })
}

// Используем composable для перемещения токенов
const { moveToken } = useTokenMovement({
  battleMapStore,
  terrainStore,
  getHexGrid: getActiveHexGrid
})

/**
 * Обработка подтверждения перемещения токена (двойной клик / повторный клик на гекс)
 * Мастер может перемещать любой токен с анимацией
 * Использует общий composable useTokenMovement
 */
const handleHexDoubleTap = (data) => {
  if (!data) return
  
  const targetHex = { q: data.q, r: data.r }
  const facing = data.facing  // Уже вычислено в BattleMap как selectedFacing ?? suggestedFacing
  
  console.log('[MasterRoom] hex-double-tap:', targetHex, 'facing:', facing, 'selectedToken:', selectedToken.value)
  
  if (!selectedToken.value) {
    console.log('[MasterRoom] Нет выбранного токена')
    return
  }
  
  const token = selectedToken.value
  const mapId = battleMapStore.activeMapId

  // Перемещаем токен с анимацией через composable
  const result = moveToken({
    characterId: token.characterId,
    targetHex,
    facing,
    pathfindingOptions: { modifiers: {}, maxCost: 100 },
    
    // Отправляем анимацию игрокам ПЕРЕД началом локальной анимации
    onBeforeAnimate: ({ characterId, path, duration, facing: animFacing }) => {
      session.broadcastTokenAnimationToPlayers(characterId, path, duration, animFacing)
    },
    
    // По завершении анимации
    onComplete: ({ finalFacing, targetHex: finalHex }) => {
      // Отправляем финальную позицию игрокам
      session.broadcastMapTokenMove(mapId, token.characterId, finalHex.q, finalHex.r)
      
      // Обновляем selectedToken с новыми координатами
      selectedToken.value = {
        ...selectedToken.value,
        q: finalHex.q,
        r: finalHex.r
      }
      
      // Сбрасываем состояние интеракции
      interactionStore.reset()
      pointerStore.hideHoveredPath()
    }
  })

  // Если это был только поворот (токен уже на целевом гексе)
  if (result.success && result.rotateOnly) {
    session.broadcastMapTokenMove(mapId, token.characterId, targetHex.q, targetHex.r)
  }

  if (!result.success) {
    console.warn('[MasterRoom] Ошибка перемещения:', result.error)
  }
}
</script>

<template>
  <GameLayout
    :is-master="true"
    :character="null"
    :characters="characters"
    :selected-token="selectedToken"
    :selected-hex="selectedHex"
    :player-facing="0"
    :player-token-position="null"
    :connection-status="status"
    :current-turn="null"
    :is-player-turn="true"
    :pending-action="null"
    :reaction-prompt="null"
    @leave-room="leaveRoom"
    @token-selected="(token) => selectedToken = token"
    @hex-selected="(hex) => selectedHex = hex"
    @hex-double-tap="handleHexDoubleTap"
  />
</template>
