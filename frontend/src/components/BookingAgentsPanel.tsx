import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { errorMessage } from '../lib/format'
import type { BookingAgent } from '../lib/types'
import { EmptyState } from './ui/empty-state'
import { Dialog } from './Dialog'
import { refreshQueries } from '../lib/refresh'
import { SkeletonRows } from './Skeleton'
import { Spinner } from './Spinner'
import { ErrorCard } from './layout'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import { NativeSelect } from './ui/native-select'
import { Input } from './ui/input'
import { toast } from './app/toast'

// The screened booking-agent registry — who they are and where each season's
// door stands. The contact address never reaches the control plane: "Ask to
// approach" only queues a season letter, which still lands on the board as an
// awaiting-approval action — no letter leaves unattended. "File a reply"
// records what the agent answered; `declined` closes the season's door and
// `do_not_contact` is the wall every contact path honours.

const DISPOSITIONS: Array<{ value: string; label: string }> = [
  { value: 'received', label: 'They replied' },
  { value: 'positive', label: 'They want to talk' },
  { value: 'signed', label: 'They took the act on' },
  { value: 'declined', label: 'No for this season' },
  { value: 'do_not_contact', label: 'Never contact again' },
]

const doorTone = (agent: BookingAgent): 'good' | 'warn' | 'bad' | 'muted' => {
  if (agent.do_not_contact) return 'bad'
  if (agent.approach_pending) return 'warn'
  if (agent.refused_until && new Date(agent.refused_until) > new Date()) return 'muted'
  if (agent.active) return 'good'
  return 'muted'
}

const doorLabel = (agent: BookingAgent): string => {
  if (agent.do_not_contact) return 'do not contact'
  if (agent.approach_pending) return 'letter queued'
  if (agent.refused_until && new Date(agent.refused_until) > new Date()) return 'declined this season'
  if (agent.approached_at) return 'approached'
  if (agent.active) return 'open'
  return 'inactive'
}

const today = () => new Date().toISOString().slice(0, 10)

export function BookingAgentsPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const agents = useQuery(() => ({
    queryKey: ['booking-agents', props.slug],
    queryFn: () => api.bookingAgents(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const [pending, setPending] = createSignal<string | null>(null)
  const [replyFor, setReplyFor] = createSignal<string | null>(null)
  const [disposition, setDisposition] = createSignal('received')
  const [repliedOn, setRepliedOn] = createSignal(today())

  // The approach is a guided flow, not a click: the target is the row, then
  // the operator shapes the letter with a note, then decides whether to
  // approve it themselves or leave it parked on the board. Approving sends
  // through a two-minute hold upstream — the dialog keeps that window
  // visible instead of reporting "sent" the moment approve returns.
  const [guideAgent, setGuideAgent] = createSignal<BookingAgent | null>(null)
  const [guideStep, setGuideStep] = createSignal(0)
  const [guideNote, setGuideNote] = createSignal('')
  const [guideActionId, setGuideActionId] = createSignal<string | null>(null)
  const [guideError, setGuideError] = createSignal<string | null>(null)
  const [holdEndsAt, setHoldEndsAt] = createSignal<number | null>(null)
  const [holdLeft, setHoldLeft] = createSignal(0)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['booking-agents', props.slug] })

  const openGuide = (agent: BookingAgent) => {
    setGuideAgent(agent)
    setGuideStep(0)
    setGuideNote('')
    setGuideActionId(null)
    setGuideError(null)
    setHoldEndsAt(null)
  }

  const queueApproach = async () => {
    const agent = guideAgent()
    if (!agent || pending() !== null) return
    setPending(agent.agent_id)
    setGuideError(null)
    try {
      const result = await api.approachBookingAgent(props.slug, agent.agent_id, guideNote().trim() || undefined)
      setGuideActionId(result.action_id)
      setGuideStep(1)
      await invalidate()
    } catch (error) {
      setGuideError(errorMessage(error, 'Could not queue the approach'))
    } finally {
      setPending(null)
    }
  }

  const approveApproach = async () => {
    const id = guideActionId()
    if (!id || pending() !== null) return
    setPending(id)
    setGuideError(null)
    try {
      await api.approveOpportunityAction(props.slug, id)
      // Upstream parks outward actions for `hold_seconds` (120s) between
      // approve and send — the window where cancel still works. The clock
      // starts now; the worker's own `available_at` is the authority, so the
      // countdown is labelled "about".
      setHoldEndsAt(Date.now() + 120_000)
      setGuideStep(2)
      refreshQueries(['tenant-brain', props.slug], ['tenant-delivery', props.slug])
      await invalidate()
    } catch (error) {
      setGuideError(errorMessage(error, 'Approval did not land'))
    } finally {
      setPending(null)
    }
  }

  const cancelApproach = async () => {
    const id = guideActionId()
    if (!id || pending() !== null) return
    setPending(id)
    setGuideError(null)
    try {
      await api.cancelOpportunityAction(props.slug, id)
      toast.success('Cancelled — the letter never left.')
      setGuideAgent(null)
      refreshQueries(['tenant-brain', props.slug], ['tenant-delivery', props.slug])
      await invalidate()
    } catch (error) {
      setGuideError(errorMessage(error, 'The cancel did not land — check the decisions board'))
    } finally {
      setPending(null)
    }
  }

  // The hold clock ticks while the dialog shows it. `holdEndsAt` is set the
  // moment approve lands; at zero the letter is in the worker's hands and
  // cancel is upstream's call, so the button goes away rather than lying.
  createEffect(() => {
    // Reading guideAgent ties the timer's life to the dialog — a closed
    // dialog tears the interval down instead of ticking on a hidden hold.
    const ends = guideAgent() !== null ? holdEndsAt() : null
    if (ends === null) return
    const tick = () => setHoldLeft(Math.max(0, Math.ceil((ends - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 1000)
    onCleanup(() => clearInterval(timer))
  })

  const fileReply = async (agent: BookingAgent) => {
    if (pending() !== null) return
    setPending(agent.agent_id)
    try {
      await api.recordBookingAgentReply(props.slug, agent.agent_id, disposition(), `${repliedOn()}T00:00:00Z`)
      setReplyFor(null)
      await invalidate()
      toast.success('Reply filed — the season door is updated.')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not file the reply'))
    } finally {
      setPending(null)
    }
  }

  return (
    <div class="space-y-3">
      <p class="text-sm text-muted-foreground m-0">
        {authState.isPlatformLevel()
          ? 'Screened agents the season can approach. Asking queues a letter that still waits for board approval — nothing goes out unattended.'
          : 'Agents screened for this season. Asking queues a letter you still approve before it goes out.'}
      </p>
      <Show when={agents.error}>
        <ErrorCard>{errorMessage(agents.error, 'The agent registry could not be loaded')}</ErrorCard>
      </Show>
      <Show when={!agents.error && agents.isPending}>
        <SkeletonRows count={3} />
      </Show>
      <Show when={agents.data}>
        <Show when={agents.data!.agents.length > 0} fallback={
          <EmptyState
            label="No screened agents"
            hint={authState.isPlatformLevel() ? 'Agents appear here once the screener admits them into the season registry.' : 'Agents appear here once they are screened for the season.'}
          />
        }>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Genres</TableHead>
                <TableHead>Door</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={agents.data!.agents}>{agent => (
                <>
                  <TableRow>
                    <TableCell>
                      <strong>{agent.name}</strong>
                      <Show when={agent.agency}><br /><span class="text-muted-foreground">{agent.agency}</span></Show>
                      <Show when={agent.roster_url}>
                        {url => (<><br /><a href={url()} target="_blank" rel="noreferrer" class="text-xs underline decoration-border underline-offset-4 hover:text-primary">roster</a></>)}
                      </Show>
                    </TableCell>
                    <TableCell><span class="text-muted-foreground">{agent.genres.join(', ') || '—'}</span></TableCell>
                    <TableCell>
                      <Badge variant={doorTone(agent) === 'good' ? 'success' : doorTone(agent) === 'warn' ? 'warning' : doorTone(agent) === 'bad' ? 'destructive' : 'muted'}>{doorLabel(agent)}</Badge>
                      <Show when={agent.route_verified}>
                        <br /><span class="text-xs text-muted-foreground">route verified</span>
                      </Show>
                    </TableCell>
                    <TableCell>
                      <div class="flex flex-wrap gap-1.5 justify-end">
                        <Show when={!agent.do_not_contact && !agent.approach_pending && !(agent.refused_until && new Date(agent.refused_until) > new Date())}>
                          <Button
                            writes
                            variant="ghost"
                            size="sm"
                            disabled={pending() !== null}
                            onClick={() => openGuide(agent)}
                          >
                            Approach…
                          </Button>
                        </Show>
                        <Show when={agent.approached_at || agent.approach_pending}>
                          <Button
                            writes
                            variant="ghost"
                            size="sm"
                            disabled={pending() !== null}
                            onClick={() => { setReplyFor(replyFor() === agent.agent_id ? null : agent.agent_id); setDisposition('received'); setRepliedOn(today()) }}
                          >
                            File a reply
                          </Button>
                        </Show>
                      </div>
                    </TableCell>
                  </TableRow>
                  <Show when={replyFor() === agent.agent_id}>
                    <TableRow>
                      <TableCell colspan={4}>
                        <div class="flex flex-wrap items-end gap-3 py-1">
                          <label class="grid gap-1 text-xs text-muted-foreground">
                            <span>What did they say</span>
                            <NativeSelect value={disposition()} onChange={e => setDisposition(e.currentTarget.value)}>
                              <For each={DISPOSITIONS}>{d => <option value={d.value}>{d.label}</option>}</For>
                            </NativeSelect>
                          </label>
                          <label class="grid gap-1 text-xs text-muted-foreground">
                            <span>When</span>
                            <Input
                              type="date"
                              class="h-9 px-2 py-1.5"
                              value={repliedOn()}
                              onChange={e => setRepliedOn(e.currentTarget.value)}
                            />
                          </label>
                          <Button writes size="sm" disabled={pending() !== null} onClick={() => void fileReply(agent)}>
                            {pending() === agent.agent_id ? 'Filing…' : 'File it'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  </Show>
                </>
              )}</For>
            </TableBody>
          </Table>
        </Show>
      </Show>

    {/* The approach guide — target chosen on the row, letter shaped here,
        approved here, sent through the hold the dialog counts down. */}
    <Dialog
      open={guideAgent() !== null}
      onClose={() => { if (pending() === null) setGuideAgent(null) }}
      label="Approach agent"
      title={`Approach ${guideAgent()?.name ?? 'agent'}`}
      description={guideAgent()?.agency ?? 'independent'}
      footer={<>
        <Show when={guideStep() === 0}>
          <Button variant="ghost" size="sm" onClick={() => setGuideAgent(null)}>Cancel</Button>
          <Button writes size="sm" disabled={pending() !== null} onClick={() => void queueApproach()}>
            {pending() !== null && <Spinner />} {pending() !== null ? 'Drafting…' : 'Draft the letter'}
          </Button>
        </Show>
        <Show when={guideStep() === 1}>
          <Button variant="ghost" size="sm" onClick={() => setGuideAgent(null)}>Leave it parked</Button>
          <Button writes size="sm" disabled={pending() !== null} onClick={() => void approveApproach()}>
            {pending() !== null && <Spinner />} {pending() !== null ? 'Approving…' : 'Approve and send'}
          </Button>
        </Show>
        <Show when={guideStep() === 2}>
          <Show when={holdLeft() > 0}>
            <Button writes variant="ghost" size="sm" disabled={pending() !== null} onClick={() => void cancelApproach()}>
              {pending() !== null ? 'Cancelling…' : 'Cancel the send'}
            </Button>
          </Show>
          <Button size="sm" onClick={() => setGuideAgent(null)}>Done</Button>
        </Show>
      </>}
    >
      <Show when={guideError()}><ErrorCard class="mb-4">{guideError()}</ErrorCard></Show>
      <ol class="mb-4 flex list-none items-center gap-2 p-0 text-xs">
        <For each={['The letter', 'Your call', 'The send']}>{(label, i) => (
          <li class={guideStep() === i() ? 'font-medium text-foreground' : 'text-muted-foreground'}>
            {label}{i() < 2 ? <span class="mx-1.5 text-border">·</span> : null}
          </li>
        )}</For>
      </ol>

      <Show when={guideStep() === 0}>
        <div class="flex flex-col gap-3">
          <p class="m-0 text-sm leading-relaxed text-secondary-foreground">
            Asking drafts a season letter to {guideAgent()?.name ?? 'the agent'} — the band's evidence goes in,
            and the draft waits on the decisions board for a person's approval. Nothing goes out unattended.
          </p>
          <label class="grid gap-1.5 text-sm text-muted-foreground">
            <span>One line for the letter (optional)</span>
            <Input
              value={guideNote()}
              onInput={e => setGuideNote(e.currentTarget.value)}
              placeholder="e.g. looking at Central Europe for spring"
            />
            <small class="text-xs text-muted-foreground">Works into the draft — a season, a region, a reason to talk now.</small>
          </label>
        </div>
      </Show>

      <Show when={guideStep() === 1}>
        <p class="m-0 text-sm leading-relaxed text-secondary-foreground">
          The letter is drafted and parked. Approve it here and it goes out after the hold — or leave it parked
          and it sits on the decisions board with the rest of the queue.
        </p>
      </Show>

      <Show when={guideStep() === 2}>
        <div class="flex flex-col gap-2">
          <Show when={holdLeft() > 0} fallback={
            <p class="m-0 text-sm leading-relaxed text-secondary-foreground">
              The hold is over — the letter is in the worker's hands. The decisions board shows what it landed as.
            </p>
          }>
            <p class="m-0 text-sm leading-relaxed text-secondary-foreground">
              Approved. The letter goes out in about <strong class="text-foreground">{holdLeft()}s</strong> — until then
              cancel still works. After that it is the send's own record.
            </p>
          </Show>
        </div>
      </Show>
    </Dialog>
    </div>
  )
}
