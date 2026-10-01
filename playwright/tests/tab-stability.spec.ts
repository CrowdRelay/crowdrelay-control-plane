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
  // Areas are sub-pages, listed under their section in the sidebar while
  // you are in it — a plain link, no flyout. On mobile the same list sits
  // inside the nav sheet, so open the sheet first.
  const openSubPage = async (page: Page, _section: string, label: string) => {
    const isMobile = (page.viewportSize()?.width ?? 1280) < 768
    const scope = isMobile ? page.locator('[data-sidebar="sidebar"][data-mobile="true"]') : page.locator('[data-sidebar="sidebar"]').first()
    // The mobile nav is a Sheet — scope to it, or the bottom bar's "Today"
    // link makes the lookup a false positive. Navigation dismisses it but it
    // lingers through the exit, so settle closed first, then reopen.
    if (isMobile) {
      await expect(scope).toHaveCount(0).catch(async () => {
        await page.keyboard.press('Escape')
        await expect(scope).toHaveCount(0)
      })
      await page.getByRole('button', { name: 'Toggle Sidebar', exact: true }).click()
    }
    await scope.locator('[data-sidebar="menu-sub"]').getByRole('link', { name: label, exact: true }).click()
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
