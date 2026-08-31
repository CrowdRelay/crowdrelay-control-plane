import type { Component } from 'solid-js'

export const StatusBadge: Component<{ status: string; tone?: 'good' | 'warn' | 'bad' | 'muted' }> = (props) => (
  <span class={`badge tone-${props.tone ?? 'muted'}`}>{props.status}</span>
)
