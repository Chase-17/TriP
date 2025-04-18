import { createRouter, createWebHistory } from 'vue-router'
import NewCharacterGuideView from '../views/NewCharacterGuideView.vue'
import OverviewView from '../views/OverviewView.vue'
import CharacterPageView from '../views/CharacterPageView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'overview',
      component: OverviewView
    },
    {
      path: '/new-character',
      name: 'new-character',
      component: NewCharacterGuideView
    },
    {
      path: '/character-page/:charKey',
      name: 'character-page',
      component: CharacterPageView
    },
    {
      path: '/wiki',
      name: 'about',
      // route level code-splitting
      // this generates a separate chunk (About.[hash].js) for this route
      // which is lazy-loaded when the route is visited.
      component: () => import('../views/WikiView.vue')
    }
  ]
})

export default router
