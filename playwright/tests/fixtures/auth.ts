/**
 * Authentication helper for control plane tests.
 *
 * Reads credentials from env vars:
 * - CONTROL_PLANE_TEST_USER: username (default: admin)
 * - CONTROL_PLANE_TEST_PASS: password (required)
 *
 * Logs in via the SPA login form and waits for the session cookie.
 */
import { Page, expect } from '@playwright/test'

export interface AuthConfig {
  user: string
  pass: string
}

export function getAuthConfig(): AuthConfig {
  const user = process.env.CONTROL_PLANE_TEST_USER || 'admin'
  const pass = process.env.CONTROL_PLANE_TEST_PASS
  if (!pass) {
    throw new Error(
      'CONTROL_PLANE_TEST_PASS env var is required for authenticated tests'
    )
  }
  return { user, pass }
}

export async function login(page: Page): Promise<void> {
  const config = getAuthConfig()

  // Navigate to the root — the SPA will show the login form if not authenticated
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // Check if already logged in (app shell visible)
  const loginForm = await page.locator('input[type="password"]').count()
  if (loginForm === 0) {
    // Already authenticated — app shell is showing
    return
  }

  // Fill the login form
  const userField = page.locator('input[name="username"], input[type="text"], input:not([type="password"]):not([type="hidden"]):not([type="submit"]):not([type="button"])').first()
  const passField = page.locator('input[type="password"]').first()
  const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login")').first()

  await expect(userField).toBeVisible({ timeout: 10000 })
  await userField.fill(config.user)
  await passField.fill(config.pass)
  await submitBtn.click()

  // Wait for the app to load (login form disappears)
  await page.waitForSelector('input[type="password"]', { state: 'detached', timeout: 15000 })
  await page.waitForLoadState('networkidle')
}

/**
 * Sets up console error and network failure collection on a page.
 * Returns arrays that accumulate errors during navigation.
 */
export function setupErrorCollectors(page: Page) {
  const consoleErrors: string[] = []
  const networkFailures: { url: string; status: number; method: string }[] = []
  const apiErrors: { url: string; status: number; method: string }[] = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  page.on('response', (response) => {
    const status = response.status()
    const url = response.url()
    const method = response.request().method()

    // Track 5xx responses (503, 500, etc.)
    if (status >= 500) {
      networkFailures.push({ url, status, method })
    }

    // Track API 4xx/5xx that aren't 401 (auth) or 404 (expected for some routes)
    if (url.includes('/api/v1/') && status >= 400 && status !== 401 && status !== 404) {
      apiErrors.push({ url, status, method })
    }
  })

  return { consoleErrors, networkFailures, apiErrors }
}
