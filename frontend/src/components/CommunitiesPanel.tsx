import { For, Show, createResource, createSignal } from 'solid-js'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { SkeletonPanel } from './Skeleton'

// The communities the brain scans and posts into — subreddits, Discord and
// Telegram channels, forums, Lemmy.
//
// This panel exists because registering one previously meant running psql
// against the tenant's own database: the capability lived only under
// `/v1/admin`, which the control plane deliberately cannot reach, so a whole
// built slice was unreachable from the operator UI.
//
// It loads on its own rather than through the portfolio read model. The list is
// not needed to render the rest of the page, and folding it into the shared
// model would make every portfolio load wait for it.

const PLACE_KINDS = [
  'subreddit',
  'discord',
  'telegram',
  'lemmy',
  'forum',
  'facebook_group',
  'instagram',
  'tiktok',
  'youtube',
  'playlist',
  'zine',
  'festival',
  'other',
] as const

// The platform is free text upstream, but every kind has an obvious default and
// typing it twice is how the two drift apart.
const PLATFORM_FOR_KIND: Record<string, string> = {
  subreddit: 'reddit',
  discord: 'discord',
  telegram: 'telegram',
  lemmy: 'lemmy',
  forum: 'forum',
  facebook_group: 'facebook',
  instagram: 'instagram',
  tiktok: 'tiktok',
  youtube: 'youtube',
  playlist: 'spotify',
  zine: 'web',
  festival: 'web',
  other: 'web',
}

const number = (value: number | null) => (value === null ? '—' : value.toLocaleString())

export function CommunitiesPanel(props: { slug: string }) {
  const [places, { refetch }] = createResource(() => props.slug, s => api.audiencePlaces(s, { limit: 200 }))

  const [adding, setAdding] = createSignal(false)
  const [importing, setImporting] = createSignal(false)
  const [importText, setImportText] = createSignal('')
  const [saving, setSaving] = createSignal(false)
  const [notice, setNotice] = createSignal<{ tone: 'good' | 'bad'; message: string } | null>(null)
  const [kind, setKind] = createSignal<string>('subreddit')
  const [name, setName] = createSignal('')
  const [url, setUrl] = createSignal('')

  const byKind = () => {
    const counts = new Map<string, number>()
    for (const place of places()?.places ?? []) {
      counts.set(place.placeKind, (counts.get(place.placeKind) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }

  const submit = async (event: Event) => {
    event.preventDefault()
    if (saving()) return
    setSaving(true)
    setNotice(null)
    try {
      await api.upsertAudiencePlace(props.slug, {
        placeKind: kind(),
        platform: PLATFORM_FOR_KIND[kind()] ?? 'web',
        name: name().trim(),
        url: url().trim(),
      })
      setNotice({ tone: 'good', message: `Registered ${name().trim()}.` })
      setName(''); setUrl(''); setAdding(false)
      await refetch()
    } catch (error) {
      setNotice({ tone: 'bad', message: errorMessage(error, 'Could not register the community') })
    } finally {
      setSaving(false)
    }
  }

  // Bulk import. The scan of communities a researcher produces is a list, and
  // registering it one form at a time is why this was being done in psql.
  const runImport = async (event: Event) => {
    event.preventDefault()
    if (saving()) return
    let parsed: unknown
    try {
      parsed = JSON.parse(importText())
    } catch {
      setNotice({ tone: 'bad', message: 'That is not valid JSON.' })
      return
    }
    const places = Array.isArray(parsed) ? parsed : (parsed as { places?: unknown }).places
    if (!Array.isArray(places) || places.length === 0) {
      setNotice({ tone: 'bad', message: 'Expected an array of places, or { "places": [...] }.' })
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      const result = await api.importAudiencePlaces(props.slug, places as never)
      setNotice({ tone: 'good', message: `Imported ${result.imported ?? places.length}.` })
      setImportText(''); setImporting(false)
      await refetch()
    } catch (error) {
      setNotice({ tone: 'bad', message: errorMessage(error, 'Import failed') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section class="panel">
      <header class="panel-header">
        <h2>Communities</h2>
        <div class="panel-header-actions">
          <button class="ghost" onClick={() => { setImporting(false); setAdding(value => !value) }}>
            {adding() ? 'Cancel' : 'Add a community'}
          </button>
          <button class="ghost" onClick={() => { setAdding(false); setImporting(value => !value) }}>
            {importing() ? 'Cancel' : 'Import a list'}
          </button>
        </div>
      </header>

      <Show when={places.loading}><SkeletonPanel /></Show>

      <Show when={places.error}>
        <p class="notice bad">Could not load communities: {errorMessage(places.error, 'unknown error')}</p>
      </Show>

      <Show when={places()}>
        {data => (
          <>
            <Show
              when={data().places.length > 0}
              fallback={
                <p class="notice warn">
                  No communities registered. The brain has nowhere to look, so discovery and
                  outreach will correctly decide to do nothing.
                </p>
              }
            >
              <p class="muted">
                {data().places.length} registered — {byKind().map(([k, n]) => `${n} ${k.replaceAll('_', ' ')}`).join(', ')}.
              </p>
              <div class="stat-row">
                <For each={data().places.slice(0, 12)}>
                  {place => (
                    <div class="stat">
                      <span class="stat-label">{place.placeKind.replaceAll('_', ' ')}</span>
                      <a class="stat-value community-link" href={place.url} target="_blank" rel="noreferrer noopener">
                        {place.name}
                      </a>
                      <span class="stat-note">{number(place.memberCount)} members</span>
                    </div>
                  )}
                </For>
              </div>
              <Show when={data().places.length > 12}>
                <p class="muted">…and {data().places.length - 12} more.</p>
              </Show>
            </Show>
          </>
        )}
      </Show>

      <Show when={adding()}>
        <form class="form-grid" onSubmit={submit}>
          <label>
            Kind
            <select value={kind()} onChange={event => setKind(event.currentTarget.value)}>
              <For each={PLACE_KINDS}>{value => <option value={value}>{value.replaceAll('_', ' ')}</option>}</For>
            </select>
          </label>
          <label>
            Name <small>as people refer to it, e.g. r/progmetal</small>
            <input value={name()} onInput={event => setName(event.currentTarget.value)} required maxlength={200} />
          </label>
          <label>
            URL <small>identity is the platform and URL together</small>
            <input value={url()} onInput={event => setUrl(event.currentTarget.value)} required type="url" maxlength={512} />
          </label>
          <div class="form-actions right">
            <button class="primary" type="submit" disabled={saving() || !name().trim() || !url().trim()}>
              {saving() ? 'Registering…' : 'Register'}
            </button>
          </div>
        </form>
      </Show>

      <Show when={importing()}>
        <form onSubmit={runImport}>
          <label class="import-label">
            Paste a scan
            <small>
              A JSON array of {'{ placeKind, platform, name, url }'} — genres, memberCount, notes and
              country optional. Re-importing the same platform and URL refreshes it rather than
              duplicating it.
            </small>
            <textarea
              class="import-area"
              rows={8}
              spellcheck={false}
              value={importText()}
              onInput={event => setImportText(event.currentTarget.value)}
              placeholder='[{"placeKind":"subreddit","platform":"reddit","name":"r/progmetal","url":"https://reddit.com/r/progmetal"}]'
            />
          </label>
          <div class="form-actions right">
            <button class="primary" type="submit" disabled={saving() || !importText().trim()}>
              {saving() ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
      </Show>

      <Show when={notice()}>
        {value => <p class={`notice ${value().tone}`}>{value().message}</p>}
      </Show>
    </section>
  )
}
