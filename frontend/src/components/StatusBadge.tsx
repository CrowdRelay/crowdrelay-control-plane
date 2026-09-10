import type { Component } from 'solid-js'
import { Badge } from './ui/badge'

const toneToVariant = (tone?: 'good' | 'warn' | 'bad' | 'muted'): 'success' | 'warning' | 'destructive' | 'muted' => {
  switch (tone) {
    case 'good': return 'success'
    case 'warn': return 'warning'
    case 'bad': return 'destructive'
    default: return 'muted'
  }
}

export const StatusBadge: Component<{ status: string; tone?: 'good' | 'warn' | 'bad' | 'muted' }> = (props) => (
  <Badge variant={toneToVariant(props.tone)}>{props.status}</Badge>
)
