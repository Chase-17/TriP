/**
 * Patch Boundaries System
 * 
 * CPU-side computation of terrain patch boundaries with smoothing/straightening
 * effects, generating SDF textures for GPU rendering.
 * 
 * Flow:
 * 1. Find connected patches of same terrain
 * 2. Extract boundary polylines
 * 3. Apply line effects (smooth, straighten, wave, noise, etc.)
 * 4. Generate SDF texture for GPU
 */

import { ref, computed, shallowRef } from 'vue'
import { PerlinNoise, SimplexNoise, VoronoiNoise } from '@/utils/rendering/noise'

// ============ HEX MATH ============

const HEX_SIZE = 1
const SQRT3 = Math.sqrt(3)

// Axial neighbor offsets - ORDER MUST MATCH EDGE ORDER
// For pointy-top hex with vertices at angles -30°, 30°, 90°, 150°, 210°, 270°
// Edge i connects vertex i to vertex (i+1)%6
const NEIGHBOR_OFFSETS = [
  { q: 1, r: 0 },   // Edge 0 (E): V0→V1, neighbor East
  { q: 0, r: 1 },   // Edge 1 (SE): V1→V2, neighbor SouthEast
  { q: -1, r: 1 },  // Edge 2 (SW): V2→V3, neighbor SouthWest
  { q: -1, r: 0 },  // Edge 3 (W): V3→V4, neighbor West
  { q: 0, r: -1 },  // Edge 4 (NW): V4→V5, neighbor NorthWest
  { q: 1, r: -1 },  // Edge 5 (NE): V5→V0, neighbor NorthEast
]

// Hex vertex positions (pointy-top, counterclockwise from right-top)
// In Three.js: +X is right, +Z is down (towards camera)
const HEX_VERTICES = [
  { angle: -30 },   // V0: right-top
  { angle: 30 },    // V1: right-bottom
  { angle: 90 },    // V2: bottom
  { angle: 150 },   // V3: left-bottom
  { angle: 210 },   // V4: left-top
  { angle: 270 },   // V5: top
].map(v => {
  const rad = v.angle * Math.PI / 180
  return { x: Math.cos(rad) * HEX_SIZE, z: Math.sin(rad) * HEX_SIZE }
})

// Edge i connects vertex i to vertex (i+1)%6
// This is the standard counterclockwise winding
const EDGE_VERTICES = [
  [0, 1],   // Edge 0 (E): right side
  [1, 2],   // Edge 1 (SE): bottom-right
  [2, 3],   // Edge 2 (SW): bottom-left
  [3, 4],   // Edge 3 (W): left side
  [4, 5],   // Edge 4 (NW): top-left
  [5, 0],   // Edge 5 (NE): top-right
]

function hexToWorld(q, r) {
  const x = HEX_SIZE * SQRT3 * (q + r / 2)
  const z = HEX_SIZE * 1.5 * r
  return { x, z }
}

function hexKey(q, r) {
  return `${q},${r}`
}

function parseHexKey(key) {
  const [q, r] = key.split(',').map(Number)
  return { q, r }
}

/**
 * Compute outward normal for a hex edge.
 * The normal points from the hex center toward the neighbor hex.
 * @param {string} hexKeyStr - The hex key "q,r"
 * @param {number} edgeIdx - Edge index 0-5
 * @returns {{nx: number, nz: number}} Normalized normal vector
 */
function computeEdgeNormal(hexKeyStr, edgeIdx) {
  const { q, r } = parseHexKey(hexKeyStr)
  const center = hexToWorld(q, r)
  const offset = NEIGHBOR_OFFSETS[edgeIdx]
  const neighborCenter = hexToWorld(q + offset.q, r + offset.r)
  
  // Direction from our hex center to neighbor hex center
  const dx = neighborCenter.x - center.x
  const dz = neighborCenter.z - center.z
  const len = Math.sqrt(dx * dx + dz * dz)
  
  if (len < 0.0001) return { nx: 1, nz: 0 }
  
  return { nx: dx / len, nz: dz / len }
}

/**
 * Ray casting algorithm to determine if a point is inside a polygon.
 * Casts a ray from the point to the right (+X direction) and counts edge crossings.
 * Odd count = inside, even count = outside.
 * 
 * @param {Object} point - {x, z} point to test
 * @param {Array} polygon - Array of {x, z} vertices forming a closed polygon
 * @returns {boolean} true if point is inside the polygon
 */
function pointInPolygon(point, polygon) {
  if (polygon.length < 3) return false
  
  const { x, z } = point
  let inside = false
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, zi = polygon[i].z
    const xj = polygon[j].x, zj = polygon[j].z
    
    // Check if the ray crosses this edge
    const intersect = ((zi > z) !== (zj > z)) &&
                      (x < (xj - xi) * (z - zi) / (zj - zi) + xi)
    
    if (intersect) inside = !inside
  }
  
  return inside
}

/**
 * Compute normals for each fragment of a processed polyline.
 * 
 * Strategy: Use cross product with hex centers to determine orientation.
 * For each fragment, find the nearest original edge and use its hex center.
 * 
 * @param {Array} processedPoints - Array of {x, z} points after effects
 * @param {Array} originalEdges - Array of original edges with hexKey
 * @param {Array} fullBoundaryLoop - Full boundary loop (unused)
 * @returns {Array} Array of {nx, nz} normals, one per fragment (length = points.length - 1)
 */
function computeFragmentNormals(processedPoints, originalEdges, fullBoundaryLoop) {
  if (processedPoints.length < 2) {
    return []
  }
  
  // Collect all hex centers and edge midpoints from original edges
  const edgeData = []
  for (const edge of originalEdges) {
    if (edge.hexKey && edge.from && edge.to) {
      const { q, r } = parseHexKey(edge.hexKey)
      const hexCenter = hexToWorld(q, r)
      const edgeMidX = (edge.from.x + edge.to.x) / 2
      const edgeMidZ = (edge.from.z + edge.to.z) / 2
      edgeData.push({ hexCenter, edgeMidX, edgeMidZ })
    }
  }
  
  if (edgeData.length === 0) {
    // Fallback: just use left perpendicular without flipping
    const fragmentNormals = []
    for (let i = 0; i < processedPoints.length - 1; i++) {
      const p0 = processedPoints[i]
      const p1 = processedPoints[i + 1]
      const dx = p1.x - p0.x
      const dz = p1.z - p0.z
      const len = Math.sqrt(dx * dx + dz * dz) || 1
      fragmentNormals.push({ nx: -dz / len, nz: dx / len })
    }
    return fragmentNormals
  }
  
  // First pass: compute raw normals with correct orientation
  const rawNormals = []
  
  for (let i = 0; i < processedPoints.length - 1; i++) {
    const p0 = processedPoints[i]
    const p1 = processedPoints[i + 1]
    
    const dx = p1.x - p0.x
    const dz = p1.z - p0.z
    const len = Math.sqrt(dx * dx + dz * dz)
    
    if (len < 0.0001) {
      rawNormals.push({ nx: 0, nz: 0, valid: false })
      continue
    }
    
    // Find nearest original edge by midpoint distance
    const fragMidX = (p0.x + p1.x) / 2
    const fragMidZ = (p0.z + p1.z) / 2
    
    let nearestEdge = edgeData[0]
    let nearestDist = Infinity
    for (const ed of edgeData) {
      const d = (ed.edgeMidX - fragMidX) ** 2 + (ed.edgeMidZ - fragMidZ) ** 2
      if (d < nearestDist) {
        nearestDist = d
        nearestEdge = ed
      }
    }
    
    const hexCenter = nearestEdge.hexCenter
    
    // Cross product to determine side
    const cross = (hexCenter.x - p0.x) * dz - (hexCenter.z - p0.z) * dx
    
    // "Left" perpendicular
    let nx = -dz / len
    let nz = dx / len
    
    // Flip if needed
    if (cross > 0) {
      nx = -nx
      nz = -nz
    }
    
    rawNormals.push({ nx, nz, valid: true })
  }
  
  // Second pass: smooth normals to avoid sharp discontinuities
  const fragmentNormals = []
  
  for (let i = 0; i < rawNormals.length; i++) {
    if (!rawNormals[i].valid) {
      // Use neighbor or default
      if (i > 0 && rawNormals[i - 1].valid) {
        fragmentNormals.push({ nx: rawNormals[i - 1].nx, nz: rawNormals[i - 1].nz })
      } else if (i < rawNormals.length - 1 && rawNormals[i + 1].valid) {
        fragmentNormals.push({ nx: rawNormals[i + 1].nx, nz: rawNormals[i + 1].nz })
      } else {
        fragmentNormals.push({ nx: 0, nz: 1 })
      }
      continue
    }
    
    // Average with neighbors for smoother transitions
    let nx = rawNormals[i].nx
    let nz = rawNormals[i].nz
    let count = 1
    
    if (i > 0 && rawNormals[i - 1].valid) {
      nx += rawNormals[i - 1].nx
      nz += rawNormals[i - 1].nz
      count++
    }
    if (i < rawNormals.length - 1 && rawNormals[i + 1].valid) {
      nx += rawNormals[i + 1].nx
      nz += rawNormals[i + 1].nz
      count++
    }
    
    nx /= count
    nz /= count
    
    // Renormalize
    const len = Math.sqrt(nx * nx + nz * nz)
    if (len > 0.0001) {
      nx /= len
      nz /= len
    }
    
    fragmentNormals.push({ nx, nz })
  }
  
  return fragmentNormals
}

/**
 * Build a closed contour polygon from a patch's hex vertices.
 * Uses the outer boundary of all hexes in the patch.
 * 
 * @param {Set} patchHexes - Set of hex keys ("q,r") belonging to the patch
 * @param {Map} hexMap - Full hex map for neighbor checking
 * @param {string} patchTerrainId - Terrain ID of this patch
 * @returns {Array} Array of {x, z} vertices forming a closed polygon
 */
function buildPatchContour(patchHexes, hexMap, patchTerrainId) {
  if (!patchHexes || patchHexes.size === 0) return []
  
  // Collect all boundary edges
  const boundaryEdges = []
  
  for (const hexKeyStr of patchHexes) {
    const { q, r } = parseHexKey(hexKeyStr)
    const center = hexToWorld(q, r)
    
    for (let edgeIdx = 0; edgeIdx < 6; edgeIdx++) {
      const offset = NEIGHBOR_OFFSETS[edgeIdx]
      const neighborKey = hexKey(q + offset.q, r + offset.r)
      const neighborTerrain = hexMap.get(neighborKey)
      
      // If neighbor is different terrain, this is a boundary edge
      if (neighborTerrain !== patchTerrainId) {
        const [v1Idx, v2Idx] = EDGE_VERTICES[edgeIdx]
        const v1 = HEX_VERTICES[v1Idx]
        const v2 = HEX_VERTICES[v2Idx]
        
        boundaryEdges.push({
          from: { x: center.x + v1.x, z: center.z + v1.z },
          to: { x: center.x + v2.x, z: center.z + v2.z }
        })
      }
    }
  }
  
  if (boundaryEdges.length < 3) return []
  
  // Chain edges into a closed loop
  const EPSILON = 0.1
  const pointsMatch = (p1, p2) => 
    Math.abs(p1.x - p2.x) < EPSILON && Math.abs(p1.z - p2.z) < EPSILON
  
  const remaining = boundaryEdges.map(e => ({ ...e, used: false }))
  const contour = []
  
  // Start with first edge
  remaining[0].used = true
  contour.push(remaining[0].from)
  let currentEnd = remaining[0].to
  
  // Chain edges
  for (let iter = 0; iter < remaining.length; iter++) {
    let found = false
    for (const edge of remaining) {
      if (edge.used) continue
      
      if (pointsMatch(edge.from, currentEnd)) {
        edge.used = true
        contour.push(edge.from)
        currentEnd = edge.to
        found = true
        break
      }
      if (pointsMatch(edge.to, currentEnd)) {
        edge.used = true
        contour.push(edge.to)
        currentEnd = edge.from
        found = true
        break
      }
    }
    if (!found) break
  }
  
  return contour
}

// ============ PATCH FINDING ============

/**
 * Find all connected patches of the same terrain
 * @param {Map} hexMap - Map of "q,r" -> terrainId
 * @returns {Map} patchId -> { terrainId, hexes: Set<"q,r">, boundary: [] }
 */
export function findPatches(hexMap) {
  const visited = new Set()
  const patches = new Map()
  let patchIdCounter = 0

  for (const [hexKeyStr, terrainId] of hexMap) {
    if (visited.has(hexKeyStr)) continue

    // Flood fill to find connected patch
    const patchHexes = new Set()
    const queue = [hexKeyStr]

    while (queue.length > 0) {
      const current = queue.shift()
      if (visited.has(current)) continue
      
      const currentTerrain = hexMap.get(current)
      if (currentTerrain !== terrainId) continue

      visited.add(current)
      patchHexes.add(current)

      // Add neighbors with same terrain
      const { q, r } = parseHexKey(current)
      for (const offset of NEIGHBOR_OFFSETS) {
        const neighborKey = hexKey(q + offset.q, r + offset.r)
        if (!visited.has(neighborKey) && hexMap.get(neighborKey) === terrainId) {
          queue.push(neighborKey)
        }
      }
    }

    if (patchHexes.size > 0) {
      const patchId = `patch_${patchIdCounter++}`
      patches.set(patchId, {
        id: patchId,
        terrainId,
        hexes: patchHexes,
        boundary: [],  // Will be computed
        processedBoundary: [],  // After effects applied
      })
    }
  }

  return patches
}

/**
 * Build reverse index: hex -> patch
 */
export function buildHexToPatchIndex(patches) {
  const index = new Map()
  for (const [patchId, patch] of patches) {
    for (const hexKeyStr of patch.hexes) {
      index.set(hexKeyStr, patchId)
    }
  }
  return index
}

// ============ BOUNDARY EXTRACTION ============

/**
 * Extract boundary edges of a patch as world-space polyline segments
 * Returns array of edges, each edge is { from: {x,z}, to: {x,z}, neighborTerrain }
 */
export function extractPatchBoundary(patch, hexMap) {
  const edges = []

  for (const hexKeyStr of patch.hexes) {
    const { q, r } = parseHexKey(hexKeyStr)
    const center = hexToWorld(q, r)

    // Check each of 6 edges
    for (let edgeIdx = 0; edgeIdx < 6; edgeIdx++) {
      const offset = NEIGHBOR_OFFSETS[edgeIdx]
      const neighborKey = hexKey(q + offset.q, r + offset.r)
      const neighborTerrain = hexMap.get(neighborKey)

      // If neighbor is different terrain (or doesn't exist), this is a boundary edge
      if (neighborTerrain !== patch.terrainId) {
        const [v1Idx, v2Idx] = EDGE_VERTICES[edgeIdx]
        const v1 = HEX_VERTICES[v1Idx]
        const v2 = HEX_VERTICES[v2Idx]

        edges.push({
          from: { x: center.x + v1.x, z: center.z + v1.z },
          to: { x: center.x + v2.x, z: center.z + v2.z },
          hexKey: hexKeyStr,
          edgeIdx,
          neighborTerrain: neighborTerrain ?? null,
        })
      }
    }
  }

  return edges
}

/**
 * Connect boundary edges into ordered polylines (closed loops)
 * Algorithm from hexClusterRenderer.js - chains edges by matching v2 → v1
 * 
 * Key insight: edges may have inconsistent orientation, so we check BOTH
 * forward (v2 matches their v1) and reverse (v2 matches their v2)
 */
export function buildBoundaryLoops(edges) {
  if (edges.length === 0) return []
  if (edges.length === 1) {
    return [[ { x: edges[0].from.x, z: edges[0].from.z }, { x: edges[0].to.x, z: edges[0].to.z } ]]
  }

  const EPSILON = 0.1  // Tolerance for point matching
  
  const pointsMatch = (p1, p2) => 
    Math.abs(p1.x - p2.x) < EPSILON && Math.abs(p1.z - p2.z) < EPSILON
  
  // Work with copies so we can mark edges as used
  const remaining = edges.map((e, i) => ({
    idx: i,
    v1: { x: e.from.x, z: e.from.z },
    v2: { x: e.to.x, z: e.to.z },
    used: false
  }))
  
  const loops = []
  
  // Process until all edges are used
  while (true) {
    // Find first unused edge
    const startIdx = remaining.findIndex(e => !e.used)
    if (startIdx < 0) break
    
    const contourEdges = []
    const startEdge = remaining[startIdx]
    startEdge.used = true
    contourEdges.push(startEdge)
    
    // Extend forward: find edge where v1 matches current v2
    let foundNext = true
    while (foundNext && contourEdges.length < edges.length) {
      const lastEdge = contourEdges[contourEdges.length - 1]
      foundNext = false
      
      for (const candidate of remaining) {
        if (candidate.used) continue
        
        // Check if candidate.v1 matches lastEdge.v2 (forward orientation)
        if (pointsMatch(candidate.v1, lastEdge.v2)) {
          candidate.used = true
          contourEdges.push(candidate)
          foundNext = true
          break
        }
        
        // Check if candidate.v2 matches lastEdge.v2 (need to flip)
        if (pointsMatch(candidate.v2, lastEdge.v2)) {
          candidate.used = true
          // Flip the edge so it chains correctly
          const temp = candidate.v1
          candidate.v1 = candidate.v2
          candidate.v2 = temp
          contourEdges.push(candidate)
          foundNext = true
          break
        }
      }
    }
    
    // Extend backward: find edge where v2 matches first edge's v1
    foundNext = true
    while (foundNext && contourEdges.length < edges.length) {
      const firstEdge = contourEdges[0]
      foundNext = false
      
      for (const candidate of remaining) {
        if (candidate.used) continue
        
        // Check if candidate.v2 matches firstEdge.v1 (forward orientation)
        if (pointsMatch(candidate.v2, firstEdge.v1)) {
          candidate.used = true
          contourEdges.unshift(candidate)
          foundNext = true
          break
        }
        
        // Check if candidate.v1 matches firstEdge.v1 (need to flip)
        if (pointsMatch(candidate.v1, firstEdge.v1)) {
          candidate.used = true
          // Flip the edge so it chains correctly
          const temp = candidate.v1
          candidate.v1 = candidate.v2
          candidate.v2 = temp
          contourEdges.unshift(candidate)
          foundNext = true
          break
        }
      }
    }
    
    // Convert contour edges to points loop
    if (contourEdges.length >= 3) {
      const loop = contourEdges.map(e => ({ x: e.v1.x, z: e.v1.z }))
      loops.push(loop)
    }
  }
  
  return loops
}

/**
 * Build ordered edges preserving metadata (neighborTerrain, etc.)
 * Returns array of contours, each contour is array of edges in order
 */
export function buildOrderedEdgesWithMeta(edges) {
  if (edges.length === 0) return []
  if (edges.length === 1) return [[edges[0]]]

  const EPSILON = 0.1
  
  const pointsMatch = (p1, p2) => 
    Math.abs(p1.x - p2.x) < EPSILON && Math.abs(p1.z - p2.z) < EPSILON
  
  // Work with copies, keep original edge reference
  const remaining = edges.map((e, i) => ({
    idx: i,
    original: e,
    v1: { x: e.from.x, z: e.from.z },
    v2: { x: e.to.x, z: e.to.z },
    flipped: false,
    used: false
  }))
  
  const contours = []
  
  while (true) {
    const startIdx = remaining.findIndex(e => !e.used)
    if (startIdx < 0) break
    
    const contourEdges = []
    const startEdge = remaining[startIdx]
    startEdge.used = true
    contourEdges.push(startEdge)
    
    // Extend forward
    let foundNext = true
    while (foundNext && contourEdges.length < edges.length) {
      const lastEdge = contourEdges[contourEdges.length - 1]
      foundNext = false
      
      for (const candidate of remaining) {
        if (candidate.used) continue
        
        if (pointsMatch(candidate.v1, lastEdge.v2)) {
          candidate.used = true
          contourEdges.push(candidate)
          foundNext = true
          break
        }
        
        if (pointsMatch(candidate.v2, lastEdge.v2)) {
          candidate.used = true
          candidate.flipped = true
          const temp = candidate.v1
          candidate.v1 = candidate.v2
          candidate.v2 = temp
          contourEdges.push(candidate)
          foundNext = true
          break
        }
      }
    }
    
    // Extend backward
    foundNext = true
    while (foundNext && contourEdges.length < edges.length) {
      const firstEdge = contourEdges[0]
      foundNext = false
      
      for (const candidate of remaining) {
        if (candidate.used) continue
        
        if (pointsMatch(candidate.v2, firstEdge.v1)) {
          candidate.used = true
          contourEdges.unshift(candidate)
          foundNext = true
          break
        }
        
        if (pointsMatch(candidate.v1, firstEdge.v1)) {
          candidate.used = true
          candidate.flipped = true
          const temp = candidate.v1
          candidate.v1 = candidate.v2
          candidate.v2 = temp
          contourEdges.unshift(candidate)
          foundNext = true
          break
        }
      }
    }
    
    if (contourEdges.length >= 3) {
      // Return edges with original metadata, including flip state
      const orderedEdges = contourEdges.map(e => ({
        from: e.v1,
        to: e.v2,
        neighborTerrain: e.original.neighborTerrain,
        hexKey: e.original.hexKey,
        edgeIdx: e.original.edgeIdx,
        flipped: e.flipped || false,  // Track if edge was flipped during chaining
      }))
      contours.push(orderedEdges)
    }
  }
  
  return contours
}

/**
 * Group consecutive edges by neighborTerrain into segments
 * Returns array of segments, each segment has { neighborTerrain, edges[] }
 */
export function groupEdgesIntoSegments(orderedEdges) {
  if (orderedEdges.length === 0) return []
  
  const segments = []
  let currentSegment = {
    neighborTerrain: orderedEdges[0].neighborTerrain,
    edges: [orderedEdges[0]]
  }
  
  for (let i = 1; i < orderedEdges.length; i++) {
    const edge = orderedEdges[i]
    
    if (edge.neighborTerrain === currentSegment.neighborTerrain) {
      currentSegment.edges.push(edge)
    } else {
      segments.push(currentSegment)
      currentSegment = {
        neighborTerrain: edge.neighborTerrain,
        edges: [edge]
      }
    }
  }
  
  segments.push(currentSegment)
  
  // Check if first and last segments have same neighbor - merge them
  if (segments.length > 1) {
    const first = segments[0]
    const last = segments[segments.length - 1]
    if (first.neighborTerrain === last.neighborTerrain) {
      // Merge: add first's edges to the end of last
      last.edges = last.edges.concat(first.edges)
      segments.shift()
    }
  }
  
  return segments
}

// ============ LINE EFFECTS ============

/**
 * Convert segment edges to polyline points
 * @param edges - array of edges with {from, to}
 * @returns array of points {x, z}
 */
export function edgesToPolyline(edges) {
  if (edges.length === 0) return []
  
  const points = edges.map(e => ({ x: e.from.x, z: e.from.z }))
  // Add last point (end of last edge)
  const lastEdge = edges[edges.length - 1]
  points.push({ x: lastEdge.to.x, z: lastEdge.to.z })
  
  return points
}

/**
 * Chaikin subdivision for smoothing (rounds corners)
 * Works for OPEN polylines (segments)
 * @param points - array of points
 * @param iterations - number of subdivision iterations (1-4)
 */
export function smoothPolylineOpen(points, iterations = 2) {
  if (points.length < 3) return points
  
  let result = [...points]
  
  for (let iter = 0; iter < iterations; iter++) {
    const newPoints = []
    
    // Keep first point fixed
    newPoints.push({ ...result[0] })
    
    for (let i = 0; i < result.length - 1; i++) {
      const p0 = result[i]
      const p1 = result[i + 1]
      
      // Chaikin divides each segment into 2 points at 25% and 75%
      newPoints.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        z: p0.z * 0.75 + p1.z * 0.25,
      })
      
      newPoints.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        z: p0.z * 0.25 + p1.z * 0.75,
      })
    }
    
    // Keep last point fixed
    newPoints.push({ ...result[result.length - 1] })
    
    result = newPoints
  }
  
  return result
}

/**
 * Laplacian smoothing for straightening OPEN polylines
 * Keeps endpoints fixed, smooths interior points
 * @param points - array of points (open line)
 * @param strength - straightening strength 0-1
 */
export function straightenPolylineOpen(points, strength = 0.5) {
  if (points.length < 3 || strength <= 0) return points
  
  const iterations = Math.ceil(strength * 8)  // More iterations for stronger effect
  const factor = Math.min(strength, 0.8)
  
  let result = points.map(p => ({ ...p }))
  
  for (let iter = 0; iter < iterations; iter++) {
    const newPoints = []
    
    // Keep first point fixed
    newPoints.push({ ...result[0] })
    
    // Smooth interior points
    for (let i = 1; i < result.length - 1; i++) {
      const prev = result[i - 1]
      const curr = result[i]
      const next = result[i + 1]
      
      // Midpoint between neighbors
      const midX = (prev.x + next.x) / 2
      const midZ = (prev.z + next.z) / 2
      
      // Move current point toward midpoint
      newPoints.push({
        x: curr.x + (midX - curr.x) * factor,
        z: curr.z + (midZ - curr.z) * factor,
      })
    }
    
    // Keep last point fixed
    newPoints.push({ ...result[result.length - 1] })
    
    result = newPoints
  }
  
  return result
}

// ============ LINE DEFORMATION EFFECTS ============

/**
 * Simple pseudo-random hash function for consistent noise
 */
function hash2D(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return n - Math.floor(n)
}

/**
 * 2D Perlin-like noise for smooth deformations (fallback)
 */
function perlinNoise2D(x, y) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  
  // Fade function for smooth interpolation
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10)
  const u = fade(xf)
  const v = fade(yf)
  
  // Corner values
  const aa = hash2D(xi, yi)
  const ab = hash2D(xi, yi + 1)
  const ba = hash2D(xi + 1, yi)
  const bb = hash2D(xi + 1, yi + 1)
  
  // Bilinear interpolation
  const x1 = aa + u * (ba - aa)
  const x2 = ab + u * (bb - ab)
  return x1 + v * (x2 - x1)
}

// Cache noise generators by seed for performance
const noiseCache = new Map()

/**
 * Get or create noise generator
 * @param {string} type - 'perlin' | 'simplex' | 'voronoi'
 * @param {number} seed - random seed
 */
function getNoiseGenerator(type, seed) {
  const key = `${type}-${seed}`
  if (noiseCache.has(key)) {
    return noiseCache.get(key)
  }
  
  let generator
  switch (type) {
    case 'simplex':
      generator = new SimplexNoise(seed)
      break
    case 'voronoi':
      generator = new VoronoiNoise(seed)
      break
    case 'perlin':
    default:
      generator = new PerlinNoise(seed)
      break
  }
  
  // Limit cache size
  if (noiseCache.size > 50) {
    const firstKey = noiseCache.keys().next().value
    noiseCache.delete(firstKey)
  }
  
  noiseCache.set(key, generator)
  return generator
}

/**
 * Get noise value with optional FBM
 * @param {object} generator - noise generator instance
 * @param {number} x - x coordinate
 * @param {number} y - y coordinate
 * @param {number} octaves - FBM octaves (1 = simple)
 * @param {number} persistence - amplitude decay
 * @param {number} lacunarity - frequency growth
 */
function getNoise(generator, x, y, octaves = 1, persistence = 0.5, lacunarity = 2.0) {
  if (octaves <= 1) {
    // Simple noise (normalized to 0-1)
    const raw = generator.noise2D(x, y)
    // Perlin/Simplex return -1 to 1, Voronoi returns 0 to 1
    return generator instanceof VoronoiNoise ? raw : (raw + 1) / 2
  }
  // FBM
  const raw = generator.fbm ? generator.fbm(x, y, octaves, persistence, lacunarity) : generator.noise2D(x, y)
  return generator instanceof VoronoiNoise ? raw : (raw + 1) / 2
}

/**
 * Subdivide polyline by adding intermediate points
 * @param points - array of points
 * @param segments - number of subdivisions per segment
 */
export function subdividePolyline(points, segments = 4) {
  if (points.length < 2 || segments < 2) return points
  
  const result = []
  
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    
    for (let j = 0; j < segments; j++) {
      const t = j / segments
      result.push({
        x: p0.x + (p1.x - p0.x) * t,
        z: p0.z + (p1.z - p0.z) * t,
      })
    }
  }
  
  // Add final point
  result.push({ ...points[points.length - 1] })
  
  return result
}

/**
 * Apply wave deformation using Perlin noise
 * Displaces points perpendicular to the line direction
 * @param points - array of points
 * @param amplitude - max displacement in world units
 * @param frequency - noise frequency
 * @param seed - random seed offset
 */

/**
 * Check if two line segments intersect and return intersection point
 * @returns {object|null} - { x, z, t1, t2 } or null if no intersection
 */
function segmentIntersection(ax, az, bx, bz, cx, cz, dx, dz) {
  const denom = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx)
  if (Math.abs(denom) < 1e-10) return null // Parallel
  
  const t1 = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / denom
  const t2 = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / denom
  
  // Check if intersection is within both segments (excluding endpoints)
  if (t1 > 0.01 && t1 < 0.99 && t2 > 0.01 && t2 < 0.99) {
    return {
      x: ax + t1 * (bx - ax),
      z: az + t1 * (bz - az),
      t1,
      t2,
    }
  }
  return null
}

/**
 * Clamp deformed points to not exceed max displacement from original
 * @param original - original points before deformation
 * @param deformed - deformed points
 * @param maxOutward - max displacement outward (positive direction from curve normal)
 * @param maxInward - max displacement inward (negative direction)
 */
export function clampDisplacement(original, deformed, maxOutward = Infinity, maxInward = Infinity) {
  if (original.length !== deformed.length) return deformed
  if (maxOutward === Infinity && maxInward === Infinity) return deformed
  
  // Use the smaller of the two limits when we can't determine direction
  const defaultMax = Math.min(
    maxOutward === Infinity ? 1e10 : maxOutward,
    maxInward === Infinity ? 1e10 : maxInward
  )
  
  return deformed.map((dp, i) => {
    const op = original[i]
    const dx = dp.x - op.x
    const dz = dp.z - op.z
    const dist = Math.sqrt(dx * dx + dz * dz)
    
    if (dist < 0.0001) return dp
    
    // Determine if this is outward or inward displacement
    // Use cross product with curve tangent to determine side
    let tangentX = 0, tangentZ = 0
    if (i === 0 && original.length > 1) {
      tangentX = original[1].x - op.x
      tangentZ = original[1].z - op.z
    } else if (i === original.length - 1 && original.length > 1) {
      tangentX = op.x - original[i - 1].x
      tangentZ = op.z - original[i - 1].z
    } else if (original.length > 2) {
      tangentX = original[i + 1].x - original[i - 1].x
      tangentZ = original[i + 1].z - original[i - 1].z
    }
    
    const tangentLen = Math.sqrt(tangentX * tangentX + tangentZ * tangentZ)
    
    let maxDist = defaultMax
    if (tangentLen > 0.0001) {
      // Cross product: tangent × displacement (normalized)
      // Positive = left side of curve, Negative = right side
      const cross = (tangentX * dz - tangentZ * dx) / tangentLen
      
      // Use threshold to avoid flipping on near-zero cross products
      if (cross > 0.01 * dist) {
        maxDist = maxOutward
      } else if (cross < -0.01 * dist) {
        maxDist = maxInward
      }
      // else: ambiguous, use defaultMax
    }
    
    if (dist > maxDist && maxDist > 0) {
      // Clamp to max distance
      const scale = maxDist / dist
      return {
        x: op.x + dx * scale,
        z: op.z + dz * scale,
      }
    }
    
    return dp
  })
}

/**
 * Remove self-intersections from polyline by "untangling" loops
 * When segments cross, remove the points inside the loop
 */
export function untanglePolyline(points) {
  if (points.length < 4) return points
  
  let result = [...points]
  let changed = true
  let iterations = 0
  const maxIterations = 10 // Safety limit
  
  while (changed && iterations < maxIterations) {
    changed = false
    iterations++
    
    // Check all pairs of non-adjacent segments
    for (let i = 0; i < result.length - 3 && !changed; i++) {
      const a = result[i]
      const b = result[i + 1]
      
      // Start from i+2 to skip adjacent segment
      for (let j = i + 2; j < result.length - 1; j++) {
        const c = result[j]
        const d = result[j + 1]
        
        const intersection = segmentIntersection(a.x, a.z, b.x, b.z, c.x, c.z, d.x, d.z)
        
        if (intersection) {
          // Found intersection! Remove points between i+1 and j (inclusive)
          // Replace with intersection point
          const newResult = [
            ...result.slice(0, i + 1),
            { x: intersection.x, z: intersection.z },
            ...result.slice(j + 1),
          ]
          result = newResult
          changed = true
          break
        }
      }
    }
  }
  
  return result
}

/**
 * Fix intersections between different segments of the same patch
 * When two segments cross, both get "pinched" at the intersection point
 * @param segments - array of processed segments with processedPoints
 * @returns segments with fixed processedPoints
 */
export function untanglePatchSegments(segments) {
  if (segments.length < 2) return segments
  
  // Make copies to avoid mutating originals
  const result = segments.map(seg => ({
    ...seg,
    processedPoints: seg.processedPoints ? [...seg.processedPoints.map(p => ({ ...p }))] : []
  }))
  
  // Check all pairs of segments for intersections
  for (let si = 0; si < result.length; si++) {
    for (let sj = si + 1; sj < result.length; sj++) {
      const segA = result[si]
      const segB = result[sj]
      
      if (!segA.processedPoints || segA.processedPoints.length < 2) continue
      if (!segB.processedPoints || segB.processedPoints.length < 2) continue
      
      // Check all fragment pairs between the two segments
      for (let i = 0; i < segA.processedPoints.length - 1; i++) {
        const a1 = segA.processedPoints[i]
        const a2 = segA.processedPoints[i + 1]
        
        for (let j = 0; j < segB.processedPoints.length - 1; j++) {
          const b1 = segB.processedPoints[j]
          const b2 = segB.processedPoints[j + 1]
          
          const inter = segmentIntersection(
            a1.x, a1.z, a2.x, a2.z,
            b1.x, b1.z, b2.x, b2.z
          )
          
          if (inter) {
            // Found intersection! Insert the intersection point into both segments
            // and remove/adjust points to eliminate the crossing
            
            // Strategy: "pinch" both polylines at intersection point
            // Insert intersection as new point after i in segA and after j in segB
            const interPoint = { x: inter.x, z: inter.z }
            
            // Insert into segment A after point i
            segA.processedPoints.splice(i + 1, 0, { ...interPoint })
            
            // Insert into segment B after point j
            segB.processedPoints.splice(j + 1, 0, { ...interPoint })
            
            // Move to next to avoid re-checking this intersection
            // (indices shifted by 1 due to splice)
          }
        }
      }
    }
  }
  
  return result
}

/**
 * Remove "spikes" where the curve direction reverses sharply
 * These often cause visual artifacts even without self-intersection
 */
export function removeSpikes(points, maxCosAngle = 0.7) {
  if (points.length < 3) return points
  
  const result = [points[0]]
  
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1]
    const curr = points[i]
    const next = points[i + 1]
    
    // Vectors along the path: prev→curr and curr→next
    const v1x = curr.x - prev.x
    const v1z = curr.z - prev.z
    const v2x = next.x - curr.x
    const v2z = next.z - curr.z
    
    const len1 = Math.sqrt(v1x * v1x + v1z * v1z)
    const len2 = Math.sqrt(v2x * v2x + v2z * v2z)
    
    if (len1 < 0.0001 || len2 < 0.0001) {
      // Skip degenerate points
      continue
    }
    
    // Dot product gives cos(angle between directions)
    // cos(180°) = -1 means complete reversal (spike)
    // cos(0°) = 1 means straight line
    const dot = (v1x * v2x + v1z * v2z) / (len1 * len2)
    
    // If dot is very negative, it's a spike (reversal)
    // maxCosAngle of -0.7 means angles > ~135° are spikes
    if (dot < -maxCosAngle) {
      // Skip this point - it's a spike/reversal
      continue
    }
    
    result.push(curr)
  }
  
  result.push(points[points.length - 1])
  return result
}

export function waveDeformPolyline(points, amplitude = 0.1, frequency = 3.0, seed = 0, noiseType = 'perlin', octaves = 1, persistence = 0.5, lacunarity = 2.0, scale = 0.3, sharpness = 0, maxInward = Infinity, maxOutward = Infinity) {
  if (points.length < 2 || amplitude <= 0) return points
  
  const generator = getNoiseGenerator(noiseType, seed)
  const result = []
  const seedOffset = seed * 73.17
  
  // Calculate cumulative arc length
  const arcLengths = [0]
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dz = points[i].z - points[i - 1].z
    arcLengths.push(arcLengths[i - 1] + Math.sqrt(dx * dx + dz * dz))
  }
  const totalLength = arcLengths[arcLengths.length - 1] || 1
  
  // Compute LOCAL perpendiculars for each point (using adjacent segments)
  // This ensures waves follow the curve of the boundary
  const perpendiculars = []
  for (let i = 0; i < points.length; i++) {
    let dx, dz
    
    if (i === 0) {
      // First point: use direction to next point
      dx = points[1].x - points[0].x
      dz = points[1].z - points[0].z
    } else if (i === points.length - 1) {
      // Last point: use direction from previous point
      dx = points[i].x - points[i - 1].x
      dz = points[i].z - points[i - 1].z
    } else {
      // Middle points: average of adjacent segment directions
      const dx1 = points[i].x - points[i - 1].x
      const dz1 = points[i].z - points[i - 1].z
      const dx2 = points[i + 1].x - points[i].x
      const dz2 = points[i + 1].z - points[i].z
      dx = dx1 + dx2
      dz = dz1 + dz2
    }
    
    const len = Math.sqrt(dx * dx + dz * dz) || 1
    // "Left" perpendicular: (-dz, dx) / len
    perpendiculars.push({
      x: -dz / len,
      z: dx / len
    })
  }
  
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const perp = perpendiculars[i]
    
    // FIXED: Keep first and last points fixed (anchor points for segment continuity)
    if (i === 0 || i === points.length - 1) {
      result.push({ x: p.x, z: p.z })
      continue
    }
    
    // Use arc length for wave - simple 1D noise sampling
    const t = arcLengths[i] / totalLength
    const noiseCoord = t * frequency + seedOffset
    let noise = getNoise(generator, noiseCoord, seed * 7.3, octaves, persistence, lacunarity)
    let v = noise * 2 - 1
    
    // Apply sharpness
    if (sharpness > 0) {
      v = Math.sign(v) * Math.pow(Math.abs(v), 1 - sharpness * 0.8)
    }
    
    const offset = v * amplitude
    
    result.push({
      x: p.x + perp.x * offset,
      z: p.z + perp.z * offset,
    })
  }
  
  // Apply safety measures to prevent self-intersections
  let cleaned = clampDisplacement(points, result, maxOutward, maxInward)
  cleaned = removeSpikes(cleaned)
  cleaned = untanglePolyline(cleaned)
  
  // Restore anchor points after cleanup (they may have been affected)
  if (cleaned.length >= 2 && points.length >= 2) {
    cleaned[0] = { x: points[0].x, z: points[0].z }
    cleaned[cleaned.length - 1] = { x: points[points.length - 1].x, z: points[points.length - 1].z }
  }
  
  return cleaned
}

/**
 * Apply random noise deformation
 * @param points - array of points
 * @param amplitude - max displacement
 * @param scale - noise scale (lower = more chaotic)
 * @param seed - random seed offset
 * @param noiseType - 'perlin' | 'simplex' | 'voronoi'
 * @param octaves - FBM octaves
 * @param persistence - FBM amplitude decay
 * @param lacunarity - FBM frequency growth
 * @param sharpness - 0 = smooth, 1 = sharp peaks
 * @param maxInward - max displacement toward inside
 * @param maxOutward - max displacement toward outside
 */
export function noiseDeformPolyline(points, amplitude = 0.05, scale = 0.15, seed = 0, noiseType = 'perlin', octaves = 1, persistence = 0.5, lacunarity = 2.0, sharpness = 0, maxInward = Infinity, maxOutward = Infinity) {
  if (points.length < 2 || amplitude <= 0) return points
  
  const generator = getNoiseGenerator(noiseType, seed)
  const seedOffset = seed * 73.17
  
  const result = points.map((p, i) => {
    // FIXED: Keep first and last points fixed (anchor points for segment continuity)
    if (i === 0 || i === points.length - 1) {
      return { x: p.x, z: p.z }
    }
    
    let noiseX = getNoise(generator, p.x * scale + seedOffset, p.z * scale, octaves, persistence, lacunarity) * 2 - 1
    let noiseZ = getNoise(generator, p.x * scale + 100 + seedOffset, p.z * scale + 100, octaves, persistence, lacunarity) * 2 - 1
    
    // Apply sharpness
    if (sharpness > 0) {
      noiseX = Math.sign(noiseX) * Math.pow(Math.abs(noiseX), 1 - sharpness * 0.8)
      noiseZ = Math.sign(noiseZ) * Math.pow(Math.abs(noiseZ), 1 - sharpness * 0.8)
    }
    
    return {
      x: p.x + noiseX * amplitude,
      z: p.z + noiseZ * amplitude,
    }
  })
  
  // Apply safety measures
  let cleaned = clampDisplacement(points, result, maxOutward, maxInward)
  cleaned = removeSpikes(cleaned)
  cleaned = untanglePolyline(cleaned)
  
  // Restore anchor points after cleanup (they may have been affected)
  if (cleaned.length >= 2 && points.length >= 2) {
    cleaned[0] = { x: points[0].x, z: points[0].z }
    cleaned[cleaned.length - 1] = { x: points[points.length - 1].x, z: points[points.length - 1].z }
  }
  
  return cleaned
}

/**
 * Apply sine wave deformation
 * @param points - array of points
 * @param amplitude - wave height
 * @param wavelength - distance between peaks in world units
 * @param phase - phase offset in radians
 */
export function sineDeformPolyline(points, amplitude = 0.06, wavelength = 0.3, phase = 0) {
  if (points.length < 2 || amplitude <= 0 || wavelength <= 0) return points
  
  const result = []
  
  // Calculate cumulative arc length
  const arcLengths = [0]
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dz = points[i].z - points[i - 1].z
    arcLengths.push(arcLengths[i - 1] + Math.sqrt(dx * dx + dz * dz))
  }
  
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    
    // FIXED: Keep first and last points fixed (anchor points for segment continuity)
    if (i === 0 || i === points.length - 1) {
      result.push({ x: p.x, z: p.z })
      continue
    }
    
    // Get perpendicular direction
    let perpX = 0, perpZ = 0
    if (i === 0 && points.length > 1) {
      const dx = points[1].x - p.x
      const dz = points[1].z - p.z
      const len = Math.sqrt(dx * dx + dz * dz) || 1
      perpX = -dz / len
      perpZ = dx / len
    } else if (i === points.length - 1 && points.length > 1) {
      const dx = p.x - points[i - 1].x
      const dz = p.z - points[i - 1].z
      const len = Math.sqrt(dx * dx + dz * dz) || 1
      perpX = -dz / len
      perpZ = dx / len
    } else {
      const dx = points[i + 1].x - points[i - 1].x
      const dz = points[i + 1].z - points[i - 1].z
      const len = Math.sqrt(dx * dx + dz * dz) || 1
      perpX = -dz / len
      perpZ = dx / len
    }
    
    // Sine based on arc length + phase
    const t = arcLengths[i]
    const offset = Math.sin(t * Math.PI * 2 / wavelength + phase) * amplitude
    
    result.push({
      x: p.x + perpX * offset,
      z: p.z + perpZ * offset,
    })
  }
  
  return result
}

/**
 * Apply zigzag deformation (triangle wave)
 * @param points - array of points
 * @param amplitude - zigzag height
 * @param wavelength - distance between zigzag peaks
 * @param phase - phase offset (0-1)
 */
export function zigzagDeformPolyline(points, amplitude = 0.08, wavelength = 0.2, phase = 0) {
  if (points.length < 2 || amplitude <= 0 || wavelength <= 0) return points
  
  const result = []
  
  // Calculate cumulative arc length
  const arcLengths = [0]
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x
    const dz = points[i].z - points[i - 1].z
    arcLengths.push(arcLengths[i - 1] + Math.sqrt(dx * dx + dz * dz))
  }
  
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    
    // FIXED: Keep first and last points fixed (anchor points for segment continuity)
    if (i === 0 || i === points.length - 1) {
      result.push({ x: p.x, z: p.z })
      continue
    }
    
    // Get perpendicular direction
    let perpX = 0, perpZ = 0
    if (i === 0 && points.length > 1) {
      const dx = points[1].x - p.x
      const dz = points[1].z - p.z
      const len = Math.sqrt(dx * dx + dz * dz) || 1
      perpX = -dz / len
      perpZ = dx / len
    } else if (i === points.length - 1 && points.length > 1) {
      const dx = p.x - points[i - 1].x
      const dz = p.z - points[i - 1].z
      const len = Math.sqrt(dx * dx + dz * dz) || 1
      perpX = -dz / len
      perpZ = dx / len
    } else {
      const dx = points[i + 1].x - points[i - 1].x
      const dz = points[i + 1].z - points[i - 1].z
      const len = Math.sqrt(dx * dx + dz * dz) || 1
      perpX = -dz / len
      perpZ = dx / len
    }
    
    // Triangle wave based on arc length + phase
    const t = arcLengths[i] / wavelength + phase
    const triangleWave = Math.abs((t % 1) * 2 - 1) * 2 - 1
    const offset = triangleWave * amplitude
    
    result.push({
      x: p.x + perpX * offset,
      z: p.z + perpZ * offset,
    })
  }
  
  return result
}

/**
 * Chaikin subdivision for smoothing (rounds corners)
 * @param points - array of points
 * @param iterations - number of subdivision iterations (1-4)
 */
export function smoothPolyline(points, iterations = 2) {
  if (points.length < 3) return points
  
  let result = [...points]
  
  for (let iter = 0; iter < iterations; iter++) {
    const newPoints = []
    
    for (let i = 0; i < result.length; i++) {
      const p0 = result[i]
      const p1 = result[(i + 1) % result.length]
      
      // Chaikin divides each segment into 2 points at 25% and 75%
      newPoints.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        z: p0.z * 0.75 + p1.z * 0.25,
      })
      
      newPoints.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        z: p0.z * 0.25 + p1.z * 0.75,
      })
    }
    
    result = newPoints
  }
  
  return result
}

/**
 * Laplacian smoothing for straightening - moves each point toward the midpoint of neighbors
 * This works well for both convex and concave shapes
 * @param points - array of points (closed loop)
 * @param strength - straightening strength 0-1 (1 = almost straight lines)
 */
export function straightenPolyline(points, strength = 0.5) {
  if (points.length < 4 || strength <= 0) return points
  
  const iterations = Math.ceil(strength * 5)  // More strength = more iterations
  const factor = Math.min(strength, 0.8)  // Shift factor per iteration
  
  let result = [...points]
  
  for (let iter = 0; iter < iterations; iter++) {
    const newPoints = []
    
    for (let i = 0; i < result.length; i++) {
      const prev = result[(i - 1 + result.length) % result.length]
      const curr = result[i]
      const next = result[(i + 1) % result.length]
      
      // Midpoint between neighbors
      const midX = (prev.x + next.x) / 2
      const midZ = (prev.z + next.z) / 2
      
      // Move current point toward midpoint
      newPoints.push({
        x: curr.x + (midX - curr.x) * factor,
        z: curr.z + (midZ - curr.z) * factor,
      })
    }
    
    result = newPoints
  }
  
  return result
}

/**
 * Add wave/noise deformation to polyline
 */
export function deformPolyline(points, type, amplitude, frequency, seed = 0) {
  // Simple noise function
  const noise = (x, y, seed) => {
    const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453
    return n - Math.floor(n)
  }
  
  const perlin = (x, y, seed) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    
    const aa = noise(xi, yi, seed)
    const ab = noise(xi, yi + 1, seed)
    const ba = noise(xi + 1, yi, seed)
    const bb = noise(xi + 1, yi + 1, seed)
    
    const u = xf * xf * (3 - 2 * xf)
    const v = yf * yf * (3 - 2 * yf)
    
    return aa * (1-u) * (1-v) + ba * u * (1-v) + ab * (1-u) * v + bb * u * v
  }
  
  return points.map((p, i) => {
    // Calculate normal at this point
    const prev = points[(i - 1 + points.length) % points.length]
    const next = points[(i + 1) % points.length]
    
    const tangentX = next.x - prev.x
    const tangentZ = next.z - prev.z
    const len = Math.hypot(tangentX, tangentZ)
    
    // Normal is perpendicular to tangent
    const normalX = -tangentZ / len
    const normalZ = tangentX / len
    
    let offset = 0
    
    switch (type) {
      case 'wave':
      case 'sine':
        // Use arc length for continuous wave
        offset = Math.sin(i * frequency * 0.5 + seed) * amplitude
        break
        
      case 'noise':
        offset = (perlin(p.x * frequency, p.z * frequency, seed) * 2 - 1) * amplitude
        break
        
      case 'jagged':
        offset = (noise(Math.floor(i * frequency * 0.3), seed, 0) * 2 - 1) * amplitude
        break
        
      case 'zigzag':
        offset = ((i * frequency * 0.5) % 2 < 1 ? 1 : -1) * amplitude
        break
    }
    
    return {
      x: p.x + normalX * offset,
      z: p.z + normalZ * offset,
    }
  })
}

// ============ SDF GENERATION ============

/**
 * Calculate signed distance from point to polyline
 * Negative = inside, Positive = outside
 */
export function pointToPolylineSDF(px, pz, polyline, closed = true) {
  let minDist = Infinity
  
  const n = polyline.length
  const count = closed ? n : n - 1
  
  for (let i = 0; i < count; i++) {
    const a = polyline[i]
    const b = polyline[(i + 1) % n]
    
    // Vector from a to b
    const abx = b.x - a.x
    const abz = b.z - a.z
    const abLen2 = abx * abx + abz * abz
    
    // Vector from a to point
    const apx = px - a.x
    const apz = pz - a.z
    
    // Project point onto line segment
    let t = abLen2 > 0 ? (apx * abx + apz * abz) / abLen2 : 0
    t = Math.max(0, Math.min(1, t))
    
    // Closest point on segment
    const cx = a.x + t * abx
    const cz = a.z + t * abz
    
    const dist = Math.hypot(px - cx, pz - cz)
    minDist = Math.min(minDist, dist)
  }
  
  // Determine sign using winding number
  if (closed) {
    let winding = 0
    for (let i = 0; i < n; i++) {
      const a = polyline[i]
      const b = polyline[(i + 1) % n]
      
      if (a.z <= pz) {
        if (b.z > pz) {
          const cross = (b.x - a.x) * (pz - a.z) - (px - a.x) * (b.z - a.z)
          if (cross > 0) winding++
        }
      } else {
        if (b.z <= pz) {
          const cross = (b.x - a.x) * (pz - a.z) - (px - a.x) * (b.z - a.z)
          if (cross < 0) winding--
        }
      }
    }
    
    // Inside if winding != 0
    return winding !== 0 ? -minDist : minDist
  }
  
  return minDist
}

/**
 * Calculate signed distance from point to open polyline
 * Sign is determined by which side of the line the point is on
 * Positive = left side (from terrain), Negative = right side (to terrain)
 */
function pointToSegmentSDF(px, pz, polyline) {
  if (polyline.length < 2) return Infinity
  
  let minDist = Infinity
  let closestSegIdx = 0
  let closestT = 0
  
  // Find closest point on polyline
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i]
    const b = polyline[i + 1]
    
    const abx = b.x - a.x
    const abz = b.z - a.z
    const abLen2 = abx * abx + abz * abz
    
    const apx = px - a.x
    const apz = pz - a.z
    
    let t = abLen2 > 0 ? (apx * abx + apz * abz) / abLen2 : 0
    t = Math.max(0, Math.min(1, t))
    
    const cx = a.x + t * abx
    const cz = a.z + t * abz
    
    const dist = Math.hypot(px - cx, pz - cz)
    if (dist < minDist) {
      minDist = dist
      closestSegIdx = i
      closestT = t
    }
  }
  
  // Determine sign using cross product at closest segment
  // Cross product: (b-a) × (p-a) = (bx-ax)*(pz-az) - (bz-az)*(px-ax)
  // Positive = point is on left side, Negative = right side
  const a = polyline[closestSegIdx]
  const b = polyline[Math.min(closestSegIdx + 1, polyline.length - 1)]
  
  const cross = (b.x - a.x) * (pz - a.z) - (b.z - a.z) * (px - a.x)
  
  // Left side (cross > 0) = positive distance (from terrain)
  // Right side (cross < 0) = negative distance (to terrain)
  return cross >= 0 ? minDist : -minDist
}

/**
 * Generate SDF texture based on processed SEGMENTS
 * For each pixel: find nearest segment THAT INVOLVES the pixel's terrain
 * 
 * Returns: Float32Array (RGBA) where:
 *   R = signed distance to nearest segment boundary (for this pixel's terrain)
 *   G = fromTerrain index (normalized: index/256)
 *   B = toTerrain index (normalized: index/256, or 0 if null/void)
 *   A = 1.0 (valid data)
 * 
 * @param patches - Map of patches with processedSegments
 * @param width, height - SDF texture dimensions
 * @param worldBounds - {minX, minZ, maxX, maxZ}
 * @param terrainIdToIndex - Map from terrain ID string to numeric index
 * @param hexMap - Map<hexKey, terrainId> to determine terrain at each pixel
 * @param hexSize - size of hex for coordinate conversion
 */
export function generateSegmentBasedSDF(patches, width, height, worldBounds, terrainIdToIndex = new Map(), hexMap = null, hexSize = 1.0) {
  const data = new Float32Array(width * height * 4)
  
  // MAX_DIST: only write SDF data for pixels within this distance from a boundary
  // Beyond this distance, mark pixel as "no transition" (from=to=terrain, valid=false)
  // Using ~0.6 * hexSize to limit influence zone
  const MAX_DIST = hexSize * 0.6
  
  const { minX, minZ, maxX, maxZ } = worldBounds
  const scaleX = (maxX - minX) / width
  const scaleZ = (maxZ - minZ) / height
  
  // Collect all segments from all patches
  // SKIP segments where neighbor is void (null/undefined) - these are map edges
  // ONLY include segments that have line effects applied (smooth/straighten)
  const allSegments = []
  for (const [, patch] of patches) {
    if (!patch.processedSegments) continue
    for (const segment of patch.processedSegments) {
      // Skip void borders - neighborTerrain is null/undefined for map edges
      if (!segment.neighborTerrain) continue
      
      // Skip segments without line effects - they use raw hex edges, not SDF
      if (!segment.hasLineEffects) continue
      
      if (segment.processedPoints && segment.processedPoints.length >= 2) {
        const fromIdx = terrainIdToIndex.get(patch.terrainId) ?? -1
        const toIdx = terrainIdToIndex.get(segment.neighborTerrain) ?? -1
        
        // Skip if either terrain index is invalid
        if (fromIdx < 0 || toIdx < 0) continue
        
        // Pre-compute bounding box for quick rejection
        const points = segment.processedPoints
        let bbMinX = Infinity, bbMaxX = -Infinity
        let bbMinZ = Infinity, bbMaxZ = -Infinity
        for (const p of points) {
          if (p.x < bbMinX) bbMinX = p.x
          if (p.x > bbMaxX) bbMaxX = p.x
          if (p.z < bbMinZ) bbMinZ = p.z
          if (p.z > bbMaxZ) bbMaxZ = p.z
        }
        // Expand by MAX_DIST for quick rejection
        bbMinX -= MAX_DIST
        bbMaxX += MAX_DIST
        bbMinZ -= MAX_DIST
        bbMaxZ += MAX_DIST
        
        allSegments.push({
          points,
          fromTerrain: patch.terrainId,
          toTerrain: segment.neighborTerrain,
          fromIdx,
          toIdx,
          bbMinX, bbMaxX, bbMinZ, bbMaxZ
        })
      }
    }
  }
  
  // Helper: convert world coords to hex coords (POINTY-TOP hexes)
  // Must match the formula in ThreePreview.vue worldToHex()
  const sqrt3 = Math.sqrt(3)
  function worldToHex(wx, wz) {
    // Pointy-top: inverse of x = size * sqrt(3) * (q + r/2), z = size * 1.5 * r
    const r = wz / (hexSize * 1.5)
    const q = wx / (hexSize * sqrt3) - r / 2
    
    // Round to nearest hex (cube rounding)
    const s = -q - r
    let rq = Math.round(q)
    let rr = Math.round(r)
    let rs = Math.round(s)
    const qDiff = Math.abs(rq - q)
    const rDiff = Math.abs(rr - r)
    const sDiff = Math.abs(rs - s)
    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs
    } else if (rDiff > sDiff) {
      rr = -rq - rs
    }
    return { q: rq, r: rr }
  }
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const worldX = minX + (x + 0.5) * scaleX
      const worldZ = minZ + (y + 0.5) * scaleZ
      
      // Determine terrain at this pixel
      let pixelTerrainIdx = -1
      if (hexMap) {
        const hex = worldToHex(worldX, worldZ)
        const hKey = hexKey(hex.q, hex.r)
        const terrainId = hexMap.get(hKey)
        if (terrainId) {
          pixelTerrainIdx = terrainIdToIndex.get(terrainId) ?? -1
        }
      }
      
      let minAbsDist = Infinity
      let bestSDF = 999
      let bestFromIdx = -1
      let bestToIdx = -1
      
      // Find closest segment THAT INVOLVES THIS PIXEL'S TERRAIN
      for (let i = 0; i < allSegments.length; i++) {
        const seg = allSegments[i]
        
        // Quick bounding box rejection
        if (worldX < seg.bbMinX || worldX > seg.bbMaxX || 
            worldZ < seg.bbMinZ || worldZ > seg.bbMaxZ) {
          continue
        }
        
        // If we know pixel terrain, only consider segments that include it
        if (pixelTerrainIdx >= 0) {
          if (seg.fromIdx !== pixelTerrainIdx && seg.toIdx !== pixelTerrainIdx) {
            continue  // Skip segments that don't involve this pixel's terrain
          }
        }
        
        const sdf = pointToSegmentSDF(worldX, worldZ, seg.points)
        
        if (Math.abs(sdf) < minAbsDist) {
          minAbsDist = Math.abs(sdf)
          bestSDF = sdf
          bestFromIdx = seg.fromIdx
          bestToIdx = seg.toIdx
        }
      }
      
      const idx = (y * width + x) * 4
      
      // Check if we found a valid segment AND it's within MAX_DIST
      const foundValidSegment = bestFromIdx >= 0 && bestToIdx >= 0
      const withinMaxDist = minAbsDist <= MAX_DIST
      const isValid = foundValidSegment && withinMaxDist
      
      if (isValid) {
        // Within transition zone - write real SDF data
        data[idx + 0] = bestSDF                           // Signed distance
        data[idx + 1] = (bestFromIdx + 1) / 256           // From terrain (+1 so -1 becomes 0)
        data[idx + 2] = (bestToIdx + 1) / 256             // To terrain (+1 so -1 becomes 0)
        data[idx + 3] = 1                                 // Valid
      } else {
        // Outside transition zone or no segment - mark as "no transition needed"
        data[idx + 0] = 0                                 // Zero distance
        data[idx + 1] = (pixelTerrainIdx + 1) / 256       // Same terrain for from
        data[idx + 2] = (pixelTerrainIdx + 1) / 256       // Same terrain for to
        data[idx + 3] = 0                                 // Not valid - skip transition effects
      }
    }
  }
  
  return data
}

/**
 * Generate SDF texture data for a region (legacy - uses whole contours)
 * @returns Float32Array with signed distances
 */
export function generateSDFTexture(patches, width, height, worldBounds) {
  const data = new Float32Array(width * height)
  
  const { minX, minZ, maxX, maxZ } = worldBounds
  const scaleX = (maxX - minX) / width
  const scaleZ = (maxZ - minZ) / height
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const worldX = minX + (x + 0.5) * scaleX
      const worldZ = minZ + (y + 0.5) * scaleZ
      
      let minSDF = Infinity
      
      // Find distance to nearest patch boundary
      for (const [, patch] of patches) {
        for (const loop of patch.processedBoundary) {
          const sdf = pointToPolylineSDF(worldX, worldZ, loop, true)
          if (Math.abs(sdf) < Math.abs(minSDF)) {
            minSDF = sdf
          }
        }
      }
      
      data[y * width + x] = minSDF
    }
  }
  
  return data
}

// ============ MAIN COMPOSABLE ============

export function usePatchBoundaries() {
  const patches = shallowRef(new Map())
  const hexToPatch = shallowRef(new Map())
  const sdfTexture = shallowRef(null)
  const sdfWidth = ref(256)
  const sdfHeight = ref(256)
  const worldBounds = ref({ minX: -20, minZ: -20, maxX: 20, maxZ: 20 })
  const terrainIdToIndex = shallowRef(new Map())  // Maps terrain ID to numeric index
  
  // Store hexMap reference for SDF regeneration
  let currentHexMap = null
  let currentHexSize = 1.0
  let currentRules = []
  
  // Effect cache: stores intermediate polyline results after each effect
  // Key: "patchId:segmentIdx:ruleId" -> Array of polylines after each effect
  const effectCache = new Map()
  // Effect hash cache: stores hash of each effect to detect changes
  // Key: "ruleId" -> Array of effect hashes
  const effectHashCache = new Map()
  
  /**
   * Compute hash of effect parameters for cache invalidation
   */
  function computeEffectHash(effect) {
    if (!effect || !effect.enabled) return 'disabled'
    const params = { ...effect }
    delete params.enabled  // enabled is handled separately
    return JSON.stringify(params)
  }
  
  /**
   * Compute hash array for all effects in a rule
   */
  function computeRuleEffectHashes(rule) {
    if (!rule?.lineEffects) return []
    return rule.lineEffects.map(e => computeEffectHash(e))
  }
  
  /**
   * Find first changed effect index by comparing hashes
   * Returns -1 if no changes, or the index of first changed effect
   */
  function findFirstChangedEffectIndex(ruleId, newHashes) {
    const oldHashes = effectHashCache.get(ruleId) || []
    
    // If lengths differ, find first difference
    const maxLen = Math.max(oldHashes.length, newHashes.length)
    for (let i = 0; i < maxLen; i++) {
      if (oldHashes[i] !== newHashes[i]) {
        return i
      }
    }
    return -1  // No changes
  }
  
  /**
   * Invalidate cache for a specific rule starting from effect index
   */
  function invalidateCacheFromEffect(ruleId, fromEffectIdx) {
    // Find all cache entries for this rule and trim their arrays
    for (const [key, polylines] of effectCache.entries()) {
      if (key.includes(`:${ruleId}`)) {
        // Trim the array to keep only results before the changed effect
        if (fromEffectIdx === 0) {
          effectCache.delete(key)
        } else if (polylines.length > fromEffectIdx) {
          polylines.length = fromEffectIdx
        }
      }
    }
  }
  
  /**
   * Update rules incrementally - only recalculate affected segments
   * @param newRules - the new rules array
   * @returns true if incremental update was performed, false if full rebuild needed
   */
  function updateRules(newRules) {
    console.time('[PERF-updateRules] Total')
    
    if (!currentHexMap || patches.value.size === 0) {
      console.timeEnd('[PERF-updateRules] Total')
      console.log('[PERF-updateRules] No hexMap or patches - need full rebuild')
      return null  // Need full rebuild - return null to signal failure
    }
    
    // Compare each rule to find changes
    console.time('[PERF-updateRules] Detect changes')
    const changedRules = []
    
    for (const newRule of newRules) {
      const newHashes = computeRuleEffectHashes(newRule)
      const firstChanged = findFirstChangedEffectIndex(newRule.id, newHashes)
      
      if (firstChanged >= 0) {
        changedRules.push({
          ruleId: newRule.id,
          startFromEffect: firstChanged,
          newHashes
        })
        
        // Invalidate cache from the changed effect onwards
        invalidateCacheFromEffect(newRule.id, firstChanged)
      }
      
      // Update hash cache
      effectHashCache.set(newRule.id, newHashes)
    }
    console.timeEnd('[PERF-updateRules] Detect changes')
    
    if (changedRules.length === 0) {
      console.timeEnd('[PERF-updateRules] Total')
      console.log('[PERF-updateRules] No line effect changes detected')
      return { success: true, patchesAffected: 0 }  // No changes detected
    }
    
    // Update currentRules reference
    currentRules = newRules
    
    // Reprocess only affected patches/segments
    let patchesAffected = 0
    for (const [, patch] of patches.value) {
      // Check if ANY of this patch's segments use a changed rule
      let patchAffected = false
      let matchingChange = null
      
      for (const change of changedRules) {
        // Check ALL segments in this patch, not just the first one
        for (const seg of patch.segments || []) {
          const matchingRule = findMatchingRule(patch.terrainId, seg.neighborTerrain, newRules)
          if (matchingRule?.id === change.ruleId) {
            patchAffected = true
            matchingChange = change
            break
          }
        }
        if (patchAffected) break
      }
      
      if (patchAffected) {
        patchesAffected++
        
        // Reprocess segments for this patch with incremental update
        let processedSegments = processSegmentsWithEffects(
          patch.segments, 
          patch.terrainId, 
          patch.id, 
          newRules,
          matchingChange?.ruleId || null,
          matchingChange?.startFromEffect || 0
        )
        
        // Fix intersections between segments of the same patch
        processedSegments = untanglePatchSegments(processedSegments)
        
        patch.processedSegments = processedSegments
        patch.processedBoundary = [combineSegmentsToContour(processedSegments)]
      }
    }
    
    // NOTE: CPU SDF not regenerated - GPU segment textures are used for rendering
    return { success: true, patchesAffected }
  }
  
  /**
   * Clear all effect caches - call when hex map changes
   */
  function clearEffectCache() {
    effectCache.clear()
    effectHashCache.clear()
  }

  /**
   * Full rebuild of all patches
   * @param terrains - array of terrain definitions (to build ID→index mapping)
   * @param hexSize - size of hex for world->hex conversion in SDF
   */
  function rebuildAll(hexMap, rules = [], terrains = [], hexSize = 1.0) {
    // Clear effect cache for full rebuild
    clearEffectCache()
    
    // Save hexMap and hexSize for SDF regeneration
    currentHexMap = hexMap
    currentHexSize = hexSize
    currentRules = rules
    
    // Build terrain ID → index mapping
    const idToIdx = new Map()
    terrains.forEach((t, idx) => {
      idToIdx.set(t.id, idx)
    })
    terrainIdToIndex.value = idToIdx
    
    // 1. Find patches
    patches.value = findPatches(hexMap)
    hexToPatch.value = buildHexToPatchIndex(patches.value)
    
    // 2. Extract and process boundaries
    for (const [, patch] of patches.value) {
      const edges = extractPatchBoundary(patch, hexMap)
      const loops = buildBoundaryLoops(edges)
      
      // Save raw edges for debug (with neighborTerrain info)
      patch.rawEdges = edges
      
      // Build ordered edges and segments for debug
      const orderedContours = buildOrderedEdgesWithMeta(edges)
      patch.orderedContours = orderedContours
      patch.segments = orderedContours.length > 0 
        ? groupEdgesIntoSegments(orderedContours[0]) 
        : []
      
      // Apply effects based on rules - process SEGMENTS with ghost edges
      patch.boundary = loops
      
      // Process each segment with its matching rule
      let processedSegments = processSegmentsWithEffects(patch.segments, patch.terrainId, patch.id, rules)
      
      // Fix intersections between segments of the same patch
      processedSegments = untanglePatchSegments(processedSegments)
      
      patch.processedSegments = processedSegments
      
      // Combine processed segments back into a single contour for SDF
      patch.processedBoundary = [combineSegmentsToContour(processedSegments)]
    }
    
    // 3. Generate SDF texture
    regenerateSDF()
  }
  
  /**
   * Process segments with effects, using cache for intermediate results
   * @param segments - array of segments
   * @param terrainId - terrain ID of the patch
   * @param patchId - unique patch ID for caching
   * @param rules - transition rules
   * @param changedRuleId - if set, only process segments affected by this rule
   * @param startFromEffect - if set, start processing from this effect index (use cached results before it)
   */
  function processSegmentsWithEffects(segments, terrainId, patchId, rules, changedRuleId = null, startFromEffect = 0) {
    if (!segments || segments.length === 0) return []
    
    // Process each segment - find matching rule and apply effects
    return segments.map((segment, segmentIdx) => {
      // Find rule for this terrain→neighbor transition (checks both directions)
      const rule = findMatchingRule(terrainId, segment.neighborTerrain, rules)
      
      // Skip processing if we're doing incremental update and this segment uses a different rule
      if (changedRuleId !== null && rule?.id !== changedRuleId) {
        // Return existing processed result if available
        const cacheKey = `${patchId}:${segmentIdx}:${rule?.id || 'none'}`
        const cached = effectCache.get(cacheKey)
        if (cached && cached.length > 0) {
          return {
            neighborTerrain: segment.neighborTerrain,
            edges: segment.edges,
            processedPoints: cached[cached.length - 1],  // Last cached result
            rule: rule?.id || null,
            hasLineEffects: cached.length > 1
          }
        }
      }
      
      const cacheKey = `${patchId}:${segmentIdx}:${rule?.id || 'none'}`
      let cachedResults = effectCache.get(cacheKey) || []
      
      // Determine starting polyline - either from cache or from scratch
      let polyline
      let effectStartIdx = 0
      
      if (startFromEffect > 0 && cachedResults.length >= startFromEffect) {
        // We have cached results, start from cached polyline
        polyline = cachedResults[startFromEffect - 1].map(p => ({ ...p }))  // Clone
        effectStartIdx = startFromEffect
        // Trim cache to the point we're starting from
        cachedResults = cachedResults.slice(0, startFromEffect)
      } else {
        // Start from original edges
        polyline = edgesToPolyline(segment.edges)
        cachedResults = []
        effectStartIdx = 0
      }
      
      // Apply effects from rule - in order specified by user
      let effectsApplied = cachedResults.length
      if (rule) {
        const effects = rule.lineEffects || []
        for (let i = effectStartIdx; i < effects.length; i++) {
          const effect = effects[i]
          if (!effect.enabled) {
            // Still cache the result (unchanged polyline) for disabled effects
            cachedResults.push(polyline.map(p => ({ ...p })))
            continue
          }
          
          switch (effect.type) {
            case 'subdivide':
              polyline = subdividePolyline(polyline, effect.segments || 8)
              effectsApplied++
              break
            case 'smooth':
              polyline = smoothPolylineOpen(polyline, effect.iterations || 2)
              effectsApplied++
              break
            case 'straighten':
              polyline = straightenPolylineOpen(polyline, effect.strength || 0.5)
              effectsApplied++
              break
            case 'wave':
              if (polyline.length < 16) {
                polyline = subdividePolyline(polyline, Math.ceil(16 / polyline.length))
              }
              polyline = waveDeformPolyline(
                polyline, 
                effect.amplitude || 0.08, 
                effect.frequency || 3.0, 
                effect.seed || 0,
                effect.noiseType || 'perlin',
                effect.octaves || 1,
                effect.persistence || 0.5,
                effect.lacunarity || 2.0,
                effect.scale || 0.3,
                effect.sharpness || 0,
                effect.maxInward ?? 0.5,
                effect.maxOutward ?? 0.5
              )
              effectsApplied++
              break
            case 'noise':
              if (polyline.length < 12) {
                polyline = subdividePolyline(polyline, Math.ceil(12 / polyline.length))
              }
              polyline = noiseDeformPolyline(
                polyline, 
                effect.amplitude || 0.05, 
                effect.scale || 0.15, 
                effect.seed || 0,
                effect.noiseType || 'perlin',
                effect.octaves || 1,
                effect.persistence || 0.5,
                effect.lacunarity || 2.0,
                effect.sharpness || 0,
                effect.maxInward ?? 0.3,
                effect.maxOutward ?? 0.3
              )
              effectsApplied++
              break
            case 'sine':
              if (polyline.length < 20) {
                polyline = subdividePolyline(polyline, Math.ceil(20 / polyline.length))
              }
              polyline = sineDeformPolyline(polyline, effect.amplitude || 0.06, effect.wavelength || 0.3, effect.phase || 0)
              effectsApplied++
              break
            case 'zigzag':
              if (polyline.length < 16) {
                polyline = subdividePolyline(polyline, Math.ceil(16 / polyline.length))
              }
              polyline = zigzagDeformPolyline(polyline, effect.amplitude || 0.08, effect.wavelength || 0.2, effect.phase || 0)
              polyline = smoothPolylineOpen(polyline, 1)
              effectsApplied++
              break
          }
          
          // Cache result after each effect
          cachedResults.push(polyline.map(p => ({ ...p })))
        }
      }
      
      // Store updated cache
      effectCache.set(cacheKey, cachedResults)
      
      return {
        neighborTerrain: segment.neighborTerrain,
        edges: segment.edges,
        processedPoints: polyline,
        rule: rule?.id || null,
        hasLineEffects: effectsApplied > 0
      }
    })
  }
  
  /**
   * Find matching rule for terrain transition
   * Searches in BOTH directions: from→to and to→from
   */
  function findMatchingRule(fromTerrain, toTerrain, rules) {
    if (!rules || rules.length === 0) return null
    
    // Priority: exact match > id-to-any > any-to-id > any-to-any
    // For each level, check BOTH directions (from→to and to→from)
    
    // 1. Exact match (id-to-id) - check both directions
    let rule = rules.find(r => 
      r.match?.level === 'id-to-id' &&
      r.match?.from === fromTerrain &&
      r.match?.to === toTerrain
    )
    if (rule) return rule
    
    // 1b. Exact match reversed (to→from)
    rule = rules.find(r => 
      r.match?.level === 'id-to-id' &&
      r.match?.from === toTerrain &&
      r.match?.to === fromTerrain
    )
    if (rule) return rule
    
    // 2. id-to-any (from matches, to is any)
    rule = rules.find(r =>
      r.match?.level === 'id-to-any' &&
      (r.match?.from === fromTerrain || r.match?.from === toTerrain)
    )
    if (rule) return rule
    
    // 3. any-to-id (from is any, to matches)
    rule = rules.find(r =>
      r.match?.level === 'any-to-id' &&
      (r.match?.to === toTerrain || r.match?.to === fromTerrain)
    )
    if (rule) return rule
    
    // 4. any-to-any (fallback)
    rule = rules.find(r => r.match?.level === 'any-to-any')
    return rule || null
  }
  
  /**
   * Combine processed segments back into a closed contour
   */
  function combineSegmentsToContour(processedSegments) {
    if (!processedSegments || processedSegments.length === 0) return []
    
    const contour = []
    for (const segment of processedSegments) {
      // Add all points except last (to avoid duplicates at joins)
      for (let i = 0; i < segment.processedPoints.length - 1; i++) {
        contour.push(segment.processedPoints[i])
      }
    }
    // Add the very last point to close
    const lastSeg = processedSegments[processedSegments.length - 1]
    if (lastSeg.processedPoints.length > 0) {
      contour.push(lastSeg.processedPoints[lastSeg.processedPoints.length - 1])
    }
    
    return contour
  }
  
  /**
   * Incremental update when hexes change
   */
  function updateHexes(changedHexes, hexMap, rules = []) {
    // Find affected patches
    const affectedPatchIds = new Set()
    
    for (const hexKeyStr of changedHexes) {
      // Old patch (if any)
      const oldPatchId = hexToPatch.value.get(hexKeyStr)
      if (oldPatchId) affectedPatchIds.add(oldPatchId)
      
      // Check neighbors - their patches might be affected too
      const { q, r } = parseHexKey(hexKeyStr)
      for (const offset of NEIGHBOR_OFFSETS) {
        const neighborKey = hexKey(q + offset.q, r + offset.r)
        const neighborPatchId = hexToPatch.value.get(neighborKey)
        if (neighborPatchId) affectedPatchIds.add(neighborPatchId)
      }
    }
    
    // For simplicity in this version, rebuild all if patches changed
    // A more optimized version would only rebuild affected patches
    if (affectedPatchIds.size > 0) {
      rebuildAll(hexMap, rules)
    }
  }
  
  /**
   * Regenerate SDF texture from current processed segments
   * Uses segment-based SDF for proper terrain boundaries
   * Now stores full RGBA: R=SDF, G=fromTerrain, B=toTerrain, A=valid
   * Also uses hexMap to find segment relevant to each pixel's terrain
   */
  function regenerateSDF() {
    // Use segment-based SDF for accurate boundaries
    // Pass hexMap and hexSize to filter segments by pixel terrain
    sdfTexture.value = generateSegmentBasedSDF(
      patches.value,
      sdfWidth.value,
      sdfHeight.value,
      worldBounds.value,
      terrainIdToIndex.value,
      currentHexMap,
      currentHexSize
    )
  }
  
  /**
   * Export data in format suitable for GPU segment textures
   * Returns: { patches, segments, hexSegments }
   * 
   * IMPORTANT: Each boundary between two patches is exported ONCE, not twice.
   * We use a set to track which patch pairs have been processed.
   */
  function exportForGPU() {
    const exportedPatches = []
    const exportedSegments = []
    const hexSegmentMap = new Map()  // hexKey -> [segmentId, ...]
    const processedPatchPairs = new Set()  // Track "patchA-patchB" to avoid duplicates
    
    let globalSegmentId = 0
    
    // Build patch ID to export index mapping
    const patchIdToExportIdx = new Map()
    let patchExportIdx = 0
    for (const [patchId, patch] of patches.value) {
      patchIdToExportIdx.set(patchId, patchExportIdx)
      exportedPatches.push({
        terrainId: patch.terrainId,
        hexes: patch.hexes,
      })
      patchExportIdx++
    }
    
    // Export segments with patch references - ONLY segments with line effects
    for (const [patchId, patch] of patches.value) {
      const patchLeft = patchIdToExportIdx.get(patchId)
      
      const processedSegs = patch.processedSegments || []
      
      for (const seg of processedSegs) {
        // FILTER: Only export segments that have line effects applied
        if (!seg.hasLineEffects) continue
        
        // Find neighbor patch using the ACTUAL hexes from this segment's edges
        let patchRight = -1
        let neighborPatchId = null
        if (seg.neighborTerrain && seg.edges && seg.edges.length > 0) {
          // Get neighbor hex keys from segment edges
          const segmentNeighborHexes = new Set()
          for (const edge of seg.edges) {
            if (edge.hexKey && edge.edgeIdx !== undefined) {
              const { q, r } = parseHexKey(edge.hexKey)
              const offset = NEIGHBOR_OFFSETS[edge.edgeIdx]
              if (offset) {
                segmentNeighborHexes.add(hexKey(q + offset.q, r + offset.r))
              }
            }
          }
          
          // Find patch that contains these neighbor hexes
          for (const [npId, neighborPatch] of patches.value) {
            if (neighborPatch.terrainId === seg.neighborTerrain && npId !== patchId) {
              // Check if this patch contains ANY of the segment's neighbor hexes
              for (const nhKey of segmentNeighborHexes) {
                if (neighborPatch.hexes.has(nhKey)) {
                  patchRight = patchIdToExportIdx.get(npId)
                  neighborPatchId = npId
                  break
                }
              }
            }
            if (patchRight >= 0) break
          }
        }
        
        // Get processed points
        const points = seg.processedPoints || []
        if (points.length < 2) continue
        
        // DEDUPLICATION: Check if this exact segment was already exported
        // Use coordinates of ORIGINAL edges (not processed) as signature
        // because processed points differ between patches due to smoothing
        // Two patches can have MULTIPLE separate boundary segments!
        if (patchRight >= 0 && neighborPatchId) {
          // Use original edges for dedup key (before smoothing/straightening)
          const edges = seg.edges || []
          if (edges.length > 0) {
            // Collect ALL unique edge vertex coordinates and sort them
            // This way both directions produce the same key
            const roundCoord = (v) => Math.round(v * 100) / 100
            const allCoords = new Set()
            for (const edge of edges) {
              if (edge.from) allCoords.add(`${roundCoord(edge.from.x)},${roundCoord(edge.from.z)}`)
              if (edge.to) allCoords.add(`${roundCoord(edge.to.x)},${roundCoord(edge.to.z)}`)
            }
            // Sort coordinates to create canonical key
            const sortedCoords = [...allCoords].sort()
            const coordsKey = sortedCoords.join('|')
            
            // Include patch pair in key (sorted)
            const pairKey = patchId < neighborPatchId 
              ? `${patchId}:${neighborPatchId}:${coordsKey}`
              : `${neighborPatchId}:${patchId}:${coordsKey}`
            
            // Dedup logic for patch pairs
            if (processedPatchPairs.has(pairKey)) {
              // This exact segment was already exported from the other side
              continue
            }
            processedPatchPairs.add(pairKey)
          }
        } else {
          // No neighbor patch found - skip dedup check
        }
        
        // Get the full boundary loop of patchLeft for point-in-polygon test
        // patch.boundary is array of loops, take the first one (main contour)
        const fullBoundaryLoop = (patch.boundary && patch.boundary.length > 0) 
          ? patch.boundary[0] 
          : []
        
        // Compute normals for each fragment using point-in-polygon with the full patch contour
        const fragmentNormals = computeFragmentNormals(points, seg.edges || [], fullBoundaryLoop)
        
        const segmentData = {
          id: globalSegmentId,
          patchLeft,
          patchRight,
          points: points.map(p => ({ x: p.x, z: p.z })),
          normals: fragmentNormals,  // One normal per fragment (N-1 for N points)
          neighborTerrain: seg.neighborTerrain,
          hasLineEffects: seg.hasLineEffects || false,
        }
        
        exportedSegments.push(segmentData)
        
        // Add segment to hexes on BOTH sides of the boundary (original edges)
        for (const edge of seg.edges || []) {
          if (edge.hexKey) {
            // Add to the hex that owns this edge (left side)
            if (!hexSegmentMap.has(edge.hexKey)) {
              hexSegmentMap.set(edge.hexKey, [])
            }
            const list = hexSegmentMap.get(edge.hexKey)
            if (!list.includes(globalSegmentId)) {
              list.push(globalSegmentId)
            }
            
            // Also add to the neighbor hex on the other side of this edge (right side)
            const { q, r } = parseHexKey(edge.hexKey)
            if (edge.edgeIdx !== undefined) {
              const offset = NEIGHBOR_OFFSETS[edge.edgeIdx]
              if (offset) {
                const neighborKey = hexKey(q + offset.q, r + offset.r)
                if (!hexSegmentMap.has(neighborKey)) {
                  hexSegmentMap.set(neighborKey, [])
                }
                const neighborList = hexSegmentMap.get(neighborKey)
                if (!neighborList.includes(globalSegmentId)) {
                  neighborList.push(globalSegmentId)
                }
              }
            }
          }
        }
        
        // NOTE: hexSegmentMap is kept for backward compatibility but 
        // the GPU shader now iterates ALL segments for each pixel
        
        globalSegmentId++
      }
    }
    
    // Export complete
    
    return {
      patches: exportedPatches,
      segments: exportedSegments,
      hexSegments: hexSegmentMap,
    }
  }
  
  return {
    patches,
    hexToPatch,
    sdfTexture,
    sdfWidth,
    sdfHeight,
    worldBounds,
    terrainIdToIndex,
    rebuildAll,
    updateRules,
    updateHexes,
    regenerateSDF,
    exportForGPU,
    clearEffectCache,
  }
}

export default usePatchBoundaries
