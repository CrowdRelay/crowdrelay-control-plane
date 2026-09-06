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
    // One mobile project at the smallest viewport — the RWD torture test
    // already covers every breakpoint width inside the chromium project, so
    // we only need a single mobile project to verify touch/isMobile behavior
    // at the narrowest width where layout regressions are most likely.
    {
      name: 'mobile-320',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 320, height: 568 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})
