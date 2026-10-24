import type { JSX } from 'react'
import { Button } from '@renderer/ui/Button'
import { SliderNumberField } from '@renderer/ui/SliderNumberField'
import { Switch } from '@renderer/ui/Switch'
import { formatDb, parseDb } from '@renderer/ui/fieldMath'
import { DEFAULT_DUCKING } from '@shared/timeline/ducking'
import { useInspectorStore } from '../inspector/useInspectorStore'
import styles from './MusicSection.module.css'

// Reads a typed "250" or "250 ms" as milliseconds. Returns null for anything else.
function parseMs(text: string): number | null {
  const match = /^\s*(\d+(\.\d+)?)\s*(ms)?\s*$/i.exec(text)
  return match ? Number(match[1]) : null
}

function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`
}

// The inspector's music section (Epic 12, #125): loop to fill for the selected Music lane clip, and the
// auto-ducking settings for the short. Ducking is on when the amount is above zero. Each change is one
// undoable edit; a drag folds into one entry.
export function MusicSection(): JSX.Element {
  const target = useInspectorStore((state) => state.musicTarget)

  if (!target) {
    return <p className={styles.empty}>Select a clip on the Music lane to adjust it.</p>
  }

  const { ducking } = target
  const ducks = ducking.amountDb > 0
  return (
    <div className={styles.body}>
      <Button variant="secondary" disabled={!target.canLoop} onClick={() => target.loopToFill()}>
        Loop to fill
      </Button>
      <Switch
        checked={ducks}
        onCheckedChange={(on) =>
          target.applyDucking(on ? 'Turn on ducking' : 'Turn off ducking', {
            amountDb: on ? DEFAULT_DUCKING.amountDb : 0
          })
        }
      >
        Duck under narration
      </Switch>
      {ducks ? (
        <>
          <SliderNumberField
            label="Ducking amount"
            value={ducking.amountDb}
            min={0}
            max={24}
            step={0.5}
            format={formatDb}
            parse={parseDb}
            onChange={(amountDb) =>
              target.applyDucking('Change ducking amount', { amountDb }, 'ducking-amount')
            }
          />
          <SliderNumberField
            label="Ducking attack"
            value={ducking.attackMs}
            min={0}
            max={2000}
            step={10}
            format={formatMs}
            parse={parseMs}
            onChange={(attackMs) =>
              target.applyDucking('Change ducking attack', { attackMs }, 'ducking-attack')
            }
          />
          <SliderNumberField
            label="Ducking release"
            value={ducking.releaseMs}
            min={0}
            max={5000}
            step={10}
            format={formatMs}
            parse={parseMs}
            onChange={(releaseMs) =>
              target.applyDucking('Change ducking release', { releaseMs }, 'ducking-release')
            }
          />
        </>
      ) : null}
    </div>
  )
}
