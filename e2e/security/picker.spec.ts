import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import { changeShared, proposeShared } from './shared-change';

/**
 * T429, AC-329: WHEN the user picks a cube for a chart or dashboard, THE
 * SYSTEM SHALL offer only the cubes found on the item's own folder path, each
 * by its title with its folder path beside it, never by its prefixed name.
 * `Fails when: the picker lists a cube from a descendant or sibling folder,
 * shows a prefixed name, or shows a cube without its folder path.`
 *
 * Against the compose stack's xcube, through the API as `super`: /A and /A/B
 * each publish a `picker_sales`, /A/B/C beneath /A/B another, and /A/D,
 * /A/B's sibling, the only `picker_widgets`. A chart in /A/B picks from
 * /A/B's `picker_sales` and the root's cubes, and nothing else.
 */
const RUN = Math.random().toString(36).slice(2, 8);

async function folder(request: APIRequestContext, title: string, parent: string) {
  const made = await request.post('/api/documents', {
    data: { kind: 'folder', title, folderId: parent },
  });
  expect(made.status()).toBe(201);
  return ((await made.json()) as { id: string }).id;
}

async function publish(request: APIRequestContext, folderId: string, name: string) {
  const published = await request.post('/api/model/publish', {
    data: {
      folderId,
      files: [
        {
          path: `cubes/${name}.yml`,
          content: `cubes:\n  - name: ${name}\n    sql_table: public.orders\n    measures:\n      - name: count\n        type: count\n`,
        },
      ],
    },
  });
  expect(published.status(), await published.text()).toBe(200);
}

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
  const bFull = () => `f${ids.b.replaceAll('-', '')}__picker_sales`;

  test('makes the folders and publishes their cubes', async ({ page }) => {
    const request = page.request;
    ids.a = await folder(request, `Picker A ${RUN}`, 'root');
    ids.b = await folder(request, `Picker B ${RUN}`, ids.a);
    ids.c = await folder(request, `Picker C ${RUN}`, ids.b);
    ids.d = await folder(request, `Picker D ${RUN}`, ids.a);
    await publish(request, ids.a, 'picker_sales');
    await publish(request, ids.b, 'picker_sales');
    await publish(request, ids.c, 'picker_sales');
    await publish(request, ids.d, 'picker_widgets');
  });

  /**
   * AC-272: `Fails when: a chart published in /A/B binds /A's sales while
   * /A/B defines its own; binds a cube defined only in /A/B/C or a sibling;
   * publishes with a name found nowhere on its path; …`
   */
  test('stores a chart saved into /A/B bound to /A/B’s own cube, and refuses one naming only a sibling’s', async ({
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

    const refused = await proposeShared(request, 'chart', id, withCube('picker_widgets'));
    expect(refused.approved.status()).toBe(422);
    expect(await refused.approved.json()).toEqual({
      error: `No folder on the path of “Bound chart ${RUN}” holds “picker_widgets”, so nothing was approved.`,
      names: ['picker_widgets'],
    });
    await refused.cleanUp();

    const saved = await changeShared(request, 'chart', id, withCube('picker_sales'));
    expect(saved).toEqual([{ kind: 'chart', id, version: 2 }]);
    const stored = (await (await request.get(`/api/documents/chart/${id}`)).json()) as {
      body: { chart: { source: { cube: string }; wells: { measures: string[] } } };
    };
    expect(stored.body.chart.source.cube).toBe(bFull());
    expect(stored.body.chart.wells.measures).toEqual([`${bFull()}.count`]);
  });

  test('offers the cubes on a chart’s folder path, nearest first, each with its folder path and never a prefixed name (AC-329)', async ({
    page,
  }) => {
    const id = await chartIn(page.request, ids.b, `Picker chart ${RUN}`);
    await page.goto(`/explore/charts/${id}/edit?new=true`);

    const picker = page.getByRole('combobox', { name: 'Cube or view' });
    await expect(picker).toBeVisible();
    // /A/B's own `picker_sales`, with /A/B's path: not /A's, nor /A/B/C's.
    // Once the folders are read: /A/B's group, not only the root's.
    await expect(
      picker.locator(`optgroup[label="Shared / Picker A ${RUN} / Picker B ${RUN}"]`),
    ).toHaveCount(1);
    // Each cube by its title, under its folder path.
    const options = await picker.locator('option').evaluateAll((all) =>
      (all as HTMLOptionElement[]).map((option) => ({
        value: option.value,
        text: option.textContent ?? '',
        path:
          option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : null,
      })),
    );
    const sales = options.filter((option) => option.value.endsWith('picker_sales'));
    expect(sales).toEqual([
      { value: bFull(), text: 'Picker Sales', path: `Shared / Picker A ${RUN} / Picker B ${RUN}` },
    ]);
    // No sibling's cube.
    expect(options.some((option) => option.value.endsWith('picker_widgets'))).toBe(false);
    // The root's, under the root's path.
    expect(options).toContainEqual({ value: 'orders', text: 'Orders', path: 'Shared' });
    // Never a prefixed name, and every cube under its folder path.
    for (const option of options.filter((each) => each.value !== ''))
      expect(option.path, option.value).toMatch(/^Shared/);
    for (const option of options) expect(option.text).not.toContain('__');
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
    await palette.getByRole('combobox').fill('picker_sales.count');

    const results = palette.getByRole('listbox', { name: 'Search results' });
    await expect(
      results.getByRole('option').filter({
        // /A/B/C's own is found too: its path runs on past /A/B's.
        hasText: new RegExp(
          `picker_sales\\.count · cube Picker Sales · Shared / Picker A ${RUN} / Picker B ${RUN}$`,
        ),
      }),
    ).toHaveCount(1);
    for (const text of await results.getByRole('option').allTextContents())
      expect(text).not.toContain('__');
  });

  /**
   * T457, AC-272: a chart's second cube is bound through the bindings its
   * source cube was published with, so it joins as its cube does: /A/B's
   * `src` joins `other`, bound to /A's when `src` was published. A nearer
   * `other` published in /A/B afterwards rebinds nothing (R31), so a chart
   * published in /A/B then still binds /A's.
   */
  test('binds a chart’s second cube as its source cube was published bound, a nearer one since notwithstanding (T457)', async ({
    page,
  }) => {
    const request = page.request;
    const other = `picker_other_${RUN}`;
    const src = `picker_src_${RUN}`;
    const full = (folderId: string, name: string) => `f${folderId.replaceAll('-', '')}__${name}`;
    await publishYaml(request, ids.a, other, cubeOf(other));
    await publishYaml(request, ids.b, src, cubeOf(src, other));
    // The nearer one, after `src` was bound to /A's.
    await publishYaml(request, ids.b, other, cubeOf(other));

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
    expect(stored.body.chart.source.cube).toBe(full(ids.b, src));
    expect(stored.body.chart.wells.measures).toEqual([`${full(ids.b, src)}.count`]);
    // /A's, as `src` joins it, not /A/B's nearer one.
    expect(stored.body.chart.wells.dimensions).toEqual([`${full(ids.a, other)}.id`]);
    // While a chart starting from `other` itself takes the nearer, /A/B's:
    // what differs above is `src`'s bindings, not a publish that didn't land.
    const near = await chartIn(request, ids.b, `Near chart ${RUN}`);
    await changeShared(request, 'chart', near, (body) => ({
      ...body,
      chart: {
        source: { cube: other },
        wells: { measures: [`${other}.count`], dimensions: [], timeDimensions: [] },
      },
    }));
    const nearStored = (await (await request.get(`/api/documents/chart/${near}`)).json()) as {
      body: { chart: { source: { cube: string } } };
    };
    expect(nearStored.body.chart.source.cube).toBe(full(ids.b, other));

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
  const published = await request.post('/api/model/publish', {
    data: { folderId, files: [{ path: `cubes/${name}.yml`, content }] },
  });
  expect(published.status(), await published.text()).toBe(200);
}
