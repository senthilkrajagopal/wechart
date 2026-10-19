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
async function dashboardWithText(request: APIRequestContext, content: unknown[]) {
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
            items: [
              {
                id: 'tile-text',
                kind: 'text',
                w: 6,
                h: 24,
                document: { version: 1, doc: { type: 'doc', content } },
              },
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
  await expect(change).toHaveText(/^(▲|▼) \d+\.\d%$|^0\.0%$/);
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
  await expect(change).toHaveText(/^((▲|▼) )?\$\d+(\.\d)?[KMB]?$/);

  // One Undo takes the whole edit back.
  await toolbar(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(change).toHaveText(/^(▲|▼) \d+\.\d%$|^0\.0%$/);
});
