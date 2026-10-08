import type { APIRequestContext } from '@playwright/test';

import { CUBE, serviceToken } from '../api-process';
import { expect, test } from './fixtures';

/**
 * T702 (AC-421, AC-424): xcube `256d632371`, asked directly under wechart's
 * service credential, holds one name per item model-wide, compared in any
 * case. A cube `Orders` landed in a folder while the root's `orders` has
 * landed is refused on the caller's own item, `name_in_use`; nothing of it
 * lands, and the answer holds no folder of the item holding the name
 * (research `xcube-256d632371.md`, "The error kinds", 2.3).
 */
const MODEL = 'e2e-security';
const RUN = `g${Math.random().toString(36).slice(2, 7)}`;
const ROUTES = `${CUBE}/v1/semantic/models/${MODEL}`;
const headers = () => ({ authorization: `Bearer ${serviceToken()}` });
const xcubeIdOf = (folderId: string) => `f${folderId.replaceAll('-', '')}`;

const revisionOf = async (request: APIRequestContext) => {
  const answer = await request.get(`${ROUTES}/revision`, { headers: headers() });
  expect(answer.status(), await answer.text()).toBe(200);
  return ((await answer.json()) as { current: { revision: number } | null }).current?.revision;
};

test.describe('one name per item, held by xcube (T702, AC-421, AC-424)', () => {
  test.use({ role: 'super' });

  test('refuses `Orders` in a folder while the root’s `orders` has landed, landing nothing and naming no folder of the holder', async ({
    page,
  }) => {
    const request = page.request;
    const made = await request.post('/api/documents', {
      data: { kind: 'folder', title: `Global names ${RUN}`, folderId: 'root' },
    });
    expect(made.status(), await made.text()).toBe(201);
    const folderId = ((await made.json()) as { id: string }).id;
    const xcubeId = xcubeIdOf(folderId);
    try {
      const items = async () =>
        (
          (await (await request.get(`${ROUTES}/items`, { headers: headers() })).json()) as {
            items: { folderId: string; name: string }[];
          }
        ).items;
      // The root's `orders`, from the seeded model.
      expect(await items()).toEqual(
        expect.arrayContaining([expect.objectContaining({ folderId: 'froot', name: 'orders' })]),
      );

      const upsert = {
        folderId: xcubeId,
        name: 'Orders',
        kind: 'cube',
        yaml: 'cubes:\n  - name: Orders\n    sql: SELECT 1 AS n\n',
      };
      // The new folder reaches xcube's tree as the API pushes it (T452).
      let answer: { status: number; body: Record<string, unknown> } = { status: 0, body: {} };
      let before: number | undefined;
      await expect
        .poll(
          async () => {
            before = await revisionOf(request);
            const sent = await request.post(`${ROUTES}/changesets`, {
              headers: headers(),
              data: { baseRevision: before ?? null, upserts: [upsert], deletes: [] },
            });
            answer = {
              status: sent.status(),
              body: (await sent.json()) as Record<string, unknown>,
            };
            const errors = (answer.body['errors'] ?? []) as { kind: string }[];
            return errors.some((error) => error.kind === 'folder')
              ? 'not in the tree yet'
              : 'asked';
          },
          { timeout: 20_000 },
        )
        .toBe('asked');

      expect(answer.status, JSON.stringify(answer.body)).toBe(422);
      expect(answer.body).toMatchObject({ code: 'invalid_items' });
      expect(answer.body['errors']).toEqual([
        {
          folderId: xcubeId,
          name: 'Orders',
          kind: 'name_in_use',
          message: 'The name "Orders" is already in use',
        },
      ]);
      // Nothing of the holder's folder: the root's id is nowhere in it.
      expect(JSON.stringify(answer.body)).not.toContain('froot');

      // Nothing of it landed.
      expect(await revisionOf(request)).toBe(before);
      expect((await items()).filter((item) => item.name.toLowerCase() === 'orders')).toEqual([
        expect.objectContaining({ folderId: 'froot', name: 'orders' }),
      ]);
    } finally {
      await request.delete(`/api/documents/folder/${encodeURIComponent(folderId)}`);
    }
  });
});
