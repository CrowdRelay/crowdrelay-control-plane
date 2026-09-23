/**
 * Drive contacts segment chips + the promote-all confirmation path.
 *
 * The contacts endpoint is route-intercepted so the spec does not depend on
 * a seeded scan: the suite's virya tenant may legitimately have no staged
 * contacts, while the chips exist to show counted segments. Everything else
 * on the page hits the real stack.
 *
 * @e2e
 */
import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'

const CONTACTS_URL = /\/api\/v1\/tenants\/virya\/operations\/gdrive-contacts(\?.*)?$/

const CONTACT = {
  id: 'b8f7c9a0-1234-4bcd-8def-000000000001',
  email: 'ania@example.com',
  display_name: 'Ania',
  organization: null,
  suggested_kind: null,
  city: null,
  notes: null,
  source_file_name: 'lista.csv',
  sources: ['gdrive'],
  last_seen_at: '2026-09-20T10:00:00Z',
  gone_from_source: false,
  fan_outcome: 'staged',
  beacon_outcome: 'staged',
  matched_venue: null,
  venue_played_here: false,
  matched_counterparty: null,
  counterparty_worked_with: false,
  counterparty_prior: null,
  venue_prior: null,
}

const COUNTS = { likely_fan: 7, likely_org: 3, beacon: 2, inactive: 1, gone: 4, decided: 9 }

test.describe('gdrive segment chips @e2e', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('chips render the upstream counts and the promote-all path confirms a number', async ({ page }) => {
    await page.route(CONTACTS_URL, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ contacts: [CONTACT], registry_summary: null, segment_counts: COUNTS }),
      }),
    )

    await page.goto('/tenants/virya/audience?tab=contacts')

    await expect(page.getByRole('button', { name: 'Likely fans · 7' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Organisations · 3' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Press & venues · 2' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Inactive · 1' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Gone · 4' })).toBeVisible()

    // The promote-all button only exists inside the likely_fan view —
    // selecting the chip refetches with ?segment= and opens the path.
    await page.getByRole('button', { name: 'Likely fans · 7' }).click()
    const promoteAll = page.getByRole('button', { name: /Promote all 7 likely fans/ })
    await expect(promoteAll).toBeVisible()
    await expect(promoteAll).toBeEnabled()

    // The dialog states the count being confirmed — the number is what
    // travels as expected_count and what upstream re-checks.
    await promoteAll.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm 7' })).toBeVisible()
  })

  test('no counts means no promote-all — a missing number is never a zero', async ({ page }) => {
    await page.route(CONTACTS_URL, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ contacts: [CONTACT], registry_summary: null, segment_counts: null }),
      }),
    )

    await page.goto('/tenants/virya/audience?tab=contacts')

    // Without counted segments there are no chips and no bulk path — the
    // per-row promote still works, but nothing offers a number to confirm.
    await expect(page.getByRole('button', { name: /Likely fans/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Promote all/ })).toHaveCount(0)
  })
})
