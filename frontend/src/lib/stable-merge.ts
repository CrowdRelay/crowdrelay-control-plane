// Structural merge used as the default `reconcile` for every query.
//
// Without it, solid-query replaces the whole store value on each refetch, so
// `<For>` sees brand-new item references and tears down and rebuilds every row
// even when the payload is byte-identical. Measured on the queue inspector: a
// manual refresh recreated every `.queue-row` node. Rebuilt rows lose focus,
// text selection, scroll position inside the row, and any CSS transition
// mid-flight — the "whole page refreshed" feeling.
//
// The alternative, `reconcile: 'id'`, is keyed and handles reordering, but a
// single key has to be valid for *every* array in the payload. Several read
// models carry arrays of primitives (`missing_components: string[]`) or of
// objects with no `id` (`growth-metrics.platforms`, `command-center.perTenant`,
// keyed by `slug`). Keying those by `id` collapses every element onto the same
// `undefined` key, which mis-patches rows rather than merely rebuilding them.
//
// So this is positional and purely structural: it never needs a key, and it can
// only ever be conservative (rebuild) rather than wrong. Queries whose payload
// is a flat, `id`-carrying list still opt into `reconcile: 'id'` explicitly to
// get proper move handling.

function mergeValue(previous: unknown, next: unknown): unknown {
  if (previous === next) return previous
  if (next === null || typeof next !== 'object') return next
  if (previous === null || typeof previous !== 'object') return next

  const nextIsArray = Array.isArray(next)
  if (nextIsArray !== Array.isArray(previous)) return next

  if (nextIsArray) {
    const before = previous as unknown[]
    const after = next as unknown[]
    const merged = new Array(after.length)
    let changed = before.length !== after.length
    for (let index = 0; index < after.length; index += 1) {
      merged[index] = mergeValue(before[index], after[index])
      if (merged[index] !== before[index]) changed = true
    }
    return changed ? merged : previous
  }

  const before = previous as Record<string, unknown>
  const after = next as Record<string, unknown>
  const afterKeys = Object.keys(after)
  const merged: Record<string, unknown> = {}
  // A key that disappeared has to count as a change, so compare both sides.
  let changed = afterKeys.length !== Object.keys(before).length
  for (const key of afterKeys) {
    merged[key] = mergeValue(before[key], after[key])
    if (merged[key] !== before[key]) changed = true
  }
  return changed ? merged : previous
}

/** Reuse the previous value wherever the new one is deeply equal, so unchanged
 *  branches keep their object identity and their DOM. */
export function stableMerge<TData>(previous: TData | undefined, next: TData): TData {
  if (previous === undefined) return next
  return mergeValue(previous, next) as TData
}
