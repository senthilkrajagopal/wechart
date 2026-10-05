import { landed, proposedModel } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T384 / AC-051: WHEN a read-write member of that folder opens a calculation
 * request, THE SYSTEM SHALL open the target cube's model in the model editor,
 * in their workspace, with the request visible beside it.
 * Fails when: the editor opens without the request, or on a different cube
 * than the request names.
 *
 * `super` makes /Resolve (read-write `sales-rw`) with two cubes, each in its
 * own model file, and /Resolve/West beneath it, which `managers` write.
 * `manager` asks for a calculation on the second of the two cubes. `writer`
 * opens it from Reviews › Calculation requests: the cube's model, copied into
 * My workspace, opens in the model editor on that cube's file with the
 * request beside it. Then (T385, AC-052) `writer` adds the measure there and
 * proposes it, `super` approves, and the request is resolved, naming it.
 *
 * T590 (AC-052, amended for R64): /Resolve/East, beneath /Resolve and written
 * by `sales-rw` too, holds a view over the cube; /Resolve holds one over the
 * other cube. `writer` asks on the first and `manager` on the second, and
 * `writer` takes both up. The same approval resolves the first view's
 * request, naming the cube's measure, and leaves the second's open.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const CUBE = `t384_${RUN}`;
const OTHER = `t384_other_${RUN}`;
const PATH = `cubes/${CUBE}.yml`;
const OTHER_PATH = `cubes/${OTHER}.yml`;
const modelOf = (name: string) =>
  `cubes:\n  - name: ${name}\n    sql: SELECT 1 AS n, 2 AS cost\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`;
const WITH_MARGIN = `${modelOf(CUBE)}      - name: margin\n        sql: n - cost\n        type: sum\n`;
const DESCRIPTION = `Margin, n less cost (${RUN})`;
/** T590: a view over the cube, in /Resolve/East, and one over the other cube, in /Resolve. */
const VIEW = `t590_v_${RUN}`;
const OFF_VIEW = `t590_off_${RUN}`;
const viewOf = (name: string, over: string) =>
  `views:\n  - name: ${name}\n    cubes:\n      - join_path: ${over}\n        includes: "*"\n`;
const VIEW_PATH = `views/${VIEW}.yml`;
const OFF_VIEW_PATH = `views/${OFF_VIEW}.yml`;
const made = {
  folder: '',
  west: '',
  xcubeId: '',
  chart: '',
  request: '',
  asker: '',
  project: '',
  proposal: '',
  viewRequest: '',
  offViewRequest: '',
  east: '',
  eastChart: '',
};
const xcubeIdOf = (folderId: string) => `f${folderId.replaceAll('-', '')}`;
const full = (name = CUBE) => `${made.xcubeId}__${name}`;

test.describe.configure({ mode: 'serial' });

test.describe('a calculation request opened in My workspace, and resolved by its measure (T384, T385, T590)', () => {
  test.afterAll(async ({ browser }) => {
    test.setTimeout(180_000);
    for (const who of ['writer', 'manager', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      const { request } = context;
      if (who === 'writer' && made.project !== '') {
        await request.delete(
          `/api/model/files?folder=${encodeURIComponent(made.project)}&path=${encodeURIComponent(PATH)}`,
          { timeout: 90_000 },
        );
        await request.delete(`/api/documents/folder/${made.project}`);
      }
      if (who === 'writer' && made.eastChart !== '')
        await request.delete(`/api/documents/chart/${made.eastChart}`);
      if (who === 'manager' && made.chart !== '')
        await request.delete(`/api/documents/chart/${made.chart}`);
      if (who === 'super') {
        if (made.west !== '') await request.delete(`/api/documents/folder/${made.west}`);
        // The views first, since they name the cubes.
        if (made.east !== '') {
          await request.delete(
            `/api/model/files?folder=${made.east}&path=${encodeURIComponent(VIEW_PATH)}`,
            { timeout: 90_000 },
          );
          await request.delete(`/api/documents/folder/${made.east}`);
        }
        if (made.folder !== '') {
          for (const path of [OFF_VIEW_PATH, PATH, OTHER_PATH])
            await request.delete(
              `/api/model/files?folder=${made.folder}&path=${encodeURIComponent(path)}`,
              { timeout: 90_000 },
            );
          await request.delete(`/api/documents/folder/${made.folder}`);
        }
      }
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes /Resolve with two cubes, a view over each (one in /Resolve/East), and /Resolve/West', async ({
      page,
    }) => {
      const { request } = page;
      const folder = await request.post('/api/documents', {
        data: { kind: 'folder', title: `Resolve ${RUN}`, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      made.xcubeId = `f${made.folder.replaceAll('-', '')}`;
      expect(
        (
          await request.put(`/api/folders/${made.folder}/access`, {
            data: { readOnly: [], readWrite: ['sales-rw'] },
          })
        ).status(),
      ).toBe(200);
      const west = await request.post('/api/documents', {
        data: { kind: 'folder', title: `West ${RUN}`, folderId: made.folder },
      });
      made.west = ((await west.json()) as { id: string }).id;
      expect(
        (
          await request.put(`/api/folders/${made.west}/access`, {
            data: { readOnly: [], readWrite: ['managers'] },
          })
        ).status(),
      ).toBe(200);
      // The other cube first, so that a page opening the folder's first file
      // opens the wrong one.
      const files = [
        { path: OTHER_PATH, content: modelOf(OTHER) },
        { path: PATH, content: modelOf(CUBE) },
        { path: OFF_VIEW_PATH, content: viewOf(OFF_VIEW, OTHER) },
      ];
      expect(await landed(request, made.folder, files)).toEqual(files);
      // /Resolve/East, beneath it, which /Resolve's read-write members write too,
      // with a view over /Resolve's cube (T590).
      const east = await request.post('/api/documents', {
        data: { kind: 'folder', title: `East ${RUN}`, folderId: made.folder },
      });
      made.east = ((await east.json()) as { id: string }).id;
      expect(
        (
          await request.put(`/api/folders/${made.east}/access`, {
            data: { readOnly: [], readWrite: ['sales-rw'] },
          })
        ).status(),
      ).toBe(200);
      const view = [{ path: VIEW_PATH, content: viewOf(VIEW, CUBE) }];
      expect(await landed(request, made.east, view)).toEqual(view);
    });
  });

  test.describe('as manager', () => {
    test.use({ role: 'manager' });

    test('asks for a calculation on the cube', async ({ page }) => {
      const { request } = page;
      const created = await request.post('/api/documents', {
        data: { kind: 'chart', title: `Asked ${RUN}`, folderId: 'mine', targetFolderId: made.west },
      });
      expect(created.status(), await created.text()).toBe(201);
      made.chart = ((await created.json()) as { id: string }).id;
      const asked = await request.post('/api/calc-requests', {
        data: {
          chartId: made.chart,
          cube: full(),
          fields: { measures: [`${full()}.n`] },
          description: DESCRIPTION,
        },
      });
      expect(asked.status(), await asked.text()).toBe(201);
      made.request = ((await asked.json()) as { id: string }).id;
      made.asker = ((await (await request.get('/api/me')).json()) as { name: string }).name;
    });

    test('asks for a calculation on /Resolve’s view over the other cube (T590)', async ({
      page,
    }) => {
      const asked = await page.request.post('/api/calc-requests', {
        data: {
          chartId: made.chart,
          cube: full(OFF_VIEW),
          fields: { measures: [`${full(OFF_VIEW)}.n`] },
          description: `On the view ${OFF_VIEW}`,
        },
      });
      expect(asked.status(), await asked.text()).toBe(201);
      made.offViewRequest = ((await asked.json()) as { id: string }).id;
    });
  });

  test.describe('as writer, who writes /Resolve', () => {
    test.use({ role: 'writer' });

    test('opens it: the cube’s model in My workspace, in the model editor, with the request beside it (AC-051)', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.goto(`/reviews?tab=requests&selected=${made.request}`);
      const summary = page.getByRole('region', { name: `Calculation on ${CUBE}` });
      await summary.getByRole('button', { name: 'Open in My workspace' }).click();

      // The cube's own file, in a folder of My workspace, the request named.
      await page.waitForURL(/\/explore\/folders\/[^/]+\/models\/[^/?]+\?request=/, {
        timeout: 90_000,
      });
      const at = new URL(page.url());
      const [, explore, folders, project, models, file] = at.pathname.split('/');
      expect([explore, folders, models, decodeURIComponent(file ?? '')]).toEqual([
        'explore',
        'folders',
        'models',
        PATH,
      ]);
      expect(at.searchParams.get('request')).toBe(made.request);
      made.project = decodeURIComponent(project ?? '');
      expect(made.project).not.toBe(made.folder);

      const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
      await expect(crumbs).toContainText('My workspace');
      await expect(crumbs).toContainText(PATH);
      // The editor on the cube the request names, not the other one.
      await expect(page.getByTestId('selected-object')).toHaveText(PATH);
      const pane = page.getByRole('complementary', { name: 'Calculation request' });
      await expect(pane.getByTestId('pane-request-cube')).toHaveText(
        `On ${CUBE}, asked by ${made.asker}`,
      );
      await expect(pane.getByTestId('pane-request-description')).toHaveText(DESCRIPTION);
      await expect(pane.getByTestId('pane-request-fields')).toHaveText(`Metrics: ${CUBE}.n`);
      // Beside the editor, not beneath it.
      const editor = await page.locator('.model-editor').boundingBox();
      const beside = await pane.boundingBox();
      expect(editor).not.toBeNull();
      expect(beside).not.toBeNull();
      expect(beside!.x).toBeGreaterThanOrEqual(editor!.x + editor!.width - 1);
      expect(beside!.y).toBeLessThan(editor!.y + editor!.height);

      // Opened again, it is the same copy, not a second one.
      await page.goto(`/reviews?tab=requests&selected=${made.request}`);
      await page
        .getByRole('region', { name: `Calculation on ${CUBE}` })
        .getByRole('button', { name: 'Open in My workspace' })
        .click();
      await page.waitForURL(/\/explore\/folders\/[^/]+\/models\/[^/?]+\?request=/, {
        timeout: 90_000,
      });
      expect(decodeURIComponent(new URL(page.url()).pathname.split('/')[3] ?? '')).toBe(
        made.project,
      );
    });

    test('asks for a calculation on /Resolve/East’s view over the cube, and takes up both views’ (T590)', async ({
      page,
    }) => {
      const { request } = page;
      const created = await request.post('/api/documents', {
        data: { kind: 'chart', title: `East ${RUN}`, folderId: 'mine', targetFolderId: made.east },
      });
      expect(created.status(), await created.text()).toBe(201);
      made.eastChart = ((await created.json()) as { id: string }).id;
      const onView = `${xcubeIdOf(made.east)}__${VIEW}`;
      const asked = await request.post('/api/calc-requests', {
        data: {
          chartId: made.eastChart,
          cube: onView,
          fields: { measures: [`${onView}.n`] },
          description: `On the view ${VIEW}`,
        },
      });
      expect(asked.status(), await asked.text()).toBe(201);
      made.viewRequest = ((await asked.json()) as { id: string }).id;
      for (const id of [made.viewRequest, made.offViewRequest]) {
        const taken = await request.post(`/api/calc-requests/${id}/take`);
        expect(taken.status(), await taken.text()).toBe(200);
      }
    });

    test('adds the measure to the cube in My workspace, and proposes it', async ({ page }) => {
      const { request } = page;
      const changed = await request.post('/api/model/publish', {
        data: {
          folderId: made.project,
          files: [{ path: PATH, content: WITH_MARGIN }],
          targetFolderId: made.folder,
        },
        timeout: 90_000,
      });
      expect(changed.status(), await changed.text()).toBe(200);
      const proposed = await proposedModel(request, made.project, PATH);
      expect(proposed.status(), await proposed.text()).toBe(201);
      const proposal = (await proposed.json()) as {
        id: string;
        kind: string;
        targetFolderId: string;
      };
      // The model, going back to /Resolve.
      expect([proposal.kind, proposal.targetFolderId]).toEqual(['model', made.folder]);
      made.proposal = proposal.id;
    });
  });

  test.describe('as super, who writes everything', () => {
    test.use({ role: 'super' });

    test('approves the proposal', async ({ page }) => {
      const approved = await page.request.post(`/api/proposals/${made.proposal}/approve`, {
        data: {},
        timeout: 90_000,
      });
      expect(approved.status(), await approved.text()).toBe(200);
    });
  });

  /**
   * T385 / AC-052 (amended 2026-10-04, R63): WHEN a requested measure is added
   * to the model and its proposal is approved into the folder, THE SYSTEM
   * SHALL mark the request as resolved and name the member that resolves it.
   * A requested measure is one that a proposal adds to the request's cube,
   * where the proposal's author is a member who took the request up by
   * opening it in their workspace (AC-051).
   * Fails when: the request stays open after the approval of a proposal that
   * adds a measure to its cube, from a member who took it up, or names no
   * member.
   */
  test.describe('as writer, once it is approved', () => {
    test.use({ role: 'writer' });

    test('finds the request resolved under Reviews, naming the measure that resolves it (AC-052)', async ({
      page,
    }) => {
      const me = ((await (await page.request.get('/api/me')).json()) as { name: string }).name;
      await page.goto('/reviews?tab=requests');
      const row = page
        .getByRole('table', { name: 'Calculation requests' })
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: CUBE, exact: true }) });
      await expect(row).toHaveCount(1);
      await expect(row.getByRole('cell').last()).toHaveText('Resolved');
      await row.getByRole('button', { name: CUBE, exact: true }).click();
      const summary = page.getByRole('region', { name: `Calculation on ${CUBE}` });
      await expect(summary.getByTestId('request-resolution')).toContainText(
        `Resolved by ${CUBE}.margin · added by ${me}, approved by `,
      );
      await expect(summary.getByRole('button', { name: 'Open in My workspace' })).toHaveCount(0);

      // Beside the model, too, where it was opened.
      await page.goto(
        `/explore/folders/${encodeURIComponent(made.project)}/models/${encodeURIComponent(PATH)}?request=${made.request}`,
      );
      await expect(
        page
          .getByRole('complementary', { name: 'Calculation request' })
          .getByTestId('pane-request-resolution'),
      ).toContainText(`Resolved by ${CUBE}.margin`);
    });

    /**
     * T590 / AC-052 (amended 2026-10-04, R64): a request on a view is resolved
     * by a measure added to a cube on the view's join paths, and names it.
     */
    test('finds the view’s request resolved by the cube’s measure, and the other view’s still open (AC-052, R64)', async ({
      page,
    }) => {
      await page.goto('/reviews?tab=requests');
      const rowOf = (name: string) =>
        page
          .getByRole('table', { name: 'Calculation requests' })
          .getByRole('row')
          .filter({ has: page.getByRole('button', { name, exact: true }) });
      await expect(rowOf(VIEW)).toHaveCount(1);
      await expect(rowOf(VIEW).getByRole('cell').last()).toHaveText('Resolved');
      await expect(rowOf(OFF_VIEW).getByRole('cell').last()).toHaveText('Open');
      await rowOf(VIEW).getByRole('button', { name: VIEW, exact: true }).click();
      await expect(
        page
          .getByRole('region', { name: `Calculation on ${VIEW}` })
          .getByTestId('request-resolution'),
      ).toContainText(`Resolved by ${CUBE}.margin · added by `);
    });
  });
});
