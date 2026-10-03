// Corrections to the generated mock answers, for content that has to agree
// with the URL or with another answer. Everything else stays generated.

export const MOCK_TENANTS = [
  { slug: 'nocna-zmiana', displayName: 'Nocna Zmiana' },
  { slug: 'kwiaty-elektryczne', displayName: 'Kwiaty Elektryczne' },
  { slug: 'mgla-nad-wisla', displayName: 'Mgła nad Wisłą' },
  { slug: 'szum-miasta', displayName: 'Szum Miasta' },
  { slug: 'lato-w-betonie', displayName: 'Lato w Betonie' },
  { slug: 'ostatni-tramwaj', displayName: 'Ostatni Tramwaj' },
]

type Json = Record<string, unknown>
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Give a tenant-shaped object one consistent identity. */
function asTenant(value: unknown, tenant: { slug: string; displayName: string }): unknown {
  if (!isObject(value)) return value
  const out: Json = { ...value }
  if ('slug' in out) out.slug = tenant.slug
  if ('displayName' in out) out.displayName = tenant.displayName
  if ('name' in out && typeof out.name === 'string') out.name = tenant.displayName
  if ('status' in out && typeof out.status === 'string') out.status = 'active'
  return out
}

/** Every `tenantSlug` / `tenant_slug` under a tenant URL points back at it. */
function stampTenantSlug(value: unknown, slug: string): unknown {
  if (Array.isArray(value)) return value.map((v) => stampTenantSlug(v, slug))
  if (!isObject(value)) return value
  const out: Json = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = k === 'tenantSlug' || k === 'tenant_slug' ? slug : stampTenantSlug(v, slug)
  }
  return out
}

export function applyOverrides(method: string, pathname: string, value: unknown): unknown {
  if (pathname === '/auth/session' && method !== 'DELETE') {
    return { username: 'demo.admin', role: 'platform_admin', tenantSlug: null, isMobile: false }
  }

  if (method === 'GET' && pathname === '/tenants' && isObject(value) && Array.isArray(value.items)) {
    const items = value.items as unknown[]
    return { ...value, items: MOCK_TENANTS.map((t, i) => asTenant(items[i % items.length], t)) }
  }

  const tenantMatch = pathname.match(/^\/tenants\/([^/]+)(\/.*)?$/)
  if (tenantMatch) {
    const slug = decodeURIComponent(tenantMatch[1]!)
    const tenant = MOCK_TENANTS.find((t) => t.slug === slug) ?? { slug, displayName: slug }
    if (!tenantMatch[2]) return asTenant(value, tenant)
    let out = stampTenantSlug(value, slug)
    // Read models that embed the tenant summary.
    if (isObject(out) && isObject(out.tenant)) out = { ...out, tenant: asTenant(out.tenant, tenant) }
    if (method === 'GET' && tenantMatch[2] === '/operations/attention' && isObject(out)) out = withDeadQueues(out)
    if (method === 'GET' && tenantMatch[2] === '/content/model' && isObject(out)) out = withReadyPosts(out)
    if (method === 'GET' && tenantMatch[2] === '/settings') out = demoSettings(tenant.displayName)
    // The overview carries the settings too, and seeds the settings query from them.
    if (method === 'GET' && isObject(out) && isObject(out.settings) && 'editable_keys' in out.settings) out = { ...out, settings: demoSettings(tenant.displayName) }
    return out
  }

  return value
}

// The generator gives the three dead queues empty lists while the summary
// counts hundreds, so the Queues page only ever showed its clean state. A
// few rows per queue, with the summary's dead counts made to agree.
/** The workspace settings with the real key names, so every Settings group
 *  renders — generated keys are random words no group claims. */
function demoSettings(displayName: string): Json {
  const settings: Record<string, string> = {
    brand_wordmark: displayName,
    act_style: 'post-punk',
    act_home_city: 'Warszawa',
    member_site_base_url: 'https://nocnazmiana.example',
    member_area_path: '/members',
    live_page_path: 'shows',
    signal_enabled: 'true',
    synesthesia_enabled: 'false',
    synesthesia_campaign_slug: '',
    ticketing_enabled: 'false',
    north_star_metric: '',
    tenant_intent: '',
    growth_cadence_moments_per_month: '2',
    growth_cadence_fillers_enabled: 'true',
    social_auto_post: 'false',
    social_autopost_platforms: '["instagram"]',
    join_ask_platforms: '["instagram","facebook"]',
    join_ask_cadence_days: '7',
    join_ask_variants: '["Join the list for first dibs on tickets."]',
    join_ask_image_url: '',
    crew_locale: 'pl',
    team_weekly_ask_ceiling: '3',
  }
  return { settings, overridden: ['act_style', 'join_ask_cadence_days'], editable_keys: Object.keys(settings) }
}

function withDeadQueues(model: Json): Json {
  const day = 86_400_000
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString()
  const outbox = [
    ['release_published', 'http_5xx', 2], ['show_announced', 'timeout', 5], ['fan_signed_up', 'payload_rejected', 9],
  ].map(([event, error, ago], i) => ({
    id: `00000000-0000-4000-8000-00000000010${i}`, event_type: event, event_version: 1, status: 'dead',
    attempts: 8, max_attempts: 8, available_at: at(ago as number), last_error_kind: error,
    created_at: at((ago as number) + 1), updated_at: at(ago as number), delivered_at: null, dead_at: at(ago as number),
  }))
  const deliveries = [
    ['release_published', 'Bandsintown', 'http_4xx', 410, 1, true], ['show_announced', 'Songkick', 'timeout', null, 3, true],
    ['ticket_sold', 'Venue CRM', 'http_5xx', 502, 6, false],
  ].map(([event, endpoint, error, status, ago, active], i) => ({
    id: `00000000-0000-4000-8000-00000000020${i}`, outbox_event_id: `00000000-0000-4000-8000-00000000010${i}`,
    event_type: event, endpoint_name: endpoint, endpoint_active: active, status: 'dead', attempt_count: 6, max_attempts: 6,
    available_at: at(ago as number), last_response_status: status, last_error_kind: error,
    created_at: at((ago as number) + 1), updated_at: at(ago as number), delivered_at: null, dead_at: at(ago as number),
  }))
  const push = [
    ['Doors open at 20:00 tonight', 'show_reminder', 'endpoint_inactive', 1], ['New single out now', 'release', 'device_ack_timeout', 2],
    ['You won the draw', 'reward', 'fan_or_consent_ineligible', 4],
  ].map(([title, source, code, ago], i) => ({
    id: `00000000-0000-4000-8000-00000000030${i}`, fan_id: null, source_kind: source, title, status: 'dead',
    attempt_count: 3, error_code: code, available_at: at(ago as number), created_at: at((ago as number) + 1),
    delivered_at: null, completed_at: at(ago as number),
  }))
  const summary = isObject(model.summary) ? model.summary : {}
  const lane = (key: string, dead: number) => ({ ...(isObject(summary[key]) ? summary[key] as Json : {}), dead })
  const notReported = Array.isArray(model.not_reported)
    ? (model.not_reported as unknown[]).filter((n) => n !== 'dead_outbox' && n !== 'dead_deliveries' && n !== 'dead_push')
    : model.not_reported
  return {
    ...model,
    not_reported: notReported,
    dead_outbox: outbox,
    dead_deliveries: deliveries,
    dead_push: push,
    summary: { ...summary, outbox: lane('outbox', 3), deliveries: lane('deliveries', 3), push: lane('push', 3) },
  }
}

// The generator never produces a post waiting to be published by hand, so
// the Content page's "Ready to post" table only ever showed its absence.
// Four, one of them long enough to need "Show all", plus three in flight.
function withReadyPosts(model: Json): Json {
  const dr = isObject(model.delivery_results) ? model.delivery_results : null
  if (!dr || !Array.isArray(dr.results)) return model
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString()
  const ready = [
    { kind: 'social_post', channel: 'instagram', status: 'awaiting_manual_post', url: 'https://www.instagram.com/',
      text: 'Tonight at Klub RE, doors 20:00. Bring someone who has never heard us.' },
    { kind: 'community_post', channel: 'r/r/polishmusic', status: 'awaiting_manual_post', url: 'https://www.reddit.com/r/polishmusic/',
      text: 'We are a four-piece from Kraków and we just finished a spring tour of nine cities.\n\nThe last night in Wrocław was the loudest room we have played, and we recorded it. Here is the live version of the closing song, with the crowd singing the last chorus back at us.\n\nHappy to answer anything about touring on a shoestring in Poland.' },
    { kind: 'telegram_post', channel: 'telegram', status: 'draft', url: null,
      text: 'New single out Friday. Pre-save link in the bio.' },
    { kind: 'discord_post', channel: 'discord', status: 'awaiting_manual_post', url: null,
      text: 'Listening party in the voice channel on Sunday at 19:00 — we will play the new EP front to back.' },
    // In flight: approved and going out by themselves.
    { kind: 'community_post', channel: 'r/r/indieheads', status: 'posting', url: null,
      text: 'Nocna Zmiana — a Kraków four-piece. New EP out Friday, here is the opening track.' },
    { kind: 'social_post', channel: 'facebook', status: 'pending', url: null,
      text: 'Spring tour, night nine: Wrocław. Thank you for singing the last chorus back at us.' },
    { kind: 'community_post', channel: 'r/r/polishmusic', status: 'rate_limited', url: null,
      text: 'The live version of our closing song, recorded on the last night of the tour.' },
  ].map((r, i) => ({
    kind: r.kind, id: `00000000-0000-4000-8000-00000000040${i}`, action_id: null, channel: r.channel,
    content: { text: r.text }, status: r.status, url: r.url, created_at: at(3 + i * 5), posted_at: null,
    score: null, upvotes: null, num_comments: null, upvote_ratio: null, error_message: null,
  }))
  return { ...model, delivery_results: { ...dr, results: [...ready, ...(dr.results as unknown[])] } }
}
