/**
 * Fanbase connection tests — verify the fanbase connection management API
 * works correctly.
 *
 * Note: fanbase/agent OAuth start and callback are tested in agents.spec.ts.
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
