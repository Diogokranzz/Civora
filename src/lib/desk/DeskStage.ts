import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GITHUB_PROFILE, GITHUB_REPOS } from '../../data/github'
import type { DeskObject } from '../../data/navigation'
import {
  createCodeTexture,
  createMousepadTexture,
  createPhoneTexture,
  createScreenTexture,
  createGithubTexture,
  fontsReady,
  loadImage,
} from './deskTextures'
import type { ScreenSlide } from './deskTextures'

/** Altura mínima da cena (tangente do ângulo vertical): em tela larga e baixa o monitor não sai por cima. */
const MIN_TANGENT = 0.5
/** Largura da mesa que precisa caber na tela, como tangente do ângulo horizontal. */
const FIT_TANGENT = 0.72
/** Em tela em pé a mesa pode perder as pontas: os objetos ficam maiores e mais fáceis de tocar. */
const NARROW_FIT_TANGENT = 0.46
/** Onde a câmera descansa e para onde olha. */
const CAMERA_REST = new THREE.Vector3(0, 7.4, 12.2)
const CAMERA_LOOK = new THREE.Vector3(0, 2.9, -0.6)
/** Quanto a câmera acompanha o mouse (unidades da cena). */
const PARALLAX = { x: 0.6, y: 0.3 }
/**
 * Ritmo do movimento (mesma ideia da mesa de anajuliaym.com): com um objeto escolhido a câmera para de
 * seguir o mouse e chega perto dele numa mola amortecida, sem quicar. `SPRING` é a rigidez (rad/s):
 * menor = mais devagar. `APPROACH` é quanto do caminho até o objeto a câmera anda.
 */
const SPRING = 3.6
const APPROACH = 0.3
/** Velocidades de amortecimento (por segundo): destaque do objeto, tampa do notebook e câmera solta. */
const DAMP_OBJECT = 4
const DAMP_LID = 2.4
const DAMP_PARALLAX = 2
/** O destaque some só depois deste tempo sem o mouse em cima: passar entre objetos não pisca. */
const HOVER_LEAVE_MS = 320
/** Mergulho até o objeto escolhido antes de abrir a página. */
const DIVE_SECONDS = 1.3
/**
 * Entrar na tela (monitores e notebook): a câmera vai de frente até a imagem ocupar a tela toda e
 * continua acelerando para dentro dela. `ENTER_SECONDS` é o total; a aproximação usa `ENTER_APPROACH` dele.
 */
const ENTER_SECONDS = 1.7
const ENTER_APPROACH = 0.72
/**
 * Pegar o celular (Contato): ele sobe da mesa, vira de pé para a câmera e vem para o meio da tela;
 * no fim chega bem perto, até a tela dele ocupar a visão. `PICKUP_LIFT` é a parte da subida.
 */
const PICKUP_SECONDS = 1.6
const PICKUP_LIFT = 0.28
const PICKUP_ARRIVE = 0.74
const LED_COLOR = 0xff1e1e
/** Tempo de cada capa no monitor e da passagem entre elas, em segundos. */
const SLIDE_TIME = 3.6
const SLIDE_FADE = 0.7

/**
 * Medidas reais, com 1 unidade = 10 cm: mesa de 1,6 m, monitor de 32" (72 cm de tela),
 * notebook de 16" (35,5 cm de largura) e gabinete de 44 cm de altura.
 */
const DESK_WIDTH = 16
/** Os dois monitores de 27", encostados e virados para dentro como no modelo: 12 unidades no total. */
const MONITOR_PAIR = { width: 12, position: new THREE.Vector3(0, 0, -2) }
/** Nintendo Switch (console de 17 cm, de pé, com o dock e os Joy-Cons), no meio, embaixo dos monitores. */
/** Controle de videogame (16 cm, um pouco maior para ser fácil de achar), na frente, à direita. */
const CONTROLLER = { width: 1.9, position: new THREE.Vector3(5.9, 0, 2), turn: -0.45 }
const SWITCH = { width: 1.73, position: new THREE.Vector3(0, 0, -1.1), turn: 0 }
const LAPTOP = { width: 3.55, position: new THREE.Vector3(-5.3, 0, 2.5), turn: 0.4 }
const PC = { height: 3.8, position: new THREE.Vector3(7.1, 0, -1.2), turn: -0.3 }
const KEYBOARD = { position: new THREE.Vector3(0, 0, 1.5), turn: 0 }
const MOUSE = { position: new THREE.Vector3(2.65, 0, 1.6), turn: -0.1 }

/**
 * No arquivo o notebook está aberto sobre um suporte inclinado. Medidas tiradas do modelo: a base sobe
 * 18° para trás, a tampa começa na dobradiça e precisa girar 115° para fechar sobre o teclado.
 */
const LAPTOP_HINGE = new THREE.Vector2(-3, 1.5)
const LAPTOP_TILT = 0.318
const LID_SPLIT_Y = 1.55
const LID_CLOSED = -2.0

const DESK_URL = '/models/setup/desk.glb'
const MONITOR_URL = '/models/setup/monitor.glb'
const LAPTOP_URL = '/models/setup/laptop.glb'
const PC_URL = '/models/setup/pc.glb'
const SWITCH_URL = '/models/setup/switch.glb'
const CONTROLLER_URL = '/models/setup/controller.glb'

export interface StagePoint {
  x: number
  y: number
}

interface DeskStageOptions {
  reducedMotion: boolean
  /** Objetos que levam a uma página, na ordem do menu. */
  objects: DeskObject[]
  /** Pontos da cena que precisam de uma etiqueta por cima. */
  anchors: [number, number, number][]
  /** Capas e nomes dos projetos, para a tela do monitor. */
  slides: { title: string; tag: string; image: string }[]
  /** Onde cada ponto cai na tela, em pixels; chamado a cada quadro em que a câmera se move. */
  onProject: (points: StagePoint[]) => void
  /** Objeto sob o mouse (índice do menu) ou null. */
  onHover: (index: number | null) => void
  onSelect: (index: number) => void
  onLoaded: () => void
}

interface Interactive {
  object: DeskObject
  group: THREE.Group
  /** Objetos de mesa sobem um pouco; o monitor e o notebook (que abre) só crescem de leve. */
  lift: boolean
  baseY: number
  amount: number
}

/**
 * Mesa do menu (classe, sem React), com o setup do Diogo como referência: mesa preta, monitor grande,
 * notebook fechado que abre quando o mouse chega, gabinete de frente, teclado e mouse com RGB e a fita
 * de LED vermelha atrás da mesa. Os móveis e eletrônicos vêm de modelos do Sketchfab (CC BY 4.0);
 * livros, celular e mousepad são modelados por código. Cada objeto do menu leva a uma página.
 */
export class DeskStage {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(45, 1, 0.1, 80)
  private container: HTMLElement
  private options: DeskStageOptions
  private reducedMotion: boolean
  /** Sem mouse (celular, tablet) não há hover: o notebook já fica aberto. */
  private touchOnly = window.matchMedia('(hover: none)').matches
  private resizeObserver: ResizeObserver
  private visibilityObserver: IntersectionObserver
  /** Um grupo por objeto do menu, já na cena; os modelos entram neles quando terminam de baixar. */
  private slots = new Map<DeskObject, THREE.Group>()
  private interactive: Interactive[] = []
  private lid: THREE.Group | null = null
  private lidOpen = 0
  /** Mola da câmera: deslocamento atual e velocidade. */
  private offset = new THREE.Vector3()
  private velocity = new THREE.Vector3()
  private leaveTimer = 0
  /** Mergulho em andamento: objeto, início e de onde a câmera saiu. */
  private dive: {
    index: number
    start: number
    from: THREE.Vector3
    fromLook: THREE.Vector3
    /** Tela em que a câmera entra (monitor ou notebook); sem ela, só se aproxima do objeto. */
    screen: THREE.Mesh | null
    /** Normal média da tela, no espaço do próprio mesh. */
    normal: THREE.Vector3
    /** Celular pego da mesa: posição e giro iniciais, no mundo. */
    pickup: { group: THREE.Group; position: THREE.Vector3; quaternion: THREE.Quaternion } | null
  } | null = null
  /** Telas de cada objeto do menu, para a câmera entrar nelas no clique. */
  private screens = new Map<DeskObject, THREE.Mesh[]>()
  /** Tela clicada por último na cena: com dois monitores, a câmera entra no que foi clicado. */
  private clickedScreen: THREE.Mesh | null = null
  private github = createGithubTexture(GITHUB_PROFILE, GITHUB_REPOS)
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2(9, 9)
  private parallax = new THREE.Vector2()
  private parallaxTarget = new THREE.Vector2()
  private hovered: number | null = null
  private focused: number | null = null
  private enter = 0
  private look = new THREE.Vector3()
  private leds: THREE.PointLight[] = []
  private screen = createScreenTexture()
  private code = createCodeTexture()
  private textures: { redraw: () => void }[] = []
  private slideClock = 0
  private lastTime = 0
  private frame = 0
  private visible = false
  private disposed = false
  private width = 0
  private height = 0

  constructor(container: HTMLElement, options: DeskStageOptions) {
    this.container = container
    this.options = options
    this.reducedMotion = options.reducedMotion
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    this.renderer.setClearColor(0x000000)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.style.display = 'block'
    // Sem memória de vídeo o canvas fica branco; escondido, sobra o fundo preto da seção.
    this.renderer.domElement.addEventListener('webglcontextlost', () => {
      this.renderer.domElement.style.visibility = 'hidden'
    })
    container.appendChild(this.renderer.domElement)

    // Reflexos suaves nos plásticos e nas telas, sem mudar o clima escuro.
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.18
    pmrem.dispose()
    this.scene.fog = new THREE.Fog(0x000000, 16, 30)
    // Com a tampa separada por código, a tela do notebook fica de pé com a imagem normal.
    this.code.texture.flipY = true
    this.lidOpen = this.touchOnly ? 1 : 0

    this.buildLights()
    this.buildRoom()
    this.buildObjects()
    this.loadModels()
    this.loadContent()

    const canvas = this.renderer.domElement
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerleave', this.onPointerLeave)
    canvas.addEventListener('click', this.onClick)
    window.addEventListener('pointermove', this.onWindowPointer, { passive: true })
    window.addEventListener('scroll', this.onScroll, { passive: true })

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting
      if (this.visible) this.play()
      else cancelAnimationFrame(this.frame)
    })
    this.visibilityObserver.observe(container)
    this.resize()
  }

  /** Destaque vindo de fora (lista do menu, teclado); null tira o destaque. */
  setFocus(index: number | null) {
    this.focused = index
    if (this.reducedMotion) this.renderStill()
  }

  /** A câmera mergulha no objeto escolhido; a página abre logo depois (quem chama decide quando). */
  diveInto(index: number) {
    if (this.dive || this.reducedMotion) return
    const object = this.interactive[index]?.object
    const screens = (object && this.screens.get(object)) || []
    const screen =
      this.clickedScreen && screens.includes(this.clickedScreen) ? this.clickedScreen : (screens[0] ?? null)
    this.clickedScreen = null
    // O celular sai do grupo do objeto e passa a ser movido direto no mundo.
    const phone = object === 'phone' ? this.interactive[index].group : null
    if (phone) this.scene.attach(phone)
    this.dive = {
      index,
      start: performance.now(),
      from: this.camera.position.clone(),
      fromLook: this.look.clone(),
      screen,
      normal: screen ? averageNormal(screen) : new THREE.Vector3(),
      pickup: phone
        ? {
            group: phone,
            position: phone.getWorldPosition(new THREE.Vector3()),
            quaternion: phone.getWorldQuaternion(new THREE.Quaternion()),
          }
        : null,
    }
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.visibilityObserver.disconnect()
    const canvas = this.renderer.domElement
    canvas.removeEventListener('pointermove', this.onPointerMove)
    canvas.removeEventListener('pointerleave', this.onPointerLeave)
    canvas.removeEventListener('click', this.onClick)
    window.removeEventListener('pointermove', this.onWindowPointer)
    window.removeEventListener('scroll', this.onScroll)
    window.clearTimeout(this.leaveTimer)
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        const standard = material as THREE.MeshStandardMaterial
        standard.map?.dispose()
        standard.emissiveMap?.dispose()
        standard.normalMap?.dispose()
        standard.roughnessMap?.dispose()
        standard.metalnessMap?.dispose()
        material.dispose()
      }
    })
    this.scene.environment?.dispose()
    this.renderer.dispose()
    canvas.remove()
  }

  // ——— Cena ———

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x9aa2b8, 0x1a0606, 0.45))
    // Luz da frente, fraca, que dá as sombras dos objetos na mesa.
    const key = new THREE.DirectionalLight(0xfff2ea, 0.9)
    key.position.set(3, 10, 8)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = -9
    key.shadow.camera.right = 9
    key.shadow.camera.top = 8
    key.shadow.camera.bottom = -5
    key.shadow.bias = -0.0008
    key.shadow.radius = 4
    this.scene.add(key)
    // A tela acesa ilumina o teclado e a mesa na frente dela.
    const screenLight = new THREE.PointLight(0xc4d2ff, 6, 9, 1.6)
    screenLight.position.set(0, 3.4, -1)
    this.scene.add(screenLight)
    // Fita de LED atrás da mesa: luz vermelha batendo na parede.
    for (const x of [-6, -2, 2, 6]) {
      const led = new THREE.PointLight(LED_COLOR, 9, 8, 1.4)
      led.position.set(x, 0.4, -3.1)
      this.leds.push(led)
      this.scene.add(led)
    }
  }

  private buildRoom() {
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 22),
      new THREE.MeshStandardMaterial({ color: 0x17141a, roughness: 0.95 }),
    )
    wall.position.set(0, 6, -3.6)
    wall.receiveShadow = true
    this.scene.add(wall)

    // Brilho do LED na parede, mais forte rente à mesa e sumindo para cima.
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 12),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(LED_COLOR) } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float up = exp(-vUv.y * 4.2);
            float side = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
            float a = up * side * 0.55;
            gl_FragColor = vec4(uColor * a, a);
          }
        `,
      }),
    )
    glow.position.set(0, 5.6, -3.58)
    this.scene.add(glow)

    // A própria fita de LED, aparecendo na borda de trás da mesa.
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(DESK_WIDTH - 0.4, 0.05, 0.05),
      new THREE.MeshBasicMaterial({ color: LED_COLOR, toneMapped: false }),
    )
    strip.position.set(0, -0.05, -3.4)
    this.scene.add(strip)

    const pad = createMousepadTexture()
    this.textures.push(pad)
    const mousepad = new THREE.Mesh(
      new THREE.PlaneGeometry(10.5, 4),
      new THREE.MeshStandardMaterial({ map: pad.texture, roughness: 0.95 }),
    )
    mousepad.rotation.x = -Math.PI / 2
    mousepad.position.set(0.9, 0.012, 1.4)
    mousepad.receiveShadow = true
    this.scene.add(mousepad)
  }

  private buildObjects() {
    const builders: Record<DeskObject, () => { group: THREE.Group; lift: boolean }> = {
      monitor: () => ({ group: this.slot('monitor'), lift: false }),
      controller: () => ({ group: this.slot('controller'), lift: true }),
      laptop: () => ({ group: this.slot('laptop'), lift: false }),
      pc: () => ({ group: this.slot('pc'), lift: true }),
      phone: () => ({ group: this.buildPhone(), lift: true }),
    }
    for (const object of this.options.objects) {
      const { group, lift } = builders[object]()
      castShadows(group)
      this.scene.add(group)
      this.interactive.push({ object, group, lift, baseY: group.position.y, amount: 0 })
    }
  }

  /** Grupo vazio no lugar do objeto; o modelo entra nele quando chegar. */
  private slot(object: DeskObject) {
    const group = new THREE.Group()
    this.slots.set(object, group)
    return group
  }

  /** Celular deitado à direita, com a tela acesa. */
  private buildPhone() {
    const group = new THREE.Group()
    group.position.set(4.2, 0, 2.4)
    group.rotation.y = -0.32
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(0.82, 0.09, 1.72, 3, 0.04),
      new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.35, metalness: 0.6 }),
    )
    body.position.y = 0.045
    const phone = createPhoneTexture()
    this.textures.push(phone)
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.74, 1.6),
      new THREE.MeshBasicMaterial({ map: phone.texture, toneMapped: false }),
    )
    screen.rotation.x = -Math.PI / 2
    screen.position.y = 0.092
    group.add(body, screen)
    return group
  }

  // ——— Modelos ———

  private async loadModels() {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const [desk, monitor, laptop, pc, nintendo, controller] = await Promise.all(
      [DESK_URL, MONITOR_URL, LAPTOP_URL, PC_URL, SWITCH_URL, CONTROLLER_URL].map((url) =>
        loader.loadAsync(url).then((gltf) => gltf.scene),
      ),
    )
    if (this.disposed) return
    this.placeDesk(desk)
    this.placeMonitors(monitor)
    this.placeLaptop(laptop)
    this.placePc(pc)
    this.placeSwitch(nintendo)
    this.placeController(controller)
    this.renderStill()
  }

  /**
   * Mesa, teclado e mouse do "gaming setup v2". No arquivo a frente da mesa olha para +x: tudo gira
   * para a câmera. A mesa fica preta; teclado e mouse ficam como no modelo, com o RGB.
   */
  private placeDesk(model: THREE.Group) {
    // O GLTFLoader tira os pontos dos nomes: "Plane.002" vira "Plane002".
    const part = (name: string) => model.getObjectByName(name) ?? new THREE.Group()
    const deskPart = part('desk')
    const keyboardPart = part('Plane')
    const mousePart = part('Plane002')

    deskPart.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const material = child.material as THREE.MeshStandardMaterial
      material.map = null
      material.color.set(0x141416)
      // Um pouco de brilho: o tampo preto reflete o LED e não some no fundo.
      material.metalness = 0.3
      material.roughness = 0.38
      material.needsUpdate = true
      child.receiveShadow = true
    })
    const deskSize = measure(deskPart).getSize(new THREE.Vector3())
    const scale = DESK_WIDTH / deskSize.z
    const deskGroup = centered(deskPart)
    deskGroup.rotation.y = -Math.PI / 2
    deskGroup.scale.setScalar(scale)
    deskGroup.position.set(0, 0, -0.1)
    this.scene.add(deskGroup)
    // O tampo fica em y = 0, como o resto da cena.
    deskGroup.position.y = -measure(deskGroup).max.y

    this.placeOnDesk(keyboardPart, scale, KEYBOARD.position, KEYBOARD.turn)
    this.placeOnDesk(mousePart, scale, MOUSE.position, MOUSE.turn)
  }

  /** Peça na mesma escala da mesa, apoiada no tampo e virada para a câmera. */
  private placeOnDesk(part: THREE.Object3D, scale: number, position: THREE.Vector3, turn: number) {
    const height = measure(part).getSize(new THREE.Vector3()).y * scale
    const group = centered(part)
    group.rotation.y = -Math.PI / 2 + turn
    group.scale.setScalar(scale)
    group.position.set(position.x, height / 2, position.z)
    castShadows(group)
    this.scene.add(group)
  }

  /**
   * Os dois monitores do "Gaming Setup (low-poly)", encostados como no modelo: o da esquerda passa os
   * projetos e o da direita mostra o perfil do GitHub. Juntos são o objeto "Projetos" do menu.
   */
  private placeMonitors(model: THREE.Group) {
    const size = measure(model).getSize(new THREE.Vector3())
    // No arquivo os monitores ficam lado a lado no eixo z.
    const scale = MONITOR_PAIR.width / size.z
    const group = centered(model)
    group.rotation.y = -Math.PI / 2
    group.scale.setScalar(scale)
    group.position.copy(MONITOR_PAIR.position)
    group.position.y = (size.y * scale) / 2
    this.scene.add(group)
    group.updateMatrixWorld(true)
    // Os dois monitores (tela + pé) são o objeto "Projetos": o da esquerda passa os projetos e o da
    // direita mostra o perfil do GitHub.
    const pairs = [
      ['Cylinder_3', 'Cube001_4'],
      ['Cylinder001_5', 'Cube002_6'],
    ].map((names) => names.map((name) => group.getObjectByName(name)).filter((node) => node !== undefined))
    pairs.sort(
      (a, b) => measure(a[0]).getCenter(new THREE.Vector3()).x - measure(b[0]).getCenter(new THREE.Vector3()).x,
    )
    pairs.forEach((nodes, index) => {
      const slot = this.slots.get('monitor')
      if (!slot || !nodes.length) return
      // O grupo do objeto fica no centro do monitor: crescer no destaque não o tira do lugar.
      if (index === 0) {
        const box = new THREE.Box3().setFromObject(group)
        const center = box.getCenter(new THREE.Vector3())
        slot.position.set(center.x, 0, center.z)
        slot.updateMatrixWorld(true)
      }
      for (const node of nodes) slot.attach(node)
      for (const node of nodes)
        node.traverse((child) => {
          if (!(child instanceof THREE.Mesh) || (child.material as THREE.Material).name !== 'screen') return
          this.screens.set('monitor', [...(this.screens.get('monitor') ?? []), child])
          ;(child.material as THREE.Material).dispose()
          child.material = new THREE.MeshBasicMaterial({
            map: index === 0 ? this.screen.texture : this.github.texture,
            toneMapped: false,
            // A tela fica rente à moldura: o deslocamento de profundidade evita que a moldura a cubra.
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -4,
            // A normal da tela no modelo aponta para trás: sem os dois lados ela some.
            side: THREE.DoubleSide,
          })
        })
      castShadows(slot)
    })
    group.removeFromParent()
  }

  /** Certificados: um controle de videogame, porque certificado é conquista, como troféu de jogo. */
  private placeController(model: THREE.Group) {
    const size = measure(model).getSize(new THREE.Vector3())
    const scale = CONTROLLER.width / size.z
    const group = centered(model)
    // No arquivo a frente do controle olha para +x.
    group.rotation.y = -Math.PI / 2
    group.scale.setScalar(scale)
    group.position.y = (size.y * scale) / 2
    this.fill('controller', group, CONTROLLER.position, CONTROLLER.turn)
  }

  /** Nintendo Switch do Diogo, de decoração: console de pé, dock e Joy-Cons cinza como os dele. */
  private placeSwitch(model: THREE.Group) {
    const console = model.getObjectByName('nintendo_switch_n_switch_2k_console_0')
    const consoleWidth = console ? measure(console).getSize(new THREE.Vector3()).x : 0.17
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const material = child.material as THREE.MeshStandardMaterial
      if (material.name.includes('joi_con')) {
        material.map = null
        material.color.set(0x5c5d63)
        material.needsUpdate = true
      }
    })
    const size = measure(model).getSize(new THREE.Vector3())
    const scale = SWITCH.width / consoleWidth
    const group = centered(model)
    group.scale.setScalar(scale)
    group.position.y = (size.y * scale) / 2
    const holder = new THREE.Group()
    holder.position.copy(SWITCH.position)
    holder.rotation.y = SWITCH.turn
    holder.add(group)
    castShadows(holder)
    this.scene.add(holder)
  }

  /**
   * Notebook fechado ao lado do teclado; a tampa abre quando o mouse chega. O modelo é uma malha só,
   * então a tampa é separada aqui: os triângulos acima da base viram a tampa, que gira na dobradiça.
   */
  private placeLaptop(model: THREE.Group) {
    model.updateMatrixWorld(true)
    const base = new THREE.Group()
    const lid = new THREE.Group()
    lid.position.set(LAPTOP_HINGE.x, LAPTOP_HINGE.y, 0)
    const meshes: THREE.Mesh[] = []
    model.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child)
    })
    for (const mesh of meshes) {
      const original = mesh.material as THREE.MeshStandardMaterial
      let material: THREE.Material = original
      switch (original.name) {
        case 'Screen.001':
          // A tela mostra um editor de código; o material do modelo sai de cena.
          // A tela fica rente à moldura e as duas brigavam pela frente; empurrada um pouco para trás,
          // a moldura sempre aparece por cima dela.
          material = new THREE.MeshBasicMaterial({
            map: this.code.texture,
            toneMapped: false,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 2,
          })
          original.dispose()
          break
        case 'Keyboard.001':
          // Teclado roxo, como o ASUS TUF do Diogo.
          original.emissiveMap = original.map
          original.emissive.set(0xb04cff)
          original.emissiveIntensity = 1.4
          original.color.set(0x111113)
          original.needsUpdate = true
          break
        case 'Light.001':
        case 'Orange.001':
          original.color.set(0x8a2be2)
          original.emissive.set(0xb04cff)
          original.emissiveIntensity = 1
          break
        case 'White.001':
        case 'Metal.001':
          original.color.set(0x1a1b1e)
          break
      }
      const [baseGeometry, lidGeometry] = splitByHeight(mesh, LID_SPLIT_Y)
      mesh.geometry.dispose()
      if (baseGeometry) base.add(new THREE.Mesh(baseGeometry, material))
      if (lidGeometry) {
        lidGeometry.translate(-LAPTOP_HINGE.x, -LAPTOP_HINGE.y, 0)
        const part = new THREE.Mesh(lidGeometry, material)
        if (original.name === 'Screen.001') this.screens.set('laptop', [part])
        lid.add(part)
      }
    }
    // Tira a inclinação do suporte: a base fica deitada na mesa.
    const body = new THREE.Group()
    body.rotation.z = LAPTOP_TILT
    body.add(base, lid)
    lid.rotation.z = LID_CLOSED
    this.lid = lid
    const size = measure(body).getSize(new THREE.Vector3())
    const scale = LAPTOP.width / size.z
    const group = centered(body)
    group.rotation.y = -Math.PI / 2
    group.scale.setScalar(scale)
    group.position.y = (size.y * scale) / 2
    this.updateLid()
    this.fill('laptop', group, LAPTOP.position, LAPTOP.turn)
  }

  /** Gabinete do "Gaming and Modelling Computer Setup", preto e de frente, com o vidro virado para o meio. */
  private placePc(model: THREE.Group) {
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const material = child.material as THREE.MeshStandardMaterial
      const name = material.name
      if (/Case|FrontMesh|Feet|FrontFan$|TopFan$|RadiatorExterior|Motherboard|GPU$/.test(name)) {
        material.color.setScalar(0.08)
      }
      if (material.emissiveMap || /CoolingLiquid/.test(name)) material.emissive.set(LED_COLOR)
      if (/CoolingLiquid/.test(name)) material.color.set(0x400808)
      // Vidro fumê e hélices vermelhas, como o resto da luz da mesa.
      if (/GlassPanel/.test(name)) {
        material.color.set(0x16161a)
        material.opacity = 0.35
      }
      if (/FanBlades/.test(name)) material.color.set(LED_COLOR)
    })
    const size = measure(model).getSize(new THREE.Vector3())
    const scale = PC.height / size.y
    const group = centered(model)
    // Espelhado: o vidro, que no modelo fica do lado direito, passa para o lado do monitor.
    group.scale.set(-scale, scale, scale)
    group.position.y = PC.height / 2
    this.fill('pc', group, PC.position, PC.turn)
  }

  private fill(object: DeskObject, model: THREE.Group, position: THREE.Vector3, turn: number) {
    const slot = this.slots.get(object)
    const item = this.interactive.find((entry) => entry.object === object)
    if (!slot) return
    slot.position.copy(position)
    slot.rotation.y = turn
    slot.add(model)
    castShadows(slot)
    if (item) item.baseY = position.y
  }

  /** Capas dos projetos: chegam depois, a cena já aparece sem elas. */
  private async loadContent() {
    const [images, avatar] = await Promise.all([
      Promise.all(this.options.slides.map((slide) => loadImage(slide.image))),
      loadImage(GITHUB_PROFILE.avatar),
      fontsReady(),
    ])
    if (this.disposed) return
    this.screen.state.slides = this.options.slides
      .map((slide, index) => ({ title: slide.title, tag: slide.tag, image: images[index] }))
      .filter((slide): slide is ScreenSlide => slide.image !== null)
    this.screen.redraw()
    this.code.redraw()
    this.github.state.avatar = avatar
    this.github.redraw()
    // Com as fontes do site carregadas, os textos do celular saem certos.
    for (const texture of this.textures) texture.redraw()
    this.renderStill()
    this.options.onLoaded()
  }

  // ——— Interação ———

  private onPointerMove = (event: PointerEvent) => {
    this.setPointer(event)
    if (event.pointerType === 'mouse') this.updateHover()
  }

  private onPointerLeave = () => {
    this.pointer.set(9, 9)
    this.updateHover()
  }

  private onClick = (event: MouseEvent) => {
    if (this.dive) return
    this.setPointer(event)
    const index = this.pick()
    if (index === null) return
    // Com dois monitores, a câmera entra no que está mais perto do clique.
    const object = this.interactive[index].object
    const point = this.raycaster.intersectObject(this.interactive[index].group, true)[0]?.point
    const screens = this.screens.get(object) ?? []
    this.clickedScreen =
      point && screens.length
        ? screens.reduce((best, screen) =>
            measure(screen).distanceToPoint(point) < measure(best).distanceToPoint(point) ? screen : best,
          )
        : null
    this.options.onSelect(index)
  }

  private setPointer(event: MouseEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
  }

  /** A câmera acompanha o mouse em qualquer lugar da tela, não só sobre o canvas. */
  private onWindowPointer = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    this.parallaxTarget.set((event.clientX / window.innerWidth) * 2 - 1, (event.clientY / window.innerHeight) * 2 - 1)
  }

  private onScroll = () => {
    if (this.reducedMotion) return
    const section = this.container.closest('section')
    if (!section) return
    this.enter = THREE.MathUtils.clamp(section.getBoundingClientRect().top / window.innerHeight, 0, 1)
  }

  private pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(
      this.interactive.map(({ group }) => group),
      true,
    )
    if (!hits.length) return null
    const index = this.interactive.findIndex(({ group }) => {
      let node: THREE.Object3D | null = hits[0].object
      while (node && node !== group) node = node.parent
      return node === group
    })
    return index === -1 ? null : index
  }

  /**
   * Entrar num objeto vale na hora; sair só vale depois de HOVER_LEAVE_MS. Assim o mouse passa pelas
   * frestas entre os objetos (ou de um objeto para a etiqueta dele) sem o destaque apagar e voltar.
   */
  private updateHover() {
    if (this.dive) return
    const index = this.pick()
    this.renderer.domElement.style.cursor = index === null ? '' : 'pointer'
    if (index !== null) {
      window.clearTimeout(this.leaveTimer)
      this.leaveTimer = 0
      this.setHovered(index)
    } else if (this.hovered !== null && !this.leaveTimer) {
      this.leaveTimer = window.setTimeout(() => {
        this.leaveTimer = 0
        this.setHovered(null)
      }, HOVER_LEAVE_MS)
    }
  }

  private setHovered(index: number | null) {
    if (index === this.hovered) return
    this.hovered = index
    this.options.onHover(index)
    if (this.reducedMotion) this.renderStill()
  }

  // ——— Quadros ———

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.container
    if (!width || !height) return
    this.width = width
    this.height = height
    this.renderer.setSize(width, height)
    const aspect = width / height
    // Em tela estreita abre o ângulo em vez de cortar a mesa.
    const fit = aspect < 0.8 ? NARROW_FIT_TANGENT : FIT_TANGENT
    const tangent = Math.max(MIN_TANGENT, fit / aspect)
    this.camera.fov = THREE.MathUtils.radToDeg(Math.atan(tangent)) * 2
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
    this.onScroll()
    this.renderStill()
  }

  /** Posição de descanso: vinda do alto pela rolagem, um balanço lento e o mouse. */
  private restCamera(time: number) {
    this.camera.position.copy(CAMERA_REST)
    this.look.copy(CAMERA_LOOK)
    this.camera.position.y += this.enter * 3.2
    this.look.y += this.enter * 1.6
    if (!this.reducedMotion) this.camera.position.x += Math.sin(time * 0.25) * 0.12
    this.camera.position.x += this.parallax.x * PARALLAX.x
    this.camera.position.y -= this.parallax.y * PARALLAX.y
  }

  private placeCamera(time = 0, delta = 0) {
    const active = this.focused ?? this.hovered
    this.restCamera(time)
    // Mola criticamente amortecida: chega no alvo sem passar dele e freia no fim.
    const target = new THREE.Vector3()
    if (active !== null) {
      const [x, y, z] = this.options.anchors[active]
      target.set(x, y, z).sub(this.camera.position).multiplyScalar(APPROACH)
    }
    if (delta > 0) {
      const step = Math.min(delta, 0.05)
      const pull = target
        .clone()
        .sub(this.offset)
        .multiplyScalar(SPRING * SPRING)
      this.velocity.addScaledVector(pull, step).addScaledVector(this.velocity, -2 * SPRING * step)
      this.offset.addScaledVector(this.velocity, step)
    } else this.offset.copy(target)
    this.camera.position.add(this.offset)
    this.look.add(this.offset)

    if (this.dive?.pickup) {
      // Pegando o celular: a câmera fica parada e o celular vem até ela.
      this.camera.position.copy(this.dive.from)
      this.look.copy(this.dive.fromLook)
    } else if (this.dive?.screen) this.enterScreen(this.dive.screen, this.dive.normal)
    else if (this.dive) {
      // Mergulho: do ponto atual até perto do objeto, acelerando e freando (easeInOutCubic).
      const t = Math.min((performance.now() - this.dive.start) / 1000 / DIVE_SECONDS, 1)
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      const [x, y, z] = this.options.anchors[this.dive.index]
      const goal = new THREE.Vector3(x, y, z)
      const close = goal.clone().add(this.dive.from.clone().sub(goal).setLength(4.2))
      this.camera.position.lerpVectors(this.dive.from, close, eased)
      this.look.lerpVectors(this.dive.fromLook, goal, eased)
    }
    this.camera.lookAt(this.look)
    this.camera.updateMatrixWorld()
    if (this.dive?.pickup) this.movePhone(this.dive.pickup)
  }

  /**
   * O celular sobe da mesa, vira de pé com a tela para a câmera e para no meio da visão, como se
   * alguém o pegasse; no fim chega bem perto, até a tela dele tomar a visão.
   */
  private movePhone(pickup: { group: THREE.Group; position: THREE.Vector3; quaternion: THREE.Quaternion }) {
    if (!this.dive) return
    const t = Math.min((performance.now() - this.dive.start) / 1000 / PICKUP_SECONDS, 1)
    const camera = this.camera
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    const back = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2)
    // Tela do celular (+y) virada para a câmera e o topo da imagem (-z) para cima.
    const facing = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(right, back, up.clone().negate()),
    )
    // Distância em que a tela do celular ocupa uns 70% da altura (ou 80% da largura, no celular em pé).
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const near = Math.max(1.6 / (0.7 * 2 * tangent), 0.74 / (0.8 * 2 * tangent * camera.aspect))
    const held = camera.position.clone().addScaledVector(back, -near)

    const group = pickup.group
    if (t < PICKUP_LIFT) {
      // Sobe um pouco da mesa, já começando a girar.
      const k = THREE.MathUtils.smoothstep(t / PICKUP_LIFT, 0, 1)
      group.position.copy(pickup.position).y += k * 0.6
      group.quaternion.copy(pickup.quaternion).slerp(facing, k * 0.25)
    } else if (t < PICKUP_ARRIVE) {
      // Vem até o meio da tela numa curva, terminando de pé.
      const k = (t - PICKUP_LIFT) / (PICKUP_ARRIVE - PICKUP_LIFT)
      const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      const start = pickup.position.clone()
      start.y += 0.6
      const control = start.clone().lerp(held, 0.5)
      control.y += 1.2
      const a = start.clone().lerp(control, eased)
      const b = control.lerp(held, eased)
      group.position.copy(a.lerp(b, eased))
      const turn = new THREE.Quaternion().copy(pickup.quaternion).slerp(facing, 0.25)
      group.quaternion.copy(turn.slerp(facing, eased))
    } else {
      // Na mão: chega mais perto, acelerando, até a tela dele tomar a visão.
      const k = (t - PICKUP_ARRIVE) / (1 - PICKUP_ARRIVE)
      group.position.copy(held).addScaledVector(back, near * 0.62 * k * k)
      group.quaternion.copy(facing)
    }
    group.scale.setScalar(1)
  }

  /**
   * Entrar na tela: a câmera faz uma curva até ficar de frente para ela, para onde a imagem ocupa a
   * tela inteira, e depois acelera para dentro. A tampa do notebook ainda pode estar abrindo, por isso
   * a posição da tela é lida a cada quadro.
   */
  private enterScreen(screen: THREE.Mesh, localNormal: THREE.Vector3) {
    if (!this.dive) return
    const t = Math.min((performance.now() - this.dive.start) / 1000 / ENTER_SECONDS, 1)
    const box = measure(screen)
    const center = box.getCenter(new THREE.Vector3())
    const normal = localNormal.clone().transformDirection(screen.matrixWorld)
    // A normal de algumas telas aponta para trás: vale o lado de onde a câmera vem.
    if (normal.dot(this.dive.from.clone().sub(center)) < 0) normal.negate()
    const size = box.getSize(new THREE.Vector3())
    const width = Math.hypot(size.x, size.z)
    const height = Math.max(size.y, width / (16 / 9))
    // Distância em que a tela enche a visão: pela altura na tela deitada, pela largura no celular em pé.
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))
    const fill = Math.max(height / 2 / tangent, width / 2 / (tangent * this.camera.aspect))
    const front = center.clone().addScaledVector(normal, fill * 0.9)
    if (t < ENTER_APPROACH) {
      const k = t / ENTER_APPROACH
      const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2
      // Curva: o ponto de controle fica na frente da tela, então a chegada é sempre de frente.
      const control = center.clone().addScaledVector(normal, this.dive.from.distanceTo(center) * 0.55)
      const a = this.dive.from.clone().lerp(control, eased)
      const b = control.lerp(front, eased)
      this.camera.position.copy(a.lerp(b, eased))
      this.look.lerpVectors(this.dive.fromLook, center, Math.min(eased * 1.25, 1))
    } else {
      // Já de frente: acelera para dentro da imagem.
      const k = (t - ENTER_APPROACH) / (1 - ENTER_APPROACH)
      this.camera.position.copy(front).addScaledVector(normal, -fill * 0.68 * k * k)
      this.look.copy(center)
    }
  }

  private project() {
    this.options.onProject(
      this.options.anchors.map(([x, y, z]) => {
        const point = new THREE.Vector3(x, y, z).project(this.camera)
        return { x: ((point.x + 1) / 2) * this.width, y: ((1 - point.y) / 2) * this.height }
      }),
    )
  }

  /** `delta` em segundos; 0 põe tudo direto no estado final (movimento reduzido). */
  private animateObjects(delta: number) {
    const active = this.dive?.index ?? this.focused ?? this.hovered
    const objectEase = delta > 0 ? 1 - Math.exp(-DAMP_OBJECT * delta) : 1
    this.interactive.forEach((item, index) => {
      // O celular pego é movido em `movePhone`.
      if (this.dive?.pickup?.group === item.group) return
      item.amount += ((index === active ? 1 : 0) - item.amount) * objectEase
      if (item.lift) item.group.position.y = item.baseY + item.amount * 0.14
      item.group.scale.setScalar(1 + item.amount * (item.lift ? 0.025 : 0.015))
    })
    // A tampa abre mais devagar que o destaque, como uma tampa de verdade.
    const laptop = this.interactive.findIndex((item) => item.object === 'laptop')
    const open = this.touchOnly || (laptop !== -1 && laptop === active) ? 1 : 0
    this.lidOpen += (open - this.lidOpen) * (delta > 0 ? 1 - Math.exp(-DAMP_LID * delta) : 1)
    this.updateLid()
  }

  private updateLid() {
    if (!this.lid) return
    // Começa e termina devagar; abre até o ângulo do modelo (uns 115°).
    const t = THREE.MathUtils.smootherstep(this.lidOpen, 0, 1)
    this.lid.rotation.z = LID_CLOSED * (1 - t)
  }

  private updateScreen(delta: number) {
    const { state } = this.screen
    if (state.slides.length < 2) return
    this.slideClock += delta
    if (this.slideClock < SLIDE_TIME) return
    if (state.to === state.from) state.to = (state.from + 1) % state.slides.length
    state.mix = Math.min((this.slideClock - SLIDE_TIME) / SLIDE_FADE, 1)
    if (state.mix >= 1) {
      state.from = state.to
      state.mix = 0
      this.slideClock = 0
    }
    this.screen.redraw()
  }

  private play() {
    cancelAnimationFrame(this.frame)
    if (this.reducedMotion) {
      this.renderStill()
      return
    }
    this.lastTime = performance.now()
    const tick = (now: number) => {
      if (!this.visible || this.disposed) return
      const delta = Math.min((now - this.lastTime) / 1000, 0.1)
      this.lastTime = now
      // Com um objeto escolhido a câmera não segue mais o mouse: a escolha fica parada e fácil de ler.
      const chosen = this.focused ?? this.hovered
      if (chosen === null) this.parallax.lerp(this.parallaxTarget, 1 - Math.exp(-DAMP_PARALLAX * delta))
      this.animateObjects(delta)
      this.updateScreen(delta)
      // O LED respira devagar, quase sem dar para notar.
      const breath = 1 + Math.sin(now / 1400) * 0.08
      for (const led of this.leds) led.intensity = 9 * breath
      this.placeCamera(now / 1000, delta)
      this.project()
      this.renderer.render(this.scene, this.camera)
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  /** Um quadro só: com movimento reduzido, ou para atualizar a cena parada. */
  private renderStill() {
    if (this.disposed || !this.width) return
    if (this.reducedMotion) this.animateObjects(0)
    this.placeCamera()
    this.project()
    this.renderer.render(this.scene, this.camera)
  }
}

function measure(object: THREE.Object3D) {
  object.updateWorldMatrix(true, true)
  return new THREE.Box3().setFromObject(object)
}

/** Põe o objeto num grupo com o centro dele na origem: girar e escalar não o tira do lugar. */
function centered(object: THREE.Object3D) {
  const center = measure(object).getCenter(new THREE.Vector3())
  const group = new THREE.Group()
  object.removeFromParent()
  // Os nós soltos do modelo estão na raiz: a posição local já é a posição no mundo.
  object.position.sub(center)
  group.add(object)
  return group
}

function castShadows(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = true
  })
}

/**
 * Separa a malha em duas, já nas coordenadas do modelo: triângulos com o centro abaixo de `height`
 * (a base) e acima (a tampa). Devolve null quando um dos lados fica vazio.
 */
function splitByHeight(mesh: THREE.Mesh, height: number): [THREE.BufferGeometry | null, THREE.BufferGeometry | null] {
  const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
  const position = source.getAttribute('position')
  const normal = source.getAttribute('normal')
  const uv = source.getAttribute('uv')
  const matrix = mesh.matrixWorld
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix)
  const sides = [
    { position: [] as number[], normal: [] as number[], uv: [] as number[] },
    { position: [] as number[], normal: [] as number[], uv: [] as number[] },
  ]
  const point = new THREE.Vector3()
  const direction = new THREE.Vector3()
  for (let i = 0; i < position.count; i += 3) {
    let centerY = 0
    const corners: THREE.Vector3[] = []
    for (let k = 0; k < 3; k++) {
      point.fromBufferAttribute(position, i + k).applyMatrix4(matrix)
      corners.push(point.clone())
      centerY += point.y / 3
    }
    const side = sides[centerY > height ? 1 : 0]
    for (let k = 0; k < 3; k++) {
      side.position.push(corners[k].x, corners[k].y, corners[k].z)
      if (normal) {
        direction
          .fromBufferAttribute(normal, i + k)
          .applyMatrix3(normalMatrix)
          .normalize()
        side.normal.push(direction.x, direction.y, direction.z)
      }
      if (uv) side.uv.push(uv.getX(i + k), uv.getY(i + k))
    }
  }
  if (source !== mesh.geometry) source.dispose()
  return sides.map((side) => {
    if (!side.position.length) return null
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(side.position, 3))
    if (side.normal.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(side.normal, 3))
    if (side.uv.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(side.uv, 2))
    return geometry
  }) as [THREE.BufferGeometry | null, THREE.BufferGeometry | null]
}

/** Normal média de uma malha plana (a tela), no espaço dela. */
function averageNormal(mesh: THREE.Mesh) {
  const normals = mesh.geometry.getAttribute('normal')
  const sum = new THREE.Vector3()
  if (normals) for (let i = 0; i < normals.count; i++) sum.add(new THREE.Vector3().fromBufferAttribute(normals, i))
  return sum.lengthSq() > 0 ? sum.normalize() : new THREE.Vector3(0, 0, 1)
}
