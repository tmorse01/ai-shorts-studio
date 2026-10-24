import { describe, expect, it } from 'vitest'
import { buildRenderGraph } from '@shared/render/renderGraph'
import type { Clip, Timeline, Track } from '@shared/timeline/timeline'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

const SIZES: Record<string, { width: number; height: number }> = {
  'cam-a': { width: 1920, height: 1080 },
  'cam-b': { width: 1080, height: 1920 }
}
const sizeOf = (mediaId: string) => SIZES[mediaId] ?? null

function clip(
  id: string,
  mediaId: string,
  startMs: number,
  durationMs: number,
  extra: Partial<Clip> = {}
): Clip {
  return { id, mediaId, startMs, durationMs, sourceInMs: 0, transform: IDENTITY, ...extra }
}

function track(
  id: string,
  kind: Track['kind'],
  role: Track['role'],
  clips: Clip[],
  muted = false
): Track {
  return { id, kind, role, muted, clips }
}

// A single landscape clip with its sound, no framing and no transitions.
const singleCut: Timeline = {
  tracks: [track('main', 'video', 'main', [clip('c1', 'cam-a', 0, 4000, { sourceInMs: 1000 })])]
}

// Two portrait-framed clips joined by a crossfade, with a fade-in and a gain change.
const crossfadeFraming: Timeline = {
  tracks: [
    track('main', 'video', 'main', [
      clip('v1', 'cam-a', 0, 4000, { fadeInMs: 300 }),
      // The incoming clip's source starts 1 s in, so it has the handle the crossfade needs before its start.
      clip('v2', 'cam-b', 4000, 4000, {
        sourceInMs: 1000,
        gain: 0.8,
        framing: { mode: 'blurFit', x: 0, y: 0, scale: 1 }
      })
    ])
  ],
  transitions: [{ id: 't1', fromClipId: 'v1', toClipId: 'v2', durationMs: 400 }]
}

// A dip to black between two clips, a narration track over a music track that is ducked, and the music
// fading out at its end.
const dipDucked: Timeline = {
  tracks: [
    track('main', 'video', 'main', [
      clip('c1', 'cam-a', 0, 3000),
      clip('c2', 'cam-b', 3000, 3000, { sourceInMs: 500 })
    ]),
    track('vo', 'audio', 'narration', [clip('n1', 'vo', 500, 2000)]),
    track('bgm', 'audio', 'music', [clip('m1', 'bgm', 0, 6000, { fadeOutMs: 1000, gain: 0.5 })])
  ],
  transitions: [
    { id: 't1', fromClipId: 'c1', toClipId: 'c2', durationMs: 500, kind: 'dip-to-black' }
  ]
}

describe('buildRenderGraph', () => {
  it('returns an empty graph for a timeline with no clips', () => {
    const graph = buildRenderGraph({ tracks: [] })
    expect(graph.filterComplex).toBe('')
    expect(graph.videoLabel).toBeNull()
    expect(graph.audioLabel).toBeNull()
    expect(graph.durationMs).toBe(0)
  })

  it('lists each media item once, in the order it first appears', () => {
    const graph = buildRenderGraph(crossfadeFraming, { hasAudio: () => true })
    expect(graph.inputs).toEqual(['cam-a', 'cam-b'])
  })

  it('leaves out muted tracks and clips without sound', () => {
    const timeline: Timeline = {
      tracks: [
        track('main', 'video', 'main', [clip('c1', 'cam-a', 0, 2000)]),
        track('silent', 'video', 'overlay', [clip('o1', 'cam-b', 0, 2000)], true)
      ]
    }
    const graph = buildRenderGraph(timeline)
    expect(graph.inputs).toEqual(['cam-a'])
    expect(graph.filterComplex).not.toContain('cam-b')
    const noSound = buildRenderGraph(singleCut, { hasAudio: () => false })
    expect(noSound.audioLabel).toBeNull()
    expect(noSound.filterComplex).not.toContain('[0:a]')
  })

  it('maps a dip to black onto alpha and sound fades over the two halves of the window', () => {
    const graph = buildRenderGraph(dipDucked)
    // The window is centred on the cut at 3000 ms and lasts 500 ms: 2750 to 3250.
    expect(graph.filterComplex).toContain('fade=t=out:st=2.75:d=0.25:alpha=1')
    expect(graph.filterComplex).toContain('fade=t=in:st=3:d=0.25:alpha=1')
    expect(graph.filterComplex).toContain('afade=t=out:st=2.75:d=0.25')
    expect(graph.filterComplex).toContain('afade=t=in:st=3:d=0.25')
  })

  it('ducks the music track under narration and not the narration itself', () => {
    const graph = buildRenderGraph(dipDucked)
    const chains = graph.filterComplex.split(';')
    // The music clip (6 s long, from the bgm input) follows the envelope, which holds the drop from the
    // narration's attack point at 420 ms until its release point at 2900 ms.
    const music = chains.find((part) => part.includes('[3:a]'))
    const narration = chains.find((part) => part.includes('[2:a]'))
    expect(music).toContain("volume=volume='if(lt(t,0.5)")
    expect(music).toContain('eval=frame')
    expect(narration).toBeDefined()
    expect(narration).not.toContain('eval=frame')
  })

  it('draws a blurFit layer as a blurred, dimmed background under the fitted foreground', () => {
    const graph = buildRenderGraph(crossfadeFraming)
    expect(graph.filterComplex).toContain('gblur=sigma=40')
    expect(graph.filterComplex).toContain('colorchannelmixer=rr=0.65:gg=0.65:bb=0.65')
    expect(graph.filterComplex).toContain('crop=1080:1920')
  })

  it('mixes sound with amix and uses the fixed output labels', () => {
    const graph = buildRenderGraph(dipDucked)
    expect(graph.videoLabel).toBe('[vout]')
    expect(graph.audioLabel).toBe('[aout]')
    expect(graph.filterComplex).toContain('amix=inputs=')
    expect(graph.filterComplex).toContain('[vc1];[vc1]format=yuv420p,fps=30[vout]')
  })

  it('snapshots the graph for a single clip', () => {
    expect(buildRenderGraph(singleCut).filterComplex).toMatchSnapshot()
  })

  it('snapshots the graph for a crossfade with framing and fades', () => {
    expect(buildRenderGraph(crossfadeFraming).filterComplex).toMatchSnapshot()
  })

  it('snapshots the graph for a dip with ducked music', () => {
    expect(buildRenderGraph(dipDucked).filterComplex).toMatchSnapshot()
  })

  it('applies the equal-power curves of an overlap crossfade to both clips', () => {
    // Loop-to-fill: the second copy starts 400 ms before the first ends, so the cut is an overlap.
    const timeline: Timeline = {
      tracks: [
        track('bed', 'audio', 'music', [clip('a', 'bgm', 0, 4000), clip('b', 'bgm', 3600, 4000)])
      ],
      transitions: [{ id: 't1', fromClipId: 'a', toClipId: 'b', durationMs: 400 }]
    }
    const graph = buildRenderGraph(timeline)
    expect(graph.filterComplex).toContain('sin((t-3.6)/0.4*PI/2)')
    expect(graph.filterComplex).toContain('cos((t-3.6)/0.4*PI/2)')
  })

  it('uses the source size when it is known, through the compositor placement', () => {
    const unknown = buildRenderGraph(singleCut, { sizeOf: () => null })
    const known = buildRenderGraph(singleCut, { sizeOf })
    expect(unknown.filterComplex).toContain('scale=1080:1920')
    expect(known.filterComplex).toContain('scale=1080:608')
  })
})
