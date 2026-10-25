import { describe, expect, it } from 'vitest'
import { buildRenderGraph, filterPath, stillInputOptions } from '@shared/render/renderGraph'
import type { Clip, Timeline, Track } from '@shared/timeline/timeline'

const IDENTITY = { x: 0, y: 0, scale: 1, rotationDeg: 0 }

const footage: Track = {
  id: 'main',
  kind: 'video',
  role: 'main',
  muted: false,
  clips: [
    { id: 'c1', mediaId: 'cam-a', startMs: 0, durationMs: 4000, sourceInMs: 0, transform: IDENTITY }
  ]
}

function overlayTimeline(imageItem: NonNullable<Clip['imageItem']>): Timeline {
  const logo: Clip = {
    id: 'i1',
    mediaId: 'logo',
    startMs: 500,
    durationMs: 3000,
    sourceInMs: 0,
    transform: IDENTITY,
    imageItem
  }
  return {
    tracks: [
      footage,
      { id: 'overlay', kind: 'overlay', role: 'overlay', muted: false, clips: [logo] }
    ]
  }
}

const sizeOf = (mediaId: string) =>
  mediaId === 'logo' ? { width: 400, height: 400 } : { width: 1920, height: 1080 }

describe('still image inputs', () => {
  it('loops an image overlay input for the timeline length and leaves footage alone', () => {
    const graph = buildRenderGraph(overlayTimeline({}), { sizeOf })
    const logo = graph.inputs.indexOf('logo')
    const cam = graph.inputs.indexOf('cam-a')
    expect(graph.inputOptions[logo]).toEqual(stillInputOptions(4000))
    expect(graph.inputOptions[logo]).toEqual(['-loop', '1', '-t', '4'])
    expect(graph.inputOptions[cam]).toEqual([])
  })
})

describe('image overlay motion in the graph', () => {
  it('drives the size and centre per frame with expressions, not a fixed placement', () => {
    const graph = buildRenderGraph(overlayTimeline({}), { sizeOf })
    expect(graph.filterComplex).toContain("scale=w='round(max(1,(")
    expect(graph.filterComplex).toContain(':eval=frame')
    expect(graph.filterComplex).toMatch(/overlay=x='round\(if\(lt\(t,/)
  })

  it('fades an entering picture with a geq alpha expression of T', () => {
    const graph = buildRenderGraph(overlayTimeline({ enter: 'fade', motionMs: 250 }), { sizeOf })
    expect(graph.filterComplex).toContain("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(")
    expect(graph.filterComplex).toContain('lt(T,')
  })

  it('leaves a static opaque picture without a geq step', () => {
    const graph = buildRenderGraph(overlayTimeline({}), { sizeOf })
    expect(graph.filterComplex).not.toContain('geq=')
  })
})

describe('ASS subtitles in the graph', () => {
  it('burns the script in above the layers when a path is given', () => {
    const graph = buildRenderGraph(overlayTimeline({}), {
      sizeOf,
      subtitlesPath: 'C:\\out\\Demo.mp4.subs.ass'
    })
    expect(graph.filterComplex).toContain("ass='C\\:/out/Demo.mp4.subs.ass'[vtext]")
    expect(graph.filterComplex).toContain('[vtext]format=yuv420p')
  })

  it('has no subtitle step without a path', () => {
    const graph = buildRenderGraph(overlayTimeline({}), { sizeOf })
    expect(graph.filterComplex).not.toContain('ass=')
  })
})

describe('filterPath', () => {
  it('escapes a drive colon and swaps backslashes for slashes', () => {
    expect(filterPath('C:\\Users\\me\\x.ass')).toBe("'C\\:/Users/me/x.ass'")
  })

  it('escapes a single quote in the name', () => {
    expect(filterPath("D:\\it's.ass")).toBe("'D\\:/it\\'s.ass'")
  })
})
