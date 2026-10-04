import { expect, test, type Page } from '@playwright/test';

import { myModelCopy } from './workspace';

/**
 * T600 (AC-420; R58, the user: "can you add functionality to see join diagram
 * and yaml in a bigger model screen... you should be able to popout into
 * modal and closing should pop back into place.."): the model file's right
 * pane pops out into a larger dialog and back, the same editor moved, so its
 * text and undo history are what they were. Nothing is saved.
 */
const MARK_IN = '# typed in place';
const MARK_OUT = '# typed while popped out';

/**
 * The single user's copy of the seed's orders.yml in My workspace, where a
 * shared model is edited with sign-in off now (T451's switch; AC-254, R52).
 */
const ordersCopy = (page: Page) => myModelCopy(page.request, 'cubes/orders.yml');

test('the YAML pops out larger, keeps what was typed, and goes back into place with its undo', async ({
  page,
}) => {
  await page.goto((await ordersCopy(page)).href);
  const pane = page.getByRole('region', { name: 'YAML and join diagram' });
  const code = page.locator('.cm-content');
  await expect(code).toBeVisible();
  const inPlace = (await pane.boundingBox())!;

  // Typed in place, at the file's end.
  await code.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(`\n${MARK_IN}`);

  await pane.getByRole('button', { name: 'Pop out' }).click();
  const dialog = page.getByRole('dialog', { name: /YAML and join diagram$/ });
  await expect(dialog).toBeVisible();
  // Larger than the pane it came from, both ways: the window less its margin.
  const popped = (await dialog.boundingBox())!;
  expect(popped.width).toBeGreaterThan(inPlace.width);
  expect(popped.height).toBeGreaterThan(inPlace.height);
  const viewport = page.viewportSize()!;
  expect(Math.round(popped.y)).toBe(12);
  expect(Math.round(popped.height)).toBe(viewport.height - 24);
  expect(Math.round(popped.width)).toBe(Math.min(1600, viewport.width - 24));
  // The same text, scrolled where it was (its end), and typing goes on there.
  const poppedCode = dialog.locator('.cm-content');
  await expect(poppedCode).toContainText(MARK_IN);
  await expect(dialog.getByText(MARK_IN)).toBeInViewport();
  await poppedCode.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(`\n${MARK_OUT}`);

  // Esc puts it back, with both, and focus on the control that popped it out.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(pane.locator('.cm-content')).toContainText(MARK_IN);
  await expect(pane.locator('.cm-content')).toContainText(MARK_OUT);
  await expect(pane.getByText(MARK_OUT)).toBeInViewport();
  await expect(pane.getByRole('button', { name: 'Pop out' })).toBeFocused();

  // Its undo history came back with it: what was typed out there undoes.
  await pane.locator('.cm-content').click();
  for (let step = 0; step < 4; step += 1) await page.keyboard.press('ControlOrMeta+Z');
  await expect(pane.locator('.cm-content')).not.toContainText(MARK_OUT);
});

test('a question the page asks puts the popped-out pane back first, the question in reach', async ({
  page,
}) => {
  // Opened from its folder's overview in the app, so Back stays in the app.
  const copy = await ordersCopy(page);
  await page.goto(`/explore/folders/${encodeURIComponent(copy.folderId)}/models`);
  const ordersRow = page
    .getByRole('navigation', { name: 'Model files' })
    .getByRole('link', { name: /^orders\.yml/ });
  await expect(ordersRow).toBeVisible();
  await ordersRow.click();
  await expect(page).toHaveURL(/cubes%2Forders\.yml$/);
  const pane = page.getByRole('region', { name: 'YAML and join diagram' });
  await expect(pane.locator('.cm-content')).toContainText('name: orders');
  await pane.getByRole('button', { name: 'Pop out' }).click();
  const dialog = page.getByRole('dialog', { name: /YAML and join diagram$/ });
  await dialog.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(`\n${MARK_OUT}`);

  // Leaving with that unpublished: the page asks beside the form, so the pane
  // comes back first, and the question has the focus (AC-226's question).
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Leave with unpublished changes?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stay', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Stay', exact: true }).click();
  await expect(pane.locator('.cm-content')).toContainText(MARK_OUT);
});

test('the join diagram pops out, and its Close puts it back', async ({ page }) => {
  await page.goto('/model/files/cubes%2Forders.yml');
  const pane = page.getByRole('region', { name: 'YAML and join diagram' });
  await expect(page.locator('.cm-content')).toBeVisible();
  await pane.getByRole('button', { name: 'Join diagram' }).click();
  await expect(pane.getByRole('img', { name: /^Join diagram/ })).toBeVisible();

  await pane.getByRole('button', { name: 'Pop out' }).click();
  const dialog = page.getByRole('dialog', { name: /YAML and join diagram$/ });
  await expect(dialog.getByRole('img', { name: /^Join diagram/ })).toBeVisible();
  // The switch went with it: the YAML is a press away in the dialog too.
  await expect(dialog.getByRole('button', { name: 'YAML', exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(pane.getByRole('img', { name: /^Join diagram/ })).toBeVisible();
  await expect(pane.getByRole('button', { name: 'Pop out' })).toBeFocused();
});
