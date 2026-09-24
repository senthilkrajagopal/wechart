import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, getDb } from '../db/client';
import { referencesOf } from '../model/references';
import { ROOT_FOLDER_ID, catalog } from './catalog';
import { documents } from './documents';

/**
 * AC-017: WHEN the user opens Explore, THE SYSTEM SHALL show a folder tree and
 * the contents of the selected folder, listing dashboards and library charts
 * with their type, owner and last-updated time.
 * Fails when: the list omits an item in the folder, or a column is blank for an
 * item that has that value.
 */
const repo = () => documents(getDb());
const cat = () => catalog(getDb());

afterAll(async () => {
  await closeDb();
});

async function folder(title: string, parentId: string = ROOT_FOLDER_ID) {
  const id = randomUUID();
  await repo().create({ kind: 'folder', id, body: { title, folderId: parentId } });
  return id;
}

describe('folder contents (AC-017)', () => {
  it('lists dashboards and charts with their type, owner and last-updated time', async () => {
    const here = await folder('Finance');
    await repo().create({
      kind: 'dashboard',
      id: randomUUID(),
      body: { title: 'Revenue', folderId: here, owner: 'admin' },
    });
    await repo().create({
      kind: 'chart',
      id: randomUUID(),
      body: { title: 'Revenue by region', folderId: here, owner: 'admin' },
    });

    const contents = await cat().contents(here);

    expect(contents).toHaveLength(2);
    for (const item of contents) {
      expect(item.title).not.toBe('(untitled)');
      expect(item.owner).toBe('admin');
      expect(item.updatedAt).toBeInstanceOf(Date);
    }
    expect(contents.map((item) => item.kind).sort()).toEqual(['chart', 'dashboard']);
  });

  it('lists a dashboard with its description, and one without as having none (AC-197)', async () => {
    // Explore shows a dashboard's description beneath its name, as the
    // prototype does; the listing is where it comes from.
    const here = await folder('Described');
    const described = randomUUID();
    const plain = randomUUID();
    await repo().create({
      kind: 'dashboard',
      id: described,
      body: { title: 'Sales', folderId: here, description: 'Revenue and orders since 1996' },
    });
    await repo().create({ kind: 'dashboard', id: plain, body: { title: 'Plain', folderId: here } });

    const contents = await cat().contents(here);

    expect(contents.find((item) => item.id === described)?.description).toBe(
      'Revenue and orders since 1996',
    );
    expect(contents.find((item) => item.id === plain)?.description).toBe(null);
  });

  it('omits nothing that is in the folder', async () => {
    const here = await folder('Busy');
    const titles = ['A', 'B', 'C', 'D'];
    for (const title of titles) {
      await repo().create({
        kind: 'dashboard',
        id: randomUUID(),
        body: { title, folderId: here },
      });
    }

    expect((await cat().contents(here)).map((item) => item.title).sort()).toEqual(titles);
  });

  it('lists sub-folders alongside their contents', async () => {
    const parent = await folder('Parent');
    await folder('Child', parent);

    const contents = await cat().contents(parent);
    expect(contents.map((item) => item.kind)).toContain('folder');
  });

  it('does not list a dashboard-local chart, which belongs to its dashboard (AC-126)', async () => {
    const here = await folder('Has a dashboard');
    await repo().create({
      kind: 'chart',
      id: randomUUID(),
      body: { title: 'Local chart', folderId: here, localToDashboardId: 'dash-1' },
    });

    expect(await cat().contents(here)).toHaveLength(0);
  });

  it('does not list items from another folder', async () => {
    const mine = await folder('Mine');
    const theirs = await folder('Theirs');
    await repo().create({
      kind: 'dashboard',
      id: randomUUID(),
      body: { title: 'Not mine', folderId: theirs },
    });

    expect(await cat().contents(mine)).toHaveLength(0);
  });

  it('derives the columns from the body, so a rename cannot leave them stale', async () => {
    const id = randomUUID();
    const here = await folder('Renames');
    await repo().create({
      kind: 'dashboard',
      id,
      body: { title: 'Before', folderId: here, owner: 'admin' },
    });

    await repo().update({
      kind: 'dashboard',
      id,
      body: { title: 'After', folderId: here, owner: 'admin' },
      expectedVersion: 1,
    });

    expect((await cat().contents(here))[0]?.title).toBe('After');
  });
});

describe('references survive a rename or move (AC-021)', () => {
  /**
   * AC-021: WHEN the user renames or moves a folder, dashboard or chart, THE
   * SYSTEM SHALL keep every reference to it working, including dashboards that
   * use a moved library chart.
   * Fails when: a dashboard that used the object shows a missing-chart state
   * after the move.
   */
  async function chartUsedByDashboard() {
    const from = await folder('Reference source');
    const chartId = randomUUID();
    const dashboardId = randomUUID();

    await repo().create({
      kind: 'chart',
      id: chartId,
      body: { title: 'Shared chart', folderId: from, owner: 'admin' },
    });
    await repo().create({
      kind: 'dashboard',
      id: dashboardId,
      body: { title: 'Uses the chart', folderId: from, charts: [chartId] },
    });

    return { from, chartId, dashboardId };
  }

  it('finds the dashboards that use a chart', async () => {
    const { chartId, dashboardId } = await chartUsedByDashboard();

    const using = await cat().dashboardsUsing(chartId);

    expect(using.map((item) => item.id)).toContain(dashboardId);
  });

  /**
   * T134 / AC-128 (and AC-022, AC-023): a dashboard uses a chart where a tile
   * shows it — on a page, in a section, in a tab — not only through the
   * `charts` list, which tiles do not write. Counted by the list alone, a
   * library chart on two dashboards read as on none.
   */
  it('finds the dashboards whose tiles show a chart, at any depth', async () => {
    const chartId = randomUUID();
    await repo().create({ kind: 'chart', id: chartId, body: { title: 'Tiled', folderId: 'root' } });
    const onPage = randomUUID();
    const inTab = randomUUID();
    const neither = randomUUID();
    await repo().create({
      kind: 'dashboard',
      id: onPage,
      body: {
        title: 'On a page',
        pages: [{ id: 'p', items: [{ id: 't', kind: 'chart', chartId }] }],
      },
    });
    await repo().create({
      kind: 'dashboard',
      id: inTab,
      body: {
        title: 'In a tab',
        pages: [
          {
            id: 'p',
            items: [
              {
                id: 's',
                kind: 'section',
                items: [
                  { id: 'g', kind: 'tabs', tabs: [{ id: 'a', items: [{ id: 't', chartId }] }] },
                ],
              },
            ],
          },
        ],
      },
    });
    await repo().create({
      kind: 'dashboard',
      id: neither,
      body: { title: 'Neither', pages: [{ id: 'p', items: [{ id: 't', chartId: 'other' }] }] },
    });

    const using = (await cat().dashboardsUsing(chartId)).map((item) => item.id);

    expect(using).toContain(onPage);
    expect(using).toContain(inTab);
    expect(using).not.toContain(neither);
  });

  it('keeps the reference working after the chart is moved to another folder', async () => {
    const { chartId, dashboardId } = await chartUsedByDashboard();
    const to = await folder('Reference target');

    await repo().relocate({ kind: 'chart', id: chartId, folderId: to });

    // The chart is in its new home...
    expect((await cat().contents(to)).map((item) => item.id)).toContain(chartId);
    // ...and the dashboard still resolves it, because the reference is by id.
    expect((await cat().dashboardsUsing(chartId)).map((item) => item.id)).toContain(dashboardId);
    expect(await repo().get('chart', chartId)).not.toBeNull();
  });

  it('keeps the reference working after the chart is renamed', async () => {
    const { chartId, dashboardId } = await chartUsedByDashboard();

    await repo().relocate({ kind: 'chart', id: chartId, title: 'Renamed chart' });

    expect((await repo().get('chart', chartId))?.body['title']).toBe('Renamed chart');
    expect((await cat().dashboardsUsing(chartId)).map((item) => item.id)).toContain(dashboardId);
  });

  it('keeps the rest of the body when renaming, so a move is not a rewrite', async () => {
    const { chartId } = await chartUsedByDashboard();

    await repo().relocate({ kind: 'chart', id: chartId, title: 'Only the title changed' });

    const after = await repo().get('chart', chartId);
    expect(after?.body['owner']).toBe('admin');
  });

  it('moves a folder without detaching what is inside it', async () => {
    const parent = await folder('Movable parent');
    const child = await folder('Movable child', parent);
    const newHome = await folder('New home');

    await repo().relocate({ kind: 'folder', id: parent, folderId: newHome });

    // The parent moved; the child still belongs to the parent.
    expect((await cat().contents(newHome)).map((item) => item.id)).toContain(parent);
    expect((await cat().folders()).find((node) => node.id === child)?.parentId).toBe(parent);
  });

  it('raises a clear error rather than silently doing nothing for an unknown object', async () => {
    await expect(
      repo().relocate({ kind: 'chart', id: randomUUID(), title: 'Nope' }),
    ).rejects.toThrow(/no chart found/i);
  });
});

describe('a library chart’s dashboards (AC-022)', () => {
  /**
   * AC-022: WHEN the user opens a library chart's page, THE SYSTEM SHALL list
   * every dashboard that uses it and offer to add it to another dashboard.
   * Fails when: a dashboard that contains the chart is missing from the list.
   */
  it('lists every dashboard that uses the chart, not just one', async () => {
    const here = await folder('Reused chart');
    const chartId = randomUUID();
    await repo().create({
      kind: 'chart',
      id: chartId,
      body: { title: 'Reused', folderId: here },
    });

    const dashboards = [randomUUID(), randomUUID(), randomUUID()];
    for (const [index, id] of dashboards.entries()) {
      await repo().create({
        kind: 'dashboard',
        id,
        body: { title: `Uses it ${String(index)}`, folderId: here, charts: [chartId] },
      });
    }

    const using = await cat().dashboardsUsing(chartId);

    expect(using.map((item) => item.id).sort()).toEqual([...dashboards].sort());
  });

  it('does not list a dashboard that does not use the chart', async () => {
    const here = await folder('Unrelated');
    const chartId = randomUUID();
    await repo().create({ kind: 'chart', id: chartId, body: { title: 'Lonely', folderId: here } });
    await repo().create({
      kind: 'dashboard',
      id: randomUUID(),
      body: { title: 'Uses something else', folderId: here, charts: [randomUUID()] },
    });

    expect(await cat().dashboardsUsing(chartId)).toEqual([]);
  });

  it('lists the dashboard once the chart is added to it', async () => {
    const here = await folder('Attach target');
    const chartId = randomUUID();
    const dashboardId = randomUUID();
    await repo().create({ kind: 'chart', id: chartId, body: { title: 'Added', folderId: here } });
    await repo().create({
      kind: 'dashboard',
      id: dashboardId,
      body: { title: 'Gains a chart', folderId: here },
    });

    expect(await cat().dashboardsUsing(chartId)).toEqual([]);

    await repo().attachChart(dashboardId, chartId);

    expect((await cat().dashboardsUsing(chartId)).map((item) => item.id)).toEqual([dashboardId]);
  });

  it('adding the same chart twice leaves one reference, not two', async () => {
    const here = await folder('Idempotent');
    const chartId = randomUUID();
    const dashboardId = randomUUID();
    await repo().create({ kind: 'chart', id: chartId, body: { title: 'Once', folderId: here } });
    await repo().create({
      kind: 'dashboard',
      id: dashboardId,
      body: { title: 'Double click', folderId: here },
    });

    await repo().attachChart(dashboardId, chartId);
    await repo().attachChart(dashboardId, chartId);

    const dashboard = await repo().get('dashboard', dashboardId);
    expect(dashboard?.body['charts']).toEqual([chartId]);
  });

  it('keeps the charts a dashboard already had', async () => {
    const here = await folder('Additive');
    const existing = randomUUID();
    const added = randomUUID();
    const dashboardId = randomUUID();
    await repo().create({
      kind: 'dashboard',
      id: dashboardId,
      body: { title: 'Has one already', folderId: here, charts: [existing] },
    });

    await repo().attachChart(dashboardId, added);

    expect(
      await repo()
        .get('dashboard', dashboardId)
        .then((d) => d?.body['charts']),
    ).toEqual([existing, added]);
  });
});

describe('search (AC-019)', () => {
  it('finds every dashboard and library chart whose title contains the text', async () => {
    const here = await folder('Search me');
    const unique = `zeta${randomUUID().slice(0, 8)}`;
    await repo().create({
      kind: 'dashboard',
      id: randomUUID(),
      body: { title: `Quarterly ${unique} review`, folderId: here },
    });
    await repo().create({
      kind: 'chart',
      id: randomUUID(),
      body: { title: `${unique} by region`, folderId: here },
    });

    const found = await cat().search(unique);

    expect(found).toHaveLength(2);
    expect(found.map((item) => item.kind).sort()).toEqual(['chart', 'dashboard']);
  });

  it('matches anywhere in the title, not only at the start', async () => {
    const unique = `mid${randomUUID().slice(0, 8)}`;
    await repo().create({
      kind: 'dashboard',
      id: randomUUID(),
      body: { title: `Revenue ${unique} detail`, folderId: ROOT_FOLDER_ID },
    });

    expect(await cat().search(unique)).toHaveLength(1);
  });

  it('ignores case', async () => {
    const unique = `Case${randomUUID().slice(0, 8)}`;
    await repo().create({
      kind: 'dashboard',
      id: randomUUID(),
      body: { title: unique, folderId: ROOT_FOLDER_ID },
    });

    expect(await cat().search(unique.toUpperCase())).toHaveLength(1);
    expect(await cat().search(unique.toLowerCase())).toHaveLength(1);
  });

  it('never returns a dashboard-local chart', async () => {
    const unique = `local${randomUUID().slice(0, 8)}`;
    await repo().create({
      kind: 'chart',
      id: randomUUID(),
      body: { title: `${unique} local chart`, localToDashboardId: 'dash-9' },
    });
    await repo().create({
      kind: 'chart',
      id: randomUUID(),
      body: { title: `${unique} library chart`, folderId: ROOT_FOLDER_ID },
    });

    const found = await cat().search(unique);

    expect(found).toHaveLength(1);
    expect(found[0]?.title).toContain('library');
  });

  it('does not return folders, which are not what search is for', async () => {
    const unique = `fold${randomUUID().slice(0, 8)}`;
    await folder(`${unique} folder`);

    expect(await cat().search(unique)).toHaveLength(0);
  });

  it('returns nothing for an empty query rather than everything', async () => {
    expect(await cat().search('')).toEqual([]);
    expect(await cat().search('   ')).toEqual([]);
  });

  it('treats a wildcard character as text, not as a pattern', async () => {
    const unique = `pct${randomUUID().slice(0, 8)}`;
    await repo().create({
      kind: 'dashboard',
      id: randomUUID(),
      body: { title: `${unique} margin`, folderId: ROOT_FOLDER_ID },
    });

    // '%' must not match everything.
    expect(await cat().search(`${unique}%margin`)).toHaveLength(0);
  });
});

describe('what uses a member (T147, AC-141)', () => {
  it('reads every chart and dashboard with its body, a dashboard’s own charts found through it', async () => {
    const member = `cube_${randomUUID().slice(0, 8)}.amount`;
    const dashboardId = randomUUID();
    const libraryId = randomUUID();
    const localId = randomUUID();
    await repo().create({
      kind: 'chart',
      id: libraryId,
      body: { title: 'Library', folderId: ROOT_FOLDER_ID, query: { measures: [member] } },
    });
    await repo().create({
      kind: 'chart',
      id: localId,
      body: {
        title: 'Local',
        folderId: ROOT_FOLDER_ID,
        localToDashboardId: dashboardId,
        query: { measures: [member] },
      },
    });
    await repo().create({
      kind: 'dashboard',
      id: dashboardId,
      // As a dashboard is stored: its tiles name their charts.
      body: {
        title: 'Holds both',
        folderId: ROOT_FOLDER_ID,
        pages: [
          {
            id: 'p',
            items: [
              { id: 't1', kind: 'chart', chartId: libraryId },
              { id: 't2', kind: 'chart', chartId: localId },
            ],
          },
        ],
      },
    });

    const found = referencesOf(await cat().referenceDocuments(), [member]);

    expect(found.charts.map((chart) => [chart.title, chart.dashboardId])).toEqual([
      ['Library', null],
      ['Local', dashboardId],
    ]);
    expect(found.dashboards).toEqual([
      { id: dashboardId, title: 'Holds both', members: [member], through: [libraryId, localId] },
    ]);
  });
});

describe('folder tree (AC-017)', () => {
  it('reports each folder with its parent, so a tree can be built', async () => {
    const parent = await folder('Tree parent');
    const child = await folder('Tree child', parent);

    const folders = await cat().folders();
    const found = folders.find((node) => node.id === child);

    expect(found?.parentId).toBe(parent);
    expect(found?.title).toBe('Tree child');
  });
});
