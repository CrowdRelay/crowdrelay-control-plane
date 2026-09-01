import { Show, createResource, createSignal } from 'solid-js'
import { For } from 'solid-js'
import { api } from '../lib/api'
import { errorMessage } from '../lib/format'
import { triggerRefresh } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'
import { SkeletonPanel } from './Skeleton'

const CycleIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
)

const strategyLabel = (strategy: string) =>
  strategy.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const number = (value: number) => value.toLocaleString()

/// Run a full brain cycle, or preview what one would decide.
///
/// Preview is always offered first. A cycle dispatches real outreach, and the
/// operator should be able to see what the brain currently believes before
/// authorising it to act on that belief.
export function RunBrainCyclePanel(props: { slug: string }) {
  const [preview, { refetch }] = createResource(() => props.slug, api.autopilotCyclePreview)
  const [running, setRunning] = createSignal(false)
  const [notice, setNotice] = createSignal<{ tone: 'good' | 'bad'; message: string } | null>(null)

  const runCycle = async () => {
    setRunning(true)
    setNotice(null)
    try {
      const result = await api.autopilotCycleRun(props.slug)
      setNotice({
        tone: 'good',
        message: result.detail ?? 'Cycle requested.',
      })
      triggerRefresh()
      await refetch()
    } catch (error) {
      setNotice({ tone: 'bad', message: errorMessage(error, 'Could not request a cycle') })
    } finally {
      setRunning(false)
    }
  }

  return (
    <section class="panel">
      <header class="panel-header">
        <h2><CycleIcon /> Run a growth cycle</h2>
        <button class="ghost" onClick={() => void refetch()} disabled={preview.loading}>
          Refresh preview
        </button>
      </header>

      <Show when={preview.loading}><SkeletonPanel /></Show>

      <Show when={preview.error}>
        <p class="notice bad">Could not read what the brain believes: {errorMessage(preview.error, 'unknown error')}</p>
      </Show>

      <Show when={preview()}>
        {data => (
          <>
            <p class="muted">
              The brain would run <strong>{strategyLabel(data().strategy)}</strong>, considering{' '}
              {data().templatesConsidered} worker templates. Nothing below has been dispatched yet.
            </p>

            <div class="stat-row">
              <div class="stat">
                <span class="stat-label">Fans</span>
                <span class="stat-value">{number(data().totalFans)}</span>
              </div>
              <div class="stat">
                <span class="stat-label">Reachable audience</span>
                <span class="stat-value">{number(data().offPlatformAudience)}</span>
                <span class="stat-note">+{number(data().offPlatformAudienceThisMonth)} this month</span>
              </div>
              <div class="stat">
                <span class="stat-label">{strategyLabel(data().northStar)}</span>
                <span class="stat-value">{number(data().northStarCurrent)}</span>
                <span class="stat-note">+{number(data().northStarThisMonth)} this month</span>
              </div>
              <div class="stat">
                <span class="stat-label">Platforms</span>
                <span class="stat-value">{data().freshPlatforms} / {data().connectedPlatforms}</span>
                <span class="stat-note">fresh / connected</span>
              </div>
            </div>

            {/* A gap here is measurement debt, not audience loss: the platform is
                configured but its newest reading is too old to act on. */}
            <Show when={data().connectedPlatforms > data().freshPlatforms}>
              <p class="notice warn">
                {data().connectedPlatforms - data().freshPlatforms} connected platform(s) have no
                recent reading. The brain is deciding without them.
              </p>
            </Show>

            <Show when={!data().hasAnyConnectedPlatform}>
              <p class="notice warn">
                No platform is connected yet, so a cycle would correctly decide to do nothing.
                Connect a fan source first in Portfolio.
              </p>
            </Show>

            <div class="template-priority">
              <span class="stat-label">Template order</span>
              <ol>
                <For each={data().templatePriority}>
                  {(template, index) => (
                    <li>
                      <StatusBadge tone={index() === 0 ? 'good' : 'muted'} status={template} />
                    </li>
                  )}
                </For>
              </ol>
            </div>

            <footer class="panel-footer">
              <button
                class="primary"
                onClick={() => void runCycle()}
                disabled={running() || !data().hasAnyConnectedPlatform}
              >
                {running() ? 'Requesting…' : 'Run cycle now'}
              </button>
              <span class="muted">
                Dispatches real outreach. Subject to the same autonomy policy and 24-hour action
                cap as a scheduled cycle.
              </span>
            </footer>
          </>
        )}
      </Show>

      <Show when={notice()}>
        {value => <p class={`notice ${value().tone}`}>{value().message}</p>}
      </Show>
    </section>
  )
}
