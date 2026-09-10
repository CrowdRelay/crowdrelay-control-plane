import { For, Show, createSignal } from 'solid-js'
import { api } from '../lib/api'
import type { FanCard, FanDetail, FanJourneyEntry } from '../lib/types'
import { FanDetailDrawer } from './FanDetailDrawer'
import { EmptyState } from './ui/empty-state'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'

const fanStatusTone = (status: string): 'success' | 'warning' | 'destructive' | 'muted' =>
  status === 'active' ? 'success' :
  status === 'pending' ? 'warning' :
  status === 'unsubscribed' || status === 'suppressed' ? 'muted' :
  status === 'bounced' || status === 'invalid' ? 'destructive' : 'muted'

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export function FanTablePanel(props: {
  slug: string
  fans: FanCard[]
}) {
  const [search, setSearch] = createSignal('')
  const [selectedFan, setSelectedFan] = createSignal<FanDetail | null>(null)
  const [journey, setJourney] = createSignal<FanJourneyEntry[]>([])
  const [loadingDetail, setLoadingDetail] = createSignal(false)
  const [detailError, setDetailError] = createSignal<string | null>(null)

  const filtered = () => {
    const q = search().trim().toLowerCase()
    if (!q) return props.fans
    return props.fans.filter(f => {
      const name = (f.display_name ?? '').toLowerCase()
      const email = (f.email ?? '').toLowerCase()
      const locale = (f.locale ?? '').toLowerCase()
      return name.includes(q) || email.includes(q) || locale.includes(q)
    })
  }

  const openFan = async (fan: FanCard) => {
    setSelectedFan(null)
    setJourney([])
    setDetailError(null)
    setLoadingDetail(true)
    try {
      const [detail, journeyData] = await Promise.all([
        api.fanDetail(props.slug, fan.id),
        api.fanJourney(props.slug, fan.id),
      ])
      setSelectedFan(detail)
      setJourney(journeyData)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load fan detail')
    } finally {
      setLoadingDetail(false)
    }
  }

  return <Card flat class="p-4">
    <div class="flex items-center justify-between gap-4">
      <h3>Fan list</h3>
      <span class="text-muted-foreground">{filtered().length} fans</span>
    </div>
    <div class="mb-3">
      <Input
        type="search"
        placeholder="Search by name, email, or locale…"
        value={search()}
        onInput={(e) => setSearch(e.currentTarget.value)}
        aria-label="Search fans"
      />
    </div>
    {/* An empty search box matching nothing is not a search result, it is an
        empty fanbase — and telling the operator to adjust a query they never
        typed sends them to fix the wrong thing. */}
    <Show when={filtered().length > 0} fallback={
      <Show
        when={search().trim()}
        fallback={<EmptyState label="No fans yet" hint="Fans appear here once a connected source completes its first ingestion." />}
      >
        <EmptyState label={`Nothing matches “${search().trim()}”`} hint="Search covers name, email and locale." />
      </Show>
    }>
      <div class="overflow-auto border border-border rounded-md max-h-[600px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Activation</TableHead>
              <TableHead>Referrals</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <For each={filtered().slice(0, 100)}>{(fan) => (
              <TableRow class="cursor-pointer" onClick={() => openFan(fan)}>
                <TableCell>{fan.display_name ?? '—'}</TableCell>
                <TableCell class="text-muted-foreground">{fan.email}</TableCell>
                <TableCell><Badge variant={fanStatusTone(fan.status)}>{fan.status}</Badge></TableCell>
                <TableCell><span class="text-muted-foreground">{fan.activation_state}</span></TableCell>
                <TableCell numeric>{fan.qualified_referrals}</TableCell>
                <TableCell class="text-muted-foreground">{formatDate(fan.created_at)}</TableCell>
              </TableRow>
            )}</For>
          </TableBody>
        </Table>
      </div>
    </Show>
    <FanDetailDrawer
      fan={selectedFan()}
      journey={journey()}
      loading={loadingDetail()}
      error={detailError()}
      onClose={() => setSelectedFan(null)}
    />
  </Card>
}
