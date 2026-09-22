import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { DOCUMENT_KINDS, DocumentNotFoundError, StaleDocumentError, documents } from './documents';

/**
 * AC-014: WHEN a dashboard, chart, folder, bookmark or setting is saved, THE
 * SYSTEM SHALL store it so that it is present and unchanged after the wechart
 * service restarts.
 *
 * AC-015: WHEN two browser sessions edit the same dashboard and the second
 * saves over a newer version, THE SYSTEM SHALL refuse the save and tell the
 * user the dashboard changed.
 *
 * These run against the real Postgres in docker-compose.yml, brought up and
 * migrated by ../../vitest.globalSetup.ts. Nothing here is faked: AC-014 is a
 * claim about what survives a restart, and an in-memory double cannot
 * demonstrate it.
 */

/**
 * Resolved per call, never captured: the restart test below destroys the pool,
 * so a repo held at module scope would be dead for every test after it.
 */
const repo = () => documents(getDb());

afterAll(async () => {
  await closeDb();
});

describe('persistence across a restart (AC-014)', () => {
  it.each(DOCUMENT_KINDS)('stores a %s unchanged', async (kind) => {
    const id = randomUUID();
    const body = {
      title: `A ${kind}`,
      nested: { list: [1, 2, 3], flag: true, nothing: null },
      unicode: 'markings — Spotfire’s “brushing”',
      // A chart has a document format (AC-181), so a body without one is an
      // *older* chart and is upgraded on read by design. This criterion is
      // about storage being faithful, so the chart it stores is a current one;
      // the upgrade path has its own tests below.
      ...(kind === 'chart'
        ? {
            schemaVersion: 1,
            chart: {
              source: { cube: 'orders' },
              wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
            },
          }
        : {}),
    };

    await repo().create({ kind, id, body });

    // A new pool is what the service gets after a restart: the connection that
    // wrote the row is gone, and the row has to come back from disk.
    await closeDb();
    const found = await repo().get(kind, id);

    expect(found).not.toBeNull();
    expect(found?.body).toEqual(body);
    expect(found?.version).toBe(1);
  });

  it('keeps each kind in its own namespace, so the same id does not collide', async () => {
    const id = randomUUID();
    const chart = {
      title: 'chart',
      schemaVersion: 1,
      chart: {
        source: { cube: 'orders' },
        wells: { measures: [], dimensions: [], timeDimensions: [] },
      },
    };
    await repo().create({ kind: 'dashboard', id, body: { title: 'dashboard' } });
    await repo().create({ kind: 'chart', id, body: chart });

    expect((await repo().get('dashboard', id))?.body).toEqual({ title: 'dashboard' });
    expect((await repo().get('chart', id))?.body).toEqual(chart);
  });

  it('returns null for an id that was never stored', async () => {
    expect(await repo().get('dashboard', randomUUID())).toBeNull();
  });
});

describe('optimistic concurrency (AC-015)', () => {
  it('refuses a save over a newer version and says the dashboard changed', async () => {
    const id = randomUUID();
    await repo().create({ kind: 'dashboard', id, body: { title: 'original' } });

    // Two sessions both read version 1.
    const sessionA = await repo().get('dashboard', id);
    const sessionB = await repo().get('dashboard', id);
    expect(sessionA?.version).toBe(1);
    expect(sessionB?.version).toBe(1);

    // A saves first and wins.
    const saved = await repo().update({
      kind: 'dashboard',
      id,
      body: { title: 'from A' },
      expectedVersion: sessionA!.version,
    });
    expect(saved.version).toBe(2);

    // B saves over it holding the stale version, and is refused.
    await expect(
      repo().update({
        kind: 'dashboard',
        id,
        body: { title: 'from B' },
        expectedVersion: sessionB!.version,
      }),
    ).rejects.toBeInstanceOf(StaleDocumentError);

    // The refusal must not have been a silent no-op: A's save stands.
    const current = await repo().get('dashboard', id);
    expect(current?.body).toEqual({ title: 'from A' });
    expect(current?.version).toBe(2);
  });

  it('carries the current version on the error, so the UI can say what changed', async () => {
    const id = randomUUID();
    await repo().create({ kind: 'dashboard', id, body: { n: 0 } });
    await repo().update({ kind: 'dashboard', id, body: { n: 1 }, expectedVersion: 1 });

    const error = await repo()
      .update({ kind: 'dashboard', id, body: { n: 2 }, expectedVersion: 1 })
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(error).toBeInstanceOf(StaleDocumentError);
    expect((error as StaleDocumentError).currentVersion).toBe(2);
    expect((error as StaleDocumentError).expectedVersion).toBe(1);
    expect((error as StaleDocumentError).message).toMatch(/changed/i);
  });

  it('increments the version on every accepted save', async () => {
    const id = randomUUID();
    await repo().create({ kind: 'setting', id, body: { theme: 'light' } });

    let version = 1;
    for (const theme of ['dark', 'light', 'dark']) {
      const saved = await repo().update({
        kind: 'setting',
        id,
        body: { theme },
        expectedVersion: version,
      });
      version += 1;
      expect(saved.version).toBe(version);
    }

    expect((await repo().get('setting', id))?.version).toBe(4);
  });

  it('refuses an update to an id that does not exist, and says so rather than reporting a conflict', async () => {
    const id = randomUUID();

    const error = await repo()
      .update({ kind: 'dashboard', id, body: {}, expectedVersion: 1 })
      .then(
        () => null,
        (e: unknown) => e,
      );

    // Distinct from StaleDocumentError: nothing changed under the caller, the
    // object is simply not there.
    expect(error).toBeInstanceOf(DocumentNotFoundError);
    expect(error).not.toBeInstanceOf(StaleDocumentError);
    expect((error as DocumentNotFoundError).message).toContain(id);
  });
});

/**
 * AC-181: WHEN a saved chart written in an earlier document format is opened,
 * THE SYSTEM SHALL upgrade it to the current format on read and render the
 * same chart.
 *
 * The unit tests in @wechart/core cover the upgrade steps themselves. What
 * this file adds is the half they cannot reach: that opening a chart actually
 * goes through them. A migration nothing calls is not a migration.
 */
describe('a chart saved in an earlier format (AC-181)', () => {
  /** Exactly the body charts had before they carried a definition. */
  const legacyBody = { title: 'Chart from an older wechart', owner: 'admin' };

  it('comes back upgraded when it is opened', async () => {
    const id = randomUUID();
    await repo().create({ kind: 'chart', id, body: legacyBody });

    const opened = await repo().get('chart', id);

    expect(opened?.body['schemaVersion']).toBe(1);
    expect(opened?.body['chart']).toEqual({
      source: { cube: '' },
      wells: { measures: [], dimensions: [], timeDimensions: [] },
    });
  });

  it('keeps what the old chart said about itself', async () => {
    const id = randomUUID();
    await repo().create({ kind: 'chart', id, body: legacyBody });

    const opened = await repo().get('chart', id);

    // The upgrade adds; it must not drop or rewrite what was there.
    expect(opened?.body['title']).toBe('Chart from an older wechart');
    expect(opened?.body['owner']).toBe('admin');
  });

  it('does not rewrite the stored row, so reading a chart cannot corrupt it', async () => {
    const id = randomUUID();
    await repo().create({ kind: 'chart', id, body: legacyBody });

    const before = await repo().get('chart', id);
    await repo().get('chart', id);
    const after = await repo().get('chart', id);

    // An upgrade that saved itself would bump the version on every read, and
    // would race with a concurrent edit (AC-015).
    expect(after?.version).toBe(before?.version);
  });

  it('leaves other kinds alone', async () => {
    const id = randomUUID();
    await repo().create({ kind: 'dashboard', id, body: { title: 'A dashboard' } });

    // Only charts have this format; migrating a dashboard would invent a
    // chart definition on something that is not a chart.
    expect((await repo().get('dashboard', id))?.body).toEqual({ title: 'A dashboard' });
  });
});

/**
 * T192 / AC-183: a dashboard and the charts edited from its tiles are written
 * together, all or nothing, in one transaction
 * (docs/research/db-access.md, "Query-time transactions"). Two separate writes
 * have no safe order: charts first leaves them changed if the dashboard then
 * fails; dashboard first loses the edit if a chart fails.
 *
 * Against the real database, because what is being claimed is what Postgres
 * does inside a transaction — an in-memory double cannot roll anything back.
 */
describe('writing several documents together (AC-183)', () => {
  /** Ids that sort in a known order, so a test can place the failing write last. */
  const ids = () => {
    const prefix = randomUUID();
    return { a: `${prefix}-a`, b: `${prefix}-b`, c: `${prefix}-c` };
  };

  it('writes every document', async () => {
    const { a, b } = ids();
    await repo().create({ kind: 'dashboard', id: a, body: { title: 'a' } });
    await repo().create({ kind: 'dashboard', id: b, body: { title: 'b' } });

    await repo().updateTogether([
      { kind: 'dashboard', id: a, body: { title: 'a2' }, expectedVersion: 1 },
      { kind: 'dashboard', id: b, body: { title: 'b2' }, expectedVersion: 1 },
    ]);

    expect((await repo().get('dashboard', a))?.body).toEqual({ title: 'a2' });
    expect((await repo().get('dashboard', b))?.body).toEqual({ title: 'b2' });
  });

  it('writes none of them when one is stale — the earlier writes are rolled back', async () => {
    /**
     * The stale one sorts last, so two writes have really been made by the
     * time it fails: this tests that they are undone, not that nothing was
     * attempted.
     */
    const { a, b, c } = ids();
    for (const id of [a, b, c])
      await repo().create({ kind: 'dashboard', id, body: { title: 'before' } });

    await expect(
      repo().updateTogether([
        { kind: 'dashboard', id: a, body: { title: 'after' }, expectedVersion: 1 },
        { kind: 'dashboard', id: b, body: { title: 'after' }, expectedVersion: 1 },
        { kind: 'dashboard', id: c, body: { title: 'after' }, expectedVersion: 7 },
      ]),
    ).rejects.toBeInstanceOf(StaleDocumentError);

    for (const id of [a, b, c]) {
      const stored = await repo().get('dashboard', id);
      expect(stored?.body).toEqual({ title: 'before' });
      expect(stored?.version).toBe(1);
    }
  });

  it('says which document was stale', async () => {
    // The 409 names it, so the user is told a chart changed rather than the
    // dashboard, or the other way round.
    const { a, b } = ids();
    await repo().create({ kind: 'dashboard', id: a, body: {} });
    await repo().create({ kind: 'dashboard', id: b, body: {} });

    const failure = await repo()
      .updateTogether([
        { kind: 'dashboard', id: a, body: {}, expectedVersion: 1 },
        { kind: 'dashboard', id: b, body: {}, expectedVersion: 3 },
      ])
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(StaleDocumentError);
    expect((failure as StaleDocumentError).id).toBe(b);
  });

  /**
   * T132 (AC-126): a chart made on a dashboard is written with the dashboard,
   * in the same save. Version 0 is a document not yet stored — documents
   * start at 1 — so it is created, in the same transaction.
   */
  it('creates a document written at version 0, with the others, or not at all', async () => {
    const { a, b } = ids();
    await repo().create({ kind: 'dashboard', id: a, body: { title: 'before' } });

    const written = await repo().updateTogether([
      { kind: 'dashboard', id: a, body: { title: 'after' }, expectedVersion: 1 },
      { kind: 'chart', id: b, body: { title: 'new' }, expectedVersion: 0 },
    ]);

    expect(written.map((document) => document.version)).toEqual([2, 1]);
    expect((await repo().get('chart', b))?.body['title']).toBe('new');
  });

  it('creates only a chart at version 0: anything else is not made (T132’s review)', async () => {
    const { a } = ids();

    await expect(
      repo().updateTogether([{ kind: 'dashboard', id: a, body: {}, expectedVersion: 0 }]),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(await repo().get('dashboard', a)).toBeNull();
  });

  it('refuses to create a document that is already stored, and writes nothing', async () => {
    // Version 0 claims the id is new; one already stored is not written over.
    const { a, b } = ids();
    await repo().create({ kind: 'dashboard', id: a, body: { title: 'before' } });
    await repo().create({ kind: 'chart', id: b, body: { title: 'stored' } });

    const failure = await repo()
      .updateTogether([
        { kind: 'dashboard', id: a, body: { title: 'after' }, expectedVersion: 1 },
        { kind: 'chart', id: b, body: { title: 'claimed' }, expectedVersion: 0 },
      ])
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(StaleDocumentError);
    expect((failure as StaleDocumentError).id).toBe(b);
    // A chart reads back with the fields its reader adds; its own title stands.
    expect((await repo().get('chart', b))?.body['title']).toBe('stored');
    expect((await repo().get('dashboard', a))?.body).toEqual({ title: 'before' });
  });

  it('refuses the same document twice, and writes nothing', async () => {
    // A second write of one document in the same save would be stale against
    // the first, so the pair is refused outright rather than half-applied.
    const { a } = ids();
    await repo().create({ kind: 'dashboard', id: a, body: { title: 'before' } });

    await expect(
      repo().updateTogether([
        { kind: 'dashboard', id: a, body: { title: 'one' }, expectedVersion: 1 },
        { kind: 'dashboard', id: a, body: { title: 'two' }, expectedVersion: 1 },
      ]),
    ).rejects.toThrow(/more than once/);

    expect((await repo().get('dashboard', a))?.body).toEqual({ title: 'before' });
  });

  it('lets exactly one of two racing saves win', async () => {
    /**
     * Two sessions both hold version 1 and save at once. Under READ COMMITTED
     * the second waits on the first's row lock, then re-checks its version
     * predicate against the committed row and matches nothing (PG 18 §13.2.1).
     */
    const { a, b } = ids();
    await repo().create({ kind: 'dashboard', id: a, body: { title: 'before' } });
    await repo().create({ kind: 'dashboard', id: b, body: { title: 'before' } });

    const save = (title: string) =>
      repo().updateTogether([
        { kind: 'dashboard', id: a, body: { title }, expectedVersion: 1 },
        { kind: 'dashboard', id: b, body: { title }, expectedVersion: 1 },
      ]);
    const outcomes = await Promise.allSettled([save('first'), save('second')]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const lost = outcomes.find((outcome) => outcome.status === 'rejected');
    expect((lost as PromiseRejectedResult).reason).toBeInstanceOf(StaleDocumentError);

    // And the winner's save stands whole, on both documents.
    const [first, second] = [await repo().get('dashboard', a), await repo().get('dashboard', b)];
    expect(first?.body).toEqual(second?.body);
    expect(first?.version).toBe(2);
  });
});
