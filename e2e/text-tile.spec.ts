import { readFile } from 'node:fs/promises';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { headerToggle, openHeaderSheet } from './dashboardHeader';
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

  // Its toolbar above it (AC-302, AC-515).
  const bar = tile.getByRole('toolbar', { name: 'Text formatting' });
  const barBox = await bar.boundingBox();
  const textBox = await textbox.boundingBox();
  expect(barBox !== null && textBox !== null && barBox.y + barBox.height <= textBox.y).toBe(true);

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

  // A click on nothing that takes focus, outside the tile — the dashboard's
  // title — leaves it too, the tile selected and focused (T876's review).
  await tile.locator('.text-tile').dblclick();
  await expect(textbox).toBeFocused();
  await page.keyboard.type('?');
  await page.locator('.dashboard__header h1').click();
  await expect(textbox).toHaveCount(0);
  await expect(tile).toBeFocused();
  await expect(tile).toHaveAttribute('data-selected', 'true');
  await expect(tile.locator('.text-tile p')).toHaveText('Revenue grew!?');
  await toolbar(page).getByRole('button', { name: 'Undo', exact: true }).click();
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

/**
 * T878 / AC-515: while the text is edited, a 40 px toolbar above it holds,
 * in order, the block style, Bold, Italic, both lists, Link, Insert and the
 * count; each block style is shown in its own type, §3's 14, 16, 20, 24 and
 * 32 px; Heading medium makes the line an h4 at 20 px; nothing sets colour,
 * font or size.
 */
test('the Text tile’s toolbar: its controls in order, and each block style at §3’s size', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWith(request, 'Orders {{measure:orders.count}} so far');
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const tile = page.locator('[data-tile="tile-text"]');
  await tile.locator('.text-tile').dblclick();
  const textbox = tile.getByRole('textbox');
  await expect(textbox).toBeFocused();

  const bar = tile.getByRole('toolbar', { name: 'Text formatting' });
  expect((await bar.boundingBox())?.height).toBe(40);
  expect(
    await bar
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
  ).toEqual([
    'Block style: Paragraph',
    'Bold',
    'Italic',
    'Bulleted list',
    'Numbered list',
    'Link',
    'Insert',
  ]);
  await expect(bar.getByTestId('text-toolbar-count')).toHaveText('1 / 10 elements');
  await expect(bar.getByRole('button', { name: /colou?r|font|size/i })).toHaveCount(0);

  await bar.getByRole('button', { name: 'Block style: Paragraph' }).click();
  const menu = tile.getByRole('menu', { name: 'Block style' });
  const sizes = await menu
    .getByRole('menuitemradio')
    .evaluateAll((items) =>
      items.map((item) => [item.textContent, getComputedStyle(item).fontSize]),
    );
  expect(sizes).toEqual([
    ['Paragraph', '14px'],
    ['Heading small', '16px'],
    ['Heading medium', '20px'],
    ['Heading large', '24px'],
    ['Large value', '32px'],
  ]);

  await menu.getByRole('menuitemradio', { name: 'Heading medium' }).click();
  const line = textbox.locator('h4');
  await expect(line).toContainText('Orders');
  expect(await line.evaluate((element) => getComputedStyle(element).fontSize)).toBe('20px');
  await expect(textbox).toBeFocused();

  // Left, it reads as the tile draws a Heading medium.
  await page.keyboard.press('Escape');
  await expect(tile.locator('.text-tile h4')).toContainText('Orders');
});

/**
 * T881 / AC-517: `/` after a space, `{{` and Insert each open the insert
 * menu at the cursor — a 320 px listbox of 28 px rows, Live values then
 * Controls, focus staying in the text with `aria-activedescendant` — and
 * typing narrows it to the dashboard's measures by cube; Enter inserts a
 * Value of one, which the tile then shows; Esc leaves what was typed.
 */
test('the insert menu opens by /, {{ and Insert, finds a measure by cube, and inserts its Value', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWith(request, 'Orders {{measure:orders.count}} so far');
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const tile = page.locator('[data-tile="tile-text"]');
  await tile.locator('.text-tile').dblclick();
  const textbox = tile.getByRole('textbox');
  await expect(textbox).toBeFocused();
  const menu = page.getByRole('listbox', { name: 'Insert' });

  // `/` after a space.
  await page.keyboard.type(' /');
  await expect(menu).toBeVisible();
  await expect(textbox).toBeFocused();
  const box = await menu.boundingBox();
  expect(box?.width).toBe(320);
  expect((await menu.getByRole('option').first().boundingBox())?.height).toBe(28);
  expect(
    await menu
      .getByRole('group')
      .evaluateAll((groups) => groups.map((group) => group.getAttribute('aria-label'))),
  ).toEqual(expect.arrayContaining(['Live values', 'Controls']));
  const active = await textbox.getAttribute('aria-activedescendant');
  await expect(page.locator(`[id="${active ?? ''}"]`)).toHaveAttribute('data-name', 'Value');
  // Esc closes it, the `/` staying as typed.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(textbox).toBeFocused();
  await expect(textbox).toContainText('so far /');
  await page.keyboard.press('Backspace');

  // Insert, on the toolbar.
  await tile.getByRole('button', { name: 'Insert' }).click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // `{{`, then what's typed finds the dashboard's measures by cube.
  await page.keyboard.type('{{tot');
  await expect(menu.getByRole('group', { name: 'Orders' }).getByRole('option')).toHaveText([
    /Total Amount/,
  ]);
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(textbox).not.toContainText('{{');
  await expect(textbox.locator('[data-element="value"]')).toHaveCount(2);

  // Left, the tile shows both values.
  await page.keyboard.press('Escape');
  await expect(tile.locator('.text-tile p')).toHaveText(/^Orders 240 so far \D*\d/);
});

/**
 * T882 / AC-519: in the text being edited, an element is an atom named by
 * its kind and source, which ← and → step over as one character, selecting
 * it on the way, and Backspace removes whole; selected, by a key or by its
 * row in Properties' Elements list ("1 of 10"), its settings open there.
 */
test('an element is an atom: stepped over and selected by the arrows, removed whole, and listed in Properties', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWith(request, 'Orders {{measure:orders.count}} so far');
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const tile = page.locator('[data-tile="tile-text"]');
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await tile.locator('.text-tile').dblclick();
  const textbox = tile.getByRole('textbox');
  await expect(textbox).toBeFocused();

  const element = textbox.getByRole('img', { name: 'Value, Count' });
  await expect(element).toBeVisible();
  const list = sidebar.getByRole('list', { name: 'Elements' });
  await expect(sidebar.getByText('1 of 10')).toBeVisible();
  await expect(list.getByRole('button')).toHaveText(['ValueCount']);
  const selected = textbox.locator('.ProseMirror-selectednode');
  const settings = sidebar.getByRole('region', { name: 'Value, Count: settings' });

  // From the end, past " so far", then onto the element: selected, its settings open.
  for (let step = 0; step < ' so far'.length; step += 1) await page.keyboard.press('ArrowLeft');
  await expect(selected).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await expect(selected).toHaveCount(1);
  await expect(list.getByRole('button')).toHaveAttribute('aria-current', 'true');
  await expect(settings).toContainText('Orders › Count');
  // One more is past it, as past one character.
  await page.keyboard.press('ArrowLeft');
  await expect(selected).toHaveCount(0);
  await expect(settings).toHaveCount(0);

  // → selects it, → is past it, Backspace takes it whole.
  await page.keyboard.press('ArrowRight');
  await expect(selected).toHaveCount(1);
  await page.keyboard.press('ArrowRight');
  await expect(selected).toHaveCount(0);
  await page.keyboard.press('Backspace');
  await expect(textbox.locator('[data-element]')).toHaveCount(0);
  await expect(textbox).toHaveText('Orders  so far');
  await expect(list).toHaveCount(0);
  // ⌘Z inside the text brings it back.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(element).toBeVisible();

  // Its row in Properties selects it, and the text stays being edited.
  await list.getByRole('button', { name: /Value/ }).click();
  await expect(selected).toHaveCount(1);
  await expect(textbox).toHaveCount(1);
  await expect(settings).toBeVisible();

  // Left, it draws its value.
  await tile.locator('.tile-head__kind').click();
  await expect(textbox).toHaveCount(0);
  await expect(tile.locator('.text-tile p')).toHaveText('Orders 240 so far');

  // Its row, while the text isn't being edited, opens the text with it
  // selected, focus in the text (T882's review).
  await list.getByRole('button', { name: /Value/ }).click();
  await expect(textbox).toBeFocused();
  await expect(selected).toHaveCount(1);
  await expect(settings).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(textbox).toHaveCount(0);
});

/** A dashboard holding one Text tile of this document, as saved after R80. */
async function dashboardWithText(
  request: APIRequestContext,
  content: unknown[],
  filters: unknown[] = [],
  more: unknown[] = [],
) {
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
        ...(filters.length === 0 ? {} : { filters }),
        pages: [
          {
            id: 'only',
            title: 'Only',
            items: [
              {
                id: 'tile-text',
                kind: 'text',
                w: 6,
                h: 24,
                document: { version: 1, doc: { type: 'doc', content } },
              },
              ...more,
            ],
          },
        ],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  return { id: dashboard.id, title };
}

/**
 * T884 / AC-520, AC-116: a Value reads in its model's format, and one
 * limited by a marking with nothing marked shows "—" when the author chose
 * so; a Change reads ▲ or ▼ and its size, in the status its direction
 * gives, and its settings in Properties — Show as Amount — change what it
 * reads, one Undo putting it back.
 */
test('a Value in its model’s format, limited by a marking, and a Change with its triangle, colour and settings', async ({
  page,
  request,
}) => {
  const amount = 'orders.total_amount';
  const { id, title } = await dashboardWithText(request, [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Revenue ' },
        { type: 'value', attrs: { measure: amount } },
        { type: 'text', text: ', picked ' },
        { type: 'value', attrs: { measure: amount, marking: 'Picks', whenUnmarked: 'none' } },
        { type: 'text', text: ', change ' },
        { type: 'change', attrs: { measure: amount, period: 'month', direction: 'higher' } },
      ],
    },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const tile = page.locator('[data-tile="tile-text"]');
  const values = tile.locator('.text-tile .text-value');
  // The model's currency format (AC-046).
  await expect(values.first()).toHaveText(/^\$\d{1,3}(,\d{3})*(\.\d+)?$/);
  // Nothing marked, and "—" chosen for that.
  await expect(values.nth(1)).toHaveText('—');

  const change = tile.locator('.text-tile .text-change');
  await expect(change).toHaveText(/^(▲ \+|▼ −)\d+\.\d%$|^0\.0%$/);
  const read = await change.evaluate((element) => {
    const probe = (colour: string) => {
      const span = document.createElement('span');
      span.style.color = colour;
      element.parentElement?.append(span);
      const value = getComputedStyle(span).color;
      span.remove();
      return value;
    };
    return {
      text: element.textContent ?? '',
      tone: element.getAttribute('data-tone'),
      colour: getComputedStyle(element).color,
      success: probe('var(--wc-status-success)'),
      error: probe('var(--wc-status-error)'),
      neutral: probe('var(--wc-text-secondary)'),
    };
  });
  // Higher is better: a rise in status-success, a fall in status-error.
  const tone = read.text.startsWith('▲')
    ? 'success'
    : read.text.startsWith('▼')
      ? 'error'
      : 'neutral';
  expect(read.tone).toBe(tone);
  expect(read.colour).toBe(read[tone]);

  // Its settings: Show as Amount, set while the text is edited.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await tile.locator('.text-tile').dblclick();
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  await sidebar
    .getByRole('list', { name: 'Elements' })
    .getByRole('button', { name: /^Change/ })
    .click();
  await sidebar.getByRole('radio', { name: 'Amount' }).check();
  await tile.locator('.tile-head__kind').click();
  await expect(tile.getByRole('textbox')).toHaveCount(0);
  await expect(change).toHaveText(/^(▲ \+|▼ −)?\$\d+(\.\d)?[KMB]?$/);

  // One Undo takes the whole edit back.
  await toolbar(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(change).toHaveText(/^(▲ \+|▼ −)\d+\.\d%$|^0\.0%$/);
});

/**
 * T885 / AC-521: a Sparkline is wechart's own 64 × 16 SVG, one 2 px line in
 * the measure's dashboard colour with only its chosen last point, named by
 * its measure, period, first and last values, low and high; a Bullet graph
 * is 96 × 16, named by its value, target and ranges.
 */
test('a Sparkline and a Bullet graph, word-sized SVG images named by what they show', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWithText(request, [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Trend ' },
        {
          type: 'sparkline',
          attrs: { measure: 'orders.total_amount', granularity: 'month', last: 6, lastPoint: true },
        },
        { type: 'text', text: ' and orders ' },
        {
          type: 'bulletGraph',
          attrs: {
            measure: 'orders.count',
            target: { kind: 'fixed', value: 200 },
            ranges: [100, 150, 220],
          },
        },
      ],
    },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-text"]');

  const sparkline = tile.locator('.text-tile svg.text-sparkline');
  await expect(sparkline).toHaveAttribute('role', 'img');
  await expect(sparkline).toHaveAttribute(
    'aria-label',
    /^Total Amount by month, last 6 months: from \$[\d.]+[KMB]? to \$[\d.]+[KMB]?, low \$[\d.]+[KMB]?, high \$[\d.]+[KMB]?$/,
  );
  const box = await sparkline.boundingBox();
  expect([box?.width, box?.height]).toEqual([64, 16]);
  const line = sparkline.locator('path');
  await expect(line).toHaveCount(1);
  await expect(line).toHaveAttribute('stroke-width', '2');
  await expect(line).toHaveAttribute('stroke', /^#[0-9a-fA-F]{6}$/);
  await expect(sparkline.locator('circle')).toHaveCount(1);
  await expect(sparkline.locator('line, text, rect')).toHaveCount(0);

  const bullet = tile.locator('.text-tile svg.text-bullet');
  await expect(bullet).toHaveAttribute('role', 'img');
  await expect(bullet).toHaveAttribute(
    'aria-label',
    'Count 240, target 200, ranges 100, 150 and 220',
  );
  const bulletBox = await bullet.boundingBox();
  expect([bulletBox?.width, bulletBox?.height]).toEqual([96, 16]);
  await expect(bullet.locator('[data-part="range"]')).toHaveCount(3);
});

/**
 * T886 / AC-522, AC-116: an Icon shows the first matching rule's icon and
 * word; a Filter value, while its filter is unset, that all its values are
 * in; an As of the data's age, its tooltip saying what answered; a Marking
 * its count.
 */
test('an Icon, a Filter value, an As of and a Marking, each read as words in the sentence', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWithText(
    request,
    [
      {
        type: 'paragraph',
        content: [
          {
            type: 'icon',
            attrs: {
              measure: 'orders.count',
              rules: [
                { op: '>=', value: 200, state: 'success', label: 'On track' },
                { op: '>=', value: 100, state: 'warning', label: 'Watch' },
                { op: 'otherwise', state: 'error', label: 'Behind' },
              ],
            },
          },
          { type: 'text', text: ' for ' },
          { type: 'filterValue', attrs: { filter: 'f-status' } },
          { type: 'text', text: ', ' },
          { type: 'asOf', attrs: { measure: 'orders.count' } },
          { type: 'text', text: ', marked ' },
          { type: 'marking', attrs: { marking: 'Picks', show: 'count' } },
        ],
      },
    ],
    [{ id: 'f-status', widget: 'list', member: 'orders.status' }],
  );
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-text"] .text-tile');

  // 240 orders: the first rule matches.
  const icon = tile.locator('.text-icon');
  await expect(icon).toHaveText('On track');
  await expect(icon).toHaveAttribute('data-tone', 'success');
  await expect(icon.locator('[data-icon="ok"]')).toHaveCount(1);

  await expect(tile).toContainText('for all statuses,');
  const asOf = tile.locator('.text-as-of');
  await expect(asOf).toHaveText(/^as of \S/);
  await expect(asOf).toHaveAttribute('title', /^Answered by the /);
  await expect(tile).toContainText(/marked 0$/);
});

/**
 * T879 / AC-516, in the browser: `## ` typed makes Heading medium, which the
 * next ⌘Z gives back as typed; `[a](https://x.example)` a link; ⌘B bolds;
 * ⇧⌘Z redoes nothing; ⌘U underlines nothing.
 */
test('markdown typed in a Text tile converts, the next Undo reverses it, and only ⌘B, ⌘I and ⌘Z act', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWithText(request, [{ type: 'paragraph' }]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const tile = page.locator('[data-tile="tile-text"]');
  await tile.locator('.text-tile').dblclick();
  const textbox = tile.getByRole('textbox');
  await expect(textbox).toBeFocused();

  await page.keyboard.type('## ');
  await expect(textbox.locator('h4')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(textbox.locator('h4')).toHaveCount(0);
  await expect(textbox.locator('p')).toHaveText('## ');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(textbox.locator('h4')).toHaveCount(0);

  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('see [a](https://x.example) now');
  await expect(textbox.locator('a')).toHaveText('a');
  await expect(textbox.locator('a')).toHaveAttribute('href', 'https://x.example');
  await expect(textbox.locator('p')).toHaveText('see a now');

  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+u');
  await expect(textbox.locator('u')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+b');
  // Bold over all three runs, the link between them.
  await expect(textbox.locator('strong')).toHaveText(['see ', 'a', ' now']);
});

/**
 * T880 / AC-513: pasting an image with an error handler, a script, an
 * iframe and a `javascript:` link runs nothing, in edit mode or after saving
 * and reloading in view mode; the tile's DOM holds none of them, no `on…`
 * attribute and no `javascript:` address; the link's text "a" remains.
 */
test('a pasted image, script, iframe and javascript: link run nothing and leave only their text', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWithText(request, [
    { type: 'paragraph', content: [{ type: 'text', text: 'Before ' }] },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const tile = page.locator('[data-tile="tile-text"]');
  await tile.locator('.text-tile').dblclick();
  const textbox = tile.getByRole('textbox');
  await expect(textbox).toBeFocused();

  const pasted = await textbox.evaluate((element) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>' +
        '<iframe src="https://x.example"></iframe><a href="javascript:window.__xss=3">a</a>',
    );
    data.setData('text/plain', 'a');
    const event = new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  // The editor took the paste: the browser inserted nothing itself.
  expect(pasted).toBe(true);
  await expect(textbox).toContainText('Before a');

  const clean = async (root: ReturnType<Page['locator']>) => {
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as { __xss?: unknown }).__xss)).toBeUndefined();
    await expect(root.locator('img, script, iframe')).toHaveCount(0);
    expect(
      await root.evaluate((element) =>
        [element, ...element.querySelectorAll('*')].flatMap((node) =>
          [...node.attributes]
            .filter(
              (attribute) =>
                attribute.name.startsWith('on') || /javascript:/i.test(attribute.value),
            )
            .map((attribute) => attribute.name),
        ),
      ),
    ).toEqual([]);
  };
  await clean(tile);

  await page.keyboard.press('Escape');
  await toolbar(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(toolbar(page)).toBeHidden();
  await page.reload();
  const read = page.locator('[data-tile="tile-text"] .text-tile');
  await expect(read).toHaveText('Before a');
  await clean(read);
});

/**
 * T883 / AC-518: a tile of 10 elements — a filter control and a button
 * among them — counts "10 / 10 elements"; Insert is disabled with the
 * reason; `{{` opens the menu with every row disabled and the reason; a
 * paste of an element is refused with the reason, and the text keeps 10.
 */
test('a Text tile of 10 elements: Insert, the menu and a paste each refuse an eleventh, saying why', async ({
  page,
  request,
}) => {
  const reason =
    'This tile holds 10 elements, the most a Text tile can. Remove one, or add another Text tile.';
  const { id, title } = await dashboardWithText(
    request,
    [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Ten ' },
          ...Array.from({ length: 8 }, () => ({
            type: 'value',
            attrs: { measure: 'orders.count' },
          })),
          { type: 'filterControl', attrs: { filter: 'f-status' } },
          { type: 'actionButton', attrs: { label: 'Go' } },
        ],
      },
    ],
    [{ id: 'f-status', widget: 'list', member: 'orders.status' }],
  );
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const tile = page.locator('[data-tile="tile-text"]');
  await tile.locator('.text-tile').dblclick();
  const textbox = tile.getByRole('textbox');
  await expect(textbox).toBeFocused();

  const bar = tile.getByRole('toolbar', { name: 'Text formatting' });
  await expect(bar.getByTestId('text-toolbar-count')).toHaveText('10 / 10 elements');
  const insert = bar.getByRole('button', { name: 'Insert' });
  await expect(insert).toHaveAttribute('aria-disabled', 'true');
  await expect(insert).toHaveAccessibleDescription(reason);
  // Pressed anyway (Playwright waits on an aria-disabled control), it opens nothing.
  await insert.click({ force: true });
  await expect(page.getByRole('listbox', { name: 'Insert' })).toHaveCount(0);

  await textbox.focus();
  await page.keyboard.press('End');
  await page.keyboard.type(' {{');
  const menu = page.getByRole('listbox', { name: 'Insert' });
  await expect(menu).toBeVisible();
  await expect(menu).toContainText(reason);
  const rows = menu.getByRole('option');
  expect(await rows.count()).toBeGreaterThan(0);
  expect(
    await rows.evaluateAll((all) => all.map((row) => row.getAttribute('aria-disabled'))),
  ).toEqual(Array(await rows.count()).fill('true'));
  await expect(textbox).toHaveAccessibleDescription(reason);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(bar.getByTestId('text-toolbar-count')).toHaveText('10 / 10 elements');

  await textbox.evaluate((element) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      '<p><span data-element="value" data-attrs=\'{"measure":"orders.count"}\'>x</span></p>',
    );
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(tile.getByRole('alert')).toHaveText(reason);
  await expect(bar.getByTestId('text-toolbar-count')).toHaveText('10 / 10 elements');
});

/**
 * T888 / AC-524: in view mode a Change in a Heading large reads at 24 px in
 * the heading's weight, tabular, with no chip; Tab reaches it; on focus it
 * takes a dotted text-muted underline and shows its tooltip — its kind and
 * measure, what it compares, its filters, its marking and its data — which
 * is its accessible description. A Value with its own filter lists it.
 */
test('a value reads in its sentence’s type, and on focus shows what it is, as its description', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWithText(request, [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [
        { type: 'text', text: 'Revenue ' },
        {
          type: 'change',
          attrs: { measure: 'orders.total_amount', period: 'month', direction: 'higher' },
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Shipped ' },
        {
          type: 'value',
          attrs: {
            measure: 'orders.count',
            marking: 'Picks',
            filters: [{ member: 'orders.status', operator: 'equals', values: ['shipped'] }],
          },
        },
      ],
    },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-text"] .text-tile');
  const heading = tile.locator('h3[data-type="text-xl"]');
  const change = heading.locator('.text-element-read');
  await expect(change.locator('.text-change')).toHaveText(/^(▲ \+|▼ −)\d+\.\d%$|^0\.0%$/);
  // The tooltip's words are never the sentence's.
  await expect(heading).toHaveText(/^Revenue (▲ \+|▼ −)?\d+\.\d%$/);

  const read = await change.evaluate((element) => {
    const style = getComputedStyle(element);
    const heading = getComputedStyle(element.closest('h3') as Element);
    return {
      size: style.fontSize,
      weight: style.fontWeight,
      headingWeight: heading.fontWeight,
      numerals: style.fontVariantNumeric,
      background: style.backgroundColor,
      border: style.borderTopWidth,
    };
  });
  expect(read.size).toBe('24px');
  expect(read.weight).toBe(read.headingWeight);
  expect(read.numerals).toBe('tabular-nums');
  expect(read.background).toBe('rgba(0, 0, 0, 0)');
  expect(read.border).toBe('0px');

  // Tab reaches it; focused, it's underlined and shows its tooltip.
  await page.getByRole('heading', { name: title }).click();
  let reached = false;
  for (let step = 0; step < 40 && !reached; step += 1) {
    await page.keyboard.press('Tab');
    reached = await change.evaluate((element) => element === document.activeElement);
  }
  expect(reached).toBe(true);
  const underline = await change.evaluate((element) => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--wc-text-muted)';
    element.parentElement?.append(probe);
    const muted = getComputedStyle(probe).color;
    probe.remove();
    const style = getComputedStyle(element);
    return {
      line: style.textDecorationLine,
      style: style.textDecorationStyle,
      colour: style.textDecorationColor,
      muted,
    };
  });
  expect(underline.line).toBe('underline');
  expect(underline.style).toBe('dotted');
  expect(underline.colour).toBe(underline.muted);

  const tooltip = page.getByRole('tooltip').filter({ visible: true });
  await expect(tooltip).toHaveCount(1);
  await expect(tooltip).toContainText('Change · Total Amount');
  await expect(tooltip).toContainText('This month against the previous');
  await expect(tooltip).toContainText('Filters: none');
  await expect(tooltip).toContainText('Marking: none');
  await expect(tooltip).toContainText(/Data: as of \S+.* · (pre-aggregation|database)/);
  const description = (await tooltip.textContent()) ?? '';
  await expect(change).toHaveAccessibleDescription(description);

  // Esc hides it (APG tooltip).
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip').filter({ visible: true })).toHaveCount(0);

  // A Value lists its own filter and the marking it follows.
  const value = tile.locator('p .text-element-read');
  await value.hover();
  const valueTip = page.getByRole('tooltip').filter({ visible: true });
  await expect(valueTip).toContainText('Value · Count');
  await expect(valueTip).toContainText('Filters: Status shipped');
  await expect(valueTip).toContainText('Marking: Picks');
});

/**
 * Checkpoint 2's fix (AC-522, AC-520): an Icon's "As a share of" and a
 * Value's own filter, set in Properties, are what the tile then reads, and
 * are saved with it.
 */
test('an Icon’s share of a measure and a Value’s own filter are set in Properties', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWithText(request, [
    {
      type: 'paragraph',
      content: [
        {
          type: 'icon',
          attrs: {
            measure: 'orders.count',
            rules: [
              { op: '>=', value: 2, state: 'success', label: 'Many' },
              { op: 'otherwise', state: 'error', label: 'Few' },
            ],
          },
        },
        { type: 'text', text: ' with ' },
        { type: 'value', attrs: { measure: 'orders.count' } },
      ],
    },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-text"]');
  const icon = tile.locator('.text-tile .text-icon');
  const value = tile.locator('.text-tile .text-value');
  await expect(icon).toHaveText('Many');
  await expect(value).toHaveText('240');

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await tile.locator('.text-tile').dblclick();
  const sidebar = page.getByRole('complementary', { name: 'Edit sidebar' });
  const elements = sidebar.getByRole('list', { name: 'Elements' });
  await elements.getByRole('button', { name: /^Icon/ }).click();
  // 240 as a share of itself is 1: below the first rule's 2.
  await sidebar.getByLabel('As a share of').selectOption('orders.count');
  await elements.getByRole('button', { name: /^Value/ }).click();
  await sidebar.getByLabel('Filter field').selectOption('orders.status');
  await sidebar.getByLabel('Filter values').fill('shipped');
  await sidebar.getByRole('button', { name: 'Add filter' }).click();
  await expect(sidebar.getByRole('list', { name: 'Own filter' })).toContainText('is shipped');

  await tile.locator('.tile-head__kind').click();
  await expect(tile.getByRole('textbox')).toHaveCount(0);
  await toolbar(page).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(toolbar(page)).toBeHidden();

  const reads = async () => {
    await expect(icon).toHaveText('Few');
    await expect(value).toHaveText(/^\d+$/);
    await expect(value).not.toHaveText('240');
  };
  await reads();
  await page.reload();
  await reads();
});

/**
 * T889 / AC-525: an element loading is a skeleton, 4ch with no value yet,
 * its tile aria-busy; one Cube refuses shows the warning icon and
 * "Unavailable", Details on focus, and the tile's ⋯ Retry asks it again; one
 * naming a member gone from the model reads "Unavailable", naming nothing,
 * and in edit mode "1 element needs fixing", its row marked; an empty Text
 * tile shows its placeholder in edit mode and nothing in view mode.
 */
test('an element’s loading, failed and removed states, Retry, and an empty tile', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWithText(
    request,
    [
      {
        type: 'paragraph',
        content: [
          { type: 'value', attrs: { measure: 'orders.count' } },
          { type: 'text', text: ' and ' },
          {
            type: 'value',
            attrs: {
              measure: 'orders.average_amount',
              filters: [{ member: 'orders.status', operator: 'equals', values: ['shipped'] }],
            },
          },
          { type: 'text', text: ' and ' },
          { type: 'value', attrs: { measure: 'orders.no_such_measure' } },
        ],
      },
    ],
    [],
    [
      {
        id: 'tile-empty',
        kind: 'text',
        w: 6,
        h: 6,
        document: { version: 1, doc: { type: 'doc', content: [{ type: 'paragraph' }] } },
      },
    ],
  );
  const measuresOf = (body: string | null) =>
    (
      (JSON.parse(body ?? '{}') as { query?: { measures?: string[] } }).query?.measures ?? []
    ).join();
  // The count answers late, so its skeleton shows; the average fails.
  let release: () => void = () => undefined;
  const late = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/load', async (route) => {
    const measures = measuresOf(route.request().postData());
    if (measures === 'orders.count') {
      await late;
      await route.continue();
    } else if (measures === 'orders.average_amount') {
      await route.fulfill({ status: 400, json: { error: 'Cube said no' } });
    } else await route.continue();
  });

  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const text = page.locator('[data-tile="tile-text"] .text-tile');
  const skeleton = text.locator('.text-element-skeleton').first();
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute('style', /width: 4ch/);
  await expect(text).toHaveAttribute('aria-busy', 'true');
  // Each element where it stands in the sentence.
  const slot = (at: number) => text.locator('p > *').nth(at);
  release();
  await expect(slot(0)).toHaveText('240');
  await expect(text).not.toHaveAttribute('aria-busy', 'true', { timeout: 15_000 });

  // Refused by Cube: the warning icon, Unavailable, and Details on focus.
  await expect(slot(1)).toHaveText('Unavailable', { timeout: 20_000 });
  await expect(slot(1).locator('[data-icon="warn"]')).toHaveCount(1);
  await slot(1).focus();
  const details = page.getByRole('tooltip').filter({ visible: true });
  await expect(details).toHaveText('Details Average Amount: Cube said no');

  // Gone from the model: Unavailable, naming nothing.
  await expect(slot(2)).toHaveText('Unavailable');
  await expect(text).not.toContainText('no_such');
  await expect(slot(2).locator('[data-icon]')).toHaveCount(0);

  // The tile's ⋯ asks the failed one again.
  await page.unroute('**/api/load');
  await text.getByRole('button', { name: 'More for this text' }).click();
  await page.getByRole('menuitem', { name: 'Retry' }).click();
  await expect(slot(1)).toHaveText(/^\$?[\d,.]+$/, { timeout: 20_000 });

  // An empty Text tile draws nothing in view mode.
  await expect(page.locator('[data-tile="tile-empty"] .text-tile')).toHaveText('');

  // In edit mode: what needs fixing, its row marked; the empty tile's placeholder.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const tile = page.locator('[data-tile="tile-text"]');
  await expect(tile.getByTestId('text-needs-fixing')).toHaveText('1 element needs fixing');
  await expect(page.locator('[data-tile="tile-empty"]')).toContainText(
    'Type, or press / to insert a live value',
  );
  await tile.locator('.tile-head__kind').click();
  const rows = page
    .getByRole('complementary', { name: 'Edit sidebar' })
    .getByRole('list', { name: 'Elements' })
    .getByRole('button');
  await expect(rows.nth(2)).toHaveAttribute('data-state', 'needs-fixing');
  await expect(rows.nth(0)).not.toHaveAttribute('data-state', 'needs-fixing');
});

/**
 * AC-525, checkpoint 3: with a filter that leaves no rows, every live element
 * that reads a value — Value, Change, Icon, Sparkline and Bullet graph —
 * reads "—" and says "No data for these filters" in its tooltip.
 */
test('every live element under a filter that leaves no rows says “No data for these filters”', async ({
  page,
  request,
}) => {
  const none = [{ member: 'orders.status', operator: 'equals', values: ['no-such-status'] }];
  // A sum, which Cube answers with no value over no rows (a count answers 0, which is data).
  const measure = 'orders.total_amount';
  const kinds = [
    { type: 'value', attrs: { measure, filters: none } },
    { type: 'change', attrs: { measure, period: 'month', direction: 'higher', filters: none } },
    {
      type: 'icon',
      attrs: {
        measure,
        filters: none,
        rules: [{ op: '>=', value: 1, state: 'success', label: 'Some' }],
      },
    },
    { type: 'sparkline', attrs: { measure, granularity: 'month', filters: none } },
    { type: 'bulletGraph', attrs: { measure, filters: none } },
  ];
  const { id, title } = await dashboardWithText(request, [
    {
      type: 'paragraph',
      content: kinds.flatMap((element, at) =>
        at === 0 ? [element] : [{ type: 'text', text: ' · ' }, element],
      ),
    },
  ]);
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const text = page.locator('[data-tile="tile-text"] .text-tile');
  const read = text.locator('.text-element-read');
  await expect(read).toHaveCount(5, { timeout: 20_000 });
  // An Icon with no data reads "No rule matched" (T886), and says why in its tooltip.
  await expect(text).toHaveText('— · — · No rule matched · — · —');
  for (const [at, kind] of ['Value', 'Change', 'Icon', 'Sparkline', 'Bullet graph'].entries()) {
    await read.nth(at).focus();
    const tip = page.getByRole('tooltip').filter({ visible: true });
    await expect(tip).toContainText(`${kind} · Total Amount`);
    await expect(tip).toContainText('No data for these filters');
  }
});

/**
 * AC-525, checkpoint 3: an element whose member the viewer may not query —
 * Cube answers 403 — reads "Unavailable", with no icon, no Details, and
 * nothing naming the member or why; its neighbours draw.
 */
test('an element its viewer may not query reads “Unavailable”, naming nothing', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWithText(request, [
    {
      type: 'paragraph',
      content: [
        { type: 'value', attrs: { measure: 'orders.count' } },
        { type: 'text', text: ' and ' },
        // Its own filter, so it is asked apart from the count, not batched with it.
        {
          type: 'value',
          attrs: {
            measure: 'orders.average_amount',
            filters: [{ member: 'orders.status', operator: 'equals', values: ['shipped'] }],
          },
        },
      ],
    },
  ]);
  await page.route('**/api/load', async (route) => {
    const body = route.request().postData() ?? '';
    if (body.includes('orders.average_amount'))
      await route.fulfill({ status: 403, json: { error: 'Forbidden: orders.average_amount' } });
    else await route.continue();
  });
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const text = page.locator('[data-tile="tile-text"] .text-tile');
  await expect(text.locator('p')).toHaveText('240 and Unavailable', { timeout: 20_000 });
  const refused = text.locator('p > *').nth(1);
  await expect(refused.locator('[data-icon]')).toHaveCount(0);
  await expect(text).not.toContainText('average');
  // Nothing to focus for Details, and no tooltip naming it.
  await expect(refused).not.toHaveAttribute('tabindex', '0');
  await expect(page.getByRole('tooltip').filter({ hasText: 'Average' })).toHaveCount(0);
});

/**
 * AC-520 / AC-116, on the real surface: with nothing marked, a Value limited
 * by the marking reads all data, as one that isn't; marking a bar limits it
 * to the marked rows, the unlimited one keeping all data, and a Value whose
 * own filter is the same status reads the same; the Marking element counts
 * what's marked.
 */
test('a Value limited by a marking follows the marked rows, and its own filter is applied', async ({
  page,
  request,
}) => {
  const title = `Text marked ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: 'By status', ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'By status',
        owner: 'admin',
        localToDashboardId: dashboard.id,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
          chartType: 'bar',
        },
      },
    },
  });
  const value = (attrs: Record<string, unknown>) => ({
    type: 'value',
    attrs: { measure: 'orders.count', ...attrs },
  });
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
            items: [
              { id: 'tile-status', kind: 'chart', w: 6, h: 40, chartId: chart.id },
              {
                id: 'tile-text',
                kind: 'text',
                w: 6,
                h: 12,
                document: {
                  version: 1,
                  doc: {
                    type: 'doc',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          value({ marking: 'Picks' }),
                          { type: 'text', text: ' / ' },
                          value({}),
                          { type: 'text', text: ' / ' },
                          value({
                            filters: [
                              { member: 'orders.status', operator: 'equals', values: ['shipped'] },
                            ],
                          }),
                          { type: 'text', text: ' / ' },
                          { type: 'marking', attrs: { marking: 'Picks', show: 'count' } },
                          { type: 'text', text: ' / ' },
                          { type: 'marking', attrs: { marking: 'Picks', show: 'summary' } },
                        ],
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);

  await page.goto(`/explore/dashboards/${dashboard.id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const slot = (at: number) => page.locator('[data-tile="tile-text"] .text-tile p > *').nth(at);
  // Nothing marked: the limited Value reads all data (AC-116).
  await expect(slot(0)).toHaveText('240');
  await expect(slot(1)).toHaveText('240');
  const shipped = await slot(2).textContent();
  expect(Number(shipped)).toBeGreaterThan(0);
  expect(Number(shipped)).toBeLessThan(240);
  await expect(slot(3)).toHaveText('0');
  await expect(slot(4)).toHaveText('nothing marked');

  // Mark the shipped bar.
  const label = page.locator('[data-tile="tile-status"] svg text', { hasText: 'shipped' }).first();
  await expect(label).toBeVisible();
  let last = '';
  let box = { x: 0, y: 0, width: 0 };
  await expect
    .poll(async () => {
      box = await label.evaluate((text) => {
        const rect = text.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width };
      });
      const now = JSON.stringify(box);
      const settled = box.width > 0 && now === last;
      last = now;
      return settled;
    })
    .toBe(true);
  await page.mouse.click(box.x + box.width / 2, box.y - 10);
  await expect(page.getByTestId('mark-chip')).toContainText('shipped');

  // Over the marked rows: the shipped orders, as the own filter reads them.
  await expect(slot(0)).toHaveText(shipped ?? '');
  await expect(slot(1)).toHaveText('240');
  await expect(slot(3)).toHaveText('1');
  // Its summary names what's marked.
  await expect(slot(4)).toContainText('shipped');
});

/**
 * T877 / AC-514: a dashboard of two Text tiles opened in view mode requests
 * no script of the editor's chunk (`text-editor-…`, named in
 * `vite.config.ts`), and none of the scripts it loads holds ProseMirror's
 * code; double-clicking a tile in edit mode then requests the chunk.
 */
test('view mode loads no editor code, and editing a Text tile first loads it', async ({
  page,
  request,
}) => {
  const { id, title } = await dashboardWithText(
    request,
    [{ type: 'paragraph', content: [{ type: 'text', text: 'First text' }] }],
    [],
    [
      {
        id: 'tile-text-2',
        kind: 'text',
        w: 6,
        h: 24,
        document: {
          version: 1,
          doc: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second text' }] }],
          },
        },
      },
    ],
  );
  const scripts: { url: string; body: Promise<string> }[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') {
      scripts.push({ url: response.url(), body: response.text().catch(() => '') });
    }
  });
  const editorChunk = /\/assets\/text-editor-[\w-]+\.js$/;

  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.locator('[data-tile="tile-text"] .text-tile p')).toHaveText('First text');
  await expect(page.locator('[data-tile="tile-text-2"] .text-tile p')).toHaveText('Second text');
  await page.waitForLoadState('networkidle');

  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((script) => editorChunk.test(script.url))).toEqual([]);
  // ProseMirror's model, which only the editor imports, is in no loaded script.
  const bodies = await Promise.all(scripts.map((script) => script.body));
  expect(bodies.filter((body) => body.includes('Invalid content for node'))).toEqual([]);

  // Editing a Text tile is what first loads it.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('[data-tile="tile-text"] .text-tile p')).toHaveText('First text');
  expect(scripts.filter((script) => editorChunk.test(script.url))).toEqual([]);
  const loaded = page.waitForResponse((response) => editorChunk.test(response.url()));
  await page.locator('[data-tile="tile-text"] .text-tile').dblclick();
  await loaded;
  await expect(page.locator('[data-tile="tile-text"]').getByRole('textbox')).toBeFocused();
});

/**
 * T892 / AC-528: a Filter control is one of the dashboard's filters, not a
 * copy — the bar's widget at 28 px with its scope tag. Choosing France in it
 * shows in the bar's pill, the header's count and a tile in scope (60 of the
 * 240 orders are France's); clearing it in the bar clears it; a second Text
 * tile's control of the same filter agrees; deleting the filter leaves "1
 * element needs fixing" in edit mode.
 */
test('a Filter control is the bar’s filter: one value in both places, and a deleted filter’s control needs fixing', async ({
  page,
  request,
}) => {
  const control = { type: 'filterControl', attrs: { filter: 'f-country' } };
  const { id, title } = await dashboardWithText(
    request,
    [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Orders ' },
          { type: 'value', attrs: { measure: 'orders.count' } },
          { type: 'text', text: ' in ' },
          control,
        ],
      },
    ],
    [{ id: 'f-country', widget: 'list', member: 'customers.country' }],
    [
      {
        id: 'tile-text-2',
        kind: 'text',
        w: 6,
        h: 24,
        document: {
          version: 1,
          doc: { type: 'doc', content: [{ type: 'paragraph', content: [control] }] },
        },
      },
    ],
  );
  await page.goto(`/explore/dashboards/${id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-text"]');
  const mine = tile.getByTestId('filter-control-f-country');
  const other = page.locator('[data-tile="tile-text-2"]').getByTestId('filter-control-f-country');
  await expect(tile.locator('.text-value')).toHaveText('240');

  // The bar's widget, compact, with its scope tag.
  await expect(mine).toBeVisible();
  expect((await mine.boundingBox())?.height).toBe(28);
  await expect(mine.getByTestId('scope-badge')).toHaveText('Dashboard');
  await expect(mine.getByRole('button', { expanded: false })).toContainText('All');

  // Chosen in the control: in the tile in scope, the other control, the header's count and the bar.
  await mine.getByRole('button', { expanded: false }).click();
  await mine.getByRole('button', { name: 'France', exact: true }).click();
  await expect(tile.locator('.text-value')).toHaveText('60');
  await expect(mine.getByRole('button', { expanded: true })).toContainText('France');
  await expect(other.getByRole('button', { expanded: false })).toContainText('France');
  await expect(headerToggle(page).locator('.header-toggle__count')).toHaveText('1');
  await page.keyboard.press('Escape');
  await openHeaderSheet(page);
  const bar = page.getByTestId('filter-f-country');
  await expect(bar.getByRole('button', { expanded: false })).toContainText('France');

  // Cleared in the bar: cleared in both controls, every order back.
  await bar.getByRole('button', { name: /^Clear / }).click();
  await expect(mine.getByRole('button', { expanded: false })).toContainText('All');
  await expect(other.getByRole('button', { expanded: false })).toContainText('All');
  await expect(tile.locator('.text-value')).toHaveText('240');

  // The filter deleted while editing: each control needs fixing, and filters nothing.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByTestId('filter-f-country').getByRole('button', { expanded: false }).click();
  await page
    .getByRole('tabpanel', { name: 'Properties' })
    .getByRole('button', { name: 'Remove List with search filter 1' })
    .click();
  await expect(tile.getByTestId('text-needs-fixing')).toHaveText('1 element needs fixing');
  await expect(tile.getByTestId('filter-control-f-country')).toHaveCount(0);
});

/**
 * T894 / AC-530: an Action button runs its declared actions in order and
 * nothing else — Export downloads the chosen tile's CSV as its ⋯ does
 * (AC-171), under the filters in effect; Reset filters then Go to page tab
 * Detail clears the filter and opens Detail.
 */
test('an Action button runs its declared actions in order: Export a tile’s CSV, Reset filters, Go to page tab', async ({
  page,
  request,
}) => {
  const title = `Text ${String(Date.now())}-${String(Math.round(Math.random() * 1e6))}`;
  const dashboard = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'dashboard', title, ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const chart = (await (
    await request.post(`${API}/documents`, {
      data: { kind: 'chart', title: 'Orders by status', ...IN_MY_WORKSPACE },
    })
  ).json()) as { id: string };
  const wrote = await request.put(`${API}/documents/chart/${chart.id}`, {
    data: {
      version: 1,
      body: {
        schemaVersion: 1,
        title: 'Orders by status',
        owner: 'admin',
        localToDashboardId: dashboard.id,
        chart: {
          source: { cube: 'orders' },
          wells: { measures: ['orders.count'], dimensions: ['orders.status'], timeDimensions: [] },
          chartType: 'bar',
        },
      },
    },
  });
  expect(wrote.ok(), await wrote.text()).toBe(true);
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
        filters: [{ id: 'f-status', widget: 'list', member: 'orders.status' }],
        pages: [
          {
            id: 'only',
            title: 'Overview',
            items: [
              {
                id: 'tile-text',
                kind: 'text',
                w: 6,
                h: 24,
                document: {
                  version: 1,
                  doc: {
                    type: 'doc',
                    content: [
                      {
                        type: 'paragraph',
                        content: [
                          { type: 'text', text: 'Orders ' },
                          { type: 'value', attrs: { measure: 'orders.count' } },
                          { type: 'text', text: ' ' },
                          {
                            type: 'actionButton',
                            attrs: {
                              label: 'Export data',
                              actions: [{ kind: 'export', tiles: ['tile-chart'] }],
                            },
                          },
                          { type: 'text', text: ' ' },
                          {
                            type: 'actionButton',
                            attrs: {
                              label: 'Go to Detail',
                              style: 'primary',
                              actions: [{ kind: 'resetFilters' }, { kind: 'page', page: 'detail' }],
                            },
                          },
                        ],
                      },
                    ],
                  },
                },
              },
              { id: 'tile-chart', kind: 'chart', w: 6, h: 40, chartId: chart.id },
            ],
          },
          { id: 'detail', title: 'Detail', items: [] },
        ],
      },
    },
  });
  expect(placed.ok(), await placed.text()).toBe(true);

  await page.goto(`/explore/dashboards/${dashboard.id}`);
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  const tile = page.locator('[data-tile="tile-text"]');
  await expect(tile.locator('.text-value')).toHaveText('240');
  const go = tile.getByRole('button', { name: 'Go to Detail' });
  // The Link/button tile's Primary, at 32 px.
  expect((await go.boundingBox())?.height).toBe(32);

  // Shipped only: 80 orders.
  await openHeaderSheet(page);
  const pill = page.getByTestId('filter-f-status');
  await pill.getByRole('button', { expanded: false }).click();
  await pill.getByRole('button', { name: 'shipped', exact: true }).click();
  await expect(tile.locator('.text-value')).toHaveText('80');
  await page.keyboard.press('Escape');

  // Export: the chart tile's CSV, as its ⋯ writes it, under the filter.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    tile.getByRole('button', { name: 'Export data' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Orders by status.csv');
  const file = await readFile(await download.path(), 'utf8');
  expect(file.startsWith('﻿')).toBe(true);
  expect(file).toContain('shipped');
  expect(file).not.toContain('completed');

  // Reset filters, then Go to page tab Detail.
  await go.click();
  await expect(
    page.locator('.dashboard__header').getByRole('tab', { name: 'Detail', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(headerToggle(page).locator('.header-toggle__count')).toHaveCount(0);
  await page
    .locator('.dashboard__header')
    .getByRole('tab', { name: 'Overview', exact: true })
    .click();
  await expect(tile.locator('.text-value')).toHaveText('240');
});
