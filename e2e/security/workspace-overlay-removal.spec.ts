import { execFileSync } from 'node:child_process';

import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * T739 (AC-323, AC-422): xcube's overlay of My workspace holds exactly the
 * workspace's drafts after every way one leaves it or moves in it, so no
 * name is held in xcube that the workspace no longer has.
 *
 * The bug, found by verify.sh on a fresh start: a draft's row removed
 * outside wechart left the workspace's overlay holding it after its folder
 * was deleted. A later draft of that name was refused as in use. A
 * workspace folder's delete now pushes the workspace's overlay, which takes
 * the workspace as stored.
 *
 * As `super`, verify's user, against compose's xcube: what the overlay holds
 * is read from xcube's own table, by this run's names. Clearing My workspace
 * is shown in `workspace-clear.spec.ts`, as `manager`, whose workspace no
 * other spec clears.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const META = 'wechart_meta';
const SUITE = 'wechart_security';

/** SQL in compose's metadata Postgres; values only from this spec's own run names. */
const psql = (database: string, sql: string) =>
  execFileSync(
    'docker',
    ['exec', 'wechart-meta', 'psql', '-U', 'wechart', '-d', database, '-Atc', sql],
    { encoding: 'utf8' },
  ).trim();

/** How many of the model's live overlays hold an item of this name. */
const overlaysHolding = (name: string) =>
  Number(
    psql(
      META,
      `select count(*) from xcube.overlays, jsonb_array_elements(upserts) item where model = 'e2e-security' and item->>'name' = '${name}'`,
    ),
  );

const cubeOf = (name: string) =>
  `cubes:\n  - name: ${name}\n    sql_table: public.orders\n    measures:\n      - name: count\n        type: count\n`;

async function workspaceFolder(request: APIRequestContext, title: string) {
  const answer = await request.post('/api/documents', {
    data: { kind: 'folder', title: `${title} ${RUN}`, folderId: 'mine' },
  });
  expect(answer.status(), await answer.text()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

const saved = async (request: APIRequestContext, folderId: string, path: string, name: string) => {
  const answer = await request.post('/api/model/publish', {
    data: { folderId, targetFolderId: 'root', files: [{ path, content: cubeOf(name) }] },
    timeout: 90_000,
  });
  expect(answer.status(), await answer.text()).toBe(200);
  return (await answer.json()) as { moved?: { from: string; to: string }[] };
};

const removed = (request: APIRequestContext, folderId: string, path: string) =>
  request.delete(
    `/api/model/files?folder=${encodeURIComponent(folderId)}&path=${encodeURIComponent(path)}`,
    { timeout: 90_000 },
  );

test.use({ role: 'super' });

test.describe('the overlay holds exactly My workspace’s drafts (T739, AC-323, AC-422)', () => {
  const made: string[] = [];
  test.afterEach(async ({ page }) => {
    for (const id of made.splice(0)) {
      for (const path of psql(SUITE, `select path from model_files where folder_id = '${id}'`)
        .split('\n')
        .filter((each) => each !== ''))
        await removed(page.request, id, path);
      await page.request.delete(`/api/documents/folder/${id}`);
    }
  });

  test('without a draft once its file is deleted', async ({ page }) => {
    const name = `t739_deleted_${RUN}`;
    const folder = await workspaceFolder(page.request, 'Deleted');
    made.push(folder);
    await saved(page.request, folder, `cubes/${name}.yml`, name);
    expect(overlaysHolding(name)).toBe(1);

    const answer = await removed(page.request, folder, `cubes/${name}.yml`);
    expect(answer.status(), await answer.text()).toBe(200);
    expect(overlaysHolding(name)).toBe(0);
  });

  test('with a moved draft once, under its new name, and a renamed one under that alone', async ({
    page,
  }) => {
    const name = `t739_moved_${RUN}`;
    const renamed = `${name}_again`;
    const folder = await workspaceFolder(page.request, 'Moved');
    made.push(folder);
    const first = await saved(page.request, folder, 'cubes/new_cube_1.yml', name);
    expect(first.moved).toEqual([{ from: 'cubes/new_cube_1.yml', to: `cubes/${name}.yml` }]);
    expect(overlaysHolding(name)).toBe(1);

    await saved(page.request, folder, `cubes/${name}.yml`, renamed);
    expect(overlaysHolding(name)).toBe(0);
    expect(overlaysHolding(renamed)).toBe(1);
  });

  test('refuses a folder’s delete while it holds a draft, which the overlay keeps', async ({
    page,
  }) => {
    const name = `t739_kept_${RUN}`;
    const folder = await workspaceFolder(page.request, 'Kept');
    made.push(folder);
    await saved(page.request, folder, `cubes/${name}.yml`, name);

    const refused = await page.request.delete(`/api/documents/folder/${folder}`);
    expect(refused.status(), await refused.text()).toBe(409);
    expect(overlaysHolding(name)).toBe(1);
  });

  test('without a draft removed outside wechart, once its emptied folder is deleted, and its name is free again', async ({
    page,
  }) => {
    const name = `t739_probe_${RUN}`;
    const folder = await workspaceFolder(page.request, 'Probe');
    made.push(folder);
    await saved(page.request, folder, `wechart-verify/${name}.yml`, name);
    expect(overlaysHolding(name)).toBe(1);

    // As verify.sh's remove_probe did: the row deleted in the database, by its path.
    expect(
      psql(
        SUITE,
        `delete from model_files where folder_id = '${folder}' and path = 'wechart-verify/${name}.yml' returning path`,
      ).split('\n')[0],
    ).toBe(`wechart-verify/${name}.yml`);
    const deleted = await page.request.delete(`/api/documents/folder/${folder}`);
    expect(deleted.status(), await deleted.text()).toBe(204);
    made.splice(made.indexOf(folder), 1);
    // Pushed before the delete answers: no wait.
    expect(overlaysHolding(name)).toBe(0);

    // A new draft of that name, in a new folder, is taken (AC-422).
    const again = await workspaceFolder(page.request, 'Probe again');
    made.push(again);
    await saved(page.request, again, `wechart-verify/${name}.yml`, name);
    expect(overlaysHolding(name)).toBe(1);
  });
});
