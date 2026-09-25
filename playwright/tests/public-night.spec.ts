/**
 * Public night page — the organiser lens at `/nights/{slug}/{token}`.
 *
 * The reader is a stranger on a phone: no session, thirty seconds, the
 * whole credential in the link. These tests stub the one API call the page
 * makes (`GET /api/v1/public/nights/{slug}/{token}`) so the artifact's
 * render is exercised deterministically — a live token cannot be seeded
 * into a test run.
 *
 * Covers the UX-roadmap counterparty acceptance criteria:
 *   - a live link answers "what is this, is it on, who plays, what it
 *     brought" without scrolling sideways at 375px
 *   - a dead/rotated token reads as one not-found, never a leaked state
 *
 * @public @e2e
 */
import { test, expect } from '@playwright/test'

const SLUG = 'virya'
const TOKEN = '11111111-2222-3333-4444-555555555555'
const PAGE_PATH = `/nights/${SLUG}/${TOKEN}`
const API_PATH = `/api/v1/public/nights/${SLUG}/${TOKEN}`

const ORGANISER_NIGHT = {
  place_event_id: '99999999-8888-7777-6666-555555555555',
  lens: 'organiser',
  venue: { display_name: 'Klub NRD', city_name: 'Toruń' },
  event_date: '2026-10-17',
  lineup: [
    { act_slug: 'furydate', name: 'Furydate', position: 0, confirmed: true },
    { act_slug: 'virya', name: 'VIRYA', position: 1, confirmed: true },
    { act_slug: 'impala', name: 'Impala', position: 2, confirmed: false },
  ],
  status: { published: 1, cancelled: 1 },
  combined_reachable: 234,
  tickets_sold: 61,
  capacity: 150,
  payout_total_minor: 350000,
  announce: [
    { act: 'VIRYA', state: 'announced' },
    { act: null, state: 'planned' },
  ],
}

// No viewport override here — each project keeps its own: chromium at the
// default desktop width, mobile-320 at the smallest real screen. The
// stranger-on-a-phone check is the mobile project; desktop stays honest.

test.describe('Public night — organiser lens @public', () => {
  test('renders what a stranger needs: identity, status, bill, sums @e2e', async ({ page }) => {
    await page.route(API_PATH, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ORGANISER_NIGHT) }),
    )
    await page.goto(PAGE_PATH)

    // The 30-second read: venue, city, date, the night's status, the bill.
    await expect(page.getByRole('heading', { name: /Klub NRD · Toruń/ })).toBeVisible()
    await expect(page.getByText('17 October 2026')).toBeVisible()
    // A cancelled show stays on the calendar and reads as cancelled.
    await expect(page.getByText('Cancelled')).toBeVisible()
    // The bill, in running order.
    await expect(page.getByText('Furydate')).toBeVisible()
    await expect(page.getByText('VIRYA').first()).toBeVisible()
    // Sums a stranger can parse — labels say what the number is.
    await expect(page.getByText('People the bill can reach')).toBeVisible()
    await expect(page.getByText('234')).toBeVisible()
    // Humanized announce states, not raw schema keys.
    await expect(page.getByText('VIRYA — announced the night')).toBeVisible()
    await expect(page.getByText('An unnamed act — plans to announce')).toBeVisible()
    // Provenance sentence — the honesty of the artifact.
    await expect(page.getByText(/what an act chose to publish/)).toBeVisible()
  })

  test('no horizontal scroll at 375px @e2e @rwd', async ({ page }) => {
    await page.route(API_PATH, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ORGANISER_NIGHT) }),
    )
    await page.goto(PAGE_PATH)
    await expect(page.getByRole('heading', { name: /Klub NRD/ })).toBeVisible()

    const overflow = await page.evaluate(() => {
      const viewport = window.innerWidth
      const widest = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
      const culprits: string[] = []
      for (const el of document.querySelectorAll('*')) {
        const rect = el.getBoundingClientRect()
        if (rect.right > viewport + 2 && rect.width > 2) {
          culprits.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className} right=${rect.right.toFixed(0)}`)
          if (culprits.length >= 5) break
        }
      }
      return { over: widest - viewport, culprits }
    })
    expect(overflow.over, `page scrolls sideways by ${overflow.over}px; culprits: ${overflow.culprits.join(', ')}`).toBeLessThanOrEqual(0)
  })

  test('honest gaps: absent figures render as —, not 0 @e2e', async ({ page }) => {
    const sparse = { ...ORGANISER_NIGHT, combined_reachable: null, capacity: null, payout_total_minor: null, announce: [] }
    await page.route(API_PATH, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(sparse) }),
    )
    await page.goto(PAGE_PATH)
    await expect(page.getByRole('heading', { name: /Klub NRD/ })).toBeVisible()
    // Unmeasured cells read as the dash, never a fake zero.
    const facts = page.getByText('—', { exact: true })
    await expect(facts.first()).toBeVisible()
    expect(await facts.count()).toBeGreaterThanOrEqual(3)
    // The empty announce list leaves no "Announcements" husk.
    await expect(page.getByText('What the acts posted')).toHaveCount(0)
  })

  test('a dead token reads as one not-found @e2e', async ({ page }) => {
    await page.route(API_PATH, route =>
      route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not found' }) }),
    )
    await page.goto(PAGE_PATH)
    await expect(page.getByText(/This link does not resolve/)).toBeVisible()
    // No partial artifact bleeds through on a dead link.
    await expect(page.getByText('The bill')).toHaveCount(0)
  })
})
