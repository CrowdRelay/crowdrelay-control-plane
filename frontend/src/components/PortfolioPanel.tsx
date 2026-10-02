import { AmplifyEdgeAction } from './AmplifyEdgeAction'
import { CloudOff, Megaphone, Plus } from 'lucide-solid'
import { ApiError } from '../lib/api'
import { capabilityAction } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { For, Show, createSignal } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { TechIdList } from './ui/TechnicalDetails'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { PortfolioConsent, PortfolioConsentStatus, PortfolioOverview } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'
import { EmptyState } from './ui/empty-state'
import { Field, FieldGrid } from './ui/field'
import { Input } from './ui/input'
import { NativeSelect } from './ui/native-select'
import { Pill, type Tone } from './ui/dash'
import { Button } from './app/button'
import { DataTable, type ColumnDef } from './app/data-table'
import { FormDrawer } from './app/form-drawer'
import { RadioGroup, RadioGroupItem, RadioGroupItemLabel } from './app/radio-group'
import { toast } from './app/toast'
import { KpiCard, KpiStrip, Section } from './layout'

const STATUS: Record<PortfolioConsentStatus, { label: string; tone: Tone }> = {
  proposed: { label: 'To review', tone: 'warn' },
  active: { label: 'Active', tone: 'good' },
  paused: { label: 'Paused', tone: 'muted' },
  revoked: { label: 'Revoked', tone: 'bad' },
}

const PURPOSES = [
  { value: 'cross_promote', label: 'Cross-promote', hint: 'Introduce one act to the other’s fans' },
  { value: 'release_feature', label: 'Release feature', hint: 'Put a release in front of their fans' },
  { value: 'event_crossbill', label: 'Event cross-bill', hint: 'Bring their fans to a shared show' },
] as const
const PURPOSE_LABEL = Object.fromEntries(PURPOSES.map(p => [p.value, p.label])) as Record<PortfolioConsent['purpose'], string>

const SCOPE_LABEL: Record<PortfolioConsent['scope'], string> = {
  all_active: 'All active fans',
  double_opt_in: 'Only fans who confirmed twice',
}

const metric = (value: number | undefined) => value == null ? '—' : value.toLocaleString()
const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

type Filter = 'all' | PortfolioConsentStatus
type Decision = { edge: PortfolioConsent; action: 'approve' | 'decline' | 'revoke' }

// Amplification agreements: one artist lets another reach its consenting
// fans, per agreement — capped, revocable and audited.
//
// It was a hand-built table whose header had a column the rows didn't, so
// every value from "Campaigns / month" on sat under the wrong heading. Approve
// and Decline opened the same inline form, which then asked again which one
// you meant. Now: one DataTable with status chips, the row's actions next to
// its name (so they never hide past the scroll edge on a phone), and each
// decision in its own drawer asking only what that decision needs.
export function PortfolioPanel(props: {
  slug: string
  overview: PortfolioOverview | undefined
  consents: PortfolioConsent[] | undefined
  // The amplification section failed upstream — `consents` is also undefined
  // for a real zero, so the absence alone cannot tell the two apart. Without
  // this flag the empty state invites "create an edge" on a dead section.
  consentsUnavailable?: boolean
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const changed = async () => {
    await queryClient.invalidateQueries({ queryKey: ['tenant-portfolio', props.slug] })
    props.onChanged()
  }

  // ── Who is who ─────────────────────────────────────────────────────────
  // No read names the other side of an agreement. Admins share the tenants
  // list; everyone knows their own workspace. Anything else is "another
  // artist", with the id one click away rather than as the cell itself.
  const tenants = useQuery(() => ({
    queryKey: ['tenants'],
    queryFn: () => api.tenants(),
    enabled: authState.isPlatformLevel(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    reconcile: 'id',
  }))
  const tenant = useQuery(() => ({
    queryKey: ['tenant', props.slug],
    queryFn: () => api.tenant(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))
  const nameOf = (workspaceId: string): string | null => {
    if (workspaceId === tenant.data?.workspaceId) return `You (${tenant.data.displayName})`
    return tenants.data?.items.find(t => t.workspaceId === workspaceId)?.displayName ?? null
  }
  const Artist = (p: { workspaceId: string; start?: boolean }) => (
    <Show when={nameOf(p.workspaceId)} fallback={p.start ? 'Another artist' : 'another artist'}>{name => <span class="text-foreground">{name()}</span>}</Show>
  )
  /// The ids, once per row and only when a side has no name — never inside
  /// the sentence, where a disclosure split "another artist’s fans" in two.
  const UnnamedIds = (p: { edge: PortfolioConsent }) => (
    <Show when={!nameOf(p.edge.from_workspace_id) || !nameOf(p.edge.to_workspace_id)}>
      <TechIdList class="mt-1" ids={[
        { label: 'whose fans', value: p.edge.from_workspace_id },
        { label: 'who gets them', value: p.edge.to_workspace_id },
      ]} />
    </Show>
  )

  const edges = () => props.consents ?? []
  const count = (filter: Filter) => edges().filter(e => filter === 'all' || e.status === filter).length
  const [show, setShow] = createSignal<Filter>('all')
  const boardTone = () => count('proposed') > 0 ? 'warn' : count('active') > 0 ? 'good' : 'muted'
  const boardLabel = () => count('proposed') > 0
    ? `${count('proposed')} to review`
    : count('active') > 0 ? `${count('active')} live` : 'nothing live yet'

  // ── Pause / resume: reversible, so no form ─────────────────────────────
  const [pendingId, setPendingId] = createSignal<string | null>(null)
  const quick = async (edge: PortfolioConsent, action: 'pause' | 'resume') => {
    setPendingId(edge.id)
    try {
      await api.decidePortfolioEdge(props.slug, edge.id, action, {})
      toast.success(action === 'pause' ? 'Agreement paused. Resume it any time.' : 'Agreement resumed')
      await changed()
    } catch (error) {
      toast.error(action === 'pause' ? "Couldn't pause the agreement" : "Couldn't resume the agreement", error)
    } finally {
      setPendingId(null)
    }
  }

  // ── Approve / decline / revoke: one drawer, asking only what it needs ──
  const [deciding, setDeciding] = createSignal<Decision | null>(null)
  const [actor, setActor] = createSignal('')
  const [reason, setReason] = createSignal('')
  const [decisionSaving, setDecisionSaving] = createSignal(false)
  const [decisionFailure, setDecisionFailure] = createSignal<unknown>(null)
  const openDecision = (edge: PortfolioConsent, action: Decision['action']) => {
    setActor('')
    setReason('')
    setDecisionFailure(null)
    setDeciding({ edge, action })
  }
  const DECISION_COPY = {
    approve: { title: 'Approve the agreement', submit: 'Approve agreement', pending: 'Approving…', done: 'Agreement approved. It can be used from now on.', failed: "Couldn't approve the agreement" },
    decline: { title: 'Decline the agreement', submit: 'Decline agreement', pending: 'Declining…', done: 'Agreement declined', failed: "Couldn't decline the agreement" },
    revoke: { title: 'Revoke the agreement', submit: 'Revoke agreement', pending: 'Revoking…', done: 'Agreement revoked. No more sends go out under it.', failed: "Couldn't revoke the agreement" },
  } as const
  const decide = async () => {
    const d = deciding()
    if (!d) return
    setDecisionSaving(true)
    setDecisionFailure(null)
    try {
      // Upstream has no separate "decline": a declined proposal is revoked.
      await api.decidePortfolioEdge(props.slug, d.edge.id, d.action === 'approve' ? 'approve' : 'revoke', {
        actor: d.action === 'approve' ? actor().trim() : undefined,
        revokeReason: d.action === 'approve' ? undefined : reason().trim(),
      })
      toast.success(DECISION_COPY[d.action].done)
      setDeciding(null)
      await changed()
    } catch (error) {
      setDecisionFailure(error)
    } finally {
      setDecisionSaving(false)
    }
  }

  // ── Propose ────────────────────────────────────────────────────────────
  const [proposing, setProposing] = createSignal(false)
  const [other, setOther] = createSignal('')
  const [purpose, setPurpose] = createSignal<string>('cross_promote')
  const [scope, setScope] = createSignal<PortfolioConsent['scope']>('all_active')
  const [cap, setCap] = createSignal('2')
  const [cooldown, setCooldown] = createSignal('21')
  const [proposeSaving, setProposeSaving] = createSignal(false)
  const [proposeFailure, setProposeFailure] = createSignal<unknown>(null)
  const openPropose = () => {
    // Upstream's own defaults, so leaving them alone changes nothing.
    setOther(''); setPurpose('cross_promote'); setScope('all_active'); setCap('2'); setCooldown('21')
    setProposeFailure(null)
    setProposing(true)
  }
  const otherArtists = () => (tenants.data?.items ?? []).filter(t => t.workspaceId && t.workspaceId !== tenant.data?.workspaceId)
  const propose = async () => {
    setProposeSaving(true)
    setProposeFailure(null)
    try {
      await surface.write(props.slug, 'POST', capabilityAction('amplification', 'Propose').path, {
        toWorkspaceId: other().trim(),
        purpose: purpose(),
        scope: scope(),
        maxCampaignsPerMonth: Number(cap()),
        cooldownDays: Number(cooldown()),
      })
      toast.success('Agreement proposed. The other artist can approve or decline it.')
      setProposing(false)
      await changed()
    } catch (error) {
      setProposeFailure(error instanceof ApiError && (error.status === 400 || error.status === 422)
        ? 'That workspace id isn’t one we recognise. Check it with the crew and try again.'
        : error)
    } finally {
      setProposeSaving(false)
    }
  }
  const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

  /// A row's actions live under its name in the first column, so they are on
  /// screen at any width: as their own column they ended past the scroll
  /// edge on a phone, with nothing saying they were there.
  const RowActions = (p: { edge: PortfolioConsent }) => {
    const e = p.edge
    const name = PURPOSE_LABEL[e.purpose]
    const busy = () => pendingId() !== null
    return <div class="flex flex-wrap items-center gap-1">
      <Show when={e.status === 'proposed'}>
        <Button writes size="sm" disabled={busy()} onClick={() => openDecision(e, 'approve')}>Approve<span class="sr-only"> {name}</span></Button>
        <Button writes size="sm" variant="destructive-ghost" disabled={busy()} onClick={() => openDecision(e, 'decline')}>Decline<span class="sr-only"> {name}</span></Button>
      </Show>
      <Show when={e.status === 'active'}>
        <AmplifyEdgeAction slug={props.slug} consentId={e.id} onDone={() => void changed()} />
        <Button writes size="sm" variant="outline" disabled={busy()} onClick={() => void quick(e, 'pause')}>Pause<span class="sr-only"> {name}</span></Button>
        <Button writes size="sm" variant="destructive-ghost" disabled={busy()} onClick={() => openDecision(e, 'revoke')}>Revoke<span class="sr-only"> {name}</span></Button>
      </Show>
      <Show when={e.status === 'paused'}>
        <Button writes size="sm" variant="outline" disabled={busy()} onClick={() => void quick(e, 'resume')}>Resume<span class="sr-only"> {name}</span></Button>
        <Button writes size="sm" variant="destructive-ghost" disabled={busy()} onClick={() => openDecision(e, 'revoke')}>Revoke<span class="sr-only"> {name}</span></Button>
      </Show>
    </div>
  }

  const columns: ColumnDef<PortfolioConsent, any>[] = [
    {
      id: 'agreement', header: 'Agreement', accessorFn: e => PURPOSE_LABEL[e.purpose], meta: { class: 'min-w-52' },
      cell: c => {
        const e = c.row.original
        return <div class="max-w-sm">
          <span class="font-medium text-foreground">{PURPOSE_LABEL[e.purpose]}</span>
          <span class="block text-xs text-muted-foreground">
            <Artist start workspaceId={e.from_workspace_id} />’s fans → <Artist workspaceId={e.to_workspace_id} />
          </span>
          <span class="block text-xs text-muted-foreground">{SCOPE_LABEL[e.scope] ?? e.scope}</span>
          <UnnamedIds edge={e} />
          <Show when={e.status !== 'revoked'}><div class="mt-2"><RowActions edge={e} /></div></Show>
        </div>
      },
    },
    {
      id: 'status', header: 'Status', accessorFn: e => ['proposed', 'active', 'paused', 'revoked'].indexOf(e.status), meta: { class: 'whitespace-nowrap' },
      cell: c => <Pill tone={STATUS[c.row.original.status].tone}>{STATUS[c.row.original.status].label}</Pill>,
    },
    {
      id: 'campaigns', header: 'Sends this month', accessorFn: e => e.campaigns_this_month, meta: { numeric: true, class: 'whitespace-nowrap' },
      cell: c => {
        const e = c.row.original
        const over = () => e.campaigns_this_month > e.max_campaigns_per_month
        return <>
          {e.campaigns_this_month} of {e.max_campaigns_per_month}
          <Show when={over()}><span class="block text-xs text-warning-foreground">Over the monthly cap</span></Show>
        </>
      },
    },
    {
      id: 'cooldown', header: 'Gap between sends', accessorFn: e => e.cooldown_days, meta: { numeric: true, class: 'whitespace-nowrap' },
      cell: c => days(c.row.original.cooldown_days),
    },
  ]

  const proposeButton = () => (
    <Button writes size="sm" onClick={openPropose}><Plus aria-hidden="true" /> Propose an agreement</Button>
  )

  return <Section
    flush
    title="Roster and amplification"
    icon={<SectionIcon name="megaphone" />}
    description="Let one artist put a release or show in front of another artist's consenting fans. Not a shared list: a permission per agreement, capped, revocable and audited."
    action={<StatusBadge status={boardLabel()} tone={boardTone()} />}
  >
    <Show when={props.overview} keyed>{overview => <KpiStrip class="mb-0" min="9rem">
      <KpiCard label="Artists" value={metric(overview.workspaceCount)} />
      <KpiCard label="Active fans" value={metric(overview.activeFans)} />
      <KpiCard label="New fans" value={`+${metric(overview.fansLast30d)}`} sub="last 30 days" />
      <KpiCard label="Live agreements" value={metric(overview.activeEdges)} />
      <KpiCard label="Amplified" value={metric(overview.deliveriesLast30d)} sub="last 30 days" />
    </KpiStrip>}</Show>

    <div class="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-foreground"><SectionIcon name="link" />Amplification agreements</h3>
      <Show when={edges().length > 0}>{proposeButton()}</Show>
    </div>

    <Show when={edges().length > 0} fallback={
      // Two different empty states, because they mean different things. With
      // fewer than two artists amplification cannot exist at all.
      <Show
        when={!props.consentsUnavailable}
        fallback={<EmptyState icon={<CloudOff />} label="Couldn't load amplification" hint="The rest of the page still works. This part usually comes back on its own." />}
      >
        <Show
          when={(props.overview?.workspaceCount ?? 0) >= 2}
          fallback={<EmptyState icon={<Megaphone />} label="No amplification yet" hint="Amplification needs at least two artists sharing the roster — including band-to-band crossbill, which stays a manual ask inside each show's partner relay until a second artist joins." />}
        >
          <EmptyState icon={<Megaphone />} label="No agreements yet" hint="Propose one to let another artist on the roster reach your fans, within the limits you set.">
            {proposeButton()}
          </EmptyState>
        </Show>
      </Show>
    }>
      <DataTable
        data={edges().filter(e => show() === 'all' || e.status === show())}
        columns={columns}
        getRowId={e => e.id}
        pageSize={8}
        initialSorting={[{ id: 'status', desc: false }]}
        searchText={e => [PURPOSE_LABEL[e.purpose], nameOf(e.from_workspace_id), nameOf(e.to_workspace_id), STATUS[e.status].label].filter(Boolean).join(' ')}
        searchPlaceholder="Search agreements"
        toolbar={
          <div role="group" aria-label="Status" class="flex flex-wrap items-center gap-1">
            <For each={(['all', 'proposed', 'active', 'paused', 'revoked'] as Filter[]).filter(f => f === 'all' || count(f) > 0)}>{f => (
              <Button variant={show() === f ? 'secondary' : 'ghost'} size="sm" aria-pressed={show() === f} onClick={() => setShow(f)}>
                {f === 'all' ? 'All' : STATUS[f].label}
                <span class="tabular-nums text-muted-foreground">{count(f)}</span>
              </Button>
            )}</For>
          </div>
        }
        empty={<EmptyState label="Nothing here" hint="No agreement matches this filter.">
          <Button variant="outline" size="sm" onClick={() => setShow('all')}>Show every agreement</Button>
        </EmptyState>}
      />
    </Show>

    <FormDrawer
      open={deciding() !== null}
      onOpenChange={open => { if (!open) setDeciding(null) }}
      title={deciding() ? DECISION_COPY[deciding()!.action].title : ''}
      description={<Show when={deciding()}>{d => <>
        {PURPOSE_LABEL[d().edge.purpose]}: <Artist start workspaceId={d().edge.from_workspace_id} />’s fans → <Artist workspaceId={d().edge.to_workspace_id} />.
        {' '}Up to {d().edge.max_campaigns_per_month} sends a month, {days(d().edge.cooldown_days)} apart.
      </>}</Show>}
      submitLabel={deciding() ? DECISION_COPY[deciding()!.action].submit : ''}
      pendingLabel={deciding() ? DECISION_COPY[deciding()!.action].pending : undefined}
      pending={decisionSaving()}
      error={decisionFailure()}
      errorTitle={deciding() ? DECISION_COPY[deciding()!.action].failed : undefined}
      onSubmit={() => void decide()}
    >
      <Show when={deciding()?.action === 'approve'} fallback={
        <Field
          label={deciding()?.action === 'decline' ? 'Why are you declining?' : 'Why are you revoking?'}
          hint="Stored with the decision in the audit trail."
        >
          <Input required autocomplete="off" placeholder={deciding()?.action === 'decline' ? 'Not the right audience for this release' : 'The artist withdrew consent'} value={reason()} onInput={e => setReason(e.currentTarget.value)} />
        </Field>
      }>
        <Field label="Your name" hint="Recorded against the agreement in the audit trail.">
          <Input required autocomplete="name" placeholder={authState.isPlatformLevel() ? 'operator@label' : 'you@yourband'} value={actor()} onInput={e => setActor(e.currentTarget.value)} />
        </Field>
      </Show>
      <Show when={deciding()?.action === 'revoke'}>
        <p class="text-sm text-muted-foreground">No more sends go out under it, and it can't be resumed. Propose a new one to start again.</p>
      </Show>
    </FormDrawer>

    <FormDrawer
      open={proposing()}
      onOpenChange={setProposing}
      title="Propose an agreement"
      description="The other artist approves or declines it. Nothing is sent until they approve."
      submitLabel="Propose agreement"
      pendingLabel="Proposing…"
      pending={proposeSaving()}
      error={proposeFailure()}
      errorTitle="Couldn't propose the agreement"
      onSubmit={() => void propose()}
    >
      <Show when={authState.isPlatformLevel() && otherArtists().length > 0} fallback={
        <Field label="Other artist" hint="Their workspace id. Ask the crew if you don't have it.">
          <Input required pattern={UUID} title="A workspace id, like 3f2a…-…" autocomplete="off" spellcheck={false} class="font-mono" placeholder="00000000-0000-0000-0000-000000000000" value={other()} onInput={e => setOther(e.currentTarget.value)} />
        </Field>
      }>
        <Field label="Other artist" hint="Whose fans get to hear from you, or who reaches yours.">
          <NativeSelect required value={other()} onChange={e => setOther(e.currentTarget.value)}>
            <option value="">Choose an artist…</option>
            <For each={otherArtists()}>{t => <option value={t.workspaceId!}>{t.displayName}</option>}</For>
          </NativeSelect>
        </Field>
      </Show>

      <div class="flex flex-col gap-1.5">
        <span id="propose-purpose" class="text-sm font-medium leading-none text-foreground">What it's for</span>
        <RadioGroup aria-labelledby="propose-purpose" name="purpose" value={purpose()} onChange={setPurpose} class="grid grid-cols-1 gap-2">
          <For each={PURPOSES}>{p => (
            <RadioGroupItem value={p.value} class="items-start space-x-0 gap-2.5 rounded-md border border-border p-3 has-[[data-checked]]:border-primary">
              <RadioGroupItemLabel class="flex flex-col gap-1">
                {p.label}
                <span class="text-xs font-normal text-muted-foreground">{p.hint}</span>
              </RadioGroupItemLabel>
            </RadioGroupItem>
          )}</For>
        </RadioGroup>
      </div>

      <Field label="Which fans" hint="Fans who confirmed twice are the safer audience for a first agreement.">
        <NativeSelect value={scope()} onChange={e => setScope(e.currentTarget.value as PortfolioConsent['scope'])}>
          <option value="all_active">{SCOPE_LABEL.all_active}</option>
          <option value="double_opt_in">{SCOPE_LABEL.double_opt_in}</option>
        </NativeSelect>
      </Field>

      <FieldGrid min="160px">
        <Field label="Sends a month" hint="At most, from 1 to 12.">
          <Input required type="number" inputmode="numeric" min="1" max="12" step="1" value={cap()} onInput={e => setCap(e.currentTarget.value)} />
        </Field>
        <Field label="Days between sends" hint="At least, from 1 to 120.">
          <Input required type="number" inputmode="numeric" min="1" max="120" step="1" value={cooldown()} onInput={e => setCooldown(e.currentTarget.value)} />
        </Field>
      </FieldGrid>
    </FormDrawer>
  </Section>
}
