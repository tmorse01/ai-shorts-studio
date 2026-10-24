import { describe, expect, it } from 'vitest'
import { createMemoryHistory, rootRouteId } from '@tanstack/react-router'
import { createAppRouter } from '@renderer/routes/appRouter'

// Memory history runs under Node. The app itself uses hash history.
async function openAt(path: string, devRoutes = false) {
  const history = createMemoryHistory({ initialEntries: [path] })
  const router = createAppRouter(history, { devRoutes })
  await router.load()
  return { router, history }
}

type OpenedRouter = Awaited<ReturnType<typeof openAt>>['router']

// The deepest match. An address that matches no page stops at the root.
function leafId(router: OpenedRouter) {
  return router.state.matches.at(-1)?.routeId
}

describe('routes', () => {
  it.each([
    ['/', '/'],
    ['/project/p1', '/project/$projectId'],
    ['/project/p1/short/s2', '/project/$projectId/short/$shortId'],
    ['/settings', '/settings']
  ])('%s renders the %s route', async (path, routeId) => {
    const { router } = await openAt(path)
    expect(leafId(router)).toBe(routeId)
  })

  it('passes typed path params to the editor route', async () => {
    const { router } = await openAt('/project/proj-42/short/short-7')
    expect(router.state.matches.at(-1)?.params).toEqual({
      projectId: 'proj-42',
      shortId: 'short-7'
    })
  })

  it('stops at the root for an unknown address, which shows the not-found page', async () => {
    const { router } = await openAt('/no/such/page')
    expect(leafId(router)).toBe(rootRouteId)
  })

  it('treats the dev review route as not found in production builds', async () => {
    const { router } = await openAt('/dev/ui')
    expect(router.state.matches.at(-1)?.status).toBe('notFound')
  })

  it('serves the dev review route when dev routes are on', async () => {
    const { router } = await openAt('/dev/ui', true)
    expect(leafId(router)).toBe('/dev/ui')
  })
})

describe('back navigation', () => {
  // Links and the Back button push and pop history, and the router then matches the new location.
  // Router.navigate is not used here: under Node the router treats itself as a server and skips
  // committing navigations.
  it('steps from editor to project home to dashboard', async () => {
    const { router, history } = await openAt('/')

    history.push('/project/p1')
    await router.load()
    expect(leafId(router)).toBe('/project/$projectId')

    history.push('/project/p1/short/s1')
    await router.load()
    expect(leafId(router)).toBe('/project/$projectId/short/$shortId')

    history.back()
    await router.load()
    expect(leafId(router)).toBe('/project/$projectId')

    history.back()
    await router.load()
    expect(leafId(router)).toBe('/')
  })
})
