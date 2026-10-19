import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * The API the app's /api calls go to. 4100 unless told otherwise, so a second
 * instance — one to try the app in, beside the browser suite's, which resets
 * its data on every run — can run against an API of its own.
 */
const api = process.env['WECHART_API_URL'] ?? 'http://localhost:4100';

/**
 * To the API: its routes, and sign-in's own pages for its end (design 09,
 * states C and D; T697), which the API serves whole, as the web server routes
 * them in a deployment.
 */
const toApi = { target: api, changeOrigin: true };
const proxy = {
  '/api': toApi,
  '^/(signed-out|sign-in-failed)$': toApi,
};

export default defineConfig({
  plugins: [react()],
  // The browser only ever talks to wechart's own origin; the API holds the
  // Cube credentials and the browser never sees them (AC-007).
  //
  // Declared twice on purpose: `server.proxy` is the dev server's and
  // `preview.proxy` is the built app's, and Vite does not share them. The
  // browser suite serves the build, so without the second one every /api call
  // in it would 404.
  server: { proxy },
  preview: { proxy },
  build: {
    rolldownOptions: {
      output: {
        // The Text tile's editor (Tiptap and ProseMirror) is its own chunk,
        // which only editing a text loads, never view mode (AC-514). Named so
        // a test can tell it apart from the rest.
        chunkFileNames: (chunk) =>
          chunk.name === 'TextEditor' ? 'assets/text-editor-[hash].js' : 'assets/[name]-[hash].js',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
