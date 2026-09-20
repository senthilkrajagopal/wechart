import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    // The browser only ever talks to wechart's own origin; the API holds the
    // Cube credentials and the browser never sees them (AC-007).
    proxy: { '/api': { target: 'http://localhost:4100', changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
