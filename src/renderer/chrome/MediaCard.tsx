import { useEffect, useState } from 'react'
import type { MediaView } from '../../shared/types'
import { fmt } from '../util'
import styles from './MediaCard.module.css'

const api = window.studio

/** Long names keep their start and their extension, with the middle replaced by "...". */
export function shortenMiddle(name: string, max = 24): string {
  if (name.length <= max) return name
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : ''
  const head = name.slice(0, max - ext.length - 4)
  return `${head}...${ext}`
}

export interface MediaCardProps {
  asset: MediaView
  selected: boolean
  clipCount: number
  /** Changes when posters are (re)generated, so images are requested again. */
  posterRev: number
  onSelect: (id: string) => void
}

export function MediaCard({ asset, selected, clipCount, posterRev, onSelect }: MediaCardProps) {
  const [posterFailed, setPosterFailed] = useState(false)
  // A new poster may have appeared since the last failure, so try again.
  useEffect(() => setPosterFailed(false), [posterRev])

  const isAudio = asset.kind === 'music' || asset.probe.videoCodec === 'none'
  const showPoster = !isAudio && !asset.missing && !posterFailed

  return (
    <button
      type="button"
      className={styles.card}
      aria-current={selected}
      title={asset.path}
      onClick={() => onSelect(asset.id)}
    >
      <div className={styles.thumb}>
        {showPoster ? (
          <img
            src={`${api.posterUrl(asset.id)}?v=${posterRev}`}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => setPosterFailed(true)}
          />
        ) : (
          <span className={styles.placeholder} aria-hidden="true">
            {isAudio ? '♪' : '▶'}
          </span>
        )}
        <span className={styles.duration}>{fmt(asset.probe.durationSec)}</span>
        {clipCount > 0 && <span className={styles.added}>Added</span>}
        {asset.missing && <span className={styles.missing}>Missing</span>}
      </div>
      <span className={styles.name}>{shortenMiddle(asset.name)}</span>
    </button>
  )
}
