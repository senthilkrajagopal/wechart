import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // The browser only ever talks to wechart's own origin; the API holds the
  // Cube credentials and the browser never sees them (AC-007).
  //
  // Declared twice on purpose: `server.proxy` is the dev server's and
  // `preview.proxy` is the built app's, and Vite does not share them. The
  // browser suite serves the build, so without the second one every /api call
  // in it would 404.
  server: {
    proxy: { '/api': { target: 'http://localhost:4100', changeOrigin: true } },
  },
  preview: {
    proxy: { '/api': { target: 'http://localhost:4100', changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
