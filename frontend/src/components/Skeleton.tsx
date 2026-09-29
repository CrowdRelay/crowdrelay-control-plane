import { Show, createContext, useContext, type Component, type JSX } from 'solid-js'
import { Card } from './app/card'
import { Skeleton } from './ui/skeleton'

// Loading placeholders, all drawn with the shadcn `Skeleton` (ui/skeleton.tsx):
// `animate-pulse rounded-md bg-muted`. Text lines keep the registry's
// `rounded-md`; card-sized blocks take `rounded-lg`, the container radius.
// Dimension utilities are Tailwind arbitrary values (w-[40px], h-[11px], …)
// because a skeleton imitates specific text metrics. Vertical rhythm uses the
// same spacing as the real content — gap-2.5 between body lines, gap-3
// between cards, mb-4 after titles — so nothing shifts when data arrives.
//
// Every exported shape is wrapped in `Loading`: the bars are decorative, so a
// screen reader hears one "Loading…" instead of silence.

/** A polite status region around a skeleton. `contents` keeps it out of the
 *  layout, so it can wrap a shape that sits directly in a grid or flex row. */
const InsideLoading = createContext(false)
const Loading = (props: { children: JSX.Element }) => (
  // A page skeleton is built from section skeletons; only the outermost one
  // announces, or a reader hears "Loading…" once per section.
  <Show when={!useContext(InsideLoading)} fallback={props.children}>
    <div role="status" class="contents">
      <span class="sr-only">Loading…</span>
      <div aria-hidden="true" class="contents">
        <InsideLoading.Provider value={true}>{props.children}</InsideLoading.Provider>
      </div>
    </div>
  </Show>
)

export const SkeletonBlock: Component<{ height?: string; width?: string }> = (props) => (
  <Loading>
  <Skeleton
    class="rounded-lg"
    style={{
      height: props.height ?? '120px',
      width: props.width ?? '100%',
    }}
  />
  </Loading>
)

export const SkeletonGrid: Component<{ count?: number; minCardHeight?: string }> = (props) => (
  <Loading>
  <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 mb-8">
    {Array.from({ length: props.count ?? 3 }, () => (
      <Skeleton class="rounded-lg" style={{ height: props.minCardHeight ?? '160px' }} />
    ))}
  </div>
  </Loading>
)

export const SkeletonRows: Component<{ count?: number }> = (props) => (
  <Loading>
  <div class="flex flex-col gap-2.5 mt-4">
    {Array.from({ length: props.count ?? 4 }, () => (
      <Skeleton class="rounded-lg h-12" />
    ))}
  </div>
  </Loading>
)

export const SkeletonPanel: Component<{ lines?: number }> = (props) => (
  <Loading>
  <Card class="p-4">
    <Skeleton class="h-5 w-[180px] mb-4" />
    <div class="flex flex-col gap-2.5">
      {Array.from({ length: props.lines ?? 3 }, () => (
        <Skeleton class="h-[14px] w-full" />
      ))}
    </div>
  </Card>
  </Loading>
)

// ── Layout-matching skeletons — make pages FEEL fast ──────────────
// These mirror the actual page layout shapes so the browser paints
// the full layout immediately and data populates into place.

/** Page header skeleton — eyebrow + h1 + paragraph.
 *  Internal helper used by composite page skeletons. */
const SkeletonPageHead: Component = () => (
  <div class="flex justify-between items-start gap-6 mb-8">
    <div>
      <Skeleton class="h-[12px] w-[120px] mb-2.5" />
      <Skeleton class="h-7 w-[280px] mb-2" />
      <Skeleton class="h-[14px] w-[420px]" />
    </div>
    <Skeleton class="rounded-full h-7 w-[90px]" />
  </div>
)

/** KPI strip skeleton — row of metric cards */
/** The loading shape of a `KpiStrip`: the same rail, the same hairlines, the
 *  same three lines per cell. A skeleton that drew boxes where the loaded
 *  state draws a divided row made the arrival of data look like a layout
 *  change. */
export const SkeletonKpiStrip: Component<{ count?: number }> = (props) => (
  <Loading>
  <div class="grid mb-5 border-y border-border [grid-template-columns:repeat(auto-fit,minmax(10rem,1fr))]">
    {Array.from({ length: props.count ?? 3 }, () => (
      <div class="flex flex-col gap-1.5 border-l border-border px-4 py-3.5 first:border-l-0 first:pl-0">
        <Skeleton class="h-[11px] w-[76px]" />
        <Skeleton class="h-5 w-[52px]" />
      </div>
    ))}
  </div>
  </Loading>
)

/** Panel skeleton — section title + body lines */
export const SkeletonSection: Component<{ titleWidth?: string; lines?: number; minHeight?: string }> = (props) => (
  <Loading>
  <Card class="p-4" style={{ 'min-height': props.minHeight ?? 'auto' }}>
    <div class="flex items-center justify-between gap-4 mb-4">
      <div>
        <Skeleton class="h-[11px] w-[80px] mb-1.5" />
        <Skeleton class="h-[18px]" style={{ width: props.titleWidth ?? '200px' }} />
      </div>
    </div>
    <div class="flex flex-col gap-2.5">
      {Array.from({ length: props.lines ?? 3 }, () => (
        <Skeleton class="h-[14px] w-full" />
      ))}
    </div>
  </Card>
  </Loading>
)

/** Two-column grid skeleton — for detail-grid layouts.
 *  Internal helper used by SkeletonTenantPage. */
const SkeletonDetailGrid: Component<{ leftHeight?: string; rightHeight?: string }> = (props) => (
  <div class="grid grid-cols-2 gap-4 mb-4">
    <Skeleton class="rounded-lg" style={{ height: props.leftHeight ?? '200px' }} />
    <Skeleton class="rounded-lg" style={{ height: props.rightHeight ?? '200px' }} />
  </div>
)

/** Brain group skeleton — for intelligence page sections */
export const SkeletonBrainGroup: Component = () => (
  <Loading>
  <div class="mb-6">
    <div class="mb-3 pb-2 border-b border-border">
      <Skeleton class="h-[11px] w-[100px] mb-1.5" />
      <Skeleton class="h-[18px] w-[180px]" />
    </div>
    <Skeleton class="h-[120px] mt-4" />
  </div>
  </Loading>
)

/** Full tenant detail page skeleton — header + detail grid + panels */
export const SkeletonTenantPage: Component = () => (
  <Loading>
  <>
    <SkeletonPageHead />
    <SkeletonDetailGrid leftHeight="220px" rightHeight="220px" />
    <Skeleton class="h-[140px] mt-4" />
    <SkeletonSection titleWidth="180px" lines={5} minHeight="180px" />
    <SkeletonSection titleWidth="200px" lines={4} minHeight="160px" />
  </>
  </Loading>
)

/** Notifier page skeleton — channels panel + discovered panel */
export const SkeletonNotifiersPage: Component = () => (
  <Loading>
  <>
    <SkeletonPageHead />
    <SkeletonSection titleWidth="160px" lines={3} minHeight="120px" />
    <SkeletonSection titleWidth="200px" lines={2} minHeight="100px" />
  </>
  </Loading>
)

/** Generic full-page skeleton — shown while a lazy route chunk loads.
 *  Mirrors the common page shape: head + KPI strip + panel grid. */
export const SkeletonPage: Component = () => (
  <Loading>
  <section class="px-4 md:px-6 py-6 pb-20">
    <SkeletonPageHead />
    <SkeletonKpiStrip count={4} />
    <div class="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4 mt-4">
      <SkeletonSection titleWidth="160px" lines={4} minHeight="180px" />
      <SkeletonSection titleWidth="200px" lines={3} minHeight="180px" />
      <SkeletonSection titleWidth="140px" lines={5} minHeight="180px" />
    </div>
    <Skeleton class="h-[220px] mt-4" />
  </section>
  </Loading>
)

// ── Panel-specific skeletons — match each panel's real layout shape ──
// These replace the old `mini-skeleton` (a 100px shimmer bar) that caused
// layout shift when data arrived. Each skeleton occupies the same space
// the real content will, so the swap is invisible.

/** Skeleton for ScorecardPanel — status metrics row + week summary + track record */
export const SkeletonScorecard: Component = () => (
  <Loading>
  <>
    <div class="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {Array.from({ length: 3 }, () => (
        <div class="p-4 border border-border rounded-lg bg-card">
          <Skeleton class="h-[11px] mb-2 w-[70px]" />
          <Skeleton class="h-[22px] mb-1.5 w-[50px]" />
          <Skeleton class="h-[11px] w-[90px]" />
        </div>
      ))}
    </div>
    <section class="mt-6 pt-4 border-t border-border">
      <div class="flex items-center gap-2">
        <Skeleton class="h-[18px] w-[140px]" />
      </div>
      <div class="grid gap-2.5 mt-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {Array.from({ length: 4 }, () => (
          <div class="p-3 border border-border rounded-lg bg-card flex flex-col gap-1">
            <Skeleton class="h-[14px] w-3/5" />
            <Skeleton class="h-[14px] w-4/5" />
          </div>
        ))}
      </div>
    </section>
    <section class="mt-6 pt-4 border-t border-border">
      <div class="flex items-center gap-2">
        <Skeleton class="h-[18px] w-[180px]" />
      </div>
      <div class="grid gap-2.5 mt-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {Array.from({ length: 4 }, () => (
          <div class="p-3 border border-border rounded-lg bg-card flex flex-col gap-1">
            <Skeleton class="h-[14px] w-3/5" />
            <Skeleton class="h-[14px] w-4/5" />
          </div>
        ))}
      </div>
    </section>
  </>
  </Loading>
)

/** Skeleton for ReplyTriagePanel — summary metrics + reply rows */
export const SkeletonReplyTriage: Component = () => (
  <Loading>
  <>
    <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {Array.from({ length: 3 }, () => (
        <div class="p-4 border border-border rounded-lg bg-card">
          <Skeleton class="h-[11px] mb-2 w-[70px]" />
          <Skeleton class="h-[22px] mb-1.5 w-[40px]" />
          <Skeleton class="h-[11px] w-[80px]" />
        </div>
      ))}
    </div>
    <div class="flex flex-col gap-2.5 mt-3">
      {Array.from({ length: 3 }, () => (
        <Skeleton class="rounded-lg h-16 w-full" />
      ))}
    </div>
  </>
  </Loading>
)

/** Skeleton for LearningLoopPanel — summary line + entry cards */
export const SkeletonLearningLoop: Component = () => (
  <Loading>
  <>
    <div class="flex flex-wrap gap-3 mb-4 p-3 border border-border rounded-lg bg-background">
      {Array.from({ length: 4 }, () => (
        <div class="flex flex-col gap-0.5">
          <Skeleton class="h-[11px] w-[60px] mb-1.5" />
          <Skeleton class="h-5 w-[40px]" />
        </div>
      ))}
    </div>
    <div class="flex flex-col gap-2.5 mt-4">
      {Array.from({ length: 4 }, () => (
        <Skeleton class="h-[72px] w-full" />
      ))}
    </div>
  </>
  </Loading>
)

/** Skeleton for OpportunityBoardPanel — opportunity list rows */
export const SkeletonOpportunityBoard: Component = () => (
  <Loading>
  <div class="flex flex-col">
    {Array.from({ length: 3 }, () => (
      <div class="flex justify-between items-start gap-4 py-4 border-b border-border last:border-0">
        <div class="min-w-0 flex-1 flex flex-col gap-1.5">
          <Skeleton class="h-4 w-3/5" />
          <Skeleton class="h-[12px] w-2/5" />
          <Skeleton class="h-[12px] w-4/5" />
        </div>
        <Skeleton class="h-8 w-[70px]" />
      </div>
    ))}
  </div>
  </Loading>
)

/** Skeleton for RuntimeSwitchesPanel flag list — single-column switch rows */
export const SkeletonFlagList: Component = () => (
  <Loading>
  <div class="flex flex-col mt-3">
    {Array.from({ length: 4 }, () => (
      <div class="flex items-center justify-between gap-3 py-2 border-b border-border">
        <div>
          <Skeleton class="h-[14px] w-[120px] mb-1.5" />
          <Skeleton class="h-[11px] w-[180px]" />
        </div>
        <Skeleton class="rounded-full h-6 w-[50px]" />
      </div>
    ))}
  </div>
  </Loading>
)

/** Skeleton for autopilot KPIs — mirrors KpiStrip (auto-fit, gap-3, my-4) */
export const SkeletonAutopilotKpis: Component = () => (
  <Loading>
  <div class="grid gap-3 my-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
    {Array.from({ length: 4 }, () => (
      <div class="p-4 border border-border rounded-lg bg-card">
        <Skeleton class="h-[11px] mb-2 w-[60px]" />
        <Skeleton class="h-[22px] mb-1.5 w-[40px]" />
        <Skeleton class="h-[11px] w-[80px]" />
      </div>
    ))}
  </div>
  </Loading>
)

/** Generic tab content skeleton — shown when a tab's panels are loading
 *  for the first time. Two panel-shaped shimmer blocks match the typical
 *  tab layout without being specific to any one tab. */
export const SkeletonTabContent: Component = () => (
  <Loading>
  <>
    <Card class="p-4" style={{ 'min-height': '180px' }}>
      <Skeleton class="h-5 w-[180px] mb-4" />
      <div class="flex flex-col gap-2.5">
        <Skeleton class="h-[14px] w-full" />
        <Skeleton class="h-[14px] w-4/5" />
      </div>
    </Card>
    <Card class="p-4 mt-4" style={{ 'min-height': '140px' }}>
      <Skeleton class="h-5 w-[160px] mb-4" />
      <Skeleton class="h-[14px] w-full" />
    </Card>
  </>
  </Loading>
)

export const SkeletonSignalOverview: Component = () => (
  <Loading>
  <>
    <div class="flex items-center justify-between gap-4 mb-3">
      <div>
        <Skeleton class="h-[11px] w-[120px] mb-1.5" />
        <Skeleton class="h-[18px] w-[180px]" />
      </div>
    </div>
    <div class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {Array.from({ length: 8 }, () => (
        <div class="p-4 border border-border rounded-lg bg-card">
          <Skeleton class="h-[11px] mb-2 w-[70px]" />
          <Skeleton class="h-[22px] mb-1.5 w-[50px]" />
          <Skeleton class="h-[11px] w-[80px]" />
        </div>
      ))}
    </div>
  </>
  </Loading>
)
