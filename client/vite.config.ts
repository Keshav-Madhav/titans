import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base: the same dist works from a domain root or a sub-path.
  base: './',
  build: { sourcemap: true, outDir: 'dist', chunkSizeWarningLimit: 1200 },
  server: { port: 5317 },
})
