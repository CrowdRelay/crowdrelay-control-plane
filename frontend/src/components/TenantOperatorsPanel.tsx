import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { errorMessage } from '../lib/format'
import { confirmAction } from './Dialog'
import { EmptyState } from './EmptyState'
import { SectionIcon } from './SectionIcon'
import { Spinner } from './Spinner'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Input } from './ui/input'

// Platform-admin-only management of a tenant's scoped operator accounts.
// Tenant operators never see this panel: the API rejects them anyway, and
// hiding it keeps their surface honest about what they can do.
export function TenantOperatorsPanel(props: { slug: string }) {
  const isAdmin = () => authState.isAdmin()
  const accounts = useQuery(() => ({
    queryKey: ['operators', props.slug],
    queryFn: () => api.operators(props.slug),
    enabled: isAdmin(),
    reconcile: 'id',
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  }))
  const queryClient = useQueryClient()
  const [username, setUsername] = createSignal('')
  const [password, setPassword] = createSignal('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['operators', props.slug] })

  const create = useMutation(() => ({
    mutationFn: () => api.createOperator(props.slug, username().trim(), password()),
    onSuccess: async (_, variables) => {
      await refresh()
      setUsername(''); setPassword('')
      void variables
    },
  }))
  const remove = useMutation(() => ({
    mutationFn: (id: string) => api.deleteOperator(props.slug, id),
    onSuccess: refresh,
  }))

  return <Show when={isAdmin()}><Card class="p-4">
    <div class="flex items-center justify-between gap-4 mt-6 mb-3"><div><h2 class="text-lg font-semibold text-foreground flex items-center gap-2"><SectionIcon name="users" />Operator accounts</h2></div><small>{accounts.data?.items.length ?? 0} account(s)</small></div>
    <p class="rounded-lg border border-border bg-surface-1 p-3 text-sm text-muted-foreground">These operators sign in with username + password and see only <strong>{props.slug}</strong>. The platform admin keeps full access via its separate credential.</p>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
      <label>
        <span>New operator username</span>
        <Input value={username()} onInput={(e) => setUsername(e.currentTarget.value.toLowerCase())} placeholder="stage-op" autocomplete="off" />
        <small>3–32 characters: lowercase letters, digits, <code>- _ .</code> — starting with a letter or digit. This is what they type to sign in and cannot be changed later.</small>
      </label>
      <label>
        <span>Password</span>
        <Input type="password" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} placeholder="min 12 characters" autocomplete="new-password" />
        <small>At least 12 characters. Hand it to the operator once — it is hashed with argon2id and never shown again. Losing it means creating a new account.</small>
      </label>
    </div>
    <div class="flex gap-2 mb-6"><Button size="sm" disabled={create.isPending || !/^[a-z0-9][a-z0-9-_.]{2,31}$/.test(username().trim()) || password().length < 12} onClick={() => create.mutate()}>{create.isPending && <Spinner />} {create.isPending ? 'Creating…' : 'Create operator'}</Button></div>
    <Show when={create.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{errorMessage(create.error, 'Operator creation failed')}</div></Show>
    <Show when={remove.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{errorMessage(remove.error, 'Operator removal failed')}</div></Show>
    <Show when={accounts.error}><div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">{errorMessage(accounts.error, 'Could not load operator accounts')}</div></Show>
    <Show when={(accounts.data?.items.length ?? 0) === 0 && !accounts.isPending && !accounts.error}>
      <div class="p-4 mt-2.5 rounded-lg border border-border bg-surface-1"><EmptyState label="No operator accounts yet" hint="Only the platform admin can reach this tenant right now. Create an account above to give the team its own scoped login." /></div>
    </Show>
    <div class="grid gap-2.5 mt-4"><For each={accounts.data?.items ?? []}>{account =>
      <div class="flex items-center justify-between gap-3 py-2.5 border-b border-border">
        <div class="grid gap-1"><strong>{account.username}</strong><small class="text-muted-foreground">{account.active ? 'active' : 'disabled'} · <Badge variant="muted">tenant_operator</Badge></small></div>
        <Button variant="destructive-ghost" size="sm" disabled={remove.isPending} onClick={async () => {
          const ok = await confirmAction({
            title: `Remove operator “${account.username}”?`,
            body: 'Their sessions stop working immediately.',
            confirmLabel: 'Remove operator',
            destructive: true,
          })
          if (ok) remove.mutate(account.id)
        }}>Remove</Button>
      </div>
    }</For></div>
  </Card></Show>
}
