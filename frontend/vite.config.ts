import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // '.' is this config's own directory, so no node typings are needed here.
  const env = loadEnv(mode, '.', '')
  const apiTarget = env.VITE_API_URL || 'http://localhost:4000'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      open: false,
      /* With VITE_API_URL unset the client calls /api on its own origin, and
         this forwards that to the backend — same-origin in the browser, so no
         CORS preflight and no hard-coded host in the bundle. */
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
  }
})
