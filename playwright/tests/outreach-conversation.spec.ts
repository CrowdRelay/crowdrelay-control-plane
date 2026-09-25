/**
 * The outreach conversations list and its drawer — Operations → Outreach.
 *
 * The surface proxy is route-intercepted so the spec does not depend on a
 * seeded ledger: it stubs the contacts read, the per-contact conversation,
 * and captures the drawer's writes.
 *
 * Covers:
 *   - the roster lists contacts by stage, bounded to a screenful
 *   - a row opens the drawer: contact, what happens next, the letters, the
 *     thread — one screen answers "who do we write to, and why"
 *   - "Don't contact" posts the suppression, not a reply
 *
 * @e2e
 */
import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'

const CONTACTS_URL = /\/api\/v1\/tenants\/virya\/surface\/autopilot\/outreach-contacts(\?.*)?$/
const CONVERSATION_URL = /\/api\/v1\/tenants\/virya\/surface\/autopilot\/outreach-targets\/[0-9a-f-]+\/conversation$/
const WRITTEN_URL = /\/api\/v1\/tenants\/virya\/surface\/autopilot\/outreach-targets\/[0-9a-f-]+\/written$/
const SUPPRESS_URL = /\/api\/v1\/tenants\/virya\/surface\/autopilot\/outreach-targets\/[0-9a-f-]+\/suppression$/
const WAVES_URL = /\/api\/v1\/tenants\/virya\/surface\/autopilot\/outreach-waves$/

const TID_1 = '00000000-0000-4000-8000-0000000000a1'
const TID_2 = '00000000-0000-4000-8000-0000000000a2'

type Contact = Record<string, unknown>

const contact = (id: string, index: number, over: Partial<Contact> = {}): Contact => ({
  target_id: id,
  display_name: `Contact ${index}`,
  target_kind: 'press',
  state: 'waiting_on_them',
  last_message_at: '2026-09-20T10:00:00Z',
  answer_disposition: null,
  reply_label: null,
  messages_sent: 1,
  answers: 0,
  last_written_at: '2026-09-20T10:00:00Z',
  last_answered_at: null,
  ...over,
})

const contactsBody = (rows: Contact[]) => ({
  contacts: rows,
  counts: {
    your_turn: rows.filter(r => r.state === 'your_turn').length,
    waiting_on_them: rows.filter(r => r.state === 'waiting_on_them').length,
    not_contacted: rows.filter(r => r.state === 'not_contacted').length,
    closed: rows.filter(r => r.state === 'closed').length,
    total: rows.length,
  },
})

const conversationBody = (id: string) => ({
  contact: {
    target_id: id,
    display_name: 'Bydgoszcz radio',
    target_kind: 'press',
    contact_email: 'redakcja@radio.pl',
    active: true,
    verified: true,
    accepts_outreach: true,
    do_not_contact: false,
    version: 4,
    last_reply_disposition: 'none',
  },
  timeline: [
    {
      direction: 'outbound',
      phase: 'initial',
      disposition: 'none',
      author: 'sheet',
      occurred_at: '2026-09-20T10:00:00Z',
      reply_label: null,
      reply_text: null,
    },
  ],
  letters: [
    {
      action_id: '00000000-0000-4000-8000-0000000000c1',
      status: 'awaiting_approval',
      phase: 'followup',
      template_key: 'outreach.thread.v1',
      wave_id: '00000000-0000-4000-8000-0000000000b1',
      subject: 'Following up — Virya',
      body: 'Hi Bydgoszcz radio,\n\nFollowing up on my message from 20 Sep.',
      created_at: '2026-10-02T09:00:00Z',
      finished_at: null,
    },
  ],
  next: {
    kind: 'in_wave',
    detail: 'sealed in a wave — your approval sends it',
    due_at: null,
    wave_id: '00000000-0000-4000-8000-0000000000b1',
  },
})

const stubSurface = async (page: import('@playwright/test').Page) => {
  const rows = Array.from({ length: 18 }, (_, i) =>
    contact(`00000000-0000-4000-8000-${String(i + 16).padStart(12, '0')}`, i + 3),
  )
  await page.route(CONTACTS_URL, route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        contactsBody([
          contact(TID_1, 1),
          contact(TID_2, 2, { state: 'your_turn', answers: 1 }),
          ...rows,
        ]),
      ),
    }),
  )
  await page.route(CONVERSATION_URL, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conversationBody(TID_1)) }),
  )
  await page.route(WAVES_URL, route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
}

// A row's open affordance is the contact block — one role=button per row,
// named by the contact and its detail line.
const row = (page: import('@playwright/test').Page, name: RegExp | string) =>
  page.getByRole('button', { name })

test.describe('outreach conversation drawer @e2e', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('the roster is bounded and a row opens the whole thread', async ({ page }) => {
    await stubSurface(page)
    await page.goto('/tenants/virya/operations?tab=outreach')

    // The stage the platform view calls "last message outbound".
    await page.getByRole('tab', { name: /Last message outbound/ }).click()

    // Bounded to a screenful; the ledger holds twenty.
    await expect(row(page, /Contact \d+/)).toHaveCount(15)
    await expect(page.getByRole('button', { name: 'Show all 20' })).toBeVisible()

    await row(page, /Contact 3/).click()

    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('heading', { name: 'Bydgoszcz radio' })).toBeVisible()
    await expect(drawer.getByText('redakcja@radio.pl')).toBeVisible()
    // "Who do we write to, and why" — the evaluator's own answer.
    await expect(drawer.getByText(/sealed in a wave/)).toBeVisible()
    // The letter the machine drafted, and the sheet's message in the thread.
    await expect(drawer.getByText('Following up — Virya')).toBeVisible()
    await expect(drawer.getByText(/the sheet wrote/)).toBeVisible()
    // All three controls are a press away.
    await expect(drawer.getByRole('button', { name: 'I wrote back' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Log their answer' })).toBeVisible()
    await expect(drawer.getByRole('button', { name: "Don't contact" })).toBeVisible()
  })

  test('"Don\'t contact" posts a suppression and never a reply', async ({ page }) => {
    await stubSurface(page)
    const writes: Record<string, unknown>[] = []
    await page.route(SUPPRESS_URL, route => {
      writes.push(route.request().postDataJSON() as Record<string, unknown>)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ operation_id: 'x', target_id: TID_1, status: 'suppression_recorded', replayed: false }),
      })
    })
    await page.route(WRITTEN_URL, route => route.fulfill({ status: 500, body: 'must not fire' }))

    await page.goto('/tenants/virya/operations?tab=outreach')
    await page.getByRole('tab', { name: /Last message outbound/ }).click()
    await row(page, /Contact 3/).click()

    const drawer = page.getByRole('dialog')
    // First press opens the form, second arms the confirm, third sends.
    await drawer.getByRole('button', { name: "Don't contact" }).click()
    await drawer.getByRole('button', { name: "Don't contact" }).click()
    await drawer.getByRole('button', { name: /yes, don't contact/i }).click()

    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0].do_not_contact).toBe(true)
    expect(typeof writes[0].occurred_at).toBe('string')
  })
})
