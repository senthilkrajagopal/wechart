import type { APIRequestContext } from '@playwright/test';

import { landed } from '../model-files';
import { expect, test } from './fixtures';

/**
 * T713 (AC-425, AC-321), on xcube's R71 image: a model in /A/B whose join,
 * `extends` or view names a cube kept in /A/B's sibling /A/C is refused when
 * it is saved in My workspace, xcube refusing the overlay (`reference_range`;
 * research `xcube-256d632371.md`, "R72"), on its file, naming the cube it
 * refers to and never that cube's folder; nothing is stored. The same
 * references to /A's cube save and land.
 *
 * As `super`, in folders of this run's own.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const BASE = `rp_base_${RUN}`;
const SIDE = `rp_side_${RUN}`;
const ids = { a: '', ab: '', ac: '', project: '' };

const cube = (name: string, lines: readonly string[] = []) =>
  [
    'cubes:',
    `  - name: ${name}`,
    '    sql_table: public.orders',
    ...lines,
    '    measures:',
    '      - name: count',
    '        type: count',
    // Cube asks a joined cube for a primary key.
    '    dimensions:',
    '      - name: id',
    '        sql: id',
    '        type: number',
    '        primary_key: true',
    '',
  ].join('\n');
const joining = (name: string, other: string) =>
  cube(name, [
    '    joins:',
    `      - name: ${other}`,
    `        sql: "{CUBE}.id = {${other}}.id"`,
    '        relationship: many_to_one',
  ]);

async function folder(request: APIRequestContext, title: string, parent: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title: `${title} ${RUN}`, folderId: parent },
  });
  expect(made.status(), await made.text()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

test.describe.configure({ mode: 'serial' });

test.describe('a model referring off its folder’s path (T713, AC-425)', () => {
  test.use({ role: 'super' });

  const save = (request: APIRequestContext, path: string, content: string) =>
    request.post('/api/model/publish', {
      data: { folderId: ids.project, targetFolderId: ids.ab, files: [{ path, content }] },
      timeout: 90_000,
    });

  test('refuses at save a join, an `extends` and a view naming the sibling’s cube, naming it and no folder', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const request = page.request;
    ids.a = await folder(request, 'RP A', 'root');
    ids.ab = await folder(request, 'RP B', ids.a);
    ids.ac = await folder(request, 'RP C', ids.a);
    for (const [where, name] of [
      [ids.a, BASE],
      [ids.ac, SIDE],
    ] as const) {
      const file = { path: `cubes/${name}.yml`, content: cube(name) };
      expect(await landed(request, where, [file])).toEqual([file]);
    }
    ids.project = await folder(request, 'project-rp', 'mine');

    const view = `rp_view_${RUN}`;
    for (const [path, content] of [
      [`cubes/rp_joins_${RUN}.yml`, joining(`rp_joins_${RUN}`, SIDE)],
      [
        `cubes/rp_child_${RUN}.yml`,
        ['cubes:', `  - name: rp_child_${RUN}`, `    extends: ${SIDE}`, ''].join('\n'),
      ],
      [
        `views/${view}.yml`,
        [
          'views:',
          `  - name: ${view}`,
          '    cubes:',
          `      - join_path: ${SIDE}`,
          '        includes: "*"',
          '',
        ].join('\n'),
      ],
    ] as const) {
      const saved = await save(request, path, content);
      expect(saved.status(), `${path}: ${await saved.text()}`).toBe(422);
      const { errors } = (await saved.json()) as {
        errors: { path: string; folderId?: string; message: string }[];
      };
      expect(errors).toContainEqual(
        expect.objectContaining({
          path,
          message: expect.stringContaining(`"${SIDE}"`),
        }),
      );
      // Never the folder that keeps it, by wechart's id or xcube's.
      const said = JSON.stringify(errors);
      expect(said).not.toContain(ids.ac);
      expect(said).not.toContain(`f${ids.ac.replaceAll('-', '')}`);
      const listed = await request.get(`/api/model/files?folder=${ids.project}`);
      expect(JSON.stringify(await listed.json())).not.toContain(path);
    }
  });

  test('saves and lands a join, an `extends` and a view to its folder’s parent’s cube, and a join to the root’s', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const request = page.request;
    const view = `rp_view_ok_${RUN}`;
    const files = [
      { path: `cubes/rp_ok_${RUN}.yml`, content: joining(`rp_ok_${RUN}`, BASE) },
      {
        path: `cubes/rp_child_ok_${RUN}.yml`,
        content: ['cubes:', `  - name: rp_child_ok_${RUN}`, `    extends: ${BASE}`, ''].join('\n'),
      },
      {
        path: `views/${view}.yml`,
        content: [
          'views:',
          `  - name: ${view}`,
          '    cubes:',
          `      - join_path: ${BASE}`,
          '        includes: "*"',
          '',
        ].join('\n'),
      },
      // The root's `orders`, from the seeded root model.
      { path: `cubes/rp_root_${RUN}.yml`, content: joining(`rp_root_${RUN}`, 'orders') },
    ];
    for (const file of files) expect(await landed(request, ids.ab, [file])).toEqual([file]);
  });
});
