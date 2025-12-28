/**
 * Rendering utilities - реэкспорт функций для отрисовки
 */

export {
  getPortraitUrl,
  loadImage,
  preloadTokenImages,
  drawPortrait,
  drawScratches,
  drawDefence,
  drawFacingIndicator,
  drawToken,
  drawTokens,
  drawTokenOverlay,
  drawTokenHoverUI,
  isPointInToken,
  findTokenAtPoint,
  canvasToWorld,
  worldToCanvas
} from './tokenRenderer'

export {
  HexTransitionRenderer,
  hexTransitionRenderer,
  getHexVertices as getHexVerticesOld,
  getHexEdge,
  groupAdjacentEdges,
  buildEdgePath,
  applyWaveDeformation,
  applyJaggedDeformation
} from './hexTransitions'

export {
  HexMaskRenderer,
  hexMaskRenderer,
  getHexVertices as getHexVerticesMask,
  getHexPath as getHexPathMask,
  buildHexMask,
  buildDeformedEdge,
  getElevationPriority as getElevationPriorityMask,
  createEdgeAlphaGradient
} from './hexMaskRenderer'

export {
  HexClusterRenderer,
  hexClusterRenderer,
  getHexVertices,
  getHexPath,
  getNeighborOffsets,
  getElevationPriority
} from './hexClusterRenderer'
