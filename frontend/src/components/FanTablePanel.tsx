import { For, Show, createMemo, createSignal } from 'solid-js'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import type { FanCard, FanDetail, FanJourneyEntry } from '../lib/types'
import { FanDetailDrawer } from './FanDetailDrawer'
import { EmptyState } from './ui/empty-state'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Field } from './ui/field'
import { NativeSelect } from './ui/native-select'
import { Dialog } from './Dialog'
import { Spinner } from './Spinner'
import { toast } from './ui/toast'
import { writeGuard } from '../lib/read-only'
import { downloadTextFile, fansToCsv, parseFanCsv, type FanCsvParse } from '../lib/fan-csv'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'

const fanStatusTone = (status: string): 'success' | 'warning' | 'destructive' | 'muted' =>
  status === 'active' ? 'success' :
  status === 'pending' ? 'warning' :
  status === 'unsubscribed' || status === 'suppressed' ? 'muted' :
  status === 'bounced' || status === 'invalid' ? 'destructive' : 'muted'

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export function FanTablePanel(props: {
  slug: string
  fans: FanCard[]
  /** Re-read the audience once an import has been accepted. */
  onImported?: () => void
}) {
  const [search, setSearch] = createSignal('')
  const [selectedFan, setSelectedFan] = createSignal<FanDetail | null>(null)
  const [journey, setJourney] = createSignal<FanJourneyEntry[]>([])
  const [loadingDetail, setLoadingDetail] = createSignal(false)
  const [detailError, setDetailError] = createSignal<string | null>(null)

  // ── CSV in and out ────────────────────────────────────────────────────
  const [importing, setImporting] = createSignal(false)
  const [parsed, setParsed] = createSignal<FanCsvParse | null>(null)
  const [fileName, setFileName] = createSignal('')
  const [targetFanbase, setTargetFanbase] = createSignal('')
  const [importError, setImportError] = createSignal<string | null>(null)
  const [sending, setSending] = createSignal(false)

  // An import has to land in a fanbase — that is what `ingest` keys on — and
  // the audience read model does not carry them, so the picker reads the
  // portfolio. Only fetched once the dialog opens: a list of fanbases is not
  // worth a request on a page about fans.
  const fanbases = useQuery(() => ({
    queryKey: ['tenant-portfolio', props.slug],
    queryFn: () => api.tenantPortfolio(props.slug),
    enabled: importing(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  }))

  const importable = createMemo(() =>
    (fanbases.data?.fanbases?.fanbases ?? []).filter(fb => fb.enabled),
  )

  const exportCsv = () => {
    const rows = filtered()
    if (rows.length === 0) return
    const stamp = new Date().toISOString().slice(0, 10)
    const scope = search().trim() ? 'filtered' : 'all'
    downloadTextFile(`${props.slug}-fans-${scope}-${stamp}.csv`, fansToCsv(rows))
    toast.success(`Exported ${rows.length.toLocaleString()} fan${rows.length === 1 ? '' : 's'}.`)
  }

  const readFile = async (file: File) => {
    setImportError(null)
    setFileName(file.name)
    try {
      const result = parseFanCsv(await file.text())
      setParsed(result)
      if (result.entries.length === 0) {
        setImportError('No rows in this file carry an external_id or an email, so there is nothing to ingest.')
      }
    } catch (err) {
      setParsed(null)
      setImportError(err instanceof Error ? err.message : 'Could not read that file')
    }
  }

  const runImport = async () => {
    const result = parsed()
    const fanbaseId = targetFanbase()
    if (!result || result.entries.length === 0 || !fanbaseId || sending()) return
    setSending(true)
    setImportError(null)
    try {
      await api.ingestFanbase(props.slug, fanbaseId, result.entries)
      toast.success(`Sent ${result.entries.length.toLocaleString()} row${result.entries.length === 1 ? '' : 's'} to ingestion. Candidates land as pending double opt-in.`)
      closeImport()
      props.onImported?.()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Ingestion failed')
    } finally {
      setSending(false)
    }
  }

  const closeImport = () => {
    setImporting(false)
    setParsed(null)
    setFileName('')
    setTargetFanbase('')
    setImportError(null)
  }

  const filtered = () => {
    const q = search().trim().toLowerCase()
    if (!q) return props.fans
    return props.fans.filter(f => {
      const name = (f.display_name ?? '').toLowerCase()
      const email = (f.email ?? '').toLowerCase()
      const locale = (f.locale ?? '').toLowerCase()
      return name.includes(q) || email.includes(q) || locale.includes(q)
    })
  }

  const openFan = async (fan: FanCard) => {
    setSelectedFan(null)
    setJourney([])
    setDetailError(null)
    setLoadingDetail(true)
    try {
      const [detail, journeyData] = await Promise.all([
        api.fanDetail(props.slug, fan.id),
        api.fanJourney(props.slug, fan.id),
      ])
      setSelectedFan(detail)
      setJourney(journeyData)
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load fan detail')
    } finally {
      setLoadingDetail(false)
    }
  }

  return <Card flat class="p-4">
    <div class="flex items-center justify-between gap-4">
      <h3>Fan list</h3>
      <span class="text-muted-foreground">{filtered().length} fans</span>
    </div>
    {/* The search box owned this row on its own. The two CSV controls sit
        beside it as ghosts rather than as buttons: moving the list in or out
        is occasional work, and it should not outrank the fan you came to
        find. They wrap under the search field on a phone. */}
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <Input
        class="min-w-0 flex-1 basis-56"
        type="search"
        placeholder="Search by name, email, or locale…"
        value={search()}
        onInput={(e) => setSearch(e.currentTarget.value)}
        aria-label="Search fans"
      />
      <div class="flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={exportCsv}
          disabled={filtered().length === 0}
          title={search().trim()
            ? `Download the ${filtered().length} fans matching this search as CSV`
            : 'Download every fan in this list as CSV'}
        >
          <DownloadIcon /> Export CSV
        </Button>
        <Button writes variant="ghost" size="sm" onClick={() => setImporting(true)}>
          <UploadIcon /> Import CSV
        </Button>
      </div>
    </div>
    {/* An empty search box matching nothing is not a search result, it is an
        empty fanbase — and telling the operator to adjust a query they never
        typed sends them to fix the wrong thing. */}
    <Show when={filtered().length > 0} fallback={
      <Show
        when={search().trim()}
        fallback={<EmptyState label="No fans yet" hint="Fans appear here once a connected source completes its first ingestion." />}
      >
        <EmptyState label={`Nothing matches “${search().trim()}”`} hint="Search covers name, email and locale." />
      </Show>
    }>
      {/* The height cap belongs on the table's own wrapper. Here it created a
          second scroll container around one that already scrolled, so the
          sticky header resolved against the inner wrapper and never stuck. */}
      <div class="border border-border rounded-md">
        <Table maxHeight="600px">
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Activation</TableHead>
              <TableHead>Referrals</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <For each={filtered().slice(0, 100)}>{(fan) => (
              <TableRow class="cursor-pointer" onClick={() => openFan(fan)}>
                <TableCell>{fan.display_name ?? '—'}</TableCell>
                <TableCell class="text-muted-foreground">{fan.email}</TableCell>
                <TableCell><Badge variant={fanStatusTone(fan.status)}>{fan.status}</Badge></TableCell>
                <TableCell><span class="text-muted-foreground">{fan.activation_state}</span></TableCell>
                <TableCell numeric>{fan.qualified_referrals}</TableCell>
                <TableCell class="text-muted-foreground">{formatDate(fan.created_at)}</TableCell>
              </TableRow>
            )}</For>
          </TableBody>
        </Table>
      </div>
    </Show>
    <FanDetailDrawer
      fan={selectedFan()}
      journey={journey()}
      loading={loadingDetail()}
      error={detailError()}
      onClose={() => setSelectedFan(null)}
    />

    <Dialog
      open={importing()}
      onClose={closeImport}
      label="Import fans from CSV"
      description="Rows land in the chosen fanbase as candidates, pending double opt-in — the same path every other source takes. Nobody is marked active by an import, and an opt-out is never reversed by one."
      footer={<>
        <Button variant="ghost" onClick={closeImport}>Cancel</Button>
        <Button
          writes
          onClick={() => void runImport()}
          disabled={sending() || !targetFanbase() || (parsed()?.entries.length ?? 0) === 0}
        >
          <Show when={sending()}><Spinner /></Show>
          {parsed() ? `Import ${parsed()!.entries.length.toLocaleString()} row${parsed()!.entries.length === 1 ? '' : 's'}` : 'Import'}
        </Button>
      </>}
    >
      <div class="flex flex-col gap-4">
        <Field
          label="CSV file"
          hint="One header row. It needs an email or an external_id column; display_name and locale are used when present and everything else is ignored."
        >
          <input
            type="file"
            accept=".csv,text/csv"
            class="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-3 file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-surface-4"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void readFile(file)
            }}
            {...writeGuard()}
          />
        </Field>

        <Show when={parsed()}>{result => <>
          <div class="rounded-md border border-border bg-surface-1 p-3 text-sm">
            <strong class="block text-foreground">{fileName()}</strong>
            <span class="mt-0.5 block text-muted-foreground">
              {result().entries.length.toLocaleString()} row{result().entries.length === 1 ? '' : 's'} ready
              <Show when={result().skipped.length > 0}>{' · '}{result().skipped.length} skipped</Show>
            </span>
            <Show when={result().ignoredColumns.length > 0}>
              <span class="mt-1 block text-xs text-muted-foreground">Columns ignored: {result().ignoredColumns.join(', ')}</span>
            </Show>
          </div>

          {/* Named rather than counted. A skipped row the operator cannot
              locate is a row they will not fix. */}
          <Show when={result().skipped.length > 0}>
            <details class="text-sm">
              <summary class="cursor-pointer text-warning">{result().skipped.length} row{result().skipped.length === 1 ? '' : 's'} will not be imported</summary>
              <ul class="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                <For each={result().skipped.slice(0, 20)}>{item => <li>Line {item.row}: {item.reason}</li>}</For>
                <Show when={result().skipped.length > 20}>
                  <li>…and {result().skipped.length - 20} more.</li>
                </Show>
              </ul>
            </details>
          </Show>
        </>}</Show>

        <Field
          label="Into which fanbase"
          hint="An ingest belongs to one fanbase, so its origin stays attributable afterwards."
        >
          <Show
            when={!fanbases.isPending}
            fallback={<p class="text-sm text-muted-foreground">Loading fanbases…</p>}
          >
            <Show
              when={importable().length > 0}
              fallback={<p class="text-sm text-muted-foreground">This tenant has no enabled fanbase yet. Create one on the Portfolio page first — an import needs somewhere to land.</p>}
            >
              <NativeSelect
                value={targetFanbase()}
                onChange={event => setTargetFanbase(event.currentTarget.value)}
                {...writeGuard()}
              >
                <option value="">Choose a fanbase…</option>
                <For each={importable()}>{fb => <option value={fb.id}>{fb.name}</option>}</For>
              </NativeSelect>
            </Show>
          </Show>
        </Field>

        <Show when={importError()}>{message =>
          <div class="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">{message()}</div>
        }</Show>
      </div>
    </Dialog>
  </Card>
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  )
}
