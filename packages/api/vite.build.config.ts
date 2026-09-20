import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

/**
 * Builds the service for running.
 *
 * Node's `--experimental-strip-types` removes TypeScript syntax but does no
 * module resolution, so it needs an explicit `.ts` on every relative import.
 * Rather than spell extensions through the whole package to satisfy the
 * runtime, the service is bundled by Vite — already the toolchain for the web
 * package — which resolves them the way TypeScript does.
 *
 * Dependencies stay external: this bundles our code, not node_modules.
 */
export default defineConfig({
  build: {
    ssr: fileURLToPath(new URL('./src/main.ts', import.meta.url)),
    outDir: 'dist',
    target: 'node26',
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((name) => `node:${name}`),
        'fastify',
        'kysely',
        'pg',
        'node-pg-migrate',
        'close-with-grace',
      ],
      output: { format: 'esm', entryFileNames: 'main.js' },
    },
  },
});
