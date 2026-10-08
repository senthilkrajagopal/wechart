import {
  expect,
  request as requests,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';

/**
 * T359 (AC-254, AC-308; `[R52]`, "Workspace-only now"): with security off,
 * the single user changes shared work only through My workspace and a
 * proposal they approve themselves, as a signed-in user does. A shared
 * dashboard or chart is never saved in place (T502's `409`).
 *
 * So a spec's own dashboards and charts are made in My workspace, to go to
 * the shared root, and set up and edited there in place, as its author may.
 * Spread into the body of a `POST /api/documents` and of each `PUT` of it: a
 * `PUT` keeps the target it was made with, whatever it sends.
 */
export const IN_MY_WORKSPACE = { folderId: 'mine', targetFolderId: 'root' } as const;

/** My workspace's root, as the single user's folder id names it. */
const MY_WORKSPACE = IN_MY_WORKSPACE.folderId;

const API = 'http://localhost:4100/api';

/**
 * Shares a workspace dashboard or chart as the single user does: proposed to
 * its target and approved by its own author (AC-254). What landed, by kind:
 * a dashboard's id is its shared one, and each library chart's its own.
 */
export async function shared(
  request: APIRequestContext,
  kind: 'dashboard' | 'chart',
  id: string,
): Promise<{ readonly kind: string; readonly id: string }[]> {
  const proposed = await request.post(`${API}/proposals`, { data: { kind, id } });
  expect(proposed.status(), await proposed.text()).toBe(201);
  const proposal = ((await proposed.json()) as { id: string }).id;
  const approved = await request.post(`${API}/proposals/${proposal}/approve`, { data: {} });
  expect(approved.status(), await approved.text()).toBe(200);
  return ((await approved.json()) as { landed: { kind: string; id: string }[] }).landed;
}

/**
 * New › Dashboard or Chart, as the single user makes one: in My workspace,
 * or `folder` in it, named as it is offered and going to `target` (T345,
 * AC-282). New in a shared folder offers a folder alone (T331), as with
 * sign-in on.
 */
export async function newInMyWorkspace(
  page: Page,
  kind: 'Dashboard' | 'Chart',
  target = 'root',
  folder: string = MY_WORKSPACE,
): Promise<void> {
  await page.goto(`/explore?folder=${folder}`);
  await page
    .getByTestId('explore-contents')
    .getByRole('button', { name: 'New', exact: true })
    .click();
  await page
    .getByRole('menu', { name: 'New' })
    .getByRole('menuitem', { name: kind, exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: `New ${kind.toLowerCase()} in My workspace` });
  await chooseTarget(dialog, target);
  await dialog.getByRole('button', { name: 'Create' }).click();
}

/**
 * The folder a new workspace item is to go to, chosen in New's tree of full
 * paths (2026-09-27 design 04, state A; T692): its row, by the folder's id.
 */
export function targetRow(dialog: Locator, folderId: string): Locator {
  return dialog
    .getByRole('tree', { name: 'Target folder' })
    .locator(`[role="treeitem"][data-target="${folderId}"]`);
}

/** Chooses `folderId` in New's Target folder tree (T692). */
export async function chooseTarget(dialog: Locator, folderId: string): Promise<void> {
  const row = targetRow(dialog, folderId);
  await row.click();
  await expect(row).toHaveAttribute('aria-selected', 'true');
}

/**
 * The single user's copy of a shared dashboard or chart in My workspace, as
 * "Edit in my workspace" makes it (T344, T523), or their copy already there:
 * its id. Where a spec edits a seeded shared dashboard, it edits this, as the
 * single user must.
 */
export async function myCopyOf(
  request: APIRequestContext,
  kind: 'dashboard' | 'chart',
  id: string,
): Promise<string> {
  const answer = await request.post(`${API}/workspace/copies`, {
    data: { kind, id, timeZone: 'UTC' },
  });
  expect(answer.status(), await answer.text()).toBeLessThan(300);
  return ((await answer.json()) as { id: string }).id;
}

/**
 * The single user's copy in My workspace of a shared folder's model file, as
 * "Edit in my workspace" makes it (T347, T523), or their copy already there:
 * where it is, and its address in the model editor. A shared model is
 * changed only through a copy now, with sign-in off too (T451's switch;
 * AC-254, `[R52]`).
 *
 * Every spec asking for one file's copy is given the same copy, so a spec
 * only edits it, never saving it: a saved change would be what the others
 * open, and what each workspace preview reads in place of the folder's
 * (T347). A spec that saves a model saves its own (`ownCubeFile`, `landed`).
 */
export async function myModelCopy(
  request: APIRequestContext,
  path: string,
  folderId = 'root',
): Promise<{ readonly folderId: string; readonly path: string; readonly href: string }> {
  const answer = await request.post(`${API}/workspace/copies`, {
    data: { kind: 'model', folderId, path, timeZone: 'UTC' },
    timeout: 90_000,
  });
  expect(answer.status(), await answer.text()).toBeLessThan(300);
  const copy = (await answer.json()) as { folderId: string; path: string };
  return {
    ...copy,
    href: `/explore/folders/${encodeURIComponent(copy.folderId)}/models/${encodeURIComponent(copy.path)}`,
  };
}

/**
 * The address of the single user's copy of the seeded shared dashboard,
 * `seed-root-dashboard-1`, for a spec that edits it (T359): asked once, in a
 * `beforeAll`, with a request context of its own.
 */
export async function seedDashboardCopy(): Promise<string> {
  const context = await requests.newContext();
  try {
    return `/explore/dashboards/${await myCopyOf(context, 'dashboard', 'seed-root-dashboard-1')}`;
  } finally {
    await context.dispose();
  }
}

/** The shared id a workspace item landed as, by `shared`. */
export const landedAs = (
  landed: readonly { readonly kind: string; readonly id: string }[],
  kind: 'dashboard' | 'chart',
): string => {
  const found = landed.find((each) => each.kind === kind);
  if (found === undefined) throw new Error(`No ${kind} landed.`);
  return found.id;
};

/**
 * A dashboard or chart of the spec's own, made in `folderId` in My workspace
 * to go to `target`, with `body` set on it as its author may in place: its
 * id. `body` is laid over what it was made with, so it need name only what
 * the spec sets.
 */
export async function madeIn(
  request: APIRequestContext,
  kind: 'dashboard' | 'chart',
  folderId: string,
  body: Record<string, unknown>,
  target = 'root',
): Promise<string> {
  const created = await request.post(`${API}/documents`, {
    data: { kind, title: body['title'], folderId, targetFolderId: target },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { id } = (await created.json()) as { id: string };
  const stored = (await (await request.get(`${API}/documents/${kind}/${id}`)).json()) as {
    version: number;
    body: Record<string, unknown>;
  };
  const saved = await request.put(`${API}/documents/${kind}/${id}`, {
    data: { version: stored.version, body: { ...stored.body, ...body } },
  });
  expect(saved.status(), await saved.text()).toBe(200);
  return id;
}

/**
 * A dashboard or chart of the spec's own in the shared folder `folderId`, as
 * the single user puts one there (T359, AC-254): made in My workspace to go
 * there, proposed and approved. Its shared id.
 */
export async function sharedIn(
  request: APIRequestContext,
  kind: 'dashboard' | 'chart',
  folderId: string,
  body: Record<string, unknown>,
): Promise<string> {
  const id = await madeIn(request, kind, MY_WORKSPACE, body, folderId);
  return landedAs(await shared(request, kind, id), kind);
}
