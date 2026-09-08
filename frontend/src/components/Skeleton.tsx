import type { Component } from 'solid-js'

// Reusable skeleton loading placeholders.
// Uses the existing shimmer animation from styles.css.
// Dimension utilities (.skel-w*, .skel-h*, .skel-r*, .skel-mb*) are in styles.css.

export const SkeletonBlock: Component<{ height?: string; width?: string; radius?: string }> = (props) => (
  <div
    class="skeleton-block"
    style={{
      height: props.height ?? '120px',
      width: props.width ?? '100%',
      'border-radius': props.radius ?? 'var(--radius-lg)',
    }}
  />
)

export const SkeletonGrid: Component<{ count?: number; minCardHeight?: string }> = (props) => (
  <div class="skeleton-grid skel-grid-2">
    {Array.from({ length: props.count ?? 3 }, () => (
      <div class="skeleton-block skel-r12" style={{ height: props.minCardHeight ?? '160px' }} />
    ))}
  </div>
)

export const SkeletonRows: Component<{ count?: number }> = (props) => (
  <div class="skel-rows">
    {Array.from({ length: props.count ?? 4 }, () => (
      <div class="skeleton-block skel-h48 skel-r12" />
    ))}
  </div>
)

export const SkeletonPanel: Component<{ lines?: number }> = (props) => (
  <div class="panel" style={{ padding: '20px' }}>
    <div class="skeleton-block skel-h20 skel-w180 skel-r8 skel-mb16" />
    {Array.from({ length: props.lines ?? 3 }, () => (
      <div class="skeleton-block skel-text skel-w100pct" />
    ))}
  </div>
)

// ── Layout-matching skeletons — make pages FEEL fast ──────────────
// These mirror the actual page layout shapes so the browser paints
// the full layout immediately and data populates into place.

/** Page header skeleton — eyebrow + h1 + paragraph.
 *  Internal helper used by composite page skeletons. */
const SkeletonPageHead: Component = () => (
  <div class="page-head">
    <div>
      <div class="skeleton-block skel-h12 skel-w120 skel-r6 skel-mb10" />
      <div class="skeleton-block skel-h28 skel-w280 skel-r8" style={{ 'margin-bottom': '8px' }} />
      <div class="skeleton-block skel-h14 skel-w420 skel-r6" />
    </div>
    <div class="skeleton-block skel-h28 skel-w90 skel-r-full" />
  </div>
)

/** KPI strip skeleton — row of metric cards */
export const SkeletonKpiStrip: Component<{ count?: number }> = (props) => (
  <div class="ops-kpi-strip">
    {Array.from({ length: props.count ?? 3 }, () => (
      <div class="ops-kpi-card">
        <div class="skeleton-block skel-label skel-w70" />
        <div class="skeleton-block skel-value skel-w50" />
        <div class="skeleton-block skel-small skel-w90" />
      </div>
    ))}
  </div>
)

/** Panel skeleton — section title + body lines */
export const SkeletonSection: Component<{ titleWidth?: string; lines?: number; minHeight?: string }> = (props) => (
  <article class="panel" style={{ 'min-height': props.minHeight ?? 'auto' }}>
    <div class="section-title skel-mb16">
      <div>
        <div class="skeleton-block skel-h11 skel-w80 skel-r5 skel-mb6" />
        <div class="skeleton-block skel-h18 skel-r6" style={{ width: props.titleWidth ?? '200px' }} />
      </div>
    </div>
    {Array.from({ length: props.lines ?? 3 }, () => (
      <div class="skeleton-block skel-h14 skel-w100pct skel-r6 skel-mb10" />
    ))}
  </article>
)

/** Two-column grid skeleton — for detail-grid layouts.
 *  Internal helper used by SkeletonTenantPage. */
const SkeletonDetailGrid: Component<{ leftHeight?: string; rightHeight?: string }> = (props) => (
  <div class="detail-grid">
    <div class="skeleton-block" style={{ height: props.leftHeight ?? '200px', 'border-radius': 'var(--radius-lg)' }} />
    <div class="skeleton-block" style={{ height: props.rightHeight ?? '200px', 'border-radius': 'var(--radius-lg)' }} />
  </div>
)

/** Brain group skeleton — for intelligence page sections */
export const SkeletonBrainGroup: Component<{ label?: string }> = (props) => (
  <div class="brain-group">
    <div class="brain-group-head">
      <div class="skeleton-block skel-h11 skel-w100 skel-r5 skel-mb6" />
      <div class="skeleton-block skel-h18 skel-w180 skel-r6" />
    </div>
    <div class="skeleton-block skel-h120 skel-mt16" style={{ 'border-radius': 'var(--radius-lg)' }} />
  </div>
)

/** Full tenant detail page skeleton — header + detail grid + panels */
export const SkeletonTenantPage: Component = () => (
  <>
    <SkeletonPageHead />
    <SkeletonDetailGrid leftHeight="220px" rightHeight="220px" />
    <div class="skeleton-block skel-h140 skel-mt16" style={{ 'border-radius': 'var(--radius-lg)' }} />
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
  <section class="page">
    <SkeletonPageHead />
    <SkeletonKpiStrip count={4} />
    <div class="panel-grid skel-grid-wide">
      <SkeletonSection titleWidth="160px" lines={4} minHeight="180px" />
      <SkeletonSection titleWidth="200px" lines={3} minHeight="180px" />
      <SkeletonSection titleWidth="140px" lines={5} minHeight="180px" />
    </div>
    <div class="skeleton-block skel-h220 skel-mt16" style={{ 'border-radius': 'var(--radius-lg)' }} />
  </section>
)

// ── Panel-specific skeletons — match each panel's real layout shape ──
// These replace the old `mini-skeleton` (a 100px shimmer bar) that caused
// layout shift when data arrived. Each skeleton occupies the same space
// the real content will, so the swap is invisible.

/** Skeleton for ScorecardPanel — status metrics row + week summary + track record */
export const SkeletonScorecard: Component = () => (
  <>
    <div class="operations-metrics">
      {Array.from({ length: 3 }, () => (
        <div>
          <div class="skeleton-block skel-label skel-w70" />
          <div class="skeleton-block skel-value skel-w50" />
          <div class="skeleton-block skel-small skel-w90" />
        </div>
      ))}
    </div>
    <section class="operations-section">
      <div class="operations-section-head">
        <div class="skeleton-block skel-small skel-w80 skel-mb6" />
        <div class="skeleton-block skel-h18 skel-w120 skel-r6" />
      </div>
      <div class="operations-metrics">
        {Array.from({ length: 4 }, () => (
          <div>
            <div class="skeleton-block skel-label skel-w60" />
            <div class="skeleton-block skel-value skel-w40" />
            <div class="skeleton-block skel-small skel-w80" />
          </div>
        ))}
      </div>
    </section>
    <section class="operations-section">
      <div class="operations-section-head">
        <div class="skeleton-block skel-small skel-w80 skel-mb6" />
        <div class="skeleton-block skel-h18 skel-w100 skel-r6" />
      </div>
      <div class="operations-metrics">
        {Array.from({ length: 4 }, () => (
          <div>
            <div class="skeleton-block skel-label skel-w60" />
            <div class="skeleton-block skel-value skel-w40" />
            <div class="skeleton-block skel-small skel-w80" />
          </div>
        ))}
      </div>
    </section>
  </>
)

/** Skeleton for ReplyTriagePanel — summary metrics + reply rows */
export const SkeletonReplyTriage: Component = () => (
  <>
    <div class="operations-metrics">
      {Array.from({ length: 3 }, () => (
        <div>
          <div class="skeleton-block skel-label skel-w70" />
          <div class="skeleton-block skel-value skel-w40" />
          <div class="skeleton-block skel-small skel-w80" />
        </div>
      ))}
    </div>
    <div class="skel-rows">
      {Array.from({ length: 3 }, () => (
        <div class="skeleton-block skel-h64 skel-w100pct skel-r10" />
      ))}
    </div>
  </>
)

/** Skeleton for LearningLoopPanel — summary line + entry cards */
export const SkeletonLearningLoop: Component = () => (
  <>
    <div class="learning-loop-summary">
      {Array.from({ length: 4 }, () => (
        <div class="learning-loop-stat">
          <div class="skeleton-block skel-small skel-w60 skel-mb6" />
          <div class="skeleton-block skel-h20 skel-w40 skel-r6" />
        </div>
      ))}
    </div>
    <div class="skel-rows">
      {Array.from({ length: 4 }, () => (
        <div class="skeleton-block skel-h72 skel-w100pct skel-r10" />
      ))}
    </div>
  </>
)

/** Skeleton for OpportunityBoardPanel — opportunity list rows */
export const SkeletonOpportunityBoard: Component = () => (
  <div class="flag-list opportunity-list">
    {Array.from({ length: 3 }, () => (
      <div class="flag-row release-component-row opportunity-row">
        <div class="opportunity-body">
          <div class="skeleton-block skel-h16 skel-w60pct skel-r6 skel-mb6" />
          <div class="skeleton-block skel-h12 skel-w40pct skel-r5" style={{ 'margin-bottom': '4px' }} />
          <div class="skeleton-block skel-h12 skel-w80pct skel-r5" />
        </div>
        <div class="skeleton-block skel-h32 skel-w70 skel-r8" />
      </div>
    ))}
  </div>
)

/** Skeleton for OperationsPanel flag list — flag rows in a 2-col grid */
export const SkeletonFlagList: Component = () => (
  <div class="flag-list" style={{ display: 'grid', 'grid-template-columns': 'repeat(2, minmax(0,1fr))', 'column-gap': '24px' }}>
    {Array.from({ length: 4 }, () => (
      <div class="flag-row">
        <div>
          <div class="skeleton-block skel-h14 skel-w120 skel-r6 skel-mb6" />
          <div class="skeleton-block skel-h11 skel-w180 skel-r5" />
        </div>
        <div class="skeleton-block skel-h24 skel-w50 skel-r-full" />
      </div>
    ))}
  </div>
)

/** Skeleton for OperationsPanel autopilot KPIs — 4-col KPI grid */
export const SkeletonAutopilotKpis: Component = () => (
  <div class="autopilot-kpis">
    {Array.from({ length: 4 }, () => (
      <div>
        <div class="skeleton-block skel-label skel-w60" />
        <div class="skeleton-block skel-value skel-w40" />
        <div class="skeleton-block skel-small skel-w80" />
      </div>
    ))}
  </div>
)

/** Generic tab content skeleton — shown when a tab's panels are loading
 *  for the first time. Two panel-shaped shimmer blocks match the typical
 *  tab layout without being specific to any one tab. */
export const SkeletonTabContent: Component = () => (
  <>
    <article class="panel" style={{ padding: '24px', 'min-height': '180px' }}>
      <div class="skeleton-block skel-h20 skel-w180 skel-r8 skel-mb16" />
      <div class="skeleton-block skel-h14 skel-w100pct skel-r6 skel-mb10" />
      <div class="skeleton-block skel-h14 skel-w80pct skel-r6" />
    </article>
    <article class="panel" style={{ padding: '24px', 'min-height': '140px' }}>
      <div class="skeleton-block skel-h20 skel-w160 skel-r8 skel-mb16" />
      <div class="skeleton-block skel-h14 skel-w100pct skel-r6" />
    </article>
  </>
)

/** Full portfolio page skeleton — mirrors the real page shape:
 *  KPI grid + edges table + fan sources + settings panel.
 *  Replaces the generic SkeletonSection pair that didn't match the layout. */
export const SkeletonPortfolio: Component = () => (
  <>
    {/* Portfolio panel — KPI grid + edges table */}
    <article class="panel">
      <div class="section-title skel-mb16">
        <div>
          <div class="skeleton-block skel-small skel-w80 skel-mb6" />
          <div class="skeleton-block skel-h18 skel-w200 skel-r6" />
        </div>
      </div>
      <div class="kpi-grid skel-grid-kpi">
        {Array.from({ length: 5 }, () => (
          <div>
            <div class="skeleton-block skel-h24 skel-w60 skel-r6 skel-mb6" />
            <div class="skeleton-block skel-small skel-w80" />
          </div>
        ))}
      </div>
      <div class="skeleton-block skel-h160 skel-w100pct skel-r10" />
    </article>
    {/* Fan sources panel */}
    <article class="panel skel-mt16">
      <div class="section-title skel-mb16">
        <div>
          <div class="skeleton-block skel-small skel-w80 skel-mb6" />
          <div class="skeleton-block skel-h18 skel-w160 skel-r6" />
        </div>
      </div>
      <div class="skel-grid-cards">
        {Array.from({ length: 3 }, () => (
          <div class="skeleton-block skel-h80 skel-r10" />
        ))}
      </div>
    </article>
    {/* Settings panel */}
    <article class="panel skel-mt16">
      <div class="section-title skel-mb16">
        <div>
          <div class="skeleton-block skel-small skel-w60 skel-mb6" />
          <div class="skeleton-block skel-h18 skel-w140 skel-r6" />
        </div>
      </div>
      <div class="skel-grid-settings">
        {Array.from({ length: 4 }, () => (
          <div class="skeleton-block skel-h60 skel-r8" />
        ))}
      </div>
    </article>
  </>
)

/** Signal overview skeleton — mirrors the SignalOverviewPanel shape:
 *  section title + metrics row + cities row. */
export const SkeletonSignalOverview: Component = () => (
  <>
    <div class="section-title" id="signal-overview">
      <div>
        <div class="skeleton-block skel-small skel-w120 skel-mb6" />
        <div class="skeleton-block skel-h18 skel-w180 skel-r6" />
      </div>
    </div>
    <div class="operations-metrics">
      {Array.from({ length: 8 }, () => (
        <div>
          <div class="skeleton-block skel-label skel-w70" />
          <div class="skeleton-block skel-value skel-w50" />
          <div class="skeleton-block skel-small skel-w80" />
        </div>
      ))}
    </div>
  </>
)
