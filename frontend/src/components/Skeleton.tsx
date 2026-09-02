import type { Component } from 'solid-js'

// Reusable skeleton loading placeholders.
// Uses the existing shimmer animation from styles.css.

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
  <div class="skeleton-grid" style={{ 'grid-template-columns': 'repeat(auto-fill, minmax(280px, 1fr))', display: 'grid', gap: '12px' }}>
    {Array.from({ length: props.count ?? 3 }, () => (
      <div style={{ height: props.minCardHeight ?? '160px', 'border-radius': '12px' }} />
    ))}
  </div>
)

export const SkeletonRows: Component<{ count?: number }> = (props) => (
  <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px', 'margin-top': '16px' }}>
    {Array.from({ length: props.count ?? 4 }, () => (
      <div class="skeleton-block" style={{ height: '48px', 'border-radius': '12px' }} />
    ))}
  </div>
)

export const SkeletonPanel: Component<{ lines?: number }> = (props) => (
  <div class="panel" style={{ padding: '20px' }}>
    <div class="skeleton-block" style={{ height: '20px', width: '180px', 'border-radius': '8px', 'margin-bottom': '16px' }} />
    {Array.from({ length: props.lines ?? 3 }, () => (
      <div class="skeleton-block" style={{ height: '14px', width: '100%', 'border-radius': '6px', 'margin-bottom': '10px' }} />
    ))}
  </div>
)

// ── Layout-matching skeletons — make pages FEEL fast ──────────────
// These mirror the actual page layout shapes so the browser paints
// the full layout immediately and data populates into place.

/** Page header skeleton — eyebrow + h1 + paragraph */
export const SkeletonPageHead: Component = () => (
  <div class="page-head">
    <div>
      <div class="skeleton-block" style={{ height: '12px', width: '120px', 'border-radius': '6px', 'margin-bottom': '10px' }} />
      <div class="skeleton-block" style={{ height: '28px', width: '280px', 'border-radius': '8px', 'margin-bottom': '8px' }} />
      <div class="skeleton-block" style={{ height: '14px', width: '420px', 'border-radius': '6px' }} />
    </div>
    <div class="skeleton-block" style={{ height: '28px', width: '90px', 'border-radius': '999px' }} />
  </div>
)

/** KPI strip skeleton — row of metric cards */
export const SkeletonKpiStrip: Component<{ count?: number }> = (props) => (
  <div class="ops-kpi-strip">
    {Array.from({ length: props.count ?? 3 }, () => (
      <div class="ops-kpi-card">
        <div class="skeleton-block" style={{ height: '11px', width: '70px', 'border-radius': '5px' }} />
        <div class="skeleton-block" style={{ height: '24px', width: '50px', 'border-radius': '6px', 'margin': '8px 0 6px' }} />
        <div class="skeleton-block" style={{ height: '11px', width: '90px', 'border-radius': '5px' }} />
      </div>
    ))}
  </div>
)

/** Panel skeleton — section title + body lines */
export const SkeletonSection: Component<{ titleWidth?: string; lines?: number; minHeight?: string }> = (props) => (
  <article class="panel" style={{ 'min-height': props.minHeight ?? 'auto' }}>
    <div class="section-title" style={{ 'margin-bottom': '16px' }}>
      <div>
        <div class="skeleton-block" style={{ height: '11px', width: '80px', 'border-radius': '5px', 'margin-bottom': '6px' }} />
        <div class="skeleton-block" style={{ height: '18px', width: props.titleWidth ?? '200px', 'border-radius': '6px' }} />
      </div>
    </div>
    {Array.from({ length: props.lines ?? 3 }, () => (
      <div class="skeleton-block" style={{ height: '14px', width: '100%', 'border-radius': '6px', 'margin-bottom': '10px' }} />
    ))}
  </article>
)

/** Two-column grid skeleton — for detail-grid layouts */
export const SkeletonDetailGrid: Component<{ leftHeight?: string; rightHeight?: string }> = (props) => (
  <div class="detail-grid">
    <div class="skeleton-block" style={{ height: props.leftHeight ?? '200px', 'border-radius': 'var(--radius-lg)' }} />
    <div class="skeleton-block" style={{ height: props.rightHeight ?? '200px', 'border-radius': 'var(--radius-lg)' }} />
  </div>
)

/** Brain group skeleton — for intelligence page sections */
export const SkeletonBrainGroup: Component<{ label?: string }> = (props) => (
  <div class="brain-group">
    <div class="brain-group-head">
      <div class="skeleton-block" style={{ height: '11px', width: '100px', 'border-radius': '5px', 'margin-bottom': '6px' }} />
      <div class="skeleton-block" style={{ height: '18px', width: '180px', 'border-radius': '6px' }} />
    </div>
    <div class="skeleton-block" style={{ height: '120px', 'border-radius': 'var(--radius-lg)', 'margin-top': '14px' }} />
  </div>
)

/** Full operations page skeleton — KPI strips + panels */
export const SkeletonOperationsPage: Component = () => (
  <>
    <SkeletonPageHead />
    <SkeletonKpiStrip count={3} />
    <SkeletonKpiStrip count={3} />
    <SkeletonKpiStrip count={1} />
    <div class="skeleton-block" style={{ height: '180px', 'border-radius': 'var(--radius-lg)', 'margin-top': '16px' }} />
    <div class="cockpit-primary" style={{ 'margin-top': '16px' }}>
      <div class="skeleton-block" style={{ height: '280px', 'border-radius': 'var(--radius-lg)' }} />
      <div class="skeleton-block" style={{ height: '280px', 'border-radius': 'var(--radius-lg)' }} />
    </div>
    <SkeletonSection titleWidth="160px" lines={4} minHeight="160px" />
  </>
)

/** Full intelligence page skeleton — brain groups + subsystem grid */
export const SkeletonIntelligencePage: Component = () => (
  <>
    <SkeletonPageHead />
    <div class="skeleton-block" style={{ height: '80px', 'border-radius': '12px', 'margin-top': '16px' }} />
    <SkeletonBrainGroup />
    <SkeletonBrainGroup />
    <SkeletonBrainGroup />
    <SkeletonBrainGroup />
    <div class="intel-section" style={{ 'margin-top': '20px' }}>
      <div class="skeleton-block" style={{ height: '18px', width: '140px', 'border-radius': '6px', 'margin-bottom': '14px' }} />
      <div class="intel-subsystem-grid">
        {Array.from({ length: 5 }, () => (
          <div class="skeleton-block" style={{ height: '160px', 'border-radius': 'var(--radius-lg)' }} />
        ))}
      </div>
    </div>
  </>
)

/** Full attention page skeleton — sections + metric rows */
export const SkeletonAttentionPage: Component = () => (
  <>
    <SkeletonPageHead />
    <div class="skeleton-block" style={{ height: '80px', 'border-radius': '12px', 'margin-top': '16px' }} />
    <SkeletonSection titleWidth="200px" lines={3} minHeight="120px" />
    <div class="operations-metrics" style={{ 'margin-top': '16px' }}>
      {Array.from({ length: 4 }, () => (
        <div class="skeleton-block" style={{ height: '80px', 'border-radius': '10px' }} />
      ))}
    </div>
    <SkeletonSection titleWidth="180px" lines={4} minHeight="140px" />
    <div class="operations-metrics" style={{ 'margin-top': '16px' }}>
      {Array.from({ length: 4 }, () => (
        <div class="skeleton-block" style={{ height: '80px', 'border-radius': '10px' }} />
      ))}
    </div>
    <SkeletonSection titleWidth="160px" lines={3} minHeight="120px" />
  </>
)

/** Full tenant detail page skeleton — header + detail grid + panels */
export const SkeletonTenantPage: Component = () => (
  <>
    <SkeletonPageHead />
    <SkeletonDetailGrid leftHeight="220px" rightHeight="220px" />
    <div class="skeleton-block" style={{ height: '140px', 'border-radius': 'var(--radius-lg)', 'margin-top': '16px' }} />
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
    <div class="panel-grid" style={{ display: 'grid', 'grid-template-columns': 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px', 'margin-top': '16px' }}>
      <SkeletonSection titleWidth="160px" lines={4} minHeight="180px" />
      <SkeletonSection titleWidth="200px" lines={3} minHeight="180px" />
      <SkeletonSection titleWidth="140px" lines={5} minHeight="180px" />
    </div>
    <div class="skeleton-block" style={{ height: '220px', 'border-radius': 'var(--radius-lg)', 'margin-top': '16px' }} />
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
          <div class="skeleton-block" style={{ height: '11px', width: '70px', 'border-radius': '5px', 'margin-bottom': '8px' }} />
          <div class="skeleton-block" style={{ height: '22px', width: '50px', 'border-radius': '6px', 'margin-bottom': '6px' }} />
          <div class="skeleton-block" style={{ height: '11px', width: '90px', 'border-radius': '5px' }} />
        </div>
      ))}
    </div>
    <section class="operations-section">
      <div class="operations-section-head">
        <div class="skeleton-block" style={{ height: '11px', width: '80px', 'border-radius': '5px', 'margin-bottom': '6px' }} />
        <div class="skeleton-block" style={{ height: '18px', width: '120px', 'border-radius': '6px' }} />
      </div>
      <div class="operations-metrics">
        {Array.from({ length: 4 }, () => (
          <div>
            <div class="skeleton-block" style={{ height: '11px', width: '60px', 'border-radius': '5px', 'margin-bottom': '8px' }} />
            <div class="skeleton-block" style={{ height: '22px', width: '40px', 'border-radius': '6px', 'margin-bottom': '6px' }} />
            <div class="skeleton-block" style={{ height: '11px', width: '80px', 'border-radius': '5px' }} />
          </div>
        ))}
      </div>
    </section>
    <section class="operations-section">
      <div class="operations-section-head">
        <div class="skeleton-block" style={{ height: '11px', width: '80px', 'border-radius': '5px', 'margin-bottom': '6px' }} />
        <div class="skeleton-block" style={{ height: '18px', width: '100px', 'border-radius': '6px' }} />
      </div>
      <div class="operations-metrics">
        {Array.from({ length: 4 }, () => (
          <div>
            <div class="skeleton-block" style={{ height: '11px', width: '60px', 'border-radius': '5px', 'margin-bottom': '8px' }} />
            <div class="skeleton-block" style={{ height: '22px', width: '40px', 'border-radius': '6px', 'margin-bottom': '6px' }} />
            <div class="skeleton-block" style={{ height: '11px', width: '80px', 'border-radius': '5px' }} />
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
          <div class="skeleton-block" style={{ height: '11px', width: '70px', 'border-radius': '5px', 'margin-bottom': '8px' }} />
          <div class="skeleton-block" style={{ height: '22px', width: '40px', 'border-radius': '6px', 'margin-bottom': '6px' }} />
          <div class="skeleton-block" style={{ height: '11px', width: '80px', 'border-radius': '5px' }} />
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px', 'margin-top': '16px' }}>
      {Array.from({ length: 3 }, () => (
        <div class="skeleton-block" style={{ height: '64px', width: '100%', 'border-radius': '10px' }} />
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
          <div class="skeleton-block" style={{ height: '11px', width: '60px', 'border-radius': '5px', 'margin-bottom': '6px' }} />
          <div class="skeleton-block" style={{ height: '20px', width: '40px', 'border-radius': '6px' }} />
        </div>
      ))}
    </div>
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px', 'margin-top': '16px' }}>
      {Array.from({ length: 4 }, () => (
        <div class="skeleton-block" style={{ height: '72px', width: '100%', 'border-radius': '10px' }} />
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
          <div class="skeleton-block" style={{ height: '16px', width: '60%', 'border-radius': '6px', 'margin-bottom': '6px' }} />
          <div class="skeleton-block" style={{ height: '12px', width: '40%', 'border-radius': '5px', 'margin-bottom': '4px' }} />
          <div class="skeleton-block" style={{ height: '12px', width: '80%', 'border-radius': '5px' }} />
        </div>
        <div class="skeleton-block" style={{ height: '32px', width: '70px', 'border-radius': '8px' }} />
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
          <div class="skeleton-block" style={{ height: '14px', width: '120px', 'border-radius': '6px', 'margin-bottom': '6px' }} />
          <div class="skeleton-block" style={{ height: '11px', width: '180px', 'border-radius': '5px' }} />
        </div>
        <div class="skeleton-block" style={{ height: '24px', width: '50px', 'border-radius': '999px' }} />
      </div>
    ))}
  </div>
)

/** Skeleton for OperationsPanel autopilot KPIs — 4-col KPI grid */
export const SkeletonAutopilotKpis: Component = () => (
  <div class="autopilot-kpis">
    {Array.from({ length: 4 }, () => (
      <div>
        <div class="skeleton-block" style={{ height: '11px', width: '60px', 'border-radius': '5px', 'margin-bottom': '8px' }} />
        <div class="skeleton-block" style={{ height: '22px', width: '40px', 'border-radius': '6px', 'margin-bottom': '6px' }} />
        <div class="skeleton-block" style={{ height: '11px', width: '80px', 'border-radius': '5px' }} />
      </div>
    ))}
  </div>
)

/** Skeleton for BrainDecisionPanel — decision narrative layout */
export const SkeletonBrainDecision: Component = () => (
  <div class="brain-decision-body">
    <div class="brain-decision-what">
      <div class="skeleton-block" style={{ height: '20px', width: '50%', 'border-radius': '6px', 'margin-bottom': '8px' }} />
      <div class="skeleton-block" style={{ height: '12px', width: '40%', 'border-radius': '5px' }} />
    </div>
    <div class="brain-decision-why">
      <div class="skeleton-block" style={{ height: '11px', width: '40px', 'border-radius': '5px', 'margin-bottom': '8px' }} />
      <div class="skeleton-block" style={{ height: '14px', width: '100%', 'border-radius': '6px', 'margin-bottom': '6px' }} />
      <div class="skeleton-block" style={{ height: '14px', width: '90%', 'border-radius': '6px' }} />
    </div>
    <div class="brain-decision-factors">
      {Array.from({ length: 3 }, () => (
        <div class="brain-decision-factor">
          <div class="skeleton-block" style={{ height: '11px', width: '50px', 'border-radius': '5px', 'margin-bottom': '6px' }} />
          <div class="skeleton-block" style={{ height: '16px', width: '40px', 'border-radius': '5px' }} />
        </div>
      ))}
    </div>
  </div>
)

/** Generic tab content skeleton — shown when a tab's panels are loading
 *  for the first time. Two panel-shaped shimmer blocks match the typical
 *  tab layout without being specific to any one tab. */
export const SkeletonTabContent: Component = () => (
  <>
    <article class="panel" style={{ padding: '24px', 'min-height': '180px' }}>
      <div class="skeleton-block" style={{ height: '20px', width: '180px', 'border-radius': '8px', 'margin-bottom': '16px' }} />
      <div class="skeleton-block" style={{ height: '14px', width: '100%', 'border-radius': '6px', 'margin-bottom': '10px' }} />
      <div class="skeleton-block" style={{ height: '14px', width: '80%', 'border-radius': '6px' }} />
    </article>
    <article class="panel" style={{ padding: '24px', 'min-height': '140px' }}>
      <div class="skeleton-block" style={{ height: '20px', width: '160px', 'border-radius': '8px', 'margin-bottom': '16px' }} />
      <div class="skeleton-block" style={{ height: '14px', width: '100%', 'border-radius': '6px' }} />
    </article>
  </>
)
