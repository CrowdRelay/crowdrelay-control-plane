import { For, Show, createSignal, createMemo } from 'solid-js'
import { useMutation } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { PortfolioSettingsReadModel } from '../lib/types'

const LABELS: Record<string, string> = {
  member_site_base_url: 'Member site base URL',
  member_area_path: 'Member area path',
  synesthesia_campaign_slug: 'Synesthesia campaign slug',
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

  return <div class="panel">
    <h3>Brand settings</h3>
    <p class="muted">
      Overrides for this tenant. Empty fields mean the shipped default is live.
    </p>
    <div class="form-grid">
      <For each={keys()}>{key => (
        <label>
          {LABELS[key] ?? key}
          <Show when={props.model?.overridden.includes(key)}>
            {' '}<em class="override-badge">override</em>
          </Show>
          <input
            value={drafts()[key] ?? props.model?.settings[key] ?? ''}
            onInput={e => setDrafts(current => ({ ...current, [key]: e.currentTarget.value }))}
          />
        </label>
      )}</For>
    </div>
      <div class="form-actions">
        <For each={keys()}>{key => (
          <Show when={dirty(key)}>
            <button
              disabled={pendingKey() !== null}
              onClick={() => save.mutate(key)}
            >
              {pendingKey() === key ? 'Saving…' : `Save ${LABELS[key] ?? key}`}
            </button>
          </Show>
        )}</For>
        <Show when={savedKey()}>
          <span class="muted">Saved {LABELS[savedKey()!] ?? savedKey()}</span>
        </Show>
      </div>
    <Show when={errorText()}>
      <div class="error-card" role="alert">{errorText()}</div>
    </Show>
  </div>
}
