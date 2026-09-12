import type { Component } from 'solid-js'
import { Card } from './ui/card'

// Reusable skeleton loading placeholders.
// Static gradient (no shimmer animation — this is an operator console, not a
// marketing site). Dimension utilities are expressed as Tailwind arbitrary
// values (w-[40px], h-[11px],, mb-[6px], etc.).

export const SkeletonBlock: Component<{ height?: string; width?: string; radius?: string }> = (props) => (
  <div
    class="rounded-lg bg-surface-3 border border-border"
    style={{
      height: props.height ?? '120px',
      width: props.width ?? '100%',
    }}
  />
)

export const SkeletonGrid: Component<{ count?: number; minCardHeight?: string }> = (props) => (
  <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 mb-8">
    {Array.from({ length: props.count ?? 3 }, () => (
      <div class="rounded-lg bg-surface-3 border border-border" style={{ height: props.minCardHeight ?? '160px' }} />
    ))}
  </div>
)

export const SkeletonRows: Component<{ count?: number }> = (props) => (
  <div class="flex flex-col gap-2.5 mt-4">
    {Array.from({ length: props.count ?? 4 }, () => (
      <div class="rounded-lg bg-surface-3 border border-border h-12" />
    ))}
  </div>
)

export const SkeletonPanel: Component<{ lines?: number }> = (props) => (
  <Card class="p-5">
    <div class="rounded-lg bg-surface-3 border border-border h-5 w-[180px] mb-4" />
    {Array.from({ length: props.lines ?? 3 }, () => (
      <div class="rounded-lg bg-surface-3 border border-border h-[14px] mb-2.5 w-full" />
    ))}
  </Card>
)

// ── Layout-matching skeletons — make pages FEEL fast ──────────────
// These mirror the actual page layout shapes so the browser paints
// the full layout immediately and data populates into place.

/** Page header skeleton — eyebrow + h1 + paragraph.
 *  Internal helper used by composite page skeletons. */
const SkeletonPageHead: Component = () => (
  <div class="flex justify-between items-start gap-6 mb-8">
    <div>
      <div class="rounded-lg bg-surface-3 border border-border h-[12px] w-[120px] mb-2.5" />
      <div class="rounded-lg bg-surface-3 border border-border h-7 w-[280px]" style={{ 'margin-bottom': '8px' }} />
      <div class="rounded-lg bg-surface-3 border border-border h-[14px] w-[420px]" />
    </div>
    <div class="rounded-lg bg-surface-3 border border-border h-7 w-[90px] rounded-full" />
  </div>
)

/** KPI strip skeleton — row of metric cards */
export const SkeletonKpiStrip: Component<{ count?: number }> = (props) => (
  <div class="grid gap-3 mb-5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
    {Array.from({ length: props.count ?? 3 }, () => (
      <div class="flex flex-col border border-border rounded-lg bg-card p-4 gap-1">
        <div class="rounded-lg bg-surface-3 border border-border h-[11px] mb-2 w-[70px]" />
        <div class="rounded-lg bg-surface-3 border border-border h-[22px] mb-1.5 w-[50px]" />
        <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[90px]" />
      </div>
    ))}
  </div>
)

/** Panel skeleton — section title + body lines */
export const SkeletonSection: Component<{ titleWidth?: string; lines?: number; minHeight?: string }> = (props) => (
  <Card class="p-4" style={{ 'min-height': props.minHeight ?? 'auto' }}>
    <div class="flex items-center justify-between gap-4 mb-4">
      <div>
        <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[80px] mb-1.5" />
        <div class="rounded-lg bg-surface-3 border border-border h-[18px]" style={{ width: props.titleWidth ?? '200px' }} />
      </div>
    </div>
    {Array.from({ length: props.lines ?? 3 }, () => (
      <div class="rounded-lg bg-surface-3 border border-border h-[14px] w-full mb-2.5" />
    ))}
  </Card>
)

/** Two-column grid skeleton — for detail-grid layouts.
 *  Internal helper used by SkeletonTenantPage. */
const SkeletonDetailGrid: Component<{ leftHeight?: string; rightHeight?: string }> = (props) => (
  <div class="grid grid-cols-2 gap-4 mb-4">
    <div class="rounded-lg bg-surface-3 border border-border" style={{ height: props.leftHeight ?? '200px' }} />
    <div class="rounded-lg bg-surface-3 border border-border" style={{ height: props.rightHeight ?? '200px' }} />
  </div>
)

/** Brain group skeleton — for intelligence page sections */
export const SkeletonBrainGroup: Component<{ label?: string }> = (props) => (
  <div class="mb-6">
    <div class="flex items-center gap-3 mb-3 pb-2 border-b border-border-subtle">
      <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[100px] mb-1.5" />
      <div class="rounded-lg bg-surface-3 border border-border h-[18px] w-[180px]" />
    </div>
    <div class="rounded-lg bg-surface-3 border border-border h-[120px] mt-4" />
  </div>
)

/** Full tenant detail page skeleton — header + detail grid + panels */
export const SkeletonTenantPage: Component = () => (
  <>
    <SkeletonPageHead />
    <SkeletonDetailGrid leftHeight="220px" rightHeight="220px" />
    <div class="rounded-lg bg-surface-3 border border-border h-[140px] mt-4" />
    <SkeletonSection titleWidth="180px" lines={5} minHeight="180px" />
    <SkeletonSection titleWidth="200px" lines={4} minHeight="160px" />
  </>
)

/** Notifier page skeleton — channels panel + discovered panel */
export const SkeletonNotifiersPage: Component = () => (
  <>
    <SkeletonPageHead />
    <SkeletonSection titleWidth="160px" lines={3} minHeight="120px" />
    <SkeletonSection titleWidth="200px" lines={2} minHeight="100px" />
  </>
)

/** Generic full-page skeleton — shown while a lazy route chunk loads.
 *  Mirrors the common page shape: head + KPI strip + panel grid. */
export const SkeletonPage: Component = () => (
  <section class="mx-auto max-w-7xl px-6 py-6 pb-24">
    <SkeletonPageHead />
    <SkeletonKpiStrip count={4} />
    <div class="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4 mt-4">
      <SkeletonSection titleWidth="160px" lines={4} minHeight="180px" />
      <SkeletonSection titleWidth="200px" lines={3} minHeight="180px" />
      <SkeletonSection titleWidth="140px" lines={5} minHeight="180px" />
    </div>
    <div class="rounded-lg bg-surface-3 border border-border h-[220px] mt-4" />
  </section>
)

// ── Panel-specific skeletons — match each panel's real layout shape ──
// These replace the old `mini-skeleton` (a 100px shimmer bar) that caused
// layout shift when data arrived. Each skeleton occupies the same space
// the real content will, so the swap is invisible.

/** Skeleton for ScorecardPanel — status metrics row + week summary + track record */
export const SkeletonScorecard: Component = () => (
  <>
    <div class="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {Array.from({ length: 3 }, () => (
        <div class="p-3.5 border border-border rounded-lg bg-card">
          <div class="rounded-lg bg-surface-3 border border-border h-[11px] mb-2 w-[70px]" />
          <div class="rounded-lg bg-surface-3 border border-border h-[22px] mb-1.5 w-[50px]" />
          <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[90px]" />
        </div>
      ))}
    </div>
    <section class="mt-6 pt-4 border-t border-border">
      <div class="flex justify-between gap-4 items-start">
        <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[80px] mb-1.5" />
        <div class="rounded-lg bg-surface-3 border border-border h-[18px] w-[120px]" />
      </div>
      <div class="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {Array.from({ length: 4 }, () => (
          <div class="p-3.5 border border-border rounded-lg bg-card">
            <div class="rounded-lg bg-surface-3 border border-border h-[11px] mb-2 w-[60px]" />
            <div class="rounded-lg bg-surface-3 border border-border h-[22px] mb-1.5 w-[40px]" />
            <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[80px]" />
          </div>
        ))}
      </div>
    </section>
    <section class="mt-6 pt-4 border-t border-border">
      <div class="flex justify-between gap-4 items-start">
        <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[80px] mb-1.5" />
        <div class="rounded-lg bg-surface-3 border border-border h-[18px] w-[100px]" />
      </div>
      <div class="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        {Array.from({ length: 4 }, () => (
          <div class="p-3.5 border border-border rounded-lg bg-card">
            <div class="rounded-lg bg-surface-3 border border-border h-[11px] mb-2 w-[60px]" />
            <div class="rounded-lg bg-surface-3 border border-border h-[22px] mb-1.5 w-[40px]" />
            <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[80px]" />
          </div>
        ))}
      </div>
    </section>
  </>
)

/** Skeleton for ReplyTriagePanel — summary metrics + reply rows */
export const SkeletonReplyTriage: Component = () => (
  <>
    <div class="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {Array.from({ length: 3 }, () => (
        <div class="p-3.5 border border-border rounded-lg bg-card">
          <div class="rounded-lg bg-surface-3 border border-border h-[11px] mb-2 w-[70px]" />
          <div class="rounded-lg bg-surface-3 border border-border h-[22px] mb-1.5 w-[40px]" />
          <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[80px]" />
        </div>
      ))}
    </div>
    <div class="flex flex-col gap-2.5 mt-4">
      {Array.from({ length: 3 }, () => (
        <div class="rounded-lg bg-surface-3 border border-border h-16 w-full" />
      ))}
    </div>
  </>
)

/** Skeleton for LearningLoopPanel — summary line + entry cards */
export const SkeletonLearningLoop: Component = () => (
  <>
    <div class="flex flex-wrap gap-3 mb-4 p-3 border border-border-subtle rounded-lg bg-surface-1">
      {Array.from({ length: 4 }, () => (
        <div class="flex flex-col gap-0.5">
          <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[60px] mb-1.5" />
          <div class="rounded-lg bg-surface-3 border border-border h-5 w-[40px]" />
        </div>
      ))}
    </div>
    <div class="flex flex-col gap-2.5 mt-4">
      {Array.from({ length: 4 }, () => (
        <div class="rounded-lg bg-surface-3 border border-border h-[72px] w-full" />
      ))}
    </div>
  </>
)

/** Skeleton for OpportunityBoardPanel — opportunity list rows */
export const SkeletonOpportunityBoard: Component = () => (
  <div class="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
    {Array.from({ length: 3 }, () => (
      <div class="flex justify-between items-start gap-4 p-3.5 border border-border rounded-lg bg-card">
        <div class="min-w-0 flex-1 flex flex-col gap-1.5">
          <div class="rounded-lg bg-surface-3 border border-border h-4 w-3/5 mb-1.5" />
          <div class="rounded-lg bg-surface-3 border border-border h-[12px] w-2/5" style={{ 'margin-bottom': '4px' }} />
          <div class="rounded-lg bg-surface-3 border border-border h-[12px] w-4/5" />
        </div>
        <div class="rounded-lg bg-surface-3 border border-border h-8 w-[70px]" />
      </div>
    ))}
  </div>
)

/** Skeleton for OperationsPanel flag list — flag rows in a 2-col grid */
export const SkeletonFlagList: Component = () => (
  <div class="grid grid-cols-2 gap-6">
    {Array.from({ length: 4 }, () => (
      <div class="flex items-center justify-between gap-3 py-2 border-b border-border">
        <div>
          <div class="rounded-lg bg-surface-3 border border-border h-[14px] w-[120px] mb-1.5" />
          <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[180px]" />
        </div>
        <div class="rounded-lg bg-surface-3 border border-border h-6 w-[50px] rounded-full" />
      </div>
    ))}
  </div>
)

/** Skeleton for OperationsPanel autopilot KPIs — 4-col KPI grid */
export const SkeletonAutopilotKpis: Component = () => (
  <div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2.5 mt-4">
    {Array.from({ length: 4 }, () => (
      <div class="p-3.5 border border-border rounded-lg bg-card">
        <div class="rounded-lg bg-surface-3 border border-border h-[11px] mb-2 w-[60px]" />
        <div class="rounded-lg bg-surface-3 border border-border h-[22px] mb-1.5 w-[40px]" />
        <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[80px]" />
      </div>
    ))}
  </div>
)

/** Generic tab content skeleton — shown when a tab's panels are loading
 *  for the first time. Two panel-shaped shimmer blocks match the typical
 *  tab layout without being specific to any one tab. */
export const SkeletonTabContent: Component = () => (
  <>
    <Card class="p-6" style={{ 'min-height': '180px' }}>
      <div class="rounded-lg bg-surface-3 border border-border h-5 w-[180px] mb-4" />
      <div class="rounded-lg bg-surface-3 border border-border h-[14px] w-full mb-2.5" />
      <div class="rounded-lg bg-surface-3 border border-border h-[14px] w-4/5" />
    </Card>
    <Card class="p-6" style={{ 'min-height': '140px' }}>
      <div class="rounded-lg bg-surface-3 border border-border h-5 w-[160px] mb-4" />
      <div class="rounded-lg bg-surface-3 border border-border h-[14px] w-full" />
    </Card>
  </>
)

/** Full portfolio page skeleton — mirrors the real page shape:
 *  KPI grid + edges table + fan sources + settings panel.
 *  Replaces the generic SkeletonSection pair that didn't match the layout. */
export const SkeletonPortfolio: Component = () => (
  <>
    {/* Portfolio panel — KPI grid + edges table */}
    <Card class="p-4">
      <div class="flex items-center justify-between gap-4 mb-4">
        <div>
          <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[80px] mb-1.5" />
          <div class="rounded-lg bg-surface-3 border border-border h-[18px] w-[200px]" />
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-8">
        {Array.from({ length: 5 }, () => (
          <div>
            <div class="rounded-lg bg-surface-3 border border-border h-6 w-[60px] mb-1.5" />
            <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[80px]" />
          </div>
        ))}
      </div>
      <div class="rounded-lg bg-surface-3 border border-border h-40 w-full" />
    </Card>
    {/* Fan sources panel */}
    <Card class="p-4 mt-4">
      <div class="flex items-center justify-between gap-4 mb-4">
        <div>
          <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[80px] mb-1.5" />
          <div class="rounded-lg bg-surface-3 border border-border h-[18px] w-[160px]" />
        </div>
      </div>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {Array.from({ length: 3 }, () => (
          <div class="rounded-lg bg-surface-3 border border-border h-20" />
        ))}
      </div>
    </Card>
    {/* Settings panel */}
    <Card class="p-4 mt-4">
      <div class="flex items-center justify-between gap-4 mb-4">
        <div>
          <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[60px] mb-1.5" />
          <div class="rounded-lg bg-surface-3 border border-border h-[18px] w-[140px]" />
        </div>
      </div>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {Array.from({ length: 4 }, () => (
          <div class="rounded-lg bg-surface-3 border border-border h-[60px]" />
        ))}
      </div>
    </Card>
  </>
)

/** Signal overview skeleton — mirrors the SignalOverviewPanel shape:
 *  section title + metrics row + cities row. */
export const SkeletonSignalOverview: Component = () => (
  <>
    <div class="flex items-center justify-between gap-4 mb-3" id="signal-overview">
      <div>
        <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[120px] mb-1.5" />
        <div class="rounded-lg bg-surface-3 border border-border h-[18px] w-[180px]" />
      </div>
    </div>
    <div class="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {Array.from({ length: 8 }, () => (
        <div class="p-3.5 border border-border rounded-lg bg-card">
          <div class="rounded-lg bg-surface-3 border border-border h-[11px] mb-2 w-[70px]" />
          <div class="rounded-lg bg-surface-3 border border-border h-[22px] mb-1.5 w-[50px]" />
          <div class="rounded-lg bg-surface-3 border border-border h-[11px] w-[80px]" />
        </div>
      ))}
    </div>
  </>
)
