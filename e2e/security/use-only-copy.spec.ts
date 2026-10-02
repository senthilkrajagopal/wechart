import { landed } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test } from './fixtures';

/**
 * T543 (AC-283; the user's answer "Yes, use-only copy", R53), against
 * compose's xcube: `writer` (`sales-rw`) writes /Parent/Child and so reads
 * every kind of item in /Parent, which `managers` write. They copy /Parent's
 * model into My workspace to use, choosing /Parent/Child for it to go to as a
 * new model. Its previews use it, Explore says it is for use only, and it is
 * proposed to /Parent/Child, never back to /Parent.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const PARENT = `Parent ${RUN}`;
const CHILD = `Child ${RUN}`;
const CUBE = `t543_${RUN}`;
const PATH = `cubes/${CUBE}.yml`;
const cubeOf = (n: number) =>
  `cubes:\n  - name: ${CUBE}\n    sql: SELECT ${String(n)} AS n\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`;
const made = { parent: '', child: '', project: '', proposal: '', board: '' };

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
        if (made.proposal !== '')
          await request.post(`/api/proposals/${made.proposal}/reject`, { data: {} });
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

    test('uses /Parent’s model in My workspace, going to /Parent/Child as a new model', async ({
      page,
    }) => {
      await page.goto(`/explore/folders/${made.parent}/models/${encodeURIComponent(PATH)}`);
      await expect(page.getByText(`Read-only · in ${PARENT}`)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit in my workspace' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Use in my workspace' }).click();
      const dialog = page.getByRole('dialog', { name: `Use ${CUBE}.yml in My workspace` });
      await expect(dialog.getByTestId('use-note')).toHaveText(
        `You may only read ${PARENT}, so this copy can’t be proposed back there. Choose a folder you may write: it goes there as a new model when you propose it.`,
      );
      // Never /Parent itself: only folders they write.
      const target = dialog.getByRole('combobox', { name: 'Target folder' });
      await expect(target.locator(`option[value="${made.parent}"]`)).toHaveCount(0);
      await target.selectOption(made.child);
      await dialog.getByRole('button', { name: 'Copy to My workspace' }).click();

      // The copy opens in its project folder in My workspace.
      await expect(page).not.toHaveURL(new RegExp(made.parent));
      await expect(page).toHaveURL(/\/explore\/folders\/[0-9a-f-]{36}\/models\/cubes%2F/);
      made.project = /\/explore\/folders\/([0-9a-f-]{36})\//.exec(page.url())![1]!;
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible();

      await page.goto(`/explore?folder=${made.project}`);
      await expect(
        page.getByText(`Goes to ${PARENT} / ${CHILD} · new, a copy for use only of version 1`),
      ).toBeVisible();
    });

    test('previews with it, and proposes it to /Parent/Child alone, as new', async ({ page }) => {
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
      const member = `f${made.child.replaceAll('-', '')}__${CUBE}.n`;
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
      expect(proposed.status(), await proposed.text()).toBe(201);
      const proposal = (await proposed.json()) as {
        id: string;
        targetFolderId: string;
        items: { landsIn: string; replaces: unknown }[];
      };
      made.proposal = proposal.id;
      expect(proposal.targetFolderId).toBe(made.child);
      expect(proposal.items.map(({ landsIn, replaces }) => ({ landsIn, replaces }))).toEqual([
        { landsIn: made.child, replaces: null },
      ]);
    });
  });
});
