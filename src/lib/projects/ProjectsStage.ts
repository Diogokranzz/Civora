import * as THREE from 'three'

const FOV = 32
const RADIUS = 5.6
const PANEL_WIDTH = 3.6
const PANEL_HEIGHT = 2.25
/** Telas no anel: os projetos se repetem até fechar a volta, como uma vitrine contínua. */
const MIN_PANELS = 9
/** Na tela deitada o anel vai um pouco para a esquerda, abrindo espaço para o texto à direita. */
const WIDE_OFFSET = -2.3
/** Rapidez com que o anel alcança o alvo (por segundo): solto e arrastando. */
const DAMP = 5
const DAMP_DRAG = 16
const DUST_COUNT = 160
/** Arraste, em pixels, a partir do qual o clique deixa de contar como clique. */
const DRAG_LIMIT = 6
/** Giro, em radianos, por pixel arrastado. */
const DRAG_SPEED = 0.005
/** Quanto o embalo do arraste empurra o anel depois de soltar (segundos de velocidade). */
const THROW = 0.18

interface ProjectsStageOptions {
  covers: string[]
  reducedMotion: boolean
  onActive: (index: number) => void
  onOpen: (index: number) => void
  onLoaded: () => void
}

interface Panel {
  holder: THREE.Group
  mesh: THREE.Mesh
  material: THREE.ShaderMaterial
  /** Projeto mostrado nesta tela. */
  project: number
  hover: number
}

const panelVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/* A imagem se separa em vermelho, verde e azul conforme o carrossel ganha velocidade. */
const panelFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uShift, uLight;
  varying vec2 vUv;
  void main() {
    // O verso (as telas do fundo, vistas por dentro do anel) mostra a imagem desespelhada e apagada.
    vec2 uv = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
    vec2 shift = vec2(uShift, 0.0);
    vec3 color = vec3(
      texture2D(uMap, uv + shift).r,
      texture2D(uMap, uv).g,
      texture2D(uMap, uv - shift).b
    );
    // Cantos levemente escurecidos, como uma tela de verdade.
    vec2 edge = abs(uv - 0.5) * 2.0;
    float shade = 1.0 - smoothstep(0.8, 1.0, max(edge.x, edge.y)) * 0.3;
    float light = gl_FrontFacing ? uLight : 0.22;
    gl_FragColor = vec4(color * shade * light, 1.0);
  }
`

/** Trecho de cilindro: a tela curva que acompanha o anel. */
function arcGeometry(radius: number, width: number, height: number) {
  const length = width / radius
  return new THREE.CylinderGeometry(radius, radius, height, 48, 1, true, -length / 2, length)
}

/** Amortecimento pelo tempo real, igual em qualquer taxa de quadros. */
function damp(rate: number, delta: number) {
  return 1 - Math.exp(-rate * delta)
}

/**
 * Carrossel dos projetos (classe, sem React): telas curvas formando um anel inteiro, entre partículas.
 * Arrastar (com embalo), rolar ou usar as setas gira o anel; ao soltar, ele encaixa na tela mais próxima.
 * Só desenha enquanto está visível.
 */
export class ProjectsStage {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 80)
  private ring = new THREE.Group()
  private panels: Panel[] = []
  private dust: THREE.Points
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private resizeObserver: ResizeObserver
  private visibilityObserver: IntersectionObserver
  private container: HTMLElement
  private options: ProjectsStageOptions
  private projects: number
  private total: number
  private step: number
  private frame = 0
  private last = 0
  private visible = false
  private disposed = false
  private angle = 0
  private target = 0
  private active = 0
  private shift = 0
  private hovered: number | null = null
  private dragging = false
  private dragStartX = 0
  private dragStartTarget = 0
  private dragDistance = 0
  private dragVelocity = 0
  private lastMoveX = 0
  private lastMoveTime = 0
  private wheelLock = 0

  constructor(container: HTMLElement, options: ProjectsStageOptions) {
    this.container = container
    this.options = options
    this.projects = options.covers.length
    this.total = this.projects * Math.max(1, Math.ceil(MIN_PANELS / this.projects))
    this.step = (Math.PI * 2) / this.total
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setClearColor(0x000000)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.addEventListener('webglcontextlost', () => {
      this.renderer.domElement.style.visibility = 'hidden'
    })
    container.appendChild(this.renderer.domElement)
    this.scene.fog = new THREE.Fog(0x000000, 14, 30)
    this.scene.add(this.ring)

    this.dust = createDust()
    this.scene.add(this.dust)

    container.addEventListener('pointerdown', this.handleDown)
    window.addEventListener('pointermove', this.handleMove, { passive: true })
    window.addEventListener('pointerup', this.handleUp)
    window.addEventListener('pointercancel', this.handleCancel)
    container.addEventListener('wheel', this.handleWheel, { passive: false })
    container.addEventListener('pointermove', this.handleHover)
    container.addEventListener('pointerleave', this.handleLeave)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting
      if (this.visible) this.play()
      else cancelAnimationFrame(this.frame)
    })
    this.visibilityObserver.observe(container)

    this.resize()
    this.load()
  }

  /** Gira até o projeto pelo caminho mais curto, escolhendo a cópia mais próxima dele no anel. */
  goTo(index: number) {
    if (index === this.active) return
    const slot = Math.round(-this.target / this.step)
    const current = ((slot % this.projects) + this.projects) % this.projects
    let delta = (((index - current) % this.projects) + this.projects) % this.projects
    if (delta > this.projects / 2) delta -= this.projects
    this.setTarget(-(slot + delta) * this.step)
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    window.clearTimeout(this.wheelLock)
    this.resizeObserver.disconnect()
    this.visibilityObserver.disconnect()
    this.container.removeEventListener('pointerdown', this.handleDown)
    window.removeEventListener('pointermove', this.handleMove)
    window.removeEventListener('pointerup', this.handleUp)
    window.removeEventListener('pointercancel', this.handleCancel)
    this.container.removeEventListener('wheel', this.handleWheel)
    this.container.removeEventListener('pointermove', this.handleHover)
    this.container.removeEventListener('pointerleave', this.handleLeave)
    const textures = new Set<THREE.Texture>()
    for (const panel of this.panels) textures.add(panel.material.uniforms.uMap.value as THREE.Texture)
    textures.forEach((texture) => texture.dispose())
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return
      object.geometry.dispose()
      ;(object.material as THREE.Material).dispose()
    })
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private async load() {
    const textureLoader = new THREE.TextureLoader()
    const textures = await Promise.all(this.options.covers.map((url) => textureLoader.loadAsync(url)))
    if (this.disposed) return

    const geometry = arcGeometry(RADIUS, PANEL_WIDTH, PANEL_HEIGHT)
    for (const texture of textures) {
      // Sem conversão de cor: o shader devolve a imagem como ela é.
      texture.colorSpace = THREE.NoColorSpace
      texture.anisotropy = 8
    }
    for (let slot = 0; slot < this.total; slot++) {
      const project = slot % this.projects
      const material = new THREE.ShaderMaterial({
        vertexShader: panelVertex,
        fragmentShader: panelFragment,
        side: THREE.DoubleSide,
        uniforms: { uMap: { value: textures[project] }, uShift: { value: 0 }, uLight: { value: 1 } },
      })
      const holder = new THREE.Group()
      holder.rotation.y = slot * this.step
      const mesh = new THREE.Mesh(geometry, material)
      mesh.userData.slot = slot
      holder.add(mesh)
      this.ring.add(holder)
      this.panels.push({ holder, mesh, material, project, hover: 0 })
    }

    this.update(0)
    this.render()
    this.options.onLoaded()
  }

  /** Tela que está na frente agora (no alvo). */
  private frontSlot() {
    return ((Math.round(-this.target / this.step) % this.total) + this.total) % this.total
  }

  private setTarget(target: number) {
    this.target = target
    const index = this.frontSlot() % this.projects
    if (index !== this.active) {
      this.active = index
      this.options.onActive(index)
    }
    if (this.options.reducedMotion) {
      this.angle = target
      this.update(0)
      this.render()
    }
  }

  /** Tela sob o ponteiro, só entre as viradas para a câmera. */
  private slotAt(event: PointerEvent) {
    const rect = this.container.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster
      .intersectObjects(this.panels.map((panel) => panel.mesh))
      .find((item) => item.face && item.face.normal.clone().transformDirection(item.object.matrixWorld).z > 0)
    return hit ? (hit.object.userData.slot as number) : null
  }

  private handleDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    this.dragging = true
    this.dragStartX = event.clientX
    this.dragStartTarget = this.target
    this.dragDistance = 0
    this.dragVelocity = 0
    this.lastMoveX = event.clientX
    this.lastMoveTime = performance.now()
  }

  private handleMove = (event: PointerEvent) => {
    if (!this.dragging) return
    const moved = event.clientX - this.dragStartX
    this.dragDistance = Math.max(this.dragDistance, Math.abs(moved))
    const now = performance.now()
    const elapsed = Math.max(now - this.lastMoveTime, 1) / 1000
    // Velocidade suavizada, para o embalo não depender de um único evento.
    const velocity = ((event.clientX - this.lastMoveX) * DRAG_SPEED) / elapsed
    this.dragVelocity += (velocity - this.dragVelocity) * 0.35
    this.lastMoveX = event.clientX
    this.lastMoveTime = now
    this.target = this.dragStartTarget + moved * DRAG_SPEED
    if (this.dragDistance >= DRAG_LIMIT) this.container.style.cursor = 'grabbing'
  }

  private handleUp = (event: PointerEvent) => {
    if (!this.dragging) return
    this.dragging = false
    if (this.dragDistance < DRAG_LIMIT) {
      // Clique: a tela da frente abre o projeto; as outras vêm para a frente.
      const slot = this.slotAt(event)
      if (slot === null) return
      if (slot === this.frontSlot()) this.options.onOpen(this.panels[slot].project)
      else {
        let delta = (((slot - this.frontSlot()) % this.total) + this.total) % this.total
        if (delta > this.total / 2) delta -= this.total
        this.setTarget(this.target - delta * this.step)
      }
      return
    }
    // Parado há um tempo antes de soltar: sem embalo.
    const idle = performance.now() - this.lastMoveTime > 90
    const thrown = this.target + (idle ? 0 : this.dragVelocity * THROW)
    this.setTarget(Math.round(thrown / this.step) * this.step)
    this.container.style.cursor = 'grab'
  }

  private handleCancel = () => {
    if (!this.dragging) return
    this.dragging = false
    this.setTarget(Math.round(this.target / this.step) * this.step)
  }

  private handleWheel = (event: WheelEvent) => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (Math.abs(delta) < 4) return
    event.preventDefault()
    if (this.wheelLock) return
    this.setTarget(this.target - Math.sign(delta) * this.step)
    // Um giro por vez, mesmo com a inércia do trackpad.
    this.wheelLock = window.setTimeout(() => (this.wheelLock = 0), 650)
  }

  private handleHover = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || this.dragging) return
    this.hovered = this.slotAt(event)
    this.container.style.cursor = this.hovered !== null ? 'pointer' : 'grab'
  }

  private handleLeave = () => {
    this.hovered = null
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.container
    if (!width || !height) return
    this.renderer.setSize(width, height)
    const aspect = width / height
    const tangent = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
    const narrow = aspect < 1.1
    // Deitada: o anel inteiro cabe na parte esquerda da tela. Em pé: a tela da frente ocupa quase toda a largura.
    const distance = narrow
      ? PANEL_WIDTH / (0.82 * 2 * tangent * aspect) + RADIUS
      : Math.max(RADIUS + 8, (RADIUS * 2 + 1) / (2 * tangent * aspect * 0.74) + RADIUS * 0.5)
    this.ring.position.x = narrow ? 0 : WIDE_OFFSET
    this.ring.position.y = narrow ? 0.5 : 0
    this.camera.aspect = aspect
    // A câmera fica acima: as telas do fundo aparecem inteiras por cima das da frente.
    this.camera.position.set(this.ring.position.x * 0.35, distance * (narrow ? 0.12 : 0.26), distance)
    this.camera.lookAt(this.ring.position.x * 0.35, narrow ? -0.2 : -0.1, 0)
    this.camera.updateProjectionMatrix()
    this.render()
  }

  private play() {
    cancelAnimationFrame(this.frame)
    if (this.options.reducedMotion) {
      this.update(0)
      this.render()
      return
    }
    this.last = performance.now()
    const tick = (now: number) => {
      if (!this.visible || this.disposed) return
      const delta = Math.min((now - this.last) / 1000, 0.05)
      this.last = now
      this.update(delta, now / 1000)
      this.render()
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  private update(delta: number, time = 0) {
    const before = this.angle
    if (delta === 0) this.angle = this.target
    else this.angle += (this.target - this.angle) * damp(this.dragging ? DAMP_DRAG : DAMP, delta)
    const speed = delta ? (this.angle - before) / delta : 0
    this.shift += (THREE.MathUtils.clamp(speed * 0.004, -0.012, 0.012) - this.shift) * damp(10, delta || 1)

    this.ring.rotation.y = this.angle
    if (!this.options.reducedMotion) this.dust.rotation.y = time * 0.012

    const front = this.frontSlot()
    for (const [slot, panel] of this.panels.entries()) {
      // Só as telas viradas para a câmera ficam acesas; a da frente, inteira.
      const facing = Math.cos(this.angle + slot * this.step)
      const light = THREE.MathUtils.lerp(0.18, 1, THREE.MathUtils.smoothstep(facing, 0.2, 0.98))
      // A tela da frente cresce um pouco com o mouse em cima, avisando que abre o site.
      const hover = this.hovered === slot && slot === front && !this.dragging ? 1 : 0
      panel.hover += (hover - panel.hover) * damp(8, delta || 1)
      panel.holder.scale.setScalar(1 + panel.hover * 0.04)
      panel.material.uniforms.uShift.value = this.shift
      panel.material.uniforms.uLight.value = light * (1 + panel.hover * 0.12)
    }
  }

  private render() {
    this.renderer.render(this.scene, this.camera)
  }
}

/** Poeira flutuando em volta do anel. */
function createDust() {
  const positions = new Float32Array(DUST_COUNT * 3)
  for (let i = 0; i < DUST_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = 3 + Math.random() * 9
    positions[i * 3] = Math.cos(angle) * radius
    positions[i * 3 + 1] = (Math.random() - 0.5) * 9
    positions[i * 3 + 2] = Math.sin(angle) * radius
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.03, transparent: true, opacity: 0.5, depthWrite: false }),
  )
}
