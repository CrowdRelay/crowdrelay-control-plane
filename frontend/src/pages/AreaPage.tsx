import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { Checkbox as KobalteCheckbox } from '@kobalte/core/checkbox'
import { Check, RefreshCw } from 'lucide-solid'
import { api } from '../lib/api'
import { errorMessage, relativeTime } from '../lib/format'
import type { AreaCity, AreaDropDraft, AreaStatus, AreaValidationResult } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { LocationCanvas } from '../components/area/LocationCanvas'
import { EmptyState } from '../components/ui/empty-state'
import { SkeletonRows } from '../components/Skeleton'
import { confirmAction } from '../components/Dialog'
import { SectionIcon } from '../components/SectionIcon'
import { ErrorCard, KpiCard, KpiStrip, PageHeader, PageShell, Section, TabBar } from '../components/layout'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/app/table'
import { Button } from '../components/app/button'
import { Alert } from '../components/app/alert'
import { Input } from '../components/ui/input'

// Rich-label checkbox composes the Kobalte primitive (ui/checkbox's label
// prop is string-only); control styling mirrors ui/checkbox.tsx.
const checkboxControl =
  'peer mt-1 h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'data-[checked]:bg-primary data-[checked]:text-primary-foreground'
import { Textarea } from '../components/ui/textarea'
import { cn } from '../lib/cn'
import { NativeSelect } from '../components/ui/native-select'
import { Field } from '../components/ui/field'
import { readOnly } from '../lib/read-only'


const statusTone = (status: AreaStatus) => status === 'LIVE' ? 'good' : status === 'SCHEDULED' || status === 'DRAFT' ? 'warn' : status === 'ARCHIVED' ? 'muted' : status === 'PAUSED' ? 'bad' : 'muted'
const formatDate = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString() }
const toLocalInput = (value: string) => { const d = new Date(value); if (Number.isNaN(d.getTime())) return ''; const offset = d.getTimezoneOffset() * 60_000; return new Date(d.getTime() - offset).toISOString().slice(0,16) }
const fromLocalInput = (value: string, fallback: string) => { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? d.toISOString() : fallback }
const cloneDraft = (draft: AreaDropDraft): AreaDropDraft => JSON.parse(JSON.stringify(draft)) as AreaDropDraft
const slugPrefix = (slug: string) => (slug.normalize('NFKD').replace(/[^a-zA-Z]/g,'').toLowerCase().slice(0,3) || 'are').padEnd(3,'x')
const finiteInput = (value: string, fallback: number) => { const parsed = Number(value); return value.trim() !== '' && Number.isFinite(parsed) ? parsed : fallback }
const nullableInput = (value: string, fallback: number | null) => value.trim() === '' ? null : finiteInput(value, fallback ?? 0)

function defaultDraft(city: AreaCity, number: string): AreaDropDraft {
  const start = new Date(); start.setMinutes(0,0,0)
  const end = new Date(start); end.setDate(end.getDate() + 90)
  return {
    number, cityId: city.id, mapX: 50, mapY: 50,
    approximateLat: city.latitude ?? 0, approximateLng: city.longitude ?? 0,
    exactLat: null, exactLng: null, radiusMeters: 100, maxClaims: 25,
    startsAt: start.toISOString(), endsAt: end.toISOString(),
    clue: { en: '', pl: '' }, collectible: { line: '', track: '', edition: '', riddle: '' }, sortOrder: Number(number) || 0,
  }
}

export function AreaPage() {
  const params = useParams({ from: '/tenants/$slug/area' })
  const slug = () => params().slug
  const queryClient = useQueryClient()
  const overview = useQuery(() => ({ queryKey: ['area-overview', slug()], queryFn: () => api.areaOverview(slug()), refetchOnWindowFocus: false, reconcile: 'id', staleTime: 15_000 }))
  const drops = useQuery(() => ({ queryKey: ['area-drops', slug()], queryFn: () => api.areaDrops(slug()), refetchOnWindowFocus: false, reconcile: 'id', staleTime: 15_000 }))
  const tenant = useQuery(() => ({ queryKey: ['tenant', slug()], queryFn: () => api.tenant(slug()), refetchOnWindowFocus: false, staleTime: 30_000 }))
  const [selectedId, setSelectedId] = createSignal<string | null>(null)
  const [creating, setCreating] = createSignal(false)
  const [citySearch, setCitySearch] = createSignal('')
  const [newNumber, setNewNumber] = createSignal('001')
  const [newCityId, setNewCityId] = createSignal('')
  const [createCityOpen, setCreateCityOpen] = createSignal(false)
  const cities = useQuery(() => ({ queryKey: ['area-cities', slug(), citySearch()], queryFn: () => api.areaCities(slug(), citySearch(), 40), staleTime: 30_000, enabled: creating() || Boolean(selectedId()) || createCityOpen(), refetchOnWindowFocus: false }))
  const detail = useQuery(() => ({
    queryKey: ['area-drop', slug(), selectedId()],
    queryFn: () => api.areaDrop(slug(), selectedId()!),
    enabled: Boolean(selectedId()), staleTime: 5_000, gcTime: 0, refetchOnWindowFocus: false,
  }))
  const [draft, setDraft] = createSignal<AreaDropDraft | null>(null)
  const [validation, setValidation] = createSignal<AreaValidationResult | null>(null)
  const [confirmations, setConfirmations] = createSignal<string[]>([])
  const [editorStep, setEditorStep] = createSignal<'city'|'location'|'content'|'schedule'|'review'>('city')
  const [flash, setFlash] = createSignal('')
  const [newCity, setNewCity] = createSignal({ slug:'', name:'', countryCode:'', region:'', latitude:'', longitude:'' })
  const [duplicateOpen, setDuplicateOpen] = createSignal(false)
  const [duplicateCityId, setDuplicateCityId] = createSignal('')
  const [duplicateNumber, setDuplicateNumber] = createSignal('')

  createEffect(() => {
    const data = detail.data
    if (data) {
      setDraft(cloneDraft(data.draft ?? data.published))
      setValidation(null); setConfirmations([])
    }
  })
  createEffect(() => { if (tenant.data) setNewCity(v => ({ ...v, countryCode: v.countryCode || tenant.data!.defaultCountryCode })) })

  const refresh = async (id?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['area-overview', slug()] }),
      queryClient.invalidateQueries({ queryKey: ['area-drops', slug()] }),
      queryClient.invalidateQueries({ queryKey: ['tenant', slug()] }),
      id ? queryClient.invalidateQueries({ queryKey: ['area-drop', slug(), id] }) : Promise.resolve(),
    ])
  }
  const closeEditor = () => {
    const id = selectedId(); setSelectedId(null); setDraft(null); setValidation(null); setConfirmations([])
    if (id) queryClient.removeQueries({ queryKey: ['area-drop', slug(), id] })
  }
  const mutateDraft = (change: Partial<AreaDropDraft>) => setDraft(current => current ? ({ ...current, ...change }) : current)
  const mutateClue = (key:'en'|'pl', value:string) => setDraft(current => current ? ({...current, clue:{...current.clue,[key]:value}}) : current)
  const mutateCollectible = (key:'line'|'track'|'edition'|'riddle', value:string) => setDraft(current => current ? ({...current, collectible:{...current.collectible,[key]:value}}) : current)

  const settings = useMutation(() => ({ mutationFn: (enabled:boolean) => api.areaSettings(slug(), enabled), onSuccess: async () => { setFlash('AREA entitlement updated.'); await refresh() } }))
  const createDrop = useMutation(() => ({ mutationFn: async () => {
    const city = cities.data?.items.find(item => item.id === newCityId())
    if (!city) throw new Error('Choose a canonical city first.')
    if (city.latitude == null || city.longitude == null) throw new Error('The canonical city needs public coordinates before it can be used by AREA.')
    const rawNumber = newNumber().trim()
    if (!/^\d{1,3}$/.test(rawNumber)) throw new Error('Drop number must contain 1–3 digits.')
    const number = rawNumber.padStart(3,'0')
    const id = `${slugPrefix(city.slug)}-${number}`
    return api.areaCreateDrop(slug(), id, defaultDraft(city, number))
  }, onSuccess: async (item) => { setCreating(false); await refresh(item.summary.id); setSelectedId(item.summary.id); setEditorStep('location'); setFlash('Draft created. Exact location is still unset.') } }))
  const createCity = useMutation(() => ({ mutationFn: () => {
    const value = newCity()
    const latitude = Number(value.latitude)
    const longitude = Number(value.longitude)
    if (!value.slug.trim() || !value.name.trim() || !value.region.trim() || !/^[A-Za-z]{2}$/.test(value.countryCode.trim())) throw new Error('Name, slug, region and a two-letter country code are required.')
    if (!value.latitude.trim() || !value.longitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) throw new Error('Valid public latitude and longitude are required.')
    return api.areaCreateCity(slug(), {
      slug:value.slug.trim().toLowerCase(), name:value.name.trim(), countryCode:value.countryCode.trim().toUpperCase(), region:value.region.trim(), latitude, longitude,
    })
  }, onSuccess: async city => { await queryClient.invalidateQueries({queryKey:['area-cities',slug()]}); setNewCityId(city.id); setCreateCityOpen(false); setNewCity(value=>({...value,slug:'',name:'',region:'',latitude:'',longitude:''})); setFlash(`Canonical city ${city.name} created.`) } }))
  const save = useMutation(() => ({ mutationFn: () => {
    if (!selectedId() || !draft() || !detail.data) throw new Error('Editor is not ready.')
    return api.areaSaveDraft(slug(), selectedId()!, detail.data.summary.revision, draft()!)
  }, onSuccess: async item => { setDraft(cloneDraft(item.draft ?? item.published)); setValidation(null); await refresh(item.summary.id); setFlash('Draft saved. Live AREA is unchanged until Publish.') } }))
  const validate = useMutation(() => ({ mutationFn: async () => {
    if (!selectedId()) throw new Error('No drop selected.')
    if (draft()) await save.mutateAsync()
    return api.areaValidate(slug(), selectedId()!)
  }, onSuccess: result => { setValidation(result); setEditorStep('review') } }))
  const publish = useMutation(() => ({ mutationFn: async () => {
    if (!selectedId()) throw new Error('No drop selected.')
    return api.areaPublish(slug(), selectedId()!, confirmations())
  }, onSuccess: async item => { setValidation(null); setConfirmations([]); await refresh(item.summary.id); setFlash(item.summary.status === 'PAUSED' ? 'AREA revision published atomically. It remains paused until Resume.' : 'AREA revision published atomically.'); setDraft(cloneDraft(item.published)) } }))
  const lifecycle = useMutation(() => ({ mutationFn: async (action:'pause'|'resume'|'archive'|'delete') => {
    const id=selectedId(); if(!id) throw new Error('No drop selected.')
    if(action==='pause') return api.areaPause(slug(),id)
    if(action==='resume') return api.areaResume(slug(),id)
    if(action==='archive') return api.areaArchive(slug(),id)
    await api.areaDelete(slug(),id); return null
  }, onSuccess: async (item, action) => { const id=selectedId(); await refresh(id ?? undefined); if(action==='archive'||action==='delete') closeEditor(); else if(item) setDraft(cloneDraft(item.draft ?? item.published)); setFlash(`AREA drop ${action} completed.`) } }))
  const discard = useMutation(() => ({ mutationFn: async () => { if(!selectedId()) throw new Error('No drop selected.'); await api.areaDiscardDraft(slug(),selectedId()!) }, onSuccess: async () => { const id=selectedId()!; await refresh(id); setFlash('Draft discarded.'); } }))
  const duplicate = useMutation(() => ({ mutationFn: async () => {
    const sourceId = selectedId(); if (!sourceId) throw new Error('No source drop selected.')
    const city = cities.data?.items.find(item => item.id === duplicateCityId()); if (!city) throw new Error('Choose a destination city.')
    const rawNumber = duplicateNumber().trim(); if (!/^\d{1,3}$/.test(rawNumber)) throw new Error('Duplicate number must contain 1–3 digits.')
    const number = rawNumber.padStart(3,'0'); const newDropId = `${slugPrefix(city.slug)}-${number}`
    return api.areaDuplicate(slug(), sourceId, newDropId, city.id)
  }, onSuccess: async item => { setDuplicateOpen(false); setDuplicateCityId(''); setDuplicateNumber(''); await refresh(item.summary.id); setSelectedId(item.summary.id); setEditorStep('location'); setFlash('Draft duplicated without the exact claim location. Pick a new secret point before publishing.') } }))

  const selectedCity = createMemo(() => { const d=draft(); return d ? cities.data?.items.find(city=>city.id===d.cityId) : undefined })
  const allPending = createMemo(() => save.isPending || validate.isPending || publish.isPending || lifecycle.isPending || discard.isPending || duplicate.isPending)
  const mutationError = createMemo(() => [overview.error,drops.error,tenant.error,cities.error,detail.error,settings.error,createDrop.error,createCity.error,save.error,validate.error,publish.error,lifecycle.error,discard.error,duplicate.error].find(Boolean))
  const confirmationIssues = createMemo(() => validation()?.issues.filter(issue => issue.confirmationRequired) ?? [])
  const hardIssues = createMemo(() => validation()?.issues.filter(issue => !issue.confirmationRequired) ?? [])
  const toggleConfirmation = (code:string) => setConfirmations(current => current.includes(code) ? current.filter(item=>item!==code) : [...current,code])

  // "Updated 2m ago" has to keep moving while the page sits open.
  const [now, setNow] = createSignal(Date.now())
  const tick = setInterval(() => setNow(Date.now()), 15_000)
  onCleanup(() => clearInterval(tick))
  const updated = createMemo(() => {
    now()
    const ts = Math.max(overview.dataUpdatedAt, drops.dataUpdatedAt)
    return ts === 0 ? null : relativeTime(ts)
  })
  const refreshing = () => overview.isFetching || drops.isFetching

  return <PageShell>
    <PageHeader
      title="AREA"
      description="Draft, validate and publish the locations fans can claim a drop in. Exact claim coordinates never leave the private editor."
      actions={
        <>
          <Show when={updated()}><span class="text-sm text-muted-foreground">Updated {updated()}</span></Show>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing()} aria-label="Refresh">
            <RefreshCw class={cn(refreshing() && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
    />

    <Show when={flash()}><Alert tone="info" role="status">{flash()}</Alert></Show>
    <Show when={mutationError()}><ErrorCard>{errorMessage(mutationError(), 'AREA operation failed')}</ErrorCard></Show>

    <Show when={overview.data} fallback={
      <Show when={overview.isPending} fallback={<ErrorCard>{errorMessage(overview.error, 'AREA management is unavailable. This is not an empty game state.')} <Button variant="ghost" size="sm" onClick={()=>overview.refetch()}>Retry</Button></ErrorCard>}>
        <SkeletonRows count={4} />
      </Show>
    }>{o => <>
      {/* The same metric rail every page uses; these were six boxed cards. */}
      <KpiStrip min="8rem">
        <KpiCard label="Locations" value={o().total} />
        <KpiCard label="Live" value={o().live} tone={o().live > 0 ? 'good' : 'default'} />
        <KpiCard label="Total claims" value={o().totalClaims} />
        <KpiCard label="Scheduled" value={o().scheduled} />
        <KpiCard label="Drafts" value={o().drafts} />
        <KpiCard label="Paused or ended" value={o().paused + o().ended} />
      </KpiStrip>
      <Section
        flush
        title="Tenant AREA"
        icon={<SectionIcon name="map-pin" />}
        description="Turning AREA off hides the public game from fans. Drops, claims and audit history are kept, and come back exactly as they were when you turn it on again."
        action={<div class="flex items-center gap-2">
          <StatusBadge status={o().entitled ? 'on' : 'off'} tone={o().entitled ? 'good' : 'muted'} />
          <Button writes variant={o().entitled ? 'destructive-ghost' : 'default'} size="sm" disabled={settings.isPending} onClick={() => settings.mutate(!o().entitled)}>{o().entitled ? 'Turn AREA off' : 'Turn AREA on'}</Button>
        </div>}
      >
        {/* Two switches, one name. This page writes the control plane's, the
            tenant's own app reports the other, and they drift while a deploy
            is in flight. Saying which is which beats one badge that picks a
            side and leaves the operator wondering why the button disagrees. */}
        <Show when={o().entitled && !o().enabled}>
          <Alert tone="warning" role="status">AREA is on here, but this tenant's app is not running the game yet. It starts at its next deploy or sync.</Alert>
        </Show>
        <Show when={!o().entitled && o().enabled}>
          <Alert tone="warning" role="status">AREA is off here, but this tenant's app is still showing the game to fans. It stops at its next deploy or sync.</Alert>
        </Show>
        <Show when={o().entitled === o().enabled}>
          <p class="text-sm text-muted-foreground">{o().entitled ? 'The game is on and the tenant\'s app is running it.' : 'The game is off and hidden from fans.'}</p>
        </Show>
      </Section>
    </>}</Show>

    <Section
      title="Locations"
      icon={<SectionIcon name="map-pin" />}
      count={drops.data?.items.length}
      description="Every drop, published or drafted. Nothing is public until you publish it."
      action={<Button writes size="sm" disabled={!overview.data?.entitled} onClick={() => setCreating(v=>!v)}>{creating() ? 'Cancel' : 'New location'}</Button>}
    >
      <Show when={creating()}><div class="rounded-lg border border-border bg-background p-4 space-y-3">
        <Field label="Search city" hint="Type to filter the canonical list."><Input value={citySearch()} onInput={e=>setCitySearch(e.currentTarget.value)} placeholder="Wrocław" /></Field>
        <Field label="Canonical city" hint="Where the drop lives. Missing city? Create one below."><NativeSelect value={newCityId()} onChange={e=>setNewCityId(e.currentTarget.value)}><option value="">Choose…</option><For each={cities.data?.items ?? []}>{city=><option value={city.id}>{city.name}{city.region ? ` · ${city.region}` : ''} · {city.countryCode}</option>}</For></NativeSelect></Field>
        <Field label="Drop number" hint="1–3 digits, required. Padded to three for the id: 7 in Wrocław becomes wro-007."><Input inputmode="numeric" maxlength="3" value={newNumber()} onInput={e=>setNewNumber(e.currentTarget.value.replace(/\D/g,'').slice(0,3))}/></Field>
        {/* The button was enabled without a drop number and the mutation threw
            "Drop number must contain 1–3 digits" only after the click. Same
            rule, checked where the operator can still act on it. */}
        <div class="flex justify-end gap-2"><Button writes variant="ghost" size="sm" onClick={()=>setCreateCityOpen(v=>!v)}>Create custom city</Button><Button writes size="sm" disabled={createDrop.isPending || !newCityId() || !/^\d{1,3}$/.test(newNumber().trim())} onClick={()=>createDrop.mutate()}>Create draft</Button></div>
        <Show when={createCityOpen()}><div class="rounded-md border border-border bg-card p-3 space-y-3">
          <Field label="Name"><Input required value={newCity().name} onInput={e=>setNewCity(v=>({...v,name:e.currentTarget.value}))}/></Field>
          <Field label="Slug"><Input required value={newCity().slug} onInput={e=>setNewCity(v=>({...v,slug:e.currentTarget.value}))}/></Field>
          <Field label="Country"><Input required maxlength="2" value={newCity().countryCode} onInput={e=>setNewCity(v=>({...v,countryCode:e.currentTarget.value}))}/></Field>
          <Field label="Region"><Input required value={newCity().region} onInput={e=>setNewCity(v=>({...v,region:e.currentTarget.value}))}/></Field>
          <Field label="Public latitude"><Input required type="number" step="0.000001" value={newCity().latitude} onInput={e=>setNewCity(v=>({...v,latitude:e.currentTarget.value}))}/></Field>
          <Field label="Public longitude"><Input required type="number" step="0.000001" value={newCity().longitude} onInput={e=>setNewCity(v=>({...v,longitude:e.currentTarget.value}))}/></Field>
          <Button writes size="sm" disabled={createCity.isPending} onClick={()=>createCity.mutate()}>Save canonical city</Button>
        </div></Show>
      </div></Show>
      {/* Column headings over nothing are furniture, and they implied the
          rows were loading when the list was simply empty. */}
      <Show when={(drops.data?.items.length ?? 0) > 0}>
        <div class="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-16">#</TableHead>
                <TableHead>City</TableHead>
                <TableHead>Status</TableHead>
                <TableHead class="text-right">Claims</TableHead>
                <TableHead class="hidden md:table-cell">Window</TableHead>
                <TableHead class="w-16"><span class="sr-only">Edit</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <For each={drops.data?.items ?? []}>{item => (
                <TableRow class="cursor-pointer" onClick={()=>{setSelectedId(item.id);setEditorStep('city')}}>
                  <TableCell><code class="text-xs text-muted-foreground">{item.number}</code></TableCell>
                  <TableCell>
                    <strong class="text-foreground">{item.city}</strong>
                    <span class="ml-2 text-xs text-muted-foreground">rev {item.revision}{item.hasDraft ? ' · draft' : ''}</span>
                  </TableCell>
                  <TableCell><StatusBadge status={item.status} tone={statusTone(item.status)} /></TableCell>
                  <TableCell numeric>{item.claimCount} / {item.maxClaims}</TableCell>
                  <TableCell class="hidden text-xs text-muted-foreground md:table-cell">{formatDate(item.startsAt)} → {formatDate(item.endsAt)}</TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={e=>{e.stopPropagation();setSelectedId(item.id);setEditorStep('city')}}>Edit</Button></TableCell>
                </TableRow>
              )}</For>
            </TableBody>
          </Table>
        </div>
      </Show>
      <Show when={!drops.isPending && (drops.data?.items.length ?? 0)===0}><EmptyState label="No locations yet" hint="A location is a place fans can claim a drop in. Use New location to draft the first one. Nothing is public until you publish it." /></Show>
      <Show when={drops.isPending}><SkeletonRows count={3} /></Show>
    </Section>

    <Show when={selectedId()}><Section
      title={detail.data?.summary ? `${detail.data.summary.city} · #${detail.data.summary.number}` : 'Loading…'}
      icon={<SectionIcon name="map-pin" />}
      description="Private editor. The exact claim point is fetched for this drop only and never cached."
      action={<div class="flex items-center gap-2">
        <Show when={detail.data?.summary}>{summary => <StatusBadge status={summary().status} tone={statusTone(summary().status)} />}</Show>
        <Button variant="outline" size="sm" onClick={closeEditor}>Close and purge coordinates</Button>
      </div>}
    >
      <Show when={detail.data && draft()} fallback={<SkeletonRows count={4} />}>{_ready => <>
        <TabBar
          active={editorStep()}
          onChange={id => setEditorStep(id as typeof editorStep extends () => infer T ? T : never)}
          tabs={[
            { id: 'city', label: 'City' },
            { id: 'location', label: 'Location' },
            { id: 'content', label: 'Content' },
            { id: 'schedule', label: 'Schedule' },
            { id: 'review', label: 'Review' },
          ]}
        />

        {/* One fieldset instead of a `writes` prop on forty controls: a
            disabled fieldset disables every form control under it, which is
            exactly the rule for a read-only account. `display: contents` keeps
            the layout identical. The step nav stays outside it — moving
            between steps is reading, and a viewer must keep that. */}
        <fieldset class="contents" disabled={readOnly()}>

        <Show when={editorStep()==='city'}><p class="text-sm text-muted-foreground leading-relaxed mt-1">Which city this drop belongs to and where it sits in the list fans see. Nothing here is secret — the exact spot is set on the next step.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Search canonical city" hint="Filters the list below. Cities are shared across tenants; add one only if it is genuinely missing."><Input value={citySearch()} onInput={e=>setCitySearch(e.currentTarget.value)} placeholder={detail.data!.summary.city}/></Field>
          <Field label="Canonical city"><NativeSelect value={draft()!.cityId} onChange={e=>{const id=e.currentTarget.value;const city=cities.data?.items.find(c=>c.id===id);setDraft(d=>d?({...d,cityId:id,approximateLat:city?.latitude ?? d.approximateLat,approximateLng:city?.longitude ?? d.approximateLng}):d)}}><Show when={!(cities.data?.items ?? []).some(city=>city.id===draft()!.cityId)}><option value={draft()!.cityId}>{detail.data!.summary.city} · current</option></Show><For each={cities.data?.items ?? []}>{city=><option value={city.id}>{city.name} · {city.countryCode}</option>}</For></NativeSelect></Field>
          <Field label="Drop number" hint="Up to three digits. Fans see it as the drop's identity in the game, so it should not be reused within a city."><Input maxlength="3" value={draft()!.number} onInput={e=>mutateDraft({number:e.currentTarget.value.replace(/\D/g,'').slice(0,3)})}/></Field>
          <Field label="Sort order" hint="Position in the list. Lower comes first; ties fall back to the drop number."><Input type="number" value={draft()!.sortOrder} onInput={e=>mutateDraft({sortOrder:finiteInput(e.currentTarget.value,draft()!.sortOrder)})}/></Field>
          <Field label="Illustration X (advanced)" hint="Where the pin sits on the illustrated map, 0–100 left to right. Not a coordinate — it moves artwork, not the drop."><Input type="number" min="0" max="100" value={draft()!.mapX} onInput={e=>mutateDraft({mapX:finiteInput(e.currentTarget.value,draft()!.mapX)})}/></Field>
          <Field label="Illustration Y (advanced)" hint="Same, 0–100 top to bottom."><Input type="number" min="0" max="100" value={draft()!.mapY} onInput={e=>mutateDraft({mapY:finiteInput(e.currentTarget.value,draft()!.mapY)})}/></Field>
        </div></Show>

        <Show when={editorStep()==='location'}><div class="space-y-3">
          <Alert tone="warning"><strong>Secret location.</strong> The canvas below is rendered locally. It does not load map tiles or transmit exact coordinates to an external mapping provider.</Alert>
          <LocationCanvas publicLat={draft()!.approximateLat} publicLng={draft()!.approximateLng} exactLat={draft()!.exactLat} exactLng={draft()!.exactLng} radiusMeters={draft()!.radiusMeters} onPick={(lat,lng)=>mutateDraft({exactLat:lat,exactLng:lng})}/>
          <p class="text-sm text-muted-foreground leading-relaxed mt-1">Two coordinates, two audiences. The <strong>public</strong> pair is what the app shows everyone — keep it at neighbourhood level. The <strong>exact</strong> pair never leaves this editor; it is only used server-side to decide whether a fan standing there is close enough to claim. Click the canvas to set it.</p>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Public latitude" hint="Shown to fans. Round it — this is the hint, not the spot."><Input required type="number" step="0.000001" value={draft()!.approximateLat} onInput={e=>mutateDraft({approximateLat:finiteInput(e.currentTarget.value,draft()!.approximateLat)})}/></Field>
            <Field label="Public longitude" hint="Shown to fans, same rounding."><Input required type="number" step="0.000001" value={draft()!.approximateLng} onInput={e=>mutateDraft({approximateLng:finiteInput(e.currentTarget.value,draft()!.approximateLng)})}/></Field>
            <Field label="Exact latitude" hint="Never published. Leave blank and the drop cannot be claimed."><Input type="number" step="0.000001" value={draft()!.exactLat ?? ''} onInput={e=>mutateDraft({exactLat:nullableInput(e.currentTarget.value,draft()!.exactLat)})}/></Field>
            <Field label="Exact longitude" hint="Never published, set together with the latitude."><Input type="number" step="0.000001" value={draft()!.exactLng ?? ''} onInput={e=>mutateDraft({exactLng:nullableInput(e.currentTarget.value,draft()!.exactLng)})}/></Field>
            <Field label="Claim radius (m)" hint="How close a fan must be to the exact point, 25–500 m. Tight is harder in a dense city; wide forgives GPS drift indoors."><Input type="number" min="25" max="500" value={draft()!.radiusMeters} onInput={e=>mutateDraft({radiusMeters:finiteInput(e.currentTarget.value,draft()!.radiusMeters)})}/></Field>
          </div>
        </div></Show>

        <Show when={editorStep()==='content'}><div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Clue — Polski"><Textarea maxlength="2000" value={draft()!.clue.pl} onInput={e=>mutateClue('pl',e.currentTarget.value)}/></Field>
          <Field label="Clue — English"><Textarea maxlength="2000" value={draft()!.clue.en} onInput={e=>mutateClue('en',e.currentTarget.value)}/></Field>
          <Field label="Track"><Input maxlength="256" value={draft()!.collectible.track} onInput={e=>mutateCollectible('track',e.currentTarget.value)}/></Field>
          <Field label="Edition"><Input maxlength="256" value={draft()!.collectible.edition} onInput={e=>mutateCollectible('edition',e.currentTarget.value)}/></Field>
          <Field label="Collectible line"><Textarea maxlength="1000" value={draft()!.collectible.line} onInput={e=>mutateCollectible('line',e.currentTarget.value)}/></Field>
          <Field label="Riddle"><Input maxlength="256" value={draft()!.collectible.riddle} onInput={e=>mutateCollectible('riddle',e.currentTarget.value)}/></Field>
        </div></Show>

        <Show when={editorStep()==='schedule'}><div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Starts" hint={Intl.DateTimeFormat().resolvedOptions().timeZone || 'local timezone'}><Input required type="datetime-local" value={toLocalInput(draft()!.startsAt)} onInput={e=>mutateDraft({startsAt:fromLocalInput(e.currentTarget.value,draft()!.startsAt)})}/></Field>
          <Field label="Ends" hint={Intl.DateTimeFormat().resolvedOptions().timeZone || 'local timezone'}><Input required type="datetime-local" value={toLocalInput(draft()!.endsAt)} onInput={e=>mutateDraft({endsAt:fromLocalInput(e.currentTarget.value,draft()!.endsAt)})}/></Field>
          <Field label="Capacity"><Input type="number" min="1" max="500" value={draft()!.maxClaims} onInput={e=>mutateDraft({maxClaims:finiteInput(e.currentTarget.value,draft()!.maxClaims)})}/></Field>
        </div></Show>

        <Show when={editorStep()==='review'}><div class="space-y-3">
          <KpiStrip class="mb-0" min="9rem">
            <KpiCard label="City" value={<span class="text-sm">{selectedCity()?.name ?? detail.data!.summary.city}</span>} />
            <KpiCard label="Revision" value={<span class="text-sm">{detail.data!.summary.revision}</span>} />
            <KpiCard label="Exact location" value={<span class="text-sm">{draft()!.exactLat != null && draft()!.exactLng != null ? 'configured' : 'missing'}</span>} tone={draft()!.exactLat != null && draft()!.exactLng != null ? 'default' : 'warn'} />
            <KpiCard label="Radius / capacity" value={<span class="text-sm">{draft()!.radiusMeters} m · {draft()!.maxClaims}</span>} />
            <KpiCard label="Starts" value={<span class="text-sm">{formatDate(draft()!.startsAt)}</span>} />
            <KpiCard label="Ends" value={<span class="text-sm">{formatDate(draft()!.endsAt)}</span>} />
          </KpiStrip>
          <Show when={validation()}>{_v=><>
            <Show when={hardIssues().length===0}><Alert tone="success" role="status">No blocking validation errors.</Alert></Show>
            <For each={hardIssues()}>{issue=><ErrorCard><strong>{issue.code}</strong><p>{issue.message}</p></ErrorCard>}</For>
            <For each={confirmationIssues()}>{issue=><KobalteCheckbox class="flex items-start gap-3 cursor-pointer p-3 rounded-md border border-border bg-background" checked={confirmations().includes(issue.code)} onChange={()=>toggleConfirmation(issue.code)}><KobalteCheckbox.Input class="sr-only" /><KobalteCheckbox.Control class={checkboxControl}><KobalteCheckbox.Indicator class="flex items-center justify-center text-current"><Check class="h-3.5 w-3.5" /></KobalteCheckbox.Indicator></KobalteCheckbox.Control><span><strong class="text-sm text-foreground">{issue.code}</strong><small class="block text-xs text-muted-foreground">{issue.message}</small></span></KobalteCheckbox>}</For>
          </>}</Show>
          <div class="flex justify-end gap-2"><Button variant="outline" size="sm" disabled={validate.isPending||save.isPending} onClick={()=>validate.mutate()}>Save and validate</Button><Button size="sm" disabled={!validation()?.valid || confirmationIssues().some(issue=>!confirmations().includes(issue.code)) || publish.isPending} onClick={()=>publish.mutate()}>Publish revision</Button></div>
        </div></Show>

        <Show when={duplicateOpen()}><div class="rounded-lg border border-border bg-background p-4 space-y-3">
          <strong class="text-sm text-foreground">Duplicate as a new draft</strong><p class="text-sm text-muted-foreground">The collectible/content is copied, but the exact claim coordinates are deliberately cleared.</p>
          <Field label="Search destination city"><Input value={citySearch()} onInput={e=>setCitySearch(e.currentTarget.value)} placeholder="Search canonical cities"/></Field>
          <Field label="Destination city"><NativeSelect value={duplicateCityId()} onChange={e=>setDuplicateCityId(e.currentTarget.value)}><option value="">Choose…</option><For each={cities.data?.items ?? []}>{city=><option value={city.id}>{city.name}{city.region ? ` · ${city.region}` : ''}</option>}</For></NativeSelect></Field>
          <Field label="New number"><Input inputmode="numeric" maxlength="3" value={duplicateNumber()} onInput={e=>setDuplicateNumber(e.currentTarget.value.replace(/\D/g,'').slice(0,3))}/></Field>
          <div class="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={()=>setDuplicateOpen(false)}>Cancel</Button><Button size="sm" disabled={duplicate.isPending || !duplicateCityId() || !duplicateNumber()} onClick={()=>duplicate.mutate()}>Create duplicate draft</Button></div>
        </div></Show>

        <div class="flex items-center justify-between gap-2 flex-wrap pt-4 border-t border-border">
          <div class="flex gap-2"><Button variant="ghost" size="sm" disabled={allPending()} onClick={()=>save.mutate()}>Save draft</Button><Show when={detail.data!.summary.hasDraft && detail.data!.summary.status!=='DRAFT'}><Button variant="ghost" size="sm" disabled={discard.isPending} onClick={()=>discard.mutate()}>Discard draft</Button></Show><Show when={detail.data!.summary.status!=='DRAFT' && detail.data!.summary.status!=='ARCHIVED'}><Button variant="ghost" size="sm" disabled={allPending()} onClick={()=>setDuplicateOpen(v=>!v)}>Duplicate</Button></Show></div>
          <div class="flex gap-2"><Show when={detail.data!.summary.status==='LIVE'||detail.data!.summary.status==='SCHEDULED'}><Button variant="destructive-ghost" size="sm" disabled={allPending()} onClick={()=>lifecycle.mutate('pause')}>Pause</Button></Show><Show when={detail.data!.summary.status==='PAUSED'}><Button variant="ghost" size="sm" disabled={allPending()} onClick={()=>lifecycle.mutate('resume')}>Resume</Button></Show><Show when={detail.data!.summary.status!=='ARCHIVED' && detail.data!.summary.status!=='DRAFT'}><Button variant="destructive-ghost" size="sm" disabled={allPending()} onClick={async()=>{
            const ok = await confirmAction({
              title: 'Archive this AREA location?',
              body: 'Claims and history are preserved. The location stops accepting new claims.',
              confirmLabel: 'Archive location',
              destructive: true,
            })
            if (ok) lifecycle.mutate('archive')
          }}>Archive</Button></Show><Show when={detail.data!.summary.status==='DRAFT'}><Button variant="destructive-ghost" size="sm" disabled={allPending()} onClick={async()=>{
            const ok = await confirmAction({
              title: 'Delete this never-published draft?',
              body: 'The draft has never been live, so nothing downstream is affected. This cannot be undone.',
              confirmLabel: 'Delete draft',
              destructive: true,
            })
            if (ok) lifecycle.mutate('delete')
          }}>Delete draft</Button></Show></div>
        </div>
        </fieldset>
      </>}</Show>
    </Section></Show>
  </PageShell>
}
