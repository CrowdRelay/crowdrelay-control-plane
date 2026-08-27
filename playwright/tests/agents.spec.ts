/**
 * Agent panel tests — verify the agent-related API endpoints and UI
 * elements work correctly. Tests the agent scorecard, templates, tasks,
 * providers, and OAuth flows.
 *
 * @agents
 */
import { test, expect } from '@playwright/test'
import { addBug } from './bug-report'

const SLUG = 'virya'

test('Agent scorecard API returns valid structure @agents', async ({ request }) => {
  const response = await request.get(`/api/v1/tenants/${SLUG}/operations/autopilot/scorecard`)
  const status = response.status()
  // 401 is expected when unauthenticated, 200 when authenticated,
  // 503 when the upstream is unavailable
  if (status === 200) {
    const body = await response.json()
    // Scorecard should have a status object
    if (!body.status) {
      addBug({
        severity: 'medium',
        category: 'api',
        title: 'Agent scorecard missing status field',
        test_name: 'agents::scorecard-structure',
        url: `/api/v1/tenants/${SLUG}/operations/autopilot/scorecard`,
        expected: 'Object with status property',
        actual: `Keys: ${Object.keys(body).join(', ')}`,
        fix_hint: 'Check scorecard handler in crowdrelay-api/src/autopilot/scorecard.rs',
      })
    }
  }
  expect([200, 401, 403, 503]).toContain(status)
})

test('Agent templates API returns valid structure @agents', async ({ request }) => {
  const response = await request.get(`/api/v1/tenants/${SLUG}/agents/templates`)
  const status = response.status()
  if (status === 200) {
    const body = await response.json()
    if (!body.templates) {
      addBug({
        severity: 'low',
        category: 'api',
        title: 'Agent templates missing templates field',
        test_name: 'agents::templates-structure',
        url: `/api/v1/tenants/${SLUG}/agents/templates`,
        expected: 'Object with templates array',
        actual: `Keys: ${Object.keys(body).join(', ')}`,
        fix_hint: 'Check agent routes proxy in control-plane-api/src/agent_routes.rs',
      })
    }
  }
  expect([200, 401, 403, 503]).toContain(status)
})

test('Agent tasks API returns valid structure @agents', async ({ request }) => {
  const response = await request.get(`/api/v1/tenants/${SLUG}/agents/tasks`)
  const status = response.status()
  if (status === 200) {
    const body = await response.json()
    // Tasks should be an array or have a tasks field
    if (!Array.isArray(body) && !body.tasks) {
      addBug({
        severity: 'low',
        category: 'api',
        title: 'Agent tasks response has unexpected shape',
        test_name: 'agents::tasks-structure',
        url: `/api/v1/tenants/${SLUG}/agents/tasks`,
        expected: 'Array or { tasks: [...] }',
        actual: `Type: ${typeof body}, keys: ${Object.keys(body).join(', ')}`,
        fix_hint: 'Check agent tasks proxy in control-plane-api/src/agent_routes.rs',
      })
    }
  }
  expect([200, 401, 403, 503]).toContain(status)
})

test('Agent providers API returns valid structure @agents', async ({ request }) => {
  const response = await request.get(`/api/v1/tenants/${SLUG}/agents/providers`)
  const status = response.status()
  if (status === 200) {
    const body = await response.json()
    if (!body.providers && !Array.isArray(body)) {
      addBug({
        severity: 'low',
        category: 'api',
        title: 'Agent providers response has unexpected shape',
        test_name: 'agents::providers-structure',
        url: `/api/v1/tenants/${SLUG}/agents/providers`,
        expected: 'Array or { providers: [...] }',
        actual: `Keys: ${Object.keys(body).join(', ')}`,
        fix_hint: 'Check agent providers proxy in control-plane-api/src/agent_routes.rs',
      })
    }
  }
  expect([200, 401, 403, 503]).toContain(status)
})

test('Agent schedules API returns valid structure @agents', async ({ request }) => {
  const response = await request.get(`/api/v1/tenants/${SLUG}/agents/schedules`)
  const status = response.status()
  if (status === 200) {
    const body = await response.json()
    if (!Array.isArray(body) && !body.schedules) {
      addBug({
        severity: 'low',
        category: 'api',
        title: 'Agent schedules response has unexpected shape',
        test_name: 'agents::schedules-structure',
        url: `/api/v1/tenants/${SLUG}/agents/schedules`,
        expected: 'Array or { schedules: [...] }',
        actual: `Keys: ${Object.keys(body).join(', ')}`,
        fix_hint: 'Check agent schedules proxy in control-plane-api/src/agent_routes.rs',
      })
    }
  }
  expect([200, 401, 403, 503]).toContain(status)
})

test('Agent OAuth start uses POST not GET @agents', async ({ request }) => {
  // The OAuth start endpoint should accept POST with a JSON body
  // (not GET with query params) — this was a bug we fixed
  const response = await request.post(
    `/api/v1/tenants/${SLUG}/agents/oauth/google/start`,
    { data: { redirect_uri: 'https://control.virya.music/oauth/callback' } }
  )
  const status = response.status()
  // 401 is expected when unauthenticated
  // 200 or 302 would indicate the flow started
  // 405 would indicate the route doesn't accept POST (bug)
  if (status === 405) {
    addBug({
      severity: 'high',
      category: 'api',
      title: 'Agent OAuth start does not accept POST',
      test_name: 'agents::oauth-start-post',
      url: `/api/v1/tenants/${SLUG}/agents/oauth/google/start`,
      expected: 'POST accepted (200, 302, 401)',
      actual: '405 Method Not Allowed',
      fix_hint: 'Check agent_routes.rs — OAuth start route should accept POST',
    })
  }
  expect([200, 302, 401, 403, 503]).toContain(status)
})
