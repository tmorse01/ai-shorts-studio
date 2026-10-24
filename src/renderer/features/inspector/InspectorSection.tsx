import type { JSX } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { PaneErrorBoundary } from '@renderer/features/errors/PaneErrorBoundary'
import type { InspectorSectionDef } from './inspectorModel'
import { useInspectorStore } from './useInspectorStore'
import styles from './InspectorSection.module.css'

export interface InspectorSectionProps {
  section: InspectorSectionDef
}

// One collapsible inspector section: a small uppercase header with a chevron. Its body sits in its
// own error boundary, so one broken section leaves the others working.
export function InspectorSection({ section }: InspectorSectionProps): JSX.Element {
  const collapsed = useInspectorStore((state) => state.collapsed[section.id] ?? false)
  const toggleSection = useInspectorStore((state) => state.toggleSection)
  const Body = section.Component
  const bodyId = `inspector-section-${section.id}`
  const Chevron = collapsed ? ChevronRight : ChevronDown

  return (
    <section className={styles.section} aria-label={section.title}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        onClick={() => toggleSection(section.id)}
      >
        <span className={styles.title}>{section.title}</span>
        <Chevron size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {collapsed ? null : (
        <div id={bodyId} className={styles.body}>
          <PaneErrorBoundary name={section.title}>
            <Body />
          </PaneErrorBoundary>
        </div>
      )}
    </section>
  )
}
