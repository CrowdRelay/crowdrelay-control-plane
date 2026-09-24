import { For, Show } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { capability } from '../lib/capabilities'
import { surface } from '../lib/surface'
import { authState } from '../lib/auth'
import { formatTimestamp } from '../lib/format'
import { Section } from './layout'
import { SectionIcon } from './SectionIcon'
import { Badge } from './app/badge'

// Operator machinery, one level in: do the apps agree about the same facts
// (reconciliation findings — a ticket CrowdRelay sold that the site never
// showed, a show the calendar lost), and are the builds that run the tenant
// the builds that were attested. Platform-level only; nothing here is a band
// decision. A drift or an open finding is named, never smoothed into "ok".

type EcosystemOverview = {
  open_findings: number
  last_reconciliation: { finished_at?: string | null; status?: string } | null
  flags: { key: string; enabled: boolean }[]
}

type Finding = {
  id: string
  severity: string
  kind: string
  entity_label: string | null
  summary: string
  suggested_action: string | null
  created_at: string
}

type ReleaseLedger = {
  missing_components: string[]
  backend_sha_drift: boolean
  executor_manifest_drift: boolean
  active_executor_count: number
  guarded_executor_count: number
  n8n_attestation_ready: boolean
  team_email_live: boolean
}

export function PlatformAgreementPanel(props: { slug: string }) {
  const enabled = () => authState.isPlatformLevel()
  const overview = useQuery(() => ({
    queryKey: ['surface', props.slug, 'ecosystem-overview'],
    queryFn: () => surface.read<EcosystemOverview>(props.slug, capability('ecosystem').read!.path),
    enabled: enabled(),
    staleTime: 60_000,
    retry: 1,
  }))
  const findings = useQuery(() => ({
    queryKey: ['surface', props.slug, 'ecosystem-findings'],
    queryFn: () => surface.read<Finding[]>(props.slug, capability('findings').read!.path, { open_only: 'true', limit: '20' }),
    enabled: enabled(),
    staleTime: 60_000,
    retry: 1,
  }))
  const ledger = useQuery(() => ({
    queryKey: ['surface', props.slug, 'release-ledger'],
    queryFn: () => surface.read<ReleaseLedger>(props.slug, capability('release-ledger').read!.path),
    enabled: enabled(),
    staleTime: 5 * 60_000,
    retry: 1,
  }))

  return (
    <Show when={enabled()}>
      <Section title="The apps agree" icon={<SectionIcon name="shield" />} description="Reconciliation between CrowdRelay, the site and the apps, and whether the running builds match what was attested.">
        <div class="space-y-3 text-sm">
          <Show when={!overview.error} fallback={<p class="text-muted-foreground">Couldn't check reconciliation.</p>}>
            <Show when={overview.data}>
              {o => (
                <p class="text-muted-foreground">
                  <strong class="text-foreground">{o().open_findings}</strong> open findings
                  {o().last_reconciliation?.finished_at ? ` · last reconciled ${formatTimestamp(o().last_reconciliation!.finished_at!)}` : ' · never reconciled'}
                </p>
              )}
            </Show>
          </Show>
          <Show when={!findings.error} fallback={<p class="text-muted-foreground">Couldn't list the findings.</p>}>
            <Show when={(findings.data ?? []).length > 0}>
              <ul class="space-y-1.5">
                <For each={findings.data!}>{f => (
                  <li class="rounded-md border border-border p-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <Badge variant={f.severity === 'critical' || f.severity === 'high' ? 'destructive' : 'warning'}>{f.severity}</Badge>
                      <span class="text-foreground">{f.summary}</span>
                    </div>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      {f.kind.replaceAll('_', ' ')}{f.entity_label ? ` · ${f.entity_label}` : ''} · {formatTimestamp(f.created_at)}
                      {f.suggested_action ? ` · ${f.suggested_action}` : ''}
                    </p>
                  </li>
                )}</For>
              </ul>
            </Show>
          </Show>
          <Show when={!ledger.error} fallback={<p class="text-muted-foreground">Couldn't check the release ledger.</p>}>
            <Show when={ledger.data}>
              {l => (
                <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span class="font-medium text-foreground">Software releases</span>
                  <Badge variant={l().backend_sha_drift ? 'destructive' : 'success'}>{l().backend_sha_drift ? 'backend drifted' : 'backend matches'}</Badge>
                  <Badge variant={l().executor_manifest_drift ? 'destructive' : 'success'}>{l().executor_manifest_drift ? 'executors drifted' : 'executors match'}</Badge>
                  <span>{l().active_executor_count} executors live{l().guarded_executor_count > 0 ? `, ${l().guarded_executor_count} held` : ''}</span>
                  <span>· n8n attestation {l().n8n_attestation_ready ? 'ready' : 'not ready'}</span>
                  <span>· team email {l().team_email_live ? 'live' : 'off'}</span>
                  <Show when={l().missing_components.length > 0}>
                    <span>· never reported: {l().missing_components.join(', ')}</span>
                  </Show>
                </div>
              )}
            </Show>
          </Show>
        </div>
      </Section>
    </Show>
  )
}
