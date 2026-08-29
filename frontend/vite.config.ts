import { defineConfig, loadEnv } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const adminToken = env.CONTROL_PLANE_ADMIN_TOKEN?.trim() ?? ''
  if (command === 'serve' && adminToken.length < 32) {
    throw new Error('CONTROL_PLANE_ADMIN_TOKEN must be set to a 32+ character secret for local Vite development')
  }

  return {
    plugins: [solid()],
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
          },
        },
      },
    },
    server: {
      port: 4173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8090',
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${adminToken}`)
            })
          },
        },
        '/healthz': 'http://127.0.0.1:8090',
      },
    },
  }
})
