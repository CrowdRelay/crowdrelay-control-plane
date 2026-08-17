import { For, Show, createEffect, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { api } from '../lib/api'
import type { Palette, RuntimeHealth } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'

const paletteFields: Array<keyof Palette> = ['primary','primaryContrast','accent','surface','surfaceElevated','text','textMuted','success','warning','danger']
const defaultPalette: Palette = { primary:'#8b5cf6', primaryContrast:'#ffffff', accent:'#22d3ee', surface:'#0b0c0f', surfaceElevated:'#15171c', text:'#f7f7f8', textMuted:'#9ca3af', success:'#22c55e', warning:'#f59e0b', danger:'#ef4444' }
const runtimeTone = (health: RuntimeHealth) => health === 'healthy' ? 'good' : health === 'degraded' ? 'bad' : health === 'stale' ? 'warn' : 'muted'

export function TenantPage() {
  const params = useParams({ from: '/tenants/$slug' })
  const queryClient = useQueryClient()
  const tenant = useQuery(() => ({ queryKey: ['tenant', params().slug], queryFn: () => api.tenant(params().slug), refetchInterval: 30_000 }))
  const audit = useQuery(() => ({ queryKey: ['tenant-audit', params().slug], queryFn: () => api.audit(params().slug) }))
  const [palette, setPalette] = createSignal<Palette>(defaultPalette)
  const [editingPalette, setEditingPalette] = createSignal(false)
  const [desiredVersion, setDesiredVersion] = createSignal('')
  createEffect(() => { if (tenant.data?.brandingPalette) setPalette(tenant.data.brandingPalette) })
  const branding = useMutation(() => ({ mutationFn: (value: Palette | null) => api.branding(params().slug, value), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['tenant', params().slug] }) } }))
  const status = useMutation(() => ({ mutationFn: (action: 'suspend'|'resume') => action === 'suspend' ? api.suspend(params().slug) : api.resume(params().slug), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['tenant', params().slug] }) } }))
  const provision = useMutation(() => ({ mutationFn: () => api.planProvisioning(params().slug, desiredVersion()) }))

  return <section class="page"><Show when={tenant.data} fallback={<div class="skeleton-block"/>}>{data => {
    const t = data()
    return <>
      <div class="page-head"><div><span class="eyebrow">TENANT / {t.slug.toUpperCase()}</span><h1>{t.displayName}</h1><p>{t.workspaceId ?? 'Workspace mapping pending'}</p></div><div class="row-health"><StatusBadge status={t.status} tone={t.status === 'active' ? 'good' : t.status === 'suspended' ? 'bad' : 'warn'} />{t.slug !== 'virya' && <button class="ghost" onClick={() => status.mutate(t.status === 'suspended' ? 'resume' : 'suspend')}>{t.status === 'suspended' ? 'Resume' : 'Suspend'}</button>}</div></div>
      <div class="detail-grid">
        <article class="panel"><div class="section-title"><div><span class="eyebrow">RUNTIME</span><h2>Health</h2></div><StatusBadge status={t.runtimeHealth} tone={runtimeTone(t.runtimeHealth)} /></div><dl><dt>API</dt><dd>{String(t.runtime?.apiHealthy ?? 'unknown')}</dd><dt>Worker</dt><dd>{String(t.runtime?.workerHealthy ?? 'unknown')}</dd><dt>Schema</dt><dd>{t.runtime?.schemaVersion ?? '—'}</dd><dt>Deploy SHA</dt><dd class="mono">{t.runtime?.deployedSha?.slice(0,12) ?? '—'}</dd><dt>Outbox pending</dt><dd>{t.runtime?.outboxPending ?? '—'}</dd><dt>Heartbeat</dt><dd>{t.runtime?.lastHeartbeatAt ? new Date(t.runtime.lastHeartbeatAt).toLocaleString() : '—'}</dd></dl></article>
        <article class="panel"><span class="eyebrow">PRODUCTS</span><h2>Entitlements</h2><div class="product-row"><strong>CrowdRelay</strong><StatusBadge status="enabled" tone="good" /></div><div class="product-row"><strong>Signal</strong><StatusBadge status="enabled" tone="good" /></div><div class="product-row"><strong>Synesthesia</strong><StatusBadge status={t.synesthesiaEnabled ? 'Virya only' : 'not available'} tone={t.synesthesiaEnabled ? 'warn' : 'muted'} /></div></article>
      </div>
      <article class="panel"><div class="section-title"><div><span class="eyebrow">BRANDING</span><h2>CrowdRelay + Signal palette</h2></div>{t.brandingPalette ? <button class="ghost" onClick={() => branding.mutate(null)}>Reset to product defaults</button> : <StatusBadge status="Inherits current product defaults" />}</div><Show when={t.brandingPalette || editingPalette()} fallback={<div class="inherit-card"><p>No palette is stored for this tenant. CrowdRelay and Signal therefore keep their own current default colors with zero theming lookup required.</p><button class="ghost" onClick={() => setEditingPalette(true)}>Create custom palette</button></div>}><div class="palette-grid"><For each={paletteFields}>{field => <label>{field}<div class="color-input"><input type="color" value={palette()[field]} onInput={(e) => setPalette(current => ({ ...current, [field]: e.currentTarget.value }))}/><code>{palette()[field]}</code></div></label>}</For></div><button onClick={() => branding.mutate(palette())} disabled={branding.isPending}>Save custom palette</button></Show></article>
      <article class="panel"><span class="eyebrow">PROVISIONING</span><h2>Safe deployment plan</h2><p>Control Plane creates a reviewed plan. It deliberately does not execute arbitrary SSH or Docker commands from an HTTP request.</p><div class="provision-row"><input value={desiredVersion()} onInput={(e) => setDesiredVersion(e.currentTarget.value)} placeholder="desired version / SHA (optional)" /><button onClick={() => provision.mutate()} disabled={provision.isPending}>Generate plan</button></div><Show when={provision.data}><pre>{JSON.stringify(provision.data!.plan, null, 2)}</pre></Show></article>
      <article class="panel"><span class="eyebrow">AUDIT</span><h2>Recent platform changes</h2><div class="audit-list"><For each={audit.data?.items ?? []}>{item => <div class="audit-row"><div><strong>{item.action}</strong><small>{item.actor} · {new Date(item.createdAt).toLocaleString()}</small></div><code>{item.targetKind}</code></div>}</For></div></article>
    </>
  }}</Show></section>
}
