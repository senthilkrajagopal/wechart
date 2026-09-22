import { expect, type APIRequestContext } from '@playwright/test';

/**
 * A cube file of this browser's own, published through the API (T142). The
 * browsers run at once, and each publish writes a whole file, so two editing
 * one file write over each other's change: a test that publishes uses its
 * own file, not the seed model's.
 */
export async function ownCubeFile(request: APIRequestContext, cube: string): Promise<string> {
  const path = `cubes/${cube}.yml`;
  const response = await request.post('/api/model/publish', {
    data: {
      files: [
        {
          path,
          content: `cubes:\n  - name: ${cube}\n    sql_table: public.products\n\n    measures:\n      - name: count\n        type: count\n`,
        },
      ],
    },
  });
  expect(response.status()).toBe(200);
  return path;
}
