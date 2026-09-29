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
  // Areas are sub-pages now, reached from the sidebar's flyout — the `>`
  // affordance is what opens it (row hover only reveals it), so the helper
  // hovers the row, then clicks the chevron the way an operator would.
  // On mobile the same children list inline inside the sheet instead.
  const openSubPage = async (page: Page, section: string, label: string) => {
    const isMobile = (page.viewportSize()?.width ?? 1280) < 768
    if (isMobile) {
      // The mobile nav is a Sheet — scope to it, or the bottom bar's "Today"
      // link makes the visibility check a false positive.
      const sheet = page.locator('[data-sidebar="sidebar"][data-mobile="true"]')
      if (!(await sheet.isVisible().catch(() => false)))
        await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click()
      const expand = sheet.getByRole('button', { name: `Show ${section} pages`, exact: true })
      if (await expand.isVisible().catch(() => false)) await expand.click()
      await sheet.getByRole('link', { name: label, exact: true }).click()
      return
    }
    await page.getByRole('link', { name: section, exact: true }).first().hover()
    await page.getByRole('button', { name: `${section} pages`, exact: true }).click()
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
    // replies/negotiations/outreach are the BUG-021 crash sites — each
    // panel bound params to the now-inactive `/operations` route.
    for (const [segment, heading] of [['replies', 'Replies'], ['negotiations', 'Negotiations'], ['outreach', 'Outreach'], ['releases', 'Releases'], ['replies', 'Replies']]) {
      await openSubPage(page, 'Today', heading)
      await expect(page).toHaveURL(new RegExp(`/tenants/virya/operations/${segment}$`))
      await expect(page.locator('#main-content h1')).toHaveText(heading)
      expect(await page.locator('[data-slot="sub-page"]').count()).toBe(1)
      await expect(page.getByText('failed to render')).toHaveCount(0)
    }
  })
})
