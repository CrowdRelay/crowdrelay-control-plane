import { For, Show, createSignal } from 'solid-js'
import { failureLine } from '../lib/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { TenantSecret } from '../lib/types'
import { SectionIcon } from './SectionIcon'
import { ErrorCard, Section } from './layout'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Input } from './ui/input'
import { writeGuard } from '../lib/read-only'

// The credential names the upstream store accepts. The list endpoint returns
// only secrets that are set, so the rows themselves are driven from here —
// an unset secret still needs its input rendered for the operator to fill.
const SECRETS: { name: string; label: string; placeholder: string; hint: string; band?: string; prefixes: string[] }[] = [
  {
    name: 'stripe_secret_key',
    label: 'Stripe secret key',
    placeholder: 'sk_live_…',
    hint: 'The key checkout charges cards with. Stripe dashboard → Developers → API keys → Secret key. Live keys start sk_live_; a restricted key (rk_) works too.',
    band: 'The key your checkout charges cards with. Stripe dashboard → Developers → API keys → Secret key. Live keys start sk_live_.',
    prefixes: ['sk_live_', 'sk_test_', 'rk_live_', 'rk_test_'],
  },
  {
    name: 'stripe_webhook_secret',
    label: 'Stripe webhook signing secret',
    placeholder: 'whsec_…',
    hint: 'Verifies that a payment confirmation really came from Stripe. Stripe dashboard → Developers → Webhooks → the endpoint → Signing secret. Starts whsec_.',
    prefixes: ['whsec_'],
  },
]

// Paste check that runs before the value crosses the wire — mirrors the
// upstream grammar so an obvious paste error is answered immediately instead
// of after a round trip.
function looksRight(name: string, value: string): boolean {
  const row = SECRETS.find(s => s.name === name)
  if (!row) return false
  const v = value.trim()
  return v.length >= 8 && v.length <= 200 && row.prefixes.some(prefix => v.startsWith(prefix))
}

export function TenantSecretsPanel(props: { slug: string }) {
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = createSignal<Record<string, string>>({})
  const [pendingName, setPendingName] = createSignal<string | null>(null)
  const [errorText, setErrorText] = createSignal<string | null>(null)
  const [savedName, setSavedName] = createSignal<string | null>(null)

  const secrets = useQuery(() => ({
    queryKey: ['tenant-secrets', props.slug],
    queryFn: () => api.tenantSecrets(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const current = (name: string): TenantSecret | undefined =>
    secrets.data?.secrets.find(s => s.name === name)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tenant-secrets', props.slug] })

  const save = useMutation(() => ({
    mutationFn: async (name: string) => {
      setPendingName(name); setErrorText(null); setSavedName(null)
      return api.setTenantSecret(props.slug, name, drafts()[name]?.trim() ?? '')
    },
    onSuccess: (_result, name) => {
      // The stored value never re-enters the page — the draft is dropped and
      // the row shows the masked hint the server just computed.
      setDrafts(current => {
        const next = { ...current }
        delete next[name]
        return next
      })
      setSavedName(name)
      setPendingName(null)
      refresh()
    },
    onError: (error) => {
      setPendingName(null)
      setErrorText(failureLine("Couldn't save your changes", error))
    },
  }))

  const remove = useMutation(() => ({
    mutationFn: async (name: string) => {
      setPendingName(name); setErrorText(null); setSavedName(null)
      return api.deleteTenantSecret(props.slug, name)
    },
    onSuccess: () => {
      setPendingName(null)
      refresh()
    },
    onError: (error) => {
      setPendingName(null)
      setErrorText(failureLine("Couldn't remove it", error))
    },
  }))

  return <Section
    title="Stripe keys"
    icon={<SectionIcon name="settings" />}
    description={<>
      {authState.isPlatformLevel()
        ? 'The Stripe account this tenant sells tickets and merch through.'
        : 'The Stripe account your tickets and merch sell through.'}
      {' '}Write-only: a key is stored encrypted and shown once as a masked hint — it can be replaced, never read back.
      Turn on <em>Ticket sales</em> above only once these are set.
    </>}
  >
    <Show when={secrets.error}>
      <ErrorCard title="Couldn't check your Stripe keys" error={secrets.error} onRetry={() => void secrets.refetch()} />
    </Show>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      <For each={SECRETS}>{row => (
        <div class="flex flex-col gap-1.5">
          <span class="text-sm text-foreground">
            {row.label}
            <Show when={current(row.name)}>{s => <>{' '}<Badge variant="secondary">{s().masked_hint}</Badge></>}</Show>
            <Show when={!current(row.name)}>{' '}<Badge variant="warning">not set</Badge></Show>
          </span>
          <Input
            type="password"
            autocomplete="off"
            value={drafts()[row.name] ?? ''}
            placeholder={current(row.name) ? 'Paste a new key to replace' : row.placeholder}
            onInput={e => setDrafts(current => ({ ...current, [row.name]: e.currentTarget.value }))}
            {...writeGuard()}
          />
          <small class="text-xs text-muted-foreground leading-relaxed">
            {row.band && !authState.isPlatformLevel() ? row.band : row.hint}
            <Show when={current(row.name)}>{s => <>{' '}Set {new Date(s().updated_at).toLocaleDateString()}.</>}</Show>
          </small>
          <div class="flex items-center gap-2 mt-1">
            <Show when={(drafts()[row.name]?.trim().length ?? 0) > 0}>
              <Button
                size="sm"
                writes
                disabled={pendingName() !== null || !looksRight(row.name, drafts()[row.name] ?? '')}
                title={looksRight(row.name, drafts()[row.name] ?? '') ? undefined : `Should start with ${row.prefixes.join(' or ')}`}
                onClick={() => save.mutate(row.name)}
              >
                {pendingName() === row.name ? 'Saving…' : current(row.name) ? 'Replace key' : 'Save key'}
              </Button>
            </Show>
            <Show when={current(row.name)}>
              <Button
                size="sm"
                variant="ghost"
                writes
                disabled={pendingName() !== null}
                onClick={() => remove.mutate(row.name)}
              >
                Remove
              </Button>
            </Show>
            <Show when={savedName() === row.name && !(drafts()[row.name]?.trim())}>
              <small class="text-xs text-muted-foreground">Saved ✓</small>
            </Show>
          </div>
        </div>
      )}</For>
    </div>
    <Show when={errorText()}>
      <ErrorCard>{errorText()}</ErrorCard>
    </Show>
  </Section>
}
