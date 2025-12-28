/**
 * Perlin & Simplex Noise генераторы
 * Используются для процедурной генерации текстур террейнов
 */

/**
 * Классический Perlin Noise
 * Быстрая реализация на основе улучшенного алгоритма Кена Перлина
 */
export class PerlinNoise {
  constructor(seed = Math.random() * 10000) {
    this.seed = seed
    this.permutation = this.generatePermutation(seed)
    this.p = new Uint8Array(512)
    for (let i = 0; i < 256; i++) {
      this.p[i] = this.permutation[i]
      this.p[i + 256] = this.permutation[i]
    }
  }

  generatePermutation(seed) {
    const perm = new Uint8Array(256)
    for (let i = 0; i < 256; i++) perm[i] = i
    
    // Fisher-Yates shuffle с seed
    let s = seed
    for (let i = 255; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      const j = s % (i + 1)
      ;[perm[i], perm[j]] = [perm[j], perm[i]]
    }
    return perm
  }

  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }

  lerp(a, b, t) {
    return a + t * (b - a)
  }

  grad(hash, x, y) {
    const h = hash & 3
    const u = h < 2 ? x : y
    const v = h < 2 ? y : x
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
  }

  /**
   * Получить значение шума в точке (x, y)
   * @param {number} x - координата X
   * @param {number} y - координата Y
   * @returns {number} значение от -1 до 1
   */
  noise2D(x, y) {
    const X = Math.floor(x) & 255
    const Y = Math.floor(y) & 255
    
    x -= Math.floor(x)
    y -= Math.floor(y)
    
    const u = this.fade(x)
    const v = this.fade(y)
    
    const A = this.p[X] + Y
    const B = this.p[X + 1] + Y
    
    return this.lerp(
      this.lerp(this.grad(this.p[A], x, y), this.grad(this.p[B], x - 1, y), u),
      this.lerp(this.grad(this.p[A + 1], x, y - 1), this.grad(this.p[B + 1], x - 1, y - 1), u),
      v
    )
  }

  /**
   * Многооктавный шум (fractal Brownian motion)
   * @param {number} x - координата X
   * @param {number} y - координата Y
   * @param {number} octaves - количество октав (детализация)
   * @param {number} persistence - затухание амплитуды (0.5 по умолчанию)
   * @param {number} lacunarity - рост частоты (2.0 по умолчанию)
   * @returns {number} значение от -1 до 1
   */
  fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let total = 0
    let amplitude = 1
    let frequency = 1
    let maxValue = 0
    
    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude
      maxValue += amplitude
      amplitude *= persistence
      frequency *= lacunarity
    }
    
    return total / maxValue
  }
}

/**
 * Simplex Noise - более равномерный и быстрый
 */
export class SimplexNoise {
  constructor(seed = Math.random() * 10000) {
    this.seed = seed
    
    // Градиенты для 2D
    this.grad2 = [
      [1, 1], [-1, 1], [1, -1], [-1, -1],
      [1, 0], [-1, 0], [0, 1], [0, -1]
    ]
    
    // Константы
    this.F2 = 0.5 * (Math.sqrt(3) - 1)
    this.G2 = (3 - Math.sqrt(3)) / 6
    
    // Генерируем permutation table
    this.perm = new Uint8Array(512)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    
    let s = seed
    for (let i = 255; i > 0; i--) {
      s = (s * 1103515245 + 12345) & 0x7fffffff
      const j = s % (i + 1)
      ;[p[i], p[j]] = [p[j], p[i]]
    }
    
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]
    }
  }

  dot2(g, x, y) {
    return g[0] * x + g[1] * y
  }

  /**
   * Simplex noise 2D
   * @param {number} x 
   * @param {number} y 
   * @returns {number} значение от -1 до 1
   */
  noise2D(x, y) {
    const s = (x + y) * this.F2
    const i = Math.floor(x + s)
    const j = Math.floor(y + s)
    
    const t = (i + j) * this.G2
    const X0 = i - t
    const Y0 = j - t
    const x0 = x - X0
    const y0 = y - Y0
    
    let i1, j1
    if (x0 > y0) {
      i1 = 1
      j1 = 0
    } else {
      i1 = 0
      j1 = 1
    }
    
    const x1 = x0 - i1 + this.G2
    const y1 = y0 - j1 + this.G2
    const x2 = x0 - 1.0 + 2.0 * this.G2
    const y2 = y0 - 1.0 + 2.0 * this.G2
    
    const ii = i & 255
    const jj = j & 255
    
    let n0, n1, n2
    
    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 < 0) {
      n0 = 0
    } else {
      t0 *= t0
      const gi0 = this.perm[ii + this.perm[jj]] % 8
      n0 = t0 * t0 * this.dot2(this.grad2[gi0], x0, y0)
    }
    
    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 < 0) {
      n1 = 0
    } else {
      t1 *= t1
      const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 8
      n1 = t1 * t1 * this.dot2(this.grad2[gi1], x1, y1)
    }
    
    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 < 0) {
      n2 = 0
    } else {
      t2 *= t2
      const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 8
      n2 = t2 * t2 * this.dot2(this.grad2[gi2], x2, y2)
    }
    
    return 70 * (n0 + n1 + n2)
  }

  /**
   * Многооктавный simplex noise
   */
  fbm(x, y, octaves = 4, persistence = 0.5, lacunarity = 2.0) {
    let total = 0
    let amplitude = 1
    let frequency = 1
    let maxValue = 0
    
    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude
      maxValue += amplitude
      amplitude *= persistence
      frequency *= lacunarity
    }
    
    return total / maxValue
  }
}

/**
 * Voronoi / Cellular Noise - для камней, плитки, кирпичей
 */
export class VoronoiNoise {
  constructor(seed = Math.random() * 10000) {
    this.seed = seed
  }

  hash(x, y) {
    let n = x * 374761393 + y * 668265263 + this.seed
    n = (n ^ (n >> 13)) * 1274126177
    return n ^ (n >> 16)
  }

  /**
   * Voronoi noise - расстояние до ближайшей ячейки
   * @param {number} x 
   * @param {number} y 
   * @param {number} scale - масштаб ячеек
   * @returns {number} значение от 0 до 1
   */
  noise2D(x, y, scale = 1) {
    x *= scale
    y *= scale
    
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    
    let minDist = 1.0
    
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cellX = ix + i
        const cellY = iy + j
        
        // Случайная точка внутри ячейки
        const h = this.hash(cellX, cellY)
        const px = i + ((h & 0xffff) / 0xffff) - fx
        const py = j + (((h >> 16) & 0xffff) / 0xffff) - fy
        
        const dist = Math.sqrt(px * px + py * py)
        minDist = Math.min(minDist, dist)
      }
    }
    
    return minDist
  }
}

/**
 * Утилиты для работы с шумом
 */
export const NoiseUtils = {
  /**
   * Нормализовать значение из [-1, 1] в [0, 1]
   */
  normalize(value) {
    return (value + 1) / 2
  },

  /**
   * Применить контраст
   */
  contrast(value, amount = 1.5) {
    return Math.max(0, Math.min(1, (value - 0.5) * amount + 0.5))
  },

  /**
   * Threshold - превращает в бинарное значение
   */
  threshold(value, threshold = 0.5) {
    return value > threshold ? 1 : 0
  },

  /**
   * Инвертировать
   */
  invert(value) {
    return 1 - value
  },

  /**
   * Смешать два значения
   */
  mix(a, b, t) {
    return a * (1 - t) + b * t
  },

  /**
   * Получить цвет из шума (grayscale)
   */
  toGrayscale(value) {
    const v = Math.floor(NoiseUtils.normalize(value) * 255)
    return `rgb(${v}, ${v}, ${v})`
  }
}

/**
 * Готовые пресеты шумов для разных типов террейнов
 */
export const NoisePresets = {
  // Трава - мягкий мелкий шум
  grass: {
    type: 'perlin',
    scale: 0.08,
    octaves: 3,
    persistence: 0.4,
    lacunarity: 2.5
  },
  
  // Камень - крупнозернистый с высоким контрастом
  stone: {
    type: 'perlin',
    scale: 0.15,
    octaves: 4,
    persistence: 0.6,
    lacunarity: 2.0
  },
  
  // Песок - очень мелкий шум
  sand: {
    type: 'simplex',
    scale: 0.05,
    octaves: 2,
    persistence: 0.3,
    lacunarity: 3.0
  },
  
  // Вода - волнистый
  water: {
    type: 'simplex',
    scale: 0.1,
    octaves: 2,
    persistence: 0.5,
    lacunarity: 2.0
  },
  
  // Грязь/земля
  dirt: {
    type: 'perlin',
    scale: 0.12,
    octaves: 3,
    persistence: 0.5,
    lacunarity: 2.2
  },
  
  // Кирпичи/плитка (через voronoi)
  tiles: {
    type: 'voronoi',
    scale: 5
  },
  
  // Дерево - линейные полосы
  wood: {
    type: 'perlin',
    scale: 0.02,
    octaves: 2,
    persistence: 0.3,
    lacunarity: 4.0,
    stretchX: 0.1,  // Растянуть по X для досок
    stretchY: 1
  }
}

/**
 * Фабрика для создания noise генераторов
 */
export function createNoise(type, seed) {
  switch (type) {
    case 'simplex':
      return new SimplexNoise(seed)
    case 'voronoi':
      return new VoronoiNoise(seed)
    case 'perlin':
    default:
      return new PerlinNoise(seed)
  }
}
