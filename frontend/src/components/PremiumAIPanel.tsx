import { For, Show, createResource, createSignal } from 'solid-js'
import { request } from '../lib/api'
import { errorMessage } from '../lib/format'
import { refreshTick } from '../lib/refresh'
import { StatusBadge } from './StatusBadge'

interface PremiumModel {
  id: string
  provider: string
  name: string
  best_for: string
  agentic: boolean
  price_input_per_mtok: number
  price_output_per_mtok: number
}

interface PremiumTask {
  id: string
  template_id: string
  model_id: string
  model_provider: string | null
  tier: string
  cost_micro_usd: number
  status: string
  created_at: string
  completed_at: string | null
}

interface PremiumUsage {
  connected_providers: string[]
  premium_models: PremiumModel[]
  monthly_spend_micro_usd: number
  budget_micro_usd: number
  tasks: PremiumTask[]
}

const formatUsd = (microUsd: number): string => {
  const usd = microUsd / 1_000_000
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

const budgetPct = (spent: number, budget: number): number => {
  if (budget <= 0) return 0
  return Math.min(100, (spent / budget) * 100)
}

const taskStatusTone = (status: string): 'good' | 'warn' | 'bad' | 'muted' =>
  status === 'completed' ? 'good' :
  status === 'running' ? 'warn' :
  status === 'failed' ? 'bad' : 'muted'

const formatAge = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// --- Crown icon (premium tier indicator) ---
const CrownIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 18h18M3 18l2-10 5 5 2-8 2 8 5-5 2 10" />
  </svg>
)

// --- Robot icon (agentic model indicator) ---
const RobotIcon = (props: { size?: number }) => (
  <svg width={props.size ?? 14} height={props.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="4" y="8" width="16" height="12" rx="2" />
    <path d="M12 8V4M8 14h.01M16 14h.01" />
    <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
  </svg>
)

export function PremiumAIPanel(props: { slug: string }) {
  const [localRefresh, setLocalRefresh] = createSignal(0)
  const refreshSource = () => refreshTick() + localRefresh()

  const [usage] = createResource(refreshSource, async () => {
    const data = await request<PremiumUsage>(`/tenants/${props.slug}/agents/premium/usage`)
    return data
  })

  return (
    <Show
      when={usage()}
      fallback={<div class="text-sm text-zinc-500 p-4">Loading premium AI usage…</div>}
    >
      {(u) => (
        <div class="space-y-6">
          {/* Budget overview */}
          <section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div class="flex items-center gap-2 mb-3">
              <CrownIcon size={18} />
              <h3 class="text-sm font-semibold text-zinc-200">Monthly Budget</h3>
            </div>
            <div class="flex items-baseline justify-between mb-2">
              <span class="text-2xl font-bold text-zinc-100">{formatUsd(u().monthly_spend_micro_usd)}</span>
              <span class="text-sm text-zinc-500">of {formatUsd(u().budget_micro_usd)}</span>
            </div>
            <div class="h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                classList={{
                  'bg-emerald-500': budgetPct(u().monthly_spend_micro_usd, u().budget_micro_usd) < 50,
                  'bg-amber-500': budgetPct(u().monthly_spend_micro_usd, u().budget_micro_usd) >= 50 && budgetPct(u().monthly_spend_micro_usd, u().budget_micro_usd) < 90,
                  'bg-red-500': budgetPct(u().monthly_spend_micro_usd, u().budget_micro_usd) >= 90,
                }}
                style={{ width: `${budgetPct(u().monthly_spend_micro_usd, u().budget_micro_usd)}%` }}
              />
            </div>
          </section>

          {/* Connected premium models */}
          <section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div class="flex items-center gap-2 mb-3">
              <h3 class="text-sm font-semibold text-zinc-200">Connected Premium Models</h3>
              <span class="text-xs text-zinc-500">({u().premium_models.length})</span>
            </div>
            <Show
              when={u().premium_models.length > 0}
              fallback={
                <div class="text-sm text-zinc-500 py-4 text-center">
                  No premium models connected. Connect a provider above to unlock powerful AI models.
                </div>
              }
            >
              <div class="grid gap-2">
                <For each={u().premium_models}>
                  {(model) => (
                    <div class="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 p-3">
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-medium text-zinc-200 truncate">{model.name}</span>
                          <Show when={model.agentic}>
                            <span class="inline-flex items-center gap-1 text-xs text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
                              <RobotIcon size={12} /> agentic
                            </span>
                          </Show>
                        </div>
                        <div class="text-xs text-zinc-500 truncate">{model.best_for}</div>
                      </div>
                      <div class="text-right text-xs text-zinc-500 shrink-0">
                        <div>${model.price_input_per_mtok}/M in</div>
                        <div>${model.price_output_per_mtok}/M out</div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </section>

          {/* Recent premium tasks */}
          <section class="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <div class="flex items-center gap-2 mb-3">
              <h3 class="text-sm font-semibold text-zinc-200">Recent Premium Tasks</h3>
              <span class="text-xs text-zinc-500">({u().tasks.length})</span>
            </div>
            <Show
              when={u().tasks.length > 0}
              fallback={
                <div class="text-sm text-zinc-500 py-4 text-center">
                  No premium tasks yet. The brain will route complex tasks here automatically.
                </div>
              }
            >
              <div class="space-y-1.5">
                <For each={u().tasks.slice(0, 10)}>
                  {(task) => (
                    <div class="flex items-center gap-3 rounded-md border border-zinc-800/50 bg-zinc-900/30 px-3 py-2">
                      <StatusBadge status={task.status} tone={taskStatusTone(task.status)} />
                      <span class="text-sm text-zinc-300 font-mono truncate flex-1">{task.template_id}</span>
                      <span class="text-xs text-zinc-500 shrink-0">{task.model_provider ?? '—'}</span>
                      <Show when={task.cost_micro_usd > 0}>
                        <span class="text-xs text-amber-400 shrink-0">{formatUsd(task.cost_micro_usd)}</span>
                      </Show>
                      <span class="text-xs text-zinc-600 shrink-0">{formatAge(task.created_at)}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </section>
        </div>
      )}
    </Show>
  )
}
