/**
 * Fanbase connection tests — verify the fanbase OAuth and connection
 * management API endpoints work correctly.
 *
 * @fanbase
 */
import { test, expect } from '@playwright/test'
import { addBug } from './bug-report'

const SLUG = 'virya'

test('Fanbase connections list API returns valid structure @fanbase', async ({ request }) => {
  const response = await request.get(`/api/v1/tenants/${SLUG}/portfolio/fanbases/connections`)
  const status = response.status()
  if (status === 200) {
    const body = await response.json()
    if (!body.connections) {
      addBug({
        severity: 'medium',
        category: 'api',
        title: 'Fanbase connections missing connections field',
        test_name: 'fanbase::connections-structure',
        url: `/api/v1/tenants/${SLUG}/portfolio/fanbases/connections`,
        expected: '{ connections: [...] }',
        actual: `Keys: ${Object.keys(body).join(', ')}`,
        fix_hint: 'Check fanbase connections proxy in operations_routes.rs',
      })
    } else if (!Array.isArray(body.connections)) {
      addBug({
        severity: 'medium',
        category: 'api',
        title: 'Fanbase connections field is not an array',
        test_name: 'fanbase::connections-array',
        url: `/api/v1/tenants/${SLUG}/portfolio/fanbases/connections`,
        expected: 'connections is an array',
        actual: `Type: ${typeof body.connections}`,
        fix_hint: 'Check fanbase connections serialization in crowdrelay-api/src/fanbase.rs',
      })
    }
  }
  expect([200, 401, 403, 503]).toContain(status)
})

test('Fanbase OAuth start uses POST not GET @fanbase', async ({ request }) => {
  // The fanbase OAuth start endpoint should accept POST with a JSON body
  // (not GET with query params) — this was a bug we fixed
  const response = await request.post(
    `/api/v1/tenants/${SLUG}/portfolio/fanbases/connections/oauth/meta/start`,
    { data: { redirect_uri: 'https://control.virya.music/oauth/callback' } }
  )
  const status = response.status()
  // 401 is expected when unauthenticated
  // 200 would indicate the flow started (returns auth URL)
  // 405 would indicate the route doesn't accept POST (bug)
  if (status === 405) {
    addBug({
      severity: 'critical',
      category: 'api',
      title: 'Fanbase OAuth start does not accept POST',
      test_name: 'fanbase::oauth-start-post',
      url: `/api/v1/tenants/${SLUG}/portfolio/fanbases/connections/oauth/meta/start`,
      expected: 'POST accepted (200, 401)',
      actual: '405 Method Not Allowed',
      fix_hint: 'Check operations_routes.rs — fanbase OAuth start should accept POST',
    })
  }
  expect([200, 401, 403, 503]).toContain(status)
})

test('Fanbase OAuth start rejects GET @fanbase', async ({ request }) => {
  // The fanbase OAuth start endpoint should NOT accept GET
  // (the old buggy implementation used GET with query params)
  const response = await request.get(
    `/api/v1/tenants/${SLUG}/portfolio/fanbases/connections/oauth/meta/start?redirect_uri=https://control.virya.music`
  )
  const status = response.status()
  // GET should return 405 (Method Not Allowed) or 401 (if auth check happens first)
  if (status === 200) {
    addBug({
      severity: 'high',
      category: 'api',
      title: 'Fanbase OAuth start still accepts GET (should be POST only)',
      test_name: 'fanbase::oauth-start-get-rejected',
      url: `/api/v1/tenants/${SLUG}/portfolio/fanbases/connections/oauth/meta/start`,
      expected: '405 or 401 (GET should not work)',
      actual: '200 (GET still works — old bug not fully fixed)',
      fix_hint: 'Check operations_routes.rs — fanbase OAuth start route should only accept POST',
    })
  }
  expect([401, 403, 405, 503]).toContain(status)
})

test('Fanbase OAuth callback returns HTML not JSON @fanbase', async ({ request }) => {
  // The OAuth callback should return HTML (for the browser to show
  // a success/failure page), not JSON
  const response = await request.get(
    `/api/v1/tenants/${SLUG}/agents/oauth/google/callback?code=test&state=test`
  )
  const status = response.status()
  const contentType = response.headers()['content-type'] || ''
  if (status === 200 && !contentType.includes('text/html')) {
    addBug({
      severity: 'medium',
      category: 'api',
      title: 'Agent OAuth callback returns non-HTML content',
      test_name: 'fanbase::oauth-callback-html',
      url: `/api/v1/tenants/${SLUG}/agents/oauth/google/callback`,
      expected: 'text/html',
      actual: contentType,
      fix_hint: 'Check oauth_callback in agent_routes.rs — should return HTML',
    })
  }
  expect([200, 401, 403, 503]).toContain(status)
})
