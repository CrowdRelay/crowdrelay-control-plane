/**
 * Beacon roster — the operator-facing amplifier list under Audience →
 * Contacts.
 *
 * The beacon endpoints are route-intercepted so the spec does not depend on
 * a seeded roster: it stubs the dashboard, the candidates list and the
 * network funnel, and captures every batch-invite POST to prove a
 * city-scale select goes out in waves the upstream cap accepts.
 *
 * Covers the acceptance criteria from the operator's report:
 *   - "select all N invitable" then "Invite" actually invites — 297 ids must
 *     leave as waves of at most 200, never one refused request
 *   - a roster longer than a screen renders a screenful, not the whole list
 *   - an entity wearing several kinds reads as one row with both hats, and
 *     stored enum tokens render as words ("local press", not "local_press")
 *
 * @e2e
 */
import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'

const DASHBOARD_URL = /\/api\/v1\/tenants\/virya\/operations\/beacon-signal$/
const CANDIDATES_URL = /\/api\/v1\/tenants\/virya\/operations\/beacon-signal\/candidates$/
const NETWORK_URL = /\/api\/v1\/tenants\/virya\/operations\/beacon-network$/
const BATCH_URL = /\/api\/v1\/tenants\/virya\/operations\/beacons\/signal-invites\/batch$/

type Profile = Record<string, unknown>

const profile = (index: number, over: Profile = {}): Profile => ({
  beaconId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  displayName: `Amplifier ${index}`,
  beaconKind: 'radio',
  contactEmail: `amplifier${index}@example.com`,
  city: 'Bydgoszcz',
  status: 'unverified',
  radiusKm: 0,
  locale: '',
  nearbyGigsEnabled: false,
  inviteCount: 0,
  lastInvitedAt: null,
  inviteExpiresAt: null,
  joinedAt: null,
  lastSeenAt: null,
  activeSessions: 0,
  activePushEndpoints: 0,
  openPressRequests: 0,
  activeEngagements: 0,
  coverageCount: 0,
  verified: true,
  acceptsOutreach: true,
  doNotContact: false,
  ...over,
})

const dashboard = (profiles: Profile[]) => ({
  total: profiles.length,
  active: profiles.filter(p => p.status === 'active').length,
  invited: profiles.filter(p => p.status === 'invited').length,
  paused: profiles.filter(p => p.status === 'paused').length,
  revoked: profiles.filter(p => p.status === 'revoked').length,
  profiles,
})

const stubReads = async (page: import('@playwright/test').Page, profiles: Profile[]) => {
  await page.route(DASHBOARD_URL, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboard(profiles)) }),
  )
  await page.route(CANDIDATES_URL, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [] }) }),
  )
  await page.route(NETWORK_URL, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ researchedAvailable: 0, discoveryRuns: [], inviteJobs: [] }),
    }),
  )
}

test.describe('beacon roster @e2e', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('inviting a city-scale selection goes out in waves under the cap', async ({ page }) => {
    const profiles = Array.from({ length: 297 }, (_, i) => profile(i + 1))
    await stubReads(page, profiles)

    const waves: number[] = []
    await page.route(BATCH_URL, route => {
      const body = route.request().postDataJSON() as { beaconIds: string[] }
      waves.push(body.beaconIds.length)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ created: body.beaconIds.length, skipped: 0, invitations: [] }),
      })
    })

    await page.goto('/tenants/virya/audience/contacts')

    // The roster shows a screenful; the select-all reaches the whole
    // filtered set, rendered or not.
    await expect(page.getByRole('button', { name: 'Select all 297 invitable' })).toBeVisible()
    await page.getByRole('button', { name: 'Select all 297 invitable' }).click()
    await page.getByRole('button', { name: 'Invite 297 to Signal' }).click()

    await expect(page.getByText('297 invitations sent.')).toBeVisible()
    expect(waves).toEqual([200, 97])
  })

  test('a roster longer than a screen renders fifteen rows, then all on request', async ({ page }) => {
    const profiles = Array.from({ length: 20 }, (_, i) => profile(i + 1))
    await stubReads(page, profiles)
    // A folded entity arrives with several kinds joined upstream — the cell
    // says both hats as words, not raw enum tokens.
    profiles[0] = profile(1, { beaconKind: 'community · creator', contactEmail: null })
    profiles[1] = profile(2, { beaconKind: 'local_press' })

    await page.goto('/tenants/virya/audience/contacts')

    const roster = page.locator('table', { has: page.getByRole('columnheader', { name: 'Amplifier' }) })
    await expect(roster.locator('tbody tr')).toHaveCount(15)
    await expect(page.getByRole('button', { name: 'Show all 20' })).toBeVisible()

    // Enum tokens never reach the cell — underscores become words, and a
    // multi-kind entity keeps both hats.
    await expect(roster.getByText('community · creator', { exact: false })).toBeVisible()
    await expect(roster.getByText('local press', { exact: false })).toBeVisible()
    await expect(roster.getByText('local_press', { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Show all 20' }).click()
    await expect(roster.locator('tbody tr')).toHaveCount(20)
    await expect(page.getByRole('button', { name: 'Show fewer' })).toBeVisible()
  })
})
