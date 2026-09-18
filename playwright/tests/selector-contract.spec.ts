/**
 * Selector contract — the suite's load-bearing hooks, asserted directly.
 *
 * The Tailwind/shadcn migration removed the class names several specs
 * asserted on (`.tenant-row`, `.panel`, `.chat-msg-content`, `.cockpit-*`)
 * and the failures showed up as unrelated test noise. These hooks are the
 * contract: `data-slot` attributes, `role` landmarks, and the structural
 * attributes the shared primitives emit. If a redesign drops one, this
 * spec fails with the hook's name — not a cascade of layout assertions.
 *
 * @e2e
 */
import { test, expect } from '@playwright/test'
import { login } from './fixtures/auth'

test.describe('Selector contract @e2e', () => {
  test('overview emits the needs-you card, the kpi strip and tenant rows @e2e', async ({ page }) => {
    await login(page)
    // The Shell redirects / → the selected tenant once per session after
    // login; the flag keeps / on the OverviewPage (same as e2e.spec).
    await page.addInitScript(() => sessionStorage.setItem('cp-default-tenant', '1'))
    await page.goto('/')
    // The Needs-you card and the tenants table are the overview's drill-in
    // units — e2e locates them by these hooks.
    await expect(page.locator('[data-slot="needs-you"]')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('[data-slot="tenant-row"]').first()).toBeVisible({ timeout: 30000 })
    expect(await page.locator('[data-kpi-strip]').count()).toBeGreaterThan(0)
    // The shared Card primitive — css-audit measures these for spacing and
    // overflow.
    expect(await page.locator('[data-card]').count()).toBeGreaterThan(0)
  })

  test('tenants list emits tenant-row hooks @e2e', async ({ page }) => {
    await login(page)
    await page.goto('/tenants')
    await expect(page.locator('[data-slot="tenant-row"]').first()).toBeVisible({ timeout: 30000 })
  })

  test('tenant intelligence page emits tab-panel hooks @e2e', async ({ page }) => {
    await login(page)
    await page.goto('/tenants/virya/intelligence')
    await expect(page.locator('[data-slot="tab-panel"]').first()).toBeVisible({ timeout: 30000 })
  })

  test('chat widget emits the message hook @e2e', async ({ page }) => {
    await login(page)
    await page.goto('/tenants/virya')
    // The widget is lazy — the entry point is its launcher button.
    const launcher = page.locator('button[aria-label="Open AI Assistant"]')
    await expect(launcher).toBeVisible({ timeout: 30000 })
    await launcher.click()
    // The user's own message renders with the hook immediately on send —
    // no dependency on the agent service answering.
    await page.locator('[role="dialog"] textarea').fill('selector contract probe')
    await page.locator('button[aria-label="Send message"]').click()
    await expect(page.locator('[data-slot="chat-message"]').first()).toBeVisible({ timeout: 10000 })
  })
})
