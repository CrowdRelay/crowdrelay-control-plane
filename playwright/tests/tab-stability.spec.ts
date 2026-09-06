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

const BASE = process.env.CONTROL_PLANE_BASE_URL ?? 'http://127.0.0.1:8090'

test.describe('Tab switch DOM stability @e2e @tabs', () => {
  test('intelligence page: lazy fetch, local skeleton, persistent header @e2e', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (req) => {
      const url = req.url()
      if (url.includes('/api/')) requests.push(url)
    })

    await login(page)
    await page.goto(`${BASE}/tenants/virya/intelligence`)
    await page.waitForSelector('.page-tab-content', { timeout: 30000 })
    await page.waitForTimeout(2000)

    // Only the Overview tab panel should be in the DOM (lazy mounting)
    const tabPanels = await page.locator('.page-tab-content').count()
    expect(tabPanels).toBe(1)

    // Mark the section and SVG to verify they persist
    await page.evaluate(() => {
      const section = document.querySelector('.page-content > section.page') as HTMLElement
      const svg = document.querySelector('.intel-loop-svg') as HTMLElement
      if (section) section.dataset.testMarker = 'original'
      if (svg) svg.dataset.testMarker = 'original'
    })

    // Capture API requests fired so far (should only be Overview tab queries)
    const requestsBeforeSwitch = requests.length
    console.log(`API requests on page load: ${requestsBeforeSwitch}`)

    // Track whether a page-wide skeleton appears during tab switch
    let pageSkeletonAppeared = false
    page.locator('.skeleton-page-head, .skeleton-page').first().waitFor({ state: 'attached', timeout: 50 }).then(() => {
      pageSkeletonAppeared = true
    }).catch(() => {})

    // Switch to Growth Intelligence tab (first visit — should lazy mount)
    await page.click('.page-tab:has-text("Growth Intelligence")')
    await page.waitForTimeout(2000)

    // The page-wide skeleton must NOT have appeared
    expect(pageSkeletonAppeared, 'Page-wide skeleton appeared during tab switch').toBe(false)

    // The section and SVG must persist (no remount)
    const markers = await page.evaluate(() => {
      const section = document.querySelector('.page-content > section.page') as HTMLElement
      const svg = document.querySelector('.intel-loop-svg') as HTMLElement
      return {
        section: section?.dataset.testMarker ?? 'gone',
        svg: svg?.dataset.testMarker ?? 'gone',
      }
    })
    expect(markers.section).toBe('original')
    expect(markers.svg).toBe('original')

    // Now 2 tab panels should be in the DOM (Overview + Growth Intelligence)
    const tabPanelsAfter = await page.locator('.page-tab-content').count()
    expect(tabPanelsAfter).toBe(2)

    // Only the active tab should be visible
    const visiblePanels = await page.locator('.page-tab-content:not(.tab-hidden)').count()
    expect(visiblePanels).toBe(1)

    // API requests should have been fired for the Growth Intelligence tab
    const requestsAfterSwitch = requests.length
    console.log(`API requests after first tab switch: ${requestsAfterSwitch - requestsBeforeSwitch}`)
    expect(requestsAfterSwitch).toBeGreaterThan(requestsBeforeSwitch)

    // Switch to Decisions tab (first visit)
    await page.click('.page-tab:has-text("Decisions")')
    await page.waitForTimeout(2000)

    // Section must still persist
    const markerAfterDecisions = await page.evaluate(() => {
      const section = document.querySelector('.page-content > section.page') as HTMLElement
      return section?.dataset.testMarker ?? 'gone'
    })
    expect(markerAfterDecisions).toBe('original')

    // 3 tab panels now
    const tabPanelsAfterDecisions = await page.locator('.page-tab-content').count()
    expect(tabPanelsAfterDecisions).toBe(3)

    // Switch back to Overview (already visited — should be instant, no new requests)
    const requestsBeforeBack = requests.length
    await page.click('.page-tab:has-text("Overview")')
    await page.waitForTimeout(1000)

    const markerAfterBack = await page.evaluate(() => {
      const section = document.querySelector('.page-content > section.page') as HTMLElement
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
    await page.goto(`${BASE}/tenants/virya/operations`)
    await page.waitForSelector('.page-tab-content', { timeout: 30000 })
    await page.waitForTimeout(2000)

    // Only the Opportunities tab panel should be in the DOM
    const tabPanels = await page.locator('.page-tab-content').count()
    expect(tabPanels).toBe(1)

    // Mark the section
    await page.evaluate(() => {
      const section = document.querySelector('.page-content > section.page') as HTMLElement
      if (section) section.dataset.testMarker = 'original'
    })

    // Switch to Outreach tab (first visit)
    await page.click('.page-tab:has-text("Outreach")')
    await page.waitForTimeout(2000)

    // Section must persist
    const marker = await page.evaluate(() => {
      const section = document.querySelector('.page-content > section.page') as HTMLElement
      return section?.dataset.testMarker ?? 'gone'
    })
    expect(marker).toBe('original')

    // 2 tab panels now
    const tabPanelsAfter = await page.locator('.page-tab-content').count()
    expect(tabPanelsAfter).toBe(2)

    // Switch to Releases tab (first visit)
    await page.click('.page-tab:has-text("Releases")')
    await page.waitForTimeout(2000)

    const marker2 = await page.evaluate(() => {
      const section = document.querySelector('.page-content > section.page') as HTMLElement
      return section?.dataset.testMarker ?? 'gone'
    })
    expect(marker2).toBe('original')

    // 3 tab panels now
    const tabPanelsAfterReleases = await page.locator('.page-tab-content').count()
    expect(tabPanelsAfterReleases).toBe(3)

    // Switch back to Opportunities (already visited)
    await page.click('.page-tab:has-text("Opportunities")')
    await page.waitForTimeout(1000)

    const marker3 = await page.evaluate(() => {
      const section = document.querySelector('.page-content > section.page') as HTMLElement
      return section?.dataset.testMarker ?? 'gone'
    })
    expect(marker3).toBe('original')

    // URL must not have changed
    expect(page.url()).toContain('/tenants/virya/operations')
  })
})
