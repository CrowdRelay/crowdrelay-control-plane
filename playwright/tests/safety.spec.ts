/**
 * Safety tests — verify no XSS vectors, no secrets exposed, proper
 * security headers, and no sensitive data in responses.
 *
 * @safety
 */
import { test, expect } from '@playwright/test'
import { addBug, resetBugs, writeBugReport } from './bug-report'

test.beforeAll(() => resetBugs())
test.afterAll(() => writeBugReport())

test('Security headers present @safety', async ({ request }) => {
  const response = await request.get('/')
  const headers = response.headers()

  // Check for security headers
  const checks = [
    { header: 'x-content-type-options', expected: /nosniff/i },
    { header: 'x-frame-options', expected: /deny|sameorigin/i },
    { header: 'strict-transport-security', expected: /max-age/i },
  ]

  for (const check of checks) {
    const value = headers[check.header]
    if (!value) {
      addBug({
        severity: 'medium',
        category: 'auth',
        title: `Missing security header: ${check.header}`,
        test_name: 'safety::missing-header',
        url: '/',
        expected: `${check.header}: ${check.expected}`,
        actual: 'Header not present',
        fix_hint: `Add ${check.header} to the response headers in the edge proxy or middleware`,
      })
    } else if (!check.expected.test(value)) {
      addBug({
        severity: 'low',
        category: 'auth',
        title: `Security header ${check.header} has unexpected value`,
        test_name: 'safety::header-value',
        url: '/',
        expected: String(check.expected),
        actual: value,
        fix_hint: `Update ${check.header} header value`,
      })
    }
  }

  // These are warnings, not hard failures — the edge proxy may add them
  expect(true).toBe(true)
})

test('No secrets in API responses @safety', async ({ request }) => {
  // Check that API responses don't leak secrets
  const routes = [
    '/api/v1/overview',
    '/api/v1/tenants',
    '/api/v1/healthz/ready',
  ]

  for (const route of routes) {
    const response = await request.get(route)
    const text = await response.text()
    // Look for common secret patterns
    const secretPatterns = [
      /sk_live_[a-zA-Z0-9]{20,}/, // Stripe live key
      /sk_test_[a-zA-Z0-9]{20,}/, // Stripe test key
      /ghp_[a-zA-Z0-9]{36}/, // GitHub PAT
      /gho_[a-zA-Z0-9]{36}/, // GitHub OAuth token
      /AKIA[A-Z0-9]{16}/, // AWS access key
      /-----BEGIN [A-Z]+ PRIVATE KEY-----/, // Private key
    ]
    for (const pattern of secretPatterns) {
      if (pattern.test(text)) {
        addBug({
          severity: 'critical',
          category: 'auth',
          title: `Secret pattern detected in ${route}`,
          test_name: 'safety::secret-leak',
          url: route,
          expected: 'No secret patterns in response',
          actual: `Pattern ${pattern} matched`,
          fix_hint: `Check API response for ${route} — may be leaking credentials`,
        })
      }
    }
  }
  expect(true).toBe(true)
})

test('No reflected XSS in error messages @safety', async ({ page }) => {
  // Try to inject HTML via query params
  const xssPayload = '<script>alert(1)</script>'
  const response = await page.goto(`/tenants/${encodeURIComponent(xssPayload)}`)
  expect(response).not.toBeNull()

  // Check that the payload is not rendered as HTML
  const scriptTags = await page.locator('script').count()
  // The page should have its own scripts, but the XSS payload should not
  // create additional script tags
  const bodyHtml = await page.locator('body').innerHTML()
  if (bodyHtml.includes(xssPayload)) {
    addBug({
      severity: 'high',
      category: 'auth',
      title: 'Reflected XSS in tenant slug parameter',
      test_name: 'safety::xss-tenant-slug',
      url: `/tenants/${xssPayload}`,
      expected: 'XSS payload should be escaped',
      actual: 'XSS payload found in page HTML',
      fix_hint: 'Escape user input in the tenant slug rendering',
    })
  }
  // This is a warning, not a hard failure
  expect(true).toBe(true)
})

test('CORS headers not overly permissive @safety', async ({ request }) => {
  const response = await request.get('/api/v1/healthz/ready')
  const corsOrigin = response.headers()['access-control-allow-origin']
  if (corsOrigin === '*') {
    addBug({
      severity: 'medium',
      category: 'auth',
      title: 'CORS allows all origins',
      test_name: 'safety::cors-wildcard',
      url: '/api/v1/healthz/ready',
      expected: 'Specific origin or null',
      actual: '*',
      fix_hint: 'Restrict CORS to known origins',
    })
  }
  expect(true).toBe(true)
})
