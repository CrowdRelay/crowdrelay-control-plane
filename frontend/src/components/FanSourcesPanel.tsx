import { For, Show, createSignal, createMemo } from 'solid-js'
import { useMutation, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { FanbaseBlock } from '../lib/types'

const SOURCE_KINDS = [
  { value: 'http_json_pull', label: 'HTTP JSON (pull)' },
  { value: 'csv_inline', label: 'CSV / inline batch' },
  { value: 'manual_import', label: 'Manual import' },
  { value: 'meta_lead_ads', label: 'Meta Lead Ads' },
  { value: 'bandsintown_followers', label: 'Bandsintown followers' },
  { value: 'google_customer_match', label: 'Google Customer Match' },
  { value: 'reddit_community', label: 'Reddit community' },
]

const EMPTY_INGEST = ''

export function FanSourcesPanel(props: {
  slug: string
  fanbases: FanbaseBlock[] | undefined
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [creating, setCreating] = createSignal(false)
  const [name, setName] = createSignal('')
  const [sourceKind, setSourceKind] = createSignal('http_json_pull')
  const [fetchUrl, setFetchUrl] = createSignal('')
  const [attestedBy, setAttestedBy] = createSignal('')
  const [ingestingId, setIngestingId] = createSignal<string | null>(null)
  const [ingestJson, setIngestJson] = createSignal('')
  const [notice, setNotice] = createSignal<string | null>(null)
  const [errorText, setErrorText] = createSignal<string | null>(null)

  const needsAttestation = createMemo(() => sourceKind() !== 'http_json_pull')

  const refresh = () => props.onChanged()

  const create = useMutation(() => ({
    mutationFn: () =>
      api.createFanbase(props.slug, {
        name: name(),
        sourceKind: sourceKind(),
        fetchUrl: fetchUrl() || undefined,
        consentAttestedBy: attestedBy() || undefined,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['fanbases', props.slug] })
      setCreating(false)
      resetForm()
      setNotice(`Fanbase created: ${result.fanbaseId}`)
    },
    onError: (error) => setErrorText(error instanceof Error ? error.message : 'Create failed'),
  }))

  const ingest = useMutation(() => ({
    mutationFn: async (input: { id: string; entries: { external_id: string; email?: string; display_name?: string; locale?: string }[] }) => {
      setPendingFor(input.id)
      setErrorText(null)
      return api.ingestFanbase(props.slug, input.id, input.entries)
    },
    onSuccess: async (counters) => {
      await queryClient.invalidateQueries({ queryKey: ['fanbases', props.slug] })
      setPendingFor(null)
      setIngestingId(null)
      setNotice(
        `Ingestion done — pending: ${counters.importedPending ?? 0}, active skipped: ${counters.alreadyActive ?? 0}, opt-outs: ${counters.skippedSuppressed ?? 0}, invalid: ${counters.invalid ?? 0}`,
      )
    },
    onError: (error) => {
      setPendingFor(null)
      setErrorText(error instanceof Error ? error.message : 'Ingestion failed')
    },
  }))

  const [pendingFor, setPendingFor] = createSignal<string | null>(null)

  const resetForm = () => {
    setName(''); setSourceKind('http_json_pull'); setFetchUrl(''); setAttestedBy('')
  }

  const parseEntries = (): { entries: Record<string, string>[] } | null => {
    try {
      const parsed = JSON.parse(ingestJson()) as { entries?: unknown }
      if (!parsed.entries || !Array.isArray(parsed.entries) || parsed.entries.length === 0) return null
      return { entries: parsed.entries as Record<string, string>[] }
    } catch {
      return null
    }
  }

  return <div class="panel">
    <h3>Fan sources</h3>
    <Show when={notice()}><p class="muted">{notice()}</p></Show>
    <Show when={errorText()}>
      <div class="error-card" role="alert">{errorText()}</div>
    </Show>
    <Show when={!creating}>
      <button onClick={() => setCreating(true)}>+ New fanbase</button>
    </Show>
    <Show when={creating}>
      <div class="field">
        <label>Name <input value={name()} onInput={e => setName(e.currentTarget.value)} /></label>
        <label>Source kind
          <select value={sourceKind()} onChange={e => setSourceKind(e.currentTarget.value)}>
            <For each={SOURCE_KINDS}>{k => <option value={k.value}>{k.label}</option>}</For>
          </select>
        </label>
        <Show when={sourceKind() === 'http_json_pull'}>
          <label>Fetch URL <input value={fetchUrl()} onInput={e => setFetchUrl(e.currentTarget.value)} placeholder="https://…/candidates.json" /></label>
        </Show>
        <Show when={needsAttestation()}>
          <label>Consent attested by <input value={attestedBy()} onInput={e => setAttestedBy(e.currentTarget.value)} placeholder="operator@label" /></label>
        </Show>
        <div class="actions">
          <button disabled={!name() || (needsAttestation() && !attestedBy())}
            onClick={() => create.mutate()}>Create</button>
          <button onClick={() => setCreating(false)}>Cancel</button>
        </div>
      </div>
    </Show>

    <table class="data-table">
      <thead><tr><th>Name</th><th>Origin</th><th>Members</th><th>Last ingestion</th><th>Ingest</th></tr></thead>
      <tbody>
        <For each={props.fanbases ?? []}>{fb => (
          <tr>
            <td>{fb.name}{fb.enabled ? '' : ' (off)'}</td>
            <td>{fb.source_kind}</td>
            <td>{fb.members ?? 0}</td>
            <td>{fb.last_status ?? '—'}</td>
            <td>
              <Show when={ingestingId() === fb.id} fallback={
                <button disabled={pendingFor() !== null}
                  onClick={() => { setIngestingId(fb.id); setIngestJson(EMPTY_INGEST) }}>
                  Ingest batch…
                </button>
              }>
                <div class="field">
                  <textarea rows="4" placeholder='{"entries":[{"external_id":"x1","email":"a@b.c"}]}'
                    value={ingestJson()} onInput={e => setIngestJson(e.currentTarget.value)} />
                  <div class="actions">
                    <button disabled={!parseEntries()}
                      onClick={() => {
                        const parsed = parseEntries()
                        if (parsed) ingest.mutate({ id: fb.id, entries: parsed.entries as never })
                      }}>Run</button>
                    <button onClick={() => setIngestingId(null)}>Cancel</button>
                  </div>
                </div>
              </Show>
            </td>
          </tr>
        )}</For>
      </tbody>
    </table>
  </div>
}
