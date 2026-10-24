import { dashboardRoute } from './DashboardRoute'
import { editorRoute } from './EditorRoute'
import { projectRoute } from './ProjectRoute'
import { rootRoute } from './rootRoute'
import { settingsRoute } from './SettingsRoute'
import { uiReviewRoute } from './UiReviewRoute'

// Built once. Route objects are shared, so a second addChildren call would overwrite the first.
export const routeTree = rootRoute.addChildren([
  dashboardRoute,
  projectRoute,
  editorRoute,
  settingsRoute,
  uiReviewRoute
])
