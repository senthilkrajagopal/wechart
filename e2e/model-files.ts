import { expect, type APIRequestContext } from '@playwright/test';

/**
 * How long a test waits for a publish's outcome. The whole model is compiled
 * before anything is published — once by xcube's dry run, and again as the
 * revision it imports (T445, T419) — and Cube's own log timed a compile at
 * 2.7–7.4 s while the suite ran in parallel (`"duration"` on "Compiling
 * schema", 2026-09-22), past the 5 s an assertion waits by default.
 */
export const PUBLISHED = { timeout: 20_000 };

/**
 * A cube file of this browser's own, published through the API (T142). The
 * browsers run at once, and each publish writes a whole file, so two editing
 * one file write over each other's change: a test that publishes uses its
 * own file, not the seed model's.
 */
export async function ownCubeFile(
  request: APIRequestContext,
  cube: string,
  /** The file's text, when the test needs more than a count on products. */
  content = `cubes:\n  - name: ${cube}\n    sql_table: public.products\n\n    measures:\n      - name: count\n        type: count\n`,
): Promise<string> {
  const path = `cubes/${cube}.yml`;
  const response = await request.post('/api/model/publish', {
    data: { files: [{ path, content }] },
  });
  expect(response.status()).toBe(200);
  return path;
}
