import type { JSX } from 'solid-js'

export type TabId = 'overview' | 'foundations' | 'layout' | 'components' | 'patterns' | 'inventory'

/**
 * - `stable`  — the one to use. New code reaches for this.
 * - `legacy`  — still rendered somewhere, kept working, never used in new
 *               code. The page names what replaces it.
 * - `planned` — not built yet. The page says what it will be and which
 *               shadcn recipe to add, so the next person builds the same one.
 */
export type Status = 'stable' | 'legacy' | 'planned'

export type DocEntry = {
  /** URL segment: `/styleguide#components/button`. */
  id: string
  tab: TabId
  /** Left-nav group inside the tab. */
  group: string
  title: string
  status?: Status
  /** One sentence under the title. */
  summary: string
  /**
   * Files this page documents, relative to `src/`. The Inventory tab and
   * `scripts/test_styleguide_coverage.py` read these to tell which component
   * files have a page and which do not.
   */
  sources?: string[]
  /**
   * Files whose git history is this page's changelog, when that differs
   * from `sources` — a pattern or foundation page follows the files it
   * explains without claiming to document them. Defaults to `sources`.
   */
  history?: string[]
  /** Extra words the search box matches. */
  keywords?: string
  /** What replaces a legacy entry. */
  replacedBy?: string
  render: () => JSX.Element
}
