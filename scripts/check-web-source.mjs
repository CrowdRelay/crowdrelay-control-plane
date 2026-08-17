import fs from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const main = fs.readFileSync(path.join(root, 'frontend/src/main.tsx'), 'utf8')
const tenant = fs.readFileSync(path.join(root, 'frontend/src/pages/TenantPage.tsx'), 'utf8')
const api = fs.readFileSync(path.join(root, 'frontend/src/lib/api.ts'), 'utf8')
if (!main.includes('@tanstack/solid-query') || !main.includes('@tanstack/solid-router')) throw new Error('Solid Query/Router contract missing')
if (!tenant.includes('Synesthesia') || !tenant.includes('Virya only')) throw new Error('Synesthesia product boundary UI missing')
if (!api.includes("authorization: `Bearer ${token}`")) throw new Error('admin bearer boundary missing')
console.log('CONTROL_PLANE_WEB_SOURCE=PASS')
