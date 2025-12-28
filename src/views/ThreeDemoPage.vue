<script setup>
/**
 * Страница демонстрации Three.js рендерера
 */

import { ref, computed } from 'vue'
import ThreeHexDemo from '@/components/shared/ThreeHexDemo.vue'

// Создаём тестовые гексы
const hexes = ref(new Map())

// Тестовые террейны
const terrains = {
  grass: {
    id: 'grass',
    name: 'Трава',
    color: '#4a7c59',
    categoryTags: { elevation: 'flat' },
    layers: [
      { type: 'noise', enabled: true, color: '#5a8c69', noiseScale: 0.02, noiseOctaves: 4 }
    ]
  },
  water: {
    id: 'water',
    name: 'Вода',
    color: '#2563eb',
    categoryTags: { elevation: 'submerged' },
    layers: [
      { type: 'noise', enabled: true, color: '#3b82f6', noiseScale: 0.03, noiseOctaves: 3 }
    ]
  },
  mountain: {
    id: 'mountain',
    name: 'Горы',
    color: '#6b7280',
    categoryTags: { elevation: 'high' },
    layers: [
      { type: 'noise', enabled: true, color: '#9ca3af', noiseScale: 0.05, noiseOctaves: 5 }
    ]
  },
  sand: {
    id: 'sand',
    name: 'Песок',
    color: '#d4a574',
    categoryTags: { elevation: 'low' },
    layers: [
      { type: 'noise', enabled: true, color: '#e4b584', noiseScale: 0.04, noiseOctaves: 2 }
    ]
  },
  forest: {
    id: 'forest',
    name: 'Лес',
    color: '#2d5a27',
    categoryTags: { elevation: 'elevated' },
    layers: [
      { type: 'noise', enabled: true, color: '#3d6a37', noiseScale: 0.025, noiseOctaves: 4 }
    ]
  }
}

// Генерируем карту
function generateMap() {
  const map = new Map()
  const radius = 8
  
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (Math.abs(q + r) <= radius) {
        // Выбираем террейн по паттерну
        let terrainId = 'grass'
        
        const dist = Math.sqrt(q * q + r * r + q * r)
        
        if (dist < 2) {
          terrainId = 'water'
        } else if (dist > 6) {
          terrainId = Math.random() > 0.5 ? 'mountain' : 'forest'
        } else if (q > 3 && r < 0) {
          terrainId = 'sand'
        } else if (Math.random() > 0.8) {
          terrainId = 'forest'
        }
        
        map.set(`${q},${r}`, {
          q,
          r,
          terrain: terrains[terrainId]
        })
      }
    }
  }
  
  hexes.value = map
}

// Генерируем карту при загрузке
generateMap()

const getTerrainById = (id) => terrains[id] || null

const handleHexClick = (hexData) => {
  console.log('Clicked hex:', hexData)
}

const handleHexHover = (hexData) => {
  // console.log('Hover hex:', hexData.q, hexData.r)
}
</script>

<template>
  <div class="three-demo-page">
    <header class="demo-header">
      <h1>🎮 Three.js Hex Map Demo</h1>
      <p>3D рендер с ортографической камерой — выглядит как 2D!</p>
      <button @click="generateMap" class="regen-btn">🔄 Regenerate Map</button>
    </header>
    
    <div class="demo-container">
      <ThreeHexDemo
        :hexes="hexes"
        :hex-size="35"
        :get-terrain-by-id="getTerrainById"
        @hex-click="handleHexClick"
        @hex-hover="handleHexHover"
      />
    </div>
    
    <div class="features">
      <h3>Что демонстрируется:</h3>
      <ul>
        <li>✅ Ортографическая камера (2D вид)</li>
        <li>✅ GPU шейдеры для генерации шума</li>
        <li>✅ Высоты гексов (elevation)</li>
        <li>✅ Pan/Zoom управление</li>
        <li>✅ Hover detection через Raycast</li>
        <li>✅ Освещение (ambient + directional)</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.three-demo-page {
  width: 100vw;
  height: 100vh;
  background: #0f0f1a;
  color: white;
  display: flex;
  flex-direction: column;
  padding: 16px;
  box-sizing: border-box;
}

.demo-header {
  text-align: center;
  padding: 16px;
}

.demo-header h1 {
  margin: 0 0 8px;
  font-size: 24px;
}

.demo-header p {
  margin: 0 0 16px;
  color: #888;
}

.regen-btn {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.regen-btn:hover {
  background: #2563eb;
}

.demo-container {
  flex: 1;
  border: 1px solid #333;
  border-radius: 8px;
  overflow: hidden;
  min-height: 400px;
}

.features {
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-top: 16px;
}

.features h3 {
  margin: 0 0 8px;
}

.features ul {
  margin: 0;
  padding-left: 20px;
}

.features li {
  margin: 4px 0;
  color: #aaa;
}
</style>
