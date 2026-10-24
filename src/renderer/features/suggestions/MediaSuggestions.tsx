// The AI suggestions for the selected clip, in the Media panel: tag suggestions and candidate moments, each
// with Accept and Dismiss, and Accept all for the lot. Lavender marks what the AI proposed. Nothing is
// applied until the user accepts: accepting runs one project command, so one undo takes it back.
import { useEffect, useState, type JSX } from 'react'
import { Sparkles } from 'lucide-react'
import {
  momentSuggestionKey,
  tagSuggestionKey,
  type MomentSuggestion,
  type SuggestionsOutput
} from '@shared/analysis/suggestions'
import type { MediaRef, Project } from '@shared/project/schema'
import { Button } from '@renderer/ui/Button'
import { applyProjectCommand } from '../shorts/shortActions'
import { formatDuration } from '../media/mediaView'
import { acceptSuggestionsCommand } from './suggestionCommands'
import { openSuggestions } from './suggestionView'
import { dismissSuggestions, findMoments, readSuggestions } from './suggestionSync'
import styles from './MediaSuggestions.module.css'

interface MediaSuggestionsProps {
  folderPath: string
  project: Project
  ref: MediaRef
  /** Changes when the clip's analysis changes, so the suggestions are read again. */
  analysisState: string
}

export function MediaSuggestions({
  folderPath,
  project,
  ref,
  analysisState
}: MediaSuggestionsProps): JSX.Element | null {
  const [data, setData] = useState<SuggestionsOutput | null>(null)
  const [busy, setBusy] = useState(false)
  const mediaId = ref.id

  useEffect(() => {
    let live = true
    setData(null)
    void readSuggestions(window.api, folderPath, mediaId).then((next) => {
      if (live) setData(next)
    })
    return () => {
      live = false
    }
  }, [folderPath, mediaId, analysisState])

  if (!data) return null

  const open = openSuggestions(project, mediaId, data)
  const total = open.tags.length + open.moments.length

  const accept = (tags: string[], moments: MomentSuggestion[]) => {
    applyProjectCommand(
      acceptSuggestionsCommand({ mediaId, tags, moments, newId: () => crypto.randomUUID() })
    )
  }

  const dismiss = async (keys: string[]) => {
    setBusy(true)
    const next = await dismissSuggestions(window.api, folderPath, mediaId, keys)
    setBusy(false)
    if (next) setData(next)
  }

  const find = async () => {
    setBusy(true)
    const next = await findMoments(window.api, folderPath, ref)
    setBusy(false)
    if (next) setData(next)
  }

  return (
    <section className={styles.section} aria-label="AI suggestions for this clip">
      <div className={styles.header}>
        <span className={styles.label}>
          <Sparkles size={12} strokeWidth={1.75} aria-hidden="true" />
          AI suggested
        </span>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void find()}>
          Find moments
        </Button>
        <button
          type="button"
          className={styles.accent}
          disabled={busy || total === 0}
          onClick={() => accept(open.tags, open.moments)}
        >
          Accept all
        </button>
      </div>

      {total === 0 ? (
        <p className={styles.empty}>
          No open suggestions. Analyze the clip for tags, or find moments to have Claude read its
          transcript and shots.
        </p>
      ) : null}

      {open.tags.length > 0 ? (
        <ul className={styles.list}>
          {open.tags.map((name) => (
            <li key={tagSuggestionKey(name)} className={styles.row}>
              <span className={styles.chip}>{name}</span>
              <span className={styles.meta}>Tag</span>
              <span className={styles.actions}>
                <button
                  type="button"
                  className={styles.accent}
                  disabled={busy}
                  onClick={() => accept([name], [])}
                >
                  Accept
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void dismiss([tagSuggestionKey(name)])}
                >
                  Dismiss
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {open.moments.length > 0 ? (
        <ul className={styles.list}>
          {open.moments.map((moment) => (
            <li key={momentSuggestionKey(moment)} className={styles.momentRow}>
              <span className={styles.momentName}>
                <span className={styles.label}>AI suggested</span>
                {moment.name}
              </span>
              <span className={styles.meta}>
                {formatDuration(moment.inMs)} to {formatDuration(moment.outMs)}
              </span>
              {moment.note ? <span className={styles.note}>{moment.note}</span> : null}
              <span className={styles.actions}>
                <button
                  type="button"
                  className={styles.accent}
                  disabled={busy}
                  onClick={() => accept([], [moment])}
                >
                  Accept
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => void dismiss([momentSuggestionKey(moment)])}
                >
                  Dismiss
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
