import { For, Show, createSignal } from 'solid-js'
import { api } from '../lib/api'
import type { FanCard, FanDetail, FanJourneyEntry } from '../lib/types'
import { FanDetailDrawer } from './FanDetailDrawer'
import { EmptyState } from './EmptyState'

const fanStatusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'active' ? 'good' :
  status === 'pending' ? 'warn' :
  status === 'unsubscribed' || status === 'suppressed' ? 'muted' :
  status === 'bounced' || status === 'invalid' ? 'bad' : 'muted'

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

  return <div class="agent-section">
    <div class="agent-section-head">
      <h3>Fan List</h3>
      <span class="muted">{filtered().length} fans</span>
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
                <td class="muted">{fan.email}</td>
                <td><span class={`badge tone-${fanStatusTone(fan.status)}`}>{fan.status}</span></td>
                <td><span class="muted">{fan.activation_state}</span></td>
                <td>{fan.qualified_referrals}</td>
                <td class="muted">{formatDate(fan.created_at)}</td>
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
  </div>
}
