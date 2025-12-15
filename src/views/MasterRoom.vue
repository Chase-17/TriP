<script setup>
/**
 * MasterRoom - полнофункциональная комната мастера
 * Использует GameLayout с isMaster=true для единого интерфейса
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import { useBattleMapStore } from '@/stores/battleMap'
import { useSceneLogStore } from '@/stores/sceneLog'
import { useCharactersStore } from '@/stores/characters'
import GameLayout from '@/components/GameLayout.vue'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const userStore = useUserStore()
const battleMapStore = useBattleMapStore()
const sceneLogStore = useSceneLogStore()
const charactersStore = useCharactersStore()

const { roomId, status, connections } = storeToRefs(session)
const { characters } = storeToRefs(charactersStore)

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
  />
</template>
