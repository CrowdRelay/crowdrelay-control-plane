import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/solid-query'
import { useParams } from '@tanstack/solid-router'
import { ApiError, api } from '../lib/api'
import { refreshTick } from '../lib/refresh'
import type { AreaCity, AreaDropDraft, AreaStatus, AreaValidationResult } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { LocationCanvas } from '../components/area/LocationCanvas'
import { EmptyState } from '../components/EmptyState'

const statusTone = (status: AreaStatus) => status === 'LIVE' ? 'good' : status === 'SCHEDULED' || status === 'DRAFT' ? 'warn' : status === 'ARCHIVED' ? 'muted' : status === 'PAUSED' ? 'bad' : 'muted'
const formatDate = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString() }
const toLocalInput = (value: string) => { const d = new Date(value); if (Number.isNaN(d.getTime())) return ''; const offset = d.getTimezoneOffset() * 60_000; return new Date(d.getTime() - offset).toISOString().slice(0,16) }
const fromLocalInput = (value: string, fallback: string) => { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? d.toISOString() : fallback }
const cloneDraft = (draft: AreaDropDraft): AreaDropDraft => JSON.parse(JSON.stringify(draft)) as AreaDropDraft
const errorText = (error: unknown) => error instanceof ApiError ? `${error.message} (HTTP ${error.status})` : error instanceof Error ? error.message : 'Unexpected error'
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
  const overview = useQuery(() => ({ queryKey: ['area-overview', slug(), refreshTick()], queryFn: () => api.areaOverview(slug()), refetchOnWindowFocus: false, reconcile: 'id' }))
  const drops = useQuery(() => ({ queryKey: ['area-drops', slug(), refreshTick()], queryFn: () => api.areaDrops(slug()), refetchOnWindowFocus: false, reconcile: 'id' }))
  const tenant = useQuery(() => ({ queryKey: ['tenant', slug()], queryFn: () => api.tenant(slug()) }))
  const [selectedId, setSelectedId] = createSignal<string | null>(null)
  const [creating, setCreating] = createSignal(false)
  const [citySearch, setCitySearch] = createSignal('')
  const [newNumber, setNewNumber] = createSignal('001')
  const [newCityId, setNewCityId] = createSignal('')
  const [createCityOpen, setCreateCityOpen] = createSignal(false)
  const cities = useQuery(() => ({ queryKey: ['area-cities', slug(), citySearch()], queryFn: () => api.areaCities(slug(), citySearch(), 40), staleTime: 30_000, enabled: creating() || Boolean(selectedId()) || createCityOpen() }))
  const detail = useQuery(() => ({
    queryKey: ['area-drop', slug(), selectedId()],
    queryFn: () => api.areaDrop(slug(), selectedId()!),
    enabled: Boolean(selectedId()), staleTime: 0, gcTime: 0,
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
  const allPending = () => save.isPending || validate.isPending || publish.isPending || lifecycle.isPending || discard.isPending || duplicate.isPending
  const mutationError = () => [overview.error,drops.error,tenant.error,settings.error,createDrop.error,createCity.error,save.error,validate.error,publish.error,lifecycle.error,discard.error,duplicate.error].find(Boolean)
  const confirmationIssues = () => validation()?.issues.filter(issue => issue.confirmationRequired) ?? []
  const hardIssues = () => validation()?.issues.filter(issue => !issue.confirmationRequired) ?? []
  const toggleConfirmation = (code:string) => setConfirmations(current => current.includes(code) ? current.filter(item=>item!==code) : [...current,code])

  return <section class="page">
    <div class="page-head">
      <div><span class="eyebrow">TENANT / {slug().toUpperCase()} / AREA</span><h1>AREA Designer</h1><p>Draft, validate and publish tenant-scoped AREA locations. Exact claim coordinates stay on the private management path and never appear in list responses.</p></div>
      <div class="row-health"><Show when={overview.data}><StatusBadge status={overview.data!.enabled ? 'enabled' : 'disabled'} tone={overview.data!.enabled ? 'good' : 'muted'} /></Show></div>
    </div>

    <Show when={flash()}><div class="notice-card">{flash()}</div></Show>
    <Show when={mutationError()}><div class="error-card">{errorText(mutationError())}</div></Show>

    <Show when={overview.data} fallback={
      <Show when={overview.isPending} fallback={<div class="error-card">AREA management is unavailable. This is not an empty game state. <button class="ghost" onClick={()=>overview.refetch()}>Retry</button></div>}>
        <div class="skeleton-block"/>
      </Show>
    }>{o => <>
      <div class="metric-grid area-metrics">
        <div class="metric"><span>Locations</span><strong>{o().total}</strong></div>
        <div class="metric"><span>Live</span><strong>{o().live}</strong></div>
        <div class="metric"><span>Total claims</span><strong>{o().totalClaims}</strong></div>
        <div class="metric"><span>Scheduled</span><strong>{o().scheduled}</strong></div>
        <div class="metric"><span>Drafts</span><strong>{o().drafts}</strong></div>
        <div class="metric"><span>Paused / ended</span><strong>{o().paused + o().ended}</strong></div>
      </div>
      <article class="panel area-entitlement-panel"><div><span class="eyebrow">ENTITLEMENT</span><h2>Tenant AREA</h2><p>Disabling AREA hides the public game but preserves drops, claims and audit history.</p></div><button class={o().entitled ? 'ghost danger-ghost' : ''} disabled={settings.isPending} onClick={() => settings.mutate(!o().entitled)}>{o().entitled ? 'Disable AREA' : 'Enable AREA'}</button></article>
    </>}</Show>

    <article class="panel">
      <div class="section-title"><div><span class="eyebrow">LOCATIONS</span><h2>Published state + drafts</h2></div><button disabled={!overview.data?.entitled} onClick={() => setCreating(v=>!v)}>+ New location</button></div>
      <Show when={creating()}><div class="area-create-card">
        <label>Search city<input value={citySearch()} onInput={e=>setCitySearch(e.currentTarget.value)} placeholder="Wrocław" /></label>
        <label>Canonical city<select value={newCityId()} onChange={e=>setNewCityId(e.currentTarget.value)}><option value="">Choose…</option><For each={cities.data?.items ?? []}>{city=><option value={city.id}>{city.name}{city.region ? ` · ${city.region}` : ''} · {city.countryCode}</option>}</For></select></label>
        <label>Drop number<input inputmode="numeric" maxlength="3" value={newNumber()} onInput={e=>setNewNumber(e.currentTarget.value.replace(/\D/g,'').slice(0,3))}/></label>
        <div class="form-actions"><button class="ghost" onClick={()=>setCreateCityOpen(v=>!v)}>Create custom city</button><button disabled={createDrop.isPending || !newCityId()} onClick={()=>createDrop.mutate()}>Create draft</button></div>
        <Show when={createCityOpen()}><div class="area-custom-city">
          <label>Name<input required value={newCity().name} onInput={e=>setNewCity(v=>({...v,name:e.currentTarget.value}))}/></label>
          <label>Slug<input required value={newCity().slug} onInput={e=>setNewCity(v=>({...v,slug:e.currentTarget.value}))}/></label>
          <label>Country<input required maxlength="2" value={newCity().countryCode} onInput={e=>setNewCity(v=>({...v,countryCode:e.currentTarget.value}))}/></label>
          <label>Region<input required value={newCity().region} onInput={e=>setNewCity(v=>({...v,region:e.currentTarget.value}))}/></label>
          <label>Public latitude<input required type="number" step="0.000001" value={newCity().latitude} onInput={e=>setNewCity(v=>({...v,latitude:e.currentTarget.value}))}/></label>
          <label>Public longitude<input required type="number" step="0.000001" value={newCity().longitude} onInput={e=>setNewCity(v=>({...v,longitude:e.currentTarget.value}))}/></label>
          <button disabled={createCity.isPending} onClick={()=>createCity.mutate()}>Save canonical city</button>
        </div></Show>
      </div></Show>
      <div class="area-drop-table">
        <div class="area-drop-head"><span>#</span><span>City</span><span>Status</span><span>Claims</span><span>Window</span><span/></div>
        <For each={drops.data?.items ?? []}>{item => <div class="area-drop-row">
          <code>{item.number}</code><div><strong>{item.city}</strong><small>{item.id} · rev {item.revision}{item.hasDraft ? ' · draft' : ''}</small></div><StatusBadge status={item.status} tone={statusTone(item.status)} /><span>{item.claimCount} / {item.maxClaims}</span><small>{formatDate(item.startsAt)}<br/>{formatDate(item.endsAt)}</small><button class="ghost" onClick={()=>{setSelectedId(item.id);setEditorStep('city')}}>Edit</button>
        </div>}</For>
        <Show when={!drops.isPending && (drops.data?.items.length ?? 0)===0}><div class="inherit-card"><EmptyState label="No AREA locations" hint="AREA locations define geographic targeting for fan discovery. Create the first location draft above." /></div></Show>
      </div>
    </article>

    <Show when={selectedId()}><article class="panel area-editor">
      <div class="section-title"><div><span class="eyebrow">PRIVATE EDITOR</span><h2>{selectedId()}</h2><p>Single-drop response only · <code>Cache-Control: private, no-store</code></p></div><button class="ghost" onClick={closeEditor}>Close & purge coordinates</button></div>
      <Show when={detail.data && draft()} fallback={<div class="skeleton-block"/>}>{_ready => <>
        <div class="area-step-tabs"><For each={['city','location','content','schedule','review'] as const}>{step=><button class={editorStep()===step?'active ghost':'ghost'} onClick={()=>setEditorStep(step)}>{step}</button>}</For></div>

        <Show when={editorStep()==='city'}><div class="area-form-grid">
          <label>Search canonical city<input value={citySearch()} onInput={e=>setCitySearch(e.currentTarget.value)} placeholder={detail.data!.summary.city}/></label>
          <label>Canonical city<select value={draft()!.cityId} onChange={e=>{const id=e.currentTarget.value;const city=cities.data?.items.find(c=>c.id===id);setDraft(d=>d?({...d,cityId:id,approximateLat:city?.latitude ?? d.approximateLat,approximateLng:city?.longitude ?? d.approximateLng}):d)}}><Show when={!(cities.data?.items ?? []).some(city=>city.id===draft()!.cityId)}><option value={draft()!.cityId}>{detail.data!.summary.city} · current</option></Show><For each={cities.data?.items ?? []}>{city=><option value={city.id}>{city.name} · {city.countryCode}</option>}</For></select></label>
          <label>Drop number<input maxlength="3" value={draft()!.number} onInput={e=>mutateDraft({number:e.currentTarget.value.replace(/\D/g,'').slice(0,3)})}/></label>
          <label>Sort order<input type="number" value={draft()!.sortOrder} onInput={e=>mutateDraft({sortOrder:finiteInput(e.currentTarget.value,draft()!.sortOrder)})}/></label>
          <label>Illustration X (advanced)<input type="number" min="0" max="100" value={draft()!.mapX} onInput={e=>mutateDraft({mapX:finiteInput(e.currentTarget.value,draft()!.mapX)})}/></label>
          <label>Illustration Y (advanced)<input type="number" min="0" max="100" value={draft()!.mapY} onInput={e=>mutateDraft({mapY:finiteInput(e.currentTarget.value,draft()!.mapY)})}/></label>
        </div></Show>

        <Show when={editorStep()==='location'}><div class="area-location-editor">
          <div class="warning-card"><strong>Secret location.</strong> The canvas below is rendered locally. It does not load map tiles or transmit exact coordinates to an external mapping provider.</div>
          <LocationCanvas publicLat={draft()!.approximateLat} publicLng={draft()!.approximateLng} exactLat={draft()!.exactLat} exactLng={draft()!.exactLng} radiusMeters={draft()!.radiusMeters} onPick={(lat,lng)=>mutateDraft({exactLat:lat,exactLng:lng})}/>
          <div class="area-form-grid">
            <label>Public latitude<input required type="number" step="0.000001" value={draft()!.approximateLat} onInput={e=>mutateDraft({approximateLat:finiteInput(e.currentTarget.value,draft()!.approximateLat)})}/></label>
            <label>Public longitude<input required type="number" step="0.000001" value={draft()!.approximateLng} onInput={e=>mutateDraft({approximateLng:finiteInput(e.currentTarget.value,draft()!.approximateLng)})}/></label>
            <label>Exact latitude<input type="number" step="0.000001" value={draft()!.exactLat ?? ''} onInput={e=>mutateDraft({exactLat:nullableInput(e.currentTarget.value,draft()!.exactLat)})}/></label>
            <label>Exact longitude<input type="number" step="0.000001" value={draft()!.exactLng ?? ''} onInput={e=>mutateDraft({exactLng:nullableInput(e.currentTarget.value,draft()!.exactLng)})}/></label>
            <label>Claim radius (m)<input type="number" min="25" max="500" value={draft()!.radiusMeters} onInput={e=>mutateDraft({radiusMeters:finiteInput(e.currentTarget.value,draft()!.radiusMeters)})}/></label>
          </div>
        </div></Show>

        <Show when={editorStep()==='content'}><div class="area-form-grid area-content-grid">
          <label>Clue — Polski<textarea maxlength="2000" value={draft()!.clue.pl} onInput={e=>mutateClue('pl',e.currentTarget.value)}/></label>
          <label>Clue — English<textarea maxlength="2000" value={draft()!.clue.en} onInput={e=>mutateClue('en',e.currentTarget.value)}/></label>
          <label>Track<input maxlength="256" value={draft()!.collectible.track} onInput={e=>mutateCollectible('track',e.currentTarget.value)}/></label>
          <label>Edition<input maxlength="256" value={draft()!.collectible.edition} onInput={e=>mutateCollectible('edition',e.currentTarget.value)}/></label>
          <label>Collectible line<textarea maxlength="1000" value={draft()!.collectible.line} onInput={e=>mutateCollectible('line',e.currentTarget.value)}/></label>
          <label>Riddle<input maxlength="256" value={draft()!.collectible.riddle} onInput={e=>mutateCollectible('riddle',e.currentTarget.value)}/></label>
        </div></Show>

        <Show when={editorStep()==='schedule'}><div class="area-form-grid">
          <label>Starts <small>{Intl.DateTimeFormat().resolvedOptions().timeZone || 'local timezone'}</small><input required type="datetime-local" value={toLocalInput(draft()!.startsAt)} onInput={e=>mutateDraft({startsAt:fromLocalInput(e.currentTarget.value,draft()!.startsAt)})}/></label>
          <label>Ends <small>{Intl.DateTimeFormat().resolvedOptions().timeZone || 'local timezone'}</small><input required type="datetime-local" value={toLocalInput(draft()!.endsAt)} onInput={e=>mutateDraft({endsAt:fromLocalInput(e.currentTarget.value,draft()!.endsAt)})}/></label>
          <label>Capacity<input type="number" min="1" max="500" value={draft()!.maxClaims} onInput={e=>mutateDraft({maxClaims:finiteInput(e.currentTarget.value,draft()!.maxClaims)})}/></label>
        </div></Show>

        <Show when={editorStep()==='review'}><div class="area-review">
          <div class="deployment-target-grid"><div><span>City</span><strong>{selectedCity()?.name ?? detail.data!.summary.city}</strong></div><div><span>Revision</span><strong>{detail.data!.summary.revision}</strong></div><div><span>Exact location</span><strong>{draft()!.exactLat != null && draft()!.exactLng != null ? 'configured' : 'missing'}</strong></div><div><span>Radius / capacity</span><strong>{draft()!.radiusMeters} m · {draft()!.maxClaims}</strong></div><div><span>Starts</span><strong>{formatDate(draft()!.startsAt)}</strong></div><div><span>Ends</span><strong>{formatDate(draft()!.endsAt)}</strong></div></div>
          <Show when={validation()}>{v=><>
            <Show when={hardIssues().length===0}><div class="notice-card">No blocking validation errors.</div></Show>
            <For each={hardIssues()}>{issue=><div class="error-card"><strong>{issue.code}</strong><p>{issue.message}</p></div>}</For>
            <For each={confirmationIssues()}>{issue=><label class="area-confirm-row"><input type="checkbox" checked={confirmations().includes(issue.code)} onChange={()=>toggleConfirmation(issue.code)}/><span><strong>{issue.code}</strong><small>{issue.message}</small></span></label>}</For>
          </>}</Show>
          <div class="form-actions"><button class="ghost" disabled={validate.isPending||save.isPending} onClick={()=>validate.mutate()}>Save + validate</button><button disabled={!validation()?.valid || confirmationIssues().some(issue=>!confirmations().includes(issue.code)) || publish.isPending} onClick={()=>publish.mutate()}>Publish revision</button></div>
        </div></Show>

        <Show when={duplicateOpen()}><div class="area-create-card area-duplicate-card">
          <strong>Duplicate as a new draft</strong><p>The collectible/content is copied, but the exact claim coordinates are deliberately cleared.</p>
          <label>Search destination city<input value={citySearch()} onInput={e=>setCitySearch(e.currentTarget.value)} placeholder="Search canonical cities"/></label>
          <label>Destination city<select value={duplicateCityId()} onChange={e=>setDuplicateCityId(e.currentTarget.value)}><option value="">Choose…</option><For each={cities.data?.items ?? []}>{city=><option value={city.id}>{city.name}{city.region ? ` · ${city.region}` : ''}</option>}</For></select></label>
          <label>New number<input inputmode="numeric" maxlength="3" value={duplicateNumber()} onInput={e=>setDuplicateNumber(e.currentTarget.value.replace(/\D/g,'').slice(0,3))}/></label>
          <div class="form-actions"><button class="ghost" onClick={()=>setDuplicateOpen(false)}>Cancel</button><button disabled={duplicate.isPending || !duplicateCityId() || !duplicateNumber()} onClick={()=>duplicate.mutate()}>Create duplicate draft</button></div>
        </div></Show>

        <div class="area-editor-footer">
          <div class="form-actions"><button class="ghost" disabled={allPending()} onClick={()=>save.mutate()}>Save draft</button><Show when={detail.data!.summary.hasDraft && detail.data!.summary.status!=='DRAFT'}><button class="ghost" disabled={discard.isPending} onClick={()=>discard.mutate()}>Discard draft</button></Show><Show when={detail.data!.summary.status!=='DRAFT' && detail.data!.summary.status!=='ARCHIVED'}><button class="ghost" disabled={allPending()} onClick={()=>setDuplicateOpen(v=>!v)}>Duplicate</button></Show></div>
          <div class="form-actions"><Show when={detail.data!.summary.status==='LIVE'||detail.data!.summary.status==='SCHEDULED'}><button class="ghost danger-ghost" disabled={allPending()} onClick={()=>lifecycle.mutate('pause')}>Pause</button></Show><Show when={detail.data!.summary.status==='PAUSED'}><button class="ghost" disabled={allPending()} onClick={()=>lifecycle.mutate('resume')}>Resume</button></Show><Show when={detail.data!.summary.status!=='ARCHIVED' && detail.data!.summary.status!=='DRAFT'}><button class="ghost danger-ghost" disabled={allPending()} onClick={()=>{if(confirm('Archive this AREA location? Claims and history will be preserved.')) lifecycle.mutate('archive')}}>Archive</button></Show><Show when={detail.data!.summary.status==='DRAFT'}><button class="ghost danger-ghost" disabled={allPending()} onClick={()=>{if(confirm('Delete this never-published draft?')) lifecycle.mutate('delete')}}>Delete draft</button></Show></div>
        </div>
      </>}</Show>
    </article></Show>
  </section>
}
