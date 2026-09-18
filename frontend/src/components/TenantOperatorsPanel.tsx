import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { errorMessage } from '../lib/format'
import { confirmAction } from './Dialog'
import { EmptyState } from './ui/empty-state'
import { SectionIcon } from './SectionIcon'
import { Section, ErrorCard } from './layout'
import { Spinner } from './Spinner'
import { Button } from './app/button'
import { Badge } from './app/badge'
import { Input } from './ui/input'
import { writeGuard } from '../lib/read-only'

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

  {/* A card holding a boxed form and a boxed empty state and boxed rows —
      three levels of border for one list. It is a section now. */}
  return <Show when={isAdmin()}><Section
    flush
    title="Operator accounts"
    icon={<SectionIcon name="users" />}
    count={accounts.data?.items.length}
    description={<>These operators sign in with a username and password and see only <strong class="font-medium text-foreground">{props.slug}</strong>. The platform admin keeps full access through its own credential.</>}
  >
    <div class="rounded-lg border border-border p-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="grid gap-1.5">
        <span class="text-sm font-medium text-foreground">New operator username</span>
        <Input value={username()} onInput={(e) => setUsername(e.currentTarget.value.toLowerCase())} placeholder="stage-op" autocomplete="off" {...writeGuard()} />
        <small class="text-xs text-muted-foreground">3–32 characters: lowercase letters, digits, <code>- _ .</code> — starting with a letter or digit. This is what they type to sign in and cannot be changed later.</small>
      </label>
      <label class="grid gap-1.5">
        <span class="text-sm font-medium text-foreground">Password</span>
        <Input type="password" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} placeholder="min 12 characters" autocomplete="new-password" {...writeGuard()} />
        <small class="text-xs text-muted-foreground">At least 12 characters. Hand it to the operator once — it is never shown again. Losing it means creating a new account.</small>
      </label>
      </div>
      <div class="flex justify-end mt-3"><Button writes size="sm" disabled={create.isPending || !/^[a-z0-9][a-z0-9-_.]{2,31}$/.test(username().trim()) || password().length < 12} onClick={() => create.mutate()}>{create.isPending && <Spinner />} {create.isPending ? 'Creating…' : 'Create operator'}</Button></div>
    </div>

    <Show when={create.error}><ErrorCard class="mt-3">{errorMessage(create.error, 'Operator creation failed')}</ErrorCard></Show>
    <Show when={remove.error}><ErrorCard class="mt-3">{errorMessage(remove.error, 'Operator removal failed')}</ErrorCard></Show>
    <Show when={accounts.error}><ErrorCard class="mt-3">{errorMessage(accounts.error, 'Could not load operator accounts')}</ErrorCard></Show>
    <Show when={(accounts.data?.items.length ?? 0) === 0 && !accounts.isPending && !accounts.error}>
      <EmptyState label="No operator accounts yet" hint="Only the platform admin can reach this tenant right now. Create an account above to give the team its own scoped login." />
    </Show>
    <Show when={(accounts.data?.items.length ?? 0) > 0}>
    <ul class="mt-4 divide-y divide-border rounded-lg border border-border"><For each={accounts.data?.items ?? []}>{account =>
      <li class="flex items-center justify-between gap-3 px-4 py-2.5">
        <div class="grid gap-1"><strong class="text-sm text-foreground">{account.username}</strong><small class="text-xs text-muted-foreground">{account.active ? 'active' : 'disabled'} · <Badge variant="muted">tenant_operator</Badge></small></div>
        <Button writes variant="destructive-ghost" size="sm" disabled={remove.isPending} onClick={async () => {
          const ok = await confirmAction({
            title: `Remove operator “${account.username}”?`,
            body: 'Their sessions stop working immediately.',
            confirmLabel: 'Remove operator',
            destructive: true,
          })
          if (ok) remove.mutate(account.id)
        }}>Remove</Button>
      </li>
    }</For></ul>
    </Show>
  </Section></Show>
}
