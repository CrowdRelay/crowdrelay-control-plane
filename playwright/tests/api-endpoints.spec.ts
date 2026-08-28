/**
 * API endpoint tests — verify every API route returns a valid response
 * (200, 401, 403, 404, or appropriate error). These are read-only tests
 * that don't mutate any data.
 *
 * @api
 */
import { test, expect } from '@playwright/test'
import { addBug } from './bug-report'

const SLUG = 'virya'

// All API routes that should respond (even with 401) when unauthenticated
const API_ROUTES = [
  { path: '/api/v1/overview', method: 'GET', name: 'overview' },
  { path: '/api/v1/tenants', method: 'GET', name: 'tenants-list' },
  { path: `/api/v1/tenants/${SLUG}`, method: 'GET', name: 'tenant-detail' },
  { path: `/api/v1/tenants/${SLUG}/overview`, method: 'GET', name: 'tenant-overview' },
  { path: `/api/v1/tenants/${SLUG}/operations/overview`, method: 'GET', name: 'ops-overview' },
  { path: `/api/v1/tenants/${SLUG}/operations/summary`, method: 'GET', name: 'ops-summary' },
  { path: `/api/v1/tenants/${SLUG}/operations/flags`, method: 'GET', name: 'ops-flags' },
  { path: `/api/v1/tenants/${SLUG}/operations/growth`, method: 'GET', name: 'ops-growth' },
  { path: `/api/v1/tenants/${SLUG}/operations/autopilot/overview`, method: 'GET', name: 'autopilot-overview' },
  { path: `/api/v1/tenants/${SLUG}/operations/autopilot/scorecard`, method: 'GET', name: 'autopilot-scorecard' },
  { path: `/api/v1/tenants/${SLUG}/operations/autopilot/reply-triage`, method: 'GET', name: 'autopilot-reply-triage' },
  { path: `/api/v1/tenants/${SLUG}/operations/autopilot/next-best-actions`, method: 'GET', name: 'autopilot-next-best-actions' },
  { path: `/api/v1/tenants/${SLUG}/operations/outbox`, method: 'GET', name: 'ops-outbox' },
  { path: `/api/v1/tenants/${SLUG}/operations/attention`, method: 'GET', name: 'ops-attention' },
  { path: `/api/v1/tenants/${SLUG}/operations/signal-overview`, method: 'GET', name: 'signal-overview' },
  { path: `/api/v1/tenants/${SLUG}/portfolio/model`, method: 'GET', name: 'portfolio-model' },
  { path: `/api/v1/tenants/${SLUG}/area`, method: 'GET', name: 'area-overview' },
  { path: `/api/v1/tenants/${SLUG}/area/cities`, method: 'GET', name: 'area-cities' },
  { path: `/api/v1/tenants/${SLUG}/area/drops`, method: 'GET', name: 'area-drops' },
  { path: `/api/v1/tenants/${SLUG}/runtime`, method: 'GET', name: 'tenant-runtime' },
  { path: `/api/v1/tenants/${SLUG}/audit`, method: 'GET', name: 'tenant-audit' },
  { path: `/api/v1/tenants/${SLUG}/provisioning`, method: 'GET', name: 'provisioning-status' },
  { path: `/api/v1/tenants/${SLUG}/agents/templates`, method: 'GET', name: 'agent-templates' },
  { path: `/api/v1/tenants/${SLUG}/agents/tasks`, method: 'GET', name: 'agent-tasks' },
  { path: `/api/v1/tenants/${SLUG}/agents/providers`, method: 'GET', name: 'agent-providers' },
  { path: `/api/v1/tenants/${SLUG}/agents/models`, method: 'GET', name: 'agent-models' },
  { path: `/api/v1/tenants/${SLUG}/agents/health`, method: 'GET', name: 'agent-health' },
  { path: `/api/v1/tenants/${SLUG}/agents/suggestions`, method: 'GET', name: 'agent-suggestions' },
  { path: `/api/v1/tenants/${SLUG}/agents/schedules`, method: 'GET', name: 'agent-schedules' },
  { path: `/api/v1/tenants/${SLUG}/portfolio/fanbases/connections`, method: 'GET', name: 'fanbase-connections' },
  { path: '/api/v1/healthz/ready', method: 'GET', name: 'healthz-ready' },
]

for (const route of API_ROUTES) {
  test(`API ${route.name} responds @api`, async ({ request }) => {
    const response = await request.get(route.path)
    const status = response.status()
    // All API routes should return 401 (unauthenticated) or 200 (if public)
    // 403, 404, or 503 are also acceptable depending on tenant state
    const validStatuses = [200, 401, 403, 404, 503]
    const isValid = validStatuses.includes(status)
    if (!isValid) {
      addBug({
        severity: status >= 500 ? 'high' : 'medium',
        category: 'api',
        title: `${route.name} returned unexpected status ${status}`,
        test_name: `api-endpoints::${route.name}`,
        url: route.path,
        expected: `One of ${validStatuses.join(', ')}`,
        actual: `Status ${status}`,
        fix_hint: `Check API route ${route.path} — may be a missing route, broken handler, or auth misconfiguration`,
      })
    }
    expect(isValid, `${route.path}: expected ${validStatuses}, got ${status}`).toBe(true)
  })
}

// Test that the healthz endpoint returns valid JSON when accessible
test('healthz/ready returns valid JSON @api @smoke', async ({ request }) => {
  const response = await request.get('/healthz/ready')
  const status = response.status()
  // healthz may be 200 (public) or 401 (auth-required)
  if (status === 200) {
    const body = await response.json()
    expect(body).toHaveProperty('status')
    if (body.status !== 'ok' && body.status !== 'degraded') {
      addBug({
        severity: 'medium',
        category: 'api',
        title: 'healthz/ready returned unexpected status value',
        test_name: 'api-endpoints::healthz-status-value',
        url: '/api/v1/healthz/ready',
        expected: 'status: "ok" or "degraded"',
        actual: `status: "${body.status}"`,
        fix_hint: 'Check healthz handler — may be reporting wrong status',
      })
    }
  }
  expect([200, 401]).toContain(status)
})
