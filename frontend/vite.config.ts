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
      sourcemap: true,
      cssCodeSplit: true,
      reportCompressedSize: true,
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
