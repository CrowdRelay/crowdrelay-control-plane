import { expect, test } from '@playwright/test'

const baseURL = process.env.CONTROL_PLANE_BASE_URL ?? 'https://control.virya.music'
const basic = process.env.CONTROL_PLANE_SMOKE_BASIC_AUTH ?? ''

const credentials = () => {
  const separator = basic.indexOf(':')
  if (separator <= 0 || separator === basic.length - 1) throw new Error('CONTROL_PLANE_SMOKE_BASIC_AUTH must be username:password')
  return { username: basic.slice(0, separator), password: basic.slice(separator + 1) }
}

test('operator journey keeps tenant shell stable across live polling', async ({ page }) => {
  const { username, password } = credentials()
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Welcome to Control Plane' })).toBeVisible()
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Operator session')).toBeVisible()

  await page.getByRole('link', { name: 'Tenants' }).click()
  await expect(page.getByRole('heading', { name: 'Teams on the platform' })).toBeVisible()
  const virya = page.locator('a.tenant-row').filter({ hasText: /virya/i }).first()
  await expect(virya).toBeVisible()
  await virya.click()
  await expect(page.locator('.runtime-panel')).toBeVisible()

  const tenantHeading = page.locator('.page-head h1').first()
  const headingHandle = await tenantHeading.elementHandle()
  if (!headingHandle) throw new Error('tenant heading element handle missing')
  const originalHeading = await tenantHeading.textContent()
  const originalURL = page.url()

  // Use a deliberately incomplete SHA so no mutation can become actionable.
  // The value exists only to prove the parent page is not remounted by the 15s
  // runtime poll.
  const desiredVersion = page.locator('.provision-row input').first()
  if (await desiredVersion.count()) {
    await desiredVersion.fill('sha-e2e-stability-probe')
  }

  await page.waitForTimeout(17_000)
  expect(page.url()).toBe(originalURL)
  expect(await headingHandle.evaluate((node) => node.isConnected)).toBe(true)
  expect(await tenantHeading.textContent()).toBe(originalHeading)
  if (await desiredVersion.count()) {
    await expect(desiredVersion).toHaveValue('sha-e2e-stability-probe')
  }
  await expect(page.locator('.runtime-panel')).toBeVisible()

  await page.getByRole('button', { name: 'Wyloguj' }).click()
  await expect(page.getByRole('heading', { name: 'Zaloguj się do Control Plane' })).toBeVisible()
})
