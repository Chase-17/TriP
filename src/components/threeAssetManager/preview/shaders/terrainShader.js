/**
 * Terrain Shader - GPU-based terrain rendering with segment-based SDF
 * 
 * Architecture:
 * - Segments are polylines stored in textures
 * - SDF is computed on-the-fly per pixel
 * - Each hex knows which segments are nearby (max 8)
 * - Blend/effects use segment distance
 */

// Vertex shader - simple passthrough with world coords
export const vertexShader = /* glsl */ `
  precision highp float;
  
  attribute vec2 hexCoord;
  
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec2 vHexCoord;
  varying vec2 vWorldXZ;
  
  uniform float uTime;
  uniform vec2 uDataSize;
  uniform float uHexRadius;
  
  void main() {
    vColor = color;
    vNormal = normalMatrix * normal;
    vHexCoord = hexCoord;
    
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldXZ = worldPos.xz;
    
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

// Fragment shader with segment-based SDF
export const fragmentShader = /* glsl */ `
  precision highp float;
  
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec2 vHexCoord;
  varying vec2 vWorldXZ;
  
  // ============ UNIFORMS ============
  
  uniform float uTime;
  uniform vec2 uDataSize;
  uniform float uHexRadius;
  
  // Terrain data
  uniform sampler2D uTerrainData;     // Per-hex: [terrainId, layerCount, elevation, alpha]
  uniform sampler2D uTerrainColors;   // Per-terrain: [R, G, B, A]
  uniform sampler2D uTerrainLayers;   // Per-terrain layers data
  
  // Segment data (NEW)
  uniform sampler2D uSegmentMeta;     // Per-segment: [patchLeft, patchRight, pointStart, pointCount]
  uniform sampler2D uSegmentPoints;   // All polyline points: [x, z, x, z, ...]
  uniform sampler2D uHexSegments;     // Per-hex: up to 8 segment IDs
  uniform sampler2D uPatchTerrains;   // Per-patch: terrainId
  
  uniform float uSegmentCount;        // Total number of segments
  uniform float uMaxSegmentsPerHex;   // Max segments per hex (8)
  
  // Transition rules
  uniform sampler2D uTransitionRules;
  uniform float uRuleCount;
  uniform float uRuleDataWidth;
  
  // Lighting
  uniform vec3 uLightDirection;
  uniform vec3 uAmbientLight;
  uniform vec3 uDirectionalLight;
  uniform float uFlatLighting;
  
  // Layer processing
  uniform float uMaxLayers;
  uniform float uLayerDataWidth;
  
  // Debug
  uniform int uDebugSDFMode;
  
  // ============ CONSTANTS ============
  
  const float SQRT3 = 1.7320508;
  const float PI = 3.14159265;
  const float MAX_DIST = 999.0;
  
  // ============ HEX MATH ============
  
  vec2 hexToWorld(vec2 hex) {
    float x = SQRT3 * (hex.x + hex.y / 2.0);
    float z = 1.5 * hex.y;
    return vec2(x, z);
  }
  
  // ============ SEGMENT SDF ============
  
  // Distance from point to line segment
  float distanceToLineSegment(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    vec2 ap = p - a;
    float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
    vec2 closest = a + t * ab;
    return length(p - closest);
  }
  
  // Signed distance - positive on right side, negative on left
  float signedDistanceToLineSegment(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b - a;
    vec2 ap = p - a;
    float t = clamp(dot(ap, ab) / dot(ab, ab), 0.0, 1.0);
    vec2 closest = a + t * ab;
    float dist = length(p - closest);
    
    // Cross product for side
    float cross = ab.x * ap.y - ab.y * ap.x;
    return cross > 0.0 ? dist : -dist;
  }
  
  // Get segment metadata
  struct SegmentInfo {
    int patchLeft;
    int patchRight;
    int pointStart;
    int pointCount;
  };
  
  SegmentInfo getSegmentInfo(int segId) {
    vec4 meta = texelFetch(uSegmentMeta, ivec2(segId, 0), 0);
    SegmentInfo info;
    info.patchLeft = int(meta.x * 255.0);
    info.patchRight = int(meta.y * 255.0);
    info.pointStart = int(meta.z * 65535.0);  // Support up to 65k points
    info.pointCount = int(meta.w * 255.0);
    return info;
  }
  
  // Get point from points texture
  vec2 getSegmentPoint(int index) {
    // Points stored as vec4: [x0, z0, x1, z1]
    int pixelIdx = index / 2;
    vec4 data = texelFetch(uSegmentPoints, ivec2(pixelIdx, 0), 0);
    return (index % 2 == 0) ? data.xy : data.zw;
  }
  
  // Compute signed distance to a polyline segment
  float distanceToSegment(int segId, vec2 worldPos) {
    SegmentInfo info = getSegmentInfo(segId);
    if (info.pointCount < 2) return MAX_DIST;
    
    float minDist = MAX_DIST;
    float signAccum = 0.0;
    
    for (int i = 0; i < 64; i++) {  // Max 64 points per segment
      if (i >= info.pointCount - 1) break;
      
      vec2 p0 = getSegmentPoint(info.pointStart + i);
      vec2 p1 = getSegmentPoint(info.pointStart + i + 1);
      
      float d = signedDistanceToLineSegment(worldPos, p0, p1);
      
      if (abs(d) < abs(minDist)) {
        minDist = d;
      }
    }
    
    return minDist;
  }
  
  // Get terrain ID for a patch
  float getPatchTerrainId(int patchId) {
    if (patchId < 0) return -1.0;
    vec4 data = texelFetch(uPatchTerrains, ivec2(patchId, 0), 0);
    return data.x * 255.0;
  }
  
  // ============ SDF RESULT STRUCTURE ============
  
  struct SDFResult {
    float distance;
    int segmentId;
    int patchLeft;
    int patchRight;
    float terrainLeft;
    float terrainRight;
  };
  
  // Compute SDF for current pixel using hex's nearby segments
  SDFResult computeSegmentSDF(vec2 worldPos, vec2 hexCoord) {
    SDFResult result;
    result.distance = MAX_DIST;
    result.segmentId = -1;
    result.patchLeft = -1;
    result.patchRight = -1;
    result.terrainLeft = -1.0;
    result.terrainRight = -1.0;
    
    // Get hex position in texture
    ivec2 hexTexCoord = ivec2(hexCoord + vec2(64.0));  // Offset for negative coords
    
    // Read segment IDs for this hex (2 pixels = 8 segments max)
    vec4 segs0 = texelFetch(uHexSegments, ivec2(hexTexCoord.x * 2, hexTexCoord.y), 0);
    vec4 segs1 = texelFetch(uHexSegments, ivec2(hexTexCoord.x * 2 + 1, hexTexCoord.y), 0);
    
    float segIds[8];
    segIds[0] = segs0.x; segIds[1] = segs0.y; segIds[2] = segs0.z; segIds[3] = segs0.w;
    segIds[4] = segs1.x; segIds[5] = segs1.y; segIds[6] = segs1.z; segIds[7] = segs1.w;
    
    // Find nearest segment
    for (int i = 0; i < 8; i++) {
      int segId = int(segIds[i] * 255.0) - 1;  // -1 because 0 means "no segment"
      if (segId < 0) continue;
      
      float d = distanceToSegment(segId, worldPos);
      
      if (abs(d) < abs(result.distance)) {
        result.distance = d;
        result.segmentId = segId;
        
        SegmentInfo info = getSegmentInfo(segId);
        result.patchLeft = info.patchLeft;
        result.patchRight = info.patchRight;
        result.terrainLeft = getPatchTerrainId(info.patchLeft);
        result.terrainRight = getPatchTerrainId(info.patchRight);
      }
    }
    
    return result;
  }
  
  // ============ TERRAIN COLOR ============
  
  vec3 getTerrainColorById(float terrainId) {
    if (terrainId < 0.0) return vec3(0.0);
    return texture2D(uTerrainColors, vec2((terrainId + 0.5) / 256.0, 0.25)).rgb;
  }
  
  // ============ MAIN ============
  
  void main() {
    // Get terrain data from texture
    vec2 dataUV = (vHexCoord + uHexRadius + 0.5) / uDataSize;
    vec4 terrainData = texture2D(uTerrainData, dataUV);
    
    float terrainId = terrainData.r * 255.0;
    float layerCount = terrainData.g * 8.0;
    
    // Base color from vertex or terrain color
    vec3 resultColor = layerCount < 0.5 ? vColor : getTerrainColorById(terrainId);
    
    // Compute segment-based SDF
    SDFResult sdf = computeSegmentSDF(vWorldXZ, vHexCoord);
    
    // Apply transition effects if we have a valid segment nearby
    if (sdf.segmentId >= 0 && abs(sdf.distance) < 2.0) {
      // Determine which terrain is "neighbor"
      float neighborTerrain = sdf.distance > 0.0 ? sdf.terrainRight : sdf.terrainLeft;
      
      if (neighborTerrain >= 0.0 && abs(neighborTerrain - terrainId) > 0.5) {
        // Simple gradient blend for now
        float blendWidth = 0.5;
        float blend = 1.0 - smoothstep(-blendWidth, blendWidth, sdf.distance);
        
        vec3 neighborColor = getTerrainColorById(neighborTerrain);
        resultColor = mix(resultColor, neighborColor, blend);
      }
    }
    
    // Debug visualization
    if (uDebugSDFMode == 1 && sdf.segmentId >= 0) {
      // Show distance as color
      float d = clamp(abs(sdf.distance) / 2.0, 0.0, 1.0);
      resultColor = mix(vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), d);
    }
    
    // Lighting
    vec3 finalColor;
    if (uFlatLighting > 0.99) {
      finalColor = resultColor;
    } else {
      vec3 normal = normalize(vNormal);
      float diffuse = max(dot(normal, uLightDirection), 0.0);
      vec3 lighting3D = uAmbientLight * 0.4 + uDirectionalLight * diffuse * 0.6;
      finalColor = mix(resultColor * lighting3D, resultColor, uFlatLighting);
    }
    
    gl_FragColor = vec4(finalColor, 1.0);
  }
`

// Default uniforms
export const defaultUniforms = {
  uTime: { value: 0 },
  uDataSize: { value: null },  // Will be set
  uHexRadius: { value: 64 },
  uTerrainData: { value: null },
  uTerrainColors: { value: null },
  uTerrainLayers: { value: null },
  uSegmentMeta: { value: null },
  uSegmentPoints: { value: null },
  uHexSegments: { value: null },
  uPatchTerrains: { value: null },
  uSegmentCount: { value: 0 },
  uMaxSegmentsPerHex: { value: 8 },
  uTransitionRules: { value: null },
  uRuleCount: { value: 0 },
  uRuleDataWidth: { value: 16 },
  uLightDirection: { value: null },
  uAmbientLight: { value: null },
  uDirectionalLight: { value: null },
  uFlatLighting: { value: 1.0 },
  uMaxLayers: { value: 8 },
  uLayerDataWidth: { value: 8 },
  uDebugSDFMode: { value: 0 },
}
