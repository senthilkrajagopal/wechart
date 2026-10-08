import { CUBE, serviceToken } from '../api-process';
import { expect, test } from './fixtures';
import { seedRootDefault } from './root-default';

/**
 * T702 (AC-328, AC-310): after R71's fresh start (`infra/xcube/fresh-start.sh`,
 * docs/deploy.md "The R71 fresh start"), the suite's model is served by xcube
 * `256d632371` under one name per item. Every item xcube lists for it is
 * published under its own name, with no `<folderId>__` prefix, and the shared
 * root holds the one data source named `default`, which connects (research
 * `xcube-256d632371.md`, 1.1, 4.2).
 */
const MODEL = 'e2e-security';
const PREFIXED = /^f[a-z0-9]+__/;

const xcube = async (request: import('@playwright/test').APIRequestContext, path: string) => {
  const answer = await request.get(`${CUBE}/v1/semantic/models/${MODEL}${path}`, {
    headers: { authorization: `Bearer ${serviceToken()}` },
  });
  expect(answer.status(), await answer.text()).toBe(200);
  return (await answer.json()) as Record<string, unknown>;
};

test.describe('the fresh start onto one name per item (T702, AC-328, AC-310)', () => {
  test.use({ role: 'super' });

  test('xcube serves every item of the suite’s model under its own name', async ({ request }) => {
    const { items } = (await xcube(request, '/items')) as {
      items: { folderId: string; name: string; fullName: string }[];
    };
    // The seeded root model, at least.
    expect(items.map((item) => item.name)).toEqual(expect.arrayContaining(['orders']));
    for (const item of items) {
      expect(item.fullName, `${item.folderId}/${item.name}`).toBe(item.name);
      expect(item.name, `${item.folderId}/${item.name}`).not.toMatch(PREFIXED);
    }
  });

  test('the shared root holds the only `default`, and it connects', async ({ page }) => {
    const seeded = await seedRootDefault();
    expect(seeded.code, seeded.said.join('\n')).toBe(0);

    const { connections } = (await xcube(page.request, '/connections')) as {
      connections: { name: string; folderId: string }[];
    };
    for (const connection of connections)
      expect(connection.name, connection.folderId).not.toMatch(PREFIXED);
    expect(connections.filter((connection) => connection.name.toLowerCase() === 'default')).toEqual(
      [expect.objectContaining({ name: 'default', folderId: 'froot' })],
    );

    const listed = (await (await page.request.get('/api/data-sources')).json()) as {
      id: string;
      name: string;
      folderId: string;
    }[];
    const defaults = listed.filter((row) => row.name.toLowerCase() === 'default');
    expect(defaults.map((row) => row.folderId)).toEqual(['root']);

    const tested = await page.request.post(`/api/data-sources/${defaults[0]!.id}/test`, {
      data: {},
      timeout: 90_000,
    });
    expect(tested.status(), await tested.text()).toBe(200);
    expect(((await tested.json()) as { ok: boolean }).ok).toBe(true);
  });
});
