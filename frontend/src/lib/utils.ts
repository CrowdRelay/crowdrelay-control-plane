/**
 * solidcn vendored components import `~/lib/utils`. The single implementation
 * lives in `./cn` — this file re-exports it so registry imports resolve
 * verbatim and `solidcn add` output needs no rewriting.
 */
export { cn } from './cn'
