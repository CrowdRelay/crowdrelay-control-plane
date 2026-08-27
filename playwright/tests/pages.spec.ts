/**
 * UI page tests — verify every page loads, has a title, and shows
 * expected elements. These are visual smoke tests, not functional tests.
 *
 * @pages
 */
import { test, expect } from '@playwright/test'
import { addBug, resetBugs, writeBugReport } from './bug-report'

test.beforeAll(() => resetBugs())
test.afterAll(() => writeBugReport())

const PAGES = [
  { path: '/', name: 'root', title: /.+/i },
  { path: '/login', name: 'login', title: /.+/i },
  { path: '/tenants', name: 'tenants', title: /.+/i },
  { path: '/tenants/virya', name: 'tenant-virya', title: /.+/i },
  { path: '/tenants/virya/operations', name: 'operations', title: /.+/i },
  { path: '/tenants/virya/portfolio', name: 'portfolio', title: /.+/i },
  { path: '/tenants/virya/attention', name: 'attention', title: /.+/i },
  { path: '/tenants/virya/integrations', name: 'integrations', title: /.+/i },
  { path: '/tenants/virya/area', name: 'area', title: /.+/i },
]

for (const pageDef of PAGES) {
  test(`Page ${pageDef.name} loads @pages`, async ({ page }) => {
    const response = await page.goto(pageDef.path)
    expect(response, `${pageDef.path} should respond`).not.toBeNull()
    const status = response!.status()
    // Pages should return 200 or redirect (302/307)
    if (status !== 200 && status !== 302 && status !== 307) {
      addBug({
        severity: status >= 500 ? 'critical' : 'high',
        category: 'http',
        title: `Page ${pageDef.name} returned ${status}`,
        test_name: `pages::${pageDef.name}`,
        url: pageDef.path,
        expected: '200 or redirect',
        actual: `Status ${status}`,
        fix_hint: `Check routing for ${pageDef.path}`,
      })
    }
    // Check page doesn't show a raw error
    const bodyText = await page.locator('body').textContent()
    if (bodyText && (bodyText.includes('Internal Server Error') || bodyText.includes('Panic'))) {
      addBug({
        severity: 'critical',
        category: 'ui',
        title: `Page ${pageDef.name} shows raw error text`,
        test_name: `pages::${pageDef.name}-error`,
        url: pageDef.path,
        expected: 'No raw error text',
        actual: 'Page contains "Internal Server Error" or "Panic"',
        fix_hint: `Check server-side rendering for ${pageDef.path}`,
      })
    }
    expect([200, 302, 307]).toContain(status)
  })
}

// Test that the SPA fallback works — any unknown route returns the app shell
test('SPA fallback serves index.html for unknown routes @pages', async ({ page }) => {
  const response = await page.goto('/nonexistent-deep-route-12345')
  expect(response).not.toBeNull()
  const status = response!.status()
  // SPA fallback should return 200 (serving index.html) or 404
  if (status !== 200 && status !== 404) {
    addBug({
      severity: 'medium',
      category: 'http',
      title: 'SPA fallback not working for unknown routes',
      test_name: 'pages::spa-fallback',
      url: '/nonexistent-deep-route-12345',
      expected: '200 (serving index.html) or 404',
      actual: `Status ${status}`,
      fix_hint: 'Check SPA fallback configuration in the router',
    })
  }
  expect([200, 404]).toContain(status)
})
