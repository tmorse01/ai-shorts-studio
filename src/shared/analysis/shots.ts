// Turns scene cut times into shot ranges and picks the frames to sample from each shot. Pure, so the
// rules are tested without FFmpeg. The FFmpeg calls that feed these functions live in main.
import type { ShotRange } from './analysis'

export interface ShotRules {
  /** ffmpeg scene score from 0 to 1. A frame that differs this much from the one before is a cut. */
  sceneThreshold: number
  /** Cuts closer together than this are dropped, so a flash does not make a one-frame shot. */
  minShotSec: number
  /** Shots longer than this are split, so long B-roll without cuts still gets described. */
  maxShotSec: number
}

export const DEFAULT_SHOT_RULES: ShotRules = {
  sceneThreshold: 0.3,
  minShotSec: 1.5,
  maxShotSec: 10
}

// Shots at least this long get three sampled frames. Shorter ones get two.
const LONG_SHOT_SEC = 4

const round3 = (value: number): number => Math.round(value * 1000) / 1000

/**
 * The cut times ffmpeg's showinfo filter printed, read from its log text. Each showinfo line names a
 * selected frame as pts_time:<seconds>.
 */
export function parseSceneCuts(log: string): number[] {
  const cuts: number[] = []
  for (const match of log.matchAll(/pts_time:(-?\d+(?:\.\d+)?)/g)) {
    const time = Number(match[1])
    if (Number.isFinite(time)) cuts.push(time)
  }
  return cuts
}

/**
 * Builds the shot ranges that cover the whole file. Cuts are sorted and de-duplicated. A cut that
 * would make a shot shorter than the minimum is dropped, a short tail is merged into the shot before
 * it, and a shot longer than the maximum is split into equal parts.
 */
export function buildShotRanges(
  cutTimes: readonly number[],
  durationSec: number,
  rules: ShotRules = DEFAULT_SHOT_RULES
): ShotRange[] {
  if (!(durationSec > 0)) return []

  const cuts = [...new Set(cutTimes)]
    .filter((time) => time > 0 && time < durationSec)
    .sort((a, b) => a - b)

  const cut: ShotRange[] = []
  let start = 0
  for (const time of cuts) {
    if (time - start < rules.minShotSec) continue
    cut.push({ startSec: start, endSec: time })
    start = time
  }
  cut.push({ startSec: start, endSec: durationSec })

  // A tail shorter than the minimum joins the shot before it. A file shorter than the minimum is one shot.
  if (cut.length > 1) {
    const last = cut[cut.length - 1]
    if (last.endSec - last.startSec < rules.minShotSec) {
      cut.pop()
      cut[cut.length - 1].endSec = durationSec
    }
  }

  return cut.flatMap((shot) => splitLongShot(shot, rules.maxShotSec))
}

function splitLongShot(shot: ShotRange, maxShotSec: number): ShotRange[] {
  const length = shot.endSec - shot.startSec
  if (length <= maxShotSec) return [shot]
  const parts = Math.ceil(length / maxShotSec)
  const step = length / parts
  return Array.from({ length: parts }, (_unused, index) => ({
    startSec: round3(shot.startSec + step * index),
    endSec: index === parts - 1 ? shot.endSec : round3(shot.startSec + step * (index + 1))
  }))
}

/** How many frames to sample from a shot: three for longer shots, two for short ones. */
export function frameCountFor(shot: ShotRange): number {
  return shot.endSec - shot.startSec >= LONG_SHOT_SEC ? 3 : 2
}

/** Evenly spaced times inside a shot, leaving out its first and last instants. */
export function frameTimesFor(shot: ShotRange): number[] {
  const count = frameCountFor(shot)
  const length = shot.endSec - shot.startSec
  return Array.from({ length: count }, (_unused, index) =>
    round3(shot.startSec + (length * (index + 1)) / (count + 1))
  )
}

/** File name for one sampled frame. Shot indexes are zero-padded so the folder sorts in time order. */
export function shotFrameName(shotIndex: number, frameIndex: number): string {
  return `shot-${String(shotIndex).padStart(4, '0')}-${frameIndex}.jpg`
}
