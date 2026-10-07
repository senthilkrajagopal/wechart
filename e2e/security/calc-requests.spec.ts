import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T383 / AC-050: WHEN the user requests a calculation the menu cannot
 * express, THE SYSTEM SHALL record a request carrying the chart, the fields
 * in use and the user's description, and show it to the read-write members
 * of the folder whose model defines the chart's cube.
 * Fails when: the request is stored without the chart reference, or is not
 * shown to that folder's read-write members.
 *
 * `super` makes /Calc (read-write `sales-rw`) with a cube in its model, and
 * /Calc/West beneath it, which `managers` write. `manager` builds a chart in
 * My workspace, going to /Calc/West, on /Calc's cube, and asks for a
 * calculation from its menu. `writer` sees it under Reviews › Calculation
 * requests, with the chart's fields and the description; `manager`, who
 * writes only /Calc/West, doesn't.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const CUBE = `t383_${RUN}`;
const PATH = `cubes/${CUBE}.yml`;
const MODEL = `cubes:\n  - name: ${CUBE}\n    sql: SELECT 1 AS n, 'a' AS kind\n    dimensions:\n      - name: kind\n        sql: kind\n        type: string\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`;
const DESCRIPTION = `Margin per order, amount less cost (${RUN})`;
const made = { folder: '', west: '', xcubeId: '', chart: '' };
const full = () => `${made.xcubeId}__${CUBE}`;

test.describe.configure({ mode: 'serial' });

test.describe('a calculation request (T383, AC-050)', () => {
  test.afterAll(async ({ browser }) => {
    test.setTimeout(180_000);
    for (const who of ['manager', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      const { request } = context;
      if (who === 'manager' && made.chart !== '')
        await request.delete(`/api/documents/chart/${made.chart}`);
      if (who === 'super') {
        if (made.west !== '') await request.delete(`/api/documents/folder/${made.west}`);
        if (made.folder !== '') {
          await request.delete(
            `/api/model/files?folder=${made.folder}&path=${encodeURIComponent(PATH)}`,
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

    test('makes /Calc with its cube, and /Calc/West beneath it', async ({ page }) => {
      const { request } = page;
      const folder = await request.post('/api/documents', {
        data: { kind: 'folder', title: `Calc ${RUN}`, folderId: 'root' },
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
      const file = { path: PATH, content: MODEL };
      expect(await landed(request, made.folder, [file])).toEqual([file]);
    });
  });

  test.describe('as manager, who builds the chart', () => {
    test.use({ role: 'manager' });

    test('asks for a calculation from the menu on a measure', async ({ page }) => {
      const { request } = page;
      const created = await request.post('/api/documents', {
        data: {
          kind: 'chart',
          title: `Margins ${RUN}`,
          folderId: 'mine',
          targetFolderId: made.west,
        },
      });
      expect(created.status(), await created.text()).toBe(201);
      made.chart = ((await created.json()) as { id: string }).id;
      const stored = (await (await request.get(`/api/documents/chart/${made.chart}`)).json()) as {
        body: Record<string, unknown>;
        version: number;
      };
      const saved = await request.put(`/api/documents/chart/${made.chart}`, {
        data: {
          version: stored.version,
          body: {
            ...stored.body,
            chart: {
              source: { cube: full() },
              wells: {
                measures: [`${full()}.n`],
                dimensions: [`${full()}.kind`],
                timeDimensions: [],
              },
            },
          },
        },
      });
      expect(saved.status(), await saved.text()).toBe(200);

      await page.goto(`/explore/charts/${made.chart}/edit`);
      const pill = page.getByTestId(`in-measures-${full()}.n`);
      await expect(pill).toBeVisible();
      await pill.getByRole('button', { name: /^Calculations on / }).click();
      await page.getByRole('menuitem', { name: 'Request a calculation…' }).click();

      const dialog = page.getByRole('dialog', { name: 'Request a calculation' });
      await expect(dialog.getByTestId('request-fields')).toContainText('Metrics:');
      await expect(dialog.getByTestId('request-fields')).toContainText('Dimensions:');
      /**
       * T639 (AC-176, rule 85): Escape over a typed description asks first,
       * and Escape over the question keeps editing, the text kept.
       */
      const describing = dialog.getByRole('textbox', { name: 'What should it calculate?' });
      await describing.fill('A first try');
      await page.keyboard.press('Escape');
      const asking = page.getByRole('alertdialog', { name: 'Discard your changes?' });
      await expect(asking.getByRole('button', { name: 'Keep editing' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(asking).toBeHidden();
      await expect(describing).toHaveValue('A first try');
      await expect(describing).toBeFocused();
      const sent = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/calc-requests') && response.request().method() === 'POST',
      );
      await dialog.getByRole('textbox', { name: 'What should it calculate?' }).fill(DESCRIPTION);
      await dialog.getByRole('button', { name: 'Send request' }).click();
      const response = await sent;
      expect(response.status(), await response.text()).toBe(201);
      // The chart, the fields in use and the description, as recorded.
      expect(response.request().postDataJSON()).toEqual({
        chartId: made.chart,
        cube: full(),
        fields: {
          measures: [`${full()}.n`],
          dimensions: [`${full()}.kind`],
          timeDimensions: [],
          filters: [],
        },
        description: DESCRIPTION,
      });
      await expect(dialog.getByRole('status')).toHaveText(
        'Sent. It’s listed for them under Reviews › Calculation requests.',
      );
      // Sent, nothing is lost: Close closes at once, focus back where it was asked from (T639).
      await dialog.getByRole('button', { name: 'Close' }).click();
      await expect(dialog).toBeHidden();
      await expect(pill.getByRole('button', { name: /^Calculations on / })).toBeFocused();
    });

    test('doesn’t see it among the requests asked of folders he may change', async ({ page }) => {
      await page.goto('/reviews?tab=requests');
      await expect(
        page.getByRole('tab', { name: 'Calculation requests', selected: true }),
      ).toBeVisible();
      // Read first: the list, or the line saying there is none.
      await expect(
        page
          .getByRole('table', { name: 'Calculation requests' })
          .or(page.getByTestId('requests-none')),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: CUBE })).toHaveCount(0);
    });
  });

  test.describe('as writer, who writes /Calc', () => {
    test.use({ role: 'writer' });

    test('sees it under Reviews › Calculation requests, with the fields and the description', async ({
      page,
    }) => {
      await page.goto('/reviews');
      await page.getByRole('tab', { name: 'Calculation requests' }).click();
      const table = page.getByRole('table', { name: 'Calculation requests' });
      const row = table.getByRole('row').filter({ hasText: CUBE });
      await expect(row).toContainText(`Calc ${RUN}`);
      await expect(row).toContainText('Open');
      await row.getByRole('button', { name: CUBE }).click();

      const summary = page.getByRole('region', { name: `Calculation on ${CUBE}` });
      await expect(summary.getByTestId('request-description')).toHaveText(DESCRIPTION);
      // Beside the list, as design 05's inspector is: to its right, not under it.
      const listBox = await table.boundingBox();
      const summaryBox = await summary.boundingBox();
      expect(summaryBox!.x).toBeGreaterThanOrEqual(listBox!.x + listBox!.width - 1);
      await expect(summary.getByTestId('request-fields')).toHaveText(
        `Metrics: ${CUBE}.n · Dimensions: ${CUBE}.kind`,
      );
      // A chart in its asker's workspace is theirs alone (AC-276).
      await expect(summary.getByTestId('request-chart')).toHaveText('From a chart you can’t open.');
    });

    /**
     * R60 (amending AC-287 and rule 76): the top bar's Reviews count is the
     * rows in To review plus the open calculation requests listed to the user.
     */
    test('counts it in the top bar’s Reviews control, with the proposals to review', async ({
      page,
    }) => {
      await page.goto('/explore');
      const control = page.getByRole('link', { name: /^Reviews/ });
      await expect(control).toBeVisible();
      // Other suites' proposals and requests come and go meanwhile: read both
      // lists and the control together until they agree.
      await expect(async () => {
        const reviews = (await (await page.request.get('/api/reviews')).json()) as {
          toReview: unknown[];
        };
        const requests = (await (await page.request.get('/api/calc-requests')).json()) as {
          requests: { cube: string; status: string }[];
        };
        const open = requests.requests.filter((each) => each.status === 'open');
        expect(open.some((each) => each.cube === full())).toBe(true);
        const waiting = reviews.toReview.length + open.length;
        await page.reload();
        await expect(
          page.getByRole('link', { name: `Reviews, ${String(waiting)} waiting` }),
        ).toBeVisible({
          timeout: 5_000,
        });
        await expect(page.getByTestId('reviews-count')).toHaveText(String(waiting));
      }).toPass({ timeout: 60_000 });
    });
  });
});
