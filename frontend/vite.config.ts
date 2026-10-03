import { defineConfig, loadEnv } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { apiMock } from './mock/api-mock-plugin'
import { styleguideHistory } from './dev/styleguide-history-plugin'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const adminToken = env.CONTROL_PLANE_ADMIN_TOKEN?.trim() ?? ''
  // The `demo.admin` account answers /api with generated fake data on any dev
  // server (mock/api-mock-plugin.ts). `npm run dev:mock` answers every request
  // that way, signed in or not, so it needs no backend and no token.
  // Without an admin token there is nothing safe to proxy to, so the dev server
  // still starts — answering everything as `demo.admin` instead of refusing to.
  const noToken = command === 'serve' && adminToken.length < 32
  if (noToken && env.CONTROL_PLANE_MOCK_API !== '1') {
    console.warn('[api-mock] CONTROL_PLANE_ADMIN_TOKEN is not set (32+ characters) — serving demo.admin fake data only')
  }
  const mockApi = command === 'serve' && (env.CONTROL_PLANE_MOCK_API === '1' || noToken)
  const apiTarget = env.CONTROL_PLANE_API_URL?.trim() || 'http://127.0.0.1:8090'

  return {
    plugins: [tailwindcss(), solid(), apiMock({ root: fileURLToPath(new URL('.', import.meta.url)), always: mockApi, apiTarget, adminToken }),
      // Dev only: git history behind the style guide's "updated" dates and changelogs.
      styleguideHistory({ root: fileURLToPath(new URL('.', import.meta.url)) })],
    resolve: {
      alias: {
        '~': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      target: 'es2022',
      // Maps were 712 KiB against 171 KiB of JS, sat unbudgeted in the
      // production image and were served verbatim by ServeDir, handing the
      // original TypeScript to anyone who reaches the panel. The dev server
      // keeps its own maps regardless; opt in only to debug a built bundle.
      sourcemap: env.CONTROL_PLANE_WEB_SOURCEMAPS === '1',
      cssCodeSplit: true,
      // Gzipping every asset just to print a size the budget script already
      // measures from disk. Off, so the build stops paying for it.
      reportCompressedSize: false,
      rollupOptions: {
        output: {
          // Split framework code into a stable vendor chunk so it caches
          // across deploys and route chunks stay small.
          manualChunks(id) {
            if (id.includes('node_modules/solid-js/')) return 'solid-vendor'
            if (id.includes('node_modules/@tanstack/')) return 'tanstack-vendor'
            if (id.includes('node_modules/@kobalte/')) return 'kobalte-vendor'
          },
        },
      },
    },
    server: {
      port: 4173,
      proxy: {
        '/api': {
          // The local stack's default; point at another listener (a capture
          // mock, a staging build) with CONTROL_PLANE_API_URL.
          target: apiTarget,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${adminToken}`)
            })
          },
        },
        '/healthz': apiTarget,
      },
    },
  }
})
