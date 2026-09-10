import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { formatTimestamp } from '../lib/format'
import { EmptyState } from './ui/empty-state'
import { SkeletonBlock } from './Skeleton'
import { TabBar, TabPanel, useTabPanels, KpiStrip, KpiCard, ErrorCard } from './layout'
import { cn } from '../lib/cn'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'

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
    <p class="text-sm text-muted-foreground leading-relaxed mt-1">Press and industry relationships — the people the agent is talking to, with discovery runs and invite jobs.</p>

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invites</TableHead>
                <TableHead>Press</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={dashboard.data!.profiles}>{(p) => (
                <TableRow>
                  <TableCell><strong>{p.displayName}</strong>{p.contactEmail ? <><br /><span class="text-muted-foreground">{p.contactEmail}</span></> : null}</TableCell>
                  <TableCell>{p.beaconKind}</TableCell>
                  <TableCell>{p.city ?? '—'}</TableCell>
                  <TableCell><Badge variant={statusTone(p.status)}>{p.status}</Badge></TableCell>
                  <TableCell numeric>{p.inviteCount}</TableCell>
                  <TableCell numeric>{p.openPressRequests}</TableCell>
                  <TableCell numeric>{p.coverageCount}</TableCell>
                  <TableCell>{formatTimestamp(p.lastSeenAt)}</TableCell>
                </TableRow>
              )}</For>
            </TableBody>
          </Table>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Relevance</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead>Invites</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={candidates.data!.candidates}>{(c) => (
                  <TableRow>
                    <TableCell><strong>{c.displayName}</strong><br /><span class="text-muted-foreground">{c.contactEmail}</span></TableCell>
                    <TableCell>{c.beaconKind}</TableCell>
                    <TableCell>{c.city ?? '—'}</TableCell>
                    <TableCell numeric>{Math.round(c.relevanceBasisPoints / 100)}%</TableCell>
                    <TableCell numeric>{Math.round(c.relationshipScore / 100)}%</TableCell>
                    <TableCell>{c.signalStatus ?? '—'}</TableCell>
                    <TableCell numeric>{c.inviteCount}</TableCell>
                  </TableRow>
                )}</For>
              </TableBody>
            </Table>
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
          <Show when={network.data!.discoveryRuns.length > 0} fallback={<EmptyState label="No discovery runs" hint="Discovery runs scan for nearby fans using beacon campaigns." />}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Country</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Discovered</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={network.data!.discoveryRuns}>{(r) => (
                  <TableRow>
                    <TableCell>{r.countryCode}</TableCell>
                    <TableCell><Badge variant={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'destructive' : 'muted'}>{r.status}</Badge></TableCell>
                    <TableCell numeric>{r.discoveredCount}</TableCell>
                    <TableCell numeric>{r.targetCount}</TableCell>
                    <TableCell>{formatTimestamp(r.requestedAt)}</TableCell>
                    <TableCell>{formatTimestamp(r.completedAt)}</TableCell>
                  </TableRow>
                )}</For>
              </TableBody>
            </Table>
          </Show>

          <Show when={network.data!.inviteJobs.length > 0}>
            <h4 class="text-sm font-semibold text-secondary-foreground mt-5 mb-2 uppercase tracking-wider flex items-center gap-1.5">Invite Jobs</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Beacons</TableHead>
                  <TableHead>Radius</TableHead>
                  <TableHead>Exchanged</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <For each={network.data!.inviteJobs}>{(j) => (
                  <TableRow>
                    <TableCell><Badge variant={j.status === 'reported' ? 'success' : 'muted'}>{j.status}</Badge></TableCell>
                    <TableCell numeric>{j.beaconCount}</TableCell>
                    <TableCell numeric>{j.radiusKm}km</TableCell>
                    <TableCell numeric>{j.exchangedCount}</TableCell>
                    <TableCell numeric>{j.activeCount}</TableCell>
                    <TableCell>{formatTimestamp(j.createdAt)}</TableCell>
                  </TableRow>
                )}</For>
              </TableBody>
            </Table>
          </Show>
        </Show>
      </TabPanel>
    </Show>
  </Card>
}
