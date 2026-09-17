import { Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useIsFetching, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { RefreshCw } from 'lucide-solid'
import { relativeTime } from '../lib/format'
import { cn } from '../lib/cn'
import { BeaconConsolePanel } from '../components/BeaconConsolePanel'
import { BeaconSignalPanel } from '../components/BeaconSignalPanel'
import { TabBar, TabPanel, useTabPanels, PageShell, PageHeader } from '../components/layout'
import { Button } from '../components/app/button'

const TABS = ['roster', 'signal'] as const

/// Beacons are an audience surface, not an operations one: a beacon is a
/// person in a city who carries a release to an audience the band does not
/// own. The roster is the list and every action on it; Signal is the same
/// population seen as a funnel. Two tabs so the operator works the roster
/// without scrolling past the funnel, and reads the funnel without scrolling
/// past the roster.
export function BeaconsPage() {
  const params = useParams({ from: '/tenants/$slug/beacons' })
  // The id list makes `?tab=` deep links land on the right tab.
  const { activeTab, switchTab, prefetch, isVisited } = useTabPanels('roster', [...TABS])

  // The panels own their queries. The page's refresh reaches all of them by
  // prefix, and "Updated" reads the newest of whatever has loaded.
  const qc = useQueryClient()
  const isBeaconQuery = (key: readonly unknown[]) => typeof key[0] === 'string' && key[0].startsWith('beacon-') && key[1] === params().slug
  const fetching = useIsFetching(() => ({ predicate: q => isBeaconQuery(q.queryKey) }))
  const refresh = () => void qc.invalidateQueries({ predicate: q => isBeaconQuery(q.queryKey) })

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now(); fetching()
    const ts = Math.max(0, ...qc.getQueryCache().findAll({ predicate: q => isBeaconQuery(q.queryKey) }).map(q => q.state.dataUpdatedAt))
    return ts === 0 ? null : relativeTime(ts)
  })

  return <PageShell>
    <PageHeader
      title="Beacons"
      description="People who carry a release or a show into a city the band has no audience in. Invite them to Signal, record what they say, pause the ones who go quiet."
      actions={
        <>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={refresh} disabled={fetching() > 0} aria-label="Refresh">
            <RefreshCw class={cn(fetching() > 0 && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />
    <TabBar
      active={activeTab()}
      onChange={switchTab}
      onPrefetch={prefetch}
      tabs={[
        { id: 'roster', label: 'Roster' },
        { id: 'signal', label: 'Signal' },
      ]}
    />
    <TabPanel active={activeTab()} id="roster" visited={isVisited('roster')}>
      <BeaconConsolePanel slug={params().slug} />
    </TabPanel>
    <TabPanel active={activeTab()} id="signal" visited={isVisited('signal')}>
      <BeaconSignalPanel slug={params().slug} />
    </TabPanel>
  </PageShell>
}
