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

test('T479: the tree as design 03 note 1 — a Model head, folder rows, full-width files, tags, actions after (MW-02, MW-03)', async ({
  page,
}) => {
  await page.goto(ORDERS);
  const tree = page.getByRole('navigation', { name: 'Model files' });
  const box = await tree.boundingBox();

  // A 44 px head: "Model", and the model's state.
  const head = tree.locator('.model-tree__head');
  expect(Math.round((await head.boundingBox())?.height ?? 0)).toBe(44);
  await expect(head.getByRole('heading', { level: 2 })).toHaveText('Model');
  await expect(head.locator('.model-tree__state')).toHaveText('All published');
  await expect(head.locator('.model-tree__state svg')).toHaveAttribute('data-icon', 'ok');

  // Folder rows: 28 px, 12/600 mono, under model/, folding their files.
  const cubes = tree.getByRole('button', { name: 'model/cubes/' });
  await expect(cubes).toHaveAttribute('aria-expanded', 'true');
  expect(Math.round((await cubes.boundingBox())?.height ?? 0)).toBe(28);
  expect(
    await cubes.evaluate((node) => {
      const style = getComputedStyle(node);
      // Safari writes the face unquoted.
      return [style.fontSize, style.fontWeight, style.fontFamily.split(',')[0]?.replace(/"/g, '')];
    }),
  ).toEqual(['12px', '600', 'IBM Plex Mono']);
  const views = tree.getByRole('button', { name: 'model/views/' });
  await views.click();
  await expect(tree.getByRole('link', { name: /^order_summary\.yml/ })).toBeHidden();
  await views.click();
  await expect(tree.getByRole('link', { name: /^order_summary\.yml/ })).toBeVisible();

  // Files: 28 px rows across the pane's full width, indented 28, the open
  // one accent-soft edge to edge.
  const current = tree.getByRole('link', { name: /^orders\.yml/ });
  const row = await current.boundingBox();
  expect(Math.round(row?.height ?? 0)).toBe(28);
  expect(Math.round(row?.x ?? -1)).toBe(Math.round(box?.x ?? 0));
  // The pane's width, less its 1 px rule on the right.
  expect(Math.round(row?.width ?? 0)).toBe(Math.round((box?.width ?? 0) - 1));
  expect(
    await current.evaluate((node) => [
      getComputedStyle(node).paddingLeft,
      getComputedStyle(node).borderTopLeftRadius,
    ]),
  ).toEqual(['28px', '0px']);
  // Focused after the keyboard was last used — as the page focuses it on
  // arrival — its ring drawn inside the row, as its state (MW-04). Safari
  // doesn't Tab to links, so the focus is put there after a key press.
  // Firefox takes `focusVisible` for it; Chrome and Safari go by the key press.
  await page.keyboard.press('Escape');
  await current.evaluate((node) => {
    (node as HTMLElement).focus({ focusVisible: true } as FocusOptions);
  });
  await expect(current).toBeFocused();
  expect(
    await current.evaluate((node) => [
      node.matches(':focus-visible'),
      getComputedStyle(node).outlineOffset,
      getComputedStyle(node).outlineStyle,
    ]),
  ).toEqual([true, '-2px', 'solid']);

  // All published, in the status colour (design 03's .status.ok; T479's review).
  expect(
    await head.locator('.model-tree__state').evaluate((node) => {
      const probe = document.createElement('span');
      probe.style.color = 'var(--wc-status-success)';
      document.body.append(probe);
      const success = getComputedStyle(probe).color;
      probe.remove();
      return getComputedStyle(node).color === success;
    }),
  ).toBe(true);

  // A template the form can't open is tagged, read-only — said, not only hovered.
  const jinja = tree
    .getByRole('link', { name: /^templated_example\.yml/ })
    .locator('.model-tree__kind');
  await expect(jinja).toHaveText('Jinja, read-only');
  await expect(jinja).toHaveAttribute('title', 'Jinja template · read-only here');

  // New cube, New view and Generate cubes after the files, not over them.
  const actions = tree.locator('.model-tree__actions');
  await expect(actions.getByRole('button')).toHaveText([
    '+ New cube',
    '+ New view',
    '+ Generate cubes',
  ]);
  // Each set left, as design 03 draws them: its words start at its padding.
  const inset = await actions
    .getByRole('button')
    .first()
    .evaluate((node) => {
      const words = document.createRange();
      words.selectNodeContents(node);
      return Math.round(words.getBoundingClientRect().left - node.getBoundingClientRect().left);
    });
  expect(inset).toBeLessThanOrEqual(12);
  // "+ New cube", the space after "+" kept in a flex box.
  expect(
    await actions
      .getByRole('button')
      .first()
      .evaluate((node) => {
        const [plus, words] = [node.querySelector('span'), document.createRange()];
        words.setStartAfter(plus as Node);
        words.setEndAfter(node.lastChild as Node);
        return Math.round(
          words.getBoundingClientRect().left - (plus?.getBoundingClientRect().right ?? 0),
        );
      }),
  ).toBeGreaterThanOrEqual(3);
  expect((await actions.boundingBox())?.y ?? 0).toBeGreaterThan(
    (await tree.getByRole('link', { name: /^secured_orders\.yml/ }).boundingBox())?.y ?? Infinity,
  );
});

test('T479: the editor head as design 03 note 2 — 44 px, a 13/600 path, its state, Discard and Save (MW-05)', async ({
  page,
}) => {
  await page.goto(ORDERS);
  const head = page.getByRole('region', { name: 'Form editor' }).locator('.model-editor__head');
  expect(Math.round((await head.boundingBox())?.height ?? 0)).toBe(44);
  const path = head.getByTestId('selected-object');
  await expect(path).toHaveText('cubes/orders.yml');
  expect(
    await path.evaluate((node) => {
      const style = getComputedStyle(node);
      // Safari writes the face unquoted.
      return [style.fontSize, style.fontWeight, style.fontFamily.split(',')[0]?.replace(/"/g, '')];
    }),
  ).toEqual(['13px', '600', 'IBM Plex Mono']);

  // At rest: published, and both actions there but disabled (D2).
  const state = head.locator('.model-editor__state');
  await expect(state).toHaveText('Published · no changes');
  await expect(state.locator('svg')).toHaveAttribute('data-icon', 'ok');
  await expect(head.getByRole('button', { name: 'Discard' })).toBeDisabled();
  await expect(head.getByRole('button', { name: 'Save & reload Cube' })).toBeDisabled();
  await expect(head.getByRole('button')).toHaveText(['Discard', 'Save & reload Cube']);

  // Edited: unpublished, and both enabled.
  await page
    .getByRole('region', { name: 'Cube orders' })
    .getByLabel('Title', { exact: true })
    .fill('Orders!');
  await expect(state).toHaveText('Unpublished changes');
  await expect(state.locator('svg')).toHaveAttribute('data-icon', 'idle');
  await expect(head.getByRole('button', { name: 'Discard' })).toBeEnabled();
  await expect(head.getByRole('button', { name: 'Save & reload Cube' })).toBeEnabled();
  await head.getByRole('button', { name: 'Discard' }).click();
  await expect(state).toHaveText('Published · no changes');

  // A file made here says it is new, with the clock, not the tick; discarded,
  // it goes, and the overview opens.
  await page
    .getByRole('navigation', { name: 'Model files' })
    .getByRole('button', { name: 'New cube' })
    .click();
  await expect(page).toHaveURL(/new_cube_1\.yml$/);
  await expect(head.locator('.model-editor__state')).toHaveText('New file · not published');
  await expect(head.locator('.model-editor__state svg')).toHaveAttribute('data-icon', 'idle');
  await head.getByRole('button', { name: 'Discard' }).click();
  await expect(page).toHaveURL(/\/model$/);
});

test('T480: members as rows that read like the YAML, opening into a short grouped form (MW-09, MW-10, MW-12)', async ({
  page,
}) => {
  await page.goto(ORDERS);
  const form = page.getByRole('region', { name: 'Cube orders' });
  await form.getByRole('tab', { name: /^Dimensions/ }).click();
  const list = form.getByRole('list', { name: 'Dimensions' });
  const status = list.getByRole('listitem').filter({
    has: page.locator('.model-member__name', { hasText: /^status$/ }),
  });

  // The name in the code face at 600; a badge a 12 px tag, square (D5, UX-119).
  const id = list.getByRole('listitem').filter({
    has: page.locator('.model-member__name', { hasText: /^id$/ }),
  });
  expect(
    await id.locator('.model-member__name').evaluate((node) => {
      const style = getComputedStyle(node);
      return [style.fontFamily.split(',')[0]?.replace(/"/g, ''), style.fontWeight];
    }),
  ).toEqual(['IBM Plex Mono', '600']);
  expect(
    await id
      .locator('.model-member__badge')
      .first()
      .evaluate((node) => [
        getComputedStyle(node).fontSize,
        getComputedStyle(node).borderTopLeftRadius,
      ]),
  ).toEqual(['12px', '3px']);

  // A row under a rule, not a box, flush to the pane; no Remove on it.
  const drawn = await status.evaluate((node) => {
    const member = node.querySelector('.model-member') as HTMLElement;
    return {
      rule: getComputedStyle(node).borderBottomWidth,
      box: getComputedStyle(member).borderTopWidth,
      buttons: node.querySelectorAll(':scope > button').length,
    };
  });
  expect(drawn).toEqual({ rule: '1px', box: '0px', buttons: 0 });
  const pane = await page.getByRole('region', { name: 'Form editor' }).boundingBox();
  const row = await status.boundingBox();
  expect(Math.round(row?.x ?? 0)).toBe(Math.round(pane?.x ?? -1));
  // The SQL on a line of its own, under the name; the type at the row's right.
  const [name, sql, type] = await Promise.all([
    status.locator('.model-member__name').boundingBox(),
    status.locator('.model-member__sql').boundingBox(),
    status.locator('.model-member__type').boundingBox(),
  ]);
  expect(sql?.y ?? 0).toBeGreaterThanOrEqual((name?.y ?? 0) + (name?.height ?? 0));
  expect(Math.round((type?.x ?? 0) + (type?.width ?? 0))).toBe(
    Math.round((row?.x ?? 0) + (row?.width ?? 0) - 12),
  );
  // "+ dimension · 3 total" closes the list.
  await expect(
    form.locator('.model-form__lock > .model-members-block > .model-members__foot'),
  ).toHaveText('+ dimension3 total');

  // Open: Basics on the subtle ground, 28 px controls, the switch, Remove at its foot.
  await status.locator('.model-member > summary').first().click();
  const body = status.locator('.model-member > .model-form__fields');
  expect(await body.evaluate((node) => getComputedStyle(node).paddingLeft)).toBe('40px');
  await expect(status.getByRole('group', { name: 'Basics' })).toBeVisible();
  const title = status.getByLabel('Title', { exact: true });
  expect(Math.round((await title.boundingBox())?.height ?? 0)).toBe(28);
  expect(await title.evaluate((node) => getComputedStyle(node).fontSize)).toBe('12px');
  // On the subtle ground (design 03's .mrow-body).
  expect(
    await body.evaluate((node) => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = 'var(--wc-bg-subtle)';
      document.body.append(probe);
      const subtle = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return getComputedStyle(node).backgroundColor === subtle;
    }),
  ).toBe(true);
  // Title | Format, Description the full width, then Public | Primary key (T480's review).
  const [titleBox, formatBox, descriptionBox, publicBox, keyBox] = await Promise.all(
    ['title', 'format', 'description', 'public', 'primary_key'].map((key) =>
      status
        .locator(`.model-member > .model-form__fields [data-key="${key}"]`)
        .first()
        .boundingBox(),
    ),
  );
  expect(Math.round(formatBox?.y ?? 0)).toBe(Math.round(titleBox?.y ?? -1));
  expect(Math.round(descriptionBox?.width ?? 0)).toBeGreaterThan(
    Math.round((titleBox?.width ?? 0) * 1.9),
  );
  expect(Math.round(keyBox?.y ?? 0)).toBe(Math.round(publicBox?.y ?? -1));
  expect(keyBox?.x ?? 0).toBeGreaterThan(publicBox?.x ?? Infinity);
  await expect(status.getByRole('switch', { name: 'Public' })).toBeChecked();
  // On one line, as design 03's .inline: the label, Cube's default, the switch.
  const publicRow = status.locator('[data-key="public"]');
  expect(Math.round((await publicRow.boundingBox())?.height ?? 0)).toBe(28);
  expect(
    Math.round(
      ((await status.getByRole('switch', { name: 'Public' }).boundingBox())?.y ?? 0) -
        ((await publicRow.locator('label').boundingBox())?.y ?? 0),
    ),
  ).toBeLessThanOrEqual(4);
  await expect(status.locator('[data-key="public"] .model-field__default')).toHaveText(
    '· default on',
  );
  await expect(status.locator('.model-form__advanced')).not.toHaveAttribute('open', '');
  await expect(status.getByRole('button', { name: 'Remove dimension status' })).toBeVisible();

  // A join says its relationship where a type goes.
  await form.getByRole('tab', { name: /^Joins/ }).click();
  await expect(
    form.getByRole('list', { name: 'Joins' }).locator('.model-member__type').first(),
  ).toHaveText('many to one');
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
    .getByRole('switch', { name: 'Public' })
    .click();
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
