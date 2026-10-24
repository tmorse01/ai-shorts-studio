import { useState, type JSX } from 'react'
import { Bell, Pencil, Play, Scissors, Trash2 } from 'lucide-react'
import { APP_NAME } from '@shared/app'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { Dialog } from '../ui/Dialog'
import { DropdownMenu } from '../ui/DropdownMenu'
import { Tooltip } from '../ui/Tooltip'
import { Tabs } from '../ui/Tabs'
import { Switch } from '../ui/Switch'
import { toast } from '../features/toasts/toast'
import { ErrorDemo } from '../features/errors/ErrorDemo'
import { TimelinePane } from '../features/timeline/TimelinePane'
import type { Timeline } from '@shared/timeline/timeline'
import styles from './UiReviewPage.module.css'

const aspectOptions = [
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '1:1', label: '1:1' }
]

// The timeline gallery starts empty, so every lane shows its Add action.
const EMPTY_DEMO_TIMELINE: Timeline = { tracks: [] }

// Dev-only sheet that shows every UI primitive and its states, for visual review (#21).
export function UiReviewPage(): JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [aspect, setAspect] = useState('9:16')
  const [captions, setCaptions] = useState(true)
  const [demoTimeline, setDemoTimeline] = useState<Timeline>(EMPTY_DEMO_TIMELINE)

  return (
    <main className={styles.page}>
      <header>
        <h1 className={styles.display}>{APP_NAME}</h1>
        <p className={styles.muted}>UI primitives. Visual review sheet.</p>
      </header>

      <section className={styles.section} aria-labelledby="buttons-heading">
        <h2 id="buttons-heading" className={styles.heading}>
          Buttons
        </h2>
        <div className={styles.row}>
          <Button variant="primary">Export</Button>
          <Button variant="secondary">Import</Button>
          <Button variant="ai">Find clips</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="ghost">Cancel</Button>
        </div>
        <div className={styles.row}>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <Button variant="secondary" size="sm">
            Small
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="ai" loading>
            Analysing
          </Button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="icon-heading">
        <h2 id="icon-heading" className={styles.heading}>
          Icon buttons
        </h2>
        <div className={styles.row}>
          <IconButton icon={Play} label="Play" />
          <IconButton icon={Scissors} label="Split clip" variant="secondary" />
          <IconButton icon={Pencil} label="Rename" />
          <IconButton icon={Trash2} label="Delete" disabled />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="fields-heading">
        <h2 id="fields-heading" className={styles.heading}>
          Fields
        </h2>
        <div className={styles.fields}>
          <Input placeholder="Project name" aria-label="Project name" />
          <Select
            aria-label="Aspect ratio"
            options={aspectOptions}
            value={aspect}
            onValueChange={setAspect}
          />
          <Switch checked={captions} onCheckedChange={setCaptions}>
            Auto captions
          </Switch>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="overlays-heading">
        <h2 id="overlays-heading" className={styles.heading}>
          Overlays
        </h2>
        <div className={styles.row}>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <DropdownMenu
            trigger={<Button variant="secondary">More</Button>}
            items={[
              { label: 'Rename', onSelect: () => undefined },
              { label: 'Duplicate', onSelect: () => undefined },
              { label: 'Delete short', onSelect: () => undefined, destructive: true }
            ]}
          />
          <Tooltip content="Notifications">
            <IconButton icon={Bell} label="Notifications" />
          </Tooltip>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Delete short"
          description="This removes the short and its history. It cannot be undone."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => setDialogOpen(false)}>
                Delete
              </Button>
            </>
          }
        />
      </section>

      <section className={styles.section} aria-labelledby="toasts-heading">
        <h2 id="toasts-heading" className={styles.heading}>
          Toasts and errors
        </h2>
        <div className={styles.row}>
          <Button
            variant="ghost"
            onClick={() =>
              toast.info({ title: 'Export queued', description: 'It starts shortly.' })
            }
          >
            Info toast
          </Button>
          <Button
            variant="ghost"
            onClick={() => toast.success({ title: 'Saved', description: 'Your short was saved.' })}
          >
            Success toast
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast.ai({ title: 'Found 4 clips', description: 'Suggested from your footage.' })
            }
          >
            AI toast
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              toast.error({
                title: 'Export failed',
                description: 'The disk is full. Free some space and try again.',
                details: 'ENOSPC: no space left on device, write C:\\Shorts\\out.mp4'
              })
            }
          >
            Error toast
          </Button>
        </div>
        <div className={styles.row}>
          <ErrorDemo />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="tabs-heading">
        <h2 id="tabs-heading" className={styles.heading}>
          Tabs
        </h2>
        <Tabs
          aria-label="Tool panels"
          items={[
            { value: 'media', label: 'Media', content: <p>Footage and imports.</p> },
            { value: 'clips', label: 'AI clips', content: <p>Suggested clips.</p> },
            { value: 'captions', label: 'Captions', content: <p>Caption styling.</p> }
          ]}
        />
      </section>

      <section className={styles.section} aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className={styles.heading}>
          Timeline
        </h2>
        <div style={{ height: 320 }}>
          <TimelinePane
            timeline={demoTimeline}
            target={{ minMs: 30_000, maxMs: 60_000 }}
            onEdit={(_label, edit) => setDemoTimeline((current) => edit(current))}
          />
        </div>
      </section>
    </main>
  )
}
