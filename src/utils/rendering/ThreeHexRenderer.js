/**
 * ThreeHexRenderer - Three.js рендерер для гекс-карты
 * 
 * Использует ортографическую камеру для 2D-подобного вида,
 * но с возможностью 3D эффектов, освещения и шейдеров.
 */

import * as THREE from 'three'

// Шейдер для генерации шума на GPU
const noiseVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Simplex noise GLSL (от Stefan Gustavson)
const simplexNoiseGLSL = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
  
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v -   i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                           + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy),
                            dot(x12.zw,x12.zw)), 0.0);
    m = m*m;
    m = m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
  
  // FBM (Fractal Brownian Motion)
  float fbm(vec2 p, int octaves, float persistence, float lacunarity) {
    float value = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;
    float maxValue = 0.0;
    
    for (int i = 0; i < 8; i++) {
      if (i >= octaves) break;
      value += amplitude * snoise(p * frequency);
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    
    return value / maxValue;
  }
`

const noiseFragmentShader = `
  ${simplexNoiseGLSL}
  
  uniform vec3 baseColor;
  uniform float noiseScale;
  uniform int noiseOctaves;
  uniform float noisePersistence;
  uniform float noiseLacunarity;
  uniform float noiseContrast;
  uniform float time;
  uniform vec2 worldOffset;
  
  varying vec2 vUv;
  
  void main() {
    vec2 worldPos = vUv * 256.0 + worldOffset;
    
    float n = fbm(worldPos * noiseScale, noiseOctaves, noisePersistence, noiseLacunarity);
    n = (n + 1.0) * 0.5; // Normalize to 0-1
    
    // Apply contrast
    n = pow(n, noiseContrast);
    
    // Animated shimmer (optional)
    // n += sin(time + worldPos.x * 0.1) * 0.05;
    
    vec3 color = baseColor * n;
    gl_FragColor = vec4(color, 1.0);
  }
`

/**
 * Создать геометрию гекса
 */
function createHexGeometry(radius) {
  const shape = new THREE.Shape()
  
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6
    const x = radius * Math.cos(angle)
    const y = radius * Math.sin(angle)
    
    if (i === 0) {
      shape.moveTo(x, y)
    } else {
      shape.lineTo(x, y)
    }
  }
  shape.closePath()
  
  return new THREE.ShapeGeometry(shape)
}

/**
 * Основной класс Three.js рендерера
 */
export class ThreeHexRenderer {
  constructor(container, options = {}) {
    this.container = container
    this.options = {
      antialias: true,
      alpha: false,
      ...options
    }
    
    this.hexSize = options.hexSize || 30
    this.hexMeshes = new Map()
    this.materials = new Map()
    
    this._initScene()
    this._initCamera()
    this._initRenderer()
    this._initLighting()
    
    // Animation
    this.clock = new THREE.Clock()
    this.animationId = null
    
    // Resize observer
    this._setupResizeObserver()
  }
  
  _initScene() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a1a2e)
  }
  
  _initCamera() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    
    // Ортографическая камера = 2D вид
    this.camera = new THREE.OrthographicCamera(
      -width / 2, width / 2,
      height / 2, -height / 2,
      0.1, 1000
    )
    this.camera.position.set(0, 100, 0)
    this.camera.lookAt(0, 0, 0)
    this.camera.up.set(0, 0, -1) // Чтобы Y был вверх на экране
  }
  
  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.options.antialias,
      alpha: this.options.alpha
    })
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    
    // Очищаем контейнер и добавляем canvas
    this.container.innerHTML = ''
    this.container.appendChild(this.renderer.domElement)
  }
  
  _initLighting() {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.6)
    this.scene.add(ambient)
    
    // Directional light (солнце)
    this.sunLight = new THREE.DirectionalLight(0xffffff, 0.8)
    this.sunLight.position.set(50, 100, 50)
    this.scene.add(this.sunLight)
  }
  
  _setupResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.resize()
    })
    this.resizeObserver.observe(this.container)
  }
  
  resize() {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    
    this.camera.left = -width / 2
    this.camera.right = width / 2
    this.camera.top = height / 2
    this.camera.bottom = -height / 2
    this.camera.updateProjectionMatrix()
    
    this.renderer.setSize(width, height)
  }
  
  /**
   * Создать материал для террейна с шумом на GPU
   */
  createNoiseMaterial(terrain) {
    const layers = terrain.layers || []
    const baseLayer = layers.find(l => l.enabled !== false) || {}
    
    const color = new THREE.Color(baseLayer.color || terrain.color || '#888888')
    
    return new THREE.ShaderMaterial({
      vertexShader: noiseVertexShader,
      fragmentShader: noiseFragmentShader,
      uniforms: {
        baseColor: { value: color },
        noiseScale: { value: baseLayer.noiseScale || 0.01 },
        noiseOctaves: { value: baseLayer.noiseOctaves || 4 },
        noisePersistence: { value: baseLayer.noisePersistence || 0.5 },
        noiseLacunarity: { value: baseLayer.noiseLacunarity || 2.0 },
        noiseContrast: { value: baseLayer.noiseContrast || 1.0 },
        time: { value: 0 },
        worldOffset: { value: new THREE.Vector2(0, 0) }
      }
    })
  }
  
  /**
   * Создать простой цветной материал
   */
  createColorMaterial(color) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.8,
      metalness: 0.1
    })
  }
  
  /**
   * Получить или создать материал для террейна
   */
  getMaterial(terrain) {
    const key = terrain.id || terrain.color || 'default'
    
    if (this.materials.has(key)) {
      return this.materials.get(key)
    }
    
    let material
    
    if (terrain.layers && terrain.layers.some(l => l.enabled !== false && l.type === 'noise')) {
      material = this.createNoiseMaterial(terrain)
    } else {
      const color = terrain.color || terrain.fallbackColor || '#888888'
      material = this.createColorMaterial(color)
    }
    
    this.materials.set(key, material)
    return material
  }
  
  /**
   * Отрисовать гексы
   */
  renderHexes(hexes, hexGrid) {
    this.hexSize = hexGrid?.hexSize || this.hexSize
    
    // Базовая геометрия гекса (переиспользуется)
    const hexGeometry = createHexGeometry(this.hexSize)
    
    // Группа для гексов
    if (this.hexGroup) {
      this.scene.remove(this.hexGroup)
    }
    this.hexGroup = new THREE.Group()
    
    // Добавляем гексы
    const processHex = (hex, key) => {
      const terrain = hex.terrain || {}
      const center = hexGrid.hexToPixel(hex.q, hex.r)
      
      const material = this.getMaterial(terrain)
      const mesh = new THREE.Mesh(hexGeometry, material)
      
      // Позиция (X и Z в Three.js, Y = высота)
      mesh.position.set(center.x, 0, center.y)
      mesh.rotation.x = -Math.PI / 2 // Плоскость XZ
      
      // Elevation
      const elevation = terrain.categoryTags?.elevation || 'flat'
      const heights = {
        'submerged': -5,
        'low': -2,
        'flat': 0,
        'elevated': 3,
        'high': 6,
        'cliff': 10
      }
      mesh.position.y = heights[elevation] || 0
      
      // Данные для интерактивности
      mesh.userData = { hex, terrain, q: hex.q, r: hex.r }
      
      this.hexGroup.add(mesh)
    }
    
    if (hexes instanceof Map) {
      hexes.forEach((hex, key) => processHex(hex, key))
    } else if (Array.isArray(hexes)) {
      hexes.forEach((hex, i) => processHex(hex, `${hex.q},${hex.r}`))
    }
    
    this.scene.add(this.hexGroup)
  }
  
  /**
   * Установить позицию камеры (pan)
   */
  setCamera(x, y, zoom = 1) {
    // Для ортографической камеры zoom = scale
    const width = this.container.clientWidth / zoom
    const height = this.container.clientHeight / zoom
    
    this.camera.left = -width / 2
    this.camera.right = width / 2
    this.camera.top = height / 2
    this.camera.bottom = -height / 2
    
    // Pan: сдвигаем камеру
    this.camera.position.x = x
    this.camera.position.z = y
    
    this.camera.updateProjectionMatrix()
  }
  
  /**
   * Анимационный цикл
   */
  animate() {
    this.animationId = requestAnimationFrame(() => this.animate())
    
    const elapsed = this.clock.getElapsedTime()
    
    // Обновляем uniforms для анимированных материалов
    this.materials.forEach(material => {
      if (material.uniforms && material.uniforms.time) {
        material.uniforms.time.value = elapsed
      }
    })
    
    this.renderer.render(this.scene, this.camera)
  }
  
  /**
   * Начать анимацию
   */
  start() {
    if (!this.animationId) {
      this.clock.start()
      this.animate()
    }
  }
  
  /**
   * Остановить анимацию
   */
  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }
  
  /**
   * Рендер одного кадра (без анимации)
   */
  render() {
    this.renderer.render(this.scene, this.camera)
  }
  
  /**
   * Очистка ресурсов
   */
  dispose() {
    this.stop()
    
    this.resizeObserver?.disconnect()
    
    // Dispose geometries and materials
    this.scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose())
        } else {
          obj.material.dispose()
        }
      }
    })
    
    this.materials.clear()
    this.renderer.dispose()
    
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement)
    }
  }
  
  /**
   * Raycast для определения гекса под курсором
   */
  getHexAtPoint(screenX, screenY) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    const x = ((screenX - rect.left) / rect.width) * 2 - 1
    const y = -((screenY - rect.top) / rect.height) * 2 + 1
    
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera)
    
    const intersects = raycaster.intersectObjects(this.hexGroup?.children || [])
    
    if (intersects.length > 0) {
      return intersects[0].object.userData
    }
    
    return null
  }
}

export default ThreeHexRenderer
