import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { AudioWaveform, Check, Cpu, Film, HardDrive, Minus, X, type LucideIcon } from 'lucide-react'
import {
  ANALYSIS_EDGES,
  ANALYSIS_STAGES,
  edgeState,
  type EdgeState,
  type StageDef,
  type StageStatus,
  type TechId
} from '../../shared/pipeline-graph'
import styles from './PipelineGraph.module.css'

/** Node and grid sizes in CSS pixels, before the graph is scaled to fit its container. */
const NODE_W = 156
const NODE_H = 124
const COL_GAP = 64
const ROW_GAP = 36
const COLS = Math.max(...ANALYSIS_STAGES.map((s) => s.col)) + 1
const GRAPH_W = COLS * NODE_W + (COLS - 1) * COL_GAP
const GRAPH_H = 2 * NODE_H + ROW_GAP

const TECH_LABEL: Record<TechId, string> = {
  parakeet: 'Parakeet',
  ffmpeg: 'FFmpeg',
  claude: 'Claude',
  cpu: 'Local processing',
  disk: 'Your library'
}

const TECH_ICON: Record<Exclude<TechId, 'claude'>, LucideIcon> = {
  parakeet: AudioWaveform,
  ffmpeg: Film,
  cpu: Cpu,
  disk: HardDrive
}

/** Eight rays around a centre. Its own mark rather than Anthropic's logo, so swap the asset if the brand needs it. */
function ClaudeMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1="12" y1="3" x2="12" y2="8.5" transform={`rotate(${i * 45} 12 12)`} />
      ))}
    </svg>
  )
}

function TechIcon({ tech, active }: { tech: TechId; active: boolean }) {
  const label = TECH_LABEL[tech]
  const Icon = tech === 'claude' ? null : TECH_ICON[tech]
  return (
    <span
      className={styles.icon}
      data-tech={tech}
      data-active={active}
      role="img"
      aria-label={label}
      title={label}
    >
      {Icon ? <Icon size={20} strokeWidth={2} aria-hidden="true" /> : <ClaudeMark />}
    </span>
  )
}

function StateMark({ state }: { state: StageStatus['state'] }) {
  if (state === 'done')
    return (
      <span className={styles.mark}>
        <Check size={11} strokeWidth={3} aria-hidden="true" />
      </span>
    )
  if (state === 'failed')
    return (
      <span className={styles.mark} data-kind="failed">
        <X size={11} strokeWidth={3} aria-hidden="true" />
      </span>
    )
  if (state === 'skipped')
    return (
      <span className={styles.mark} data-kind="skipped">
        <Minus size={11} strokeWidth={3} aria-hidden="true" />
      </span>
    )
  return null
}

/** Top-left corner of a node on the canvas. Rows 0, 0.5 and 1 are the top lane, the middle and the bottom lane. */
function nodeX(col: number): number {
  return col * (NODE_W + COL_GAP)
}
function nodeY(row: number): number {
  return row * (NODE_H + ROW_GAP)
}

/** A smooth S-curve from the right edge of one node to the left edge of the next. */
function edgePath(from: StageDef, to: StageDef): string {
  const x1 = nodeX(from.col) + NODE_W
  const y1 = nodeY(from.row) + NODE_H / 2
  const x2 = nodeX(to.col)
  const y2 = nodeY(to.row) + NODE_H / 2
  const k = (x2 - x1) * 0.5
  return `M${x1} ${y1} C${x1 + k} ${y1} ${x2 - k} ${y2} ${x2} ${y2}`
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (): void => setReduce(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return reduce
}

/** Scales the fixed-size canvas down so the whole graph fits any width, and never scales it up. */
function useFitScale(): [RefObject<HTMLDivElement>, number] {
  const frame = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = (): void => setScale(Math.min(1, el.clientWidth / GRAPH_W))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [frame, scale]
}

interface PipelineGraphProps {
  stages: StageStatus[]
}

/**
 * The clip pipeline drawn as nodes and edges. Each node shows its technology, its state and a detail line.
 * Edges carry the AI gradient while data flows across them, with a particle travelling along each active one.
 */
export function PipelineGraph({ stages }: PipelineGraphProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const reduce = usePrefersReducedMotion()
  const [frame, scale] = useFitScale()
  const byId = new Map(stages.map((s) => [s.id, s]))
  const defById = new Map(ANALYSIS_STAGES.map((d) => [d.id, d]))
  const pathId = (from: string, to: string): string => `${uid}-${from}-${to}`

  return (
    <div className={styles.frame} ref={frame} style={{ height: GRAPH_H * scale }}>
      <div className={styles.aurora} aria-hidden="true" />
      <div
        className={styles.canvas}
        role="group"
        aria-label="Clip pipeline"
        style={{ width: GRAPH_W, height: GRAPH_H, transform: `scale(${scale})` }}
      >
        <svg className={styles.svg} width={GRAPH_W} height={GRAPH_H} aria-hidden="true">
          <defs>
            <linearGradient
              id={`${uid}-ai`}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2={GRAPH_W}
              y2="0"
            >
              <stop offset="0" style={{ stopColor: 'var(--ai-from)' }} />
              <stop offset="0.5" style={{ stopColor: 'var(--ai-mid)' }} />
              <stop offset="1" style={{ stopColor: 'var(--ai-to)' }} />
            </linearGradient>
          </defs>

          {/* Every edge's track is drawn first, so it doubles as the motion path for the particles. */}
          {ANALYSIS_EDGES.map((edge) => {
            const from = defById.get(edge.from)
            const to = defById.get(edge.to)
            if (!from || !to) return null
            const state: EdgeState = edgeState(
              byId.get(edge.from)?.state ?? 'pending',
              byId.get(edge.to)?.state ?? 'pending'
            )
            const d = edgePath(from, to)
            const id = pathId(edge.from, edge.to)
            return (
              <g key={id} data-edge-state={state}>
                <path id={id} d={d} className={styles.track} />
                {state === 'done' && (
                  <path d={d} className={styles.done} stroke={`url(#${uid}-ai)`} />
                )}
                {state === 'active' && (
                  <>
                    <path d={d} className={styles.glow} stroke={`url(#${uid}-ai)`} />
                    <path d={d} className={styles.flow} stroke={`url(#${uid}-ai)`} />
                    {!reduce && <Particles pathRef={`#${id}`} />}
                  </>
                )}
              </g>
            )
          })}
        </svg>

        {ANALYSIS_STAGES.map((def) => {
          const status = byId.get(def.id) ?? { id: def.id, state: 'pending' as const, detail: null }
          const detail = status.detail ?? (status.state === 'pending' ? 'Waiting' : '')
          return (
            <div
              key={def.id}
              className={styles.node}
              data-state={status.state}
              style={{ left: nodeX(def.col), top: nodeY(def.row), width: NODE_W, height: NODE_H }}
            >
              <div className={styles.head}>
                <TechIcon tech={def.tech} active={status.state === 'running'} />
                <StateMark state={status.state} />
              </div>
              <div className={styles.label}>{def.label}</div>
              <div className={styles.detail}>{detail}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Two dots of light that travel along an active edge. Rendered only when motion is allowed. */
function Particles({ pathRef }: { pathRef: string }) {
  return (
    <>
      {[0, 0.65].map((begin) => (
        <circle key={begin} r="3.5" className={styles.particle}>
          <animateMotion dur="1.3s" repeatCount="indefinite" begin={`${begin}s`}>
            <mpath href={pathRef} />
          </animateMotion>
        </circle>
      ))}
    </>
  )
}
