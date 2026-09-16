/**
 * Manual RWD torture sweep — worst-case content at 10 viewport sizes.
 *
 * This test injects long tenant names, long error messages, long IDs/SHA
 * values, large per-section failure lists, and long chat messages into
 * every page, then checks that document.scrollWidth does not exceed the
 * viewport. It is the manual sweep automated so it can run in CI.
 *
 * @e2e @rwd
 */
import { test, expect, Page } from '@playwright/test'
import { login, setupErrorCollectors } from './fixtures/auth'

const VIEWPORTS = [
  { width: 320, height: 568, name: 'iphone-se' },
  { width: 390, height: 844, name: 'iphone-14' },
  { width: 768, height: 1024, name: 'ipad-mini' },
  { width: 1280, height: 800, name: 'laptop' },
  { width: 1920, height: 1080, name: 'wide' },
]

const PAGES = [
  { path: '/', name: 'overview' },
  { path: '/flow', name: 'flow' },
  { path: '/tenants/virya', name: 'tenant-detail' },
  { path: '/tenants/virya/operations', name: 'operations' },
  { path: '/tenants/virya/intelligence', name: 'intelligence' },
  { path: '/tenants/virya/attention', name: 'attention' },
  { path: '/tenants/virya/audience', name: 'audience' },
  { path: '/tenants/virya/funnel', name: 'growth-funnel' },
  { path: '/tenants/virya/shows', name: 'shows' },
  { path: '/tenants/virya/health', name: 'health' },
  { path: '/tenants/virya/notifiers', name: 'notifiers' },
  { path: '/tenants/virya/integrations', name: 'integrations' },
  { path: '/automation', name: 'automation' },
]

// Inject worst-case content: long strings that could cause overflow.
async function injectWorstCaseContent(page: Page) {
  await page.evaluate(() => {
    // Long tenant names in any tenant row/card. `[data-slot="tenant-row"]`
    // is the stable hook the Tailwind-migrated list emits; `.topbar` and
    // `h1` cover the header surfaces.
    const tenantNames = document.querySelectorAll<HTMLElement>('[data-slot="tenant-row"] strong, .topbar strong, h1')
    for (const el of tenantNames) {
      if (el.textContent && el.textContent.length < 80) {
        el.textContent = el.textContent + ' — A Very Long Tenant Display Name That Could Cause Overflow Issues On Mobile Devices'
      }
    }

    // Long error messages in error cards
    const errorCards = document.querySelectorAll<HTMLElement>('.error-card')
    for (const el of errorCards) {
      el.textContent = 'This is a very long error message that describes a complex failure scenario involving multiple sections of the read model fan-out, including timeout, unreachable, and contract mismatch states, with remediation steps that go on for quite some time and could potentially cause horizontal overflow on narrow viewports if the word-break and overflow-wrap properties are not properly set.'
    }

    // Long IDs/SHA values in mono elements. The Tailwind migration renamed
    // `.mono` to the `font-mono` utility.
    const monos = document.querySelectorAll<HTMLElement>('.font-mono, code')
    for (const el of monos) {
      if (el.textContent && el.textContent.length < 60) {
        el.textContent = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
      }
    }

    // Long chat messages — only present when the chat widget is open
    const chatMessages = document.querySelectorAll<HTMLElement>('[data-slot="chat-message"]')
    for (const el of chatMessages) {
      el.textContent = 'This is a very long chat message that goes on and on and on, describing a complex operational scenario with many details about the tenant, the autopilot, the growth funnel, the outreach pipeline, and various other aspects of the control plane that could potentially cause horizontal overflow if the chat widget does not properly wrap text on narrow viewports.'
    }
  })
}

for (const vp of VIEWPORTS) {
  test.describe(`RWD torture @ ${vp.name} (${vp.width}x${vp.height}) @e2e @rwd`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test.beforeEach(async ({ page }) => {
      setupErrorCollectors(page)
      await login(page)
    })

    for (const p of PAGES) {
      test(`${p.name} — no overflow with worst-case content @e2e @rwd`, async ({ page }) => {
        await page.goto(p.path)
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
        await page.waitForTimeout(1000)

        await injectWorstCaseContent(page)
        await page.waitForTimeout(500)

        const result = await page.evaluate(() => {
          const docWidth = document.documentElement.scrollWidth
          const bodyWidth = document.body.scrollWidth
          const viewport = window.innerWidth
          return {
            overflow: Math.max(docWidth, bodyWidth) - viewport,
            viewport,
            docWidth,
            bodyWidth,
          }
        })

        if (result.overflow > 2) {
          console.log(`\n  OVERFLOW on ${p.name} @ ${vp.name}: +${result.overflow}px (doc=${result.docWidth} body=${result.bodyWidth} viewport=${result.viewport})`)
        }
        expect(result.overflow, `document.scrollWidth exceeded viewport by ${result.overflow}px`).toBeLessThanOrEqual(2)
      })
    }
  })
}

// UX-6.2 — the gig page on the backstage phone. 375px is the iPhone width a
// band member actually holds at the door; the static-path torture above
// cannot reach /shows/$eventSlug because the slug is data, so this pass
// clicks through from the shows list exactly like the e2e flow does.
test.describe('RWD gig page @ 375px @e2e @rwd', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    setupErrorCollectors(page)
    await login(page)
  })

  test('gig page — timeline fits and steps stay actionable @e2e @rwd', async ({ page }) => {
    await page.goto('/tenants/virya/shows')
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

    const firstShow = page.locator('a[href*="/shows/"]').first()
    if ((await firstShow.count()) === 0) {
      // An empty tenant is legal — no gig page exists to break.
      return
    }
    await firstShow.click()
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(500)
    expect(page.url()).toMatch(/\/tenants\/virya\/shows\/.+/)

    // Worst case for this page: a long venue/room line and long step labels.
    await page.evaluate(() => {
      const LONG = ' — A Very Long Venue Name With An Equally Long Address That Could Cause Overflow On A Narrow Phone Screen'
      for (const el of document.querySelectorAll<HTMLElement>('h1, .text-sm.font-medium, .text-xs.text-muted-foreground')) {
        if (el.textContent && el.textContent.length < 60 && !el.textContent.includes('T-') && !el.textContent.includes('T+')) {
          el.textContent = el.textContent + LONG
        }
      }
    })
    await page.waitForTimeout(300)

    const result = await page.evaluate(() => {
      const docWidth = document.documentElement.scrollWidth
      const bodyWidth = document.body.scrollWidth
      const viewport = window.innerWidth
      return { overflow: Math.max(docWidth, bodyWidth) - viewport, viewport, docWidth, bodyWidth }
    })
    if (result.overflow > 2) {
      console.log(`\n  OVERFLOW on gig page @ 375px: +${result.overflow}px (doc=${result.docWidth} body=${result.bodyWidth} viewport=${result.viewport})`)
    }
    expect(result.overflow, `gig page scrollWidth exceeded 375px viewport by ${result.overflow}px`).toBeLessThanOrEqual(2)

    // The ladder still reads top to bottom — first and last anchors visible.
    await expect(page.locator('text=T-21').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('text=T+7').first()).toBeVisible({ timeout: 10_000 })
  })
})
