/**
 * HTTP smoke tests — verify every major route returns 200 (or appropriate
 * redirect). These are the fastest tests and catch the most common deployment
 * issues (missing routes, broken reverse proxy, crashed services).
 *
 * @smoke
 */
import { test, expect } from '@playwright/test'
import { addBug, resetBugs, writeBugReport } from './bug-report'

test.beforeAll(() => resetBugs())
test.afterAll(() => writeBugReport())

const ROUTES = [
  { path: '/', name: 'root', expectedStatus: [200, 302, 307] },
  { path: '/login', name: 'login', expectedStatus: [200, 302] },
  { path: '/health', name: 'health', expectedStatus: [200] },
  { path: '/api/health', name: 'api-health', expectedStatus: [200, 404] },
  { path: '/ready', name: 'ready', expectedStatus: [200, 404] },
  { path: '/tenants', name: 'tenants-list', expectedStatus: [200, 302, 401, 403] },
  { path: '/operations', name: 'operations', expectedStatus: [200, 302] },
  { path: '/portfolio', name: 'portfolio', expectedStatus: [200, 302] },
  { path: '/attention', name: 'attention', expectedStatus: [200, 302] },
  { path: '/integrations', name: 'integrations', expectedStatus: [200, 302] },
  { path: '/agents', name: 'agents', expectedStatus: [200, 302] },
  { path: '/area', name: 'area', expectedStatus: [200, 302] },
  { path: '/fanbases', name: 'fanbases', expectedStatus: [200, 302] },
  { path: '/nonexistent-page-12345', name: '404', expectedStatus: [200, 404] },
]

for (const route of ROUTES) {
  test(`HTTP ${route.name} returns valid status @smoke @http`, async ({ page }) => {
    const response = await page.goto(route.path)
    expect(response, `${route.path} should return a response`).not.toBeNull()
    const status = response!.status()
    const statusValid = route.expectedStatus.includes(status)
    if (!statusValid) {
      addBug({
        severity: status >= 500 ? 'critical' : 'high',
        category: 'http',
        title: `${route.name} returned ${status} (expected ${route.expectedStatus.join('|')})`,
        test_name: `http-smoke::${route.name}`,
        url: route.path,
        expected: `Status ${route.expectedStatus.join(' or ')}`,
        actual: `Status ${status}`,
        fix_hint: `Check routing for ${route.path} — may be a missing route, broken proxy, or auth redirect`,
      })
    }
    expect(statusValid, `${route.path}: expected ${route.expectedStatus}, got ${status}`).toBe(true)
  })
}
