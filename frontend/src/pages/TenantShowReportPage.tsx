import { For, Show } from 'solid-js'
import { useParams } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { PageShell } from '../components/layout'
import { Act, Card, DashHeader, ItemRow, Pill, StatRow, Tile, Tiles, type Tone as ViewTone } from '../components/ui/dash'
import { AlertTriangle, DoorOpen, Radio } from 'lucide-solid'
import { count } from '../lib/organise'
import { humanizeToken } from '../lib/format'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonSection } from '../components/Skeleton'

/** The report names its own evidence gaps — a stranger reading "what this
 * cannot claim" gets a sentence, not a snake_case key. Keys are the set
 * `show_growth_execution` emits today; an unknown one falls back to words. */
const GAP_LABEL: Record<string, string> = {
  room_attendance_unverified: 'how many people were in the room — nobody scanned at the door',
  no_counterparty_on_record: 'who the promoter was — no one is on record for this night',
  no_active_band_recipient: 'a band-side recipient — nobody is active to receive it',
  no_event_campaigns_on_record: 'what the system did — no campaigns are on record for this night',
  streams_not_measured: 'streaming numbers — they are not measured',
}

/** Campaign templates in the band's words; an unknown key shows as-is. */
const CAMPAIGN_LABEL: Record<string, string> = {
  'event.announcement.v1': 'Announcement to fans',
  'event.interest_reminder.v1': 'Reminder to interested fans',
  'event.last_call.v1': 'Last call',
  'event.day_of.v1': 'Day-of message',
  'event.thank_you.v1': 'Thank-you after the night',
  'event.press.v1': 'Press note',
  'event.organiser.v1': 'Gig request to the organiser',
}

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))

const gapLabel = (key: string) => GAP_LABEL[key] ?? key.replaceAll('_', ' ')

/** `/tenants/$slug/shows/$eventSlug/report` — the T+7 artifact. What the
 * promoter and the band receive by email: the night's numbers split by
 * evidence class, the campaigns with their receipts, the gaps named out
 * loud. Once issued, this IS the mailed payload — not a re-derivation.
 * (UX-2.4) */
export function TenantShowReportPage() {
  const params = useParams({ from: '/tenants/$slug/shows/$eventSlug/report' })
  const model = useQuery(() => ({
    queryKey: ['tenant-show-report', params().slug, params().eventSlug],
    queryFn: () => api.showReport(params().slug, params().eventSlug),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  }))

  const backLabel = () => {
    const event = model.data?.event
    const starts = typeof event?.starts_at === 'string' ? event.starts_at : null
    return [event?.city, starts ? shortDate(starts) : null].filter(Boolean).join(' · ') || 'The night'
  }
  return (
    <PageShell>
      <Show when={model.data} fallback={
        <>
          <Show when={model.error}>
            <DashHeader title="After the show" back={{ label: backLabel(), to: '/tenants/$slug/shows/$eventSlug', params: { slug: params().slug, eventSlug: params().eventSlug } }} />
            <SectionFailureCard
              error={model.error}
              fallback="Report unavailable"
              onRetry={() => void model.refetch()}
            />
          </Show>
          <Show when={!model.error}>
            <SkeletonSection titleWidth="180px" lines={1} minHeight="60px" />
            <SkeletonSection titleWidth="0" lines={6} minHeight="300px" />
          </Show>
        </>
      }>
        {data => {
          const event = () => data().event
          const report = () => data().report
          // The issued artifact has carried the title in its venue column;
          // a venue equal to the title is no venue.
          const venue = () => (event().venue && event().venue !== event().title ? event().venue : null)
          const startsAt = () => (typeof event().starts_at === 'string' ? (event().starts_at as string) : null)
          // A room nobody scanned is unmeasured, not empty: the report names
          // the gap, and the page must not print its zeros as a count.
          const roomMeasured = () => !(report().evidence_gaps ?? []).includes('room_attendance_unverified')
          const state = (): { tone: ViewTone; text: string } => {
            if (!data().issued) return { tone: 'muted', text: 'Preview — sends 7 days after the night' }
            const when = data().issued_at ? shortDate(data().issued_at!) : ''
            return data().delivery_status === 'delivered'
              ? { tone: 'good', text: `Sent ${when}`.trim() }
              : { tone: 'warn', text: `Issued ${when} · not delivered yet`.trim() }
          }
          const nightStarted = () => startsAt() != null && new Date(startsAt()!).getTime() < Date.now()
          const campaignResult = (campaign: { status: string; delivered: number | null }): { text: string; tone: ViewTone } => {
            if (campaign.status === 'scheduled' && nightStarted()) return { text: 'never sent · still scheduled', tone: 'bad' }
            if (campaign.status === 'completed') {
              return campaign.delivered == null
                ? { text: 'sent', tone: 'good' }
                : { text: `sent · ${campaign.delivered} delivered`, tone: campaign.delivered > 0 ? 'good' : 'warn' }
            }
            return { text: campaign.status.replaceAll('_', ' '), tone: 'muted' }
          }
          return (
            <>
              <DashHeader
                title="After the show"
                subtitle={[event().title, venue(), event().city, (event().acts ?? []).length > 0 ? `with ${(event().acts ?? []).map(a => a.name).join(', ')}` : null].filter(Boolean).join(' · ') || undefined}
                pill={state()}
                back={{ label: backLabel(), to: '/tenants/$slug/shows/$eventSlug', params: { slug: params().slug, eventSlug: params().eventSlug } }}
              />
              <div class="flex w-full max-w-3xl flex-col">
                <Tiles cols={3}>
                  <Tile label="Paid tickets" value={report().inferred?.paid_ticket_buyers} sub="via tracked links" />
                  <Tile label="Link clicks" value={report().inferred?.ticket_link_clicks} sub={`${count(report().inferred?.interested_fans)} fans interested`} />
                  <Tile
                    label="In the room"
                    value={roomMeasured() ? report().observed?.room_checkins_total : null}
                    sub={roomMeasured() ? 'checked in at the door' : 'no door QR that night'}
                  />
                </Tiles>

                <Card title="In the room" icon={<DoorOpen />} aside="proven by scans and passes" class="mb-2.5">
                  <Show when={roomMeasured()} fallback={
                    <StatRow label="Check-ins, passes, new fans at the door" value={<Pill>not measured</Pill>} />
                  }>
                    <StatRow label="Checked in" value={<span class="tabular-nums text-foreground">{count(report().observed?.room_checkins_total)}</span>} />
                    <StatRow label="… by session" value={<span class="tabular-nums text-foreground">{count(report().observed?.room_checkins_by_session)}</span>} />
                    <StatRow label="… by email claim" value={<span class="tabular-nums text-foreground">{count(report().observed?.room_checkins_by_email_claim)}</span>} />
                    <StatRow label="New fans at the show" value={<span class="tabular-nums text-foreground">{count(report().observed?.new_fan_records_at_show)}</span>} />
                    <StatRow label="Passes redeemed" value={<span class="tabular-nums text-foreground">{count(report().observed?.admission_passes_redeemed)}</span>} />
                  </Show>
                </Card>

                <Show when={(report().campaigns ?? []).length > 0}>
                  <Card title="What the system did" icon={<Radio />} class="mb-2.5">
                    <For each={report().campaigns ?? []}>
                      {campaign => (
                        <StatRow
                          label={CAMPAIGN_LABEL[campaign.template_key] ?? humanizeToken(campaign.template_key)}
                          value={<Pill tone={campaignResult(campaign).tone}>{campaignResult(campaign).text}</Pill>}
                        />
                      )}
                    </For>
                  </Card>
                </Show>

                <Show when={(report().evidence_gaps ?? []).length > 0}>
                  <Card title="What this can’t claim" icon={<AlertTriangle />} tone="warn" class="mb-2.5">
                    <p class="m-0 text-xs text-muted-foreground">{(report().evidence_gaps ?? []).map(gapLabel).join(' · ')}</p>
                  </Card>
                </Show>

                <Show when={data().next_show}>
                  {next => (
                    <ItemRow
                      pill={{ tone: 'accent', text: 'next time' }}
                      title={`Next night: ${[next().city ?? next().title, shortDate(next().starts_at)].join(' · ')}`}
                      sub="Put its door QR up so the room gets counted this time"
                      action={<Act to="/tenants/$slug/shows/$eventSlug/scan" params={{ slug: params().slug, eventSlug: next().slug }}>Open door</Act>}
                    />
                  )}
                </Show>

                <Card title="Around the room" aside={data().honesty_contract.inferred} class="my-2.5">
                  <StatRow label="Paid ticket buyers" value={<span class="tabular-nums text-foreground">{count(report().inferred?.paid_ticket_buyers)}</span>} />
                  <StatRow label="Interested fans" value={<span class="tabular-nums text-foreground">{count(report().inferred?.interested_fans)}</span>} />
                  <StatRow label="Ticket-link clicks" value={<span class="tabular-nums text-foreground">{count(report().inferred?.ticket_link_clicks)}</span>} />
                  <Show when={(report().inferred?.ticket_link_clicks_by_act ?? []).length > 1}>
                    <For each={report().inferred?.ticket_link_clicks_by_act ?? []}>
                      {act => <StatRow label={`… ${act.act_slug ?? 'unattributed'}`} value={<span class="tabular-nums text-foreground">{act.clicks}</span>} />}
                    </For>
                  </Show>
                </Card>

                <div class="rounded-lg border border-border px-4 py-3 text-xs text-muted-foreground">
                  <p>
                    To: {(data().recipients.band ?? []).map(b => b.name).join(', ') || 'the band'}
                    {data().recipients.counterparty
                      ? ` · ${data().recipients.counterparty!.name ?? data().recipients.counterparty!.email}`
                      : ''}
                  </p>
                  <p class="mt-1">
                    Every number above can be repeated without trusting us — observed is room
                    evidence, inferred is reach, and the gaps are named rather than zeroed.
                  </p>
                </div>
              </div>
            </>
          )
        }}
      </Show>
    </PageShell>
  )
}
