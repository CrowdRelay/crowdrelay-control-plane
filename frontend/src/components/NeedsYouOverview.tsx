import { For, Show, createMemo, createSignal } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import type { OpportunityBoardEntry, TenantTodayReadModel } from '../lib/types'
import { formatIsoAge } from '../lib/format'
import { DECISION_KIND_LABELS, APPROVE_EFFECT, labelOr, opportunityTitle } from '../lib/opportunity-labels'
import { ApproveAllButton } from './ApproveAllButton'
import { Act, Card, MoreRow, Note, Pill, Row, RowButton, Split, StatRow, Tile, Tiles } from './ui/dash'
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

  // The pill word for a batch: "letters", "gig", "post".
  const kindWord = (batch: Batch) => {
    const words: Record<string, [string, string]> = {
      'outreach.request': ['letter', 'letters'],
      'booking.outreach.request': ['gig', 'gigs'],
      'opportunity.live.apply': ['gig', 'gigs'],
      'community.post': ['post', 'posts'],
      'social.post': ['post', 'posts'],
      'beacon.discovery.request': ['search', 'searches'],
      'booking.target_discovery.request': ['search', 'searches'],
      'show.growth.request': ['show', 'shows'],
    }
    const pair = words[batch.actionKind] ?? ['ask', 'asks']
    return batch.count > 1 ? pair[1] : pair[0]
  }

  // A briefing names a show by the first eight characters of its id; the
  // show list in the same read knows its title.
  const showTitle = (value: string) =>
    props.model.shows?.events.find(show => show.id.startsWith(value))?.title ?? value

  const expiresShort = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  return (
    <>
      <Tiles>
        <Tile
          label="Waiting for yes"
          value={batchesWithheld() ? null : waiting()}
          sub={batchesWithheld() ? 'couldn\'t load' : waiting() === 0 ? 'nothing to decide' : `${waves()} ${waves() === 1 ? 'batch' : 'batches'} · ${singles()} single`}
        />
        <Tile label="Expire in 24 h" value={lapsed()?.expiring_within_24h} sub={lapsed() == null ? "couldn't load" : soonest() ? `next: ${expiresShort(soonest()!)}` : 'none pending'} />
        <Tile label="Your turn to reply" value={props.model.reply_triage ? replies().length : null} sub={props.model.reply_triage == null ? "couldn't load" : `${saidYes()} said yes`} />
        <Tile
          label="Lost this week"
          value={lapsed()?.total}
          valueTone={(lapsed()?.total ?? 0) > 0 ? 'bad' : undefined}
          sub="expired with no answer"
        />
      </Tiles>

      <Split>
        <Card title="Waiting for your yes">
          <Show when={batches().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{batchesWithheld() ? "Couldn't load the queue — the tenant didn't report it." : 'Nothing waits for your yes.'}</p>}>
            <For each={batches()}>{batch => (
              <RowButton selected={selected()?.key === batch.key} onClick={() => setSelectedKey(batch.key)}>
                <Pill tone={batch.count > 1 ? 'accent' : 'muted'}>{batch.count > 1 ? `${batch.count} ${kindWord(batch)}` : kindWord(batch)}</Pill>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm text-foreground">{batchTitle(batch)}</span>
                  <span class="block text-xs text-muted-foreground">
                    {[batch.entry?.reason, batch.expiresAt ? `expires ${expiresShort(batch.expiresAt)}` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </RowButton>
            )}</For>
          </Show>
          <Note>If nobody answers, an ask expires and the machine moves on.</Note>
        </Card>

        <Show when={selected()} fallback={<Card title="The ask"><p class="m-0 text-sm text-muted-foreground">Pick a row to read what it would do.</p></Card>}>
          {batch => {
            const entry = () => batch().entry
            const draft = () => batch().actionIds.map(id => revisable().get(id)).find(Boolean) ?? null
            return (
              <Card title={batchTitle(batch())} aside={batch().count > 1 ? `1 of ${batch().count}` : undefined}>
                <Show when={entry()?.briefing?.why_it_matters}>
                  <p class="m-0 text-xs text-muted-foreground">{entry()!.briefing!.why_it_matters}</p>
                </Show>
                <Show when={draft()}>
                  {fields => (
                    <div class="my-2.5 rounded-lg border border-border px-3 py-2.5 text-xs leading-relaxed">
                      <For each={Object.entries(fields())}>{([key, text]) => (
                        <p class={cn('m-0 mb-1.5 whitespace-pre-line last:mb-0', key.includes('subject') || key.includes('title') ? 'font-medium text-foreground' : 'text-foreground')}>{text}</p>
                      )}</For>
                    </div>
                  )}
                </Show>
                <Show when={!draft() && (entry()?.briefing?.content ?? []).length > 0}>
                  <div class="my-2.5">
                    <For each={entry()!.briefing!.content}>{field => (
                      <StatRow label={field.label} value={<span class="text-foreground">{field.label === 'Event' ? showTitle(field.value) : field.value}</span>} />
                    )}</For>
                  </div>
                </Show>
                <Show when={APPROVE_EFFECT[batch().actionKind] || entry()?.consequence}>
                  <Note>
                    {[APPROVE_EFFECT[batch().actionKind] ? `Approving: ${APPROVE_EFFECT[batch().actionKind]}` : null,
                      entry()?.consequence ? `If nobody answers: ${entry()!.consequence}.` : null].filter(Boolean).join(' ')}
                  </Note>
                </Show>
                <div class="mt-3 flex flex-wrap items-center gap-2">
                  <ApproveAllButton slug={props.slug} actionIds={batch().actionIds} onDone={props.refresh} />
                  <Act onClick={props.onOpenDecisions}>Pick some</Act>
                  <Act onClick={props.onOpenDecisions}>Edit</Act>
                  <Act onClick={props.onOpenDecisions}>Skip</Act>
                </div>
              </Card>
            )
          }}
        </Show>
      </Split>

      <Card title="Your turn to reply" aside="from your Gmail, updates itself" class="mb-3">
        <Show when={replies().length > 0} fallback={<p class="m-0 py-2 text-sm text-muted-foreground">{props.model.reply_triage == null ? "Couldn't load replies — the tenant didn't report them." : 'Nobody is waiting on an answer from you.'}</p>}>
          <For each={replies().slice(0, 3)}>{reply => (
            <Row>
              <Pill tone={reply.disposition === 'positive' ? 'good' : 'muted'}>{reply.disposition === 'positive' ? 'said yes' : 'answered'}</Pill>
              <span class="min-w-0 flex-1 truncate text-sm text-foreground">{reply.display_name} · {reply.target_kind.replaceAll('_', ' ')}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{formatIsoAge(reply.replied_at)}</span>
            </Row>
          )}</For>
          <Show when={replies().length > 3}>
            <MoreRow
              text={`${replies().length - 3} more`}
              link={<Link to="/tenants/$slug/operations/replies" params={{ slug: props.slug }}>Open replies</Link>}
            />
          </Show>
        </Show>
      </Card>
    </>
  )
}

