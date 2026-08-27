/**
 * Authentication helper for control.virya.music tests.
 *
 * Reads credentials from env vars (set in .env or CI secrets):
 * - CONTROL_PLANE_TEST_USER: username/email
 * - CONTROL_PLANE_TEST_PASS: password
 *
 * Falls back to checking if the page has a login form and filling it.
 * If already authenticated (session cookie), skips login.
 */
import { Page, expect } from '@playwright/test'

export interface AuthConfig {
  user: string
  pass: string
}

export function getAuthConfig(): AuthConfig | null {
  const user = process.env.CONTROL_PLANE_TEST_USER
  const pass = process.env.CONTROL_PLANE_TEST_PASS
  if (!user || !pass) return null
  return { user, pass }
}

export async function isAuthenticated(page: Page): Promise<boolean> {
  // Check if we're on a page that requires auth by looking for the app shell
  // vs. a login redirect
  const url = page.url()
  if (url.includes('/login') || url.includes('/auth')) return false
  // Look for app-specific elements that only appear when authenticated
  const appShell = await page.locator('[data-testid="app-shell"], .authenticated-app, nav, .sidebar').count()
  return appShell > 0
}

export async function login(page: Page, config: AuthConfig) {
  await page.goto('/')
  // Wait for potential redirect to login
  await page.waitForLoadState('networkidle')

  // Check if already logged in
  if (await isAuthenticated(page)) return

  // Look for login form
  const emailField = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail" i]').first()
  const passField = page.locator('input[type="password"]').first()
  const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login")').first()

  await expect(emailField).toBeVisible({ timeout: 10000 })
  await emailField.fill(config.user)
  await passField.fill(config.pass)
  await submitBtn.click()

  // Wait for navigation away from login
  await page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 15000 })
  await page.waitForLoadState('networkidle')
}

export async function ensureAuthenticated(page: Page) {
  const config = getAuthConfig()
  if (!config) {
    throw new Error(
      'CONTROL_PLANE_TEST_USER and CONTROL_PLANE_TEST_PASS env vars are required for authenticated tests'
    )
  }
  const authed = await isAuthenticated(page)
  if (!authed) {
    await login(page, config)
  }
}
