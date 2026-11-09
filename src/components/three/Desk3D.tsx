import { useEffect, useRef } from 'react'
import type { DeskObject } from '../../data/navigation'
import type { DeskStage, StagePoint } from '../../lib/desk/DeskStage'

interface Desk3DProps {
  /** Destaque vindo da lista do menu ou do teclado. */
  focus: number | null
  /** Objeto escolhido: a câmera mergulha nele antes da página abrir. */
  dive: number | null
  reducedMotion: boolean
  objects: DeskObject[]
  anchors: [number, number, number][]
  slides: { title: string; tag: string; image: string }[]
  onProject: (points: StagePoint[]) => void
  onHover: (index: number | null) => void
  onSelect: (index: number) => void
  onLoaded: () => void
}

export function Desk3D({ focus, dive, ...options }: Desk3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<DeskStage | null>(null)
  const focusRef = useRef(focus)
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  // O código da mesa só é baixado quando ela se aproxima da tela.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let cancelled = false
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        import('../../lib/desk/DeskStage').then(({ DeskStage }) => {
          if (cancelled) return
          const current = optionsRef.current
          // As funções passam por optionsRef: a cena não é recriada a cada render do React.
          stageRef.current = new DeskStage(container, {
            ...current,
            onProject: (points) => optionsRef.current.onProject(points),
            onHover: (index) => optionsRef.current.onHover(index),
            onSelect: (index) => optionsRef.current.onSelect(index),
            onLoaded: () => optionsRef.current.onLoaded(),
          })
          stageRef.current.setFocus(focusRef.current)
        })
      },
      { rootMargin: '100% 0px' },
    )
    observer.observe(container)
    return () => {
      cancelled = true
      observer.disconnect()
      stageRef.current?.dispose()
      stageRef.current = null
    }
  }, [options.reducedMotion])

  useEffect(() => {
    focusRef.current = focus
    stageRef.current?.setFocus(focus)
  }, [focus])

  useEffect(() => {
    if (dive !== null) stageRef.current?.diveInto(dive)
  }, [dive])

  return <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />
}
