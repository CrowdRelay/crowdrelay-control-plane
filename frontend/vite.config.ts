import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
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
      '/api': 'http://127.0.0.1:8090',
      '/healthz': 'http://127.0.0.1:8090',
    },
  },
})
