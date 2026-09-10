import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { formatTimestamp } from '../lib/format'
import { EmptyState } from './EmptyState'
import { SkeletonBlock } from './Skeleton'
import { TabBar, TabPanel, useTabPanels, KpiStrip, KpiCard, ErrorCard } from './layout'
import { cn } from '../lib/cn'
import { Card } from './ui/card'
import { Badge } from './ui/badge'

const statusTone = (status: string): 'success' | 'warning' | 'destructive' | 'muted' => {
  switch (status) {
    case 'active': return 'success'
    case 'invited': return 'success'
    case 'paused': return 'warning'
    case 'revoked': return 'destructive'
    default: return 'muted'
  }
}

export function BeaconSignalPanel(props: { slug: string }) {
  const { activeTab, switchTab, isVisited } = useTabPanels('profiles')
  const dashboard = useQuery(() => ({
    queryKey: ['beacon-signal-dashboard', props.slug],
    queryFn: () => api.beaconSignalDashboard(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const candidates = useQuery(() => ({
    queryKey: ['beacon-signal-candidates', props.slug],
    queryFn: () => api.beaconSignalCandidates(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const network = useQuery(() => ({
    queryKey: ['beacon-signal-network', props.slug],
    queryFn: () => api.beaconNetwork(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  return <Card class="p-4">
    <div class="flex items-center justify-between gap-4">
      <h3>Beacon signal network</h3>
      <Show when={dashboard.data}>
        <span class="text-muted-foreground">{dashboard.data!.total} beacons · {dashboard.data!.active} active</span>
      </Show>
    </div>
    <p class="text-sm text-muted-foreground leading-relaxed mt-1">Press and industry relationships. Beacons are the people the agent is talking to — journalists, promoters, superfans. The network shows discovery runs and invite jobs.</p>

    <Show when={dashboard.error}>
      <ErrorCard>Beacon signal dashboard unavailable</ErrorCard>
    </Show>
    <Show when={dashboard.isPending && !dashboard.error}>
      <SkeletonBlock height="60px" radius="10px" />
    </Show>
    <Show when={dashboard.data}>
      <KpiStrip>
        <KpiCard label="Total" value={dashboard.data!.total} />
        <KpiCard label="Active" value={dashboard.data!.active} />
        <KpiCard label="Invited" value={dashboard.data!.invited} />
        <KpiCard label="Paused" value={dashboard.data!.paused} />
        <KpiCard label="Revoked" value={dashboard.data!.revoked} />
      </KpiStrip>

      <TabBar
        active={activeTab()}
        onChange={switchTab}
        tabs={[
          { id: 'profiles', label: 'Profiles', count: () => dashboard.data?.profiles.length ?? 0 },
          { id: 'candidates', label: 'Candidates', count: () => candidates.data?.candidates.length ?? 0 },
          { id: 'discovery', label: 'Discovery' },
        ]}
      />

      {/* ── Profiles tab ── */}
      <TabPanel active={activeTab()} id="profiles" visited={isVisited('profiles')}>
        <Show when={dashboard.data!.profiles.length > 0} fallback={<EmptyState label="No beacon profiles" hint="Beacon profiles define how this tenant discovers and invites fans in physical venues." />}>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>City</th>
                  <th>Status</th>
                  <th>Invites</th>
                  <th>Press</th>
                  <th>Coverage</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                <For each={dashboard.data!.profiles}>{(p) => (
                  <tr>
                    <td><strong>{p.displayName}</strong>{p.contactEmail ? <><br /><span class="text-muted-foreground">{p.contactEmail}</span></> : null}</td>
                    <td>{p.beaconKind}</td>
                    <td>{p.city ?? '—'}</td>
                    <td><Badge variant={statusTone(p.status)}>{p.status}</Badge></td>
                    <td>{p.inviteCount}</td>
                    <td>{p.openPressRequests}</td>
                    <td>{p.coverageCount}</td>
                    <td>{formatTimestamp(p.lastSeenAt)}</td>
                  </tr>
                )}</For>
              </tbody>
            </table>
          </div>
        </Show>
      </TabPanel>

      {/* ── Candidates tab ── */}
      <TabPanel active={activeTab()} id="candidates" visited={isVisited('candidates')}>
        <Show when={candidates.error}>
          <ErrorCard>Candidates unavailable</ErrorCard>
        </Show>
        <Show when={candidates.isPending && !candidates.error}>
          <SkeletonBlock height="120px" radius="10px" />
        </Show>
        <Show when={candidates.data}>
          <Show when={candidates.data!.candidates.length > 0} fallback={<EmptyState label="No candidates" hint="Candidates are discovered beacons that have not been added to the roster yet." />}>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kind</th>
                    <th>City</th>
                    <th>Relevance</th>
                    <th>Relationship</th>
                    <th>Signal</th>
                    <th>Invites</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={candidates.data!.candidates}>{(c) => (
                    <tr>
                      <td><strong>{c.displayName}</strong><br /><span class="text-muted-foreground">{c.contactEmail}</span></td>
                      <td>{c.beaconKind}</td>
                      <td>{c.city ?? '—'}</td>
                      <td>{Math.round(c.relevanceBasisPoints / 100)}%</td>
                      <td>{Math.round(c.relationshipScore / 100)}%</td>
                      <td>{c.signalStatus ?? '—'}</td>
                      <td>{c.inviteCount}</td>
                    </tr>
                  )}</For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </TabPanel>

      {/* ── Discovery tab ── */}
      <TabPanel active={activeTab()} id="discovery" visited={isVisited('discovery')}>
        <Show when={network.error}>
          <ErrorCard>Network discovery unavailable</ErrorCard>
        </Show>
        <Show when={network.isPending && !network.error}>
          <SkeletonBlock height="120px" radius="10px" />
        </Show>
        <Show when={network.data}>
          <Show when={network.data!.discoveryRuns.length > 0} fallback={<EmptyState label="No discovery runs" hint="Discovery runs scan for nearby fans using beacon campaigns. Runs appear here once the intelligence dispatches them." />}>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Country</th>
                    <th>Status</th>
                    <th>Discovered</th>
                    <th>Target</th>
                    <th>Requested</th>
                    <th>Completed</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={network.data!.discoveryRuns}>{(r) => (
                    <tr>
                      <td>{r.countryCode}</td>
                      <td><span class={`badge tone-${r.status === 'completed' ? 'good' : r.status === 'failed' ? 'bad' : 'muted'}`}>{r.status}</span></td>
                      <td>{r.discoveredCount}</td>
                      <td>{r.targetCount}</td>
                      <td>{formatTimestamp(r.requestedAt)}</td>
                      <td>{formatTimestamp(r.completedAt)}</td>
                    </tr>
                  )}</For>
                </tbody>
              </table>
            </div>
          </Show>

          <Show when={network.data!.inviteJobs.length > 0}>
            <h4 class="subsection">Invite Jobs</h4>
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Beacons</th>
                    <th>Radius</th>
                    <th>Exchanged</th>
                    <th>Active</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={network.data!.inviteJobs}>{(j) => (
                    <tr>
                      <td><Badge variant={j.status === 'reported' ? 'success' : 'muted'}>{j.status}</Badge></td>
                      <td>{j.beaconCount}</td>
                      <td>{j.radiusKm}km</td>
                      <td>{j.exchangedCount}</td>
                      <td>{j.activeCount}</td>
                      <td>{formatTimestamp(j.createdAt)}</td>
                    </tr>
                  )}</For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </TabPanel>
    </Show>
  </Card>
}
