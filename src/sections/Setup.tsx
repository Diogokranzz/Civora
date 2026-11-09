import { useCallback, useEffect, useRef, useState } from 'react'
import type { MouseEvent } from 'react'
import { Desk3D } from '../components/three/Desk3D'
import { MODEL_CREDITS } from '../data/about'
import { SETUP_SPOTS } from '../data/navigation'
import { PROJECTS } from '../data/projects'
import { navigate } from '../hooks/useRoute'
import type { StagePoint } from '../lib/desk/DeskStage'

interface SetupProps {
  reducedMotion: boolean
}

const OBJECTS = SETUP_SPOTS.map((spot) => spot.object)
const ANCHORS = SETUP_SPOTS.map((spot) => spot.anchor)
const SLIDES = PROJECTS.map((project) => ({ title: project.title, tag: project.tag, image: project.cover }))
/** Metade da largura das etiquetas: elas não passam da borda da tela. */
const LABEL_MARGIN = 72
/** Mesmo tempo da cena: o destaque some só depois de um instante sem o mouse em cima. */
const LEAVE_MS = 320
/** A página abre no meio do mergulho da câmera; a troca de canal cobre o resto. */
const OPEN_DELAY_MS = 650
/**
 * Monitores e notebook: a câmera entra na tela (1,7 s em `DeskStage`), e a página abre quando a imagem
 * já ocupa a tela toda.
 */
const SCREEN_OPEN_DELAY_MS = 1450
const SCREEN_OBJECTS = new Set(['monitor', 'laptop'])
/** Celular: ele vem da mesa até a frente da câmera (1,6 s em `DeskStage`) e a página abre no fim. */
const PHONE_OPEN_DELAY_MS = 1400

const number = (index: number) => String(index + 1).padStart(2, '0')

/** Menu do site: a mesa do Diogo, em que cada objeto leva a uma parte do portfólio. */
export function Setup({ reducedMotion }: SetupProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const veilRef = useRef<HTMLDivElement>(null)
  const labelRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const [loaded, setLoaded] = useState(false)
  /** Objeto sob o mouse na cena. */
  const [hovered, setHovered] = useState<number | null>(null)
  /** Item da lista com o mouse ou o foco do teclado. */
  const [listed, setListed] = useState<number | null>(null)
  const [creditsOpen, setCreditsOpen] = useState(false)
  /** Objeto escolhido: a câmera mergulha nele e a página abre logo depois. */
  const [diving, setDiving] = useState<number | null>(null)
  const active = diving ?? listed ?? hovered
  const leaveTimer = useRef(0)

  // Entrar numa etiqueta vale na hora; sair espera um instante, para o destaque não piscar.
  const showListed = (index: number | null) => {
    window.clearTimeout(leaveTimer.current)
    if (index !== null) setListed(index)
    else leaveTimer.current = window.setTimeout(() => setListed(null), LEAVE_MS)
  }
  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])

  const choose = useCallback(
    (index: number) => {
      if (diving !== null) return
      setDiving(index)
      const { object } = SETUP_SPOTS[index]
      const delay =
        object === 'phone' ? PHONE_OPEN_DELAY_MS : SCREEN_OBJECTS.has(object) ? SCREEN_OPEN_DELAY_MS : OPEN_DELAY_MS
      window.setTimeout(() => navigate(SETUP_SPOTS[index].href), reducedMotion ? 0 : delay)
    },
    [diving, reducedMotion],
  )

  // As etiquetas seguem a câmera a cada quadro, direto no DOM, sem passar pelo estado do React.
  const handleProject = useCallback((points: StagePoint[]) => {
    const width = document.documentElement.clientWidth
    points.forEach((point, index) => {
      const label = labelRefs.current[index]
      if (!label) return
      const left = Math.min(Math.max(point.x, LABEL_MARGIN), width - LABEL_MARGIN)
      label.style.transform = `translate(${left}px, ${point.y}px) translate(-50%, -100%)`
    })
  }, [])
  const handleLoaded = useCallback(() => setLoaded(true), [])

  // Título e etiquetas só aparecem com a mesa no lugar; somem enquanto ela entra pela rolagem.
  useEffect(() => {
    const onScroll = () => {
      const rect = sectionRef.current?.getBoundingClientRect()
      const overlay = overlayRef.current
      if (!rect || !overlay) return
      const height = window.innerHeight
      const visible = Math.max(0, 1 - Math.max(rect.top / (height * 0.3), 0))
      overlay.style.opacity = String(visible)
      overlay.style.visibility = visible === 0 ? 'hidden' : 'visible'
      // Enquanto sobe, o topo da cena se desfaz em preto, sem borda reta.
      if (veilRef.current) veilRef.current.style.opacity = String(Math.min(Math.max(rect.top / (height * 0.15), 0), 1))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Ctrl+clique continua abrindo em outra aba; o clique normal passa pelo mergulho da câmera.
  const go = (event: MouseEvent<HTMLAnchorElement>, index: number) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return
    event.preventDefault()
    choose(index)
  }

  return (
    <section ref={sectionRef} id="setup" className="relative z-10 -mt-[40svh] h-svh min-h-140">
      {/* A borda de cima se desfaz em preto: o Home some atrás dela. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-full h-[30svh] bg-linear-to-t from-ink to-transparent" />
      <div className="sticky top-0 h-svh min-h-140 overflow-hidden bg-ink">
        <Desk3D
          focus={listed}
          dive={diving}
          reducedMotion={reducedMotion}
          objects={OBJECTS}
          anchors={ANCHORS}
          slides={SLIDES}
          onProject={handleProject}
          onHover={setHovered}
          onSelect={choose}
          onLoaded={handleLoaded}
        />

        <div
          ref={veilRef}
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-ink to-transparent"
        />

        {/* Durante o mergulho a interface sai da frente: só a câmera se move. */}
        <div ref={overlayRef} className={`transition-opacity duration-500 ${diving !== null ? 'opacity-0!' : ''}`}>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-2/5 bg-linear-to-b from-ink/70 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t from-ink to-transparent" />

          <div className="pointer-events-none absolute top-24 left-6 lg:top-28 lg:left-10">
            <p className="text-xs tracking-[0.18em] uppercase opacity-60">02 · Menu</p>
            <h2 className="mt-2 text-4xl font-semibold tracking-[-0.03em] min-[1800px]:text-6xl">Meu setup</h2>
          </div>
          {/* Instrução de uso, que muda com o tipo de tela: com mouse, passar por cima; no toque, tocar. */}
          <p className="pointer-events-none absolute top-24 right-6 hidden max-w-60 text-right text-sm leading-snug lg:top-28 lg:right-10 landscape:block">
            <span className="opacity-60">Cada objeto da mesa leva a uma parte do portfólio.</span>
            <span className="mt-2 flex items-center justify-end gap-2 text-xs tracking-[0.14em] uppercase">
              <span className="size-1.5 rounded-full bg-paper motion-safe:animate-blink" />
              <span className="pointer-coarse:hidden">Passe o mouse e clique</span>
              <span className="hidden pointer-coarse:inline">Toque em um objeto</span>
            </span>
          </p>

          {/* As etiquetas repetem a lista de baixo, que é a versão acessível do menu. */}
          <div
            aria-hidden="true"
            className={`hidden transition-opacity duration-500 landscape:block ${loaded ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          >
            {SETUP_SPOTS.map((spot, index) => (
              <a
                key={spot.href}
                ref={(element) => {
                  labelRefs.current[index] = element
                }}
                href={spot.href}
                tabIndex={-1}
                onClick={(event) => go(event, index)}
                onMouseEnter={() => showListed(index)}
                onMouseLeave={() => showListed(null)}
                className={`absolute top-0 left-0 flex flex-col items-center transition-opacity duration-300 will-change-transform ${
                  active !== null && active !== index ? 'opacity-35' : 'opacity-100'
                } ${active === index ? 'z-10' : ''}`}
              >
                {/* Em destaque, a etiqueta conta o que a página tem antes do clique. */}
                <span
                  className={`pointer-events-none absolute bottom-full mb-1.5 text-xs whitespace-nowrap transition-[opacity,translate] duration-300 [text-shadow:0_1px_8px_rgb(0_0_0/0.9)] ${
                    active === index ? 'translate-y-0 opacity-80' : 'translate-y-1 opacity-0'
                  }`}
                >
                  {spot.hint}
                </span>
                <span
                  className={`flex items-center gap-2 border px-3 py-1.5 text-sm whitespace-nowrap backdrop-blur-sm transition-colors duration-200 ${
                    active === index ? 'border-paper bg-paper text-ink' : 'border-paper/25 bg-ink/70'
                  }`}
                >
                  <span className="text-[10px] opacity-60">{number(index)}</span>
                  {spot.label}
                  <span
                    aria-hidden="true"
                    className={`transition-transform duration-200 ${active === index ? 'translate-x-0.5' : ''}`}
                  >
                    →
                  </span>
                </span>
                <span className="h-5 w-px bg-paper/40" />
                <span className="size-1.5 translate-y-1/2 rounded-full bg-paper" />
              </a>
            ))}
          </div>

          <div className="absolute inset-x-6 bottom-6 flex flex-col gap-3 lg:inset-x-10 lg:bottom-8 lg:flex-row lg:items-end lg:justify-between">
            <nav aria-label="Menu do setup">
              <ul className="flex flex-wrap gap-x-6 gap-y-1">
                {SETUP_SPOTS.map((spot, index) => (
                  <li key={spot.href}>
                    <a
                      href={spot.href}
                      onClick={(event) => go(event, index)}
                      onMouseEnter={() => showListed(index)}
                      onMouseLeave={() => showListed(null)}
                      onFocus={() => showListed(index)}
                      onBlur={() => showListed(null)}
                      className={`text-lg transition-opacity duration-200 outline-none ${
                        active === index ? 'opacity-100' : 'opacity-60'
                      }`}
                    >
                      <span className="mr-1.5 text-[10px] opacity-60">{number(index)}</span>
                      {spot.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Créditos dos modelos (CC BY 4.0) recolhidos num botão: ficam acessíveis sem disputar atenção. */}
            <div className="relative lg:text-right">
              <button
                type="button"
                aria-expanded={creditsOpen}
                aria-controls="setup-credits"
                onClick={() => setCreditsOpen((open) => !open)}
                className="text-[10px] tracking-[0.14em] uppercase opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100"
              >
                Créditos 3D {creditsOpen ? '−' : '+'}
              </button>
              <ul
                id="setup-credits"
                hidden={!creditsOpen}
                className="absolute bottom-full left-0 mb-2 w-max max-w-[80vw] border border-paper/15 bg-ink/90 px-3 py-2 text-[10px] leading-relaxed backdrop-blur-sm lg:right-0 lg:left-auto"
              >
                {MODEL_CREDITS.map((credit) => (
                  <li key={credit.url}>
                    <a
                      href={credit.url}
                      target="_blank"
                      rel="noreferrer"
                      className="opacity-70 hover:underline hover:opacity-100"
                    >
                      {credit.title} · {credit.author} · CC BY 4.0
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
