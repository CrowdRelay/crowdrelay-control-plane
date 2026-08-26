import fs from 'node:fs'
import path from 'node:path'
const dist = path.resolve(import.meta.dirname, '../frontend/dist/assets')
if (!fs.existsSync(dist)) throw new Error('frontend/dist/assets missing; run npm run build first')
let js = 0, css = 0
const maps = []
for (const name of fs.readdirSync(dist)) {
  const size = fs.statSync(path.join(dist, name)).size
  if (name.endsWith('.map')) { maps.push(name); continue }
  if (name.endsWith('.js')) js += size
  if (name.endsWith('.css')) css += size
}
// Maps are not counted by the JS/CSS budgets, so without this they can ship
// unnoticed: they are served verbatim by ServeDir and were 4x the JS payload.
if (maps.length) throw new Error(`source maps must not ship: ${maps.join(', ')}`)
// Raised 2026-08-26 from 300 KiB for the Label Portfolio surfaces (roster KPIs,
// consent-edge decisions and per-tenant brand settings), and again same day
// from 320 KiB for the consolidated portfolio read model + fan sources panel
// (section degrades, StatusBadge states, revoke-reason gating). Reviewed
// alongside the feature; not a reflex for accidental growth.
const JS_BUDGET = 324 * 1024
const CSS_BUDGET = 80 * 1024
if (js > JS_BUDGET) throw new Error(`JS budget exceeded: ${js} > ${JS_BUDGET}`)
if (css > CSS_BUDGET) throw new Error(`CSS budget exceeded: ${css} > ${CSS_BUDGET}`)
console.log(`CONTROL_PLANE_WEB_BUDGET=PASS js=${js} css=${css}`)
