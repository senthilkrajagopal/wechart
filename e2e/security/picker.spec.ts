import type { APIRequestContext, Page } from '@playwright/test';

import { cubePicker, fieldPicker } from '../cubePicker';
import { landed } from '../model-files';
import { expect, test } from './fixtures';
import { changeShared, proposeShared } from './shared-change';

/**
 * T429, AC-329: WHEN the user picks a cube for a chart or dashboard, THE
 * SYSTEM SHALL offer only the cubes found on the item's own folder path, each
 * by its title with its folder path beside it, never by a prefixed name.
 * `Fails when: the picker lists a cube from a descendant or sibling folder,
 * shows a prefixed name, or shows a cube without its folder path.`
 *
 * Reworked by T729 to R71's one name per item (AC-272): each folder's cube
 * has a name of its own, and a chart binds it by that name. Against the
 * compose stack's xcube, through the API as `super`: /A publishes
 * `picker_a_<run>`, /A/B `picker_b_<run>`, /A/B/C beneath it
 * `picker_c_<run>`, and /A/D, /A/B's sibling, `picker_widgets_<run>`. A
 * chart in /A/B picks from /A's, /A/B's and the root's cubes, and nothing
 * else.
 */
const RUN = Math.random().toString(36).slice(2, 8);
/** Each folder's cube, by its own name, and the title the picker shows it by. */
const CUBES = {
  a: { name: `picker_a_${RUN}`, title: 'Picker A cube' },
  b: { name: `picker_b_${RUN}`, title: 'Picker B cube' },
  c: { name: `picker_c_${RUN}`, title: 'Picker C cube' },
  d: { name: `picker_widgets_${RUN}`, title: 'Picker widgets' },
} as const;

async function folder(request: APIRequestContext, title: string, parent: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(made.status()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

/** Through My workspace and a proposal `super` approves (T451, AC-278). */
async function publish(
  request: APIRequestContext,
  folderId: string,
  { name, title }: { name: string; title: string },
) {
  const file = {
    path: `cubes/${name}.yml`,
    // A dimension too, for a dashboard filter to pick (T633).
    content: `cubes:\n  - name: ${name}\n    title: ${title}\n    sql_table: public.orders\n    measures:\n      - name: count\n        type: count\n    dimensions:\n      - name: status\n        sql: status\n        type: string\n`,
  };
  expect(await landed(request, folderId, [file])).toEqual([file]);
}

/** The muted ink a dimmed row is drawn in: direction.md §5's text-muted, as the page has it. */
const hiddenColour = (page: Page) =>
  page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--wc-text-muted)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });

/** A chart made in a folder, as New › Chart makes one. */
async function chartIn(request: APIRequestContext, folderId: string, title: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'chart', title, folderId },
  });
  expect(made.status()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

test.describe.configure({ mode: 'serial' });

test.describe('cubes bound and picked on a folder’s path (T429)', () => {
  test.use({ role: 'super' });
  const ids = { a: '', b: '', c: '', d: '' };

  test('makes the folders and publishes their cubes', async ({ page }) => {
    const request = page.request;
    ids.a = await folder(request, `Picker A ${RUN}`, 'root');
    ids.b = await folder(request, `Picker B ${RUN}`, ids.a);
    ids.c = await folder(request, `Picker C ${RUN}`, ids.b);
    ids.d = await folder(request, `Picker D ${RUN}`, ids.a);
    await publish(request, ids.a, CUBES.a);
    await publish(request, ids.b, CUBES.b);
    await publish(request, ids.c, CUBES.c);
    await publish(request, ids.d, CUBES.d);
  });

  /**
   * AC-272, reworked by T729: `Fails when: … binds a cube defined only in
   * /A/B/C or a sibling; publishes with a name found nowhere on its path; …`
   * A chart binds a cube on its path by the cube's own name.
   */
  test('stores a chart saved into /A/B bound by its cube’s own name, and refuses one naming only a sibling’s', async ({
    page,
  }) => {
    const request = page.request;
    const id = await chartIn(request, ids.b, `Bound chart ${RUN}`);
    // Published by an approval of its copy, never saved in place (T502,
    // AC-278): the approval binds it, or is refused.
    const withCube = (cube: string) => (body: Record<string, unknown>) => ({
      ...body,
      chart: {
        source: { cube },
        wells: { measures: [`${cube}.count`], dimensions: [], timeDimensions: [] },
      },
    });

    const refused = await proposeShared(request, 'chart', id, withCube(CUBES.d.name));
    expect(refused.approved.status()).toBe(422);
    expect(await refused.approved.json()).toEqual({
      error: `No folder on the path of “Bound chart ${RUN}” holds “${CUBES.d.name}”, so nothing was approved.`,
      names: [CUBES.d.name],
    });
    await refused.cleanUp();

    const saved = await changeShared(request, 'chart', id, withCube(CUBES.b.name));
    expect(saved).toEqual([{ kind: 'chart', id, version: 2 }]);
    const stored = (await (await request.get(`/api/documents/chart/${id}`)).json()) as {
      body: { chart: { source: { cube: string }; wells: { measures: string[] } } };
    };
    expect(stored.body.chart.source.cube).toBe(CUBES.b.name);
    expect(stored.body.chart.wells.measures).toEqual([`${CUBES.b.name}.count`]);
  });

  test('offers the cubes on a chart’s folder path, nearest first, each with its folder path and never a prefixed name (AC-329)', async ({
    page,
  }) => {
    const id = await chartIn(page.request, ids.b, `Picker chart ${RUN}`);
    await page.goto(`/explore/charts/${id}/edit?new=true`);

    // Design 10's picker, state D (T475): its folders' groups, nearest first.
    const picker = cubePicker(page);
    const list = await picker.open();
    await expect(page.getByRole('combobox', { name: 'Search cubes and views' })).toBeFocused();
    const AB = `Picker A ${RUN} / Picker B ${RUN}`;
    // Once the folders are read: /A/B's group first, not only the root's.
    await expect(list.getByRole('group').first()).toHaveAttribute('aria-label', AB);
    const options = await list.getByRole('option').evaluateAll((all) =>
      all.map((option) => ({
        cube: option.getAttribute('data-cube') ?? '',
        group: option.closest('[role="group"]')?.getAttribute('aria-label') ?? null,
        title: option.querySelector('.cube-picker__title')?.textContent ?? '',
        path: option.querySelector('.cube-picker__path')?.textContent ?? '',
        hidden: option.getAttribute('aria-disabled') === 'true',
      })),
    );
    // /A/B's and /A's, each by its title with its folder's path; /A/B/C's not at all.
    const A = `Picker A ${RUN}`;
    const own = options.filter((option) => option.cube.startsWith('picker_'));
    expect(own).toEqual([
      { cube: CUBES.b.name, group: AB, title: CUBES.b.title, path: AB, hidden: false },
      { cube: CUBES.a.name, group: A, title: CUBES.a.title, path: A, hidden: false },
    ]);
    // No descendant's, and no sibling's cube.
    expect(options.some((option) => option.cube === CUBES.c.name)).toBe(false);
    expect(options.some((option) => option.cube === CUBES.d.name)).toBe(false);
    // The root's, under the root's name.
    expect(options).toContainEqual({
      cube: 'orders',
      group: 'Shared',
      title: 'Orders',
      path: 'Shared',
      hidden: false,
    });
    // Never a prefixed name, and every cube with its folder path.
    for (const option of options) {
      expect(`${option.title} ${option.path}`, option.cube).not.toContain('__');
      expect(option.path, option.cube).not.toBe('');
    }
  });

  /**
   * T475, reworked by T729 to R71 (AC-342 retired: no two folders hold one
   * name, so no cube on a path is hidden): each folder's cube on the path is
   * listed under its folder, pickable, and none dimmed. T732 adds AC-428's
   * "Your copy".
   */
  test('lists /A’s cube under /A, pickable, with nothing dimmed (T475, reworked)', async ({
    page,
  }) => {
    const id = await chartIn(page.request, ids.b, `Listed chart ${RUN}`);
    await page.goto(`/explore/charts/${id}/edit?new=true`);
    const picker = cubePicker(page);
    const list = await picker.open();
    const A = `Picker A ${RUN}`;
    const AB = `${A} / Picker B ${RUN}`;
    await expect(list.getByRole('group').first()).toHaveAttribute('aria-label', AB);
    const ofA = list
      .getByRole('group', { name: A, exact: true })
      .locator(`[data-cube="${CUBES.a.name}"]`);
    await expect(ofA).not.toHaveAttribute('aria-disabled', 'true');
    await expect(ofA).not.toContainText('hidden by');
    await expect(ofA).not.toHaveCSS('color', await hiddenColour(page));
    await expect(list.locator('[aria-disabled="true"]')).toHaveCount(0);
    expect(await list.textContent()).not.toContain('__');
    // Picked, the button names it.
    await ofA.click();
    await expect(picker.button).toHaveAttribute('data-value', CUBES.a.name);
  });

  /**
   * T633 (AC-329; R64), reworked by T729 to R71 (AC-342 retired): a
   * dashboard's filter picks its field from the cubes on the dashboard's
   * path, as design 10's picker lists them: by folder, nearest first, each
   * field with its cube and folder path, never a prefixed name, and none
   * dimmed. A workspace dashboard to go to /A/B, as one is authored.
   */
  test('a dashboard filter picks its field from the path’s cubes, by folder, none dimmed (T633)', async ({
    page,
  }) => {
    const made = await page.request.post('/api/documents', {
      data: {
        kind: 'dashboard',
        title: `Picker board ${RUN}`,
        folderId: 'mine',
        targetFolderId: ids.b,
      },
    });
    expect(made.status()).toBe(201);
    const id = ((await made.json()) as { id: string }).id;
    try {
      await page.goto(`/explore/dashboards/${id}`);
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByTestId('add-filter').click();
      await page.getByTestId('add-filter-list').click();
      const picker = fieldPicker(page.getByRole('complementary', { name: 'Edit sidebar' }));
      await picker.button.click();
      const A = `Picker A ${RUN}`;
      const AB = `${A} / Picker B ${RUN}`;
      const list = picker.list;
      await expect(list.getByRole('group').first()).toHaveAttribute('aria-label', AB);
      await expect(list.locator(`[data-member="${CUBES.b.name}.status"]`)).toContainText(
        `${CUBES.b.title} · ${AB}`,
      );
      await expect(
        list
          .getByRole('group', { name: A, exact: true })
          .locator(`[data-member="${CUBES.a.name}.status"]`),
      ).toContainText(`${CUBES.a.title} · ${A}`);
      await expect(list.locator('[aria-disabled="true"]')).toHaveCount(0);
      // No sibling's or descendant's cube, and never a prefixed name.
      await expect(list.locator(`[data-member^="${CUBES.d.name}."]`)).toHaveCount(0);
      await expect(list.locator(`[data-member^="${CUBES.c.name}."]`)).toHaveCount(0);
      expect(await list.textContent()).not.toContain('__');
    } finally {
      await page.request.delete(`/api/documents/dashboard/${id}`);
    }
  });

  /**
   * T732 (T718; AC-428, AC-329): a workspace chart and a workspace dashboard
   * going to /A/B, while My workspace holds an edit copy of /A/B's cube: each
   * picker, the chart editor's and "Filter on", lists the copy once, in the
   * landed cube's place under /A/B, marked "Your copy", and nothing dimmed.
   */
  test('lists My workspace’s copy in the landed cube’s place, marked, in the chart editor and in Filter on (AC-428)', async ({
    page,
  }) => {
    const { request } = page;
    const A = `Picker A ${RUN}`;
    const AB = `${A} / Picker B ${RUN}`;
    const path = `cubes/${CUBES.b.name}.yml`;
    const copied = await request.post('/api/workspace/copies', {
      data: { kind: 'model', folderId: ids.b, path, timeZone: 'UTC' },
      timeout: 90_000,
    });
    expect(copied.status(), await copied.text()).toBe(201);
    const copyFolder = ((await copied.json()) as { folderId: string }).folderId;
    const made = { chart: '', board: '' };
    try {
      const chart = await request.post('/api/documents', {
        data: {
          kind: 'chart',
          title: `Copy chart ${RUN}`,
          folderId: 'mine',
          targetFolderId: ids.b,
        },
      });
      expect(chart.status()).toBe(201);
      made.chart = ((await chart.json()) as { id: string }).id;
      await page.goto(`/explore/charts/${made.chart}/edit?new=true`);
      const picker = cubePicker(page);
      const list = await picker.open();
      await expect(list.getByRole('group').first()).toHaveAttribute('aria-label', AB);
      const ofB = list.locator(`.cube-picker__option[data-cube="${CUBES.b.name}"]`);
      await expect(ofB).toHaveCount(1);
      await expect(
        list.getByRole('group', { name: AB, exact: true }).locator(`[data-cube="${CUBES.b.name}"]`),
      ).toHaveCount(1);
      await expect(ofB.locator('.cube-picker__chip')).toHaveText('Your copy');
      await expect(list.locator('[aria-disabled="true"]')).toHaveCount(0);

      const board = await request.post('/api/documents', {
        data: {
          kind: 'dashboard',
          title: `Copy board ${RUN}`,
          folderId: 'mine',
          targetFolderId: ids.b,
        },
      });
      expect(board.status()).toBe(201);
      made.board = ((await board.json()) as { id: string }).id;
      await page.goto(`/explore/dashboards/${made.board}`);
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByTestId('add-filter').click();
      await page.getByTestId('add-filter-list').click();
      const fields = fieldPicker(page.getByRole('complementary', { name: 'Edit sidebar' }));
      await fields.button.click();
      await expect(fields.list.getByRole('group').first()).toHaveAttribute('aria-label', AB);
      const status = fields.list.locator(`[data-member="${CUBES.b.name}.status"]`);
      await expect(status).toHaveCount(1);
      await expect(status).toContainText('Your copy');
      await expect(status).toContainText(`${CUBES.b.title} · ${AB}`);
      await expect(fields.list.locator('[aria-disabled="true"]')).toHaveCount(0);
    } finally {
      if (made.board !== '') await request.delete(`/api/documents/dashboard/${made.board}`);
      if (made.chart !== '') await request.delete(`/api/documents/chart/${made.chart}`);
      await request.delete(
        `/api/model/files?folder=${encodeURIComponent(copyFolder)}&path=${encodeURIComponent(path)}`,
        { timeout: 90_000 },
      );
      if (copyFolder !== 'mine') await request.delete(`/api/documents/folder/${copyFolder}`);
    }
  });

  /**
   * T450, AC-329: search names a folder's field by its short name, with its
   * cube's title and folder path, and never shows the prefixed name.
   */
  test('search names a folder’s fields by their short names and folder paths, never a prefixed name', async ({
    page,
  }) => {
    await page.goto('/explore');
    await expect(page.getByRole('button', { name: /theme/i })).toBeVisible();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    const palette = page.getByRole('dialog', { name: /search/i });
    await palette.getByRole('combobox').fill(`${CUBES.b.name}.count`);

    const results = palette.getByRole('listbox', { name: 'Search results' });
    await expect(
      results.getByRole('option').filter({
        // Its cube by title, never an id (T478, AC-220).
        hasText: new RegExp(
          `^Measure${CUBES.b.title} CountCube ${CUBES.b.title} · Shared / Picker A ${RUN} / Picker B ${RUN}$`,
        ),
      }),
    ).toHaveCount(1);
    for (const text of await results.getByRole('option').allTextContents())
      expect(text).not.toContain('__');
  });

  /**
   * T457, AC-272, reworked by T729: a chart's second cube is bound by its own
   * name, as its source cube joins it: /A/B's `src` joins /A's `other`. A
   * cube only /A/B/C defines is on no path of /A/B's.
   */
  test('binds a chart’s second cube by its own name, and refuses one off its path (T457)', async ({
    page,
  }) => {
    const request = page.request;
    const other = `picker_other_${RUN}`;
    const src = `picker_src_${RUN}`;
    await publishYaml(request, ids.a, other, cubeOf(other));
    await publishYaml(request, ids.b, src, cubeOf(src, other));

    const id = await chartIn(request, ids.b, `Joined chart ${RUN}`);
    const saved = await changeShared(request, 'chart', id, (body) => ({
      ...body,
      chart: {
        source: { cube: src },
        wells: { measures: [`${src}.count`], dimensions: [`${other}.id`], timeDimensions: [] },
      },
    }));
    expect(saved).toEqual([{ kind: 'chart', id, version: 2 }]);
    const stored = (await (await request.get(`/api/documents/chart/${id}`)).json()) as {
      body: {
        chart: { source: { cube: string }; wells: { measures: string[]; dimensions: string[] } };
      };
    };
    expect(stored.body.chart.source.cube).toBe(src);
    expect(stored.body.chart.wells.measures).toEqual([`${src}.count`]);
    // /A's `other`, as `src` joins it, by its own name.
    expect(stored.body.chart.wells.dimensions).toEqual([`${other}.id`]);
    // And it answers through the join, by `other`'s own name. Its count:
    // the key is a primary key, which Cube hides from queries' dimensions.
    const answer = await request.post('/api/load', {
      data: { query: { measures: [`${src}.count`, `${other}.count`] } },
    });
    expect(answer.status(), await answer.text()).toBe(200);
    expect(
      ((await answer.json()) as { data: Record<string, unknown>[] }).data.map((row) =>
        Object.keys(row).sort(),
      ),
    ).toEqual([[`${other}.count`, `${src}.count`].sort()]);

    // A cube only /A/B/C, beneath /A/B, defines is on no path of /A/B's.
    const deep = `picker_deep_${RUN}`;
    await publishYaml(request, ids.c, deep, cubeOf(deep));
    const below = await chartIn(request, ids.b, `Below chart ${RUN}`);
    const refused = await proposeShared(request, 'chart', below, (body) => ({
      ...body,
      chart: {
        source: { cube: deep },
        wells: { measures: [`${deep}.count`], dimensions: [], timeDimensions: [] },
      },
    }));
    expect(refused.approved.status()).toBe(422);
    expect(await refused.approved.json()).toEqual({
      error: `No folder on the path of “Below chart ${RUN}” holds “${deep}”, so nothing was approved.`,
      names: [deep],
    });
    await refused.cleanUp();
  });

  // A save refused while xcube can't be reached is `xcube-unreachable.spec.ts`'s:
  // it stops Cube, so it runs apart from the rest (T457's review).
});

/** A cube over the orders, joining `joins` one to one by id where named. */
function cubeOf(name: string, joins?: string): string {
  return [
    'cubes:',
    `  - name: ${name}`,
    '    sql_table: public.orders',
    '    measures:',
    '      - name: count',
    '        type: count',
    '    dimensions:',
    '      - name: id',
    '        sql: id',
    '        type: number',
    '        primary_key: true',
    ...(joins === undefined
      ? []
      : [
          '    joins:',
          `      - name: ${joins}`,
          '        relationship: one_to_one',
          `        sql: "{CUBE}.id = {${joins}}.id"`,
        ]),
    '',
  ].join('\n');
}

async function publishYaml(
  request: APIRequestContext,
  folderId: string,
  name: string,
  content: string,
) {
  const file = { path: `cubes/${name}.yml`, content };
  expect(await landed(request, folderId, [file])).toEqual([file]);
}
