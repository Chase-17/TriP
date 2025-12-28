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
      // Return edges with original metadata
      const orderedEdges = contourEdges.map(e => ({
        from: e.v1,
        to: e.v2,
        neighborTerrain: e.original.neighborTerrain,
        hexKey: e.original.hexKey,
        edgeIdx: e.original.edgeIdx,
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
  let skippedNoEffects = 0
  for (const [, patch] of patches) {
    if (!patch.processedSegments) continue
    for (const segment of patch.processedSegments) {
      // Skip void borders - neighborTerrain is null/undefined for map edges
      if (!segment.neighborTerrain) continue
      
      // Skip segments without line effects - they use raw hex edges, not SDF
      if (!segment.hasLineEffects) {
        skippedNoEffects++
        continue
      }
      
      if (segment.processedPoints && segment.processedPoints.length >= 2) {
        const fromIdx = terrainIdToIndex.get(patch.terrainId) ?? -1
        const toIdx = terrainIdToIndex.get(segment.neighborTerrain) ?? -1
        
        // Skip if either terrain index is invalid
        if (fromIdx < 0 || toIdx < 0) continue
        
        allSegments.push({
          points: segment.processedPoints,
          fromTerrain: patch.terrainId,
          toTerrain: segment.neighborTerrain,
          fromIdx,
          toIdx,
        })
      }
    }
  }
  
  // Log segment details for debugging
  const segmentPairs = new Map()
  for (const seg of allSegments) {
    const key = `${seg.fromIdx}->${seg.toIdx}`
    segmentPairs.set(key, (segmentPairs.get(key) || 0) + 1)
  }
  console.log(`[SDF] Generating ${width}x${height} from ${allSegments.length} segments with line effects (skipped ${skippedNoEffects} without effects)`)
  console.log(`[SDF] Segment terrain pairs:`, Object.fromEntries(segmentPairs))
  
  const startTime = performance.now()
  
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
  
  // Statistics for debugging
  let pixelsWithTerrain = 0
  let pixelsWithoutTerrain = 0
  let pixelsWithValidSDF = 0
  let pixelsNoMatchingSegment = 0
  
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
      
      if (pixelTerrainIdx >= 0) {
        pixelsWithTerrain++
      } else {
        pixelsWithoutTerrain++
      }
      
      let minAbsDist = Infinity
      let bestSDF = 999
      let bestFromIdx = -1
      let bestToIdx = -1
      
      // Find closest segment THAT INVOLVES THIS PIXEL'S TERRAIN
      for (let i = 0; i < allSegments.length; i++) {
        const seg = allSegments[i]
        
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
        pixelsWithValidSDF++
        data[idx + 0] = bestSDF                           // Signed distance
        data[idx + 1] = (bestFromIdx + 1) / 256           // From terrain (+1 so -1 becomes 0)
        data[idx + 2] = (bestToIdx + 1) / 256             // To terrain (+1 so -1 becomes 0)
        data[idx + 3] = 1                                 // Valid
      } else {
        // Outside transition zone or no segment - mark as "no transition needed"
        // from=to=pixelTerrain signals shader to render without transition
        if (pixelTerrainIdx >= 0) {
          pixelsNoMatchingSegment++
        }
        data[idx + 0] = 0                                 // Zero distance (at boundary = no effect)
        data[idx + 1] = (pixelTerrainIdx + 1) / 256       // Same terrain for from
        data[idx + 2] = (pixelTerrainIdx + 1) / 256       // Same terrain for to
        data[idx + 3] = 0                                 // Not valid - skip transition effects
      }
    }
  }
  
  const elapsed = performance.now() - startTime
  console.log(`[SDF] Generation took ${elapsed.toFixed(1)}ms for ${width*height} pixels`)
  console.log(`[SDF] MAX_DIST=${MAX_DIST.toFixed(2)}, hexSize=${hexSize}`)
  console.log(`[SDF] Pixels: ${pixelsWithTerrain} with terrain, ${pixelsWithoutTerrain} without (void/edge)`)
  console.log(`[SDF] SDF: ${pixelsWithValidSDF} valid (within MAX_DIST), ${pixelsNoMatchingSegment} outside or no segment`)
  
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
  
  /**
   * Full rebuild of all patches
   * @param terrains - array of terrain definitions (to build ID→index mapping)
   * @param hexSize - size of hex for world->hex conversion in SDF
   */
  function rebuildAll(hexMap, rules = [], terrains = [], hexSize = 1.0) {
    // Save hexMap and hexSize for SDF regeneration
    currentHexMap = hexMap
    currentHexSize = hexSize
    
    // Build terrain ID → index mapping
    const idToIdx = new Map()
    terrains.forEach((t, idx) => {
      idToIdx.set(t.id, idx)
    })
    terrainIdToIndex.value = idToIdx
    console.log('[PatchBoundaries] terrainIdToIndex:', Object.fromEntries(idToIdx))
    
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
      const processedSegments = processSegmentsWithEffects(patch.segments, patch.terrainId, rules)
      patch.processedSegments = processedSegments
      
      // Combine processed segments back into a single contour for SDF
      patch.processedBoundary = [combineSegmentsToContour(processedSegments)]
    }
    
    // 3. Generate SDF texture
    regenerateSDF()
  }
  
  /**
   * Process segments with ghost edges for smooth transitions
   * Ghost edges are taken from neighboring segments to ensure smooth line transitions
   */
  function processSegmentsWithEffects(segments, terrainId, rules, defaultGhostEdgeCount = 2) {
    if (!segments || segments.length === 0) return []
    
    // First pass: determine the global ghostEdgeCount for the entire patch
    // This ensures all segments use the same ghost edge count for consistency
    let patchGhostEdgeCount = defaultGhostEdgeCount
    for (const segment of segments) {
      const rule = findMatchingRule(terrainId, segment.neighborTerrain, rules)
      if (rule?.lineEffects) {
        for (const effect of rule.lineEffects) {
          if (effect.enabled && effect.ghostEdges !== undefined) {
            patchGhostEdgeCount = Math.max(patchGhostEdgeCount, effect.ghostEdges)
          }
        }
      }
    }
    
    // Second pass: process each segment with the unified ghost edge count
    return segments.map((segment, segmentIdx) => {
      // Find rule for this terrain→neighbor transition
      const rule = findMatchingRule(terrainId, segment.neighborTerrain, rules)
      
      // Use patch-wide ghost edge count (computed above)
      const ghostEdgeCount = patchGhostEdgeCount
      
      // Get ghost edges from neighbors
      const prevSegment = segments[(segmentIdx - 1 + segments.length) % segments.length]
      const nextSegment = segments[(segmentIdx + 1) % segments.length]
      
      const ghostEdgesBefore = prevSegment.edges.slice(-ghostEdgeCount)
      const ghostEdgesAfter = nextSegment.edges.slice(0, ghostEdgeCount)
      
      // Convert to points
      const beforePoints = edgesToPolyline(ghostEdgesBefore)
      const currentPoints = edgesToPolyline(segment.edges)
      const afterPoints = edgesToPolyline(ghostEdgesAfter)
      
      // Combine: before + current + after
      let extendedPolyline = [
        ...beforePoints.slice(0, -1),
        ...currentPoints,
        ...afterPoints.slice(1)
      ]
      
      const ghostPointsBefore = beforePoints.length - 1
      const ghostPointsAfter = afterPoints.length - 1
      const originalLength = currentPoints.length
      
      // Apply effects from rule
      let effectsApplied = 0
      if (rule) {
        for (const effect of rule.lineEffects || []) {
          if (!effect.enabled) continue
          
          switch (effect.type) {
            case 'smooth':
              extendedPolyline = smoothPolylineOpen(extendedPolyline, effect.iterations || 2)
              effectsApplied++
              break
            case 'straighten':
              extendedPolyline = straightenPolylineOpen(extendedPolyline, effect.strength || 0.5)
              effectsApplied++
              break
            // TODO: add deformation effects for open polylines
          }
        }
      }
      
      // Debug: log first segment of first call
      if (segmentIdx === 0 && !processSegmentsWithEffects._logged) {
        processSegmentsWithEffects._logged = true
        console.log('[processSegments] First segment:', {
          neighborTerrain: segment.neighborTerrain,
          edgesCount: segment.edges.length,
          patchGhostEdgeCount,
          ghostEdgeCount,
          beforePointsCount: beforePoints.length,
          currentPointsCount: currentPoints.length,
          afterPointsCount: afterPoints.length,
          ruleId: rule?.id,
          lineEffects: rule?.lineEffects,
          effectsApplied,
          extendedPolylineLength: extendedPolyline.length
        })
      }
      
      // Extract only the current segment's portion
      const totalOriginalPoints = ghostPointsBefore + originalLength + ghostPointsAfter
      const ratio = extendedPolyline.length / totalOriginalPoints
      
      const startIdx = Math.round(ghostPointsBefore * ratio)
      const endIdx = extendedPolyline.length - Math.round(ghostPointsAfter * ratio)
      
      const processedPoints = extendedPolyline.slice(startIdx, endIdx)
      
      return {
        neighborTerrain: segment.neighborTerrain,
        edges: segment.edges,
        processedPoints,
        rule: rule?.id || null,
        hasLineEffects: effectsApplied > 0  // Only include in SDF if line effects were applied
      }
    })
  }
  
  /**
   * Find matching rule for terrain transition
   */
  function findMatchingRule(fromTerrain, toTerrain, rules) {
    // Priority: exact match > id-to-any > any-to-id > any-to-any
    
    // 1. Exact match (id-to-id)
    let rule = rules.find(r => 
      r.match?.level === 'id-to-id' &&
      r.match?.from === fromTerrain &&
      r.match?.to === toTerrain
    )
    if (rule) return rule
    
    // 2. id-to-any (from matches, to is any)
    rule = rules.find(r =>
      r.match?.level === 'id-to-any' &&
      r.match?.from === fromTerrain
    )
    if (rule) return rule
    
    // 3. any-to-id (from is any, to matches)
    rule = rules.find(r =>
      r.match?.level === 'any-to-id' &&
      r.match?.to === toTerrain
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
  
  return {
    patches,
    hexToPatch,
    sdfTexture,
    sdfWidth,
    sdfHeight,
    worldBounds,
    terrainIdToIndex,
    rebuildAll,
    updateHexes,
    regenerateSDF,
  }
}

export default usePatchBoundaries
