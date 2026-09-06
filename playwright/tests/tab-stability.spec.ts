/**
 * Tab switch DOM stability — verifies that switching tabs on tenant subpages
 * only toggles CSS classes, never remounts the page or tab panels.
 *
 * This guards against regressions where tab switches cause:
 * - full-page skeleton replacement
 * - DOM teardown of persistent elements (header, SVG, tab bar)
 * - scroll jumps from layout shifts
 * - refetching already-loaded data
 *
 * @e2e @tabs
 */
import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'

const BASE = process.env.CONTROL_PLANE_BASE_URL ?? 'http://127.0.0.1:8090'

test.describe('Tab switch DOM stability @e2e @tabs', () => {
  test('intelligence page: all tabs eager-mounted, switching is class-only @e2e', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/tenants/virya/intelligence`)
    await page.waitForSelector('.page-tab-content')
    await page.waitForTimeout(2000)

    // All 4 tab panels should be in the DOM immediately (eager mounting)
    const tabPanels = await page.locator('.page-tab-content').count()
    expect(tabPanels).toBe(4)

    // Only the active tab should be visible
    const visiblePanels = await page.locator('.page-tab-content:not(.tab-hidden)').count()
    expect(visiblePanels).toBe(1)

    // Mark the section and SVG to verify they persist across tab switches
    await page.evaluate(() => {
      const section = document.querySelector('.page-content > section.page') as HTMLElement
      const svg = document.querySelector('.intel-loop-svg') as HTMLElement
      if (section) section.dataset.testMarker = 'original'
      if (svg) svg.dataset.testMarker = 'original'
    })

    // Switch through all tabs and verify no DOM removal/addition
    const tabs = ['Growth Intelligence', 'Decisions', 'Learning', 'Overview']
    for (const tabName of tabs) {
      // Track mutations during this switch
      await page.evaluate(() => {
        (window as any).__tabMutations = { removed: 0, added: 0, attr: 0 }
        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'childList') {
              ;(window as any).__tabMutations.removed += m.removedNodes.length
              ;(window as any).__tabMutations.added += m.addedNodes.length
            } else if (m.type === 'attributes') {
              ;(window as any).__tabMutations.attr++
            }
          }
        })
        observer.observe(document.querySelector('.page-content')!, {
          childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
        })
      })

      await page.click(`.page-tab:has-text("${tabName}")`)
      await page.waitForTimeout(800)

      const mutations = await page.evaluate(() => (window as any).__tabMutations)

      // Tab switches must be class-only — no DOM node removal or addition
      expect(mutations.removed, `${tabName}: DOM nodes removed during tab switch`).toBe(0)
      expect(mutations.added, `${tabName}: DOM nodes added during tab switch`).toBe(0)
      expect(mutations.attr, `${tabName}: no class changes during tab switch`).toBeGreaterThan(0)
    }

    // The section and SVG must still be the same elements (not re-created)
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

    // URL must not have changed (tabs are local state, not routes)
    expect(page.url()).toContain('/tenants/virya/intelligence')
  })

  test('operations page: all tabs eager-mounted, switching is class-only @e2e', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/tenants/virya/operations`)
    await page.waitForSelector('.page-tab-content')
    await page.waitForTimeout(2000)

    // All 3 tab panels should be in the DOM immediately
    const tabPanels = await page.locator('.page-tab-content').count()
    expect(tabPanels).toBe(3)

    // Only the active tab should be visible
    const visiblePanels = await page.locator('.page-tab-content:not(.tab-hidden)').count()
    expect(visiblePanels).toBe(1)

    // Mark the section to verify it persists
    await page.evaluate(() => {
      const section = document.querySelector('.page-content > section.page') as HTMLElement
      if (section) section.dataset.testMarker = 'original'
    })

    // Switch through all tabs
    const tabs = ['Outreach', 'Releases', 'Opportunities']
    for (const tabName of tabs) {
      await page.evaluate(() => {
        (window as any).__tabMutations = { removed: 0, added: 0, attr: 0 }
        const observer = new MutationObserver((mutations) => {
          for (const m of mutations) {
            if (m.type === 'childList') {
              ;(window as any).__tabMutations.removed += m.removedNodes.length
              ;(window as any).__tabMutations.added += m.addedNodes.length
            } else if (m.type === 'attributes') {
              ;(window as any).__tabMutations.attr++
            }
          }
        })
        observer.observe(document.querySelector('.page-content')!, {
          childList: true, subtree: true, attributes: true, attributeFilter: ['class'],
        })
      })

      await page.click(`.page-tab:has-text("${tabName}")`)
      await page.waitForTimeout(800)

      const mutations = await page.evaluate(() => (window as any).__tabMutations)

      expect(mutations.removed, `${tabName}: DOM nodes removed during tab switch`).toBe(0)
      expect(mutations.added, `${tabName}: DOM nodes added during tab switch`).toBe(0)
      expect(mutations.attr, `${tabName}: no class changes during tab switch`).toBeGreaterThan(0)
    }

    // The section must persist
    const marker = await page.evaluate(() => {
      const section = document.querySelector('.page-content > section.page') as HTMLElement
      return section?.dataset.testMarker ?? 'gone'
    })
    expect(marker).toBe('original')

    // URL must not have changed
    expect(page.url()).toContain('/tenants/virya/operations')
  })
})
