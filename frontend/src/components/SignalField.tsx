import { createSignal, onCleanup, onMount } from 'solid-js'
import type { Component } from 'solid-js'

/**
 * Signal particle field — the landing page hero's background, reused on the
 * sign-in screen: a dot grid lit by two interfering sine waves, a sparse few
 * dots carrying the signal in violet. One aria-hidden canvas; dots are
 * batched into alpha buckets, one fill each, so a frame is a handful of draw
 * calls however large the screen is.
 *
 * After "Signal Particles" from ThreeUI (@designcodeio/threeui, MIT,
 * © 2026 Meng To), redrawn in brand colours — the violet ramp is read from
 * the theme tokens so it tracks rebrands.
 *
 * The loop is capped at 30fps (the waves move slowly; it looks the same at
 * half the work), pauses while the tab is hidden, and under
 * prefers-reduced-motion draws one still frame and stops.
 */
export const SignalField: Component = () => {
  const [live, setLive] = createSignal(false)
  let canvas!: HTMLCanvasElement

  onMount(() => {
    const context = canvas.getContext('2d')
    if (!context) return
    const ctx: CanvasRenderingContext2D = context

    const SPACING = 16, RADIUS = 1.5, THRESHOLD = 0.1, BUCKETS = 8
    const BASE = '160, 160, 190' // cool grey, reads as night on night
    const css = getComputedStyle(document.documentElement)
    const violet = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
    const SIGNAL: [string, string] = [violet('--violet-400', '#8E6CFF'), violet('--violet-300', '#B7A4FF')]

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, raf = 0, t0 = 0, time = 0, last = 0, booted = false

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function draw(time: number) {
      ctx.clearRect(0, 0, w, h)
      const cols = Math.floor(w / SPACING), rows = Math.floor(h / SPACING)
      const ox = (w - cols * SPACING) / 2, oy = (h - rows * SPACING) / 2
      const grey: Path2D[] = []
      const signal: [Path2D, Path2D] = [new Path2D(), new Path2D()]
      for (let b = 0; b < BUCKETS; b++) grey.push(new Path2D())
      for (let i = 0; i <= cols; i++) {
        for (let j = 0; j <= rows; j++) {
          const nx = i * 0.1, ny = j * 0.1
          const v = Math.sin(nx + time * 0.5) * Math.cos(ny - time * 0.3) + Math.sin(nx * 0.5 - ny * 0.5 + time * 0.8)
          if (v <= THRESHOLD) continue
          const x = ox + i * SPACING, y = oy + j * SPACING
          const mark = Math.sin(i * 12.34) * Math.cos(j * 56.78)
          const path = mark > 0.98 ? signal[0] : mark < -0.98 ? signal[1]
            : grey[Math.min(BUCKETS - 1, Math.floor(Math.min(0.6, (v - THRESHOLD) * 0.8) / 0.6 * BUCKETS))]!
          path.moveTo(x + RADIUS, y)
          path.arc(x, y, RADIUS, 0, Math.PI * 2)
        }
      }
      for (let b = 0; b < BUCKETS; b++) {
        ctx.fillStyle = `rgba(${BASE}, ${((b + 1) / BUCKETS * 0.6).toFixed(3)})`
        ctx.fill(grey[b]!)
      }
      ctx.fillStyle = SIGNAL[0]
      ctx.fill(signal[0])
      ctx.fillStyle = SIGNAL[1]
      ctx.fill(signal[1])
    }

    // The reference advances 0.02 a frame at 60fps; here that pace is tied to
    // the clock, so a 120Hz screen does not run it at double speed.
    const FRAME_MS = 1000 / 30
    function tick(now: number) {
      raf = requestAnimationFrame(tick)
      if (now - last < FRAME_MS) return
      last = now
      if (!t0) t0 = now
      time = (now - t0) / 1000 * 1.2
      draw(time)
    }
    function start() {
      if (booted && !still && !raf && !document.hidden) raf = requestAnimationFrame(tick)
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }

    const resizer = new ResizeObserver(() => { resize(); if (!raf) draw(time) })

    // Nothing runs until the main thread is idle: the field is decoration, so
    // the form comes first. Then the first frame is drawn, the canvas fades
    // up, and the loop starts.
    function boot() {
      booted = true
      resize()
      draw(0)
      setLive(true)
      resizer.observe(canvas)
      start()
    }
    const idle: (fn: () => void, opts?: IdleRequestOptions) => number = 'requestIdleCallback' in window
      ? window.requestIdleCallback.bind(window)
      : (fn) => window.setTimeout(fn, 1) as unknown as number
    const whenIdle = () => { idle(boot, { timeout: 2000 }) }
    if (document.readyState === 'complete') whenIdle()
    else window.addEventListener('load', whenIdle, { once: true })

    const onVisibility = () => { document.hidden ? stop() : start() }
    document.addEventListener('visibilitychange', onVisibility)

    onCleanup(() => {
      stop()
      resizer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('load', whenIdle)
    })
  })

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity duration-[1200ms] ease-out [-webkit-mask-image:linear-gradient(#000_55%,transparent)] [mask-image:linear-gradient(#000_55%,transparent)]"
      classList={{ 'opacity-80': live() }}
    />
  )
}
