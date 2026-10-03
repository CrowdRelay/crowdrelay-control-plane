import { For, Show, createSignal } from 'solid-js'
import { failureLine } from '../lib/errors'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import type { TenantSecret } from '../lib/types'
import { ErrorCard } from './layout'
import { confirmAction } from './Dialog'
import { SaveActions, SettingsRow, SettingsSection } from './ui/settings'
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
  const [errorText, setErrorText] = createSignal<string | null>(null)
  const [saved, setSaved] = createSignal(false)

  const secrets = useQuery(() => ({
    queryKey: ['tenant-secrets', props.slug],
    queryFn: () => api.tenantSecrets(props.slug),
    refetchOnWindowFocus: false,
    staleTime: 10_000,
  }))

  const current = (name: string): TenantSecret | undefined =>
    secrets.data?.secrets.find(s => s.name === name)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tenant-secrets', props.slug] })
  const pasted = () => SECRETS.filter(row => (drafts()[row.name]?.trim().length ?? 0) > 0)
  const blocked = () => {
    const bad = pasted().find(row => !looksRight(row.name, drafts()[row.name] ?? ''))
    return bad ? `${bad.label} should start with ${bad.prefixes.join(' or ')}.` : null
  }

  // Save sends every pasted key. The stored value never re-enters the page —
  // each draft is dropped as it lands and the row shows the masked hint the
  // server computed.
  const save = useMutation(() => ({
    mutationFn: async () => {
      setErrorText(null); setSaved(false)
      for (const row of pasted()) {
        await api.setTenantSecret(props.slug, row.name, drafts()[row.name]!.trim())
        setDrafts(current => {
          const next = { ...current }
          delete next[row.name]
          return next
        })
      }
    },
    onSuccess: () => { setSaved(true); void refresh() },
    onError: (error) => { setErrorText(failureLine("Couldn't save your changes", error)); void refresh() },
  }))

  // Removing a key stops checkout at once, so it asks first.
  const remove = useMutation(() => ({
    mutationFn: (name: string) => { setErrorText(null); return api.deleteTenantSecret(props.slug, name) },
    onSuccess: () => { void refresh() },
    onError: (error) => setErrorText(failureLine("Couldn't remove it", error)),
  }))
  const confirmRemove = async (name: string, label: string) => {
    const ok = await confirmAction({
      title: `Remove the ${label.toLowerCase()}?`,
      body: 'Checkout stops working until a new key is pasted.',
      confirmLabel: 'Remove key',
      destructive: true,
    })
    if (ok) remove.mutate(name)
  }

  return <SettingsSection
    title="Stripe"
    description={<>
      {authState.isPlatformLevel()
        ? 'The Stripe account this tenant sells tickets and merch through.'
        : 'The Stripe account your tickets and merch sell through.'}
      {' '}Write-only: a key is stored encrypted and shown as a masked hint — it can be replaced, never read back.
      Turn on Ticket sales under Brand and apps only once both are set.
    </>}
    actions={<SaveActions
      dirty={pasted().length > 0}
      pending={save.isPending}
      blocked={blocked()}
      saved={saved()}
      saveLabel="Save keys"
      onCancel={() => { setDrafts({}); setErrorText(null) }}
      onSave={() => save.mutate()}
    />}
  >
    <Show when={secrets.error}>
      <div class="py-4"><ErrorCard title="Couldn't check your Stripe keys" error={secrets.error} onRetry={() => void secrets.refetch()} /></div>
    </Show>
    <For each={SECRETS}>{row => (
      <SettingsRow
        for={`secret-${row.name}`}
        label={row.label}
        hint={row.band && !authState.isPlatformLevel() ? row.band : row.hint}
      >
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 text-sm">
            <Show when={current(row.name)} fallback={<Badge variant="warning">not set</Badge>}>{s => <>
              <Badge variant="secondary">{s().masked_hint}</Badge>
              <span class="text-xs text-muted-foreground">set {new Date(s().updated_at).toLocaleDateString()}</span>
              <Button size="sm" variant="destructive-ghost" class="ml-auto" writes disabled={remove.isPending} onClick={() => void confirmRemove(row.name, row.label)}>Remove</Button>
            </>}</Show>
          </div>
          <Input
            id={`secret-${row.name}`}
            type="password"
            autocomplete="off"
            value={drafts()[row.name] ?? ''}
            placeholder={current(row.name) ? 'Paste a new key to replace it' : row.placeholder}
            aria-invalid={(drafts()[row.name]?.trim().length ?? 0) > 0 && !looksRight(row.name, drafts()[row.name] ?? '')}
            onInput={e => { setSaved(false); setDrafts(current => ({ ...current, [row.name]: e.currentTarget.value })) }}
            {...writeGuard()}
          />
        </div>
      </SettingsRow>
    )}</For>
    <Show when={errorText()}>
      <div class="py-4"><ErrorCard>{errorText()}</ErrorCard></div>
    </Show>
  </SettingsSection>
}
