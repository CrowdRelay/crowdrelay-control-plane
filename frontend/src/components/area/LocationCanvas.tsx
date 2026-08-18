import type { Component } from 'solid-js'

type Props = {
  publicLat: number
  publicLng: number
  exactLat: number | null
  exactLng: number | null
  radiusMeters: number
  spanKm?: number
  onPick: (lat: number, lng: number) => void
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const LocationCanvas: Component<Props> = (props) => {
  const spanKm = () => props.spanKm ?? 6
  const latDelta = () => spanKm() / (2 * 111)
  const lngDelta = () => spanKm() / (2 * Math.max(20, 111 * Math.cos(props.publicLat * Math.PI / 180)))
  const toPoint = (lat: number, lng: number) => ({
    x: clamp(50 + ((lng - props.publicLng) / lngDelta()) * 50, 0, 100),
    y: clamp(50 - ((lat - props.publicLat) / latDelta()) * 50, 0, 100),
  })
  const exactPoint = () => props.exactLat == null || props.exactLng == null ? null : toPoint(props.exactLat, props.exactLng)
  const radiusPercent = () => clamp((props.radiusMeters / (spanKm() * 1000)) * 100, 1, 45)

  const pick = (event: MouseEvent & { currentTarget: SVGSVGElement }) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    const lng = props.publicLng + (x - 0.5) * 2 * lngDelta()
    const lat = props.publicLat - (y - 0.5) * 2 * latDelta()
    props.onPick(Number(lat.toFixed(6)), Number(lng.toFixed(6)))
  }

  return <div class="area-location-canvas">
    <svg viewBox="0 0 100 100" role="application" aria-label="Private exact AREA location picker" onClick={pick}>
      <defs>
        <pattern id="area-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" stroke-width="0.35" /></pattern>
      </defs>
      <rect width="100" height="100" class="area-grid-fill" />
      <path d="M50 4 V96 M4 50 H96" class="area-axis" />
      <circle cx="50" cy="50" r="1.8" class="area-public-point" />
      {exactPoint() && <>
        <circle cx={exactPoint()!.x} cy={exactPoint()!.y} r={radiusPercent()} class="area-radius" />
        <circle cx={exactPoint()!.x} cy={exactPoint()!.y} r="2.2" class="area-exact-point" />
      </>}
    </svg>
    <div class="area-map-legend"><span><i class="dot public"/>Public city reference</span><span><i class="dot exact"/>Exact claim point</span><span>{spanKm()} km view · no external tiles</span></div>
  </div>
}
