import * as THREE from 'three'
import type { GITHUB_PROFILE, GithubRepo } from '../../data/github'

/**
 * Texturas da mesa desenhadas por código num canvas 2D: telas do monitor, do notebook e do celular,
 * e o mousepad.
 */

const SANS = '"Space Grotesk Variable", ui-sans-serif, system-ui, sans-serif'
const GOTHIC = '"Sanguine Frost", serif'
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'

/** Gerador pseudoaleatório com semente: o desenho sai igual em toda visita. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  draw(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  const redraw = () => {
    draw(ctx)
    texture.needsUpdate = true
  }
  return { texture, redraw }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Espera as fontes do site para o texto do canvas não sair na fonte padrão do navegador. */
export function fontsReady() {
  return Promise.all([document.fonts.load(`48px ${GOTHIC}`), document.fonts.load(`600 48px ${SANS}`)]).catch(
    () => undefined,
  )
}

/** Linhas do editor na tela do notebook: [recuo, trechos com cor]. */
const CODE: [number, [string, string][]][] = [
  [
    0,
    [
      ['const ', '#c586c0'],
      ['diogo', '#9cdcfe'],
      [' = {', '#d4d4d4'],
    ],
  ],
  [
    1,
    [
      ['estudo', '#9cdcfe'],
      [': ', '#d4d4d4'],
      ["'Análise e Desenv. de Sistemas · FIAP'", '#ce9178'],
      [',', '#d4d4d4'],
    ],
  ],
  [
    1,
    [
      ['local', '#9cdcfe'],
      [': ', '#d4d4d4'],
      ["'São Paulo, BR'", '#ce9178'],
      [',', '#d4d4d4'],
    ],
  ],
  [
    1,
    [
      ['stack', '#9cdcfe'],
      [': [', '#d4d4d4'],
      ["'React'", '#ce9178'],
      [', ', '#d4d4d4'],
      ["'TypeScript'", '#ce9178'],
      [', ', '#d4d4d4'],
      ["'Three.js'", '#ce9178'],
      ['],', '#d4d4d4'],
    ],
  ],
  [
    1,
    [
      ['base', '#9cdcfe'],
      [': [', '#d4d4d4'],
      ["'Java'", '#ce9178'],
      [', ', '#d4d4d4'],
      ["'Python'", '#ce9178'],
      ['],', '#d4d4d4'],
    ],
  ],
  [
    1,
    [
      ['curioso', '#9cdcfe'],
      [': ', '#d4d4d4'],
      ['true', '#569cd6'],
      [',', '#d4d4d4'],
    ],
  ],
  [0, [['}', '#d4d4d4']]],
  [0, []],
  [
    0,
    [
      ['export default ', '#c586c0'],
      ['diogo', '#9cdcfe'],
    ],
  ],
]

/** Tela do notebook: um editor de código aberto com um "cartão de visita" em TypeScript. */
export function createCodeTexture() {
  return canvasTexture(1024, 640, (ctx) => {
    const { width, height } = ctx.canvas
    ctx.fillStyle = '#1e1e1e'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#2d2d2d'
    ctx.fillRect(0, 0, width, 40)
    ctx.fillStyle = '#1e1e1e'
    ctx.fillRect(16, 6, 190, 34)
    ctx.font = `400 20px ${MONO}`
    ctx.fillStyle = '#d4d4d4'
    ctx.fillText('sobre.ts', 40, 29)
    ctx.font = `400 26px ${MONO}`
    CODE.forEach(([indent, parts], index) => {
      const y = 100 + index * 44
      ctx.fillStyle = '#6e7681'
      ctx.textAlign = 'right'
      ctx.fillText(String(index + 1), 60, y)
      ctx.textAlign = 'left'
      let x = 92 + indent * 32
      for (const [text, color] of parts) {
        ctx.fillStyle = color
        ctx.fillText(text, x, y)
        x += ctx.measureText(text).width
      }
    })
    // Cursor piscando no fim do arquivo.
    ctx.fillStyle = '#ededed'
    ctx.fillRect(92, 100 + (CODE.length - 1) * 44 + 12, 14, 4)
    ctx.fillStyle = '#7a1fb8'
    ctx.fillRect(0, height - 30, width, 30)
    ctx.fillStyle = '#ededed'
    ctx.font = `400 18px ${MONO}`
    ctx.fillText('main  ✓  TypeScript', 16, height - 9)
  })
}

/** Cor de cada linguagem, como no GitHub. */
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Java: '#b07219',
  CSS: '#663399',
}

/**
 * Tela do segundo monitor: o perfil do GitHub do Diogo no tema escuro, com foto, bio, números e os
 * repositórios em destaque. `state.avatar` recebe a foto quando ela chegar.
 */
export function createGithubTexture(profile: typeof GITHUB_PROFILE, repos: GithubRepo[]) {
  const state = { avatar: null as HTMLImageElement | null }
  const result = canvasTexture(1280, 720, (ctx) => {
    const { width, height } = ctx.canvas
    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, width, height)
    // Barra do navegador com o endereço do perfil.
    ctx.fillStyle = '#161b22'
    ctx.fillRect(0, 0, width, 56)
    ctx.fillStyle = '#0d1117'
    roundRect(ctx, 220, 12, width - 440, 32, 16)
    ctx.fill()
    ctx.fillStyle = '#8b949e'
    ctx.font = `400 20px ${SANS}`
    ctx.textAlign = 'center'
    ctx.fillText(`github.com/${profile.login}`, width / 2, 35)
    ctx.textAlign = 'left'

    // Coluna da esquerda: foto, nome, login, bio e números.
    const avatarX = 60
    const avatarY = 92
    const avatarSize = 230
    ctx.save()
    ctx.beginPath()
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
    ctx.clip()
    if (state.avatar) ctx.drawImage(state.avatar, avatarX, avatarY, avatarSize, avatarSize)
    else {
      ctx.fillStyle = '#21262d'
      ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize)
    }
    ctx.restore()
    ctx.strokeStyle = '#30363d'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2)
    ctx.stroke()

    const textX = avatarX
    let y = avatarY + avatarSize + 50
    ctx.fillStyle = '#e6edf3'
    ctx.font = `600 30px ${SANS}`
    wrap(ctx, profile.name, textX, y, 300, 36).forEach((line, index) => ctx.fillText(line, textX, y + index * 36))
    y += 36 * wrap(ctx, profile.name, textX, y, 300, 36).length
    ctx.fillStyle = '#8b949e'
    ctx.font = `300 26px ${SANS}`
    ctx.fillText(profile.login, textX, y + 4)
    y += 46
    ctx.fillStyle = '#c9d1d9'
    ctx.font = `400 18px ${SANS}`
    const bio = wrap(ctx, profile.bio, textX, y, 300, 24)
    bio.forEach((line, index) => ctx.fillText(line, textX, y + index * 24))
    y += bio.length * 24 + 20
    ctx.fillStyle = '#8b949e'
    ctx.fillText(`${profile.followers} seguidores · ${profile.following} seguindo`, textX, y)
    ctx.fillText(profile.location, textX, y + 28)

    // Coluna da direita: repositórios em destaque, em dois por dois.
    const gridX = 420
    ctx.fillStyle = '#e6edf3'
    ctx.font = `500 22px ${SANS}`
    ctx.fillText('Repositórios em destaque', gridX, 104)
    ctx.fillStyle = '#8b949e'
    ctx.font = `400 18px ${SANS}`
    ctx.textAlign = 'right'
    ctx.fillText(`${profile.repos} repositórios públicos`, width - 60, 104)
    ctx.textAlign = 'left'
    const cardWidth = (width - gridX - 60 - 24) / 2
    const cardHeight = 150
    repos.slice(0, 4).forEach((repo, index) => {
      const x = gridX + (index % 2) * (cardWidth + 24)
      const top = 130 + Math.floor(index / 2) * (cardHeight + 24)
      ctx.strokeStyle = '#30363d'
      ctx.lineWidth = 2
      roundRect(ctx, x, top, cardWidth, cardHeight, 10)
      ctx.stroke()
      ctx.fillStyle = '#4493f8'
      ctx.font = `600 22px ${SANS}`
      ctx.fillText(repo.name, x + 22, top + 40)
      ctx.fillStyle = '#8b949e'
      ctx.font = `400 17px ${SANS}`
      wrap(ctx, repo.description, x, top, cardWidth - 44, 22)
        .slice(0, 2)
        .forEach((line, row) => ctx.fillText(line, x + 22, top + 72 + row * 22))
      ctx.fillStyle = LANGUAGE_COLORS[repo.language] ?? '#8b949e'
      ctx.beginPath()
      ctx.arc(x + 30, top + cardHeight - 26, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#8b949e'
      ctx.fillText(repo.language, x + 46, top + cardHeight - 20)
      if (repo.stars)
        ctx.fillText(`★ ${repo.stars}`, x + 46 + ctx.measureText(repo.language).width + 24, top + cardHeight - 20)
    })
    // Linha vermelha embaixo, no tom do LED da mesa.
    ctx.fillStyle = '#ff1e1e'
    ctx.fillRect(0, height - 6, width, 6)
  })
  return { ...result, state }
}

/** Quebra o texto em linhas que cabem na largura. */
function wrap(ctx: CanvasRenderingContext2D, text: string, _x: number, _y: number, width: number, _lineHeight: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > width && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** Mousepad grande, escuro, com traços de fogo em vermelho, laranja e roxo. */
export function createMousepadTexture() {
  return canvasTexture(2048, 800, (ctx) => {
    const { width, height } = ctx.canvas
    const random = seeded(31)
    ctx.fillStyle = '#140a0c'
    ctx.fillRect(0, 0, width, height)
    const colors = ['#7a1a14', '#a8361c', '#d0612a', '#4a2350', '#5c1020']
    ctx.lineCap = 'round'
    for (let i = 0; i < 140; i++) {
      const x = random() * width
      const y = height * (0.35 + random() * 0.75)
      ctx.strokeStyle = colors[Math.floor(random() * colors.length)]
      ctx.globalAlpha = 0.18 + random() * 0.35
      ctx.lineWidth = 3 + random() * 14
      ctx.beginPath()
      ctx.moveTo(x, y)
      // Labaredas: sobem curvando de um lado para o outro.
      const rise = 120 + random() * 380
      const bend = (random() - 0.5) * 260
      ctx.bezierCurveTo(x + bend, y - rise * 0.4, x - bend, y - rise * 0.7, x + bend * 0.5, y - rise)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.2, width / 2, height / 2, width * 0.6)
    vignette.addColorStop(0, 'rgb(0 0 0 / 0)')
    vignette.addColorStop(1, 'rgb(0 0 0 / 0.55)')
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, width, height)
    // Costura da borda.
    ctx.strokeStyle = '#050304'
    ctx.lineWidth = 14
    ctx.strokeRect(7, 7, width - 14, height - 14)
  })
}

/** Tela do celular deitado na mesa: relógio e atalhos de contato. */
export function createPhoneTexture() {
  return canvasTexture(480, 1040, (ctx) => {
    const { width, height } = ctx.canvas
    const glow = ctx.createLinearGradient(0, 0, 0, height)
    glow.addColorStop(0, '#1a0607')
    glow.addColorStop(0.6, '#070708')
    glow.addColorStop(1, '#000')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#ededed'
    ctx.textAlign = 'center'
    ctx.font = `300 150px ${SANS}`
    ctx.fillText('21:47', width / 2, 290)
    ctx.globalAlpha = 0.6
    ctx.font = `400 34px ${SANS}`
    ctx.fillText('{ contato }', width / 2, 350)
    ctx.globalAlpha = 1
    const apps = ['GitHub', 'LinkedIn', 'E-mail']
    apps.forEach((app, index) => {
      const y = 560 + index * 130
      ctx.fillStyle = 'rgb(255 255 255 / 0.08)'
      roundRect(ctx, 50, y, width - 100, 100, 28)
      ctx.fill()
      ctx.fillStyle = '#ededed'
      ctx.textAlign = 'left'
      ctx.font = `500 40px ${SANS}`
      ctx.fillText(app, 90, y + 64)
      ctx.textAlign = 'right'
      ctx.fillText('→', width - 90, y + 64)
    })
  })
}

export interface ScreenSlide {
  title: string
  tag: string
  image: HTMLImageElement
}

/**
 * Tela do monitor: as capas dos projetos passando uma a uma, com o nome embaixo.
 * `draw(from, to, mix)` desenha a passagem de uma capa para a outra.
 */
export function createScreenTexture() {
  const state = { slides: [] as ScreenSlide[], from: 0, to: 0, mix: 0 }
  const result = canvasTexture(1280, 720, (ctx) => {
    const { width, height } = ctx.canvas
    ctx.fillStyle = '#060607'
    ctx.fillRect(0, 0, width, height)
    if (!state.slides.length) {
      ctx.fillStyle = '#ededed'
      ctx.globalAlpha = 0.5
      ctx.textAlign = 'center'
      ctx.font = `400 34px ${MONO}`
      ctx.fillText('carregando projetos…', width / 2, height / 2)
      ctx.globalAlpha = 1
      return
    }
    const drawSlide = (slide: ScreenSlide, alpha: number) => {
      ctx.globalAlpha = alpha
      const { image } = slide
      const scale = Math.max(width / image.width, height / image.height)
      ctx.drawImage(image, (width - image.width * scale) / 2, 0, image.width * scale, image.height * scale)
      const shade = ctx.createLinearGradient(0, height * 0.55, 0, height)
      shade.addColorStop(0, 'rgb(0 0 0 / 0)')
      shade.addColorStop(1, 'rgb(0 0 0 / 0.85)')
      ctx.fillStyle = shade
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#ededed'
      ctx.textAlign = 'left'
      ctx.font = `400 26px ${MONO}`
      ctx.globalAlpha = alpha * 0.7
      ctx.fillText(slide.tag, 56, height - 112)
      ctx.globalAlpha = alpha
      ctx.font = `600 58px ${SANS}`
      ctx.fillText(slide.title, 56, height - 52)
    }
    drawSlide(state.slides[state.from], 1)
    if (state.mix > 0) drawSlide(state.slides[state.to], state.mix)
    ctx.globalAlpha = 1
    // Barra de cima, como uma janela aberta.
    ctx.fillStyle = 'rgb(0 0 0 / 0.55)'
    ctx.fillRect(0, 0, width, 44)
    ctx.fillStyle = '#ededed'
    ctx.globalAlpha = 0.65
    ctx.font = `400 22px ${MONO}`
    ctx.fillText('~/projetos', 24, 29)
    ctx.textAlign = 'right'
    ctx.fillText(`${state.to + 1} / ${state.slides.length}`, width - 24, 29)
    ctx.globalAlpha = 1
  })
  return { ...result, state }
}

export function loadImage(url: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image()
    // Fotos de outros sites (o avatar do GitHub) só entram no canvas com CORS liberado.
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}
