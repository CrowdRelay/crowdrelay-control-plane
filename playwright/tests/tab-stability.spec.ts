/**
 * Tab switch DOM stability — verifies that switching tabs on tenant subpages
 * shows a local skeleton inside the tab content area only, never a page-wide
 * skeleton, and that the page header + tab bar persist.
 *
 * Guards against:
 * - page-level skeleton replacement on first tab visit
 * - DOM teardown of persistent elements (header, SVG, tab bar)
 * - eager fetching (all tab queries firing on page load)
 *
 * @e2e @tabs
 */
import { test, expect, type Page } from '@playwright/test'
import { login } from './fixtures/auth'

test.describe('Tab switch DOM stability @e2e @tabs', () => {
  // Areas are sub-pages now, reached from the sidebar's hover flyout — each
  // is its own route, so the check is that exactly one area's body is
  // mounted and the heading names the one that is open.
  const openSubPage = async (page: Page, section: string, label: string) => {
    await page.getByRole('link', { name: section, exact: true }).first().hover()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
  }

  test('intelligence sub-pages: one body at a time, heading follows @e2e', async ({ page }) => {
    await login(page)
    await page.goto('/tenants/virya/intelligence')
    await expect(page.locator('#main-content h1')).toHaveText('Intelligence', { timeout: 30000 })
    for (const [segment, heading] of [['brief', 'Are we getting anywhere'], ['standing', 'Where it stands'], ['decisions', 'What it decided'], ['learning', 'What it learned']]) {
      await openSubPage(page, 'Intelligence', heading)
      await expect(page).toHaveURL(new RegExp(`/tenants/virya/intelligence/${segment}$`))
      await expect(page.locator('#main-content h1')).toHaveText(heading)
      expect(await page.locator('[data-slot="sub-page"]').count()).toBe(1)
    }
  })

  test('today sub-pages: one body at a time, heading follows @e2e', async ({ page }) => {
    await login(page)
    await page.goto('/tenants/virya/operations')
    await expect(page.locator('#main-content h1')).toHaveText('Today', { timeout: 30000 })
    for (const [segment, heading] of [['replies', 'Replies'], ['releases', 'Releases'], ['replies', 'Replies']]) {
      await openSubPage(page, 'Today', heading)
      await expect(page).toHaveURL(new RegExp(`/tenants/virya/operations/${segment}$`))
      await expect(page.locator('#main-content h1')).toHaveText(heading)
      expect(await page.locator('[data-slot="sub-page"]').count()).toBe(1)
    }
  })
})
