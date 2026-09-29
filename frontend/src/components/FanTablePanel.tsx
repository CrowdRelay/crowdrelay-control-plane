import { For, Show, createMemo, createSignal } from 'solid-js'
import { FormDrawer } from './app/form-drawer'
import { SkeletonRows } from './Skeleton'
import { failureLine } from '../lib/errors'
import { useQuery } from '@tanstack/solid-query'
import { api } from '../lib/api'
import { humanizeToken } from '../lib/format'
import { authState } from '../lib/auth'
import type { FanCard, FanDetail, FanJourneyEntry } from '../lib/types'
import { FanDetailDrawer } from './FanDetailDrawer'
import { EmptyState } from './ui/empty-state'
import { Section } from './layout'
import { Badge } from './app/badge'
import { Button } from './app/button'
import { FileInput } from './ui/file-input'
import { Input } from './ui/input'
import { Field } from './ui/field'
import { NativeSelect } from './ui/native-select'
import { toast } from './app/toast'
import { writeGuard } from '../lib/read-only'
import { downloadTextFile, fansToCsv, parseFanCsv, type FanCsvParse } from '../lib/fan-csv'
import { whileIncomplete, hasDegradedSections } from '../lib/incomplete'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './app/table'
import { Download, SearchX, Upload, Users } from 'lucide-solid'

const fanStatusTone = (status: string): 'success' | 'warning' | 'destructive' | 'muted' =>
  status === 'active' ? 'success' :
  status === 'pending' ? 'warning' :
  status === 'unsubscribed' || status === 'suppressed' ? 'muted' :
  status === 'bounced' || status === 'invalid' ? 'destructive' : 'muted'

// Matches `MAX_LIST_LIMIT` on the upstream `/v1/control-plane/audience/fans`
// endpoint — the read model asks for the cap and this is how the panel knows
// a full-length answer is a truncated one.
const FAN_LIST_CAP = 100

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
    staleTime: 10_000,
    reconcile: 'id' as const,
    refetchOnWindowFocus: false,
    // Shares the key with AudiencePage — every observer of a shared key must
    // carry the same retry rule, or whoever mounts first decides for both.
    refetchInterval: whileIncomplete(hasDegradedSections),
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
        setImportError(`No rows in this file carry an external_id or an email, so there is nothing to ${authState.isPlatformLevel() ? 'ingest' : 'import'}.`)
      }
    } catch (err) {
      setParsed(null)
      setImportError(failureLine("Couldn't read that file", err))
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
      toast.success(authState.isPlatformLevel()
        ? `Sent ${result.entries.length.toLocaleString()} row${result.entries.length === 1 ? '' : 's'} to ingestion. Candidates land as pending double opt-in.`
        : `Imported ${result.entries.length.toLocaleString()} row${result.entries.length === 1 ? '' : 's'}. New fans land as pending until they confirm.`)
      closeImport()
      props.onImported?.()
    } catch (err) {
      setImportError(failureLine("Couldn't import the file", err))
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
      setDetailError(failureLine("Couldn't load the fan's details", err))
    } finally {
      setLoadingDetail(false)
    }
  }

  return <Section
    title="Fan list"
    count={filtered().length}
    // The upstream fan list is capped (100 rows); a full-length answer means
    // there may be more fans than are shown. Say so — a table that looks
    // complete but is not is worse than an honest cap.
    description={props.fans.length >= FAN_LIST_CAP ? `First ${FAN_LIST_CAP} fans. Search or export CSV to reach the rest.` : undefined}
  >
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
        fallback={<EmptyState icon={<Users />} label="No fans yet" hint={authState.isPlatformLevel() ? 'Fans appear here once a connected source completes its first ingestion.' : 'Fans appear here once a connected source completes its first import.'} />}
      >
        <EmptyState icon={<SearchX />} label={`Nothing matches “${search().trim()}”`} hint="Search covers name, email and locale." />
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
                <TableCell><Badge variant={fanStatusTone(fan.status)}>{humanizeToken(fan.status)}</Badge></TableCell>
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
      slug={props.slug}
      fan={selectedFan()}
      journey={journey()}
      loading={loadingDetail()}
      error={detailError()}
      onClose={() => setSelectedFan(null)}
      onRefresh={() => {
        const id = selectedFan()?.fan.id
        if (!id) return
        // Silent re-fetch — the drawer stays open and swaps the detail.
        void api.fanDetail(props.slug, id).then(setSelectedFan).catch(() => {})
      }}
    />

    <FormDrawer
      open={importing()}
      onOpenChange={open => { if (!open) closeImport() }}
      title="Import fans from CSV"
      description={authState.isPlatformLevel()
        ? 'Rows land in the chosen fanbase as candidates, pending double opt-in — the same path every other source takes. Nobody is marked active by an import, and an opt-out is never reversed by one.'
        : 'Rows land in the chosen fanbase as pending fans who still have to confirm — the same path every other source takes. Nobody is marked active by an import, and an opt-out is never reversed by one.'}
      submitLabel={parsed() ? `Import ${parsed()!.entries.length.toLocaleString()} row${parsed()!.entries.length === 1 ? '' : 's'}` : 'Import'}
      pendingLabel="Importing…"
      pending={sending()}
      error={importError()}
      validate={() => (parsed()?.entries.length ?? 0) === 0 ? 'Choose a CSV file with at least one usable row.' : undefined}
      onSubmit={() => void runImport()}
    >
      <div class="contents">
        <Field
          label="CSV file"
          hint="One header row. It needs an email or an external_id column; display_name and locale are used when present and everything else is ignored."
        >
          <FileInput
            writes
            accept=".csv,text/csv"
            class="not-sr-only block h-auto w-full border-0 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:bg-accent"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void readFile(file)
            }}
          />
        </Field>

        <Show when={parsed()}>{result => <>
          <div class="rounded-md border border-border bg-background p-3 text-sm">
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
              <summary class="cursor-pointer text-warning-foreground">{result().skipped.length} row{result().skipped.length === 1 ? '' : 's'} will not be imported</summary>
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
          hint={authState.isPlatformLevel() ? 'An ingest belongs to one fanbase, so its origin stays attributable afterwards.' : 'An import belongs to one fanbase, so its origin stays attributable afterwards.'}
        >
          <Show
            when={!fanbases.isPending}
            fallback={<SkeletonRows count={2} />}
          >
            <Show
              when={importable().length > 0}
              fallback={<p class="text-sm text-muted-foreground">No enabled fanbase yet — create one under the {authState.isPlatformLevel() ? 'Label portfolio' : 'Portfolio'} tab first, an import needs somewhere to land.</p>}
            >
              <NativeSelect
                required
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

      </div>
    </FormDrawer>
  </Section>
}

function DownloadIcon() {
  return (
    <Download size={14} aria-hidden="true" />
  )
}

function UploadIcon() {
  return (
    <Upload size={14} aria-hidden="true" />
  )
}
