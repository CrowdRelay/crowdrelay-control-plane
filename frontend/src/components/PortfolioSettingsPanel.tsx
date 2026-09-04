import { For, Show, createMemo, createResource, createSignal } from 'solid-js'
import { useMutation } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { PortfolioSettingsReadModel } from '../lib/types'
import { SectionIcon } from './SectionIcon'

const LABELS: Record<string, string> = {
  member_site_base_url: 'Member site base URL',
  member_area_path: 'Member area path',
  synesthesia_campaign_slug: 'Synesthesia campaign slug',
  signal_enabled: 'Signal app',
  synesthesia_enabled: 'Synesthesia',
  north_star_metric: 'North star metric',
}

// The server grew three more editable keys than this panel had labels for, so
// `signal_enabled` and `north_star_metric` rendered as their own key names over
// a free-text box — a boolean and an enum you had to spell correctly by hand.
const BOOLEAN_KEYS = new Set(['signal_enabled', 'synesthesia_enabled'])

// A key name alone does not say what the value does or what shape it takes.
// Each row carries what the value drives, and an example of a valid one — the
// two questions an operator has in front of an empty text field.
const HINTS: Record<string, { hint: string; example: string }> = {
  member_site_base_url: {
    hint: 'Origin the fan-facing member links point at. Emails, Signal deep links and QR codes are all built from it.',
    example: 'https://future-metal.example',
  },
  member_area_path: {
    hint: 'Path appended to the member site for the logged-in area. Leading slash, no trailing one.',
    example: '/members',
  },
  synesthesia_campaign_slug: {
    hint: 'Campaign the Synesthesia experience opens on. Must match a campaign slug that exists in the tenant workspace.',
    example: 'sanity-check',
  },
  signal_enabled: {
    hint: 'Whether the Signal mobile app is part of this tenant. Turning it off stops the brain dispatching signal-inviter work and hides Signal links from fan-facing surfaces.',
    example: 'true',
  },
  synesthesia_enabled: {
    hint: 'Whether the Synesthesia album experience is part of this tenant. Off means its campaign and leaderboard are not offered to fans.',
    example: 'false',
  },
  north_star_metric: {
    hint: 'The one number the brain optimises. Everything else is still aggregated — this only decides what it prioritises when it has to choose.',
    example: 'total_audience',
  },
}

// One text input per editable key. A key with no override shows the shipped
// default (the value already merged upstream) and an "override" badge only
// when a row exists — so operators always see what is live, not what is saved.
export function PortfolioSettingsPanel(props: {
  slug: string
  model: PortfolioSettingsReadModel | undefined
  onChanged: () => void
}) {
  const [drafts, setDrafts] = createSignal<Record<string, string>>({})
  const [pendingKey, setPendingKey] = createSignal<string | null>(null)
  const [errorText, setErrorText] = createSignal<string | null>(null)
  const [savedKey, setSavedKey] = createSignal<string | null>(null)

  // The north star vocabulary lives in the Rust domain, so the picker asks the
  // server for it rather than shipping a second copy that can drift.
  const [goals] = createResource(() => props.slug, api.northStarOptions)

  const keys = createMemo(() => props.model?.editable_keys ?? [])
  const dirty = (key: string) =>
    drafts()[key] !== undefined && drafts()[key] !== props.model?.settings[key]

  const save = useMutation(() => ({
    mutationFn: async (key: string) => {
      setPendingKey(key); setErrorText(null); setSavedKey(null)
      return api.updatePortfolioSetting(props.slug, key, drafts()[key] ?? '')
    },
    onSuccess: async (_result, key) => {
      setDrafts(current => {
        const next = { ...current }
        delete next[key]
        return next
      })
      setSavedKey(key)
      setPendingKey(null)
      props.onChanged()
    },
    onError: (error) => {
      setPendingKey(null)
      setErrorText(error instanceof Error ? error.message : 'Save failed')
    },
  }))

  return <article class="panel">
    <div class="section-title">
      <div><span class="eyebrow">BRAND</span><h2><SectionIcon name="settings" />Brand settings</h2><p>Where this tenant's fan-facing links point. Each field is live as soon as it is saved — the apps read these values directly.</p></div>
    </div>
    <p class="agent-section-intro">A field left empty runs the shipped default; <span class="badge tone-warn override-pill">override</span> marks the ones this tenant has replaced. Edit a field and its Save button appears beside it.</p>
    <div class="form-grid">
      <For each={keys()}>{key => (
        <label>
          <span>
            {LABELS[key] ?? key}
            <Show when={props.model?.overridden.includes(key)}>
              {' '}<span class="badge tone-warn override-pill">override</span>
            </Show>
          </span>
          <Show
            when={BOOLEAN_KEYS.has(key)}
            fallback={
              <Show
                when={key === 'north_star_metric' && (goals()?.options.length ?? 0) > 0}
                fallback={
                  <input
                    value={drafts()[key] ?? props.model?.settings[key] ?? ''}
                    placeholder={HINTS[key]?.example}
                    onInput={e => setDrafts(current => ({ ...current, [key]: e.currentTarget.value }))}
                  />
                }
              >
                <select
                  value={drafts()[key] ?? props.model?.settings[key] ?? ''}
                  onChange={e => setDrafts(current => ({ ...current, [key]: e.currentTarget.value }))}
                >
                  <For each={goals()!.options}>{option =>
                    <option value={option.value}>{option.label}</option>
                  }</For>
                </select>
              </Show>
            }
          >
            <select
              value={drafts()[key] ?? props.model?.settings[key] ?? 'false'}
              onChange={e => setDrafts(current => ({ ...current, [key]: e.currentTarget.value }))}
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </Show>
          <Show when={HINTS[key]}>{h => <small>{h().hint}<Show when={!BOOLEAN_KEYS.has(key) && key !== 'north_star_metric'}> Example: <code>{h().example}</code></Show></small>}</Show>
          <Show when={dirty(key)} fallback={
            <Show when={savedKey() === key}><small class="muted">Saved ✓</small></Show>
          }>
            <div class="portfolio-field-save">
              <button
                disabled={pendingKey() !== null}
                onClick={() => save.mutate(key)}
              >
                {pendingKey() === key ? 'Saving…' : 'Save'}
              </button>
            </div>
          </Show>
        </label>
      )}</For>
    </div>
    <Show when={errorText()}>
      <div class="error-card" role="alert">{errorText()}</div>
    </Show>
  </article>
}
