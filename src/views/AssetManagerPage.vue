<template>
  <div class="asset-manager-page">
    <header class="page-header">
      <h1>Three.js Asset Manager</h1>
      <div class="header-actions">
        <button @click="exportAssets" class="btn">📤 Экспорт</button>
        <button @click="triggerImport" class="btn">📥 Импорт</button>
        <input
          type="file"
          ref="fileInput"
          @change="importAssets"
          accept=".json"
          style="display: none"
        />
        <router-link to="/" class="btn btn-secondary">← Назад</router-link>
      </div>
    </header>
    <main class="page-content">
      <ThreeAssetManager />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ThreeAssetManager from '@/components/threeAssetManager/ThreeAssetManager.vue'
import { useThreeAssetsStore } from '@/stores/threeAssets'

const store = useThreeAssetsStore()
const fileInput = ref(null)

function exportAssets() {
  const data = store.exportAll()
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = `three-assets-${Date.now()}.json`
  a.click()
  
  URL.revokeObjectURL(url)
}

function triggerImport() {
  fileInput.value?.click()
}

function importAssets(event) {
  const file = event.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const success = store.importAll(e.target.result)
    if (success) {
      alert('Импорт успешен!')
    } else {
      alert('Ошибка импорта')
    }
  }
  reader.readAsText(file)
  
  // Reset input
  event.target.value = ''
}
</script>

<style scoped>
.asset-manager-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #12122a;
  color: #e0e0e0;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #1a1a3a;
  border-bottom: 1px solid #2a2a4a;
}

.page-header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 14px;
  background: #3a3a6a;
  border: 1px solid #4a4a7a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 0.2s;
}

.btn:hover {
  background: #4a4a8a;
}

.btn-secondary {
  background: #2a2a4a;
  border-color: #3a3a5a;
}

.btn-secondary:hover {
  background: #3a3a5a;
}

.page-content {
  flex: 1;
  overflow: hidden;
}
</style>
