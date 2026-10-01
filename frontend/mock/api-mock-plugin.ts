// Dev-only fake API. `npm run dev:mock` answers every `/api/v1/*` request
// from the Vite dev server itself, so every page renders filled in without
// Docker, the backend or the upstream services. Nothing here reaches a build:
// the plugin is only registered for `vite serve` with CONTROL_PLANE_MOCK_API=1.
//
// The data is generated, not hand-written. The TypeScript compiler reads
// `src/lib/api.ts`, finds every `request<T>(path)` call and builds a value of
// type `T`, choosing each field's content from its name (`startsAt` gets a
// date, `venueName` a venue, `fanCount` a count). So the fixtures follow the
// types as they change — edit types.ts and the next request sees the new shape.
// `overrides.ts` corrects the few answers whose content has to agree with the
// URL (the tenant slug, the signed-in profile).
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { applyOverrides } from './overrides'

type Route = { method: string; pattern: RegExp; specificity: number; type: ts.Type }

const NOW = Date.UTC(2026, 9, 1, 10, 0, 0)
const DAY = 86_400_000

// ── Content pools ────────────────────────────────────────────────────────────

const POOLS = {
  artists: ['Nocna Zmiana', 'Kwiaty Elektryczne', 'Mgła nad Wisłą', 'Szum Miasta', 'Lato w Betonie', 'Ostatni Tramwaj', 'Zimne Ognie', 'Papierowe Ptaki'],
  venues: ['Hydrozagadka', 'Pogłos', 'Klub RE', 'B90', 'Zaułek', 'Alchemia', 'Stodoła', 'Proxima'],
  cities: ['Warszawa', 'Kraków', 'Gdańsk', 'Wrocław', 'Poznań', 'Łódź', 'Katowice', 'Lublin'],
  people: ['Ola Nowak', 'Kuba Wiśniewski', 'Marta Zielińska', 'Piotr Lewandowski', 'Zosia Kamińska', 'Tomek Wójcik', 'Ania Kowalczyk', 'Michał Dąbrowski'],
  outlets: ['Radio Kampus', 'Nowe Brzmienia', 'Soundrive Blog', 'Polskie Podziemie', 'Gazeta Muzyczna', 'Weekend Playlist', 'Trójka Nocą', 'Indie Kraków'],
  events: ['Wiosenna trasa — Warszawa', 'Premiera EP w Pogłosie', 'Lato w Betonie live', 'Koncert w Alchemii', 'Jesienna trasa — Kraków', 'Noc demo w Zaułku', 'Showcase w B90', 'Release party'],
  tasks: ['Weekly fan digest', 'Press outreach wave', 'Venue follow-up', 'Playlist pitch', 'Ticket push reminder', 'Release teaser', 'Curator check-in', 'Post-show recap'],
  platforms: ['instagram', 'spotify', 'tiktok', 'youtube', 'bandcamp', 'facebook'],
  providers: ['anthropic', 'openai', 'google'],
  sentences: [
    'Ticket pace in Kraków is 18% ahead of the last tour at the same point.',
    'Three curators replied this week; two asked for the unreleased single.',
    'Fans who saw the Gdańsk show opened the follow-up email twice as often.',
    'The venue confirmed the date and wants the rider by Friday.',
    'Instagram reach is up after the rehearsal clip; worth a second cut.',
    'Pre-save conversions are strongest from the Radio Kampus mention.',
    'Wrocław has 240 fans within 30 km and no show booked yet.',
    'The playlist pitch is waiting on final artwork from the label.',
    'Support slot offer looks fair against similar rooms in the area.',
    'Newsletter sign-ups doubled on the night of the B90 showcase.',
  ],
  words: ['Spring tour', 'Main stage', 'Release week', 'Core fans', 'Local press', 'Night run', 'Warm leads', 'Hometown'],
  statuses: ['active', 'pending', 'done'],
}

/** Ancestor words that decide which pool a `name`/`title`/`label` draws from. */
const DOMAINS: Array<[keyof typeof POOLS, string[]]> = [
  ['artists', ['artist', 'artists', 'act', 'acts', 'band', 'performer', 'headliner', 'support', 'lineup']],
  ['venues', ['venue', 'venues', 'room', 'rooms', 'club', 'place', 'places', 'promoter', 'promoters']],
  ['cities', ['city', 'cities', 'town', 'market', 'markets', 'region', 'regions', 'area']],
  ['outlets', ['beacon', 'beacons', 'curator', 'curators', 'outlet', 'outlets', 'press', 'playlist', 'playlists', 'blog', 'media', 'station', 'community', 'communities', 'amplifier', 'amplifiers']],
  ['people', ['fan', 'fans', 'person', 'people', 'contact', 'contacts', 'operator', 'operators', 'member', 'members', 'owner', 'crew', 'team', 'user', 'recipient', 'recipients', 'author', 'actor', 'agent', 'agents', 'candidate', 'candidates', 'organiser', 'organizer']],
  ['events', ['show', 'shows', 'event', 'events', 'night', 'nights', 'gig', 'gigs', 'tour', 'drop', 'drops', 'campaign', 'campaigns', 'release', 'releases']],
  ['tasks', ['workflow', 'workflows', 'task', 'tasks', 'job', 'jobs', 'process', 'processes', 'flag', 'flags', 'objective', 'objectives', 'schedule', 'schedules', 'action', 'actions']],
]

/** Fields whose nullable value reads as trouble — leave them null, keep booleans false. */
const TROUBLE = new Set(['error', 'errors', 'failure', 'failures', 'failed', 'warning', 'warnings', 'blocked', 'blocker', 'blockers', 'cancelled', 'canceled', 'deleted', 'archived', 'revoked', 'suspended', 'parked', 'paused', 'retired', 'expired', 'dead', 'stale', 'degraded', 'refused', 'rejected', 'suppressed', 'unsubscribed', 'bounced', 'disabled', 'replayed', 'readonly', 'mobile', 'truncated', 'missing', 'incomplete', 'partial', 'lease', 'claimed', 'opt', 'unhealthy', 'overdue', 'conflict', 'conflicts', 'dropped', 'skipped', 'quarantined', 'locked', 'muted', 'stub', 'demo', 'unavailable', 'failing', 'issues', 'violations', 'gaps'])

/** Preferred literal when a lone status-like union has one of these members. */
const GOOD_LITERALS = ['healthy', 'ok', 'active', 'ready', 'live', 'connected', 'succeeded', 'completed', 'complete', 'running', 'enabled', 'published', 'confirmed', 'green', 'fresh', 'current', 'approved', 'sent', 'delivered', 'accepted', 'open', 'on_track', 'good']

const LONG_TEXT = new Set(['description', 'summary', 'reason', 'detail', 'details', 'body', 'message', 'note', 'notes', 'why', 'text', 'content', 'explanation', 'rationale', 'evidence', 'hint', 'copy', 'caption', 'question', 'answer', 'prompt', 'recommendation', 'headline', 'subtitle', 'blurb', 'brief', 'insight', 'context', 'narrative', 'pitch', 'draft', 'excerpt', 'preview', 'outcome', 'next', 'suggestion', 'consequence', 'impact'])

// ── Small helpers ────────────────────────────────────────────────────────────

function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619)
  return h >>> 0
}

function words(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase())
}

function pick<T>(list: readonly T[], n: number): T {
  return list[n % list.length]!
}

function kebab(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function uuid(n: number): string {
  const hex = (x: number) => (x >>> 0).toString(16).padStart(8, '0')
  const a = hex(n), b = hex(hash(String(n))), c = hex(hash(a + b)), d = hex(hash(c))
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-a${c.slice(1, 4)}-${c.slice(4)}${d}`
}

// ── Value generation ─────────────────────────────────────────────────────────

type Ctx = { keys: string[]; depth: number; index: number; seen: ts.Type[] }

function domainFor(keys: string[]): keyof typeof POOLS | null {
  for (let i = keys.length - 1; i >= 0; i--) {
    const ws = words(keys[i]!)
    for (const [pool, triggers] of DOMAINS) if (ws.some((w) => triggers.includes(w))) return pool
  }
  return null
}

function fakeString(ctx: Ctx): string {
  const key = ctx.keys[ctx.keys.length - 1] ?? ''
  const ws = words(key)
  const last = ws[ws.length - 1] ?? ''
  const n = hash(ctx.keys.join('.')) + ctx.index * 7
  const has = (...xs: string[]) => xs.some((x) => ws.includes(x))

  if (last === 'id' || last === 'ids' || key === 'id' || key.endsWith('Id')) return uuid(n)
  if (has('slug')) return kebab(pick(POOLS[domainFor(ctx.keys.slice(0, -1)) ?? 'events'], n))
  if (has('email')) return `${kebab(pick(POOLS.people, n)).replace('-', '.')}@example.com`
  if (has('image', 'avatar', 'photo', 'cover', 'artwork', 'thumbnail', 'logo', 'poster')) return `https://picsum.photos/seed/${n % 1000}/480/480`
  if (has('url', 'href', 'link', 'uri', 'website', 'endpoint')) return `https://example.com/${kebab(key) || 'link'}/${n % 1000}`
  if (last === 'at' || has('date', 'time', 'timestamp', 'since', 'until', 'expires', 'deadline', 'day', 'when')) {
    const future = has('next', 'starts', 'start', 'expires', 'until', 'deadline', 'due', 'scheduled', 'upcoming', 'event', 'show', 'ends', 'end', 'doors')
    const offset = ((n % 40) + 1) * DAY + (n % 24) * 3_600_000
    const iso = new Date(future ? NOW + offset : NOW - offset).toISOString()
    return has('day', 'date') && !has('time') && last !== 'at' ? iso.slice(0, 10) : iso
  }
  if (has('currency')) return 'PLN'
  if (has('country')) return 'PL'
  if (has('locale')) return 'pl-PL'
  if (has('timezone', 'tz')) return 'Europe/Warsaw'
  if (has('language', 'lang')) return 'pl'
  if (has('phone')) return `+48 600 ${String(100 + (n % 900))} ${String(100 + ((n >> 4) % 900))}`
  if (has('color', 'colour', 'hex')) return pick(['#7c3aed', '#0ea5e9', '#f97316', '#10b981'], n)
  if (has('sha', 'commit', 'digest')) return (hash(String(n)).toString(16) + n.toString(16)).padEnd(12, '0').slice(0, 12)
  if (has('version', 'tag')) return `v1.${n % 40}.${n % 7}`
  if (has('token', 'secret', 'fingerprint')) return `tok_${(n >>> 0).toString(36)}`
  if (has('username', 'handle', 'login')) return kebab(pick(POOLS.people, n)).replace('-', '.')
  if (has('path', 'route')) return `/${kebab(pick(POOLS.words, n))}`
  if (has('platform', 'network', 'channel', 'source') && !has('name', 'label', 'title')) return pick(POOLS.platforms, n)
  if (has('provider')) return pick(POOLS.providers, n)
  if (has('model')) return pick(['claude-sonnet-5-5', 'claude-haiku-4-5', 'claude-opus-5-5'], n)
  if (has('city', 'town')) return pick(POOLS.cities, n)
  if (has('venue', 'room', 'club')) return pick(POOLS.venues, n)
  if (has('artist', 'band', 'act', 'headliner')) return pick(POOLS.artists, n)
  if (has('status', 'state', 'phase', 'stage')) return pick(POOLS.statuses, n)
  if (has('kind', 'type', 'category', 'lane', 'tier', 'mode', 'role', 'level', 'severity', 'tone', 'priority', 'key', 'code', 'metric', 'unit', 'intent', 'archetype', 'segment', 'bucket', 'verdict', 'outcome') && !LONG_TEXT.has(last)) {
    return kebab(pick(POOLS.words, n)).replace(/-/g, '_')
  }
  if (ws.some((w) => LONG_TEXT.has(w))) return pick(POOLS.sentences, n)
  if (has('name', 'title', 'label', 'display', 'heading')) {
    const pool = domainFor(ctx.keys.slice(0, -1)) ?? domainFor([key]) ?? 'words'
    return pick(POOLS[pool], n)
  }
  if (has('by', 'owner', 'actor', 'author', 'operator', 'assignee', 'who')) return pick(POOLS.people, n)
  const pool = domainFor(ctx.keys)
  return pool ? pick(POOLS[pool], n) : pick(POOLS.words, n)
}

function fakeNumber(ctx: Ctx): number {
  const key = ctx.keys[ctx.keys.length - 1] ?? ''
  const ws = words(key)
  const n = hash(ctx.keys.join('.')) + ctx.index * 13
  const has = (...xs: string[]) => xs.some((x) => ws.includes(x))

  // `coverageCount`, `rateCount` — a count is a count whatever it counts.
  if (has('count')) return 3 + (n % 140)
  if (has('pct', 'percent', 'percentage')) return 12 + (n % 80)
  if (has('rate', 'ratio', 'share', 'confidence', 'probability', 'fraction', 'progress', 'ctr', 'conversion', 'coverage', 'lift', 'weight', 'propensity', 'likelihood')) return Math.round((0.12 + (n % 80) / 100) * 100) / 100
  if (has('score')) return Math.round((0.35 + (n % 60) / 100) * 100) / 100
  if (has('year')) return 2026
  if (has('month')) return 1 + (n % 12)
  if (has('hour', 'hours')) return n % 24
  if (has('port')) return 8080 + (n % 20)
  if (has('lat', 'latitude')) return 52.23 - (n % 300) / 100
  if (has('lng', 'lon', 'longitude')) return 21.01 - (n % 500) / 100
  if (has('ms', 'duration', 'latency', 'millis')) return 80 + (n % 2400)
  if (has('cents', 'minor')) return 2500 + (n % 400) * 100
  if (has('price', 'amount', 'revenue', 'cost', 'fee', 'budget', 'spend', 'eur', 'pln', 'usd', 'guarantee', 'income', 'payout', 'gross', 'net')) return 40 + (n % 60) * 50
  if (has('days', 'minutes', 'seconds', 'weeks', 'attempts', 'attempt', 'retries', 'rank', 'position', 'order', 'version', 'step', 'level', 'tier', 'age')) return 1 + (n % 9)
  if (has('capacity', 'fans', 'followers', 'listeners', 'reach', 'views', 'plays', 'streams', 'attendees', 'tickets', 'sold', 'members', 'audience', 'impressions', 'opens', 'clicks', 'subscribers', 'population', 'tokens')) return 40 + (n % 4800)
  if (has('count', 'total', 'size', 'sent', 'delivered', 'queued', 'pending', 'items', 'number')) return 3 + (n % 140)
  return 1 + (n % 60)
}

function fakeBoolean(ctx: Ctx): boolean {
  const ws = words(ctx.keys[ctx.keys.length - 1] ?? '')
  if (ws.some((w) => TROUBLE.has(w))) return false
  return hash(ctx.keys.join('.') + ctx.index) % 5 !== 0
}

function child(ctx: Ctx, key: string | null, index = ctx.index, type?: ts.Type): Ctx {
  return { keys: key === null ? ctx.keys : [...ctx.keys, key], depth: ctx.depth + 1, index, seen: type ? [...ctx.seen, type] : ctx.seen }
}

function fake(checker: ts.TypeChecker, type: ts.Type, ctx: Ctx): unknown {
  const f = type.flags
  if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return ctx.keys.length ? fakeString(ctx) : {}
  if (f & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) return undefined
  if (f & ts.TypeFlags.Null) return null
  if (f & ts.TypeFlags.Never) return null
  if (f & ts.TypeFlags.Boolean) return fakeBoolean(ctx)
  if (f & ts.TypeFlags.BooleanLiteral) return (type as unknown as { intrinsicName: string }).intrinsicName === 'true'
  if (f & ts.TypeFlags.StringLiteral) return (type as ts.StringLiteralType).value
  if (f & ts.TypeFlags.NumberLiteral) return (type as ts.NumberLiteralType).value
  if (f & (ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral)) return fakeString(ctx)
  if (f & (ts.TypeFlags.Number | ts.TypeFlags.BigInt)) return fakeNumber(ctx)

  if (type.isUnion()) {
    const members = type.types.filter((t) => !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)))
    const nullable = members.length < type.types.length
    const keyWords = words(ctx.keys[ctx.keys.length - 1] ?? '')
    if (nullable && keyWords.some((w) => TROUBLE.has(w))) return type.types.some((t) => t.flags & ts.TypeFlags.Null) ? null : undefined
    if (members.length === 0) return null
    if (members.every((t) => t.flags & ts.TypeFlags.BooleanLiteral)) return fakeBoolean(ctx)
    const literals = members.filter((t) => t.flags & (ts.TypeFlags.StringLiteral | ts.TypeFlags.NumberLiteral))
    if (literals.length === members.length) {
      const values = literals.map((t) => (t as ts.StringLiteralType | ts.NumberLiteralType).value)
      const inList = ctx.keys.some((k) => /^\d+$/.test(k))
      if (!inList) {
        const good = values.find((v) => typeof v === 'string' && GOOD_LITERALS.includes(v))
        if (good !== undefined) return good
        return values[0]
      }
      return pick(values, hash(ctx.keys.filter((k) => !/^\d+$/.test(k)).join('.')) + ctx.index)
    }
    // Mixed union: prefer an object shape (richer to render), else the first member.
    // An `{ __error: string }` / `{ error: … }` member is the failure shape; skip it.
    const failure = (t: ts.Type) => checker.getPropertiesOfType(t).some((p) => words(p.getName()).some((w) => TROUBLE.has(w)))
    const allObjects = members.filter((t) => t.flags & ts.TypeFlags.Object)
    const healthy = allObjects.filter((t) => !failure(t))
    const objects = healthy.length ? healthy : allObjects
    const chosen = objects.length ? pick(objects, ctx.index) : members[0]!
    return fake(checker, chosen, ctx)
  }

  if (type.isIntersection() || f & ts.TypeFlags.Object) {
    if (ctx.depth > 10 || ctx.seen.filter((t) => t === type).length >= 2) {
      return checker.isArrayType(type) ? [] : null
    }
    if (checker.isTupleType(type)) {
      return checker.getTypeArguments(type as ts.TypeReference).map((t, i) => fake(checker, t, child(ctx, String(i), i, type)))
    }
    if (checker.isArrayType(type)) {
      const element = checker.getTypeArguments(type as ts.TypeReference)[0]
      if (!element) return []
      // `degraded: Section[]`, `errors: string[]` — a list of trouble is empty.
      if (words(ctx.keys[ctx.keys.length - 1] ?? '').some((w) => TROUBLE.has(w))) return []
      const length = ctx.depth <= 2 ? 6 : ctx.depth <= 4 ? 4 : ctx.depth <= 6 ? 2 : 1
      return Array.from({ length }, (_, i) => fake(checker, element, child(ctx, String(i), i, type)))
    }
    const props = checker.getPropertiesOfType(type)
    const stringIndex = type.getStringIndexType()
    if (props.length === 0 && stringIndex) {
      const out: Record<string, unknown> = {}
      const keyWords = ctx.keys.flatMap(words)
      const keys = keyWords.some((w) => ['city', 'cities', 'market', 'markets'].includes(w))
        ? POOLS.cities.slice(0, 4).map(kebab)
        : POOLS.platforms.slice(0, 4)
      for (const [i, k] of keys.entries()) out[k] = fake(checker, stringIndex, child(ctx, k, i, type))
      return out
    }
    if (props.length === 0 && type.getCallSignatures().length) return undefined
    const out: Record<string, unknown> = {}
    for (const prop of props) {
      const propType = checker.getTypeOfSymbol(prop)
      const value = fake(checker, propType, child(ctx, prop.getName(), ctx.index, type))
      if (value !== undefined) out[prop.getName()] = value
    }
    return out
  }
  return null
}

// ── Route discovery ──────────────────────────────────────────────────────────

function templateToPattern(node: ts.Expression): { pattern: RegExp; specificity: number } | null {
  // `\`/x\` + (q ? \`?q=…\` : '')` — the left operand is the path.
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return templateToPattern(node.left)
  let raw: string
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) raw = node.text
  else if (ts.isTemplateExpression(node)) {
    raw = node.head.text
    for (const span of node.templateSpans) raw += '\u0000' + span.literal.text
  } else return null
  return rawToPattern(raw)
}

/** `\u0000` marks a substitution. */
function rawToPattern(raw: string): { pattern: RegExp; specificity: number } {
  raw = raw.split('?')[0]!
  let source = ''
  let specificity = 0
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!
    if (ch === '\u0000') {
      // A substitution right after `/` is a path parameter; anywhere else it is
      // a query suffix (`${qs}`) and is dropped.
      if (raw[i - 1] === '/') source += '[^/]+'
      continue
    }
    source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    specificity++
  }
  source = source.replace(/\/$/, '')
  return { pattern: new RegExp(`^${source}/?$`), specificity }
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) ? [full] : []
  })
}

/** Capability id → its surface read path, from the `read: { path }` entries. */
function capabilityReads(source: ts.SourceFile | undefined): Map<string, string> {
  const reads = new Map<string, string>()
  const prop = (o: ts.ObjectLiteralExpression, name: string) =>
    o.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText(source) === name)?.initializer
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const id = prop(node, 'id')
      const read = prop(node, 'read')
      if (id && ts.isStringLiteral(id) && read && ts.isObjectLiteralExpression(read)) {
        const p = prop(read, 'path')
        if (p && ts.isStringLiteral(p)) reads.set(id.text, p.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  if (source) visit(source)
  return reads
}

function discoverRoutes(srcDir: string, tsconfig: string): { routes: Route[]; checker: ts.TypeChecker } {
  const parsed = ts.getParsedCommandLineOfConfigFile(tsconfig, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })
  const files = sourceFiles(srcDir).filter((f) => /request<|surface\.read</.test(fs.readFileSync(f, 'utf8')))
  const capabilitiesFile = path.join(srcDir, 'lib/capabilities.ts')
  const program = ts.createProgram({ rootNames: [...files, capabilitiesFile], options: parsed?.options ?? {} })
  const checker = program.getTypeChecker()
  const reads = capabilityReads(program.getSourceFile(capabilitiesFile))
  const routes: Route[] = []
  const seen = new Set<string>()
  const add = (method: string, target: { pattern: RegExp; specificity: number } | null, typeNode: ts.TypeNode) => {
    if (!target) return
    const type = checker.getTypeFromTypeNode(typeNode)
    if (type.flags & ts.TypeFlags.TypeParameter) return
    const id = `${method} ${target.pattern.source}`
    if (seen.has(id)) return
    seen.add(id)
    routes.push({ method, ...target, type })
  }
  for (const file of files) {
    const source = program.getSourceFile(file)
    if (!source) continue
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.typeArguments?.length) {
        const callee = node.expression.getText(source)
        if (callee === 'request' && node.arguments[0]) {
          let method = 'GET'
          const init = node.arguments[1]
          if (init && ts.isObjectLiteralExpression(init)) {
            for (const p of init.properties) {
              if (ts.isPropertyAssignment(p) && p.name.getText(source) === 'method' && ts.isStringLiteral(p.initializer)) method = p.initializer.text
            }
          }
          add(method, templateToPattern(node.arguments[0]), node.typeArguments[0]!)
        }
        // `surface.read<T>(slug, capability('id').read!.path, …)`, or a panel's
        // own `read<T>(…, capability('id').read!.path)` wrapper around it — the
        // path lives in the capability table, `{param}` segments and all.
        if (callee !== 'request') {
          const id = node.arguments.map((a) => a.getText(source).match(/^(?:fillPath\()?capability\('([^']+)'\)\.read/)?.[1]).find(Boolean)
          const table = id ? reads.get(id) : undefined
          if (table) add('GET', rawToPattern(`/tenants/\u0000/surface/${table.replace(/\{[a-z_]+\}/g, '\u0000')}`), node.typeArguments[0]!)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  // Literal segments beat parameters: `/shows/new` before `/shows/:slug`.
  routes.sort((a, b) => b.specificity - a.specificity)
  return { routes, checker }
}

// ── Plugin ───────────────────────────────────────────────────────────────────

/** The demo account. Any password signs it in; it can reach nothing real. */
export const DEMO_USERNAME = 'demo.admin'
const DEMO_COOKIE = 'cp_demo'

type MockOptions = {
  root: string
  /** Answer every request from the mock, signed in or not (`npm run dev:mock`). */
  always: boolean
  /** Where a non-demo sign-in is forwarded. */
  apiTarget: string
  adminToken: string
}

type Req = import('node:http').IncomingMessage
type Res = import('node:http').ServerResponse

const isDemo = (req: Req) => (req.headers.cookie ?? '').split(/;\s*/).includes(`${DEMO_COOKIE}=1`)
const demoCookie = (on: boolean) =>
  `${DEMO_COOKIE}=${on ? '1' : ''}; Path=/; HttpOnly; SameSite=Lax${on ? '' : '; Max-Age=0'}`

function readBody(req: Req): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: Res, status: number, body: unknown, headers: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  if (body === undefined) { res.statusCode = 204; res.end(); return }
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

/**
 * The `demo.admin` account on the ordinary dev server. Signing in as it (or
 * opening `/demo`) sets a cookie; from then on every `/api` request from that
 * browser is answered here with generated data and never reaches the backend,
 * so nothing it does can write to a database. Signing out (or `/demo/exit`)
 * drops the cookie and the next request goes to the real API again.
 */
export function apiMock(options: MockOptions): Plugin {
  const srcDir = path.join(options.root, 'src')
  const tsconfig = path.join(options.root, 'tsconfig.json')
  let state: ReturnType<typeof discoverRoutes> | null = null
  const cache = new Map<string, unknown>()

  const load = () => {
    if (!state) {
      const started = Date.now()
      state = discoverRoutes(srcDir, tsconfig)
      cache.clear()
      console.log(`[api-mock] ${state.routes.length} routes from src/ in ${Date.now() - started} ms`)
    }
    return state
  }

  const answer = (req: Req, res: Res, method: string, pathname: string) => {
    const { routes, checker } = load()
    const route = routes.find((r) => r.method === method && r.pattern.test(pathname))
      ?? (method === 'HEAD' ? routes.find((r) => r.method === 'GET' && r.pattern.test(pathname)) : undefined)
    if (!route) {
      // Writes the generator doesn't know about still succeed, so forms close.
      if (method === 'GET') sendJson(res, 404, { error: 'not_found', detail: `No mock for ${method} ${pathname}` })
      else sendJson(res, 200, {})
      return
    }
    const cacheKey = `${method} ${pathname}`
    let body = cache.get(cacheKey)
    if (body === undefined && !cache.has(cacheKey)) {
      // Seed from the concrete path so two shows get different content.
      const generated = fake(checker, route.type, { keys: [], depth: 0, index: hash(pathname) % 97, seen: [] })
      body = applyOverrides(method, pathname, generated)
      if (method === 'GET') cache.set(cacheKey, body)
    }
    // Drain the request so the socket is reusable; writes are never applied.
    req.resume()
    // A beat of latency so skeletons are visible for a moment, as on the real stack.
    setTimeout(() => sendJson(res, 200, body), 150 + (hash(pathname) % 250))
  }

  /** A real sign-in: the body was read to check the username, so forward it by hand. */
  const forwardSignIn = async (req: Req, res: Res, body: string) => {
    try {
      const upstream = await fetch(`${options.apiTarget}/api/v1/auth/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.adminToken}` },
        body,
      })
      res.statusCode = upstream.status
      upstream.headers.forEach((v, k) => { if (k !== 'content-encoding' && k !== 'content-length' && k !== 'transfer-encoding') res.setHeader(k, v) })
      const setCookies = upstream.headers.getSetCookie?.() ?? []
      if (setCookies.length) res.setHeader('set-cookie', setCookies)
      res.end(Buffer.from(await upstream.arrayBuffer()))
    } catch {
      sendJson(res, 502, { error: 'bad_gateway', detail: `The local API at ${options.apiTarget} isn't running. Sign in as ${DEMO_USERNAME} to use fake data.` })
    }
    void req
  }

  return {
    name: 'control-plane-api-mock',
    apply: 'serve',
    configureServer(server) {
      server.watcher.on('change', (file) => {
        if (file.startsWith(srcDir) && /\.tsx?$/.test(file)) state = null
      })
      server.middlewares.use((req, res, next) => {
        void (async () => {
          const url = req.url ?? ''
          const method = (req.method ?? 'GET').toUpperCase()
          const pathname = url.split('?')[0]!

          if (pathname === '/demo' || pathname === '/demo/') {
            res.statusCode = 302
            res.setHeader('set-cookie', demoCookie(true))
            res.setHeader('location', '/')
            res.end()
            return
          }
          if (pathname === '/demo/exit') {
            res.statusCode = 302
            res.setHeader('set-cookie', demoCookie(false))
            res.setHeader('location', '/')
            res.end()
            return
          }
          if (!url.startsWith('/api/v1/') && !url.startsWith('/healthz')) return next()

          const demo = options.always || isDemo(req)
          const apiPath = pathname.slice('/api/v1'.length)

          if (apiPath === '/auth/session' && method === 'POST') {
            const body = await readBody(req)
            let username = ''
            try { username = String((JSON.parse(body) as { username?: unknown }).username ?? '') } catch { /* not JSON */ }
            if (options.always || username.trim().toLowerCase() === DEMO_USERNAME) {
              sendJson(res, 200, applyOverrides('GET', '/auth/session', null), { 'set-cookie': demoCookie(true) })
            } else {
              await forwardSignIn(req, res, body)
            }
            return
          }
          if (!demo) return next()

          if (url.startsWith('/healthz')) { sendJson(res, 200, { status: 'ok' }); return }
          if (apiPath === '/auth/session' && method === 'DELETE') {
            req.resume()
            sendJson(res, 204, undefined, { 'set-cookie': demoCookie(false) })
            return
          }
          answer(req, res, method, apiPath)
        })().catch(next)
      })
    },
  }
}
