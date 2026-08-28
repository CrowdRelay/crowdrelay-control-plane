/**
 * Broad E2E tests — login, navigate every subpage, check for 503s,
 * red error blocks, console errors, and failed network requests.
 *
 * This is the primary test file for the auto-fix loop:
 *   1. Run tests → bug-report.json
 *   2. Parse bugs
 *   3. Fix each bug
 *   4. Re-run tests
 *   5. Repeat until 0 bugs
 *
 * @e2e
 */
import { test, expect, Page } from '@playwright/test'
import { addBug, resetBugs, writeBugReport } from './bug-report'
import { login, setupErrorCollectors } from './fixtures/auth'

test.beforeAll(() => resetBugs())
test.afterAll(() => writeBugReport())

// ── Helper: check a page for red error blocks ───────────────────────────
async function checkForRedBlocks(page: Page, pageName: string, path: string) {
  // Common patterns for error display in the control plane UI:
  // - Elements with red background/text (error states)
  // - Elements with error-related classes
  // - Toast notifications that are error-colored
  // - "Error" / "Failed" / "Unavailable" text in error context

  const redSelectors = [
    '[class*="error" i][class*="red" i]',
    '[class*="error" i]:not([class*="error-boundary" i])',
    '[data-error="true"]',
    '.toast-error',
    '.toast-error',
    '[role="alert"]',
    '[class*="toast"][class*="error" i]',
    '[class*="alert"][class*="error" i]',
    '[class*="banner"][class*="error" i]',
    '[class*="message"][class*="error" i]',
  ]

  for (const selector of redSelectors) {
    const elements = await page.locator(selector).count()
    if (elements > 0) {
      // Get the text content of the error elements
      const texts = await page.locator(selector).allTextContents()
      const errorText = texts.filter(t => t && t.trim().length > 0).join(' | ')
      if (errorText.trim()) {
        addBug({
          severity: 'high',
          category: 'ui',
          title: `Red error block on ${pageName}: ${errorText.slice(0, 200)}`,
          test_name: `e2e::${pageName}-red-block`,
          url: path,
          expected: 'No error blocks visible',
          actual: `Error text: ${errorText.slice(0, 200)}`,
          fix_hint: `Check the API call that ${pageName} makes — may be returning an error that the UI is displaying`,
        })
      }
    }
  }

  // Also check for inline error text patterns
  const bodyText = await page.locator('body').textContent() || ''
  const errorPatterns = [
    '503 Service Unavailable',
    'Internal Server Error',
    'Failed to fetch',
    'Network request failed',
    'upstream target unavailable',
    'upstream returned HTTP 401',
    'dependency-unavailable',
  ]
  for (const pattern of errorPatterns) {
    if (bodyText.includes(pattern)) {
      addBug({
        severity: 'high',
        category: 'ui',
        title: `Error text "${pattern}" visible on ${pageName}`,
        test_name: `e2e::${pageName}-error-text`,
        url: path,
        expected: `No "${pattern}" text visible`,
        actual: `Page contains "${pattern}"`,
        fix_hint: `Check the upstream API for ${pageName} — it may be returning an error that's being rendered as text`,
      })
    }
  }
}

// ── Helper: navigate to a page and verify it loads ─────────────────────
async function navigateAndCheck(
  page: Page,
  pageName: string,
  path: string,
  collectors: ReturnType<typeof setupErrorCollectors>
) {
  const errorsBefore = collectors.consoleErrors.length
  const netErrorsBefore = collectors.networkFailures.length
  const apiErrorsBefore = collectors.apiErrors.length

  const response = await page.goto(path)
  expect(response, `${path} should respond`).not.toBeNull()
  const status = response!.status()

  // SPA routes should return 200 (index.html fallback)
  if (status !== 200) {
    addBug({
      severity: status >= 500 ? 'critical' : 'high',
      category: 'http',
      title: `Page ${pageName} returned ${status}`,
      test_name: `e2e::${pageName}-http`,
      url: path,
      expected: '200',
      actual: `Status ${status}`,
      fix_hint: `Check SPA fallback routing for ${path}`,
    })
  }
  expect(status).toBe(200)

  // Wait for the page to settle (API calls, rendering)
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1000) // Give SPA time to render

  // Check for red error blocks
  await checkForRedBlocks(page, pageName, path)

  // Check for new console errors
  const newConsoleErrors = collectors.consoleErrors.slice(errorsBefore)
  for (const err of newConsoleErrors) {
    // Ignore benign errors
    if (err.includes('favicon') || err.includes('net::ERR') && err.includes('favicon')) continue
    addBug({
      severity: 'medium',
      category: 'ui',
      title: `Console error on ${pageName}: ${err.slice(0, 200)}`,
      test_name: `e2e::${pageName}-console-error`,
      url: path,
      expected: 'No console errors',
      actual: err.slice(0, 200),
      fix_hint: `Check JavaScript execution on ${pageName} — may be a runtime error or failed API call`,
    })
  }

  // Check for new network failures (5xx)
  const newNetErrors = collectors.networkFailures.slice(netErrorsBefore)
  for (const err of newNetErrors) {
    addBug({
      severity: 'critical',
      category: 'api',
      title: `Network ${err.status} on ${pageName}: ${err.url.slice(0, 150)}`,
      test_name: `e2e::${pageName}-network-${err.status}`,
      url: err.url,
      expected: '2xx response',
      actual: `Status ${err.status}`,
      fix_hint: `Check the API endpoint ${err.url} — it's returning ${err.status}`,
    })
  }

  // Check for new API errors (4xx excluding 401/404)
  const newApiErrors = collectors.apiErrors.slice(apiErrorsBefore)
  for (const err of newApiErrors) {
    addBug({
      severity: 'high',
      category: 'api',
      title: `API ${err.status} on ${pageName}: ${err.url.slice(0, 150)}`,
      test_name: `e2e::${pageName}-api-${err.status}`,
      url: err.url,
      expected: '2xx response',
      actual: `Status ${err.status}`,
      fix_hint: `Check the API endpoint ${err.url} — it's returning ${err.status}`,
    })
  }
}

// ── All subpages to test ────────────────────────────────────────────────
const SUBPAGES = [
  { path: '/', name: 'overview' },
  { path: '/flow', name: 'flow' },
  { path: '/tenants', name: 'tenants' },
  { path: '/tenants/virya', name: 'tenant-detail' },
  { path: '/tenants/virya/operations', name: 'operations' },
  { path: '/tenants/virya/attention', name: 'attention' },
  { path: '/tenants/virya/portfolio', name: 'portfolio' },
  { path: '/tenants/virya/area', name: 'area' },
  { path: '/tenants/virya/integrations', name: 'integrations' },
  { path: '/tenants/virya/notifiers', name: 'notifiers' },
  { path: '/attention', name: 'operator-attention' },
  { path: '/automation', name: 'automation' },
]

// ── Tests ───────────────────────────────────────────────────────────────

test.describe('Control Plane E2E @e2e', () => {
  let collectors: ReturnType<typeof setupErrorCollectors>

  test.beforeEach(async ({ page }) => {
    collectors = setupErrorCollectors(page)
    await login(page)
  })

  // Login test
  test('Login succeeds @e2e @smoke', async ({ page }) => {
    // After login, we should see the app shell, not the login form
    const loginForm = await page.locator('input[type="password"]').count()
    expect(loginForm).toBe(0)

    // Verify we're on the overview page (or at least not on a login page)
    const url = page.url()
    expect(url).not.toContain('/login')

    // Wait for the SPA to render content
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    await page.waitForTimeout(2000)

    // The page should have some content (not a blank screen)
    const bodyText = await page.locator('body').textContent()
    expect(bodyText?.trim().length).toBeGreaterThan(0)
  })

  // Test each subpage
  for (const sub of SUBPAGES) {
    test(`Subpage ${sub.name} loads without errors @e2e @pages`, async ({ page }) => {
      await navigateAndCheck(page, sub.name, sub.path, collectors)
    })
  }

  // Test that navigating between pages doesn't accumulate errors
  test('Full navigation sweep — no accumulated errors @e2e', async ({ page }) => {
    const sweepCollectors = setupErrorCollectors(page)

    for (const sub of SUBPAGES) {
      await page.goto(sub.path)
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      await page.waitForTimeout(500)
    }

    // After visiting all pages, check for any accumulated errors
    if (sweepCollectors.networkFailures.length > 0) {
      addBug({
        severity: 'critical',
        category: 'api',
        title: `${sweepCollectors.networkFailures.length} network failures during full navigation sweep`,
        test_name: 'e2e::navigation-sweep-network',
        url: 'multiple',
        expected: '0 network failures',
        actual: `${sweepCollectors.networkFailures.length} failures: ${sweepCollectors.networkFailures.map(f => `${f.status} ${f.url.slice(-80)}`).join(', ')}`,
        fix_hint: 'Check the API endpoints that are failing during navigation',
      })
    }

    if (sweepCollectors.apiErrors.length > 0) {
      addBug({
        severity: 'high',
        category: 'api',
        title: `${sweepCollectors.apiErrors.length} API errors during full navigation sweep`,
        test_name: 'e2e::navigation-sweep-api',
        url: 'multiple',
        expected: '0 API errors',
        actual: `${sweepCollectors.apiErrors.length} errors: ${sweepCollectors.apiErrors.map(e => `${e.status} ${e.url.slice(-80)}`).join(', ')}`,
        fix_hint: 'Check the API endpoints that are returning errors during navigation',
      })
    }

    expect(sweepCollectors.networkFailures.length).toBe(0)
    expect(sweepCollectors.apiErrors.length).toBe(0)
  })
})
