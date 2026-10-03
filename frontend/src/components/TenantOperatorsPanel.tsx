import { Show, createSignal } from 'solid-js'
import { FormDrawer } from './app/form-drawer'
import { Field } from './ui/field'
import { Users, Plus } from 'lucide-solid'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { authState } from '../lib/auth'
import { confirmAction } from './Dialog'
import { EmptyState } from './ui/empty-state'
import { ErrorCard } from './layout'
import { SettingsSection } from './ui/settings'
import { DataTable, type ColumnDef } from './app/data-table'
import { StatusBadge } from './StatusBadge'
import { Button } from './app/button'
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
  const [adding, setAdding] = createSignal(false)
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['operators', props.slug] })

  const create = useMutation(() => ({
    mutationFn: () => api.createOperator(props.slug, username().trim(), password()),
    onSuccess: async (_, variables) => {
      await refresh()
      setUsername(''); setPassword('')
      setAdding(false)
      void variables
    },
  }))
  const remove = useMutation(() => ({
    mutationFn: (id: string) => api.deleteOperator(props.slug, id),
    onSuccess: refresh,
  }))

  type Account = NonNullable<typeof accounts.data>['items'][number]
  const confirmRemove = async (account: Account) => {
    const ok = await confirmAction({
      title: `Remove operator “${account.username}”?`,
      body: 'Their sessions stop working immediately.',
      confirmLabel: 'Remove operator',
      destructive: true,
    })
    if (ok) remove.mutate(account.id)
  }
  const columns: ColumnDef<Account, any>[] = [
    { id: 'username', header: 'Username', accessorFn: a => a.username, cell: c => <strong class="font-medium text-foreground">{c.row.original.username}</strong> },
    { id: 'status', header: 'Status', accessorFn: a => (a.active ? 'active' : 'disabled'), cell: c => <StatusBadge status={c.row.original.active ? 'active' : 'disabled'} tone={c.row.original.active ? 'good' : 'muted'} /> },
    { id: 'role', header: 'Role', accessorFn: () => 'Tenant operator', cell: () => <span class="text-muted-foreground">Tenant operator</span> },
    {
      id: 'actions', header: '', enableSorting: false, enableHiding: false, meta: { class: 'text-right' },
      cell: c => <Button writes variant="destructive-ghost" size="sm" disabled={remove.isPending} onClick={() => void confirmRemove(c.row.original)}>Remove</Button>,
    },
  ]

  return <Show when={isAdmin()}><SettingsSection
    plain
    title="Operator accounts"
    description={<>These operators sign in with a username and password and see only <strong class="font-medium text-foreground">{props.slug}</strong>. The platform admin keeps full access through its own credential.</>}
    actions={<Button writes size="sm" onClick={() => { create.reset(); setAdding(true) }}><Plus aria-hidden="true" /> Add operator</Button>}
  >
    <FormDrawer
      open={adding()}
      onOpenChange={open => { setAdding(open); if (!open) { setUsername(''); setPassword('') } }}
      title="Add operator"
      description={<>They sign in with these details and see only <strong class="font-medium text-foreground">{props.slug}</strong>.</>}
      submitLabel="Create operator"
      pendingLabel="Creating…"
      pending={create.isPending}
      error={create.error}
      errorTitle="Couldn't create the operator"
      onSubmit={() => create.mutate()}
    >
      <Field label="Username" hint="3–32 characters: lowercase letters, digits, - _ . — starting with a letter or digit. It's what they type to sign in and can't be changed later.">
        <Input
          required pattern="[a-z0-9][a-z0-9\-_.]{2,31}" title="3–32 lowercase letters, digits, - _ or ., starting with a letter or digit."
          value={username()} onInput={(e) => setUsername(e.currentTarget.value.toLowerCase())}
          placeholder="stage-op" autocomplete="off" autocapitalize="none" spellcheck={false}
        />
      </Field>
      <Field label="Password" hint="At least 12 characters. Hand it to the operator once — it's never shown again. Losing it means creating a new account.">
        <Input required minLength={12} type="password" value={password()} onInput={(e) => setPassword(e.currentTarget.value)} autocomplete="new-password" />
      </Field>
    </FormDrawer>

    <Show when={remove.error}><ErrorCard class="mb-3" title="Couldn't remove the operator" error={remove.error} /></Show>
    <Show when={accounts.error}><ErrorCard class="mb-3" title="Couldn't load operator accounts" error={accounts.error} onRetry={() => void accounts.refetch()} /></Show>
    <Show when={(accounts.data?.items.length ?? 0) === 0 && !accounts.isPending && !accounts.error}>
      <EmptyState icon={<Users />} label="No operator accounts yet" hint="Only the platform admin can reach this tenant right now. Add an operator to give the team its own scoped login." />
    </Show>
    <Show when={(accounts.data?.items.length ?? 0) > 0}>
      <DataTable
        data={accounts.data?.items ?? []}
        columns={columns}
        getRowId={a => a.id}
        searchText={a => a.username}
        searchPlaceholder="Search operators"
        searchLabel="Search operators"
      />
    </Show>
  </SettingsSection></Show>
}
