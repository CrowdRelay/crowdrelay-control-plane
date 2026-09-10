import { For, type Component } from 'solid-js'

// GitHub-style activity heatmap from timestamped entries.
// Groups entries by day and renders a grid of colored cells.
// All date math is in UTC to avoid timezone off-by-one issues.
//
// Usage:
//   <ActivityHeatmap entries={auditItems} timestampKey="createdAt" />

interface HeatmapCell {
  date: string
  count: number
  intensity: number // 0-1
}

const toUtcDay = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

export const ActivityHeatmap: Component<{
  entries: Array<{ [key: string]: unknown }>
  timestampKey: string
  weeks?: number
}> = (props) => {
  const weeks = () => props.weeks ?? 12
  const totalDays = () => weeks() * 7

  // Group entries by day (YYYY-MM-DD), using UTC consistently
  const cells = (): HeatmapCell[] => {
    const counts = new Map<string, number>()
    for (const entry of props.entries) {
      const ts = entry[props.timestampKey]
      if (typeof ts !== 'string') continue
      const day = ts.slice(0, 10) // backend sends ISO 8601 (UTC)
      counts.set(day, (counts.get(day) ?? 0) + 1)
    }
    const maxCount = Math.max(1, ...counts.values())
    const today = new Date()
    const result: HeatmapCell[] = []
    for (let i = totalDays() - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() - i)
      const dayStr = toUtcDay(d)
      const count = counts.get(dayStr) ?? 0
      result.push({
        date: dayStr,
        count,
        intensity: count / maxCount,
      })
    }
    return result
  }

  // Organize cells into weeks (columns) x days (rows)
  // Align so the first column starts on a Monday.
  // getUTCDay: 0=Sun, 1=Mon, ...
  const grid = (): (HeatmapCell | null)[][] => {
    const all = cells()
    if (all.length === 0) return []
    const firstDate = new Date(all[0]!.date + 'T00:00:00Z')
    const firstDow = firstDate.getUTCDay()
    // Pad to align to Monday (getUTCDay: 0=Sun → pad 6, 1=Mon → pad 0, ...)
    const padCount = firstDow === 0 ? 6 : firstDow - 1
    const padded: (HeatmapCell | null)[] = [...Array(padCount).fill(null), ...all]
    // Split into weeks (columns of 7)
    const cols: (HeatmapCell | null)[][] = []
    for (let i = 0; i < padded.length; i += 7) {
      cols.push(padded.slice(i, i + 7))
    }
    return cols
  }

  const cellColor = (cell: HeatmapCell | null): string => {
    if (!cell || cell.count === 0) return 'rgba(155,135,245,0.06)'
    const alpha = 0.15 + cell.intensity * 0.75
    return `rgba(155,135,245,${alpha})`
  }

  const totalActivity = () => cells().reduce((sum, c) => sum + c.count, 0)
  const activeDays = () => cells().filter(c => c.count > 0).length

  return (
    <div class="flex flex-col gap-1.5 px-4.5 py-3.5 border border-border rounded-lg bg-card mt-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <span class="text-xs font-medium uppercase tracking-wider text-muted-foreground">ACTIVITY HEATMAP</span>
          <div class="mt-0.5">
            <strong>{totalActivity()}</strong>
            <span class="text-muted-foreground">events in {weeks()} weeks · {activeDays()} active days</span>
          </div>
        </div>
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>less</span>
          <div class="w-20 h-2 rounded-sm bg-[linear-gradient(90deg,rgba(155,135,245,0.08),rgba(155,135,245,0.5),#9b87f5)]" />
          <span>more</span>
        </div>
      </div>
      <div class="flex gap-0.75 overflow-x-auto pb-1" style={{ 'grid-template-columns': `repeat(${grid().length}, 13px)` }}>
        <For each={grid()}>{(week) => (
          <div class="flex flex-col gap-0.75">
            <For each={week}>{(cell) => (
              <div
                class="w-2.5 h-2.5 rounded-[2px] transition-transform duration-[120ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.4] hover:z-[1]"
                style={{ background: cellColor(cell) }}
                title={cell ? `${cell.date}: ${cell.count} event${cell.count !== 1 ? 's' : ''}` : ''}
              />
            )}</For>
          </div>
        )}</For>
      </div>
    </div>
  )
}
