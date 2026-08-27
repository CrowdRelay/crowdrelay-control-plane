import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for control.virya.music.
 *
 * Tests run against the production control plane at https://control.virya.music.
 * They are designed to be SAFE — no destructive actions, no data mutation,
 * read-only checks of pages, API endpoints, and UI elements.
 *
 * Bug reports are written to ./bug-report.json for automated fix loops.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Sequential — we're hitting production
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results.json' }],
    ['html', { open: 'never', outputFolder: 'html-report' }],
  ],
  use: {
    baseURL: 'https://control.virya.music',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    timeout: 30000,
    actionTimeout: 15000,
    navigationTimeout: 20000,
    // Don't take screenshots of production data
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
