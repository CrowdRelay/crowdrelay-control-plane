import { createMemo, createSignal } from 'solid-js'
import type { Component } from 'solid-js'
import { Button } from '../app/button'
import { Input } from '../ui/input'
import { Field } from '../ui/field'
import { NativeSelect } from '../ui/native-select'

type Props = {
  // A canonical city can lack coordinates — null renders no reference dot,
  // never a fabricated point at 0,0.
  publicLat: number | null
  publicLng: number | null
  exactLat: number | null
  exactLng: number | null
  radiusMeters: number
  spanKm?: number
  onPick: (lat: number, lng: number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const finite = (raw: string, fallback: number) => { const value = Number(raw); return Number.isFinite(value) ? value : fallback }

export const LocationCanvas: Component<Props> = (props) => {
  const [mode, setMode] = createSignal<'world'|'local'>('world')
  const [localSpanKm, setLocalSpanKm] = createSignal(props.spanKm ?? 6)
  const [localCenterLat, setLocalCenterLat] = createSignal(props.exactLat ?? props.publicLat ?? 0)
  const [localCenterLng, setLocalCenterLng] = createSignal(props.exactLng ?? props.publicLng ?? 0)
  const exactLat = () => props.exactLat ?? props.publicLat
  const exactLng = () => props.exactLng ?? props.publicLng

  const worldPoint = createMemo(() => ({ x: clamp((((exactLng() ?? 0) + 180) / 360) * 100, 0, 100), y: clamp(((90 - (exactLat() ?? 0)) / 180) * 100, 0, 100) }))
  const publicWorldPoint = createMemo(() => ({ x: clamp((((props.publicLng ?? 0) + 180) / 360) * 100, 0, 100), y: clamp(((90 - (props.publicLat ?? 0)) / 180) * 100, 0, 100) }))
  const localDeltas = () => ({
    lat: localSpanKm() / (2 * 111),
    lng: localSpanKm() / (2 * Math.max(20, 111 * Math.cos(localCenterLat() * Math.PI / 180))),
  })
  const localPoint = (lat: number, lng: number) => { const d = localDeltas(); return { x: clamp(50 + ((lng - localCenterLng()) / d.lng) * 50, 0, 100), y: clamp(50 - ((lat - localCenterLat()) / d.lat) * 50, 0, 100) } }
  const exactLocalPoint = createMemo(() => localPoint(exactLat() ?? 0, exactLng() ?? 0))
  const publicLocalPoint = createMemo(() => localPoint(props.publicLat ?? 0, props.publicLng ?? 0))
  const radiusPercent = () => clamp((props.radiusMeters / (localSpanKm() * 1000)) * 100, 0.5, 45)
  const centerLocal = () => { const lat = exactLat(); const lng = exactLng(); if (lat == null || lng == null) return; setLocalCenterLat(lat); setLocalCenterLng(lng); setMode('local') }

  const pick = (event: MouseEvent & { currentTarget: SVGSVGElement }) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    if (mode() === 'world') {
      const lat = Number((90 - y * 180).toFixed(6)); const lng = Number((x * 360 - 180).toFixed(6))
      setLocalCenterLat(lat); setLocalCenterLng(lng); props.onPick(lat, lng); setMode('local'); return
    }
    const d = localDeltas()
    props.onPick(Number((localCenterLat() - (y - 0.5) * 2 * d.lat).toFixed(6)), Number((localCenterLng() + (x - 0.5) * 2 * d.lng).toFixed(6)))
  }

  return <div class="area-location-canvas">
    <div class="flex justify-end gap-2"><Button type="button" variant={mode()==='world' ? 'default' : 'ghost'} size="sm" onClick={()=>setMode('world')}>World</Button><Button type="button" variant={mode()==='local' ? 'default' : 'ghost'} size="sm" onClick={centerLocal} disabled={exactLat() == null || exactLng() == null}>Local refine</Button>{mode()==='local' && <NativeSelect class="w-auto" value={String(localSpanKm())} onChange={e=>setLocalSpanKm(Number(e.currentTarget.value))}><option value="6">6 km</option><option value="25">25 km</option><option value="100">100 km</option></NativeSelect>}</div>
    <svg viewBox="0 0 100 100" role="application" aria-label={mode()==='world' ? 'Private global AREA location picker' : 'Private local AREA location refinement'} onClick={pick}>
      <defs><pattern id="area-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" stroke-width="0.35" /></pattern></defs>
      <rect width="100" height="100" class="area-grid-fill" />
      {mode()==='world' ? <><path d="M50 0 V100 M0 50 H100" class="area-axis" />{props.publicLat != null && props.publicLng != null && <circle cx={publicWorldPoint().x} cy={publicWorldPoint().y} r="1.6" class="area-public-point" />}{props.exactLat != null && props.exactLng != null && <circle cx={worldPoint().x} cy={worldPoint().y} r="2.2" class="area-exact-point" />}</> : <><path d="M50 4 V96 M4 50 H96" class="area-axis" />{props.publicLat != null && props.publicLng != null && <circle cx={publicLocalPoint().x} cy={publicLocalPoint().y} r="1.6" class="area-public-point" />}{props.exactLat != null && props.exactLng != null && <><circle cx={exactLocalPoint().x} cy={exactLocalPoint().y} r={radiusPercent()} class="area-radius" /><circle cx={exactLocalPoint().x} cy={exactLocalPoint().y} r="2.2" class="area-exact-point" /></>}</>}
    </svg>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4"><Field label="Exact latitude"><Input type="number" min="-90" max="90" step="0.000001" value={String(props.exactLat ?? '')} onChange={e=>{ const lat = finite(e.currentTarget.value, exactLat() ?? Number.NaN); const lng = exactLng(); if (Number.isFinite(lat) && lng != null) props.onPick(clamp(lat,-90,90), lng) }}/></Field><Field label="Exact longitude"><Input type="number" min="-180" max="180" step="0.000001" value={String(props.exactLng ?? '')} onChange={e=>{ const lat = exactLat(); const lng = finite(e.currentTarget.value, exactLng() ?? Number.NaN); if (lat != null && Number.isFinite(lng)) props.onPick(lat, clamp(lng,-180,180)) }}/></Field></div>
    <div class="area-map-legend"><span><i class="dot public"/>Canonical city reference</span><span><i class="dot exact"/>Private exact claim point</span><span>{mode()==='world' ? 'global 360° × 180°' : `${localSpanKm()} km refinement`} · no external tiles</span></div>
  </div>
}
