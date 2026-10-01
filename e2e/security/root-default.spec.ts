import { seedDefault } from '../../packages/api/src/seed-default';
import { CUBE, serviceToken } from '../api-process';
import { expect, projectFolderOf, removeProjectFolder, test } from './fixtures';
import { ROOT_DEFAULT_ENV } from './root-default';

/**
 * T443 (AC-310): the shared root's `default` data source, seeded at install
 * by a Job that seals the database password itself and sends wechart only the
 * envelope (`seed-default.ts`, run here as the Job runs it, against this
 * suite's API with its token). It lands in xcube as the connection `default`
 * and answers xcube's connection test; the seeded root cubes, which name no
 * data source, are bound to it. A second seeding changes nothing.
 *
 * Its settings are compose's sample database, as the Helm chart's are the
 * deployment's (its development login).
 */
const env = ROOT_DEFAULT_ENV;
type Listed = {
  id: string;
  name: string;
  folderId: string;
  driver: string;
  usedBy: { name: string }[] | null;
};

test.describe('the root’s default data source, seeded at install (T443, AC-310)', () => {
  test.use({ role: 'super' });
  // Opened after it is seeded.
  test.describe.configure({ mode: 'serial' });

  test('is made from the Job’s envelope, lands in xcube, connects, and binds the root’s cubes', async ({
    page,
  }) => {
    const said: string[] = [];
    // Seeded now, or by an earlier run: the root keeps it while its cubes use it.
    expect(await seedDefault(env, { log: (line) => said.push(line) }), said.join('\n')).toBe(0);
    // Again: nothing to do.
    expect(await seedDefault(env, { log: (line) => said.push(line) })).toBe(0);
    expect(said.at(-1)).toBe('seed-default: the shared root already has its default data source');

    const request = page.request;
    const listed = (await (await request.get('/api/data-sources')).json()) as Listed[];
    const seeded = listed.filter((row) => row.folderId === 'root' && row.name === 'default');
    expect(seeded).toHaveLength(1);
    const [root] = seeded;
    expect(root?.driver).toBe('postgres');

    // Its settings, with its password said as stored and never given back.
    const opened = await request.get(`/api/data-sources/${root!.id}`);
    expect(opened.status()).toBe(200);
    expect(await opened.json()).toMatchObject({
      fields: { host: 'sample-db', port: 5432, database: 'sample', user: 'sample', ssl: false },
      secrets: { password: { stored: true } },
    });
    // The password is no setting given back: only said to be stored.
    expect(((await opened.json()) as { fields: object }).fields).not.toHaveProperty('password');

    // xcube opens its envelope and connects with Cube's driver.
    const tested = await request.post(`/api/data-sources/${root!.id}/test`, {
      data: {},
      timeout: 90_000,
    });
    expect(tested.status(), await tested.text()).toBe(200);
    expect(((await tested.json()) as { ok: boolean }).ok).toBe(true);

    // xcube holds it as the connection `default`, in this suite's model: the
    // root cubes' default, where Cube's own environment served before (T443's review).
    const held = await request.get(`${CUBE}/v1/semantic/models/e2e-security/connections`, {
      headers: { authorization: `Bearer ${serviceToken()}` },
    });
    expect(held.status()).toBe(200);
    const connections = ((await held.json()) as { connections: { name: string; driver: string }[] })
      .connections;
    expect(connections).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'default', driver: 'postgres' })]),
    );

    // The seeded root cubes name no data source: bound to it (AC-310).
    const cubes = root!.usedBy?.map((cube) => cube.name) ?? [];
    expect(cubes).toEqual(expect.arrayContaining(['orders']));
  });

  /**
   * T497 (AC-310, AC-164; design 03 state D): "stored and managed like any
   * other" — its page opens it, and it changes as any shared one does, in a
   * copy: its password kept from Shared and never drawn, replaced, tested,
   * saved, and nothing typed left behind once saved.
   */
  test('opens on its page, and changes like any other in a copy of it', async ({ page }) => {
    const listed = (await (await page.request.get('/api/data-sources')).json()) as Listed[];
    const root = listed.find((row) => row.folderId === 'root' && row.name === 'default');
    expect(root).toBeDefined();
    await page.goto(`/explore/data-sources/${encodeURIComponent(root!.id)}`);
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('default');
    await main.getByRole('button', { name: 'Edit in my workspace' }).click();
    await expect(main.locator('.source-settings__status')).toHaveText('Draft');
    const copy = decodeURIComponent(page.url().split('/').pop() ?? '');
    // The project folder it went into (T523), taken away after it.
    const project = await projectFolderOf(page.request, 'data-source', copy);

    try {
      const tabs = main.getByRole('tablist', { name: 'Data source' });
      await tabs.getByRole('tab', { name: 'Connection' }).click();
      const panel = main.getByRole('tabpanel');
      await expect(panel.getByText('Kept from Shared · encrypted')).toBeVisible();
      await expect(panel.locator('input[type="password"]')).toHaveCount(0);

      // Replaced — compose's sample database's development login, as the seeding's.
      await panel.getByRole('button', { name: 'Replace the password' }).click();
      await expect(panel.getByLabel(/^Password/)).toBeFocused();
      await panel.getByLabel(/^Password/).fill(env.WECHART_DEFAULT_DB_PASSWORD);
      await expect(main.locator('.source-settings__count')).toHaveText(
        '1 unsaved change · Save needs a passing test of these settings.',
      );
      await main.getByRole('button', { name: 'Test connection' }).click();
      await expect(main.getByRole('region', { name: 'Test to save' })).toContainText(
        'Every check passed',
        { timeout: 90_000 },
      );
      await main.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(main.locator('.source-settings__foot')).toContainText('Saved 1 change.');
      await expect(main.locator('.source-settings__count')).toHaveText('No unsaved changes');
      await expect(main.locator('.source-settings__count')).toBeFocused();
      // Saved, the password is stored and not drawn again (T497's review).
      await expect(panel.locator('input[type="password"]')).toHaveCount(0);
      await expect(panel.getByText(/ · encrypted$/)).toBeVisible();
    } finally {
      await page.request.delete(`/api/data-sources/${encodeURIComponent(copy)}`);
      await removeProjectFolder(page.request, project);
    }
  });
});
