import { For, Show, createSignal } from 'solid-js'
import { api } from '../lib/api'
import type { FanCard, FanDetail, FanJourneyEntry } from '../lib/types'
import { FanDetailDrawer } from './FanDetailDrawer'
import { EmptyState } from './EmptyState'
import { Card } from './ui/card'
import { Badge } from './ui/badge'

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

  return <Card class="p-4">
    <div class="flex items-center justify-between gap-4">
      <h3>Fan list</h3>
      <span class="text-muted-foreground">{filtered().length} fans</span>
    </div>
    <div class="fan-search-bar">
      <input
        type="search"
        placeholder="Search by name, email, or locale…"
        value={search()}
        onInput={(e) => setSearch(e.currentTarget.value)}
        aria-label="Search fans"
      />
    </div>
    <Show when={filtered().length > 0} fallback={<EmptyState label="No fans match this search" hint="Try adjusting your search query or filters." />}>
      <div class="fan-table-wrap">
        <table class="data-table fan-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Activation</th>
              <th>Referrals</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            <For each={filtered().slice(0, 100)}>{(fan) => (
              <tr class="fan-row" onClick={() => openFan(fan)}>
                <td>{fan.display_name ?? '—'}</td>
                <td class="text-muted-foreground">{fan.email}</td>
                <td><Badge variant={fanStatusTone(fan.status)}>{fan.status}</Badge></td>
                <td><span class="text-muted-foreground">{fan.activation_state}</span></td>
                <td>{fan.qualified_referrals}</td>
                <td class="text-muted-foreground">{formatDate(fan.created_at)}</td>
              </tr>
            )}</For>
          </tbody>
        </table>
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
