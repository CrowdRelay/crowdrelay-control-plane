import { For, Show, createMemo, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { Link, useNavigate } from '@tanstack/solid-router'
import { Building2, ChevronRight, Plus, Search, SearchX } from 'lucide-solid'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { formatIsoAge } from '../lib/format'
import { healthLabel, healthTone } from '../lib/health-tone'
import type { TenantSummary } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { ErrorCard, PageShell } from '../components/layout'
import { DashHeader, WorkAreaPanel, WorkAreas, useWorkAreas } from '../components/ui/dash'
import { FleetList } from '../components/FleetList'
import { buttonVariants } from '../components/app/button'
import { Card, CardContent } from '../components/app/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/app/table'
import { Input } from '../components/ui/input'
import { Skeleton } from '../components/ui/skeleton'
import { EmptyState } from '../components/ui/empty-state'

// The registry: one row per tenant, the columns an operator scans before
// opening one. Creating a tenant is the wizard's job (/tenants/new), so this
// page only lists.

const statusTone = (status: TenantSummary['status']) =>
  status === 'active' ? 'good' : status === 'suspended' ? 'bad' : 'warn'

const region = (t: TenantSummary) =>
  t.regionalProfile ? `${t.regionalProfile.locale} · ${t.regionalProfile.timezone || 'no timezone'}` : null

export function TenantsPage() {
  const navigate = useNavigate()
  const tenants = useQuery(() => ({ queryKey: ['tenants'], queryFn: api.tenants, reconcile: 'id', staleTime: 15_000, refetchOnWindowFocus: false }))
  const isPlatformLevel = () => authState.isPlatformLevel()
  const isAdmin = () => authState.isAdmin()

  const [search, setSearch] = createSignal('')
  const items = createMemo(() => tenants.data?.items ?? [])
  const visible = createMemo(() => {
    const q = search().trim().toLowerCase()
    if (!q) return items()
    return items().filter(t => t.displayName.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q))
  })
  const open = (slug: string) => navigate({ to: '/tenants/$slug', params: { slug } })
  const areas = useWorkAreas(['overview', 'details'], 'tab', 'overview')

  return <PageShell>
    <DashHeader
      title={isPlatformLevel() ? 'Tenants' : 'Your tenant'}
      subtitle={isPlatformLevel() ? 'Every team on the platform, most urgent first' : 'Your team on the platform'}
      pill={tenants.data
        ? (items().some(t => t.runtimeHealth === 'unknown' || t.runtimeHealth === 'stale')
          ? { tone: 'warn', text: `${items().filter(t => t.runtimeHealth === 'unknown' || t.runtimeHealth === 'stale').length} not reporting` }
          : { tone: 'good', text: `${items().length} reporting` })
        : null}
    />

    <WorkAreas active={areas.active()} onToggle={areas.toggle} areas={[
      { id: 'overview', label: 'Overview' },
      { id: 'details', label: 'Status, runtime and region', count: items().length || null },
    ]} />
    <WorkAreaPanel id="overview" active={areas.active()}>
      <Show when={!tenants.isError && tenants.data}>
        <FleetList rows={items()} canCreate={isAdmin()} />
      </Show>
    </WorkAreaPanel>
    <WorkAreaPanel id="details" active={areas.active()}>
    <Show when={tenants.isError}>
      <ErrorCard title="Couldn't load tenants" error={tenants.error} onRetry={() => void tenants.refetch()} />
    </Show>

    <Show when={!tenants.isError}>
      {/* Search is worth showing once there is something to search. */}
      <Show when={items().length > 1}>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="relative w-full sm:max-w-xs">
            <Search class="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={search()}
              onInput={e => setSearch(e.currentTarget.value)}
              placeholder="Search by name or slug"
              aria-label="Search tenants"
              class="pl-8"
            />
          </div>
          <span class="text-sm text-muted-foreground" aria-live="polite">
            {visible().length === items().length ? `${items().length} tenants` : `${visible().length} of ${items().length} tenants`}
          </span>
        </div>
      </Show>

      <Card>
        <CardContent class="p-0">
          <Show when={tenants.data && items().length === 0}>
            <EmptyState icon={<Building2 />}
              label="No tenants yet"
              hint="Create the first tenant to start managing fan growth operations."
            >
              <Show when={isAdmin()}>
                <Link to="/tenants/new" class={buttonVariants({ size: 'sm', variant: 'outline' })}>
                  <Plus aria-hidden="true" /> New tenant
                </Link>
              </Show>
            </EmptyState>
          </Show>
          <Show when={tenants.data && items().length > 0 && visible().length === 0}>
            <EmptyState icon={<SearchX />} label={`No tenant matches “${search().trim()}”`} hint="Try part of the name or the slug." />
          </Show>
          <Show when={!tenants.data || visible().length > 0}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead class="hidden md:table-cell">Region</TableHead>
                  <TableHead class="hidden lg:table-cell">Last heartbeat</TableHead>
                  <TableHead class="w-8"><span class="sr-only">Open</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <Show when={!tenants.data}>
                  <For each={[0, 1, 2]}>{() => (
                    <TableRow>
                      <TableCell><Skeleton class="h-4 w-36" /></TableCell>
                      <TableCell><Skeleton class="h-5 w-14" /></TableCell>
                      <TableCell><Skeleton class="h-5 w-20" /></TableCell>
                      <TableCell class="hidden md:table-cell"><Skeleton class="h-4 w-40" /></TableCell>
                      <TableCell class="hidden lg:table-cell"><Skeleton class="h-4 w-16" /></TableCell>
                      <TableCell />
                    </TableRow>
                  )}</For>
                </Show>
                <For each={visible()}>{t => (
                  <TableRow data-slot="tenant-row" class="cursor-pointer" onClick={() => open(t.slug)}>
                    <TableCell>
                      <Link
                        to="/tenants/$slug"
                        params={{ slug: t.slug }}
                        class="hover:underline focus-visible:underline focus-visible:outline-none"
                        onClick={e => e.stopPropagation()}
                      >
                        <strong class="font-medium text-foreground">{t.displayName}</strong>
                      </Link>
                      <span class="ml-2 text-xs text-muted-foreground">{t.slug}</span>
                    </TableCell>
                    <TableCell><StatusBadge status={t.status} tone={statusTone(t.status)} /></TableCell>
                    <TableCell><StatusBadge status={healthLabel(t.runtimeHealth)} tone={healthTone(t.runtimeHealth)} /></TableCell>
                    <TableCell class="hidden md:table-cell">
                      <Show when={region(t)} fallback={<span class="text-warning-foreground">No region set</span>}>
                        {r => <span class="text-muted-foreground">{r()}<span class="ml-2 text-xs uppercase">{t.regionalProfile!.dataRegion}</span></span>}
                      </Show>
                    </TableCell>
                    <TableCell class="hidden text-muted-foreground lg:table-cell">
                      {t.runtime?.lastHeartbeatAt ? formatIsoAge(t.runtime.lastHeartbeatAt) : 'never'}
                    </TableCell>
                    <TableCell><ChevronRight class="size-4 text-muted-foreground" aria-hidden="true" /></TableCell>
                  </TableRow>
                )}</For>
              </TableBody>
            </Table>
          </Show>
        </CardContent>
      </Card>
    </Show>
    </WorkAreaPanel>
  </PageShell>
}
