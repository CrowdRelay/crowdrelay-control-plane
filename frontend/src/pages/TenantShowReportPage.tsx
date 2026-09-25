import { For, Show, type JSX } from 'solid-js'
import { Link, useParams } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { PageShell, PageHeader } from '../components/layout'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonSection } from '../components/Skeleton'
import { Badge } from '../components/app/badge'
import { formatTimestamp } from '../lib/format'
import { ArrowLeft } from 'lucide-solid'

/** The report names its own evidence gaps — a stranger reading "what this
 * cannot claim" gets a sentence, not a snake_case key. Keys are the set
 * `show_growth_execution` emits today; an unknown one falls back to words. */
const GAP_LABEL: Record<string, string> = {
  room_attendance_unverified: 'how many people were actually in the room — check-ins were not verified',
  no_counterparty_on_record: 'the promoter’s own copy — no counterparty is on record for this night',
  no_active_band_recipient: 'a band-side recipient — nobody is active to receive it',
  no_event_campaigns_on_record: 'what the system did — no campaigns are on record for this night',
  streams_not_measured: 'streaming numbers — they are not measured',
}

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

  return (
    <PageShell>
      <div class="mb-2">
        <Link
          to="/tenants/$slug/shows/$eventSlug"
          params={{ slug: params().slug, eventSlug: params().eventSlug }}
          class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft class="size-3.5" aria-hidden="true" /> The night
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
        {data => (
          <>
            <PageHeader
              eyebrow="THE REPORT"
              title={data().event.title ?? 'Post-show report'}
              description={
                data().issued
                  ? `${data().delivery_status === 'delivered' ? 'Sent' : 'Issued'} ${data().issued_at ? formatTimestamp(data().issued_at!) : ''}`.trim()
                  : 'Preview — what the T+7 email will say once issued'
              }
            />
            {/* The artifact reads like the email it is: a letter, not a
                dashboard. One column, sections in the recipient's order. */}
            <div class="mx-auto flex w-full max-w-2xl flex-col gap-4">
              <div class="rounded-lg border border-border bg-background px-4 py-3">
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-foreground">
                      {data().event.title}
                      {data().event.venue ? ` · ${data().event.venue}` : ''}
                      {data().event.city ? `, ${data().event.city}` : ''}
                    </p>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      {data().event.starts_at ? formatTimestamp(data().event.starts_at!) : ''}
                    </p>
                  </div>
                  <Badge variant={data().issued ? 'success' : 'muted'}>
                    {data().issued
                      ? data().delivery_status === 'delivered'
                        ? 'Sent'
                        : 'Issued'
                      : 'Preview'}
                  </Badge>
                </div>
                <div class="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  <p>
                    To: {(data().recipients.band ?? []).map(b => b.name).join(', ') || 'the band'}
                    {data().recipients.counterparty
                      ? ` · ${data().recipients.counterparty!.name ?? data().recipients.counterparty!.email}`
                      : ''}
                  </p>
                  <Show when={(data().event.acts ?? []).length > 0}>
                    <p class="mt-1">
                      The bill: {(data().event.acts ?? []).map(a => a.name).join(' · ')}
                    </p>
                  </Show>
                </div>
              </div>

              <ReportSection
                title="In the room"
                note={data().honesty_contract.observed}
              >
                <Metric label="Checked in" value={data().report.observed?.room_checkins_total} />
                <Metric label="… by session" value={data().report.observed?.room_checkins_by_session} />
                <Metric label="… by email claim" value={data().report.observed?.room_checkins_by_email_claim} />
                <Metric label="New fans at the show" value={data().report.observed?.new_fan_records_at_show} />
                <Metric label="Passes redeemed" value={data().report.observed?.admission_passes_redeemed} />
              </ReportSection>

              <ReportSection
                title="Around the room"
                note={data().honesty_contract.inferred}
              >
                <Metric label="Paid ticket buyers" value={data().report.inferred?.paid_ticket_buyers} />
                <Metric label="Interested fans" value={data().report.inferred?.interested_fans} />
                <Metric label="Ticket-link clicks" value={data().report.inferred?.ticket_link_clicks} />
                <Show when={(data().report.inferred?.ticket_link_clicks_by_act ?? []).length > 0}>
                  <For each={data().report.inferred?.ticket_link_clicks_by_act ?? []}>
                    {act => <Metric label={`… ${act.act_slug ?? 'unattributed'}`} value={act.clicks} />}
                  </For>
                </Show>
              </ReportSection>

              <Show when={(data().report.campaigns ?? []).length > 0}>
                <ReportSection title="What the system did">
                  <For each={data().report.campaigns ?? []}>
                    {campaign => (
                      <div class="flex items-baseline justify-between gap-3 py-1 text-xs">
                        <span class="min-w-0 truncate text-foreground">{campaign.template_key}</span>
                        <span class="shrink-0 tabular-nums text-muted-foreground">
                          {campaign.status}
                          {campaign.delivered != null ? ` · ${campaign.delivered} delivered` : ''}
                        </span>
                      </div>
                    )}
                  </For>
                </ReportSection>
              </Show>

              <Show when={(data().report.evidence_gaps ?? []).length > 0}>
                <div class="rounded-lg border border-warning-foreground/40 bg-warning-foreground px-4 py-3">
                  <p class="text-xs font-medium text-foreground">What this cannot claim</p>
                  <ul class="mt-1 list-inside list-disc text-xs text-muted-foreground">
                    <For each={data().report.evidence_gaps ?? []}>
                      {gap => <li>{gapLabel(gap)}</li>}
                    </For>
                  </ul>
                </div>
              </Show>

              <p class="px-1 text-[11px] leading-relaxed text-muted-foreground">
                Every number above can be repeated without trusting us — observed is room
                evidence, inferred is reach, and the gaps are named rather than zeroed.
              </p>
            </div>
          </>
        )}
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
