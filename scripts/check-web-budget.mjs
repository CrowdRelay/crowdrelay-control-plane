import fs from 'node:fs'
import path from 'node:path'
const dist = path.resolve(import.meta.dirname, '../frontend/dist/assets')
if (!fs.existsSync(dist)) throw new Error('frontend/dist/assets missing; run npm run build first')
let js = 0, css = 0
for (const name of fs.readdirSync(dist)) {
  const size = fs.statSync(path.join(dist, name)).size
  if (name.endsWith('.js')) js += size
  if (name.endsWith('.css')) css += size
}
const JS_BUDGET = 260 * 1024
const CSS_BUDGET = 80 * 1024
if (js > JS_BUDGET) throw new Error(`JS budget exceeded: ${js} > ${JS_BUDGET}`)
if (css > CSS_BUDGET) throw new Error(`CSS budget exceeded: ${css} > ${CSS_BUDGET}`)
console.log(`CONTROL_PLANE_WEB_BUDGET=PASS js=${js} css=${css}`)
