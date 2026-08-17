import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { Link } from '@tanstack/solid-router'
import { api } from '../lib/api'
import { StatusBadge } from '../components/StatusBadge'

export function TenantsPage() {
  const queryClient = useQueryClient()
  const tenants = useQuery(() => ({ queryKey: ['tenants'], queryFn: api.tenants }))
  const [creating, setCreating] = createSignal(false)
  const [slug, setSlug] = createSignal('')
  const [name, setName] = createSignal('')
  const createTenant = useMutation(() => ({ mutationFn: api.createTenant, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['tenants'] }); setCreating(false); setSlug(''); setName('') } }))
  return <section class="page">
    <div class="page-head"><div><span class="eyebrow">TENANT REGISTRY</span><h1>Teams on the platform</h1><p>Virya is the platform owner tenant. Synesthesia remains Virya-only by invariant.</p></div><button onClick={() => setCreating(true)}>+ New tenant</button></div>
    <Show when={creating()}><form class="inline-form" onSubmit={(e) => { e.preventDefault(); createTenant.mutate({ slug: slug(), displayName: name() }) }}><label>Slug<input value={slug()} onInput={(e) => setSlug(e.currentTarget.value)} placeholder="future-metal" /></label><label>Display name<input value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Future Metal" /></label><div class="form-actions"><button type="button" class="ghost" onClick={() => setCreating(false)}>Cancel</button><button type="submit" disabled={createTenant.isPending || slug().length < 2 || name().length < 2}>Create</button></div></form></Show>
    <div class="tenant-list"><For each={tenants.data?.items ?? []}>{tenant => <Link to="/tenants/$slug" params={{ slug: tenant.slug }} class="tenant-row large"><div><strong>{tenant.displayName}</strong><small>{tenant.slug} · {tenant.workspaceId ?? 'workspace not mapped'}</small></div><div class="row-health"><StatusBadge status={tenant.status} tone={tenant.status === 'active' ? 'good' : tenant.status === 'suspended' ? 'bad' : 'warn'} /><StatusBadge status={tenant.brandingPalette ? 'Custom palette' : 'Product defaults'} /><StatusBadge status={tenant.synesthesiaEnabled ? 'Synesthesia / Virya' : 'CrowdRelay + Signal'} tone={tenant.synesthesiaEnabled ? 'warn' : 'muted'} /></div></Link>}</For></div>
  </section>
}
