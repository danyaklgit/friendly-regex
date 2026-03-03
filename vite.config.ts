import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api/identity': {
        target: 'https://identity.swittlelab.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/identity/, ''),
      },
    },
  },
})
