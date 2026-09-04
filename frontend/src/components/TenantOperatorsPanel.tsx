import { For, Show, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { errorMessage } from '../lib/format'
import { confirmAction } from './Dialog'
import { EmptyState } from './EmptyState'
import { SectionIcon } from './SectionIcon'
import { Spinner } from './Spinner'

// Platform-admin-only management of a tenant's scoped operator accounts.
// Tenant operators never see this panel: the API rejects them anyway, and
// hiding it keeps their surface honest about what they can do.
export function TenantOperatorsPanel(props: { slug: string }) {
  const isAdmin = () => authState.profile()?.role === 'platform_admin'
  const accounts = useQuery(() => ({
    queryKey: ['operators', props.slug],
    queryFn: () => api.operators(props.slug),
    enabled: isAdmin(),
    reconcile: 'id',
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

  return <Show when={isAdmin()}><article class="panel">
    <div class="section-title"><div><span class="eyebrow">TEAM ACCESS</span><h2><SectionIcon name="users" />Operator accounts</h2></div><small>{accounts.data?.items.length ?? 0} account(s)</small></div>
    <p class="route-note">These operators sign in with username + password and see only <strong>{props.slug}</strong>. The platform admin keeps full access via its separate credential.</p>
    <div class="form-grid">
      <label>
        <span>New operator username</span>
        <input value={username()} onInput={(e) => setUsername(e.currentTarget.value.toLowerCase())} placeholder="stage-op" autocomplete="off" />
        <small>3–32 characters: lowercase letters, digits, <code>- _ .</code> — starting with a letter or digit. This is what they type to sign in and cannot be changed later.</small>
      </label>
      <label>
        <span>Password</span>
        <input type="password" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} placeholder="min 12 characters" autocomplete="new-password" />
        <small>At least 12 characters. Hand it to the operator once — it is hashed with argon2id and never shown again. Losing it means creating a new account.</small>
      </label>
    </div>
    <div class="form-actions"><button disabled={create.isPending || !/^[a-z0-9][a-z0-9-_.]{2,31}$/.test(username().trim()) || password().length < 12} onClick={() => create.mutate()}>{create.isPending && <Spinner />} {create.isPending ? 'Creating…' : 'Create operator'}</button></div>
    <Show when={create.error}><div class="error-card" role="alert">{errorMessage(create.error, 'Operator creation failed')}</div></Show>
    <Show when={remove.error}><div class="error-card" role="alert">{errorMessage(remove.error, 'Operator removal failed')}</div></Show>
    <Show when={(accounts.data?.items.length ?? 0) === 0 && !accounts.isPending}>
      <div class="inherit-card"><EmptyState label="No operator accounts yet" hint="Only the platform admin can reach this tenant right now. Create an account above to give the team its own scoped login." /></div>
    </Show>
    <div class="notifier-list"><For each={accounts.data?.items ?? []}>{account =>
      <div class="notifier-row">
        <div class="notifier-meta"><strong>{account.username}</strong><small>{account.active ? 'active' : 'disabled'} · tenant_operator</small></div>
        <button type="button" class="danger-ghost" disabled={remove.isPending} onClick={async () => {
          const ok = await confirmAction({
            title: `Remove operator “${account.username}”?`,
            body: 'Their sessions stop working immediately.',
            confirmLabel: 'Remove operator',
            destructive: true,
          })
          if (ok) remove.mutate(account.id)
        }}>Remove</button>
      </div>
    }</For></div>
  </article></Show>
}
