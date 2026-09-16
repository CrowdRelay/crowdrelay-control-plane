import { expect, test } from '@playwright/test'

const baseURL = process.env.CONTROL_PLANE_BASE_URL ?? 'https://control.crowdrelay.music'
// The app login credentials are distinct from the edge Basic Auth credentials.
// CONTROL_PLANE_SMOKE_LOGIN is the app-level operator account (username:password).
// Fall back to CONTROL_PLANE_SMOKE_BASIC_AUTH for backward compatibility.
const login = process.env.CONTROL_PLANE_SMOKE_LOGIN ?? process.env.CONTROL_PLANE_SMOKE_BASIC_AUTH ?? ''

const credentials = () => {
  const separator = login.indexOf(':')
  if (separator <= 0 || separator === login.length - 1) throw new Error('CONTROL_PLANE_SMOKE_LOGIN must be username:password')
  return { username: login.slice(0, separator), password: login.slice(separator + 1) }
}

test('operator journey keeps tenant shell stable across live polling', async ({ page }) => {
  const { username, password } = credentials()
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible()
  await page.getByLabel('Username').fill(username)
  // `exact` — the show/hide toggle's aria-label "Show password" otherwise
  // substring-matches "Password" and strict mode sees two elements.
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // After login, the shell redirects to the operator's default tenant's
  // Attention page — the decision queue is the worklist (UX-3.2). Verify the
  // landing by URL and heading rather than the tenant name.
  await expect(page).toHaveURL(/\/tenants\/[^/]+\/attention/)
  await expect(page.getByRole('heading', { name: 'Operator Attention' })).toBeVisible()

  await page.getByRole('link', { name: 'Tenants' }).first().click()
  await expect(page.getByRole('heading', { name: 'Teams on the platform' })).toBeVisible()
  const virya = page.locator('[data-slot="tenant-row"]').filter({ hasText: /virya/i }).first()
  await expect(virya).toBeVisible()
  await virya.click()
  // The tenant profile page opens on the profile tab; the Heartbeat panel is
  // the live-polled surface this journey exists to watch.
  await expect(page.getByRole('heading', { name: 'Heartbeat' })).toBeVisible()

  const tenantHeading = page.locator('h1').first()
  const headingHandle = await tenantHeading.elementHandle()
  if (!headingHandle) throw new Error('tenant heading element handle missing')
  const originalHeading = await tenantHeading.textContent()
  const originalURL = page.url()

  // The 15s runtime poll must not remount the page — a remount detaches the
  // heading node and resets any in-progress edit. Wait past one poll cycle.
  await page.waitForTimeout(17_000)
  expect(page.url()).toBe(originalURL)
  expect(await headingHandle.evaluate((node) => node.isConnected)).toBe(true)
  expect(await tenantHeading.textContent()).toBe(originalHeading)
  await expect(page.getByRole('heading', { name: 'Heartbeat' })).toBeVisible()

  // Sign-out lives in the account menu at the foot of the sidebar.
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible()
})
