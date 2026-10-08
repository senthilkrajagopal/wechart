import { execFileSync } from 'node:child_process';

import { BASE_URL, expect, signInThroughDex, test } from './fixtures';
import { changeShared } from './shared-change';

/**
 * T356 (AC-288, AC-286, AC-290; design 05's review view, states I, J and K):
 * the decider opens a proposal from Reviews and decides it on the item
 * itself. Approved, the folder shows the new version at once and keeps the
 * replaced one in its history; rejected, the folder is as it was and the
 * author keeps the work. The author sees their own as theirs to approve.
 *
 * `super` makes a folder `writer` (`sales-rw`) may write, with a dashboard
 * in it; `writer` copies the dashboard, renames the copy and proposes it,
 * and proposes a new chart there too.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Review ${RUN}`;
const BOARD = `Board ${RUN}`;
const CHART = `Chart ${RUN}`;
const ORDERS = `Orders ${RUN}`;
const REASON = `Not this quarter (${RUN}).`;
const made = {
  folder: '',
  board: '',
  library: '',
  chartCopy: '',
  copy: '',
  /** The project folder the copy went into (T523). */
  project: '',
  chart: '',
  own: '',
  boardProposal: '',
  chartProposal: '',
  ownProposal: '',
};

/** A chart of the seeded `orders` cube's count, kept in `folderId`. */
const ordersChart = (folderId: string) => ({
  schemaVersion: 1,
  title: ORDERS,
  folderId,
  chart: {
    source: { cube: 'orders' },
    wells: { measures: ['orders.count'], dimensions: [], timeDimensions: [] },
  },
});

/** The item's versions wechart keeps, from the suite's own database. */
function versionsOf(itemId: string): string[] {
  expect(itemId).toMatch(/^[0-9a-f-]{36}$/);
  return execFileSync(
    'docker',
    [
      'exec',
      'wechart-meta',
      'psql',
      '-U',
      'wechart',
      '-d',
      'wechart_security',
      '-Atc',
      `SELECT version || ':' || title FROM item_versions WHERE item_id = '${itemId}' ORDER BY version`,
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter((line) => line !== '');
}

test.describe.configure({ mode: 'serial' });

test.describe('deciding a proposal in its review view (T356, AC-288)', () => {
  test.afterAll(async ({ browser }) => {
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      if (who === 'writer') {
        for (const proposal of [made.chartProposal, made.ownProposal])
          if (proposal !== '')
            await context.request.post(`/api/proposals/${proposal}/reject`, { data: {} });
        for (const [kind, id] of [
          ['dashboard', made.copy],
          ['chart', made.chartCopy],
          ['chart', made.chart],
          ['chart', made.own],
          ['folder', made.project],
        ] as const)
          if (id !== '') await context.request.delete(`/api/documents/${kind}/${id}`);
      }
      if (who === 'super') {
        if (made.board !== '')
          await context.request.delete(`/api/documents/dashboard/${made.board}`);
        if (made.library !== '')
          await context.request.delete(`/api/documents/chart/${made.library}`);
        if (made.folder !== '')
          await context.request.delete(`/api/documents/folder/${made.folder}`);
      }
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folder, and a dashboard in it showing a chart and a text', async ({ page }) => {
      const folder = await page.request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      expect(
        // `reader` (`sales-ro`) a read-only member, to be refused a decision
        // (AC-286).
        (
          await page.request.put(`/api/folders/${made.folder}/access`, {
            data: { readOnly: ['sales-ro'], readWrite: ['sales-rw'] },
          })
        ).status(),
      ).toBe(200);
      const created = async (kind: string, title: string) => {
        const answer = await page.request.post('/api/documents', {
          data: { kind, title, folderId: made.folder },
        });
        expect(answer.status(), await answer.text()).toBe(201);
        return ((await answer.json()) as { id: string }).id;
      };
      // Given their content as a shared one's is given: by approving a copy
      // (T502, AC-278).
      made.library = await created('chart', ORDERS);
      expect(
        await changeShared(page.request, 'chart', made.library, (body) => ({
          ...body,
          chart: ordersChart(made.folder).chart,
        })),
      ).toEqual([{ kind: 'chart', id: made.library, version: 2 }]);
      made.board = await created('dashboard', BOARD);
      expect(
        await changeShared(page.request, 'dashboard', made.board, (body) => ({
          ...body,
          pages: [
            {
              id: 'p1',
              title: 'Page 1',
              items: [
                { id: 't-chart', kind: 'chart', chartId: made.library },
                { id: 't-text', kind: 'text', text: `Hello ${RUN}` },
              ],
            },
          ],
        })),
      ).toEqual([{ kind: 'dashboard', id: made.board, version: 2 }]);
    });
  });

  test.describe('as writer, the author', () => {
    test.use({ role: 'writer' });

    test('proposes a changed copy of the dashboard, a new chart, and one more of their own', async ({
      page,
    }) => {
      const copied = await page.request.post('/api/workspace/copies', {
        data: { kind: 'dashboard', id: made.board, timeZone: 'UTC' },
      });
      expect(copied.status(), await copied.text()).toBeLessThan(300);
      ({ id: made.copy, folderId: made.project } = (await copied.json()) as {
        id: string;
        folderId: string;
      });
      const stored = (await (
        await page.request.get(`/api/documents/dashboard/${made.copy}`)
      ).json()) as {
        body: { pages: { items: { id: string; chartId?: string }[] }[] } & Record<string, unknown>;
        version: number;
      };
      // Its chart, copied into the workspace with it: changed in what it says.
      made.chartCopy = stored.body.pages[0]!.items.find((each) => each.id === 't-chart')!.chartId!;
      expect(made.chartCopy).not.toBe(made.library);
      const chart = (await (
        await page.request.get(`/api/documents/chart/${made.chartCopy}`)
      ).json()) as { body: Record<string, unknown>; version: number };
      expect(
        (
          await page.request.put(`/api/documents/chart/${made.chartCopy}`, {
            data: {
              version: chart.version,
              body: { ...chart.body, description: `Counts every order (${RUN}).` },
            },
          })
        ).status(),
      ).toBeLessThan(300);
      // Changed, not renamed, since an approval replaces the item of its
      // name (AC-288): a new tile, and a new page tab.
      const changed = await page.request.put(`/api/documents/dashboard/${made.copy}`, {
        data: {
          body: {
            ...stored.body,
            pages: [
              {
                ...stored.body.pages[0],
                items: [
                  ...stored.body.pages[0]!.items,
                  { id: 't-new', kind: 'text', text: `Added ${RUN}` },
                ],
              },
              { id: 'p-notes', title: `Notes ${RUN}`, items: [] },
            ],
          },
          version: stored.version,
        },
      });
      expect(changed.status(), await changed.text()).toBeLessThan(300);
      const propose = async (kind: string, id: string, description?: string) => {
        const answer = await page.request.post('/api/proposals', {
          data: { kind, id, ...(description === undefined ? {} : { description }) },
        });
        expect(answer.status(), await answer.text()).toBe(201);
        return ((await answer.json()) as { id: string }).id;
      };
      made.boardProposal = await propose('dashboard', made.copy, `Adds a notes tab (${RUN}).`);
      for (const key of ['chart', 'own'] as const) {
        const title = key === 'chart' ? CHART : `${CHART} own`;
        const drafted = await page.request.post('/api/documents', {
          data: { kind: 'chart', title, folderId: 'mine', targetFolderId: made.folder },
        });
        made[key] = ((await drafted.json()) as { id: string }).id;
        // Something to draw, on the seeded `orders`.
        expect(
          (
            await page.request.put(`/api/documents/chart/${made[key]}`, {
              data: {
                version: 1,
                body: { ...ordersChart('mine'), title, targetFolderId: made.folder },
              },
            })
          ).status(),
        ).toBeLessThan(300);
      }
      made.chartProposal = await propose('chart', made.chart);
      made.ownProposal = await propose('chart', made.own);
    });
  });

  // AC-286: only its author, a read-write member of the target folder or a
  // Super-Admin decides a proposal. `reader` is a read-only member of the
  // folder and `manager` has no access to it: neither finds it to decide,
  // and what they send lands nothing.
  for (const role of ['reader', 'manager'] as const) {
    test.describe(`as ${role}, who may not decide it`, () => {
      test.use({ role });

      test('finds no proposal to approve, and an approval sent lands nothing (AC-286)', async ({
        page,
      }) => {
        await page.goto(`/reviews/${made.boardProposal}`);
        await expect(page.getByTestId('review-error')).toHaveText('There is no such proposal.');
        await expect(page.getByRole('button', { name: /^Approve/ })).toHaveCount(0);
        for (const decision of ['approve', 'reject'] as const) {
          const sent = await page.request.post(`/api/proposals/${made.boardProposal}/${decision}`, {
            data: {},
          });
          expect([decision, sent.status(), await sent.json()]).toEqual([
            decision,
            404,
            { error: 'There is no such proposal.' },
          ]);
        }
        // The folder's dashboard is as it was: version 2, by its versions kept.
        expect(versionsOf(made.board)).toEqual([`1:${BOARD}`, `2:${BOARD}`]);
      });
    });
  }

  test.describe('as super, who decides', () => {
    test.use({ role: 'super' });

    test('opens it from Reviews, sees the dashboard proposed and current, and approves it', async ({
      page,
    }) => {
      await page.goto(`/reviews?selected=${made.boardProposal}`);
      await page
        .getByRole('region', { name: BOARD })
        .getByRole('link', { name: 'Open review' })
        .click();
      await expect(page).toHaveURL(new RegExp(`/reviews/${made.boardProposal}$`));
      await expect(
        page.getByRole('heading', { level: 1, name: `Review · ${BOARD} → ${FOLDER}` }),
      ).toBeVisible();
      await expect(
        page.getByRole('list', { name: 'In this proposal' }).getByRole('listitem'),
      ).toHaveText([
        // Version 2: made, then given its tiles by an approval (T502). Each
        // led by its kind's icon chip (design 05; T544).
        `▦${BOARD}Dashboard · replaces version 2`,
        `◢${ORDERS}Chart · replaces version 2`,
      ]);

      // Drawn as design 05's main screen (T544, AC-390): a 52 px head bar,
      // 240 / fluid / 360 panels, uppercase section labels, the chosen item
      // tinted as the bundle's note bar is, the author's initials, and
      // Reject at the footer's start with Approve at its end.
      const box = async (selector: string) => (await page.locator(selector).boundingBox())!;
      expect(Math.round((await box('.review-view__head')).height)).toBe(52);
      expect(Math.round((await box('.review-view__side--items')).width)).toBe(240);
      const about = await box('.review-view__side--about');
      expect(Math.round(about.width)).toBe(360);
      const style = (selector: string, property: string) =>
        page
          .locator(selector)
          .first()
          .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
      expect(await style('.review-view__items h2', 'text-transform')).toBe('uppercase');
      expect(await style('.review-view__sect h2', 'text-transform')).toBe('uppercase');
      expect(await style(".review-view__item[aria-current='true']", 'background-color')).toBe(
        await style('[data-testid="review-bundle"]', 'background-color'),
      );
      await expect(page.locator('.review-view__avatar')).toHaveText('WW');
      const decide = page.getByRole('group', { name: 'Decide' });
      const reject = (await decide.getByRole('button', { name: 'Reject…' }).boundingBox())!;
      const approve = (await decide.getByRole('button', { name: 'Approve' }).boundingBox())!;
      expect(approve.x).toBeGreaterThan(reject.x + reject.width);
      // At the footer's end: its 16 px padding in from the panel's edge.
      expect(Math.round(approve.x + approve.width)).toBe(Math.round(about.x + about.width - 16));

      // Each side panel folds to its rail, and the item drawn takes the room
      // (T544, AC-390).
      const drawn = page.locator('.review-view__item-pane');
      await expect(drawn.getByRole('heading', { name: BOARD, exact: true })).toBeVisible();
      // Drawn without its folder's breadcrumb: the head says where it goes.
      await expect(drawn.getByRole('navigation', { name: 'Breadcrumb' })).toHaveCount(0);
      const open = (await drawn.boundingBox())!.width;
      const itemsToggle = page.getByRole('button', { name: 'Proposal items' });
      const aboutToggle = page.getByRole('button', { name: 'About this proposal' });
      await itemsToggle.click();
      await aboutToggle.click();
      await expect(itemsToggle).toHaveAttribute('aria-expanded', 'false');
      await expect(aboutToggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('list', { name: 'In this proposal' })).toHaveCount(0);
      await expect(page.getByRole('complementary', { name: 'About this proposal' })).toHaveCount(0);
      // 200 px from the first rail and 320 px from the second.
      await expect
        .poll(async () => Math.round((await drawn.boundingBox())!.width - open))
        .toBe(520);
      await itemsToggle.click();
      await aboutToggle.click();
      await expect(page.getByRole('list', { name: 'In this proposal' })).toBeVisible();
      await expect
        .poll(async () => Math.round((await drawn.boundingBox())!.width))
        .toBe(Math.round(open));

      // The item itself, read-only: proposed with its new tab and tile, its
      // chart drawn from the proposal, since the workspace isn't the
      // reviewer's to read; then the folder's current one without them.
      const pane = page.locator('.review-view__item-pane');
      await expect(pane.getByRole('heading', { name: BOARD, exact: true })).toBeVisible();
      await expect(pane.getByRole('tab', { name: `Notes ${RUN}` })).toBeVisible();
      await expect(pane.getByRole('button', { name: 'Edit' })).toHaveCount(0);
      const tile = (id: string) => pane.locator(`[data-tile="${id}"]`);
      // One measure is drawn as a KPI: its label and a count, from Cube, in a
      // tile named for the proposal's chart (a KPI's title is kept for screen readers).
      await expect(tile('t-chart')).toContainText(/Count\s*\d+/);
      await expect(tile('t-chart').getByRole('heading', { name: ORDERS })).toHaveCount(1);
      await expect(pane).not.toContainText('This chart is no longer available.');
      // What it changes and adds is marked; what it keeps isn't (AC-341).
      await expect(tile('t-chart')).toHaveAttribute('data-review', 'changed');
      await expect(tile('t-chart').locator('.grid-tile__review-mark')).toHaveText('Changed');
      await expect(tile('t-new')).toHaveAttribute('data-review', 'new');
      await expect(tile('t-new').locator('.grid-tile__review-mark')).toHaveText('New');
      await expect(tile('t-text')).not.toHaveAttribute('data-review');
      await pane.getByRole('button', { name: 'Current (version 2)' }).click();
      await expect(pane.getByRole('heading', { name: BOARD, exact: true })).toBeVisible();
      await expect(pane.getByRole('tab', { name: `Notes ${RUN}` })).toHaveCount(0);
      await expect(tile('t-new')).toHaveCount(0);
      await expect(pane.locator('[data-review]')).toHaveCount(0);

      const inspector = page.getByRole('complementary', { name: 'About this proposal' });
      await expect(inspector.getByTestId('review-description')).toHaveText(
        `Adds a notes tab (${RUN}).`,
      );
      await expect(inspector.getByTestId('review-replaces')).toHaveText('Replaces version 2');

      // Approve asks first (state I).
      await inspector.getByRole('button', { name: 'Approve', exact: true }).click();
      const confirm = page.getByRole('dialog', { name: `Publish to ${FOLDER}?` });
      await expect(confirm).toContainText('Readers see it at once. Version 2 stays in History.');
      await confirm.getByRole('button', { name: 'Approve and publish' }).click();
      await expect(page.getByTestId('review-said')).toHaveText(
        `Approved. ${FOLDER} now shows version 3.`,
      );
      await expect(inspector.getByTestId('review-decision')).toHaveText(
        // Just now, as every moment is written (T477, Q8): "Today 14:05".
        /^Approved by Super Admin · (Today|Yesterday) \d\d:\d\d$/,
      );
      await expect(inspector.getByRole('button', { name: /^Approve/ })).toHaveCount(0);

      // In the folder at once, with the replaced version kept (AC-288).
      const shared = (await (
        await page.request.get(`/api/documents/dashboard/${made.board}`)
      ).json()) as { body: { pages?: { title?: string }[] }; version: number };
      expect(shared.version).toBe(3);
      expect((shared.body.pages ?? []).map((each) => each.title)).toEqual([
        'Page 1',
        `Notes ${RUN}`,
      ]);
      // Version 1 kept too: given its tiles by an approval (T502), which keeps
      // the version it replaces.
      expect(versionsOf(made.board)).toEqual([`1:${BOARD}`, `2:${BOARD}`, `3:${BOARD}`]);
      // Its chart too, what it says with it.
      const library = (await (
        await page.request.get(`/api/documents/chart/${made.library}`)
      ).json()) as { body: { description?: string }; version: number };
      expect([library.version, library.body.description]).toEqual([
        3,
        `Counts every order (${RUN}).`,
      ]);
      expect(versionsOf(made.library)).toEqual([`1:${ORDERS}`, `2:${ORDERS}`, `3:${ORDERS}`]);
    });

    test('rejects the chart with a reason; the folder is as it was', async ({ page }) => {
      await page.goto(`/reviews/${made.chartProposal}`);
      // The chart itself, drawn from the proposal (the workspace isn't the reviewer's).
      const pane = page.locator('.review-view__item-pane');
      await expect(pane).toContainText(/Count\s*\d+/);
      await expect(pane).not.toContainText('This chart is no longer available.');
      const inspector = page.getByRole('complementary', { name: 'About this proposal' });
      await expect(inspector.getByTestId('review-replaces')).toHaveText('New in this folder');
      await inspector.getByRole('button', { name: 'Reject…' }).click();
      const reason = inspector.getByLabel(/Reason/);
      await expect(reason).toBeFocused();
      await reason.fill(REASON);
      // T405's follow-up (AC-176, rule 85): Esc from the step's Cancel asks
      // first over a typed reason; Esc over the question keeps it.
      await inspector.getByRole('button', { name: 'Cancel' }).focus();
      await page.keyboard.press('Escape');
      const question = page.getByRole('alertdialog', { name: 'Discard your changes?' });
      await expect(question.getByRole('button', { name: 'Keep editing' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(question).toHaveCount(0);
      await expect(reason).toBeFocused();
      await expect(reason).toHaveValue(REASON);
      await expect(inspector.getByTestId('reason-counter')).toHaveText(
        `${String([...REASON].length)} / 1,000`,
      );
      await inspector.getByRole('button', { name: 'Reject', exact: true }).click();
      await expect(page.getByTestId('review-said')).toHaveText(
        'Rejected. Wren Writer’s workspace keeps the work.',
      );
      await expect(inspector.getByRole('blockquote')).toHaveText(REASON);
      made.chartProposal = '';
      const contents = (await (
        await page.request.get(`/api/folders/${made.folder}/contents`)
      ).json()) as { title: string }[];
      expect(contents.map((item) => item.title)).not.toContain(CHART);
    });
  });

  test.describe('as writer, again', () => {
    test.use({ role: 'writer' });

    test('sees their own as theirs to approve, and withdraws it', async ({ page }) => {
      await page.goto(`/reviews/${made.ownProposal}`);
      const inspector = page.getByRole('complementary', { name: 'About this proposal' });
      await expect(inspector).toContainText(
        'You proposed this. Approving your own proposal is allowed and is recorded in the audit trail.',
      );
      await expect(
        inspector.getByRole('button', { name: 'Approve my own proposal' }),
      ).toBeVisible();
      await inspector.getByRole('button', { name: 'Withdraw…' }).click();
      await inspector.getByRole('button', { name: 'Withdraw', exact: true }).click();
      await expect(page.getByTestId('review-said')).toHaveText(
        'Withdrawn. Your workspace keeps the work.',
      );
      made.ownProposal = '';
    });
  });
});
