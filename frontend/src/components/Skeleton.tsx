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
