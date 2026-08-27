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
            Inputs → agent → outcome. Click any block to jump to the tab that
            manages it.
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
          <span><i style={{ background: '#71dcff' }} />Inputs</span>
          <span><i style={{ background: '#ffd56d' }} />Agent</span>
          <span><i style={{ background: '#ff6680' }} />Outcome</span>
          <span><i style={{ background: '#7dffb2' }} />Learning loop</span>
        </div>
        <ProcessMap slug={slug} />
      </Show>
    </section>
  )
}
