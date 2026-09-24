import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { relativeTime } from '../lib/format'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'
import { processMapLive } from '../lib/process-map-live'
import { ProcessMap } from '../components/ProcessMap'
import { SkeletonSection } from '../components/Skeleton'
import { PageShell, PageHeader, ErrorCard } from '../components/layout'
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

  return (
    <PageShell>
      <PageHeader eyebrow={platform() ? 'BIG PICTURE' : undefined} title="Process map" description={platform()
        ? 'Sources feed the deterministic Rust autopilot, which decides. What that decision is allowed to do is the fork: some actions queue immediately, some wait for a person and expire after 72 hours if nobody answers, and some are recorded and never executed. Delivery is at-least-once, so only what comes back with a receipt updates the causal model and shapes the next decision. Click any block to jump to its page — the counts on it are live.'
        : 'Sources feed the brain, which decides. What a decision may do is the fork: some things go straight to work, some wait for a person and expire after 72 hours if nobody answers, and some are only recorded. Nothing counts until it actually came back — and what came back shapes the next decision. Click any block to jump to its page — the numbers are live.'} />

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

        <div class="process-map-legend">
          <span><i class="legend-swatch legend-inputs" />Sources</span>
          <span><i class="legend-swatch legend-intel" />Intelligence</span>
          <span><i class="legend-swatch legend-auth" />Authority</span>
          <span><i class="legend-swatch legend-worker" />Execution</span>
          <span><i class="legend-swatch legend-outcome" />Outcomes</span>
          <span><i class="legend-swatch legend-learning" />Learning loop</span>
        </div>
        <ProcessMap slug={slug} live={live} />
      </Show>
    </PageShell>
  )
}
