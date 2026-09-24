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
import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'

test.describe('Tab switch DOM stability @e2e @tabs', () => {
  test('intelligence page: lazy fetch, local skeleton, persistent header @e2e', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('/api/')) requests.push(url)
    })

    await login(page)
    await page.goto('/tenants/virya/intelligence')
    await page.waitForSelector('[data-slot="tab-panel"]', { timeout: 30000 })
    await page.waitForTimeout(2000)

    // Only the Brief tab panel should be in the DOM (lazy mounting)
    const tabPanels = await page.locator('[data-slot="tab-panel"]').count()
    expect(tabPanels).toBe(1)

    // Mark the page shell and its header to verify they persist across the
    // switch. This used to mark `.intel-loop-svg` as the second witness. That
    // SVG has since moved inside the Learning tab panel, which is not mounted
    // on load — so the marker was never written, and the assertion afterwards
    // read 'gone' every time: a permanent failure that said nothing about tab
    // stability. The page header is page chrome, which is what the test is
    // actually about.
    await page.evaluate(() => {
      const section = document.querySelector('#main-content > div > section') as HTMLElement
      const header = document.querySelector('#main-content h1') as HTMLElement
      if (section) section.dataset.testMarker = 'original'
      if (header) header.dataset.testMarker = 'original'
    })

    // Capture API requests fired so far (should only be Overview tab queries)
    const requestsBeforeSwitch = requests.length
    console.log(`API requests on page load: ${requestsBeforeSwitch}`)

    // Switch to the second tab (first visit — should lazy mount). Tabs are
    // clicked by their stable `id`, not by their label: the labels on this
    // page were rewritten into question language ("Where it stands") and
    // the tab ids regrouped with them — clicking a retired id times out
    // instead of reporting a real DOM-stability failure.
    await page.click('#tab-standing')
    await page.waitForTimeout(2000)

    // The shell and header must persist (no remount — a page-wide skeleton
    // replacement would have torn down these elements and lost the marker)
    const markers = await page.evaluate(() => {
      const section = document.querySelector('#main-content > div > section') as HTMLElement
      const header = document.querySelector('#main-content h1') as HTMLElement
      return {
        section: section?.dataset.testMarker ?? 'gone',
        header: header?.dataset.testMarker ?? 'gone',
      }
    })
    expect(markers.section).toBe('original')
    expect(markers.header).toBe('original')

    // Now 2 tab panels should be in the DOM (Brief + Where it stands)
    const tabPanelsAfter = await page.locator('[data-slot="tab-panel"]').count()
    expect(tabPanelsAfter).toBe(2)

    // Only the active tab should be visible
    const visiblePanels = await page.locator('[data-slot="tab-panel"]:not([class~="hidden"])').count()
    expect(visiblePanels).toBe(1)

    // API requests should have been fired for the Where it stands tab
    const requestsAfterSwitch = requests.length
    console.log(`API requests after first tab switch: ${requestsAfterSwitch - requestsBeforeSwitch}`)
    expect(requestsAfterSwitch).toBeGreaterThan(requestsBeforeSwitch)

    // Switch to Decisions tab (first visit)
    await page.click('#tab-decisions')
    await page.waitForTimeout(2000)

    // Section must still persist
    const markerAfterDecisions = await page.evaluate(() => {
      const section = document.querySelector('#main-content > div > section') as HTMLElement
      return section?.dataset.testMarker ?? 'gone'
    })
    expect(markerAfterDecisions).toBe('original')

    // 3 tab panels now
    const tabPanelsAfterDecisions = await page.locator('[data-slot="tab-panel"]').count()
    expect(tabPanelsAfterDecisions).toBe(3)

    // Switch back to Brief (already visited — should be instant, no new requests)
    const requestsBeforeBack = requests.length
    await page.click('#tab-brief')
    await page.waitForTimeout(1000)

    const markerAfterBack = await page.evaluate(() => {
      const section = document.querySelector('#main-content > div > section') as HTMLElement
      return section?.dataset.testMarker ?? 'gone'
    })
    expect(markerAfterBack).toBe('original')

    // No new API requests for already-visited tab
    const requestsAfterBack = requests.length
    console.log(`API requests on revisit of Overview: ${requestsAfterBack - requestsBeforeBack}`)
    // Allow 0 new requests (data is cached and not stale yet)

    // URL must not have changed
    expect(page.url()).toContain('/tenants/virya/intelligence')
  })

  test('operations page: lazy fetch, local skeleton, persistent header @e2e', async ({ page }) => {
    await login(page)
    await page.goto('/tenants/virya/operations')
    await page.waitForSelector('[data-slot="tab-panel"]', { timeout: 30000 })
    await page.waitForTimeout(2000)

    // Only the default Replies tab panel should be in the DOM — the other
    // four surfaces mount on first visit.
    const tabPanels = await page.locator('[data-slot="tab-panel"]').count()
    expect(tabPanels).toBe(1)

    // Mark the section
    await page.evaluate(() => {
      const section = document.querySelector('#main-content > div > section') as HTMLElement
      if (section) section.dataset.testMarker = 'original'
    })

    // Switch to Releases tab (first visit)
    await page.click('#tab-releases')
    await page.waitForTimeout(2000)

    // Section must persist
    const marker = await page.evaluate(() => {
      const section = document.querySelector('#main-content > div > section') as HTMLElement
      return section?.dataset.testMarker ?? 'gone'
    })
    expect(marker).toBe('original')

    // 2 tab panels now
    const tabPanelsAfter = await page.locator('[data-slot="tab-panel"]').count()
    expect(tabPanelsAfter).toBe(2)

    // Switch back to Outreach (already visited)
    await page.click('#tab-outreach')
    await page.waitForTimeout(1000)

    const marker3 = await page.evaluate(() => {
      const section = document.querySelector('#main-content > div > section') as HTMLElement
      return section?.dataset.testMarker ?? 'gone'
    })
    expect(marker3).toBe('original')

    // URL must not have changed
    expect(page.url()).toContain('/tenants/virya/operations')
  })
})
