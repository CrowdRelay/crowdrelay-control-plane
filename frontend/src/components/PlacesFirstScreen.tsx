import { For, Show } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import type { TenantPlacesCitiesModel, TenantPlacesCitiesSection } from '../lib/types'
import { Act, Card, MoreRow, Note, Row, Split, StatRow, Tile, Tiles } from './ui/dash'
import { Globe, MapPin, Users } from 'lucide-solid'

// Places, first screen (mockup `console-mockups/places-proof.html`, screen 1):
// where are the fans, and where should we play next? All of it from the
// default tab's one read — the funnel, the plan, and two small server-side
// summaries of the room registry and the online places.

const PLATFORM_LABEL: Record<string, string> = { reddit: 'subreddits', discord: 'Discord servers', telegram: 'Telegram groups', forum: 'forums', facebook: 'Facebook groups' }

export function PlacesFirstScreen(props: { slug: string; model: TenantPlacesCitiesModel; onOpenTab: (tab: string) => void }) {
  const funnel = () => [...(props.model.city_funnel ?? [])].sort((a, b) => b.fans - a.fans)
  const plan = () => props.model.gig_plan ?? null
  const rooms = () => props.model.rooms_summary ?? null
  const online = () => props.model.online_summary ?? null
  // A section the tenant could not answer is `null` + named in `degraded`
  // — "not reported", never an empty city list.
  const degraded = (name: TenantPlacesCitiesSection) => props.model.degraded.includes(name)
  const unreported = (what: string) => `Couldn't load ${what} — the console keeps asking and fills it in when the tenant answers.`
  const platforms = () => Object.entries(online()?.by_platform ?? {}).sort((a, b) => b[1] - a[1])
  const shortDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))
  // The planner's audience bar, when its sentence names one ("below about 50").
  const floor = () => {
    for (const entry of plan()?.passed_over ?? []) {
      const match = entry.reason.match(/below about (\d+)/)
      if (match) return Number(match[1])
    }
    return null
  }
  const barMax = () => Math.max(floor() ?? 0, ...funnel().map(row => row.fans), 1)

  return (
    <>
      <Tiles>
        <Tile label="Cities with fans" value={props.model.city_funnel ? funnel().length : null} sub={funnel().length > 0 ? `${funnel()[0]!.city_name} leads · ${funnel()[0]!.fans}` : undefined} />
        <Tile
          label="Ready for a show"
          value={plan()?.proposals.length}
          sub={plan() && plan()!.proposals.length === 0 ? (floor() ? `needs about ${floor()} who asked` : `${plan()!.passed_over.length} of ${plan()!.cities_considered} passed over`) : 'proposed by the plan'}
        />
        <Tile label="Rooms worth a call" value={rooms()?.worth_contact} sub={rooms() ? `of ${rooms()!.total} known` : undefined} />
        <Tile label="Online places" value={online()?.total} sub={platforms()[0] ? `${platforms()[0]![1]} ${PLATFORM_LABEL[platforms()[0]![0]] ?? platforms()[0]![0]}` : undefined} />
      </Tiles>

      <Split mid>
        <Card title="Fans by city" icon={<Users />} aside={floor() ? `toward a show: ${floor()} who asked` : undefined}>
          <Show when={funnel().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{degraded('city_funnel') ? unreported('the city funnel') : 'No fan has said where they live yet.'}</p>}>
            <For each={funnel().slice(0, 3)}>{row => (
              <Row>
                <Link to="/tenants/$slug/cities/$cityId" params={{ slug: props.slug, cityId: row.city_slug }} class="w-28 shrink-0 truncate text-sm text-foreground hover:underline">{row.city_name}</Link>
                <div class="h-2 flex-1 overflow-hidden rounded bg-muted/55">
                  <div class="h-full rounded bg-info-foreground/75" style={{ width: `${Math.max(2, Math.round((row.fans / barMax()) * 100))}%` }} />
                </div>
                <span class="w-24 shrink-0 text-right text-xs text-muted-foreground">{row.fans} {row.fans === 1 ? 'fan' : 'fans'} · +{row.new_30d}</span>
              </Row>
            )}</For>
            <Show when={funnel().length > 3}>
              <MoreRow text={`${funnel().length - 3} more cities`} link={<Act onClick={() => props.onOpenTab('cities')}>All cities</Act>} />
            </Show>
          </Show>
          <Show when={plan() && plan()!.proposals.length === 0 && plan()!.passed_over.length > 0}>
            <Note>
              The gig planner passed over all {plan()!.cities_considered} cities it looked at{floor() ? `: none has ${floor()} people who asked to hear from you` : ''}.
            </Note>
          </Show>
        </Card>

        <Card title="Rooms to call" icon={<MapPin />}>
          <Show when={(rooms()?.by_city ?? []).length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{degraded('rooms_summary') ? unreported('the room registry') : 'No rooms on record yet.'}</p>}>
            <For each={rooms()!.by_city.slice(0, 4)}>{city => (
              <StatRow
                label={<Link to="/tenants/$slug/cities/$cityId" params={{ slug: props.slug, cityId: city.city_slug }} class="hover:underline">{city.city_name}</Link>}
                value={<span class="text-muted-foreground">{city.rooms} {city.rooms === 1 ? 'room' : 'rooms'}</span>}
              />
            )}</For>
            <Show when={rooms()!.last_played}>
              {last => <Note>{last().display_name}: played {last().shows_played === 1 ? 'once' : `${last().shows_played} times`}, last {shortDate(last().last_played_at)}.</Note>}
            </Show>
          </Show>
        </Card>
      </Split>

      <Card title="Online places" icon={<Globe />} class="mb-3">
        <Show when={platforms().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{degraded('online_summary') ? unreported('the online places') : 'No online places known yet.'}</p>}>
          <For each={platforms()}>{([platform, count]) => (
            <StatRow label={PLATFORM_LABEL[platform] ?? platform} value={<span class="tabular-nums text-foreground">{count}</span>} />
          )}</For>
          <Note>Ranked by size today; the list needs a fit to your sound before it tells you where to go.</Note>
        </Show>
      </Card>
    </>
  )
}
