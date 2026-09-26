import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';

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
    const save = (cube: string) =>
      request.put(`/api/documents/chart/${id}`, {
        data: {
          version: 1,
          body: {
            schemaVersion: 1,
            title: `Bound chart ${RUN}`,
            folderId: ids.b,
            chart: {
              source: { cube },
              wells: { measures: [`${cube}.count`], dimensions: [], timeDimensions: [] },
            },
          },
        },
      });

    const refused = await save('picker_widgets');
    expect(refused.status()).toBe(422);
    expect(await refused.json()).toEqual({
      error: 'No folder on this chart’s path holds “picker_widgets”.',
      names: ['picker_widgets'],
    });

    const saved = await save('picker_sales');
    expect(saved.status(), await saved.text()).toBe(200);
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
});
