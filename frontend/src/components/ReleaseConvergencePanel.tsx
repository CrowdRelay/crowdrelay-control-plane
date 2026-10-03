import { For, Show } from 'solid-js'
import { KpiCard, KpiStrip } from './layout'
import { SettingsSection } from './ui/settings'
import { Alert } from './app/alert'
import type { ReleaseLedgerOverview } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { Badge } from './app/badge'

const staleReleaseComponents = (ledger: ReleaseLedgerOverview | null) =>
  ledger?.components.filter((component) => component.stale) ?? []

const releaseTone = (ledger: ReleaseLedgerOverview | null): 'good'|'warn'|'bad'|'muted' => {
  if (!ledger) return 'muted'
  if (ledger.backend_sha_drift || ledger.executor_manifest_drift) return 'bad'
  if (ledger.missing_components.length > 0 || staleReleaseComponents(ledger).length > 0) return 'warn'
  return 'good'
}

const releaseLabel = (ledger: ReleaseLedgerOverview | null) => {
  const tone = releaseTone(ledger)
  return tone === 'good' ? 'converged' : tone === 'warn' ? 'incomplete' : tone === 'bad' ? 'drift detected' : 'unavailable'
}

const MISSING_RELEASE_CAUSE: Record<string, string> = {
  'crowdrelay-api': 'crowdrelayctl deploy has not reported a receipt.',
  'crowdrelay-worker': 'crowdrelayctl deploy has not reported a receipt.',
  'virya-www': 'virya build.yml has not published a production receipt since the last deploy.',
  synesthesia: 'synesthesia deploy-web.yml has not published a production receipt since the last deploy.',
  'virya-signal': 'virya-signal android-play.yml has not reported a release receipt yet.',
  n8n: 'scripts/publish-n8n-heartbeat.sh has not run against production yet.',
}

const missingReleaseCause = (key: string) =>
  MISSING_RELEASE_CAUSE[key] ?? 'No production release receipt reported yet.'

// Extract the workflow/pipeline name from the cause text for a chip label.
// e.g. "virya-signal mobile-release.yml has not published…" → "mobile-release.yml"
const missingReleaseWorkflow = (key: string) => {
  const cause = MISSING_RELEASE_CAUSE[key]
  if (!cause) return null
  const match = cause.match(/(\S+\.yml|\S+\.sh|crowdrelayctl deploy)/)
  return match ? match[1] : null
}

// Categorize the missing component for a status chip.
const missingReleaseCategory = (key: string): string => {
  if (key.startsWith('crowdrelay')) return 'backend'
  if (key.startsWith('virya-signal')) return 'mobile'
  if (key.startsWith('virya')) return 'web'
  if (key === 'synesthesia') return 'web'
  if (key === 'n8n') return 'automation'
  return 'component'
}

const releaseObserved = (value: string) => {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 'unknown time' : parsed.toLocaleString()
}

export function ReleaseConvergencePanel(props: { releaseLedger: ReleaseLedgerOverview | null }) {
  const ledger = () => props.releaseLedger
  const stale = () => staleReleaseComponents(ledger())

  return <SettingsSection
    plain
    title="Production convergence"
    description="Every expected production component reports its own release receipt. Missing or stale receipts stay visible until the ecosystem converges."
    actions={<StatusBadge status={releaseLabel(ledger())} tone={releaseTone(ledger())} />}
  >
    <Show when={ledger()} fallback={<p class="text-sm text-muted-foreground">Production release convergence is currently unavailable for this tenant.</p>}>
      {current => <>
        {/* The shared rail; these were four boxed cards. */}
        <KpiStrip class="mb-0" min="8rem">
          <KpiCard label="Reported components" value={current().components.length} />
          <KpiCard label="Missing" value={current().missing_components.length} tone={current().missing_components.length > 0 ? 'warn' : 'default'} />
          <KpiCard label="Stale" value={stale().length} tone={stale().length > 0 ? 'warn' : 'default'} />
          <KpiCard label="Active executors" value={current().active_executor_count} />
        </KpiStrip>

        {/* This notice painted its text on the strong warning colour. */}
        <Show when={current().backend_sha_drift || current().executor_manifest_drift || current().missing_components.length > 0 || stale().length > 0}>
          <Alert tone="warning" role="status" class="mt-4" title="Release reconciliation needs attention">
            {[
              current().backend_sha_drift ? 'API/worker SHA drift' : '',
              current().executor_manifest_drift ? 'executor manifest drift' : '',
              current().missing_components.length ? `${current().missing_components.length} component(s) have no release receipt` : '',
              stale().length ? `${stale().length} component(s) are stale` : '',
            ].filter(Boolean).join(' · ')}
          </Alert>
        </Show>

        <div class="mt-6">
          <h3 class="text-sm font-semibold text-foreground">Release components</h3>
          <div class="mt-2">
            <For each={current().components}>{component => <div class="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
              <div class="min-w-0 flex flex-col gap-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <strong class="text-sm text-foreground">{component.component_key}</strong>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="muted">{component.environment}</Badge>
                    <Show when={component.version && component.version !== 'unversioned'}>
                      {v => <Badge variant="muted" class="font-mono">{v()}</Badge>}
                    </Show>
                  </div>
                </div>
                <small class="text-xs text-muted-foreground">{component.source_sha.slice(0, 12)} · {releaseObserved(component.observed_at)}</small>
                <Show when={component.deploy_ref}><small class="text-xs text-muted-foreground">{component.deploy_ref}</small></Show>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <Show when={component.artifact_digest}><code class="text-xs text-muted-foreground" title={component.artifact_digest ?? undefined}>{component.artifact_digest?.slice(0, 20)}…</code></Show>
                <StatusBadge status={component.stale ? 'stale' : 'current'} tone={component.stale ? 'warn' : 'good'} />
              </div>
            </div>}</For>
            <For each={current().missing_components}>{componentKey => <div class="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
              <div class="min-w-0 flex flex-col gap-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <strong class="text-sm text-foreground">{componentKey}</strong>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="warning">missing</Badge>
                    <Badge variant="muted">{missingReleaseCategory(componentKey)}</Badge>
                    <Show when={missingReleaseWorkflow(componentKey)}>
                      {wf => <Badge variant="muted" class="font-mono">{wf()}</Badge>}
                    </Show>
                  </div>
                </div>
                <small class="text-xs text-muted-foreground">{missingReleaseCause(componentKey)}</small>
              </div>
            </div>}</For>
          </div>
        </div>

        <div class="mt-6">
          <h3 class="text-sm font-semibold text-foreground">Runtime attestation</h3>
          <KpiStrip class="mt-2 mb-0" min="9rem">
            <KpiCard label="team.email" value={current().team_email_live ? 'live' : 'not live'} tone={current().team_email_live ? 'good' : 'default'} sub={`${current().active_team_email_executor_count} capable executor(s)`} />
            <KpiCard label="n8n attestation" value={current().n8n_attestation_ready ? 'verified' : 'missing'} tone={current().n8n_attestation_ready ? 'good' : 'warn'} sub={`${current().guarded_executor_count} guarded executor(s)`} />
            <KpiCard label="Executor manifests" value={current().active_executor_manifest_shas.length} tone={current().executor_manifest_drift ? 'warn' : 'default'} sub={current().executor_manifest_drift ? 'drift detected' : 'converged'} />
          </KpiStrip>
        </div>
      </>}
    </Show>
  </SettingsSection>
}
