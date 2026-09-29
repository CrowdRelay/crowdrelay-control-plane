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
  // The journey carries a fixed 17s live-poll wait, so the 30s default
  // times out on a loaded runner even when every step is green.
  test.setTimeout(90_000)
  // Boot-cost guard: Today is one composite read model. If a regression
  // re-mounts the command centre on the way in, or re-adds per-section
  // follow-ups (shows, timeline, outcomes), these checks name it.
  const apiCalls: string[] = []
  page.on('request', (req) => {
    const url = req.url()
    if (url.includes('/api/v1/')) apiCalls.push(url)
  })
  const { username, password } = credentials()
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Sign in to your account' })).toBeVisible()
  await page.getByLabel('Username').fill(username)
  // `exact` — the show/hide toggle's aria-label "Show password" otherwise
  // substring-matches "Password" and strict mode sees two elements.
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // After login, the shell redirects to the operator's default tenant's
  // Today page — the daily read is the worklist home. Verify the landing
  // by URL and heading rather than the tenant name.
  await expect(page).toHaveURL(/\/tenants\/[^/]+\/operations/)
  // The heading waits on the lazy AuthenticatedApp chunk plus session hydrate —
  // on the shared 2-core box under CI load that can exceed the 5s default.
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible({ timeout: 30_000 })

  const bootCalls = apiCalls.slice()
  // `command-center` is expected here even though the landing is Today —
  // the shell's nav badge shares that query key and fires it on every page
  // for platform sessions. The guard is the absent per-section calls and a
  // bounded set of distinct endpoints (the multi-view boot storm shape).
  expect(bootCalls.some((u) => /\/tenants\/[^/]+\/today\b/.test(u))).toBe(true)
  expect(bootCalls.some((u) => /\/tenants\/[^/]+\/shows\b/.test(u))).toBe(false)
  expect(bootCalls.some((u) => u.includes('/operations/outcomes'))).toBe(false)
  const distinct = new Set(bootCalls.map((u) => u.split('?')[0]))
  expect(distinct.size).toBeLessThanOrEqual(10)

  await page.getByRole('link', { name: 'Tenants' }).first().click()
  // `exact` — the FleetList card's <h2> "Tenants, most urgent first"
  // substring-matches "Tenants" and strict mode sees two headings.
  await expect(page.getByRole('heading', { name: 'Tenants', exact: true })).toBeVisible()
  const virya = page.locator('[data-slot="tenant-row"]').filter({ hasText: /virya/i }).first()
  await expect(virya).toBeVisible()
  await virya.click()
  // The bare tenant URL redirects to Today. The Heartbeat panel lives on
  // the tenant Health page, which sits one level in under the collapsed
  // Operator group — open the group before the link exists to click.
  await expect(page).toHaveURL(/\/tenants\/[^/]+\/operations/)
  await page.getByRole('button', { name: 'Operator' }).click()
  await page.getByRole('link', { name: 'Health' }).first().click()
  await expect(page).toHaveURL(/\/tenants\/[^/]+\/health/)
  // The Heartbeat panel lives in the Overview work area, which is the
  // page's default tab — it is already mounted on arrival; the press only
  // asserts the strip is reachable the way an operator would use it.
  await page.locator('#tab-overview').click()
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
