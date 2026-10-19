import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { IN_MY_WORKSPACE } from './workspace';

/**
 * The Text tile (F45, design 21) on the dashboard.
 *
 * On the seeded model: 240 orders. A dashboard holding a markdown tile saved
 * before R80, with a marking for its marking token.
 */
const API = 'http://localhost:4100/api';

async function dashboardWith(request: APIRequestContext, text: string) {
  const title = `Text ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const placed = await request.put(`${API}/documents/dashboard/${dashboard.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title,
        ...IN_MY_WORKSPACE,
        owner: 'admin',
        settings: { width: 'fixed', interactions: { mode: 'markings' } },
        markings: [{ id: 'm1', name: 'Picks', slot: 'mk1', isDefault: true }],
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [{ id: 'tile-text', kind: 'markdown', w: 6, h: 24, text }],
          },
        ],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title };
}

const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Dashboard editing' });

/** Makes a change and saves it, so the dashboard is written: a Header added. */
async function addAndSave(page: Page) {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await sidebar.getByRole('tab', { name: 'Add' }).click();
  await page.getByTestId('add-header').click();
  await toolbar(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(toolbar(page)).toBeHidden();
}

/**
 * T875 / AC-512: a markdown tile saved before R80 opens as a Text tile that
 * reads the same — its heading, its text and its tokens' values — and is
 * stored as a document on the next save, holding no markdown.
 */
test('a markdown tile opens as a Text tile that reads the same, and saves as a document', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWith(
    request,
    '## Marked share\n\nOrders: {{measure:orders.count}}, marked: {{marking:Picks.count}}',
  );
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const tile = page.locator('[data-tile="tile-text"] .text-tile');
  const reads = async () => {
    // A lone "##" is the tile's shallowest heading: h3 (decision T869-1).
    await expect(tile.locator('h3')).toHaveText('Marked share');
    await expect(tile.locator('p')).toHaveText('Orders: 240, marked: 0');
    await expect(tile).not.toContainText('##');
    await expect(tile).not.toContainText('{{');
  };
  await reads();

  await addAndSave(page);
  await reads();
  await page.reload();
  await reads();

  const stored = (await (await request.get(`${API}/documents/dashboard/${id}`)).json()) as {
    body: {
      pages: { items: { id: string; kind: string; text?: unknown; document?: unknown }[] }[];
    };
  };
  const saved = stored.body.pages[0]?.items.find((item) => item.id === 'tile-text');
  expect(saved?.kind).toBe('text');
  expect(saved?.text).toBeUndefined();
  expect(saved?.document).toMatchObject({ version: 1, doc: { type: 'doc' } });
  const body = JSON.stringify(stored.body);
  expect(body).not.toContain('##');
  expect(body).not.toContain('{{');
  expect(body).not.toContain('"markdown"');
});

/**
 * T875, decision T875-1: a markdown tile of 12 tokens converts with all 12
 * live; in edit mode the tile counts "12 / 10 elements" in the warning state
 * and Save is held, "Remove 2 live values to save" (AC-518).
 */
test('a markdown tile of 12 tokens shows all 12, and holds Save until 2 are removed', async ({
  page,
  request,
}) => {
  const tokens = Array.from({ length: 12 }, () => '{{measure:orders.count}}').join(' ');
  const { id, title } = await dashboardWith(request, tokens);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const tile = page.locator('[data-tile="tile-text"]');
  await expect(tile.locator('.text-tile p')).toHaveText(Array(12).fill('240').join(' '));

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const count = tile.getByTestId('text-element-count');
  await expect(count).toHaveText('12 / 10 elements');
  await expect(count).toHaveAttribute('data-state', 'warning');
  await expect(toolbar(page).getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await expect(page.getByTestId('save-blocked')).toContainText('Remove 2 live values to save');
});

/**
 * T876 / AC-302: a Text tile's text is edited in place on the canvas, reached
 * by keyboard as Enter on the focused tile then Enter on "Edit text on the
 * canvas", with focus at the text's end and a 2 px accent border; a click
 * outside, Esc and Tab each leave it; the edit bar's Undo, pressed once,
 * restores the old text whole; Properties holds no textarea.
 */
test('a Text tile’s text is edited on the canvas, left by a click, Esc or Tab, and undone whole', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWith(request, 'Revenue grew');
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const tile = page.locator('[data-tile="tile-text"]');
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  const textbox = tile.getByRole('textbox');

  // By keyboard: Enter on the focused tile, then Enter on Properties' first control.
  await tile.focus();
  await page.keyboard.press('Enter');
  const editText = sidebar.getByRole('button', { name: 'Edit text on the canvas' });
  await expect(editText).toBeFocused();
  await expect(sidebar.locator('textarea')).toHaveCount(0);
  await page.keyboard.press('Enter');

  await expect(textbox).toBeFocused();
  await expect(textbox).toHaveAttribute('aria-multiline', 'true');
  await expect(textbox).toHaveAccessibleName(/Revenue grew/);
  const border = await textbox.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--wc-accent)';
    element.parentElement?.append(probe);
    const accent = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(element);
    return { width: style.borderTopWidth, colour: style.borderTopColor, accent };
  });
  expect(border.width).toBe('2px');
  expect(border.colour).toBe(border.accent);

  // Focus is at the text's end: what's typed follows it.
  await page.keyboard.type(' fast, and margins held');
  await expect(textbox).toHaveText('Revenue grew fast, and margins held');

  // A click outside the text leaves it, the tile selected and focused.
  await tile.locator('.tile-head__kind').click();
  await expect(textbox).toHaveCount(0);
  await expect(tile).toBeFocused();
  await expect(tile).toHaveAttribute('data-selected', 'true');
  await expect(tile.locator('.text-tile p')).toHaveText('Revenue grew fast, and margins held');

  // One Undo takes the whole edit.
  await toolbar(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(tile.locator('.text-tile p')).toHaveText('Revenue grew');

  // Double-click, type, Esc: left, the tile selected and focused.
  await tile.locator('.text-tile').dblclick();
  await expect(textbox).toBeFocused();
  await page.keyboard.type('!');
  await page.keyboard.press('Escape');
  await expect(textbox).toHaveCount(0);
  await expect(tile).toBeFocused();
  await expect(tile).toHaveAttribute('data-selected', 'true');
  await expect(tile.locator('.text-tile p')).toHaveText('Revenue grew!');

  // Tab leaves it for the next control: focus is no longer in the text.
  await tile.locator('.text-tile').dblclick();
  await expect(textbox).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(textbox).toHaveCount(0);
  await expect(tile.locator('.text-tile p')).toHaveText('Revenue grew!');
  expect(
    await page.evaluate(() => document.activeElement?.closest('[contenteditable]') ?? null),
  ).toBeNull();
});
