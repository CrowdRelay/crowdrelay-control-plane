import { For, Show } from 'solid-js'
import { Link, useParams } from '@tanstack/solid-router'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { ShowTimelineState, ShowTimelineStep } from '../lib/types'
import { PageShell, PageHeader } from '../components/layout'
import { SectionFailureCard } from '../components/SectionFailureCard'
import { SkeletonSection } from '../components/Skeleton'
import { Badge } from '../components/ui/badge'
import { formatTimestamp } from '../lib/format'

const STATE_VARIANT: Record<ShowTimelineState, { variant: 'success' | 'default' | 'warning' | 'muted' | 'outline'; label: string }> = {
  done: { variant: 'success', label: 'Done' },
  active: { variant: 'default', label: 'In progress' },
  due: { variant: 'warning', label: 'Due now' },
  waiting: { variant: 'muted', label: 'Waiting' },
  skipped: { variant: 'outline', label: 'Skipped' },
}

/** `/tenants/$slug/shows/$eventSlug` — one night, T-21→T+7, top to bottom.
 * One column, time order; every step shows its state, its owner, and the
 * one action available now. A band member should read Friday's state in
 * four seconds — no tabs, no filters, no charts. (UX-2.2) */
export function TenantShowPage() {
  const params = useParams({ from: '/tenants/$slug/shows/$eventSlug' })
  const model = useQuery(() => ({
    queryKey: ['tenant-show-timeline', params().slug, params().eventSlug],
    queryFn: () => api.showTimeline(params().slug, params().eventSlug),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  }))

  return (
    <PageShell>
      <div class="mb-2">
        <Link
          to="/tenants/$slug/shows"
          params={{ slug: params().slug }}
          class="text-xs text-muted-foreground hover:text-foreground"
        >
          ← All shows
        </Link>
      </div>
      <Show when={model.data} fallback={
        <>
          <Show when={model.error}>
            <PageHeader eyebrow="SHOW" title="Show" />
            <SectionFailureCard
              error={model.error}
              fallback="Show timeline unavailable"
              onRetry={() => void model.refetch()}
            />
          </Show>
          <Show when={!model.error}>
            <SkeletonSection titleWidth="200px" lines={2} minHeight="80px" />
            <SkeletonSection titleWidth="120px" lines={9} minHeight="420px" />
          </Show>
        </>
      }>
        {data => (
          <>
            <PageHeader
              eyebrow="SHOW"
              title={data().event.title}
              description={`${formatTimestamp(data().event.starts_at)}${data().event.venue ? ` · ${data().event.venue}` : ''}`}
            />
            <div class="flex flex-col gap-2">
              <For each={data().steps}>{s => <StepRow step={s} slug={params().slug} eventSlug={params().eventSlug} />}</For>
            </div>
          </>
        )}
      </Show>
    </PageShell>
  )
}

function StepRow(props: { step: ShowTimelineStep; slug: string; eventSlug: string }) {
  const state = () => STATE_VARIANT[props.step.state] ?? STATE_VARIANT.waiting
  return (
    <div class="flex items-start gap-3 rounded-lg border border-border bg-surface-1 px-4 py-3">
      <div class="w-11 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
        {props.step.anchor}
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-foreground">{props.step.label}</span>
          <Badge variant={state().variant}>{state().label}</Badge>
        </div>
        <DetailLine step={props.step} />
      </div>
      <div class="shrink-0 text-right">
        <Show when={props.step.owner}>
          <div class="text-xs text-muted-foreground">{props.step.owner}</div>
        </Show>
        <Show when={props.step.action}>
          {action => <StepAction action={action()} slug={props.slug} eventSlug={props.eventSlug} />}
        </Show>
      </div>
    </div>
  )
}

/** Where a step's action actually goes: approvals to the attention queue,
 * the QR to the door view, the T+7 artifact to the report page. Chores
 * with no console surface yet render as a plain chip — a link that goes
 * nowhere is worse than no link. */
function StepAction(props: { action: { kind: string; label: string }; slug: string; eventSlug: string }) {
  const chip = "mt-1 inline-block rounded-md border border-border px-2 py-1 text-xs"
  switch (props.action.kind) {
    case 'qr':
      return (
        <Link to="/tenants/$slug/shows/$eventSlug/scan" params={{ slug: props.slug, eventSlug: props.eventSlug }} class={`${chip} text-foreground hover:bg-surface-2`}>
          {props.action.label}
        </Link>
      )
    case 'report':
      return (
        <Link to="/tenants/$slug/shows/$eventSlug/report" params={{ slug: props.slug, eventSlug: props.eventSlug }} class={`${chip} text-foreground hover:bg-surface-2`}>
          {props.action.label}
        </Link>
      )
    case 'approve':
    case 'review':
      return (
        <Link to="/tenants/$slug/attention" params={{ slug: props.slug }} class={`${chip} text-foreground hover:bg-surface-2`}>
          {props.action.label}
        </Link>
      )
    default:
      return <span class={`${chip} text-muted-foreground`}>{props.action.label}</span>
  }
}

/** One muted line under the step title — the two or three facts a band
 * member scans for. Unknown keys stay unrendered: the API owns the shape,
 * this only picks what is salient per step. */
function DetailLine(props: { step: ShowTimelineStep }) {
  const d = () => props.step.detail
  const text = () => {
    switch (props.step.key) {
      case 'announced': {
        const surfaces = (d().surfaces as Array<{ surface: string; status: string }> | undefined) ?? []
        const live = surfaces.filter(s => s.status === 'published' || s.status === 'verified').length
        if (d().emitted_at) return `Announced ${formatTimestamp(String(d().emitted_at))}${live ? ` · on ${live} surface${live === 1 ? '' : 's'}` : ''}`
        return live ? `On ${live} surface${live === 1 ? '' : 's'}` : 'Not announced yet'
      }
      case 'sales_pace': {
        const sold = d().paid_tickets as number | undefined
        const cap = d().capacity as number | null | undefined
        const read = d().last_read as { reason?: string } | null | undefined
        const base = cap ? `${sold ?? 0}/${cap} sold` : `${sold ?? 0} sold`
        return read?.reason ? `${base} · ${read.reason}` : base
      }
      case 'bands_posting': {
        const open = (d().open as number) ?? 0
        const settled = (d().settled as number) ?? 0
        const skipped = (d().skipped as string[] | undefined) ?? []
        if (!open && !settled) return 'No asks on record yet'
        return `${settled} settled${skipped.length ? ` (${skipped.length} skipped)` : ''} · ${open} open`
      }
      case 'nearby_fans':
        return `${(d().notified as number) ?? 0} fans notified`
      case 'capture_plan':
        return `Plan ${(d().status as string) ?? 'pending'}`
      case 'the_scan':
        return `${(d().checkins as number) ?? 0} scanned${d().campaign_ready ? '' : ' · no QR yet'}`
      case 'recall': {
        const st = d().action_status as string | null | undefined
        if (st === 'succeeded') return `Sent ${d().finished_at ? formatTimestamp(String(d().finished_at)) : ''}`.trim()
        if (st) return `Recap ${st.replace('_', ' ')}`
        return 'No recap queued yet'
      }
      case 'harvest': {
        const pending = (d().pending_requests as number) ?? 0
        const collected = (d().collected_requests as number) ?? 0
        if (collected > 0) return `${collected} artifact${collected === 1 ? '' : 's'} collected${pending ? ` · ${pending} in flight` : ''}`
        if (d().occurred_at) return pending ? `${pending} artifact request${pending === 1 ? '' : 's'} in flight` : 'Source recorded · nothing collected'
        return 'No material collected yet'
      }
      case 'the_numbers': {
        const cost = d().cost as { predicted_total_cost_minor?: number | null; settled_total_cost_minor?: number | null; fee_received_minor?: number | null } | null | undefined
        if (cost?.settled_total_cost_minor != null) return `Cost settled · fee ${cost.fee_received_minor != null ? `${Math.round(cost.fee_received_minor / 100)}` : '—'}`
        if (cost?.predicted_total_cost_minor != null) return 'Cost predicted, not settled yet'
        return 'No report yet'
      }
      default:
        return ''
    }
  }
  return (
    <Show when={text()}>
      <div class="mt-0.5 truncate text-xs text-muted-foreground">{text()}</div>
    </Show>
  )
}
