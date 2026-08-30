import { For, Show, createMemo, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { ProcessMap } from '../components/ProcessMap'

export function FlowPage() {
  const tenants = useQuery(() => ({
    queryKey: ['tenants'],
    queryFn: () => api.tenants(),
    reconcile: 'id',
  }))
  const [selected, setSelected] = createSignal('')

  const slug = createMemo(() => {
    const items = tenants.data?.items ?? []
    const chosen = items.find((tenant) => tenant.slug === selected())
    return (chosen ?? items[0])?.slug ?? ''
  })

  return (
    <section class="page">
      <div class="page-head">
        <div>
          <span class="eyebrow">BIG PICTURE</span>
          <h1>Process map</h1>
          <p>
            Sources feed the intelligence (deterministic Rust autopilot). Intelligence dispatches LLM workers
            that gather intelligence and draft content. Outcomes feed back into the causal model.
            Click any block to jump to its page.
          </p>
        </div>
        <Show when={tenants.data?.items.length}>
          <label class="field">
            <span>Tenant</span>
            <select value={slug()} onChange={(e) => setSelected(e.currentTarget.value)}>
              <For each={tenants.data?.items ?? []}>
                {(tenant) => (
                  <option value={tenant.slug} selected={tenant.slug === slug()}>
                    {tenant.displayName}
                  </option>
                )}
              </For>
            </select>
          </label>
        </Show>
      </div>

      <Show
        when={slug()}
        fallback={<div class="error-card" role="alert">No active tenant — create one on the Tenants tab.</div>}
      >
        <div class="process-map-legend">
          <span><i class="legend-swatch legend-inputs" />Sources</span>
          <span><i class="legend-swatch legend-intel" />Intelligence</span>
          <span><i class="legend-swatch legend-worker" />Workers</span>
          <span><i class="legend-swatch legend-outcome" />Outcomes</span>
          <span><i class="legend-swatch legend-learning" />Learning loop</span>
        </div>
        <ProcessMap slug={slug} />
      </Show>
    </section>
  )
}
