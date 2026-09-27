import { expect, test } from '@playwright/test';

/**
 * The Model workspace drawn as phase-1 design 03
 * (`docs/design/reviews/2026-09-24/designs/03-model-workspace.html`), which
 * R34 approves for it, and the 2026-09-27 critique of it
 * (`docs/design/critiques/2026-09-27-model-workspace.md`). Measured at the
 * design's 1,440 × 900.
 */

test.use({ viewport: { width: 1440, height: 900 } });

const ORDERS = '/model/files/cubes%2Forders.yml';

test('T470: the form is flat in its pane, 676 : 524 beside the code, and every tab fits (UX-074, UX-077)', async ({
  page,
}) => {
  await page.goto(ORDERS);
  const form = page.getByRole('region', { name: 'Cube orders' });
  const tabs = form.getByRole('tablist');
  await expect(tabs.getByRole('tab')).toHaveText([
    'General',
    /^Dimensions \d+$/,
    /^Measures \d+$/,
    /^Joins \d+$/,
    /^Segments \d+$/,
    /^Hierarchies \d+$/,
    /^Pre-aggs \d+$/,
    /^Access \d+$/,
  ]);

  // Design 03's columns: the tree, then the form a little wider than the code.
  const [formPane, codePane] = await Promise.all([
    page.getByRole('region', { name: 'Form editor' }).boundingBox(),
    page.getByRole('region', { name: 'YAML and join diagram' }).boundingBox(),
  ]);
  expect(Math.round(formPane?.width ?? 0)).toBe(676);
  expect(Math.round(codePane?.width ?? 0)).toBe(524);

  // Flat on the pane (note 9): no card, and the strip the pane's full width.
  const card = await form.evaluate((node) => {
    const style = getComputedStyle(node);
    return { border: style.borderTopWidth, radius: style.borderTopLeftRadius };
  });
  expect(card).toEqual({ border: '0px', radius: '0px' });
  const strip = await tabs.evaluate((node) => ({
    scroll: node.scrollWidth,
    client: node.clientWidth,
  }));
  expect(strip.scroll).toBeLessThanOrEqual(strip.client);
  expect(Math.round((await tabs.boundingBox())?.width ?? 0)).toBe(676);
  const [strip0, last] = [
    await tabs.boundingBox(),
    await tabs.getByRole('tab').last().boundingBox(),
  ];
  // With room to spare for what real cubes carry: two counts of two digits
  // (7 px each) and the refused mark (15 px) still fit (T470's review).
  expect(
    (strip0?.x ?? 0) + (strip0?.width ?? 0) - ((last?.x ?? Infinity) + (last?.width ?? 0)),
  ).toBeGreaterThanOrEqual(29);

  // Only the panel scrolls: the tabs stay put, and no scrollbar takes their width.
  const panel = form.getByRole('tabpanel');
  await form.getByRole('tab', { name: /^General/ }).click();
  expect(await panel.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await panel.evaluate((node) => {
    node.scrollTop = 200;
  });
  expect(await panel.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expect(Math.round((await tabs.boundingBox())?.y ?? 0)).toBe(Math.round(strip0?.y ?? 0));

  // Counts in a muted weight beside a 12/600 label (note 3).
  const count = tabs.getByRole('tab', { name: /^Dimensions/ }).locator('.model-form__count');
  expect(await count.evaluate((node) => getComputedStyle(node).fontWeight)).toBe('400');
  expect(
    await tabs
      .getByRole('tab', { name: /^Dimensions/ })
      .evaluate((node) => [getComputedStyle(node).fontSize, getComputedStyle(node).fontWeight]),
  ).toEqual(['12px', '600']);
});

test('T470: a bar over the form is a band across the pane, and a view’s tabs are short too', async ({
  page,
}) => {
  await page.goto(ORDERS);
  const form = page.getByRole('region', { name: 'Cube orders' });
  await form.getByRole('tab', { name: /^Dimensions/ }).click();
  await form.locator('.model-member__name', { hasText: /^id$/ }).click();
  await form
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^id$/ }) })
    .locator('[data-key="public"]')
    .getByLabel('Public', { exact: true })
    .selectOption('');
  // The just-in-time loss warning (AC-134), as design 03's .warnbar: the
  // pane's full width, square, ruled beneath, and above the tabs in view.
  const bar = page.getByRole('alert').filter({ hasText: 'This edit would drop' });
  const pane = await page.getByRole('region', { name: 'Form editor' }).boundingBox();
  const drawn = await bar.boundingBox();
  expect(Math.round(drawn?.width ?? 0)).toBe(Math.round(pane?.width ?? 0));
  expect(
    await bar.evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.borderTopLeftRadius, style.borderBottomWidth, style.marginTop];
    }),
  ).toEqual(['0px', '1px', '0px']);
  expect((drawn?.y ?? Infinity) + (drawn?.height ?? 0)).toBeLessThanOrEqual(
    (await form.getByRole('tablist').boundingBox())?.y ?? 0,
  );
  await bar.getByRole('button', { name: 'Keep the file' }).click();

  // A view's Access policy tab is "Access" as a cube's is.
  await page.goto('/model/files/views%2Fsecured_orders.yml');
  const view = page.getByRole('region', { name: 'View secured_orders' });
  await expect(view.getByRole('tab', { name: /^Access/ })).toHaveText(/^Access \d+$/);
  await expect(view.getByRole('tab', { name: /^Access/ })).toHaveAttribute(
    'title',
    'Access policy',
  );
});
