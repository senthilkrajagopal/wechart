import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Image and link tiles, on the running app.
 *
 * T069 / AC-063: WHEN an image tile has no alternative text, THE SYSTEM SHALL
 * show a warning on the tile in edit mode, and SHALL accept only PNG, JPEG,
 * WebP, GIF and SVG files of at most 2 MB (direction.md rule 42).
 * Fails when: a tile without alt text shows no warning, or a file of another
 * type or over 2 MB is accepted.
 *
 * Each test makes a dashboard of its own: saving changes it, and the three
 * browsers share one server.
 */
const API = 'http://localhost:4100/api';

/** A 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

async function makeDashboard(request: APIRequestContext) {
  const unique = `${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const title = `Tiles ${unique}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, folderId: 'root' },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        folderId: 'root',
        owner: 'admin',
        settings: { width: 'fixed' },
        pages: [{ id: 'only', title: 'Only', items: [] }],
      },
    },
  });
  return { id: dashboard.id, title };
}

async function editWithSidebar(page: Page, panel: 'Add' | 'Properties') {
  await page
    .getByRole('complementary', { name: 'Edit sidebar' })
    .getByRole('tab', { name: panel })
    .click();
}

const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Edit sidebar' });

test('an image tile takes only allowed images, warns until it has alt text, and keeps both', async ({
  page,
  request,
}) => {
  const { id, title } = await makeDashboard(request);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await editWithSidebar(page, 'Add');
  await page.getByTestId('add-image').click();

  const tile = page.locator('[data-tile]').filter({ has: page.locator('.image-tile') });
  await expect(tile.getByTestId('image-alt-missing')).toHaveText('⚠ No alternative text');

  await tile.click();
  await editWithSidebar(page, 'Properties');
  const file = sidebar(page).getByLabel('Image file');

  // Another type, and a PNG past 2 MB: refused, and nothing on the tile.
  await file.setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hi'),
  });
  await expect(sidebar(page).getByRole('alert')).toHaveText(
    'Only PNG, JPEG, WebP, GIF and SVG images can be added.',
  );
  await file.setInputFiles({
    name: 'huge.png',
    mimeType: 'image/png',
    buffer: Buffer.concat([PNG, Buffer.alloc(2_000_000)]),
  });
  await expect(sidebar(page).getByRole('alert')).toHaveText(
    'Images can be at most 2 MB; this one is 2.0 MB.',
  );
  await expect(tile.locator('img')).toHaveCount(0);

  // A PNG: added, drawn, still flagged until it has alternative text.
  await file.setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });
  await expect(tile.locator('img')).toHaveCount(1);
  await expect
    .poll(() => tile.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(1);
  await expect(tile.getByTestId('image-alt-missing')).toBeVisible();
  await sidebar(page).getByLabel('Alternative text').fill('A single dot');
  await expect(tile.getByTestId('image-alt-missing')).toHaveCount(0);

  await page
    .getByRole('toolbar', { name: 'Dashboard editing' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(page.getByRole('toolbar', { name: 'Dashboard editing' })).toBeHidden();

  // Kept: after a reload, the image with its alternative text.
  await page.reload();
  await expect(page.getByRole('img', { name: 'A single dot' })).toBeVisible();
});

test('the server refuses what the rule refuses, however it is sent', async ({ request }) => {
  const { id } = await makeDashboard(request);
  const refused = await request.post(`${API}/dashboards/${id}/images`, {
    data: { contentType: 'image/png', data: Buffer.from('GIF89a....').toString('base64') },
  });
  expect(refused.status()).toBe(422);
  expect(((await refused.json()) as { error: string }).error).toBe(
    'This file is not the image type it claims to be.',
  );

  const accepted = await request.post(`${API}/dashboards/${id}/images`, {
    data: { contentType: 'image/png', data: PNG.toString('base64') },
  });
  expect(accepted.status()).toBe(201);
  const { id: imageId } = (await accepted.json()) as { id: string };
  const served = await request.get(`${API}/images/${imageId}`);
  expect(served.headers()['content-type']).toBe('image/png');
  expect(Buffer.from(await served.body()).equals(PNG)).toBe(true);
});
