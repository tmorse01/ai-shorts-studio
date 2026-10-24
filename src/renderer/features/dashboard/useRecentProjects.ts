import { useCallback, useEffect, useState } from 'react'
import type { RecentProject } from '@shared/project/recentProjects'
import { toast } from '../toasts/toast'

export interface RecentProjectsState {
  // Null until the first list has come back, so the gallery can tell "loading" from "empty".
  projects: RecentProject[] | null
  refresh: () => Promise<void>
}

// Reads the recent projects registry over IPC. Call refresh after any change to the list.
export function useRecentProjects(): RecentProjectsState {
  const [projects, setProjects] = useState<RecentProject[] | null>(null)

  const refresh = useCallback(async () => {
    const result = await window.api.invoke('recent:list', {})
    if (result.ok) {
      setProjects(result.data.projects)
    } else {
      toast.error({
        title: 'Could not load your projects',
        description: result.error.message,
        details: result.error.details
      })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { projects, refresh }
}
