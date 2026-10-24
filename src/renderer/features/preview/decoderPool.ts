// A small pool of video elements that decode the footage for the preview. Each element holds one
// source URL. Asking for a source that is already in the pool reuses its element. When the pool is
// full, the least recently used element is given the new source. Generic over the element shape, so
// the rules are tested with plain objects instead of a DOM.

export interface PoolVideo {
  src: string
  currentTime: number
  readonly readyState: number
  readonly paused: boolean
  play(): unknown
  pause(): void
}

interface Slot<V> {
  element: V
  src: string | null
  lastUsed: number
}

export class DecoderPool<V extends PoolVideo> {
  private readonly slots: Slot<V>[] = []
  private clock = 0

  constructor(
    private readonly create: () => V,
    readonly capacity: number
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('A decoder pool needs at least one element')
    }
  }

  // The element that holds `src`, loading it into the least recently used element when needed.
  acquire(src: string): V {
    this.clock += 1
    let slot = this.slots.find((candidate) => candidate.src === src)
    if (!slot) {
      if (this.slots.length < this.capacity) {
        slot = { element: this.create(), src: null, lastUsed: 0 }
        this.slots.push(slot)
      } else {
        slot = this.slots.reduce((least, candidate) =>
          candidate.lastUsed < least.lastUsed ? candidate : least
        )
      }
      slot.src = src
      slot.element.src = src
    }
    slot.lastUsed = this.clock
    return slot.element
  }

  // The source an element currently holds, or null when the pool has not loaded it yet.
  sourceOf(element: V): string | null {
    return this.slots.find((slot) => slot.element === element)?.src ?? null
  }
}
