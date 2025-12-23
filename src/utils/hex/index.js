/**
 * Hex Grid utilities - реэкспорт всех функций для работы с гексами
 */

// Основные функции работы с гексами
export {
  HexGrid,
  HEX_ORIENTATIONS,
  HEX_DIRECTIONS,
  hexKey,
  parseHexKey
} from './grid'

// Выделение гексов
export {
  SelectionManager,
  SELECTION_SHAPES,
  SELECTION_MODES,
  SELECTION_BEHAVIORS
} from './selection'

// Заполнение областей
export {
  applyFillProfile,
  generateFillPreview,
  getFillStats
} from './fill'

// Поиск пути и досягаемость
export {
  PASSABILITY,
  MOVEMENT_ABILITIES,
  MOVEMENT_PENALTIES,
  canPass,
  getMovementCost,
  getHexNeighbors,
  hexDistance,
  findPath,
  getReachableHexes,
  reachableMapToArray,
  getHexLine
} from './pathfinding'

// Система проходимости
export {
  PASSABILITY_TAGS,
  MAX_DAMAGE_CATEGORY,
  DEFAULT_RULE,
  ruleMatchesCharacter,
  findBestRule,
  calculatePassability,
  createTokenPassabilityRules,
  terrainToPassabilityRules,
  buildHexPassability
} from './passability'

// Сегментация пути
export {
  PATH_SEGMENT_TYPES,
  SEGMENT_COLORS,
  segmentPath
} from './pathSegments'

// Анимация движения
export {
  getHexDirection,
  direction6to12,
  SmoothTokenAnimation,
  TokenAnimationManager,
  tokenAnimationManager,
  animateTokenMovement,
  animateTokenFromRemote
} from './animation'
