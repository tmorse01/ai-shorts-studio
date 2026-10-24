import { Tooltip } from '@renderer/ui/Tooltip'
import { LEFT_TOOL_DEFINITIONS, RAIL_TOOLS } from './leftTools'
import { useUiStore } from './useUiStore'
import styles from './ToolRail.module.css'

// The narrow icon column on the far left. Picking a tool opens the left panel if it is hidden.
export function ToolRail() {
  const leftTool = useUiStore((s) => s.leftTool)
  const setLeftTool = useUiStore((s) => s.setLeftTool)
  const setPaneCollapsed = useUiStore((s) => s.setPaneCollapsed)

  return (
    <nav className={styles.rail} aria-label="Editor tools">
      {RAIL_TOOLS.map((id) => {
        const def = LEFT_TOOL_DEFINITIONS[id]
        const Icon = def.icon
        const active = leftTool === id
        const classes = [styles.tool, def.ai ? styles.ai : ''].filter(Boolean).join(' ')

        return (
          <Tooltip key={id} content={def.label} side="right">
            <button
              type="button"
              className={classes}
              aria-label={def.label}
              aria-pressed={active}
              onClick={() => {
                setLeftTool(id)
                setPaneCollapsed('left', false)
              }}
            >
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </Tooltip>
        )
      })}
    </nav>
  )
}
