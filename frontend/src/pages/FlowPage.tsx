import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { relativeTime } from '../lib/format'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'
import { processMapLive } from '../lib/process-map-live'
import { ProcessMap } from '../components/ProcessMap'
import { SkeletonSection } from '../components/Skeleton'
import { PageShell, ErrorCard } from '../components/layout'
import { DashHeader, WorkAreaPanel, WorkAreas, useWorkAreas } from '../components/ui/dash'
import { brainCycleStages } from '../lib/brain-cycle'
import { Link } from '@tanstack/solid-router'
import { cn } from '../lib/cn'
import { Alert } from '../components/app/alert'
import { NativeSelect } from '../components/ui/native-select'

// Naming the brain-model sections a '—' on the map belongs to — same idea
// as the Intelligence page's degraded strip, compressed to one line.
const SECTION_LABEL: Record<string, { platform: string; band: string }> = {
  autopilot: { platform: 'autopilot posture', band: 'autopilot posture' },
  scorecard: { platform: 'the scorecard', band: 'the scorecard' },
  learning: { platform: 'the decision loop', band: 'what it tried' },
  learning_proof: { platform: 'belief changes', band: 'what it changed its mind about' },
  measurement: { platform: 'the measurement ledger', band: 'the numbers' },
  attention: { platform: 'what needs a person', band: 'what needs you' },
  action_states: { platform: 'the action state machine', band: "what's in progress" },
}

/** The mockup's six words for the loop, and the page that owns each. */
const STAGE_NAME: Record<string, string> = { sense: 'Sense', decide: 'Decide', authorize: 'Approve', act: 'Act', measure: 'Measure', learn: 'Learn' }
const STAGE_PAGE: Record<string, string> = {
  sense: '/tenants/$slug/intelligence',
  decide: '/tenants/$slug/intelligence',
  authorize: '/tenants/$slug/attention',
  act: '/tenants/$slug/in-motion',
  measure: '/tenants/$slug/intelligence',
  learn: '/tenants/$slug/intelligence',
}

export function FlowPage() {
  const tenants = useQuery(() => ({
    queryKey: ['tenants'],
    queryFn: () => api.tenants(),
    reconcile: 'id',
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  }))

  const platform = () => authState.isPlatformLevel()

  // The map itself is generic — the same architecture diagram for every
  // tenant, but the live counts belong to one. Tenant operators are pinned
  // to their profile's tenant; a platform session picks from the list.
  const [chosenSlug, setChosenSlug] = createSignal('')
  const slug = createMemo(() => {
    const profileSlug = authState.profile()?.tenantSlug
    if (profileSlug) return profileSlug
    return chosenSlug() || tenants.data?.items[0]?.slug || ''
  })
  const tenantName = () => tenants.data?.items.find(t => t.slug === slug())?.displayName ?? slug()

  // Same key, same options as TenantIntelligencePage — one shared cache
  // entry, and CLAUDE.md requires both observers of a shared key to pass
  // the same retry rule or whichever mounts first decides for both.
  const brain = useQuery(() => ({
    queryKey: ['tenant-brain', slug()],
    queryFn: () => api.brainModel(slug()),
    enabled: Boolean(slug()),
    reconcile: 'id',
    refetchOnWindowFocus: false,
    staleTime: 10_000,
    refetchInterval: whileIncomplete(hasDegradedSections),
  }))

  // "updated 2m ago" and the live facts keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    return brain.dataUpdatedAt ? relativeTime(brain.dataUpdatedAt) : null
  })
  const live = createMemo(() => {
    const m = brain.data
    return m ? processMapLive(m, platform(), now()) : undefined
  })
  const degradedNames = () => (brain.data?.degraded ?? []).map(s => {
    const label = SECTION_LABEL[s]
    return label ? (platform() ? label.platform : label.band) : s
  })

  const areas = useWorkAreas(['map'])
  const stages = createMemo(() => (brain.data ? brainCycleStages(brain.data, true, now()) : []))
  const stuck = () => stages().find(stage => stage.stuck) ?? null

  return (
    <PageShell>
      <DashHeader
        title="Process map"
        subtitle={<>The brain's loop, with live counts · {tenantName()}</>}
        pill={stuck() ? { tone: 'warn', text: `stuck at: ${stuck()!.label.toLowerCase()}` } : brain.data ? { tone: 'good', text: 'Loop moving' } : null}
      />
      <Show
        when={slug()}
        fallback={<>
          <Show when={tenants.error}>
            <ErrorCard>Could not load tenants: {String(tenants.error?.message ?? tenants.error)}</ErrorCard>
          </Show>
          <Show when={!tenants.error && tenants.isPending && !tenants.data}>
            <SkeletonSection titleWidth="160px" lines={3} minHeight="120px" />
          </Show>
          <Show when={!tenants.error && !tenants.isPending && !slug()}>
            <ErrorCard>No active tenant — create one on the Tenants tab.</ErrorCard>
          </Show>
        </>}
      >
        {/* The process running the loop is down — a fact the summary reports,
            not a style choice. Nothing else on the page implies it. */}
        <Show when={live()?.workerDown === true}>
          <Alert tone="destructive" class="mb-4">
            {platform()
              ? 'The worker is not running — nothing queued will execute until it is back.'
              : "The system's worker isn't running right now — nothing will go out until it's back."}
          </Alert>
        </Show>

        <div class="mb-4 flex flex-wrap items-center gap-3">
          <Show when={platform() && (tenants.data?.items.length ?? 0) > 1}>
            <NativeSelect
              size="sm"
              aria-label="Tenant"
              value={slug()}
              onChange={e => setChosenSlug(e.currentTarget.value)}
            >
              <For each={tenants.data?.items ?? []}>{t => <option value={t.slug}>{t.displayName}</option>}</For>
            </NativeSelect>
          </Show>
          <Show when={brain.data}>
            <span class="text-sm text-muted-foreground">Live for {tenantName()} · updated {updated()}</span>
          </Show>
          <Show when={!brain.data && brain.isPending}>
            <span class="text-sm text-muted-foreground">Loading live counts…</span>
          </Show>
          <Show when={degradedNames().length > 0}>
            <span class="text-xs text-muted-foreground">
              {platform() ? 'Not reporting' : "Couldn't check"}: {degradedNames().join(' · ')}
            </span>
          </Show>
        </div>

        {/* The live layer failed — the map still renders, static, and says
            so rather than showing numbers that did not arrive. */}
        <Show when={brain.error}>
          <Alert tone="warning" class="mb-4">
            {platform()
              ? 'Live counts could not be read — the map below is the static shape.'
              : "Couldn't check the live numbers right now — the map below is the fixed shape."}
          </Alert>
        </Show>

        <Show when={stages().length > 0}>
          <div class="mb-2 flex flex-wrap items-stretch gap-1.5">
            <For each={stages()}>{(stage, index) => (
              <>
                <Show when={index() > 0}><span class="flex items-center text-muted-foreground/70" aria-hidden="true">›</span></Show>
                <Link
                  to={STAGE_PAGE[stage.key] ?? '/tenants/$slug/intelligence'}
                  params={{ slug: slug() }}
                  class={cn('min-w-0 flex-1 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/30',
                    stage.key === stuck()?.key ? 'border-warning-foreground/70 bg-warning-foreground/10' : 'border-border bg-muted/55')}
                >
                  <p class="m-0 text-sm font-medium text-foreground">{STAGE_NAME[stage.key] ?? stage.label}</p>
                  <p class={cn('m-0 text-xs', stage.key === stuck()?.key ? 'text-warning-foreground' : 'text-muted-foreground/70')}>
                    {[stage.count != null ? String(stage.count) : null, typeof stage.detail === 'string' ? stage.detail : null].filter(Boolean).join(' · ') || '—'}
                  </p>
                </Link>
              </>
            )}</For>
          </div>
          <p class="m-0 mb-3 text-xs text-muted-foreground/70">Each block opens the page that owns it. The stuck block is where the loop loses the most.</p>
        </Show>

        <WorkAreas active={areas.active()} onToggle={areas.toggle} areas={[{ id: 'map', label: 'The full map' }]} />
        <WorkAreaPanel id="map" active={areas.active()}>
        <div class="process-map-legend">
          <span><i class="legend-swatch legend-inputs" />Sources</span>
          <span><i class="legend-swatch legend-intel" />Intelligence</span>
          <span><i class="legend-swatch legend-auth" />Authority</span>
          <span><i class="legend-swatch legend-worker" />Execution</span>
          <span><i class="legend-swatch legend-outcome" />Outcomes</span>
          <span><i class="legend-swatch legend-learning" />Learning loop</span>
        </div>
        <ProcessMap slug={slug} live={live} />
        </WorkAreaPanel>
      </Show>
    </PageShell>
  )
}
