import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { errorMessage, formatTimestamp } from '../lib/format'
import { toast } from '../lib/toast'
import { confirmAction } from './Dialog'
import { SectionIcon } from './SectionIcon'
import { StatusBadge } from './StatusBadge'
import { SkeletonSection } from './Skeleton'

// `/operations/posture` reads and writes, and nothing in the console called
// the writer: the one dial that moves all 22 authority policies together could
// only be turned from the API. The wording below is the domain's own — see
// `GrowthPosture` in crowdrelay-application — so the console cannot describe
// the postures differently from how the brain applies them.

type Posture = 'grounded' | 'working' | 'full_send'

const POSTURES: Array<{ value: Posture; label: string; summary: string; detail: string }> = [
  {
    value: 'grounded',
    label: 'Grounded',
    summary: 'Sees everything, touches nobody.',
    detail: 'Every cycle runs as a rehearsal: the brain produces the steps it would take and the ceilings stay shut. Safe to leave on for a week while you read what it decides.',
  },
  {
    value: 'working',
    label: 'Working',
    summary: 'First-party work runs alone, outward contact waits for you.',
    detail: 'Listings, links, segments and drafts execute unattended; anything that reaches a person is drafted for one-click approval. The posture to stay on until the audience is real.',
  },
  {
    value: 'full_send',
    label: 'Full send',
    summary: 'Owned-audience sends and free pitching run unattended.',
    detail: 'Messaging your own audience runs within budget, cooldown and deliverability limits, and free third-party pitching goes out without asking. Gig applications still wait for a human — contractual, reputational, irreversible.',
  },
]

export function GrowthPosturePanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const [pending, setPending] = createSignal<Posture | null>(null)

  const posture = useQuery(() => ({
    queryKey: ['growth-posture', props.slug],
    queryFn: () => api.growthPosture(props.slug),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  }))

  const current = () => posture.data?.posture ?? null

  const apply = useMutation(() => ({
    mutationFn: (value: Posture) => api.setGrowthPosture(props.slug, {
      posture: value,
      expected_version: posture.data?.expected_version ?? 0,
    }),
    onSuccess: async (_result, value) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['growth-posture', props.slug] }),
        queryClient.invalidateQueries({ queryKey: ['tenant-operations', props.slug] }),
        queryClient.invalidateQueries({ queryKey: ['autopilot-overview', props.slug] }),
      ])
      toast.success(`Posture set to ${POSTURES.find(p => p.value === value)?.label ?? value}.`)
    },
    onError: async (error) => {
      // The write carries `expected_version`, so a stale tab loses rather than
      // silently overwriting a change made elsewhere. Refetch and say so.
      await queryClient.invalidateQueries({ queryKey: ['growth-posture', props.slug] })
      toast.error(errorMessage(error, 'Posture change was rejected'))
    },
    onSettled: () => setPending(null),
  }))

  const choose = async (value: Posture) => {
    if (value === current() || apply.isPending) return
    const option = POSTURES.find(p => p.value === value)!
    const ok = await confirmAction({
      title: `Switch the growth loop to ${option.label}?`,
      body: `${option.detail} This rewrites every authority policy at once; individual policies can still be tuned afterwards.`,
      confirmLabel: `Set ${option.label}`,
      destructive: value === 'full_send',
    })
    if (!ok) return
    setPending(value)
    apply.mutate(value)
  }

  return <article class="panel posture-panel">
    <div class="section-title">
      <div>
        <span class="eyebrow">POSTURE</span>
        <h2><SectionIcon name="target" />How far the growth loop may go</h2>
        <p>One dial over all 22 authority policies. Pick the posture the band is ready for; the brain applies the matching autonomy level to every context and records why the ceiling moved.</p>
      </div>
      <Show when={posture.data}>
        <StatusBadge
          status={current() ? POSTURES.find(p => p.value === current())?.label ?? current()! : 'not set'}
          tone={current() === 'full_send' ? 'warn' : current() ? 'good' : 'muted'}
        />
      </Show>
    </div>

    <Show when={posture.error}>
      <div class="inherit-card"><p>Posture is unavailable on the connected CrowdRelay build. Authority policies below still work one at a time.</p></div>
    </Show>

    <Show when={!posture.error && posture.isPending}><SkeletonSection titleWidth="160px" lines={3} minHeight="140px" /></Show>

    <Show when={posture.data}>
      <Show when={!current()}>
        <div class="inherit-card">
          <p>No posture has been chosen, so each policy carries whatever it was last set to individually. Picking one here brings them into a state you can describe in a sentence.</p>
        </div>
      </Show>
      <div class="posture-options" role="radiogroup" aria-label="Growth posture">
        <For each={POSTURES}>{option => (
          <button
            type="button"
            role="radio"
            aria-checked={current() === option.value}
            class="posture-option"
            classList={{ selected: current() === option.value }}
            disabled={apply.isPending}
            onClick={() => choose(option.value)}
          >
            <span class="posture-option-head">
              <strong>{option.label}</strong>
              <Show when={current() === option.value}><span class="badge badge-good">current</span></Show>
              <Show when={pending() === option.value}><span class="badge">applying…</span></Show>
            </span>
            <span class="posture-option-summary">{option.summary}</span>
            <span class="posture-option-detail">{option.detail}</span>
          </button>
        )}</For>
      </div>
      <Show when={posture.data?.set_at}>
        <p class="posture-set-at">Set {formatTimestamp(posture.data!.set_at!)} · policy version {posture.data!.expected_version}</p>
      </Show>
    </Show>
  </article>
}
