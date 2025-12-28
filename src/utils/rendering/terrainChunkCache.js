/**
 * TerrainChunkCache - LOD-система кэширования чанков текстур террейнов
 * 
 * Двухуровневая система:
 * - Preview (LOD 0): 128×128, JPEG quality 0.4 — для zoom ≤ 0.5
 * - Full (LOD 1): 256×256, JPEG quality 0.85 — для zoom > 0.5
 * 
 * Preview чанки генерируются синхронно и хранятся сжатыми.
 * Full чанки генерируются лениво по запросу.
 */

import { TerrainLayerRenderer } from './terrainLayerRenderer'

// Размеры чанков
export const CHUNK_SIZE_FULL = 256
export const CHUNK_SIZE_PREVIEW = 128

// JPEG качество
const JPEG_QUALITY_FULL = 0.85
const JPEG_QUALITY_PREVIEW = 0.4

// Лимиты кэша (JPEG сжатие экономит память)
const MAX_PREVIEW_CHUNKS = 2000  // ~4 МБ (2 КБ × 2000)
const MAX_FULL_CHUNKS = 1000    // ~20 МБ (20 КБ × 1000)

// Overlap для Voronoi эффектов
const VORONOI_OVERLAP = 32

/**
 * Класс для хранения чанка
 */
class ChunkEntry {
  constructor(blob, layersHash, size) {
    this.blob = blob           // JPEG Blob
    this.layersHash = layersHash
    this.size = size           // 'preview' | 'full'
    this.bitmap = null         // Декодированный ImageBitmap (lazy)
    this.lastUsed = Date.now()
  }
  
  /**
   * Получить ImageBitmap для отрисовки
   */
  async getBitmap() {
    if (this.bitmap) {
      this.lastUsed = Date.now()
      return this.bitmap
    }
    
    // Декодируем из JPEG
    this.bitmap = await createImageBitmap(this.blob)
    this.lastUsed = Date.now()
    return this.bitmap
  }
  
  /**
   * Освободить bitmap (оставляем blob)
   */
  releaseBitmap() {
    if (this.bitmap) {
      this.bitmap.close()
      this.bitmap = null
    }
  }
}

/**
 * Основной класс кэша чанков
 */
export class TerrainChunkCache {
  constructor() {
    // Раздельные кэши для preview и full
    this._previewChunks = new Map()  // key -> ChunkEntry
    this._fullChunks = new Map()     // key -> ChunkEntry
    
    // LRU порядок
    this._previewLRU = []
    this._fullLRU = []
    
    // Рендереры для разных размеров
    this._previewRenderer = null
    this._fullRenderer = null
    
    // Статистика
    this._stats = {
      previewHits: 0,
      previewMisses: 0,
      fullHits: 0,
      fullMisses: 0,
      evictions: 0
    }
    
    // Очередь на генерацию full чанков
    this._fullQueue = new Set()
    this._isProcessingQueue = false
  }
  
  /**
   * Ключ чанка
   */
  _getChunkKey(terrainId, chunkX, chunkY) {
    return `${terrainId}:${chunkX}:${chunkY}`
  }
  
  /**
   * Хеш слоёв для валидации кэша
   */
  _getLayersHash(layers, color) {
    if (!layers || layers.length === 0) return `solid:${color}`
    const enabledLayers = layers.filter(l => l.enabled !== false)
    if (enabledLayers.length === 0) return `solid:${color}`
    
    return JSON.stringify(enabledLayers.map(l => ({
      type: l.type,
      color: l.color,
      opacity: l.opacity,
      noiseType: l.noiseType,
      noiseScale: l.noiseScale,
      noiseOctaves: l.noiseOctaves,
      noisePersistence: l.noisePersistence,
      noiseLacunarity: l.noiseLacunarity,
      noiseContrast: l.noiseContrast,
      noiseSeed: l.noiseSeed,
      patternType: l.patternType,
      patternSize: l.patternSize,
      patternSpacing: l.patternSpacing,
      patternAngle: l.patternAngle,
      blendMode: l.blendMode
    })))
  }
  
  /**
   * Обновить LRU
   */
  _touchLRU(lruArray, key) {
    const idx = lruArray.indexOf(key)
    if (idx !== -1) {
      lruArray.splice(idx, 1)
    }
    lruArray.push(key)
  }
  
  /**
   * Evict старые чанки
   */
  _evictIfNeeded(cache, lruArray, maxSize) {
    while (cache.size > maxSize && lruArray.length > 0) {
      const oldestKey = lruArray.shift()
      const entry = cache.get(oldestKey)
      if (entry) {
        entry.releaseBitmap()
        cache.delete(oldestKey)
        this._stats.evictions++
      }
    }
  }
  
  /**
   * Генерация чанка в JPEG Blob
   */
  async _generateChunk(layers, worldX, worldY, size, quality) {
    const chunkSize = size === 'preview' ? CHUNK_SIZE_PREVIEW : CHUNK_SIZE_FULL
    
    // Проверяем Voronoi
    const enabledLayers = layers.filter(l => l.enabled !== false)
    const hasVoronoi = enabledLayers.some(l => l.noiseType === 'voronoi')
    const overlap = hasVoronoi ? VORONOI_OVERLAP : 0
    
    const totalSize = chunkSize + overlap * 2
    
    // Выбираем/создаём рендерер
    let renderer
    if (size === 'preview') {
      if (!this._previewRenderer || this._previewRenderer.width !== totalSize) {
        this._previewRenderer = new TerrainLayerRenderer(totalSize, totalSize)
      }
      renderer = this._previewRenderer
    } else {
      if (!this._fullRenderer || this._fullRenderer.width !== totalSize) {
        this._fullRenderer = new TerrainLayerRenderer(totalSize, totalSize)
      }
      renderer = this._fullRenderer
    }
    
    // Для preview нужно масштабировать worldOffset и noiseScale
    const scale = size === 'preview' ? 0.5 : 1
    
    // Рендерим
    renderer.render(enabledLayers, {
      hexMask: false,
      worldOffsetX: worldX - overlap / scale,
      worldOffsetY: worldY - overlap / scale,
      scale: scale
    })
    
    // Вырезаем центр если есть overlap
    let resultCanvas
    if (overlap > 0) {
      resultCanvas = document.createElement('canvas')
      resultCanvas.width = chunkSize
      resultCanvas.height = chunkSize
      const ctx = resultCanvas.getContext('2d')
      ctx.drawImage(
        renderer.canvas,
        overlap, overlap, chunkSize, chunkSize,
        0, 0, chunkSize, chunkSize
      )
    } else {
      resultCanvas = renderer.canvas
    }
    
    // Конвертируем в JPEG Blob
    return new Promise(resolve => {
      resultCanvas.toBlob(blob => resolve(blob), 'image/jpeg', quality)
    })
  }
  
  /**
   * Получить preview чанк (синхронно если есть, иначе генерируем)
   */
  async getPreviewChunk(terrain, chunkX, chunkY) {
    if (!terrain) return null
    
    const terrainId = terrain.id || 'unknown'
    const layers = terrain.layers || []
    const color = terrain.fallbackColor || terrain.color || '#888888'
    
    const enabledLayers = layers.filter(l => l.enabled !== false)
    if (enabledLayers.length === 0) return null
    
    const key = this._getChunkKey(terrainId, chunkX, chunkY)
    const layersHash = this._getLayersHash(layers, color)
    
    // Проверяем кэш
    const cached = this._previewChunks.get(key)
    if (cached && cached.layersHash === layersHash) {
      this._stats.previewHits++
      this._touchLRU(this._previewLRU, key)
      return cached.getBitmap()
    }
    
    // Генерируем
    this._stats.previewMisses++
    
    const worldX = chunkX * CHUNK_SIZE_FULL  // World coords всегда в full scale
    const worldY = chunkY * CHUNK_SIZE_FULL
    
    const blob = await this._generateChunk(
      enabledLayers, worldX, worldY, 
      'preview', JPEG_QUALITY_PREVIEW
    )
    
    // Сохраняем
    const entry = new ChunkEntry(blob, layersHash, 'preview')
    this._previewChunks.set(key, entry)
    this._touchLRU(this._previewLRU, key)
    this._evictIfNeeded(this._previewChunks, this._previewLRU, MAX_PREVIEW_CHUNKS)
    
    return entry.getBitmap()
  }
  
  /**
   * Получить full чанк
   */
  async getFullChunk(terrain, chunkX, chunkY) {
    if (!terrain) return null
    
    const terrainId = terrain.id || 'unknown'
    const layers = terrain.layers || []
    const color = terrain.fallbackColor || terrain.color || '#888888'
    
    const enabledLayers = layers.filter(l => l.enabled !== false)
    if (enabledLayers.length === 0) return null
    
    const key = this._getChunkKey(terrainId, chunkX, chunkY)
    const layersHash = this._getLayersHash(layers, color)
    
    // Проверяем кэш
    const cached = this._fullChunks.get(key)
    if (cached && cached.layersHash === layersHash) {
      this._stats.fullHits++
      this._touchLRU(this._fullLRU, key)
      return cached.getBitmap()
    }
    
    // Генерируем
    this._stats.fullMisses++
    
    const worldX = chunkX * CHUNK_SIZE_FULL
    const worldY = chunkY * CHUNK_SIZE_FULL
    
    const blob = await this._generateChunk(
      enabledLayers, worldX, worldY,
      'full', JPEG_QUALITY_FULL
    )
    
    // Сохраняем
    const entry = new ChunkEntry(blob, layersHash, 'full')
    this._fullChunks.set(key, entry)
    this._touchLRU(this._fullLRU, key)
    this._evictIfNeeded(this._fullChunks, this._fullLRU, MAX_FULL_CHUNKS)
    
    return entry.getBitmap()
  }
  
  /**
   * Получить чанк по текущему zoom уровню
   * @param {number} zoom - текущий zoom
   * @returns {Promise<ImageBitmap>}
   */
  async getChunk(terrain, chunkX, chunkY, zoom = 1) {
    // При zoom <= 0.5 достаточно preview
    if (zoom <= 0.5) {
      return this.getPreviewChunk(terrain, chunkX, chunkY)
    }
    
    // При zoom > 0.5 нужен full
    // Но сначала пытаемся вернуть full если есть
    const terrainId = terrain?.id || 'unknown'
    const key = this._getChunkKey(terrainId, chunkX, chunkY)
    const layers = terrain?.layers || []
    const color = terrain?.fallbackColor || terrain?.color || '#888888'
    const layersHash = this._getLayersHash(layers, color)
    
    const cachedFull = this._fullChunks.get(key)
    if (cachedFull && cachedFull.layersHash === layersHash) {
      this._stats.fullHits++
      this._touchLRU(this._fullLRU, key)
      return cachedFull.getBitmap()
    }
    
    // Full нет — возвращаем preview и ставим full в очередь
    const preview = await this.getPreviewChunk(terrain, chunkX, chunkY)
    
    // Ставим в очередь генерацию full
    this._queueFullGeneration(terrain, chunkX, chunkY)
    
    return preview
  }
  
  /**
   * Поставить full чанк в очередь на генерацию
   */
  _queueFullGeneration(terrain, chunkX, chunkY) {
    const key = this._getChunkKey(terrain?.id || 'unknown', chunkX, chunkY)
    
    if (this._fullQueue.has(key)) return
    
    this._fullQueue.add(key)
    
    // Храним данные для генерации
    if (!this._fullQueueData) this._fullQueueData = new Map()
    this._fullQueueData.set(key, { terrain, chunkX, chunkY })
    
    this._processQueue()
  }
  
  /**
   * Обработка очереди генерации
   */
  async _processQueue() {
    if (this._isProcessingQueue) return
    this._isProcessingQueue = true
    
    while (this._fullQueue.size > 0) {
      const key = this._fullQueue.values().next().value
      this._fullQueue.delete(key)
      
      const data = this._fullQueueData?.get(key)
      if (data) {
        await this.getFullChunk(data.terrain, data.chunkX, data.chunkY)
        this._fullQueueData.delete(key)
      }
      
      // Даём UI передохнуть
      await new Promise(r => setTimeout(r, 0))
    }
    
    this._isProcessingQueue = false
    
    // Уведомляем о готовности новых чанков
    if (this._onUpgradeCallback) {
      this._onUpgradeCallback()
    }
  }
  
  /**
   * Установить callback для уведомления о готовности full чанков
   */
  onUpgrade(callback) {
    this._onUpgradeCallback = callback
  }
  
  /**
   * Получить чанки для области (синхронная версия для рендеринга)
   * Возвращает то что есть в кэше, ставит недостающее в очередь
   */
  getChunksForAreaSync(terrain, minX, minY, maxX, maxY, zoom = 1) {
    const chunks = []
    const needFull = zoom > 0.5
    const chunkSize = CHUNK_SIZE_FULL  // Координаты всегда в full scale
    
    // Выравниваем по границам чанков
    const startChunkX = Math.floor(minX / chunkSize)
    const startChunkY = Math.floor(minY / chunkSize)
    const endChunkX = Math.floor(maxX / chunkSize)
    const endChunkY = Math.floor(maxY / chunkSize)
    
    const terrainId = terrain?.id || 'unknown'
    const layers = terrain?.layers || []
    const color = terrain?.fallbackColor || terrain?.color || '#888888'
    const layersHash = this._getLayersHash(layers, color)
    
    for (let cy = startChunkY; cy <= endChunkY; cy++) {
      for (let cx = startChunkX; cx <= endChunkX; cx++) {
        const key = this._getChunkKey(terrainId, cx, cy)
        
        let bitmap = null
        let actualSize = 'preview'
        
        // Пытаемся получить full если нужен
        if (needFull) {
          const fullEntry = this._fullChunks.get(key)
          if (fullEntry && fullEntry.layersHash === layersHash && fullEntry.bitmap) {
            bitmap = fullEntry.bitmap
            actualSize = 'full'
            this._stats.fullHits++
            this._touchLRU(this._fullLRU, key)
          }
        }
        
        // Fallback на preview
        if (!bitmap) {
          const previewEntry = this._previewChunks.get(key)
          if (previewEntry && previewEntry.layersHash === layersHash && previewEntry.bitmap) {
            bitmap = previewEntry.bitmap
            actualSize = 'preview'
            this._stats.previewHits++
            this._touchLRU(this._previewLRU, key)
            
            // Ставим full в очередь если нужен
            if (needFull) {
              this._queueFullGeneration(terrain, cx, cy)
            }
          }
        }
        
        // Если ничего нет — нужна асинхронная генерация
        if (!bitmap) {
          // Возвращаем null, вызывающий код должен запустить async генерацию
          chunks.push({
            bitmap: null,
            worldX: cx * chunkSize,
            worldY: cy * chunkSize,
            size: null,
            chunkX: cx,
            chunkY: cy,
            needsGeneration: true
          })
        } else {
          chunks.push({
            bitmap,
            worldX: cx * chunkSize,
            worldY: cy * chunkSize,
            size: actualSize,
            chunkX: cx,
            chunkY: cy,
            needsGeneration: false
          })
        }
      }
    }
    
    // Debug
    const foundCount = chunks.filter(c => c.bitmap).length
    const fullCount = chunks.filter(c => c.size === 'full').length
    const previewCount = chunks.filter(c => c.size === 'preview').length
    if (foundCount < chunks.length) {
      console.warn(`[ChunkCache] getChunksForAreaSync: found ${foundCount}/${chunks.length} (full: ${fullCount}, preview: ${previewCount})`)
    }
    
    return chunks
  }
  
  /**
   * Предзагрузить чанки для области (async)
   * При zoom > 0.5 генерирует FULL чанки напрямую (не через очередь)
   */
  async preloadChunksForArea(terrain, minX, minY, maxX, maxY, zoom = 1) {
    const chunkSize = CHUNK_SIZE_FULL
    const needFull = zoom > 0.5
    
    const startChunkX = Math.floor(minX / chunkSize)
    const startChunkY = Math.floor(minY / chunkSize)
    const endChunkX = Math.floor(maxX / chunkSize)
    const endChunkY = Math.floor(maxY / chunkSize)
    
    const promises = []
    
    for (let cy = startChunkY; cy <= endChunkY; cy++) {
      for (let cx = startChunkX; cx <= endChunkX; cx++) {
        if (needFull) {
          // Для cached mode генерируем full чанки напрямую
          promises.push(this.getFullChunk(terrain, cx, cy))
        } else {
          promises.push(this.getPreviewChunk(terrain, cx, cy))
        }
      }
    }
    
    await Promise.all(promises)
    
    // Debug: проверяем что чанки созданы
    if (needFull) {
      const terrainId = terrain?.id || 'unknown'
      let fullCount = 0
      for (let cy = startChunkY; cy <= endChunkY; cy++) {
        for (let cx = startChunkX; cx <= endChunkX; cx++) {
          const key = this._getChunkKey(terrainId, cx, cy)
          const entry = this._fullChunks.get(key)
          if (entry && entry.bitmap) fullCount++
        }
      }
      console.log(`[ChunkCache] Preloaded ${fullCount} full chunks for terrain ${terrainId}`)
    }
  }
  
  /**
   * Инвалидировать кэш для террейна
   */
  invalidate(terrainId = null) {
    if (terrainId) {
      // Удаляем только чанки конкретного террейна
      const prefix = `${terrainId}:`
      
      for (const [key, entry] of this._previewChunks) {
        if (key.startsWith(prefix)) {
          entry.releaseBitmap()
          this._previewChunks.delete(key)
        }
      }
      
      for (const [key, entry] of this._fullChunks) {
        if (key.startsWith(prefix)) {
          entry.releaseBitmap()
          this._fullChunks.delete(key)
        }
      }
      
      this._previewLRU = this._previewLRU.filter(k => !k.startsWith(prefix))
      this._fullLRU = this._fullLRU.filter(k => !k.startsWith(prefix))
    } else {
      // Очищаем всё
      for (const entry of this._previewChunks.values()) {
        entry.releaseBitmap()
      }
      for (const entry of this._fullChunks.values()) {
        entry.releaseBitmap()
      }
      
      this._previewChunks.clear()
      this._fullChunks.clear()
      this._previewLRU = []
      this._fullLRU = []
    }
    
    // Очищаем очередь
    this._fullQueue.clear()
    this._fullQueueData?.clear()
  }
  
  /**
   * Получить статистику
   */
  getStats() {
    return {
      previewChunks: this._previewChunks.size,
      fullChunks: this._fullChunks.size,
      previewHits: this._stats.previewHits,
      previewMisses: this._stats.previewMisses,
      fullHits: this._stats.fullHits,
      fullMisses: this._stats.fullMisses,
      evictions: this._stats.evictions,
      queueSize: this._fullQueue.size,
      previewHitRate: this._stats.previewHits / (this._stats.previewHits + this._stats.previewMisses) || 0,
      fullHitRate: this._stats.fullHits / (this._stats.fullHits + this._stats.fullMisses) || 0
    }
  }
}

// Глобальный экземпляр
let globalChunkCache = null

export function getGlobalChunkCache() {
  if (!globalChunkCache) {
    globalChunkCache = new TerrainChunkCache()
  }
  return globalChunkCache
}

// Экспорт размера для использования в useTerrainRenderer
export const CHUNK_SIZE = CHUNK_SIZE_FULL
