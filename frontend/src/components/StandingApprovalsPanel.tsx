import { For, Show, createSignal } from 'solid-js'
import { useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { formatTimestamp } from '../lib/format'
import { DECISION_KIND_LABELS, labelOr } from '../lib/opportunity-labels'
import { Section, ErrorCard } from './layout'
import { SectionIcon } from './SectionIcon'
import { StatusBadge } from './StatusBadge'
import { SkeletonSection } from './Skeleton'
import { Button } from './app/button'
import { Spinner } from './Spinner'
import { toast } from './app/toast'

// "What may run without asking" — the standing grants written through the
// approve flow's "stop asking about this target" opt-in. It sits on Health →
// Policies because that is where the rest of the autopilot's authority lives:
// the policies say how much it may do; these say where it never has to ask.
// A grant is only ever written from the board — this screen lists and revokes.
export function StandingApprovalsPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const grants = useQuery(() => ({
    queryKey: ['standing-approvals', props.slug],
    queryFn: () => api.standingApprovals(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const [pending, setPending] = createSignal<string | null>(null)
  const [confirming, setConfirming] = createSignal<string | null>(null)
  const keyOf = (actionKind: string, targetKey: string) => `${actionKind}/${targetKey}`

  const revoke = async (actionKind: string, targetKey: string) => {
    const key = keyOf(actionKind, targetKey)
    if (pending() !== null) return
    if (confirming() !== key) {
      setConfirming(key)
      return
    }
    setConfirming(null)
    setPending(key)
    try {
      await api.revokeStandingApproval(props.slug, actionKind, targetKey)
      await queryClient.invalidateQueries({ queryKey: ['standing-approvals', props.slug] })
      toast.success('Revoked — it will ask again before acting there.')
    } catch (error) {
      toast.error("Couldn't revoke the approval", error)
    } finally {
      setPending(null)
    }
  }

  const items = () => grants.data?.items ?? []
  // Live grants first, then the revoked/expired record — the operator asking
  // "what did we turn off" reads the tail, not a filter control.
  const live = () => items().filter(g => !g.revoked_at && new Date(g.expires_at) > new Date())
  const past = () => items().filter(g => g.revoked_at || new Date(g.expires_at) <= new Date())

  return (
    <Section
      flush
      title="Runs without asking"
      icon={<SectionIcon name="shield" />}
      description="Targets granted standing approval through the approve flow. Revoking one means the next action there waits for a person again."
    >
      <Show when={grants.error}>
        <div class="p-4 mt-2.5"><ErrorCard title="Couldn't load standing approvals" error={grants.error} onRetry={() => void grants.refetch()} /></div>
      </Show>
      <Show when={!grants.error && grants.isPending}>
        <SkeletonSection titleWidth="160px" lines={2} minHeight="100px" />
      </Show>
      <Show when={grants.data}>
        <Show when={items().length > 0} fallback={
          <p class="p-4 mt-2.5 m-0 text-sm text-muted-foreground">
            Nothing runs without asking yet. Approving a parked action can carry "and stop asking about this target" — grants made that way land here.
          </p>
        }>
          <ul class="m-0 mt-2.5 flex list-none flex-col p-0">
            <For each={live()}>{grant => {
              const key = keyOf(grant.action_kind, grant.target_key)
              return (
                <li class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="break-all text-sm font-medium text-foreground">{grant.target_key}</span>
                      <StatusBadge status={labelOr(DECISION_KIND_LABELS, grant.action_kind)} tone="muted" />
                    </div>
                    <p class="m-0 mt-1 text-xs text-muted-foreground">
                      granted {formatTimestamp(grant.granted_at)} · runs until {formatTimestamp(grant.expires_at)}
                      <Show when={grant.note}>{note => ` · “${note()}”`}</Show>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive-ghost"
                    size="sm"
                    writes
                    disabled={pending() !== null}
                    onClick={() => void revoke(grant.action_kind, grant.target_key)}
                  >
                    {pending() === key && <Spinner />}
                    {pending() === key ? 'Revoking…' : confirming() === key ? 'Yes, revoke' : 'Revoke'}
                  </Button>
                </li>
              )
            }}</For>
          </ul>
          <Show when={past().length > 0}>
            <details class="mt-1 px-4 pb-3">
              <summary class="cursor-pointer text-xs text-muted-foreground">{past().length} expired or revoked</summary>
              <ul class="m-0 mt-2 flex list-none flex-col p-0">
                <For each={past()}>{grant => (
                  <li class="flex flex-wrap items-center gap-2 py-1.5 text-xs text-muted-foreground">
                    <span class="break-all">{grant.target_key}</span>
                    <StatusBadge
                      status={grant.revoked_at ? 'revoked' : 'expired'}
                      tone="muted"
                    />
                    <span>{formatTimestamp(grant.revoked_at ?? grant.expires_at)}</span>
                  </li>
                )}</For>
              </ul>
            </details>
          </Show>
        </Show>
      </Show>
    </Section>
  )
}
