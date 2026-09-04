import { For, Show } from 'solid-js'
import type { ReleaseLedgerOverview } from '../lib/types'
import { StatusBadge } from './StatusBadge'
import { SectionIcon } from './SectionIcon'

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

  return <article class="panel ecosystem-release-panel">
    <div class="section-title">
      <div>
        <span class="eyebrow">ECOSYSTEM RELEASE</span>
        <h2><SectionIcon name="git-branch" />Production convergence</h2>
        <p>Every expected production component reports its own release receipt. Missing or stale receipts stay visible until the ecosystem converges.</p>
      </div>
      <StatusBadge status={releaseLabel(ledger())} tone={releaseTone(ledger())} />
    </div>

    <Show when={ledger()} fallback={<div class="inherit-card"><p>Production release convergence is currently unavailable for this tenant.</p></div>}>
      {current => <>
        <div class="autopilot-kpis">
          <div><strong>{current().components.length}</strong><span>reported components</span></div>
          <div><strong>{current().missing_components.length}</strong><span>missing</span></div>
          <div><strong>{stale().length}</strong><span>stale</span></div>
          <div><strong>{current().active_executor_count}</strong><span>active executors</span></div>
        </div>

        <Show when={current().backend_sha_drift || current().executor_manifest_drift || current().missing_components.length > 0 || stale().length > 0}>
          <div class="operations-attention">
            <strong>Release reconciliation needs attention</strong>
            <span>{[
              current().backend_sha_drift ? 'API/worker SHA drift' : '',
              current().executor_manifest_drift ? 'executor manifest drift' : '',
              current().missing_components.length ? `${current().missing_components.length} component(s) have no release receipt` : '',
              stale().length ? `${stale().length} component(s) are stale` : '',
            ].filter(Boolean).join(' · ')}</span>
          </div>
        </Show>

        <div class="flag-list release-component-list">
          <For each={current().components}>{component => <div class="flag-row release-component-row">
            <div class="release-component-info">
              <div class="release-component-head">
                <strong>{component.component_key}</strong>
                <div class="release-component-chips">
                  <span class="badge tone-muted">{component.environment}</span>
                  <Show when={component.version && component.version !== 'unversioned'}>
                    {v => <span class="badge tone-muted mono-badge">{v()}</span>}
                  </Show>
                </div>
              </div>
              <small>{component.source_sha.slice(0, 12)} · {releaseObserved(component.observed_at)}</small>
              <Show when={component.deploy_ref}><small class="muted">{component.deploy_ref}</small></Show>
            </div>
            <div class="row-health">
              <Show when={component.artifact_digest}><code title={component.artifact_digest ?? undefined}>{component.artifact_digest?.slice(0, 20)}…</code></Show>
              <StatusBadge status={component.stale ? 'stale' : 'current'} tone={component.stale ? 'warn' : 'good'} />
            </div>
          </div>}</For>
          <For each={current().missing_components}>{componentKey => <div class="flag-row release-component-row release-component-missing">
            <div class="release-missing-info">
              <div class="release-missing-head">
                <strong>{componentKey}</strong>
                <div class="release-missing-chips">
                  <span class="badge tone-warn">missing</span>
                  <span class="badge tone-muted">{missingReleaseCategory(componentKey)}</span>
                  <Show when={missingReleaseWorkflow(componentKey)}>
                    {wf => <span class="badge tone-muted mono-badge">{wf()}</span>}
                  </Show>
                </div>
              </div>
              <small class="release-missing-cause">{missingReleaseCause(componentKey)}</small>
            </div>
          </div>}</For>
        </div>

        <div class="rum-grid">
          <div><strong>{current().team_email_live ? 'live' : 'not live'}</strong><span>team.email</span><small>{current().active_team_email_executor_count} capable executor(s)</small></div>
          <div><strong>{current().n8n_attestation_ready ? 'verified' : 'missing'}</strong><span>n8n attestation</span><small>{current().guarded_executor_count} guarded executor(s)</small></div>
          <div><strong>{current().active_executor_manifest_shas.length}</strong><span>executor manifests</span><small>{current().executor_manifest_drift ? 'drift detected' : 'converged'}</small></div>
        </div>
      </>}
    </Show>
  </article>
}
