import { describe, expect, it } from 'vitest';

import { textDocumentFromMarkdown, type TextDocument } from '@wechart/core';

import type { Config } from '../config';
import { cubesOfDashboard, dashboardRenamed } from '../model/bind';
import { buildServer } from '../server';
import { xcubeAdmin } from '../xcube/client';
import { fakeXcube, FAKE_ADMIN_TOKEN } from '../xcube/fake';
import type { Item } from '../xcube/items';

/**
 * T872 / AC-512 (and AC-272): publishing and binding by name read the
 * members a Text tile's elements name, as they read a markdown tile's tokens
 * before (T389's review); a copy renames them as it renamed tokens.
 * Fails when: a member named only by a Text tile's element isn't bound at
 * publish.
 *
 * The stub xcube holds the root's `sales` and `widgets` in /A/D (`fad`), a
 * sibling of /A/B; the dashboard is published into /A (`fa`).
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  modelDir: '',
};
const item = (folderId: string, name: string): Item => ({
  folderId,
  name,
  kind: 'cube',
  yaml: `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n`,
});
const folders = async () => ({
  ids: new Map([
    ['root', 'froot'],
    ['a', 'fa'],
    ['d', 'fad'],
  ]),
  parents: new Map<string, string | null>([
    ['root', null],
    ['a', 'root'],
    ['d', 'a'],
  ]),
});

async function serving() {
  const stub = fakeXcube();
  const admin = xcubeAdmin({
    cubeApiUrl: config.cubeApiUrl,
    model: 'dev',
    token: FAKE_ADMIN_TOKEN,
    fetch: stub.fetch,
  });
  await admin.folders([
    { id: 'froot', parentId: null },
    { id: 'fa', parentId: 'froot' },
    { id: 'fad', parentId: 'fa' },
  ]);
  stub.holdItems('dev', [item('froot', 'sales'), item('fad', 'widgets')]);
  const written: { kind: string; id: string; body: Record<string, unknown> }[] = [];
  const stored: Record<string, Record<string, unknown>> = {
    d1: { title: 'Revenue', folderId: 'a' },
  };
  const documents = {
    create: async (input: { id: string }) => ({ id: input.id }),
    get: async (_kind: string, id: string) =>
      id in stored ? { id, body: stored[id]!, version: 5 } : null,
    update: async (input: { kind: string; id: string; body: Record<string, unknown> }) => {
      written.push(input);
      return { id: input.id, version: 6 };
    },
    updateTogether: async (
      writes: readonly { kind: string; id: string; body: Record<string, unknown> }[],
    ) => {
      written.push(...writes);
      return writes.map((write) => ({ id: write.id, version: 6 }));
    },
    relocate: async (input: unknown) => input,
  };
  const catalog = {
    folders: async () => [],
    contents: async () => [],
    search: async () => [],
    referenceDocuments: async () => [],
  };
  const app = buildServer({ config, documents, catalog, xcube: admin, folders });
  return { app, written };
}

/** A Text tile whose only reference to a cube is a Value of that measure. */
const valueOf = (measure: string): TextDocument => ({
  version: 1,
  doc: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Revenue: ' },
          { type: 'value', attrs: { measure } },
        ],
      },
    ],
  },
});

const withText = (document: TextDocument) => ({
  title: 'Revenue',
  folderId: 'a',
  pages: [{ id: 'p', items: [{ id: 't', kind: 'text', w: 6, h: 18, document }] }],
});

describe('a Text tile’s members at publish (T872, AC-512, AC-272)', () => {
  it('names the cubes a Text tile’s elements name, as a markdown tile’s tokens', () => {
    expect(cubesOfDashboard(withText(valueOf('sales.revenue')))).toEqual(['sales']);
    expect(
      cubesOfDashboard(
        withText(textDocumentFromMarkdown('{{measure:widgets.count | marking:Picks}}')),
      ),
    ).toEqual(['widgets']);
  });

  it('refuses a dashboard whose only reference, a Text tile’s Value, names a cube off its path, and binds one on it', async () => {
    const { app, written } = await serving();
    const save = (document: TextDocument) =>
      app.inject({
        method: 'PUT',
        url: '/api/documents/dashboard/d1',
        payload: { body: withText(document), version: 5 },
      });

    const refused = await save(valueOf('widgets.count'));
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toEqual({
      error: 'No folder on this dashboard’s path holds “widgets”.',
      names: ['widgets'],
    });
    expect(written).toEqual([]);

    const saved = await save(valueOf('sales.revenue'));
    expect(saved.statusCode, saved.body).toBe(200);
    expect(written.map((each) => each.body)).toEqual([withText(valueOf('sales.revenue'))]);
    await app.close();
  });

  it('renames the member a Text tile’s element names, as a copy renamed tokens, in a section or a tab too', () => {
    const renames = new Map([['sales', 'fab__sales']]);
    const regions = valueOf('regions.count');
    const body = {
      pages: [
        {
          id: 'p',
          items: [
            { id: 't1', kind: 'text', document: valueOf('sales.revenue') },
            {
              id: 's',
              kind: 'section',
              items: [
                {
                  id: 'g',
                  kind: 'tabs',
                  tabs: [
                    {
                      id: 'tab',
                      items: [{ id: 't2', kind: 'text', document: valueOf('sales.count') }],
                    },
                  ],
                },
              ],
            },
            { id: 't3', kind: 'text', document: regions },
          ],
        },
      ],
    };
    const renamed = dashboardRenamed(body, renames) as typeof body;
    const [t1, section, t3] = renamed.pages[0]!.items as Record<string, unknown>[];
    expect(t1?.['document']).toEqual(valueOf('fab__sales.revenue'));
    expect(JSON.stringify(section)).toContain('"measure":"fab__sales.count"');
    // Untouched where nothing is renamed.
    expect(t3?.['document']).toBe(regions);
  });
});
