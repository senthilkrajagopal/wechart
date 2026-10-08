import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T543 (AC-283; the user's answer "Yes, use-only copy", R53), as T717 has it
 * (R73), against compose's xcube on the R71 image: `writer` (`sales-rw`)
 * writes /Parent/Child and so reads every kind of item in /Parent, which
 * `managers` write. They copy /Parent's model into My workspace to use,
 * asked for no folder. Its previews use it, Explore says it is for use only
 * and proposed to no folder, and offers no Propose…; the API refuses its
 * proposal. Its page offers "Request a change", a calculation request for
 * its cube with no chart; and a chart on it still offers "Request a
 * calculation…" (AC-050).
 */
const RUN = Math.random().toString(36).slice(2, 8);
const PARENT = `Parent ${RUN}`;
const CHILD = `Child ${RUN}`;
const CUBE = `t543_${RUN}`;
const PATH = `cubes/${CUBE}.yml`;
const cubeOf = (n: number) =>
  `cubes:\n  - name: ${CUBE}\n    sql: SELECT ${String(n)} AS n\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`;
const made = { parent: '', child: '', project: '', board: '', chart: '' };

test.describe.configure({ mode: 'serial' });

test.describe('a model of a folder one may only read, used in My workspace (T543, AC-283)', () => {
  test.afterAll(async ({ browser }) => {
    test.setTimeout(180_000);
    for (const who of ['writer', 'super'] as const) {
      const context = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await context.newPage(), who);
      const { request } = context;
      if (who === 'writer') {
        if (made.chart !== '') await request.delete(`/api/documents/chart/${made.chart}`);
        if (made.board !== '') await request.delete(`/api/documents/dashboard/${made.board}`);
        if (made.project !== '') {
          await request.delete(
            `/api/model/files?folder=${encodeURIComponent(made.project)}&path=${encodeURIComponent(PATH)}`,
            { timeout: 90_000 },
          );
          await request.delete(`/api/documents/folder/${made.project}`);
        }
      }
      if (who === 'super') {
        if (made.child !== '') await request.delete(`/api/documents/folder/${made.child}`);
        if (made.parent !== '') {
          await request.delete(
            `/api/model/files?folder=${made.parent}&path=${encodeURIComponent(PATH)}`,
            { timeout: 90_000 },
          );
          await request.delete(`/api/documents/folder/${made.parent}`);
        }
      }
      await context.close();
    }
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes the folders and publishes the model in /Parent', async ({ page }) => {
      const { request } = page;
      const parent = await request.post('/api/documents', {
        data: { kind: 'folder', title: PARENT, folderId: 'root' },
      });
      made.parent = ((await parent.json()) as { id: string }).id;
      const child = await request.post('/api/documents', {
        data: { kind: 'folder', title: CHILD, folderId: made.parent },
      });
      made.child = ((await child.json()) as { id: string }).id;
      for (const [id, access] of [
        [made.parent, { readOnly: [], readWrite: ['managers'] }],
        [made.child, { readOnly: [], readWrite: ['sales-rw'] }],
      ] as const) {
        const answer = await request.put(`/api/folders/${id}/access`, { data: access });
        expect(answer.status(), await answer.text()).toBe(200);
      }
      // Through My workspace and a proposal `super` approves (T451, AC-278).
      const file = { path: PATH, content: cubeOf(3) };
      expect(await landed(request, made.parent, [file])).toEqual([file]);
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('uses /Parent’s model in My workspace, asked for no folder, proposed to none', async ({
      page,
    }) => {
      await page.goto(`/explore/folders/${made.parent}/models/${encodeURIComponent(PATH)}`);
      await expect(page.getByText(`Read-only · in ${PARENT}`)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit in my workspace' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Use in my workspace' }).click();
      const dialog = page.getByRole('dialog', { name: `Use ${CUBE}.yml in My workspace` });
      await expect(dialog.getByTestId('use-note')).toHaveText(
        `You may only read ${PARENT}, so this copy is for use in My workspace only: it can’t be proposed to any folder. To change the shared cube, send ${PARENT} a request from the copy’s page.`,
      );
      await expect(dialog.getByRole('combobox')).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Copy to My workspace' }).click();

      // The copy opens in its project folder in My workspace.
      await expect(page).not.toHaveURL(new RegExp(made.parent));
      await expect(page).toHaveURL(/\/explore\/folders\/[0-9a-f-]{36}\/models\/cubes%2F/);
      made.project = /\/explore\/folders\/([0-9a-f-]{36})\//.exec(page.url())![1]!;
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();

      // Explore says it goes nowhere, and offers no Propose… for it.
      await page.goto(`/explore?folder=${made.project}`);
      await expect(
        page.getByText('A copy for use only of version 1 · proposed to no folder'),
      ).toBeVisible();
      await page.getByRole('button', { name: `Actions for ${CUBE}.yml` }).click();
      const menu = page.getByRole('menu', { name: `Actions for ${CUBE}.yml` });
      await expect(menu.getByRole('menuitem', { name: 'Open' })).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'Propose…' })).toHaveCount(0);
    });

    test('previews with it, and its proposal is refused, saying why', async ({ page }) => {
      const { request } = page;
      // A changed copy, previewed in a workspace dashboard going to /Parent/Child.
      const saved = await request.post('/api/model/publish', {
        data: { folderId: made.project, files: [{ path: PATH, content: cubeOf(8) }] },
        timeout: 90_000,
      });
      expect(saved.status(), await saved.text()).toBe(200);
      const board = await request.post('/api/documents', {
        data: {
          kind: 'dashboard',
          title: `Board ${RUN}`,
          folderId: made.project,
          targetFolderId: made.child,
        },
      });
      made.board = ((await board.json()) as { id: string }).id;
      // Its one name, its original's (R71): the copy stands in for it.
      const member = `${CUBE}.n`;
      const answer = await request.post('/api/load', {
        data: { query: { measures: [member] }, for: { kind: 'dashboard', id: made.board } },
        timeout: 90_000,
      });
      expect(answer.status(), await answer.text()).toBe(200);
      const [row] = ((await answer.json()) as { data: Record<string, unknown>[] }).data;
      expect(Number(row?.[member])).toBe(8);

      const files = await request.get(`/api/folders/${made.project}/contents`);
      const [file] = ((await files.json()) as { kind: string; fileId?: string }[]).filter(
        (each) => each.kind === 'model',
      );
      const proposed = await request.post('/api/proposals', {
        data: { kind: 'model', id: file!.fileId },
      });
      expect(proposed.status(), await proposed.text()).toBe(409);
      expect(((await proposed.json()) as { error: string }).error).toBe(
        `“${PATH}” is a copy for use only, so it can’t be proposed to any folder. To change “${CUBE}”, send its folder a request from the copy’s page.`,
      );
    });

    test('asks /Parent for a change from the copy’s page, with no chart (R73)', async ({
      page,
    }) => {
      await page.goto(`/explore/folders/${made.project}/models/${encodeURIComponent(PATH)}`);
      await page.getByRole('button', { name: 'Request a change' }).click();
      const dialog = page.getByRole('dialog', { name: 'Request a change' });
      await expect(dialog.getByTestId('request-note')).toHaveText(
        `Describe the change you need to ${CUBE}. It goes to the people who may change the model that defines it.`,
      );
      await dialog
        .getByRole('textbox', { name: 'What should change?' })
        .fill(`A margin measure ${RUN}`);
      const sent = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/calc-requests') && response.request().method() === 'POST',
      );
      await dialog.getByRole('button', { name: 'Send request' }).click();
      expect((await sent).status()).toBe(201);
      await expect(dialog.getByRole('status')).toHaveText(
        'Sent. It’s listed for them under Reviews › Calculation requests.',
      );
    });

    test('still offers "Request a calculation…" from a chart on it (AC-050)', async ({ page }) => {
      const { request } = page;
      const created = await request.post('/api/documents', {
        data: {
          kind: 'chart',
          title: `On the copy ${RUN}`,
          folderId: made.project,
          targetFolderId: made.child,
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
              source: { cube: CUBE },
              wells: { measures: [`${CUBE}.n`], dimensions: [], timeDimensions: [] },
            },
          },
        },
      });
      expect(saved.status(), await saved.text()).toBe(200);

      await page.goto(`/explore/charts/${made.chart}/edit`);
      const pill = page.getByTestId(`in-measures-${CUBE}.n`);
      await expect(pill).toBeVisible();
      await pill.getByRole('button', { name: /^Calculations on / }).click();
      await expect(page.getByRole('menuitem', { name: 'Request a calculation…' })).toBeVisible();
    });
  });
});
