import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for the CrowdRelay Control Plane.
 *
 * Tests run against either:
 *   - local dev stack (default): http://127.0.0.1:8090
 *   - production:                 https://control.virya.music
 *
 * Override with CONTROL_PLANE_BASE_URL env var.
 *
 * Tests are SAFE — no destructive actions, no data mutation.
 * They log in, navigate every subpage, and check for:
 *   - 503 / 5xx HTTP responses
 *   - Red error blocks in the UI
 *   - Console errors
 *   - Failed network requests
 *
 * Bug reports are written to ./bug-report.json for automated fix loops.
 */

const baseURL = process.env.CONTROL_PLANE_BASE_URL || 'http://127.0.0.1:8090'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results.json' }],
    ['html', { open: 'never', outputFolder: 'html-report' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    timeout: 30000,
    actionTimeout: 15000,
    navigationTimeout: 20000,
    acceptDownloads: false,
    extraHTTPHeaders: {
      'X-Playwright-Test': 'true',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
