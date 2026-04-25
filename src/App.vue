<script setup>
/**
 * App.vue - корневой компонент с роутером
 */
import { RouterView } from 'vue-router'
import GlobalDebugPanel from '@/components/shared/GlobalDebugPanel.vue'
import { useGlobalDebug } from '@/composables/useGlobalDebug'

// Initialize global debug system (Ctrl+Shift+D to open)
useGlobalDebug()
</script>

<template>
  <RouterView />
  <GlobalDebugPanel />
</template>

<style>
/* Глобальные стили в main.css */
</style>
