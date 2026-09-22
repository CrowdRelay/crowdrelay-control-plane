import { For, Show, createSignal } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { errorMessage } from '../lib/format'
import type { BookingAgent } from '../lib/types'
import { EmptyState } from './ui/empty-state'
import { SkeletonRows } from './Skeleton'
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
  const [confirming, setConfirming] = createSignal<string | null>(null)
  const [replyFor, setReplyFor] = createSignal<string | null>(null)
  const [disposition, setDisposition] = createSignal('received')
  const [repliedOn, setRepliedOn] = createSignal(today())

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['booking-agents', props.slug] })

  const approach = async (agent: BookingAgent) => {
    if (pending() !== null) return
    if (confirming() !== agent.agent_id) {
      setConfirming(agent.agent_id)
      return
    }
    setConfirming(null)
    setPending(agent.agent_id)
    try {
      await api.approachBookingAgent(props.slug, agent.agent_id)
      await invalidate()
      toast.success('Asked — the season letter is queued for approval on the board.')
    } catch (error) {
      toast.error(errorMessage(error, 'Could not queue the approach'))
    } finally {
      setPending(null)
    }
  }

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
                            onClick={() => void approach(agent)}
                          >
                            {pending() === agent.agent_id ? 'Queuing…' : confirming() === agent.agent_id ? 'Yes, queue the letter' : 'Ask to approach'}
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
    </div>
  )
}
