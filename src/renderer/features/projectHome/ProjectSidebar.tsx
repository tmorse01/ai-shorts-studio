import { useEffect, useState, type JSX, type RefObject } from 'react'
import { FileText, Film, Scissors, Settings } from 'lucide-react'
import { ProjectSettingsDialog } from '../shorts/ProjectSettingsDialog'
import { useProjectStore } from '../project/useProjectStore'
import { activeSection, PROJECT_SECTIONS, type ProjectSectionId } from './projectHomeModel'
import styles from './ProjectSidebar.module.css'

const SECTION_ICONS: Record<ProjectSectionId, typeof Film> = {
  'project-footage': Film,
  'project-shorts': Scissors,
  'project-scripts': FileText
}

// The slim project sidebar on Project home: the project name, one item per section, and Settings at
// the bottom. Items scroll their section into view. The item for the section on screen is marked
// current. Every item is a button, so Tab and Enter or Space work.
export function ProjectSidebar({
  scrollRef
}: {
  scrollRef: RefObject<HTMLElement | null>
}): JSX.Element {
  const name = useProjectStore((state) => state.current?.project.name ?? '')
  const [active, setActive] = useState<ProjectSectionId>(PROJECT_SECTIONS[0].id)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Follows the page's scroll position. The page is the scroll container, so its rect is the frame.
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const update = () => {
      const frameTop = container.getBoundingClientRect().top
      setActive(
        activeSection(
          PROJECT_SECTIONS.map((section) => {
            const el = document.getElementById(section.id)
            return {
              id: section.id,
              top: el ? el.getBoundingClientRect().top - frameTop : Number.POSITIVE_INFINITY
            }
          })
        )
      )
    }
    update()
    container.addEventListener('scroll', update, { passive: true })
    return () => container.removeEventListener('scroll', update)
  }, [scrollRef])

  function goTo(id: ProjectSectionId) {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <nav className={styles.sidebar} aria-label="Project sections">
      <p className={styles.name} title={name}>
        {name}
      </p>
      <ul className={styles.list}>
        {PROJECT_SECTIONS.map((section) => {
          const Icon = SECTION_ICONS[section.id]
          const isActive = active === section.id
          return (
            <li key={section.id}>
              <button
                type="button"
                className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                aria-current={isActive ? 'location' : undefined}
                onClick={() => goTo(section.id)}
              >
                <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>{section.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className={styles.bottom}>
        <button type="button" className={styles.item} onClick={() => setSettingsOpen(true)}>
          <Settings size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Settings</span>
        </button>
      </div>
      <ProjectSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </nav>
  )
}
