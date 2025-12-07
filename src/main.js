import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import router from './router'

import App from './App.vue'

import './assets/main.css'
import 'uno.css'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(router)

// Инициализируем профиль пользователя сразу при старте
import { useUserStore } from '@/stores/user'
const userStore = useUserStore()
userStore.initializeProfile()

app.mount('#app')
