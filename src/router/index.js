/**
 * Vue Router configuration
 * 
 * Маршруты:
 * - / - страница игрока (присоединение к комнате)
 * - /room/:roomId - игровая комната (игрок)
 * - /master - панель мастера (создание/управление комнатами)
 * - /master/:roomId - мастерская комната (полный редактор)
 */

import { createRouter, createWebHistory } from 'vue-router'

// Ленивая загрузка страниц
const PlayerLobby = () => import('@/views/PlayerLobby.vue')
const PlayerRoom = () => import('@/views/PlayerRoom.vue')
const MasterPanel = () => import('@/views/MasterPanel.vue')
const MasterRoom = () => import('@/views/MasterRoom.vue')

const routes = [
  {
    path: '/',
    name: 'player-lobby',
    component: PlayerLobby,
    meta: {
      title: 'TriP - Присоединиться',
      role: 'player'
    }
  },
  {
    path: '/room/:roomId',
    name: 'player-room',
    component: PlayerRoom,
    meta: {
      title: 'TriP - Игровая комната',
      role: 'player'
    }
  },
  {
    path: '/master',
    name: 'master-panel',
    component: MasterPanel,
    meta: {
      title: 'TriP - Панель мастера',
      role: 'master'
    }
  },
  {
    path: '/master/:roomId',
    name: 'master-room',
    component: MasterRoom,
    meta: {
      title: 'TriP - Мастерская',
      role: 'master'
    }
  },
  {
    // Редирект неизвестных маршрутов
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// Установка заголовка страницы
router.beforeEach((to, from, next) => {
  document.title = to.meta.title || 'TriP Rooms'
  next()
})

export default router
