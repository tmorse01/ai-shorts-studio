import type { CSSProperties, ReactNode } from 'react'
import {
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  type LucideIcon
} from 'lucide-react'
import type { PaneId } from '@shared/layout'
import { IconButton } from '@renderer/ui/IconButton'
import { ResizeHandle } from './ResizeHandle'
import { clampPaneSize } from './paneSizing'
import { useUiStore } from './useUiStore'
import styles from './PaneFrame.module.css'

interface PaneConfig {
  axis: 'x' | 'y'
  grow: 1 | -1
  edge: 'left' | 'right' | 'top'
  collapseIcon: LucideIcon
  expandIcon: LucideIcon
}

const PANE_CONFIG: Record<PaneId, PaneConfig> = {
  left: {
    axis: 'x',
    grow: 1,
    edge: 'right',
    collapseIcon: PanelLeftClose,
    expandIcon: PanelLeftOpen
  },
  right: {
    axis: 'x',
    grow: -1,
    edge: 'left',
    collapseIcon: PanelRightClose,
    expandIcon: PanelRightOpen
  },
  bottom: {
    axis: 'y',
    grow: -1,
    edge: 'top',
    collapseIcon: PanelBottomClose,
    expandIcon: PanelBottomOpen
  }
}

export interface PaneFrameProps {
  pane: PaneId
  title: string
  accent?: 'default' | 'ai'
  children: ReactNode
}

// One resizable, collapsible pane. Collapsed, it shrinks to a thin strip with an expand button; its
// size is kept, so expanding restores it.
export function PaneFrame({ pane, title, accent = 'default', children }: PaneFrameProps) {
  const state = useUiStore((s) => s.panes[pane])
  const setPaneSize = useUiStore((s) => s.setPaneSize)
  const togglePane = useUiStore((s) => s.togglePane)
  const config = PANE_CONFIG[pane]
  const name = title.toLowerCase()

  const paneClass = [styles.pane, styles[pane]].join(' ')

  if (state.collapsed) {
    const ExpandIcon = config.expandIcon
    return (
      <section className={[styles.strip, styles[pane]].join(' ')} aria-label={`${title} (hidden)`}>
        <IconButton
          icon={ExpandIcon}
          label={`Show ${name} panel`}
          onClick={() => togglePane(pane)}
        />
      </section>
    )
  }

  const CollapseIcon = config.collapseIcon
  const sizeStyle: CSSProperties =
    config.axis === 'x' ? { width: state.size } : { height: state.size }
  const titleClass = accent === 'ai' ? `${styles.title} ${styles.ai}` : styles.title

  return (
    <section className={paneClass} style={sizeStyle} aria-label={title}>
      <header className={styles.header}>
        <h2 className={titleClass}>{title}</h2>
        <IconButton
          icon={CollapseIcon}
          label={`Hide ${name} panel`}
          onClick={() => togglePane(pane)}
        />
      </header>
      <div className={styles.body}>
        {/* Error boundary: wrap this content in the pane error boundary when task #27 lands, so
            one broken pane does not take down the window. */}
        {children}
      </div>
      <ResizeHandle
        axis={config.axis}
        grow={config.grow}
        edge={config.edge}
        size={state.size}
        label={`Resize ${name} panel`}
        onResize={(next) =>
          setPaneSize(
            pane,
            clampPaneSize(pane, next, config.axis === 'x' ? window.innerWidth : window.innerHeight)
          )
        }
      />
    </section>
  )
}
