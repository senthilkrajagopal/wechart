import { describe, expect, it } from 'vitest';

import type { OverlayAnswer, OverlayPush, XcubeAdmin } from './client';
import {
  overlayContentOf,
  overlaySync,
  proposalOverlayIdOf,
  workspaceOverlayIdOf,
  type OverlayContent,
} from './overlays';

/**
 * T347 (AC-281, AC-323, AC-280; research `xcube-slice-5.md`,
 * `xcube-overlay-data-sources.md`): a workspace's models and data sources as
 * its overlay. Each model is placed in its target, a copy's being its
 * origin's folder, so its names resolve in the overlay first and then along
 * that folder's path; each data source under its own name, a copy in its
 * original's folder, so previews query it in the original's place.
 */
const FOLDERS = new Map([
  ['root', 'froot'],
  ['sales', 'fsales'],
  ['ops', 'fops'],
]);
const cube = (name: string) => `cubes:\n  - name: ${name}\n    sql_table: public.${name}\n`;
const sealed = { password: { v: 1 as const, kid: 'k', enc: 'e', ct: 'c' } };

describe('a workspace’s overlay (T347)', () => {
  it('is named for the workspace, and a proposal’s for the proposal, in xcube’s id form', () => {
    const id = workspaceOverlayIdOf('ws:writer@wechart.test');
    expect(id).toMatch(/^ws-[0-9a-f]{40}$/);
    expect(workspaceOverlayIdOf('ws:writer@wechart.test')).toBe(id);
    expect(workspaceOverlayIdOf('ws:other@wechart.test')).not.toBe(id);
    const proposal = proposalOverlayIdOf('8f0e8c52-6d7a-4b8e-9c55-0d2f1f6f3a11');
    expect(proposal).toBe('p-8f0e8c52-6d7a-4b8e-9c55-0d2f1f6f3a11');
    for (const each of [id, proposal]) expect(each).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it('places each model in its target and each data source in its original’s folder, or its target', () => {
    const content = overlayContentOf({
      models: [
        // A copy of /Sales's `orders`: its target is its origin's folder.
        { path: 'cubes/orders.yml', content: cube('orders'), targetFolderId: 'sales' },
        // A new one, to go to /Ops.
        { path: 'cubes/widgets.yml', content: cube('widgets'), targetFolderId: 'ops' },
        // A copy of the root's.
        { path: 'cubes/customers.yml', content: cube('customers'), targetFolderId: 'root' },
        // Nowhere to go, or a folder xcube doesn't hold: no item.
        { path: 'cubes/lost.yml', content: cube('lost'), targetFolderId: null },
        { path: 'cubes/away.yml', content: cube('away'), targetFolderId: 'gone' },
      ],
      sources: [
        {
          name: 'default',
          driver: 'postgres',
          authMethod: 'password',
          fields: { host: 'other-db', port: 5432 },
          sealed,
          targetFolderId: 'root',
          origin: { folderId: 'root' },
        },
        {
          name: 'scratch',
          driver: 'postgres',
          authMethod: 'password',
          fields: { host: 'scratch-db', port: 5432 },
          sealed,
          targetFolderId: 'sales',
          origin: null,
        },
      ],
      folders: FOLDERS,
    });

    expect(content.upserts).toEqual([
      { folderId: 'fops', name: 'widgets', kind: 'cube', yaml: cube('widgets') },
      { folderId: 'froot', name: 'customers', kind: 'cube', yaml: cube('customers') },
      { folderId: 'fsales', name: 'orders', kind: 'cube', yaml: cube('orders') },
    ]);
    expect(content.connections).toEqual([
      {
        folderId: 'froot',
        name: 'default',
        driver: 'postgres',
        authMethod: 'password',
        fields: { host: 'other-db', port: 5432 },
        sealed,
      },
      {
        folderId: 'fsales',
        name: 'scratch',
        driver: 'postgres',
        authMethod: 'password',
        fields: { host: 'scratch-db', port: 5432 },
        sealed,
      },
    ]);
  });
});

/** A stub of xcube's overlay routes, answering as the research records them. */
function stubXcube(answers: OverlayAnswer[] = []) {
  const pushed: { id: string; body: OverlayPush }[] = [];
  const dropped: string[] = [];
  let version = 0;
  const admin = {
    async putOverlay(id: string, body: OverlayPush): Promise<OverlayAnswer> {
      pushed.push({ id, body });
      const next = answers.shift();
      if (next !== undefined) return next;
      version += 1;
      return {
        kind: 'stored',
        version,
        created: version === 1,
        revision: 3,
        expiresAt: '2026-10-02T00:00:00.000Z',
      };
    },
    async dropOverlay(id: string) {
      dropped.push(id);
    },
  } as unknown as XcubeAdmin;
  return { admin, pushed, dropped };
}

const one: OverlayContent = {
  upserts: [{ folderId: 'fsales', name: 'orders', kind: 'cube', yaml: cube('orders') }],
  connections: [],
};
const empty: OverlayContent = { upserts: [], connections: [] };

describe('keeping a workspace’s overlay in xcube (T347, AC-323)', () => {
  it('pushes its content on a save, over the version it holds, and names it while it has any', async () => {
    const { admin, pushed } = stubXcube();
    let content = one;
    const sync = overlaySync({ xcube: admin, contentOf: async () => content });

    expect(await sync.push('ws:a')).toEqual({ kind: 'stored', version: 1 });
    content = {
      ...one,
      upserts: [...one.upserts, { folderId: 'fops', name: 'w', kind: 'cube', yaml: cube('w') }],
    };
    expect(await sync.push('ws:a')).toEqual({ kind: 'stored', version: 2 });

    const id = workspaceOverlayIdOf('ws:a');
    expect(pushed.map(({ id: at, body }) => [at, body.baseVersion])).toEqual([
      [id, null],
      [id, 1],
    ]);
    // What a preview names, at the version xcube holds: it holds this content
    // already, so nothing is pushed.
    expect(await sync.ensure('ws:a')).toEqual({ id, content, version: 2 });
    expect(pushed).toHaveLength(2);
  });

  it('pushes a stale overlay before a preview names it, and none for a workspace with nothing to overlay', async () => {
    const { admin, pushed, dropped } = stubXcube();
    let content = empty;
    let now = 0;
    const sync = overlaySync({ xcube: admin, contentOf: async () => content, now: () => now });

    expect(await sync.ensure('ws:b')).toBeUndefined();
    expect(pushed).toHaveLength(0);

    // Changed by another replica, or a route that doesn't push: pushed first,
    // once the last reading is past (a dashboard's tiles share one).
    content = one;
    now += 3_000;
    expect(await sync.ensure('ws:b')).toEqual({
      id: workspaceOverlayIdOf('ws:b'),
      content: one,
      version: 1,
    });
    expect(pushed).toHaveLength(1);

    // Emptied (published or discarded): dropped, and named no more (AC-323).
    content = empty;
    now += 3_000;
    expect(await sync.ensure('ws:b')).toBeUndefined();
    expect(dropped).toEqual([workspaceOverlayIdOf('ws:b')]);
  });

  it('pushes again over the version xcube holds when another push came first, reading the workspace again', async () => {
    const { admin, pushed } = stubXcube([{ kind: 'conflict', currentVersion: 41 }]);
    let reads = 0;
    const sync = overlaySync({
      xcube: admin,
      contentOf: async () => {
        reads += 1;
        return one;
      },
    });

    expect(await sync.push('ws:c')).toEqual({ kind: 'stored', version: 1 });
    expect(pushed.map(({ body }) => body.baseVersion)).toEqual([null, 41]);
    expect(reads).toBe(2);
  });

  it('checks a candidate before it is stored: refused, it changes nothing xcube holds', async () => {
    const refusal: OverlayAnswer = {
      kind: 'refused',
      errors: [{ folderId: 'fsales', name: 'orders', kind: 'compile', message: 'bad' }],
      cubeMessage: null,
    };
    const { admin, pushed } = stubXcube([refusal]);
    const sync = overlaySync({ xcube: admin, contentOf: async () => empty });

    expect(await sync.push('ws:d', one)).toEqual(refusal);
    // Nothing is stored: a preview still names nothing for an empty workspace.
    expect(await sync.ensure('ws:d')).toBeUndefined();
    expect(pushed).toHaveLength(1);
  });

  it('drops it at once when asked, and names it no more', async () => {
    const { admin, dropped } = stubXcube();
    const sync = overlaySync({ xcube: admin, contentOf: async () => one });
    await sync.push('ws:e');
    await sync.drop('ws:e');
    expect(dropped).toEqual([workspaceOverlayIdOf('ws:e')]);
  });

  /**
   * A dashboard's tiles ask at once: the workspace is read once for them,
   * not once a tile, until a push changes what it holds (T347's review).
   */
  it('reads the workspace once for queries asked together, and afresh after a push', async () => {
    const { admin } = stubXcube();
    let reads = 0;
    let now = 0;
    const sync = overlaySync({
      xcube: admin,
      contentOf: async () => {
        reads += 1;
        return one;
      },
      now: () => now,
    });
    await sync.ensure('ws:g');
    await Promise.all([sync.ensure('ws:g'), sync.ensure('ws:g'), sync.ensure('ws:g')]);
    expect(reads).toBe(1);
    await sync.push('ws:g');
    await sync.ensure('ws:g');
    expect(reads).toBe(3);
    now += 3_000;
    await sync.ensure('ws:g');
    expect(reads).toBe(4);
  });

  it('pushes the same content again to renew it once it is old, as xcube counts its life from each push', async () => {
    const { admin, pushed } = stubXcube();
    let now = 0;
    const sync = overlaySync({ xcube: admin, contentOf: async () => one, now: () => now });
    await sync.push('ws:f');
    now += 5 * 3_600_000;
    await sync.ensure('ws:f');
    expect(pushed).toHaveLength(1);
    now += 2 * 3_600_000;
    await sync.ensure('ws:f');
    expect(pushed).toHaveLength(2);
  });
});
