import { For, Show, type JSX } from 'solid-js'
import { Link, useParams } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { PageShell, PageHeader, KpiStrip, KpiCard } from '../components/layout'
import { OutcomeRow, RowTag, StatusPill, WorkRow, type ViewTone } from '../components/ViewBlocks'
import { count } from '../lib/organise'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonSection } from '../components/Skeleton'
import { ArrowLeft } from 'lucide-solid'

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
      <div class="mb-2">
        <Link
          to="/tenants/$slug/shows/$eventSlug"
          params={{ slug: params().slug, eventSlug: params().eventSlug }}
          class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft class="size-3.5" aria-hidden="true" /> {backLabel()}
        </Link>
      </div>
      <Show when={model.data} fallback={
        <>
          <Show when={model.error}>
            <PageHeader eyebrow="THE REPORT" title="The report" />
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
              <PageHeader
                eyebrow="AFTER THE SHOW"
                title={event().title ?? 'After the show'}
                description={[venue(), event().city, (event().acts ?? []).length > 0 ? `with ${(event().acts ?? []).map(a => a.name).join(', ')}` : null].filter(Boolean).join(' · ') || undefined}
                actions={<StatusPill tone={state().tone}>{state().text}</StatusPill>}
              />
              <div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
                <KpiStrip class="mb-0">
                  <KpiCard label="Paid tickets" value={count(report().inferred?.paid_ticket_buyers)} sub="via tracked links" />
                  <KpiCard label="Link clicks" value={count(report().inferred?.ticket_link_clicks)} sub={`${count(report().inferred?.interested_fans)} fans interested`} />
                  <KpiCard
                    label="In the room"
                    value={roomMeasured() ? count(report().observed?.room_checkins_total) : '—'}
                    sub={roomMeasured() ? 'checked in at the door' : 'no door QR that night'}
                  />
                </KpiStrip>

                <ReportSection title="In the room" note={data().honesty_contract.observed}>
                  <Show when={roomMeasured()} fallback={
                    <OutcomeRow label="Check-ins, passes, new fans at the door" result="not measured" />
                  }>
                    <Metric label="Checked in" value={report().observed?.room_checkins_total} />
                    <Metric label="… by session" value={report().observed?.room_checkins_by_session} />
                    <Metric label="… by email claim" value={report().observed?.room_checkins_by_email_claim} />
                    <Metric label="New fans at the show" value={report().observed?.new_fan_records_at_show} />
                    <Metric label="Passes redeemed" value={report().observed?.admission_passes_redeemed} />
                  </Show>
                </ReportSection>

                <ReportSection title="Around the room" note={data().honesty_contract.inferred}>
                  <Metric label="Paid ticket buyers" value={report().inferred?.paid_ticket_buyers} />
                  <Metric label="Interested fans" value={report().inferred?.interested_fans} />
                  <Metric label="Ticket-link clicks" value={report().inferred?.ticket_link_clicks} />
                  <Show when={(report().inferred?.ticket_link_clicks_by_act ?? []).length > 1}>
                    <For each={report().inferred?.ticket_link_clicks_by_act ?? []}>
                      {act => <Metric label={`… ${act.act_slug ?? 'unattributed'}`} value={act.clicks} />}
                    </For>
                  </Show>
                </ReportSection>

                <Show when={(report().campaigns ?? []).length > 0}>
                  <ReportSection title="What the system did">
                    <For each={report().campaigns ?? []}>
                      {campaign => (
                        <OutcomeRow
                          label={CAMPAIGN_LABEL[campaign.template_key] ?? campaign.template_key}
                          result={campaignResult(campaign).text}
                          tone={campaignResult(campaign).tone}
                        />
                      )}
                    </For>
                  </ReportSection>
                </Show>

                <Show when={(report().evidence_gaps ?? []).length > 0}>
                  <div class="rounded-lg border border-warning-foreground/40 px-4 py-3">
                    <p class="text-sm font-medium text-foreground">What this can’t claim</p>
                    <ul class="mt-1 list-inside list-disc text-xs text-muted-foreground">
                      <For each={report().evidence_gaps ?? []}>
                        {gap => <li>{gapLabel(gap)}</li>}
                      </For>
                    </ul>
                  </div>
                </Show>

                <Show when={data().next_show}>
                  {next => (
                    <WorkRow
                      tag={<RowTag tone="good">next time</RowTag>}
                      title={`Next night: ${[next().city ?? next().title, shortDate(next().starts_at)].join(' · ')}`}
                      why="Put its door QR up so the room gets counted this time"
                      action="Open door"
                      to="/tenants/$slug/shows/$eventSlug/scan"
                      params={{ slug: params().slug, eventSlug: next().slug }}
                    />
                  )}
                </Show>

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

function ReportSection(props: { title: string; note?: string; children: JSX.Element }) {
  return (
    <div class="rounded-lg border border-border bg-background px-4 py-3">
      <p class="text-sm font-medium text-foreground">{props.title}</p>
      <Show when={props.note}>
        <p class="mt-0.5 text-[11px] text-muted-foreground">{props.note}</p>
      </Show>
      <div class="mt-2">{props.children}</div>
    </div>
  )
}

function Metric(props: { label: string; value: number | null | undefined }) {
  return (
    <div class="flex items-baseline justify-between gap-3 py-1">
      <span class="text-xs text-muted-foreground">{props.label}</span>
      <span class="tabular-nums text-sm font-medium text-foreground">
        {props.value ?? '—'}
      </span>
    </div>
  )
}
