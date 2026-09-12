/**
 * Read-only account tests.
 *
 * `platform_viewer` is refused every non-GET by the `authenticate` middleware.
 * The console used to offer it every write control anyway, so the way to find
 * out what the account could do was to press a button and read a 403.
 *
 * These tests assert the two halves of the fix and the authority behind it:
 *   1. The session announces itself.
 *   2. Write controls are disabled, on several unrelated pages.
 *   3. The palette drops its mutating commands.
 *   4. The server still refuses a write that reaches it anyway — the UI is a
 *      courtesy, not the enforcement.
 *
 * Run with the viewer's own credentials:
 *   just test-viewer
 *
 * @viewer
 */
import { test, expect, Page } from '@playwright/test'
import { login } from './fixtures/auth'

const SLUG = 'virya'

test.beforeEach(async ({ page }) => {
  await login(page)
})

/** Fails loudly if the run was pointed at an account that can write. */
async function assertViewerSession(page: Page) {
  const banner = page.getByRole('status').filter({ hasText: 'Read-only session' })
  await expect(
    banner,
    'these tests must run as platform_viewer — check CONTROL_PLANE_TEST_USER',
  ).toBeVisible({ timeout: 15000 })
}

test('the session says it is read-only @viewer', async ({ page }) => {
  await assertViewerSession(page)
  await expect(page.getByText('This account can look at everything and change nothing')).toBeVisible()
})

test('the attention page offers no write @viewer', async ({ page }) => {
  await assertViewerSession(page)
  await page.goto(`/tenants/${SLUG}/attention`)
  await page.waitForLoadState('networkidle')
  // Reconciliation is a POST, so a viewer cannot run it even though it only
  // reads on the far side. The method is what decides.
  await expect(page.getByRole('button', { name: 'Run the check' })).toBeDisabled()
})

test('the notifiers page offers no write @viewer', async ({ page }) => {
  await assertViewerSession(page)
  await page.goto(`/tenants/${SLUG}/notifiers`)
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('button', { name: 'Add channel' })).toBeDisabled()
  // Every switch in the console flips something the server stores.
  const switches = page.getByRole('switch')
  for (let i = 0; i < await switches.count(); i++) {
    await expect(switches.nth(i)).toBeDisabled()
  }
})

test('the tenant settings page offers no write @viewer', async ({ page }) => {
  await assertViewerSession(page)
  await page.goto(`/tenants/${SLUG}`)
  await page.waitForLoadState('networkidle')
  for (const name of ['Suspend', 'Park', 'Edit Play Store URLs']) {
    const button = page.getByRole('button', { name, exact: true })
    if (await button.count() > 0) await expect(button.first()).toBeDisabled()
  }
})

test('the command palette lists nothing that writes @viewer', async ({ page }) => {
  await assertViewerSession(page)
  await page.keyboard.press('ControlOrMeta+k')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 5000 })
  // "Actions" is the group every mutating command belongs to.
  await expect(dialog.getByText('Actions', { exact: true })).toHaveCount(0)
})

test('the server refuses a write that reaches it anyway @viewer', async ({ page }) => {
  await assertViewerSession(page)
  // The browser guard is a courtesy. A raw `fetch` from the page bypasses it
  // entirely — it never touches `api.request` — and proves the middleware, not
  // the console, is what actually holds. It runs in the page rather than
  // through `page.request` so it carries the session cookie.
  const status = await page.evaluate(async (slug) => {
    const response = await fetch(`/api/v1/tenants/${slug}/operations/reconcile`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-request-id': 'viewer-role-spec' },
      body: '{}',
    })
    return response.status
  }, SLUG)
  expect(status).toBe(403)
})
