import type { JSX } from 'react'
import { useStore } from 'zustand'
import { Tabs } from '@renderer/ui/Tabs'
import { EmptyState } from '@renderer/features/layout/EmptyState'
import { sourceStore } from '@renderer/features/source/sourceStore'
import { INSPECTOR_SECTIONS } from './inspectorRegistry'
import {
  INSPECTOR_TAB_LABELS,
  sectionsFor,
  visibleInspectorTabs,
  type InspectorTab
} from './inspectorModel'
import { InspectorSection } from './InspectorSection'
import { SelectionHeader } from './SelectionHeader'
import { useInspectorStore } from './useInspectorStore'
import styles from './Inspector.module.css'

// The right pane (DESIGN.md section 12): top tabs for Video, Audio and AI, plus Transcript while the
// centre pane shows a source clip. Each tab lists the registered sections for the current selection, in
// order. When the transcript tab hides, the Video tab is shown instead.
export function Inspector(): JSX.Element {
  const tab = useInspectorStore((state) => state.tab)
  const setTab = useInspectorStore((state) => state.setTab)
  const sourceView = useStore(sourceStore, (state) => state.mode === 'source')

  const visible = visibleInspectorTabs(sourceView)
  const shownTab: InspectorTab = visible.includes(tab) ? tab : 'video'
  const items = visible.map((value) => ({
    value,
    label: INSPECTOR_TAB_LABELS[value],
    content: <TabSections tab={value} />
  }))

  return (
    <div className={styles.inspector}>
      <SelectionHeader />
      <Tabs
        aria-label="Inspector tabs"
        items={items}
        value={shownTab}
        onValueChange={(value) => setTab(value as InspectorTab)}
      />
    </div>
  )
}

function TabSections({ tab }: { tab: InspectorTab }): JSX.Element {
  const selectionType = useInspectorStore((state) => state.selectionType)
  const sections = sectionsFor(INSPECTOR_SECTIONS, selectionType, tab)

  if (sections.length === 0) {
    return (
      <EmptyState
        title={`No ${INSPECTOR_TAB_LABELS[tab]} settings`}
        description="Nothing to edit in this tab for the current selection."
        accent={tab === 'ai' ? 'ai' : 'default'}
      />
    )
  }

  return (
    <div className={styles.sections}>
      {sections.map((section) => (
        <InspectorSection key={section.id} section={section} />
      ))}
    </div>
  )
}
