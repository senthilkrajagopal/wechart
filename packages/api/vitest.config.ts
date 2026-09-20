import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['./vitest.globalSetup.ts'],
    // Its own database, created by the global setup. Sharing the development
    // database let test fixtures into the catalog the app then listed — the
    // seed saw folders that no person had created and skipped itself.
    env: { WECHART_DB_URL: 'postgres://wechart:wechart@localhost:55432/wechart_test' },
    // The repository tests share one Postgres. Every test uses its own
    // generated ids, so they do not collide, but one worker keeps the
    // connection count predictable and the restart test (which destroys the
    // pool) isolated from anything running beside it.
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
  },
});
