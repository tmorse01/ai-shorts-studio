// The Media grid tile: its variants by media kind, its status icon, and the badge wording. The tile is
// rendered to static markup, so these run in the node environment without a DOM.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { newAnalysisRecord, withStageStatus } from '@shared/analysis/analysis'
import { MediaTile, type MediaTileProps } from '@renderer/features/media/MediaTile'
import { momentsBadge, shortsBadge, tileStatus } from '@renderer/features/media/mediaTileModel'
import { activeFilterCount, EMPTY_MEDIA_FILTER } from '@renderer/features/media/mediaView'

const THUMB = { src: 'data:image/jpeg;base64,AAAA', width: 320, height: 180 }

function tile(overrides: Partial<MediaTileProps> = {}): string {
  const props: MediaTileProps = {
    fileName: 'clip-a.mp4',
    kind: 'video',
    durationMs: 5000,
    thumb: null,
    tagNames: [],
    selected: false,
    status: { kind: 'none' },
    shortCount: 0,
    momentCount: 0,
    momentsOpen: false,
    onToggleMoments: () => {},
    itemProps: {},
    ...overrides
  }
  return renderToStaticMarkup(createElement(MediaTile, props))
}

describe('media tile variants', () => {
  it('shows a video thumbnail image with its duration and name', () => {
    const html = tile({ thumb: THUMB })
    expect(html).toContain(`<img`)
    expect(html).toContain(`src="${THUMB.src}"`)
    expect(html).toContain('data-kind="video"')
    expect(html).toContain('0:05')
    expect(html).toContain('clip-a.mp4')
  })

  it('shows a film placeholder and no image while a video has no thumbnail', () => {
    const html = tile({ thumb: null })
    expect(html).not.toContain('<img')
    expect(html).toContain('0:05')
  })

  it('shows an audio file with its name and a waveform when one is cached', () => {
    const withWave = tile({
      kind: 'audio',
      fileName: 'song.mp3',
      thumb: { ...THUMB, src: 'data:image/png;base64,BBBB' }
    })
    expect(withWave).toContain('data-kind="audio"')
    expect(withWave).toContain('song.mp3')
    expect(withWave).toContain('data:image/png;base64,BBBB')

    const withoutWave = tile({ kind: 'audio', fileName: 'song.mp3', thumb: null })
    expect(withoutWave).not.toContain('<img')
    expect(withoutWave).toContain('song.mp3')
  })

  it('shows an image file as the image itself', () => {
    const html = tile({ kind: 'image', fileName: 'still.png', durationMs: undefined, thumb: THUMB })
    expect(html).toContain(`src="${THUMB.src}"`)
    expect(html).toContain('still.png')
  })

  it('gives the tile a tooltip with the full file name and its tags', () => {
    const html = tile({ fileName: 'a-very-long-camera-file-name.mp4', tagNames: ['Intro', 'Wide'] })
    expect(html).toContain('title="a-very-long-camera-file-name.mp4\nTags: Intro, Wide"')
  })
})

describe('media tile status icon', () => {
  it('shows nothing for a ready file', () => {
    const html = tile({ status: { kind: 'none' } })
    expect(html).not.toContain('role="img"')
  })

  it('shows a spinner labelled with the busy state while analysing', () => {
    const html = tile({ status: { kind: 'busy', label: 'Analyzing' } })
    expect(html).toContain('role="img" aria-label="Analyzing"')
    expect(html).toContain('data-status="busy"')
  })

  it('shows a failed icon whose label carries the reason, and offers Retry in the tile menu', () => {
    const html = tile({
      status: { kind: 'failed', reason: 'The vision check timed out' },
      onRetry: () => {}
    })
    expect(html).toContain('aria-label="Analysis failed: The vision check timed out"')
    expect(html).toContain('data-status="failed"')
    expect(html).toContain('aria-label="More actions for clip-a.mp4"')
  })

  it('offers no menu when the tile has nothing to retry', () => {
    const html = tile({ status: { kind: 'failed', reason: 'boom' } })
    expect(html).not.toContain('More actions for')
  })

  it('maps analysis records to a status', () => {
    const record = newAnalysisRecord('m1')
    expect(tileStatus(undefined)).toEqual({ kind: 'none' })
    expect(tileStatus(record)).toEqual({ kind: 'busy', label: 'Waiting to analyze' })
    expect(tileStatus(withStageStatus(record, 'transcript', 'running'))).toEqual({
      kind: 'busy',
      label: 'Analyzing'
    })
    const failed = withStageStatus(record, 'shots', 'failed', { message: 'Out of memory' })
    expect(tileStatus(failed)).toEqual({ kind: 'failed', reason: 'Out of memory' })
    const done = {
      ...record,
      stages: {
        transcript: { status: 'done' as const },
        shots: { status: 'done' as const },
        vision: { status: 'done' as const }
      }
    }
    // A finished clip shows the 'analysed' mark (#310).
    expect(tileStatus(done)).toEqual({ kind: 'analysed' })
  })
})

describe('media tile badges', () => {
  it('shows usage and moments badges with their wording', () => {
    const html = tile({ shortCount: 1, momentCount: 2, momentsOpen: false })
    expect(html).toContain('1 short')
    expect(html).toContain('2 moments')
    expect(html).toContain('aria-expanded="false"')
  })

  it('leaves out the badges that do not apply', () => {
    const html = tile({ shortCount: 0, momentCount: 0 })
    expect(html).not.toContain('short')
    expect(html).not.toContain('moment')
  })

  it('words the badges for counts', () => {
    expect(shortsBadge(1)).toBe('1 short')
    expect(shortsBadge(3)).toBe('3 shorts')
    expect(momentsBadge(1)).toBe('1 moment')
    expect(momentsBadge(4)).toBe('4 moments')
  })
})

describe('active filter count', () => {
  it('counts types, tags and the duration range, but not the search text', () => {
    expect(activeFilterCount(EMPTY_MEDIA_FILTER)).toBe(0)
    expect(activeFilterCount({ ...EMPTY_MEDIA_FILTER, query: 'clip' })).toBe(0)
    expect(
      activeFilterCount({
        query: '',
        kinds: ['video', 'audio'],
        tagIds: ['t1'],
        minDurationSec: 2,
        maxDurationSec: 9
      })
    ).toBe(4)
  })
})
