import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * T359 (AC-254; amended 2026-10-01, `[R52]`: "Workspace-only now"): with
 * security off, wechart runs as one user holding every permission, and that
 * user changes shared work as a signed-in one does. A shared dashboard offers
 * "Edit in my workspace" and no edit in place; the copy goes back by a
 * proposal, which waits in Reviews until its own author approves it. Nothing
 * asks for a sign-in or refuses a permission on the way.
 *
 * The phase-1 configuration: `playwright.config.ts`, sign-in off.
 */
const RUN = Math.random().toString(36).slice(2, 8);
const FOLDER = `Solo ${RUN}`;
const BOARD = `Solo board ${RUN}`;
const made = { folder: '', board: '', copy: '' };

async function created(request: APIRequestContext, data: Record<string, unknown>) {
  const answer = await request.post('/api/documents', { data });
  expect(answer.status(), await answer.text()).toBe(201);
  return ((await answer.json()) as { id: string }).id;
}

test.describe.configure({ mode: 'serial' });

test.describe('the single user, with security off (T359, AC-254)', () => {
  test.afterAll(async ({ request }) => {
    const copy =
      made.copy === ''
        ? null
        : ((await (await request.get(`/api/documents/dashboard/${made.copy}`)).json()) as {
            body: { folderId?: string };
          });
    for (const [kind, id] of [
      ['dashboard', made.copy],
      ['dashboard', made.board],
    ] as const)
      if (id !== '') await request.delete(`/api/documents/${kind}/${id}`);
    // The copy's project folder (T523), then the shared one.
    const project = copy?.body.folderId;
    if (project !== undefined && project !== 'mine')
      await request.delete(`/api/documents/folder/${project}`);
    if (made.folder !== '') await request.delete(`/api/documents/folder/${made.folder}`);
  });

  test('edits a shared dashboard through My workspace, proposes it and approves their own proposal', async ({
    page,
  }) => {
    // Nothing asks for a sign-in or refuses a permission (AC-254).
    const refused: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 401 || response.status() === 403)
        refused.push(`${String(response.status())} ${response.url()}`);
    });
    made.folder = await created(page.request, { kind: 'folder', title: FOLDER, folderId: 'root' });
    made.board = await created(page.request, {
      kind: 'dashboard',
      title: BOARD,
      folderId: made.folder,
    });

    // The chip says where their proposals wait.
    await page.goto(`/explore/dashboards/${made.board}`);
    await page.getByRole('button', { name: 'Single-user mode' }).click();
    await expect(page.getByTestId('account-panel')).toContainText(
      'Sign-in is off, so wechart runs as one user with every permission. Your proposals still wait for your approval in Reviews.',
    );
    await page.keyboard.press('Escape');

    // A shared one is never edited in place: a copy in My workspace is.
    await expect(page.getByRole('heading', { name: BOARD, exact: true })).toBeVisible();
    const header = page.locator('.dashboard__header');
    const copyIt = header.getByRole('button', { name: 'Edit in my workspace' });
    await expect(copyIt).toBeVisible();
    await expect(header.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
    await copyIt.click();
    await page
      .getByRole('dialog', { name: 'Edit in my workspace' })
      .getByRole('button', { name: 'Copy and edit' })
      .click();
    await page.waitForURL(
      (url) =>
        /\/explore\/dashboards\/[0-9a-f-]{36}/.test(url.pathname) &&
        !url.pathname.endsWith(made.board),
    );
    made.copy = /\/explore\/dashboards\/([0-9a-f-]{36})/.exec(page.url())?.[1] ?? '';
    const toolbar = page.getByRole('toolbar', { name: 'Dashboard editing' });
    await expect(toolbar).toBeVisible();

    // Changed there in the editor, as its own author may: a heading added.
    await page
      .getByRole('complementary', { name: 'Edit sidebar' })
      .getByRole('tab', { name: 'Add' })
      .click();
    await page.getByTestId('add-header').click();
    await expect(page.getByTestId('grid-item')).toHaveCount(1);
    await toolbar.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(toolbar).toHaveCount(0);
    // The shared one is as it was meanwhile.
    const before = (await (
      await page.request.get(`/api/documents/dashboard/${made.board}`)
    ).json()) as { version: number };
    expect(before.version).toBe(1);

    // Proposed back to its folder.
    await page.goto(`/explore/dashboards/${made.copy}`);
    await expect(page.getByRole('note')).toHaveText('My workspace · only you can see this');
    await page
      .locator('.dashboard__header')
      .getByRole('button', { name: `Propose to ${FOLDER}…` })
      .click();
    const propose = page.getByRole('dialog', { name: `Propose to ${FOLDER}` });
    await expect(propose.getByTestId('propose-item')).toHaveText(
      `Dashboard · ${BOARD} — replaces version 1`,
    );
    await propose.getByLabel('What changed').fill(`Says what it shows (${RUN}).`);
    await propose.getByRole('button', { name: 'Propose', exact: true }).click();
    await expect(propose).toHaveCount(0);

    // Waiting in Reviews, theirs to decide.
    await page
      .getByRole('banner')
      .getByRole('link', { name: /^Reviews, \d+ waiting$/ })
      .click();
    await expect(page).toHaveURL(/\/reviews$/);
    const row = page
      .getByRole('table', { name: 'To review' })
      .getByRole('row')
      .filter({ hasText: BOARD });
    await row.getByRole('button', { name: BOARD }).click();
    await page
      .getByRole('region', { name: BOARD })
      .getByRole('link', { name: 'Open review' })
      .click();
    const inspector = page.getByRole('complementary', { name: 'About this proposal' });
    await inspector.getByRole('button', { name: 'Approve my own proposal' }).click();
    await page
      .getByRole('dialog', { name: `Publish to ${FOLDER}?` })
      .getByRole('button', { name: 'Approve and publish' })
      .click();
    await expect(page.getByTestId('review-said')).toHaveText(
      `Approved. ${FOLDER} now shows version 2.`,
    );

    // Landed in its folder, as its history keeps it.
    const shared = (await (
      await page.request.get(`/api/documents/dashboard/${made.board}`)
    ).json()) as {
      body: { pages?: { items?: { kind: string }[] }[] };
      version: number;
    };
    expect(shared.version).toBe(2);
    expect((shared.body.pages ?? []).flatMap((each) => each.items ?? [])).toEqual([
      expect.objectContaining({ kind: 'header' }),
    ]);
    const history = (await (
      await page.request.get(`/api/history/dashboard/${made.board}`)
    ).json()) as {
      versions: { version: number; approver: { name: string } | null }[];
    };
    expect(history.versions[0]).toMatchObject({ version: 2, approver: { name: 'admin' } });
    expect(refused).toEqual([]);
  });
});
