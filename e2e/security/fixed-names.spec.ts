import { readFileSync } from 'node:fs';

import { sealSecretV1, type XcubeKey } from '@wechart/core';

import { approvedBy, landed, modelFilesIn, proposedModel } from '../model-files';
import { BASE_URL, expect, signInThroughDex, test, testedSource } from './fixtures';

/**
 * T722 (AC-423, AC-291; R71 3, 5; R73), against compose's xcube on the R71
 * image: a landed data source's or cube's name is fixed. `super` makes
 * /Fixed, which `writer` (`sales-rw`) writes, and lands in it a data source
 * and a cube with a title. `writer` is offered no way to change either name:
 * the data source's page shows its name read-only and says why, Explore's
 * rows offer no Rename, and an edit copy of the cube shows its name read-only.
 * The cube's title, changed in that copy, lands through a proposal, its name
 * as it was.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Fixed ${RUN}`;
const SOURCE = `fixed_${RUN}`;
const CUBE = `t722_${RUN}`;
const PATH = `cubes/${CUBE}.yml`;
const cubeTitled = (title: string) =>
  `cubes:\n  - name: ${CUBE}\n    title: ${title}\n    sql: SELECT 1 AS n\n    measures:\n      - name: n\n        sql: n\n        type: sum\n`;
const KEY = JSON.parse(
  readFileSync(new URL('../../infra/xcube/dev-credential-key.pub.jwk', import.meta.url), 'utf8'),
) as XcubeKey;
const FIELDS = { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false };
const made = {
  folder: '',
  source: '',
  copyFolder: '',
  sourceCopy: '',
  /** An earlier copy's project folder, where a later "Edit in my workspace" made another. */
  earlierCopies: [] as string[],
};

test.describe.configure({ mode: 'serial' });

test.describe('a landed name is fixed (T722, AC-423)', () => {
  test.afterAll(async ({ browser }) => {
    test.setTimeout(180_000);
    // The writer's copies and their project folders, if left.
    if (made.copyFolder !== '' || made.sourceCopy !== '') {
      const own = await browser.newContext({
        baseURL: BASE_URL,
        storageState: { cookies: [], origins: [] },
      });
      await signInThroughDex(await own.newPage(), 'writer');
      if (made.sourceCopy !== '') {
        const copy = await own.request.get(`/api/data-sources/${made.sourceCopy}`);
        const { folderId } = (await copy.json().catch(() => ({}))) as { folderId?: string };
        await own.request.delete(`/api/data-sources/${made.sourceCopy}`, { timeout: 90_000 });
        if (folderId !== undefined && folderId !== 'mine')
          await own.request.delete(`/api/documents/folder/${folderId}`);
      }
      for (const copyFolder of [made.copyFolder, ...made.earlierCopies].filter(
        (each) => each !== '',
      )) {
        await own.request.delete(
          `/api/model/files?folder=${encodeURIComponent(copyFolder)}&path=${encodeURIComponent(PATH)}`,
          { timeout: 90_000 },
        );
        if (copyFolder !== 'mine') await own.request.delete(`/api/documents/folder/${copyFolder}`);
      }
      await own.close();
    }
    const context = await browser.newContext({
      baseURL: BASE_URL,
      storageState: { cookies: [], origins: [] },
    });
    await signInThroughDex(await context.newPage(), 'super');
    const { request } = context;
    if (made.folder !== '') {
      await request.delete(
        `/api/model/files?folder=${made.folder}&path=${encodeURIComponent(PATH)}`,
        { timeout: 90_000 },
      );
      if (made.source !== '')
        await request.delete(`/api/data-sources/${made.source}`, { timeout: 90_000 });
      await request.delete(`/api/documents/folder/${made.folder}`);
    }
    await context.close();
  });

  test.describe('as super', () => {
    test.use({ role: 'super' });

    test('makes /Fixed and lands a data source and a titled cube in it', async ({ page }) => {
      const { request } = page;
      const folder = await request.post('/api/documents', {
        data: { kind: 'folder', title: FOLDER, folderId: 'root' },
      });
      made.folder = ((await folder.json()) as { id: string }).id;
      const access = await request.put(`/api/folders/${made.folder}/access`, {
        data: { readOnly: [], readWrite: ['sales-rw'] },
      });
      expect(access.status(), await access.text()).toBe(200);
      const source = await request.post('/api/data-sources', {
        data: await testedSource(request, {
          folderId: made.folder,
          name: SOURCE,
          driver: 'postgres',
          authMethod: 'password',
          fields: FIELDS,
          sealed: {
            password: await sealSecretV1(KEY, 'postgres', 'password', FIELDS, 'sample'),
          },
        }),
        timeout: 90_000,
      });
      expect(source.status(), await source.text()).toBe(201);
      made.source = ((await source.json()) as { id: string }).id;
      const file = { path: PATH, content: cubeTitled('Fixed one') };
      expect(await landed(request, made.folder, [file])).toEqual([file]);
    });
  });

  test.describe('as writer', () => {
    test.use({ role: 'writer' });

    test('is offered no way to change the data source’s name, nor a Rename in Explore', async ({
      page,
    }) => {
      // In its folder it is read, not edited: its name is text, with no field.
      await page.goto(`/explore/data-sources/${encodeURIComponent(made.source)}`);
      const main = page.getByRole('main');
      await main.getByRole('tab', { name: 'General' }).click();
      await expect(main.getByRole('tabpanel')).toContainText(`Name${SOURCE}`);
      await expect(main.getByRole('textbox', { name: /^Name/ })).toHaveCount(0);
      // Its copy, where it is changed, keeps its name.
      await main.getByRole('button', { name: 'Edit in my workspace' }).click();
      await expect(page).not.toHaveURL(new RegExp(made.source));
      await expect(page).toHaveURL(/\/explore\/data-sources\/ds-[0-9a-f-]{36}$/);
      made.sourceCopy = /\/explore\/data-sources\/(ds-[0-9a-f-]{36})$/.exec(page.url())![1]!;
      await main.getByRole('tab', { name: 'General' }).click();
      const name = main.getByRole('textbox', { name: /^Name/ });
      await expect(name).toHaveValue(SOURCE);
      await expect(name).toHaveAttribute('readonly', '');
      await expect(page.locator('#source-name-note')).toHaveText(
        'A copy keeps its original’s name, which it stands in for in your workspace.',
      );

      await page.goto(`/explore?folder=${made.folder}`);
      for (const row of [SOURCE, `${CUBE}.yml`]) {
        await page.getByRole('button', { name: `Actions for ${row}` }).click();
        const menu = page.getByRole('menu', { name: `Actions for ${row}` });
        await expect(menu).toBeVisible();
        await expect(menu.getByRole('menuitem', { name: 'Rename' })).toHaveCount(0);
        await page.keyboard.press('Escape');
      }
    });

    test('changes the cube’s title in an edit copy, its name read-only, and lands it through a proposal', async ({
      page,
    }) => {
      await page.goto(`/explore/folders/${made.folder}/models/${encodeURIComponent(PATH)}`);
      await page.getByRole('button', { name: 'Edit in my workspace' }).click();
      await expect(page).toHaveURL(
        new RegExp(`/explore/folders/(?!${made.folder})[^/]+/models/cubes%2F${CUBE}\\.yml$`),
      );
      made.copyFolder = decodeURIComponent(new URL(page.url()).pathname.split('/')[3] ?? '');

      const form = page.getByRole('region', { name: `Cube ${CUBE}` });
      const name = form.getByLabel('Name', { exact: true });
      await expect(name).toHaveValue(CUBE);
      await expect(name).toHaveAttribute('readonly', '');
      await expect(
        form.getByText(`“${CUBE}” has landed, so its name is fixed. Its title can still change.`),
      ).toBeVisible();
      const title = form.getByLabel('Title', { exact: true });
      await title.fill('Fixed two');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled({
        timeout: 90_000,
      });

      const proposed = await proposedModel(page.request, made.copyFolder, PATH);
      expect(proposed.status(), await proposed.text()).toBe(201);
      const approved = await approvedBy(
        page.request,
        ((await proposed.json()) as { id: string }).id,
      );
      expect(approved.status(), await approved.text()).toBe(200);
      const [now] = (await modelFilesIn(page.request, made.folder)).filter(
        (file) => file.path === PATH,
      );
      expect(now?.content).toContain(`name: ${CUBE}\n`);
      expect(now?.content).toContain('title: Fixed two');
    });

    /**
     * T737's follow-up (AC-423): the YAML is no way round the form. The
     * cube's name changed there is a problem at the name, in the form's
     * words, and Save stays held. Discarded, nothing is saved.
     */
    test('is held from saving a changed name typed in an edit copy’s YAML', async ({ page }) => {
      await page.goto(`/explore/folders/${made.folder}/models/${encodeURIComponent(PATH)}`);
      await page.getByRole('button', { name: 'Edit in my workspace' }).click();
      await expect(page).toHaveURL(
        new RegExp(`/explore/folders/(?!${made.folder})[^/]+/models/cubes%2F${CUBE}\\.yml$`),
      );
      const copyFolder = decodeURIComponent(new URL(page.url()).pathname.split('/')[3] ?? '');
      if (made.copyFolder !== '' && made.copyFolder !== copyFolder)
        made.earlierCopies.push(made.copyFolder);
      made.copyFolder = copyFolder;
      const before = (await modelFilesIn(page.request, copyFolder)).find(
        (file) => file.path === PATH,
      )?.content;
      expect(before).toContain(`name: ${CUBE}\n`);

      await page.locator('.cm-line', { hasText: new RegExp(`- name: ${CUBE}$`) }).click();
      await page.keyboard.press('End');
      await page.keyboard.type('_renamed');

      const problem = page
        .getByRole('region', { name: 'Problems' })
        .getByRole('listitem')
        .filter({ hasText: 'has landed, so its name is fixed' });
      await expect(problem).toContainText(
        `“${CUBE}” has landed, so its name is fixed. Its title can still change.`,
      );
      await expect(problem.locator('.model-problems__where')).toHaveText(`${PATH}:2`);
      const save = page.getByRole('button', { name: 'Save', exact: true });
      await expect(save).toBeDisabled();

      // The name put back: nothing held, and nothing changed to save.
      for (let typed = '_renamed'.length; typed > 0; typed--)
        await page.keyboard.press('Backspace');
      await expect(problem).toHaveCount(0);
      await expect(page.getByText('Saved · no changes')).toBeVisible();
      expect(
        (await modelFilesIn(page.request, copyFolder)).find((file) => file.path === PATH)?.content,
      ).toBe(before);
    });
  });
});
