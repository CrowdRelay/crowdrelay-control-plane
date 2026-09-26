import { For, Show, createMemo, createSignal } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import type { OpportunityBoardEntry, TenantTodayReadModel } from '../lib/types'
import { formatIsoAge, formatIsoUntil } from '../lib/format'
import { DECISION_KIND_LABELS, APPROVE_EFFECT, labelOr, opportunityTitle } from '../lib/opportunity-labels'
import { KpiCard, KpiStrip, Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { ApproveAllButton } from './ApproveAllButton'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { WorkList, WorkRow } from './work'
import { cn } from '../lib/cn'

// Needs you, first screen (approved mockup `console-mockups/needs-you.html`):
// what waits for your yes, and what happens if you say nothing. Everything
// here comes from the one `today` read the page already holds — the batches
// the read model groups, the ranked board's briefings, the replies whose last
// word is theirs, and the lapsed-approval counts. Nothing is fetched for it.

/** A batch as the page shows it: one row per wave, the board entries behind
 *  it (for the briefing and the words), and the soonest expiry. */
type Batch = {
  key: string
  count: number
  actionIds: string[]
  actionKind: string
  expiresAt: string | null
  entry: OpportunityBoardEntry | null
}

const shortWhen = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export function NeedsYouOverview(props: {
  slug: string
  model: TenantTodayReadModel
  onOpenDecisions: () => void
  refresh: () => void
}) {
  const board = () => props.model.opportunities ?? []
  const byAction = createMemo(() => {
    const out = new Map<string, OpportunityBoardEntry>()
    for (const entry of board()) if (entry.action_id) out.set(entry.action_id, entry)
    return out
  })
  const revisable = createMemo(() => {
    const out = new Map<string, Record<string, string>>()
    for (const action of props.model.autopilot?.needs_you ?? []) {
      if (action.revisable && Object.keys(action.revisable).length > 0) out.set(action.id, action.revisable)
    }
    return out
  })

  // Batches first, soonest expiry first: a wave that rots Monday outranks a
  // single ask that rots Thursday.
  const batches = createMemo((): Batch[] =>
    (props.model.derived?.approval_batches ?? [])
      .map(batch => ({
        key: batch.key,
        count: batch.count,
        actionIds: batch.action_ids,
        actionKind: batch.action_kind,
        expiresAt: batch.earliest_expires_at,
        entry: batch.action_ids.map(id => byAction().get(id)).find(Boolean) ?? null,
      }))
      .sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999')))

  const waiting = () => batches().reduce((sum, b) => sum + b.count, 0)
  const waves = () => batches().filter(b => b.count > 1).length
  const singles = () => batches().filter(b => b.count === 1).length
  const soonest = () => batches().find(b => b.expiresAt)?.expiresAt ?? null
  const lapsed = () => props.model.attention?.lapsed_approvals ?? null
  const replies = () => props.model.reply_triage?.waiting_on_you ?? []
  const saidYes = () => replies().filter(r => r.disposition === 'positive').length
  const batchesWithheld = () => props.model.derived?.approval_batches == null

  const [selectedKey, setSelectedKey] = createSignal<string | null>(null)
  const selected = () => batches().find(b => b.key === selectedKey()) ?? batches()[0] ?? null

  const batchTitle = (batch: Batch) => {
    const title = batch.entry ? opportunityTitle(batch.entry) : labelOr(DECISION_KIND_LABELS, batch.actionKind)
    return batch.count > 1 ? `${batch.count} × ${title}` : title
  }

  // A briefing names a show by the first eight characters of its id; the
  // show list in the same read knows its title.
  const showTitle = (value: string) =>
    props.model.shows?.events.find(show => show.id.startsWith(value))?.title ?? value

  return (
    <>
      <KpiStrip>
        <KpiCard
          label="Waiting for your yes"
          value={batchesWithheld() ? '—' : waiting()}
          sub={batchesWithheld() ? 'could not be read' : waiting() === 0 ? 'nothing to decide' : `${waves()} ${waves() === 1 ? 'wave' : 'waves'} · ${singles()} single`}
          tone={batchesWithheld() ? 'default' : waiting() > 0 ? 'warn' : 'good'}
        />
        <KpiCard
          label="Expire in 24 h"
          value={lapsed() ? lapsed()!.expiring_within_24h : '—'}
          sub={soonest() ? `next: ${shortWhen(soonest()!)}` : 'none pending'}
          tone={(lapsed()?.expiring_within_24h ?? 0) > 0 ? 'warn' : undefined}
        />
        <KpiCard
          label="Your turn to reply"
          value={props.model.reply_triage ? replies().length : '—'}
          sub={saidYes() > 0 ? `${saidYes()} said yes` : 'people who wrote back'}
        />
        <KpiCard
          label="Lost this week"
          value={lapsed() ? lapsed()!.total : '—'}
          sub="expired with no answer"
          tone={(lapsed()?.total ?? 0) > 0 ? 'bad' : undefined}
        />
      </KpiStrip>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Section
          title="Waiting for your yes"
          icon={<SectionIcon name="inbox" />}
          description="One row per wave. If nobody answers, an ask expires and the machine moves on."
        >
          <Show when={batches().length > 0} fallback={
            <p class="text-sm text-muted-foreground">Nothing waits for your yes. The next thing that needs a say lands here.</p>
          }>
            <WorkList>
              <For each={batches()}>{batch => (
                <WorkRow
                  class={cn('cursor-pointer transition-colors hover:border-foreground/30', selected()?.key === batch.key && 'border-primary/60 bg-primary/5')}
                  badge={<Badge variant={batch.count > 1 ? 'warning' : 'muted'}>{batch.count > 1 ? 'wave' : 'single'}</Badge>}
                  title={batchTitle(batch)}
                  why={[batch.entry?.reason, batch.expiresAt ? `expires ${formatIsoUntil(batch.expiresAt)}` : null].filter(Boolean).join(' · ')}
                  action={
                    <Button size="sm" variant={selected()?.key === batch.key ? 'default' : 'outline'} onClick={() => setSelectedKey(batch.key)}>
                      Review
                    </Button>
                  }
                />
              )}</For>
            </WorkList>
          </Show>
        </Section>

        <Section title={selected() ? batchTitle(selected()!) : 'The ask'} icon={<SectionIcon name="mail" />}>
          <Show when={selected()} fallback={<p class="text-sm text-muted-foreground">Pick a row to read what it would do.</p>}>
            {batch => {
              const entry = () => batch().entry
              const draft = () => batch().actionIds.map(id => revisable().get(id)).find(Boolean) ?? null
              return (
                <div class="flex flex-col gap-3">
                  <Show when={entry()?.briefing?.why_it_matters}>
                    <p class="text-sm leading-relaxed text-foreground">{entry()!.briefing!.why_it_matters}</p>
                  </Show>
                  <Show when={draft()}>
                    {fields => (
                      <div class="rounded-md border border-border bg-background p-3">
                        <For each={Object.entries(fields())}>{([key, text]) => (
                          <div class="mb-2 last:mb-0">
                            <p class="text-xs uppercase tracking-wide text-muted-foreground">{key.replaceAll('_', ' ')}</p>
                            <p class="whitespace-pre-line text-sm text-foreground">{text}</p>
                          </div>
                        )}</For>
                        <Show when={batch().count > 1}>
                          <p class="mt-2 text-xs text-muted-foreground">1 of {batch().count} — the rest follow the same template.</p>
                        </Show>
                      </div>
                    )}
                  </Show>
                  <Show when={(entry()?.briefing?.content ?? []).length > 0}>
                    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                      <For each={entry()!.briefing!.content}>{field => (
                        <>
                          <dt class="text-muted-foreground">{field.label}</dt>
                          <dd class="text-foreground">{field.label === 'Event' ? showTitle(field.value) : field.value}</dd>
                        </>
                      )}</For>
                    </dl>
                  </Show>
                  <Show when={APPROVE_EFFECT[batch().actionKind]}>
                    <p class="text-xs text-muted-foreground">Approving: {APPROVE_EFFECT[batch().actionKind]}</p>
                  </Show>
                  <Show when={entry()?.consequence}>
                    <p class="text-xs text-muted-foreground">If nobody answers: {entry()!.consequence}.</p>
                  </Show>
                  <div class="flex flex-wrap items-center gap-2">
                    <ApproveAllButton slug={props.slug} actionIds={batch().actionIds} onDone={props.refresh} />
                    <Button size="sm" variant="ghost" onClick={props.onOpenDecisions}>Pick some or skip</Button>
                  </div>
                </div>
              )
            }}
          </Show>
        </Section>
      </div>

      <Section
        title="Your turn to reply"
        icon={<SectionIcon name="mail" />}
        description="People who wrote back and are waiting on you — from the Gmail ledger, it updates itself."
        count={replies().length}
      >
        <Show when={replies().length > 0} fallback={<p class="text-sm text-muted-foreground">Nobody is waiting on an answer from you.</p>}>
          <WorkList>
            <For each={replies().slice(0, 3)}>{reply => (
              <WorkRow
                badge={<Badge variant={reply.disposition === 'positive' ? 'success' : 'muted'}>{reply.disposition === 'positive' ? 'said yes' : 'answered'}</Badge>}
                title={reply.display_name}
                why={`${reply.target_kind.replaceAll('_', ' ')} · ${formatIsoAge(reply.replied_at)}`}
                action={
                  <Link to="/tenants/$slug/operations" params={{ slug: props.slug }} search={{ tab: 'replies' }} class="text-xs font-medium text-primary">
                    Reply
                  </Link>
                }
              />
            )}</For>
          </WorkList>
          <Show when={replies().length > 3}>
            <Link to="/tenants/$slug/operations" params={{ slug: props.slug }} search={{ tab: 'replies' }} class="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground">
              {replies().length - 3} more — open replies →
            </Link>
          </Show>
        </Show>
        <Show when={(lapsed()?.total ?? 0) > 0}>
          <p class="mt-3 text-xs text-muted-foreground">
            {lapsed()!.total} {lapsed()!.total === 1 ? 'ask' : 'asks'} expired unanswered in the last {lapsed()!.window_days} days.
          </p>
        </Show>
      </Section>
    </>
  )
}

/** The header pill: the soonest expiry, or that nothing waits. */
export function needsYouStatus(model: TenantTodayReadModel | undefined): { tone: 'good' | 'warn' | 'bad' | 'muted'; text: string } | null {
  if (!model) return null
  const batches = model.derived?.approval_batches
  if (batches == null) return { tone: 'muted', text: 'The queue could not be read' }
  const count = batches.reduce((sum, b) => sum + b.count, 0)
  if (count === 0) return { tone: 'good', text: 'Nothing waits for your yes' }
  const soonest = batches.map(b => b.earliest_expires_at).filter((v): v is string => Boolean(v)).sort()[0]
  return {
    tone: 'warn',
    text: soonest ? `${count} waiting · first expires ${shortWhen(soonest)}` : `${count} waiting for your yes`,
  }
}
