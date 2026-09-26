import { expect, test } from '@playwright/test';

/**
 * T452, AC-328: WHEN a cube is published, THE SYSTEM SHALL publish it under
 * its short name in the shared root, and as `<folderId>__<shortName>` in any
 * other folder, the folder id being the xcube id stored with the folder (`f`
 * and the 32 hex digits of a folder with a UUID).
 *
 * Against compose's xcube, through wechart's API: a cube published into a
 * folder made here is served under that folder's id, and the root's `orders`
 * stays `orders`.
 */
test('a cube published into a new folder is served under the folder’s id, and the root’s stay bare', async ({
  request,
}, testInfo) => {
  const made = await request.post('/api/documents', {
    data: {
      kind: 'folder',
      title: `Folder models ${testInfo.project.name} ${String(Date.now())}`,
      folderId: 'root',
    },
  });
  expect(made.status()).toBe(201);
  const { id } = (await made.json()) as { id: string };
  const name = 'folder_orders';

  const published = await request.post('/api/model/publish', {
    data: {
      folderId: id,
      files: [
        {
          path: `cubes/${name}.yml`,
          content: `cubes:\n  - name: ${name}\n    sql_table: public.orders\n    measures:\n      - name: count\n        type: count\n`,
        },
      ],
    },
  });
  expect(published.status(), await published.text()).toBe(200);

  // Stored in the folder, by its own name there.
  const stored = (await (await request.get(`/api/model/files?folder=${id}`)).json()) as {
    files: { path: string }[];
  };
  expect(stored.files.map((file) => file.path)).toEqual([`cubes/${name}.yml`]);

  // Served as the folder's: `f`, its UUID's hex digits, `__`, the short name.
  const full = `f${id.replaceAll('-', '').toLowerCase()}__${name}`;
  const count = async (cube: string) => {
    const answer = (await (
      await request.post('/api/load', { data: { query: { measures: [`${cube}.count`] } } })
    ).json()) as { data?: Record<string, unknown>[] };
    return answer.data?.[0]?.[`${cube}.count`];
  };
  await expect.poll(() => count(full), { timeout: 30_000 }).toBeDefined();
  // The same table as the root's `orders`, which keeps its bare name.
  expect(await count(full)).toBe(await count('orders'));

  const meta = (await (await request.get('/api/meta')).json()) as { cubes?: { name: string }[] };
  const names = (meta.cubes ?? []).map((cube) => cube.name);
  expect(names).toContain(full);
  expect(names).toContain('orders');
  expect(names).not.toContain(name);
});
