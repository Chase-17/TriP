/**
 * useSegmentTextures - manages GPU textures for segment-based SDF
 * 
 * Textures:
 * - uSegmentMeta: Per-segment metadata [patchLeft, patchRight, pointStart, pointCount]
 * - uSegmentPoints: All polyline points [x, z, x, z, ...]
 * - uHexSegments: Per-hex segment IDs (up to 8 per hex)
 * - uPatchTerrains: Per-patch terrain ID
 */

import { ref, shallowRef } from 'vue'
import * as THREE from 'three'

// Configuration
const MAX_SEGMENTS = 256
const MAX_POINTS = 4096  // Total points across all segments
const MAX_HEX_RADIUS = 64  // -64 to +64 = 128x128 hex grid
const HEX_SEGMENTS_WIDTH = MAX_HEX_RADIUS * 2 * 2  // *2 for segments, *2 for negative coords
const MAX_PATCHES = 64

export function useSegmentTextures() {
  // Textures
  const segmentMetaTexture = shallowRef(null)
  const segmentPointsTexture = shallowRef(null)
  const segmentNormalsTexture = shallowRef(null)  // NEW: normals for each fragment
  const hexSegmentsTexture = shallowRef(null)
  const patchTerrainsTexture = shallowRef(null)
  
  // Data arrays (CPU side)
  const segments = ref([])  // Array of { patchLeft, patchRight, points: [{x, z}, ...], normals: [{nx, nz}, ...] }
  const patches = ref([])   // Array of { terrainId, hexes: Set }
  const hexSegmentMap = ref(new Map())  // "q,r" -> [segmentId, segmentId, ...]
  
  /**
   * Initialize all textures
   */
  function initTextures() {
    // Segment metadata: MAX_SEGMENTS x 1
    // Each pixel: [patchLeft/255, patchRight/255, pointStart/65535, pointCount/255]
    const metaData = new Float32Array(MAX_SEGMENTS * 4)
    segmentMetaTexture.value = new THREE.DataTexture(
      metaData, MAX_SEGMENTS, 1,
      THREE.RGBAFormat, THREE.FloatType
    )
    segmentMetaTexture.value.needsUpdate = true
    
    // Segment points: (MAX_POINTS/2) x 1 (each pixel stores 2 points)
    const pointsData = new Float32Array((MAX_POINTS / 2) * 4)
    segmentPointsTexture.value = new THREE.DataTexture(
      pointsData, MAX_POINTS / 2, 1,
      THREE.RGBAFormat, THREE.FloatType
    )
    segmentPointsTexture.value.needsUpdate = true
    
    // Segment normals: (MAX_POINTS/2) x 1 (each pixel stores 2 normals: nx1, nz1, nx2, nz2)
    // One normal per fragment (N-1 for N points), stored same way as points
    const normalsData = new Float32Array((MAX_POINTS / 2) * 4)
    segmentNormalsTexture.value = new THREE.DataTexture(
      normalsData, MAX_POINTS / 2, 1,
      THREE.RGBAFormat, THREE.FloatType
    )
    segmentNormalsTexture.value.needsUpdate = true
    
    // Hex segments: (HEX_SEGMENTS_WIDTH) x (MAX_HEX_RADIUS * 2)
    // Each hex uses 2 pixels (8 segment IDs)
    const hexSize = MAX_HEX_RADIUS * 2
    const hexSegsData = new Float32Array(HEX_SEGMENTS_WIDTH * hexSize * 4)
    hexSegmentsTexture.value = new THREE.DataTexture(
      hexSegsData, HEX_SEGMENTS_WIDTH, hexSize,
      THREE.RGBAFormat, THREE.FloatType
    )
    hexSegmentsTexture.value.needsUpdate = true
    
    // Patch terrains: MAX_PATCHES x 1
    const patchData = new Float32Array(MAX_PATCHES * 4)
    patchTerrainsTexture.value = new THREE.DataTexture(
      patchData, MAX_PATCHES, 1,
      THREE.RGBAFormat, THREE.FloatType
    )
    patchTerrainsTexture.value.needsUpdate = true
  }
  
  /**
   * Build textures from exported patch data
   * @param {Object} exportData - from usePatchBoundaries.exportForGPU()
   * @param {Array} terrainsList - Array of terrain objects
   */
  function buildFromExport(exportData, terrainsList) {
    segments.value = []
    patches.value = []
    hexSegmentMap.value.clear()
    
    // Build patches array with terrain index lookup
    for (const patch of exportData.patches) {
      const terrainIndex = terrainsList.findIndex(t => t.id === patch.terrainId)
      patches.value.push({
        terrainId: patch.terrainId,
        terrainIndex: terrainIndex >= 0 ? terrainIndex : 0,
        hexes: patch.hexes,
      })
    }
    
    // Build segments array
    let pointOffset = 0
    for (const seg of exportData.segments) {
      segments.value.push({
        id: seg.id,
        patchLeft: seg.patchLeft,
        patchRight: seg.patchRight,
        pointStart: pointOffset,
        points: seg.points,
        normals: seg.normals || [],  // Normals for each fragment
        neighborTerrain: seg.neighborTerrain,
        hasLineEffects: seg.hasLineEffects,
      })
      pointOffset += seg.points.length
    }
    
    // Copy hex segments map
    hexSegmentMap.value = new Map(exportData.hexSegments)
    
    // Update textures
    updateTextures()
    
    // Segment colors for debug mode 6 (must match shader)
    // Build complete - logs removed for performance
  }
  
  /**
   * Build segments from patches (legacy method)
   * @param {Map} patchMap - Map of patchId -> { terrainId, hexes, segments }
   * @param {Array} terrainsList - Array of terrain objects
   */
  function buildFromPatches(patchMap, terrainsList) {
    segments.value = []
    patches.value = []
    hexSegmentMap.value.clear()
    
    let pointOffset = 0
    let segmentId = 0
    
    // Build patches array and terrain lookup
    const patchIdMap = new Map()  // old patchId -> new array index
    let patchIdx = 0
    
    for (const [oldPatchId, patch] of patchMap) {
      patchIdMap.set(oldPatchId, patchIdx)
      
      // Find terrain index
      const terrainIndex = terrainsList.findIndex(t => t.id === patch.terrainId)
      
      patches.value.push({
        terrainId: patch.terrainId,
        terrainIndex: terrainIndex >= 0 ? terrainIndex : 0,
        hexes: patch.hexes,
      })
      patchIdx++
    }
    
    // Build segments
    for (const [oldPatchId, patch] of patchMap) {
      const patchLeft = patchIdMap.get(oldPatchId)
      
      // patch.segments is array of { neighborTerrain, neighborPatchId, edges, processedPoints }
      if (!patch.segments) continue
      
      for (const seg of patch.segments) {
        // Get right patch
        const patchRight = seg.neighborPatchId !== undefined 
          ? (patchIdMap.get(seg.neighborPatchId) ?? -1)
          : -1
        
        // Get points from processedPoints or convert from edges
        const points = seg.processedPoints || []
        if (points.length < 2) continue
        
        const segment = {
          id: segmentId,
          patchLeft,
          patchRight,
          pointStart: pointOffset,
          points: points.map(p => ({ x: p.x, z: p.z })),
        }
        
        segments.value.push(segment)
        
        // Track which hexes this segment is near
        // Use the hexes from the patch boundary
        if (seg.hexes) {
          for (const hexKey of seg.hexes) {
            if (!hexSegmentMap.value.has(hexKey)) {
              hexSegmentMap.value.set(hexKey, [])
            }
            hexSegmentMap.value.get(hexKey).push(segmentId)
          }
        }
        
        pointOffset += points.length
        segmentId++
      }
    }
    
    // Update textures
    updateTextures()
  }
  
  /**
   * Update all textures from current data
   */
  function updateTextures() {
    if (!segmentMetaTexture.value) return
    
    // Update segment metadata
    // Since we use Float32 textures, store raw values directly
    const metaData = segmentMetaTexture.value.image.data
    metaData.fill(0)
    
    for (let i = 0; i < segments.value.length && i < MAX_SEGMENTS; i++) {
      const seg = segments.value[i]
      const idx = i * 4
      // Store raw values in float texture
      metaData[idx + 0] = seg.patchLeft    // Can be -1 for no patch
      metaData[idx + 1] = seg.patchRight   // Can be -1 for no patch
      metaData[idx + 2] = seg.pointStart   // Index into points array
      metaData[idx + 3] = seg.points.length // Number of points
    }
    segmentMetaTexture.value.needsUpdate = true
    
    // Update segment points
    const pointsData = segmentPointsTexture.value.image.data
    pointsData.fill(0)
    
    let pointIdx = 0
    for (const seg of segments.value) {
      for (const pt of seg.points) {
        const pixelIdx = Math.floor(pointIdx / 2)
        const channel = (pointIdx % 2) * 2
        if (pixelIdx < MAX_POINTS / 2) {
          pointsData[pixelIdx * 4 + channel] = pt.x
          pointsData[pixelIdx * 4 + channel + 1] = pt.z
        }
        pointIdx++
      }
    }
    segmentPointsTexture.value.needsUpdate = true
    
    // Update segment normals
    // Store one normal per POINT position (same indexing as points)
    // Normal at index i corresponds to fragment from point i to point i+1
    // (Last point's "normal" slot is unused)
    const normalsData = segmentNormalsTexture.value.image.data
    normalsData.fill(0)
    
    let normalIdx = 0
    for (const seg of segments.value) {
      const normals = seg.normals || []
      // Store one normal per point position (N normals for N points)
      for (let i = 0; i < seg.points.length; i++) {
        const normal = normals[i] || { nx: 0, nz: 0 }  // Last point has no real normal
        const pixelIdx = Math.floor(normalIdx / 2)
        const channel = (normalIdx % 2) * 2
        if (pixelIdx < MAX_POINTS / 2) {
          normalsData[pixelIdx * 4 + channel] = normal.nx
          normalsData[pixelIdx * 4 + channel + 1] = normal.nz
        }
        normalIdx++
      }
    }
    segmentNormalsTexture.value.needsUpdate = true
    
    // Update hex segments
    // Store raw segment IDs, use -1 for empty slots
    const hexSegsData = hexSegmentsTexture.value.image.data
    hexSegsData.fill(-1)  // -1 means no segment
    
    const hexSize = MAX_HEX_RADIUS * 2
    for (const [hexKey, segIds] of hexSegmentMap.value) {
      const [q, r] = hexKey.split(',').map(Number)
      const x = (q + MAX_HEX_RADIUS) * 2  // Each hex uses 2 pixels
      const y = r + MAX_HEX_RADIUS
      
      if (x < 0 || x >= HEX_SEGMENTS_WIDTH - 1 || y < 0 || y >= hexSize) continue
      
      // First pixel: segments 0-3
      const idx0 = (y * HEX_SEGMENTS_WIDTH + x) * 4
      for (let i = 0; i < 4 && i < segIds.length; i++) {
        hexSegsData[idx0 + i] = segIds[i]  // Raw segment ID
      }
      
      // Second pixel: segments 4-7
      const idx1 = (y * HEX_SEGMENTS_WIDTH + x + 1) * 4
      for (let i = 4; i < 8 && i < segIds.length; i++) {
        hexSegsData[idx1 + i - 4] = segIds[i]
      }
    }
    hexSegmentsTexture.value.needsUpdate = true
    
    // Update patch terrains
    // Store raw terrain index
    const patchData = patchTerrainsTexture.value.image.data
    patchData.fill(-1)  // -1 means no terrain
    
    for (let i = 0; i < patches.value.length && i < MAX_PATCHES; i++) {
      const patch = patches.value[i]
      patchData[i * 4] = patch.terrainIndex
    }
    patchTerrainsTexture.value.needsUpdate = true
  }
  
  /**
   * Add nearby segments to hexes based on distance
   * Call this after buildFromPatches if processedPoints doesn't include hex info
   */
  function populateHexSegments(hexSize = 1) {
    hexSegmentMap.value.clear()
    
    const maxDist = hexSize * 2  // Include segments within 2 hex sizes
    
    for (const seg of segments.value) {
      // Find all hexes that could be affected by this segment
      const affectedHexes = new Set()
      
      for (const pt of seg.points) {
        // Convert world to hex (approximate)
        const q = Math.round((pt.x * Math.sqrt(3) / 3 - pt.z / 3) / hexSize)
        const r = Math.round(pt.z * 2 / 3 / hexSize)
        
        // Add this hex and neighbors
        for (let dq = -2; dq <= 2; dq++) {
          for (let dr = -2; dr <= 2; dr++) {
            affectedHexes.add(`${q + dq},${r + dr}`)
          }
        }
      }
      
      for (const hexKey of affectedHexes) {
        if (!hexSegmentMap.value.has(hexKey)) {
          hexSegmentMap.value.set(hexKey, [])
        }
        const list = hexSegmentMap.value.get(hexKey)
        if (list.length < 8 && !list.includes(seg.id)) {
          list.push(seg.id)
        }
      }
    }
    
    updateTextures()
  }
  
  /**
   * Get uniforms object for shader
   */
  function getUniforms() {
    return {
      uSegmentMeta: { value: segmentMetaTexture.value },
      uSegmentPoints: { value: segmentPointsTexture.value },
      uSegmentNormals: { value: segmentNormalsTexture.value },
      uHexSegments: { value: hexSegmentsTexture.value },
      uPatchTerrains: { value: patchTerrainsTexture.value },
      uSegmentCount: { value: segments.value.length },
    }
  }
  
  /**
   * Dispose textures
   */
  function dispose() {
    segmentMetaTexture.value?.dispose()
    segmentPointsTexture.value?.dispose()
    segmentNormalsTexture.value?.dispose()
    hexSegmentsTexture.value?.dispose()
    patchTerrainsTexture.value?.dispose()
  }
  
  return {
    // State
    segments,
    patches,
    hexSegmentMap,
    
    // Textures
    segmentMetaTexture,
    segmentPointsTexture,
    segmentNormalsTexture,
    hexSegmentsTexture,
    patchTerrainsTexture,
    
    // Methods
    initTextures,
    buildFromExport,
    buildFromPatches,
    populateHexSegments,
    updateTextures,
    getUniforms,
    dispose,
  }
}
