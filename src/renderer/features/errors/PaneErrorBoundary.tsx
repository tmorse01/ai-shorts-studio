import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@renderer/ui/Button'
import { reportRendererError } from './reportRendererError'
import styles from './PaneErrorBoundary.module.css'

export interface PaneErrorBoundaryProps {
  /** Plain name of the pane, such as "Media" or "Timeline". Shown in the fallback. */
  name: string
  /** Called when the user presses Retry, before the pane renders again. */
  onRetry?: () => void
  children: ReactNode
}

interface PaneErrorBoundaryState {
  hasError: boolean
}

// Wraps one editor pane. If the pane throws while rendering, the pane shows an inline fallback with
// Retry and the rest of the window keeps working. The error is logged, not toasted: the fallback is
// already on screen.
export class PaneErrorBoundary extends Component<PaneErrorBoundaryProps, PaneErrorBoundaryState> {
  state: PaneErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): PaneErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    reportRendererError(error, `${this.props.name} pane${formatStack(info)}`)
  }

  private readonly retry = (): void => {
    this.props.onRetry?.()
    this.setState({ hasError: false })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div className={styles.fallback} role="alert">
        <h3 className={styles.title}>The {this.props.name} pane hit a problem.</h3>
        <p className={styles.text}>The other panes still work. Retry to show this pane again.</p>
        <Button variant="secondary" size="sm" onClick={this.retry}>
          Retry
        </Button>
      </div>
    )
  }
}

// The component stack says where in the tree the error came from. It goes to the log only.
function formatStack(info: ErrorInfo): string {
  const first = info.componentStack?.trim().split('\n')[0]
  return first ? ` at ${first.trim()}` : ''
}
