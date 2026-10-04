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
  // A panel longer than the pane: every dimension open (General, grouped since
  // T481, fits).
  const panel = form.getByRole('tabpanel');
  await form.getByRole('tab', { name: /^Dimensions/ }).click();
  for (const summary of await panel.locator('details.model-member > summary').all())
    await summary.click();
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
    // As designs 11 and 12 name it (T485).
    '+ Generate from a data source…',
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
  // Then its ⋯, holding Delete *file*… (T526; design 14, D1).
  await expect(head.getByRole('button')).toHaveText(['Discard', 'Save & reload Cube', '⋯']);

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

test('T485: Generate cubes docks 480 px beside the model, and stays docked as a clashing file opens (design 11)', async ({
  page,
}) => {
  await page.goto('/model');
  const tree = page.getByRole('navigation', { name: 'Model files' });
  const opener = tree.getByRole('button', { name: 'Generate from a data source…' });
  await opener.click();
  await expect(opener).toHaveClass(/\bis-open\b/);
  const pane = page.getByRole('dialog', { name: 'Generate cubes' });
  // Docked, not a modal: the tree and the overview stay in view beside it (pins 1, 10).
  const box = await pane.boundingBox();
  expect([Math.round(box?.x ?? 0), Math.round(box?.width ?? 0)]).toEqual([960, 480]);
  await expect(page.getByRole('heading', { level: 1, name: 'Model' })).toBeVisible();
  const title = pane.getByRole('heading', { level: 2, name: 'Generate cubes' });
  await expect(title).toBeFocused();
  // Pressed again while open, it takes you to the pane (T485's review).
  await opener.focus();
  await opener.press('Enter');
  await expect(title).toBeFocused();
  // The steps as design 01's rail, and the same foot at every step (pins 2, 8).
  await expect(pane.getByRole('list', { name: 'Steps' }).getByRole('listitem')).toHaveText([
    '1Source',
    '2Tables',
    '3Review',
  ]);
  const foot = pane.locator('.source-pane__foot');
  const footAt = async () => Math.round((await foot.boundingBox())?.y ?? 0);
  const first = await footAt();

  await pane.getByRole('radio', { name: 'public', exact: true }).check();
  await pane.getByRole('button', { name: 'Next: Tables' }).click();
  await pane.getByRole('searchbox', { name: 'Search tables' }).fill('orders');
  await pane
    .getByRole('table', { name: 'Tables in public' })
    .getByRole('checkbox', { name: 'orders', exact: true })
    .check();
  expect(await footAt()).toBe(first);
  await pane.getByRole('button', { name: 'Generate 1 cube' }).click();
  const orders = pane.getByRole('region', { name: 'cubes/orders.yml' });
  await expect(orders.locator('.generate-pane__status')).toHaveText('Clashes');
  expect(await footAt()).toBe(first);

  // Open the file it clashes with: another page, and the pane stays, as it was (pin 17).
  await orders.getByRole('button', { name: 'Open cubes/orders.yml' }).click();
  await expect(page).toHaveURL(/\/model\/files\/cubes%2Forders\.yml$/);
  await expect(pane.getByRole('region', { name: 'cubes/orders.yml' })).toBeVisible();
  // On a file's page it takes the code's place, and the form widens (state Q).
  await expect(page.getByRole('region', { name: 'YAML and join diagram' })).toBeHidden();
  expect(
    Math.round((await page.getByRole('region', { name: 'Form editor' }).boundingBox())?.width ?? 0),
  ).toBe(720);

  // Leaving with it generated asks first; Discard closes it, focus back on its opener (pin 11).
  await pane.getByRole('button', { name: 'Close' }).click();
  const question = pane.getByRole('alertdialog', { name: 'Discard this generation?' });
  await expect(question).toContainText('The 1 generated cube isn’t added.');
  await question.getByRole('button', { name: 'Discard' }).click();
  await expect(pane).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.getByRole('region', { name: 'YAML and join diagram' })).toBeVisible();
});

test('T482: a file’s comment said upfront and shown in the YAML, the open member tinted, Wrap on, Problems flush (design 03 notes 4, 8, 9)', async ({
  page,
}) => {
  await page.goto(ORDERS);
  const form = page.getByRole('region', { name: 'Cube orders' });
  const yaml = page.getByRole('textbox', { name: 'cubes/orders.yml, as YAML' });
  const editor = page.locator('.model-editor__yaml .yaml-editor');
  await expect(yaml).toContainText('name: orders');

  // Said before any edit, under the tabs, naming it by its lines and first words (note 4).
  const bar = form.getByRole('note').filter({ hasText: 'This file has' });
  await expect(bar).toHaveText(
    'This file has 1 comment (YAML lines 19–22, “Cube hides primary keys from metadata unless told …”). ' +
      'The form keeps it, and asks first before an edit that would take away the key it is written on; ' +
      'the YAML keeps everything.Show in YAMLHide',
  );
  const tabsBottom = await form
    .getByRole('tablist')
    .boundingBox()
    .then((box) => (box?.y ?? 0) + (box?.height ?? 0));
  expect(Math.round((await bar.boundingBox())?.y ?? 0)).toBe(Math.round(tabsBottom));
  // Flagged in the gutter, by its first line (note 9).
  const flagged = editor.locator('.cm-lineNumbers .cm-gutterElement.yaml-editor__flag');
  await expect(flagged).toHaveText(['19']);
  // The warning glyph in the number's cell, left of the number, "!" in its triangle.
  expect(
    await flagged.evaluate((cell) => {
      const glyph = getComputedStyle(cell, '::before');
      return [glyph.content, glyph.left, Math.round(cell.getBoundingClientRect().width)];
    }),
  ).toEqual(['"!"', '3px', 40]);
  await expect(editor.locator('.cm-line.yaml-editor__noted')).toHaveCount(0);
  // The code flush in its pane, unframed, at 12/16 (MW-15).
  expect(
    await editor.locator('.cm-editor').evaluate((element) => {
      const style = getComputedStyle(element);
      const line = getComputedStyle(element.querySelector('.cm-line') as Element);
      return [style.borderTopWidth, style.borderRadius, line.fontSize, line.lineHeight];
    }),
  ).toEqual(['0px', '0px', '12px', '16px']);
  const code = await editor.boundingBox();
  // The pane's own head row, in the element that pops out with it (T600).
  const head = await page
    .getByRole('region', { name: 'YAML and join diagram' })
    .locator('.model-editor__popped > .model-editor__head')
    .boundingBox();
  expect([Math.round(code?.x ?? 0), Math.round(code?.width ?? 0)]).toEqual([
    Math.round(head?.x ?? 0),
    Math.round(head?.width ?? 0),
  ]);

  // Soft wrap on (note 8): the long comment stays in the pane; off, it runs past it.
  const wrap = page
    .getByRole('region', { name: 'YAML and join diagram' })
    .getByRole('button', { name: 'Wrap' });
  await expect(wrap).toHaveAttribute('aria-pressed', 'true');
  const scroller = editor.locator('.cm-scroller');
  const overflows = () =>
    scroller.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  expect(await overflows()).toBe(false);
  // A wrapped comment hangs under its words, not at the margin: its next row
  // starts where "Cube" does.
  const hang = await editor
    .locator('.cm-line', { hasText: '# Cube hides primary keys' })
    .evaluate((line) => {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      const boxes: DOMRect[] = [];
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode())
        for (let at = 0; at < (node.textContent ?? '').length; at += 1) {
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + 1);
          boxes.push(range.getBoundingClientRect());
        }
      const text = line.textContent ?? '';
      const words = boxes[text.indexOf('Cube')];
      // The next row by its top: a glyph's box can be taller than the 16 px row.
      const next = boxes.find((box) => box.width > 0 && box.top > (boxes[0]?.top ?? 0) + 8);
      return words === undefined || next === undefined ? null : next.left - words.left;
    });
  expect(Math.abs(hang ?? 99)).toBeLessThanOrEqual(1);
  await wrap.click();
  await expect(wrap).toHaveAttribute('aria-pressed', 'false');
  expect(await overflows()).toBe(true);
  await wrap.click();

  // Show in YAML: the comment's lines tinted, the first brought to the top.
  await page
    .locator('.cm-scroller')
    .first()
    .evaluate((element) => {
      element.scrollTop = 0;
    });
  await bar.getByRole('button', { name: 'Show in YAML' }).click();
  const noted = editor.locator('.cm-line.yaml-editor__noted');
  await expect(noted).toHaveCount(4);
  await expect(noted.first()).toContainText('# Cube hides primary keys');
  // At the top, or as near it as the code scrolls: a short file stops at its end.
  await expect(async () => {
    const top = (await scroller.boundingBox())?.y ?? 0;
    const line = (await noted.first().boundingBox())?.y ?? 0;
    const end = await scroller.evaluate(
      (element) =>
        element.scrollTop > 0 &&
        element.scrollTop >= element.scrollHeight - element.clientHeight - 1,
    );
    expect(Math.abs(line - top) <= 8 || end).toBe(true);
  }).toPass();
  await expect(noted.first()).toBeInViewport();

  // The open member's lines tinted (note 9); closed, none.
  await form.getByRole('tab', { name: /^Dimensions/ }).click();
  const status = form.locator('.model-member__name', { hasText: /^status$/ });
  await status.click();
  await expect(editor.locator('.cm-line.yaml-editor__tint')).toHaveText([
    '      - name: status',
    '        sql: status',
    '        type: string',
  ]);
  // Their numbers in the accent, as design 03's.
  await expect(editor.locator('.cm-lineNumbers .yaml-editor__tint-number')).toHaveText([
    '24',
    '25',
    '26',
  ]);
  await status.click();
  await expect(editor.locator('.cm-line.yaml-editor__tint')).toHaveCount(0);

  // Problems flush beneath the code, 150 px, saying how it checks.
  // Across the pane inside its rule, as its head row is.
  const pane = await page
    .getByRole('region', { name: 'YAML and join diagram' })
    .locator('.model-editor__popped > .model-editor__head')
    .boundingBox();
  const problems = page.getByRole('region', { name: 'Problems' });
  const box = await problems.boundingBox();
  expect([
    Math.round(box?.x ?? 0),
    Math.round(box?.width ?? 0),
    Math.round(box?.height ?? 0),
  ]).toEqual([Math.round(pane?.x ?? 0), Math.round(pane?.width ?? 0), 150]);
  await expect(problems).toContainText('Checked against Cube’s rules as you type');

  // Hidden, it stays hidden for the tab; the gutter's flag stays.
  await bar.getByRole('button', { name: 'Hide' }).click();
  await expect(bar).toHaveCount(0);
  await expect(editor.locator('.cm-line.yaml-editor__noted')).toHaveCount(0);
  await page.reload();
  await expect(yaml).toContainText('name: orders');
  await expect(form.getByRole('note').filter({ hasText: 'This file has' })).toHaveCount(0);
  await expect(flagged).toHaveText(['19']);
});

/**
 * T482's review: a file of several forms — two cubes and a view — as a draft
 * kept for the tab, so nothing is published. The bar is said once; each
 * form's open member is tinted, whichever form is used after; a list tab
 * opens with its members closed; the tint follows a line moved in the code.
 */
const PAIR = [
  'cubes:', //                        1
  '  - name: pair_a', //              2
  '    sql_table: public.orders', //  3
  "    # About pair_a's keys.", //     4
  '    dimensions:', //               5
  '      - name: id', //              6
  '        sql: id', //               7
  '        type: number', //          8
  '        primary_key: true', //     9
  '      - name: status', //          10
  '        sql: status', //           11
  '        type: string', //          12
  '  - name: pair_b', //              13
  '    sql_table: public.products', //14
  '    dimensions:', //               15
  '      - name: id', //              16
  '        sql: id', //               17
  '        type: number', //          18
  '        primary_key: true', //     19
  'views:', //                        20
  '  - name: pair_view', //           21
  '    cubes:', //                    22
  '      - join_path: pair_a', //     23
  '        includes: "*"', //         24
  '',
].join('\n');

test('T482: in a file of two cubes and a view, the bar is said once and each form’s open member tinted', async ({
  page,
}) => {
  await page.addInitScript((content) => {
    sessionStorage.setItem('wechart.model.drafts', JSON.stringify({ 'cubes/pair.yml': content }));
  }, PAIR);
  await page.goto('/model/files/cubes%2Fpair.yml');
  const a = page.getByRole('region', { name: 'Cube pair_a' });
  const b = page.getByRole('region', { name: 'Cube pair_b' });
  const view = page.getByRole('region', { name: 'View pair_view' });
  const editor = page.locator('.model-editor__yaml .yaml-editor');
  const tinted = editor.locator('.cm-line.yaml-editor__tint');
  await expect(editor).toContainText('pair_view');

  // Said once, under the first form's tabs.
  await expect(page.getByRole('note').filter({ hasText: 'This file has' })).toHaveCount(1);
  await expect(
    a.getByRole('note').filter({ hasText: 'This file has 1 comment (YAML lines 4,' }),
  ).toHaveCount(1);

  // A's member, tinted; B's tabs leave it so.
  await a.getByRole('tab', { name: /^Dimensions/ }).click();
  await a.locator('.model-member__name', { hasText: /^status$/ }).click();
  await expect(tinted).toHaveText([
    '      - name: status',
    '        sql: status',
    '        type: string',
  ]);
  await b.getByRole('tab', { name: /^Measures/ }).click();
  await b.getByRole('tab', { name: /^Dimensions/ }).click();
  await expect(tinted).toHaveCount(3);

  // A's next list tab: its members closed, and nothing tinted.
  await a.getByRole('tab', { name: /^Measures/ }).click();
  await expect(tinted).toHaveCount(0);
  await a.getByRole('tab', { name: /^Dimensions/ }).click();
  await expect(a.locator('details.model-member[open]')).toHaveCount(0);

  // A view's member, tinted as a cube's is.
  await view.getByRole('tab', { name: /^Cubes/ }).click();
  await view.locator('details.model-member > summary').first().click();
  await expect(tinted).toHaveText(['      - join_path: pair_a', '        includes: "*"']);

  // A line moved up in the code, as Alt-ArrowUp moves it: the member is still
  // its three lines, and all three stay tinted.
  await a.locator('.model-member__name', { hasText: /^status$/ }).click();
  await expect(tinted).toHaveCount(3);
  await editor.locator('.cm-line', { hasText: 'type: string' }).click();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(editor.locator('.cm-line').nth(10)).toHaveText('        type: string');
  await expect(tinted).toHaveText([
    '      - name: status',
    '        type: string',
    '        sql: status',
  ]);
});

test('T481: a cube’s General as design 03 state B — Basics, Refresh, Advanced — with help from the research (MW-08)', async ({
  page,
}) => {
  await page.goto(ORDERS);
  const form = page.getByRole('region', { name: 'Cube orders' });
  const general = form.getByRole('tabpanel');
  // The legacy keys under Advanced's caret, as MW-08 asks (T481's review).
  await expect(general.locator('.model-form__group-title, summary')).toHaveText([
    'Basics',
    'Refresh refresh_key',
    'Advanced extends, sql_alias, calendar, meta, shown, rewrite_queries',
    'Legacy and undocumented',
  ]);
  const basics = general.getByRole('group', { name: 'Basics' });
  // Name | Data source, then Reads from across, as design 03 pairs them.
  const name = await basics.locator('[data-key="name"]').boundingBox();
  const source = await basics.locator('[data-key="data_source"]').boundingBox();
  expect(Math.round(source?.y ?? 0)).toBe(Math.round(name?.y ?? 1));
  await expect(basics.getByLabel('Name', { exact: true })).toHaveAttribute('aria-required', 'true');
  // The mark drawn after the label, in the error colour, and left out of its name.
  const mark = await basics.locator('[data-key="name"] > label').evaluate((label) => {
    const after = getComputedStyle(label, '::after');
    return [after.content, after.color];
  });
  expect(mark[0]).toContain('*');
  expect(mark[1]).not.toBe(
    await basics
      .locator('[data-key="name"] > label')
      .evaluate((label) => getComputedStyle(label).color),
  );
  await expect(basics.getByLabel('Name', { exact: true })).toBeVisible();
  await expect(basics.locator('[data-key="name"] .model-field__help')).toHaveText(
    'Unique across cubes and views',
  );
  // The data source picked from the ones Cube has.
  const picker = basics.getByLabel('Data source', { exact: true });
  await expect(picker).toHaveJSProperty('tagName', 'SELECT');
  await expect(picker.locator('option')).toContainText(['(not set · default)', 'default']);
  // Reads from: Cube's either/or, SQL table chosen, in the code face.
  const reads = basics.getByRole('group', { name: 'Reads from' });
  await expect(reads.getByRole('button', { name: 'SQL table' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(reads.getByLabel('SQL table')).toHaveValue('public.orders');
  await expect(reads.locator('.model-field__help')).toHaveText(
    'Cube accepts exactly one of sql_table or sql',
  );
  // Refresh's own fields in view, Advanced folded.
  await expect(general.getByLabel('Every', { exact: true })).toHaveAttribute(
    'placeholder',
    'not set · Cube’s default applies',
  );
  await expect(general.locator('.model-form__advanced')).not.toHaveAttribute('open', '');

  // An open member's Basics: Name and Type marked required, SQL with its help.
  await form.getByRole('tab', { name: /^Dimensions/ }).click();
  await form.locator('.model-member__name', { hasText: /^status$/ }).click();
  const status = form
    .getByRole('listitem')
    .filter({ has: page.locator('.model-member__name', { hasText: /^status$/ }) });
  await expect(status.getByLabel('Name', { exact: true })).toHaveAttribute('aria-required', 'true');
  await expect(status.getByLabel('Type', { exact: true })).toHaveAttribute('aria-required', 'true');
  await expect(status.locator('[data-key="sql"] .model-field__help')).toHaveText(
    'A Cube SQL template: {CUBE} refers to this cube',
  );
});

test('T486: the overview as design 12 — one card, a row per cube or view, + New ▾ in the title row (MW-01)', async ({
  page,
}) => {
  await page.goto('/model');
  const overview = page.locator('.model-page__overview');
  // The title row: "Model" left, its one primary + New ▾ right (pin 5).
  const title = overview.getByRole('heading', { level: 1, name: 'Model' });
  const create = overview.getByRole('button', { name: 'New' });
  const [titleBox, createBox] = [await title.boundingBox(), await create.boundingBox()];
  expect(
    Math.abs(
      (titleBox?.y ?? 0) +
        (titleBox?.height ?? 0) / 2 -
        ((createBox?.y ?? 0) + (createBox?.height ?? 0) / 2),
    ),
  ).toBeLessThanOrEqual(2);
  await expect(create).toHaveClass(/btn-primary/);
  // The note and the card, one width (pin 6).
  const note = overview.locator('.info-bar');
  await expect(note).toHaveText(
    'Every cube and view in the model, by file. Open a row to edit its file.',
  );
  const card = overview.locator('.model-overview');
  const [noteBox, cardBox] = [await note.boundingBox(), await card.boundingBox()];
  expect([Math.round(noteBox?.x ?? 0), Math.round(noteBox?.width ?? 0)]).toEqual([
    Math.round(cardBox?.x ?? 1),
    Math.round(cardBox?.width ?? 1),
  ]);

  // One grid table: a 28 px header, 34 px rows at 12 px, sorted by file (pins 7, 8).
  const table = card.getByRole('table', { name: 'Cubes and views' });
  const header = table.locator('thead tr');
  expect(Math.round((await header.boundingBox())?.height ?? 0)).toBe(28);
  const rows = table.locator('tbody tr');
  expect(Math.round((await rows.first().boundingBox())?.height ?? 0)).toBe(34);
  // The seed's files, sorted; other tests' own cubes may be among them, the
  // browsers running at once.
  await expect(table.getByRole('link', { name: 'views/secured_orders.yml' })).toBeVisible();
  const paths = await rows.locator('td:first-child a').allTextContents();
  expect(paths).toEqual([...paths].sort());
  expect(
    paths.filter((path) =>
      [
        'cubes/customers.yml',
        'cubes/monthly_orders.yml',
        'cubes/orders.yml',
        'cubes/product_catalog.yml',
        'cubes/products.yml',
        'cubes/templated_example.yml',
        'views/order_summary.yml',
        'views/secured_orders.yml',
      ].includes(path),
    ),
  ).toHaveLength(8);
  const rowOf = (path: string) =>
    rows.filter({ has: page.getByRole('link', { name: path, exact: true }) });
  const link = rows.first().getByRole('link');
  expect(
    await link.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.textDecorationLine, style.fontSize];
    }),
  ).toEqual(['none', '12px']);
  await expect(table.getByRole('columnheader', { name: /^File/ })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  // Kind in words; a Jinja template as a locked tag, why nothing is listed (pin 9).
  const orders = rowOf('cubes/orders.yml');
  await expect(orders.locator('td').nth(1)).toHaveText('Cube');
  const template = rowOf('cubes/templated_example.yml');
  await expect(template.locator('.model-overview__code')).toHaveText('Jinja template · read-only');
  await expect(template.locator('td').last()).toHaveText('Not listed: a template isn’t read here');
  // A view counts what it includes (pin 11).
  await expect(rowOf('views/order_summary.yml').locator('td').nth(3)).toHaveText('2 included');

  // Members' tooltip on focus, too (pin 12) — the last row's whole, not cut off
  // by the card (T486's review).
  const members = orders.locator('.model-overview__members');
  await members.focus();
  await expect(orders.getByRole('tooltip')).toBeVisible();
  await rows.last().locator('.model-overview__members').focus();
  await expect(rows.last().getByRole('tooltip')).toBeInViewport({ ratio: 1 });

  // + New ▾: the tree foot's three ways to add, Generate set apart (state A);
  // Escape gives focus back.
  await create.click();
  const menu = page.getByRole('menu', { name: 'New' });
  await expect(menu.getByRole('menuitem')).toHaveText([
    /New cube$/,
    /New view$/,
    /Generate from a data source…$/,
  ]);
  await expect(menu.locator('> *').nth(2)).toHaveAttribute('role', 'separator');
  await page.keyboard.press('Escape');
  await expect(create).toBeFocused();
  // Generate from it, closed: focus back on + New, what opened it (design 11 pin 9).
  await create.click();
  await menu.getByRole('menuitem', { name: /Generate from a data source…$/ }).click();
  const pane = page.getByRole('dialog', { name: 'Generate cubes' });
  await pane.getByRole('button', { name: 'Close' }).click();
  await expect(pane).toHaveCount(0);
  await expect(create).toBeFocused();

  // The whole row opens its file (pin 13), its Members too.
  await orders.locator('.model-overview__members').click();
  await expect(page).toHaveURL(/\/model\/files\/cubes%2Forders\.yml$/);
});

test('T484: New cube as design 03 state C — no made-up table, Name selected to type over (MW-17, MW-18)', async ({
  page,
}) => {
  await page.goto('/model');
  await page
    .getByRole('navigation', { name: 'Model files' })
    .getByRole('button', { name: 'New cube' })
    .click();
  await expect(page).toHaveURL(/\/model\/files\/cubes%2Fnew_cube_1\.yml$/);
  const form = page.getByRole('region', { name: 'Cube new_cube_1' });
  // Name focused, its text selected for typing over (MW-18).
  const name = form.getByRole('tabpanel').getByLabel('Name', { exact: true });
  await expect(name).toBeFocused();
  expect(
    await name.evaluate((input) => {
      const field = input as HTMLInputElement;
      return [field.selectionStart, field.selectionEnd, field.value.length];
    }),
  ).toEqual([0, 10, 10]);
  await expect(page.locator('.model-editor__state')).toHaveText('New file · not published');
  // No made-up table: Reads from empty, its placeholder the shape (MW-17).
  const yaml = page.getByRole('textbox', { name: 'cubes/new_cube_1.yml, as YAML' });
  await expect(yaml).toContainText('name: new_cube_1');
  await expect(yaml).not.toContainText('sql_table');
  const reads = form.getByRole('group', { name: 'Reads from' });
  await expect(reads.getByLabel('SQL table')).toHaveValue('');
  await expect(reads.getByLabel('SQL table')).toHaveAttribute('placeholder', 'schema.table');
  // Problems names what is missing until one is given.
  const problems = page.getByRole('region', { name: 'Problems' });
  await expect(problems.getByRole('listitem')).toContainText([
    'Cube new_cube_1: "sql_table" or "sql" is required.',
  ]);
  await reads.getByLabel('SQL table').fill('public.orders');
  await expect(problems).toContainText('No problems in cubes/new_cube_1.yml');

  // The first time only: opened again from the tree, its row keeps the focus (design 12 pin 13).
  const tree = page.getByRole('navigation', { name: 'Model files' });
  await tree.getByRole('link', { name: /^orders\.yml/ }).click();
  await expect(page).toHaveURL(/cubes%2Forders\.yml$/);
  const draft = tree.getByRole('link', { name: /^new_cube_1\.yml/ });
  await draft.click();
  await expect(page).toHaveURL(/new_cube_1\.yml$/);
  await expect(draft).toBeFocused();
  // Discarded, then a new cube at the same path: a new file, its Name focused (T484's review).
  await page.locator('.model-editor__head').getByRole('button', { name: 'Discard' }).click();
  await expect(page).toHaveURL(/\/model$/);
  await tree.getByRole('button', { name: 'New cube' }).click();
  await expect(page).toHaveURL(/new_cube_1\.yml$/);
  await expect(
    page.getByRole('region', { name: 'Cube new_cube_1' }).getByRole('tabpanel').getByLabel('Name', {
      exact: true,
    }),
  ).toBeFocused();
});

test('T494: side by side with design 03 — controls in a row line up, and a tree name is never broken', async ({
  page,
}) => {
  await page.goto('/model');
  const tree = page.getByRole('navigation', { name: 'Model files' });
  await tree.getByRole('button', { name: 'New cube' }).click();
  await expect(page).toHaveURL(/new_cube_1\.yml$/);
  // A draft with problems carries both marks; its name stays on one line, whole.
  const row = tree.getByRole('link', { name: /^new_cube_1\.yml/ });
  await expect(row).toContainText('unpublished');
  await expect(row).toContainText('problems');
  expect(
    await row
      .locator('.model-tree__name')
      .evaluate((node) => [
        node.getBoundingClientRect().height === parseFloat(getComputedStyle(node).lineHeight),
        node.scrollWidth <= node.clientWidth,
      ]),
  ).toEqual([true, true]);

  // Name beside Data source, whose help runs longer: the two controls at one height.
  const general = page.getByRole('region', { name: 'Cube new_cube_1' }).getByRole('tabpanel');
  const tops = async (...controls: import('@playwright/test').Locator[]) =>
    Promise.all(controls.map(async (control) => Math.round((await control.boundingBox())?.y ?? 0)));
  const [name, source] = await tops(
    general.getByLabel('Name', { exact: true }),
    general.getByLabel('Data source', { exact: true }),
  );
  expect(name).toBe(source);
  await page.locator('.model-editor__head').getByRole('button', { name: 'Discard' }).click();

  // A dimension's Name, with its help, beside its Type (design 03's main screen).
  await page.goto(ORDERS);
  const form = page.getByRole('region', { name: 'Cube orders' });
  await form.getByRole('tab', { name: /^Dimensions/ }).click();
  const status = form.locator('details.model-member').filter({
    has: page.locator('.model-member__name', { hasText: /^status$/ }),
  });
  await status.locator(':scope > summary').click();
  const [memberName, memberType] = await tops(
    status.getByLabel('Name', { exact: true }),
    status.getByLabel('Type', { exact: true }),
  );
  expect(memberName).toBe(memberType);
});

test('T495: the tree as design 12 — a locked Jinja tag, and its reading and empty states (MW-03)', async ({
  page,
}) => {
  await page.goto('/model');
  const tree = page.getByRole('navigation', { name: 'Model files' });
  const jinja = tree.getByRole('link', { name: /^templated_example\.yml/ });
  await expect(jinja.locator('.model-tree__kind .secret-pasted__lock')).toBeVisible();
  await expect(jinja.locator('.model-tree__name')).toHaveAttribute(
    'title',
    'templated_example.yml',
  );

  // While the files are read: the line the overview says, and no state in the head.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/model/files', async (route) => {
    await held;
    await route.continue();
  });
  await page.reload();
  await expect(tree.getByRole('status')).toHaveText('Reading the model…');
  await expect(tree.locator('.model-tree__state')).toHaveCount(0);
  release();
  await expect(tree.locator('.model-tree__state')).toHaveText('All published');

  // A model with no files: said, still no state, and the three ways to start.
  await page.unroute('**/api/model/files');
  await page.route('**/api/model/files', (route) => route.fulfill({ json: { files: [] } }));
  await page.reload();
  await expect(tree.locator('.model-tree__empty')).toHaveText('No files yet.');
  await expect(tree.locator('.model-tree__state')).toHaveCount(0);
  await expect(tree.locator('.model-tree__actions button')).toHaveCount(3);
});

test('T483: a Jinja file in the editor’s frame, read-only and saying so (MW-16)', async ({
  page,
}) => {
  await page.goto('/model/files/cubes%2Ftemplated_example.yml');
  const head = page.locator('.model-editor__head').first();
  await expect(head.getByRole('heading', { level: 1 })).toHaveText('cubes/templated_example.yml');
  // Its state in words with the lock (rule 3), in the 44 px head every file has.
  await expect(head.locator('.model-editor__state')).toHaveText('Read-only · Jinja template');
  await expect(head.locator('.model-editor__state .secret-pasted__lock')).toBeVisible();
  expect(Math.round((await head.boundingBox())?.height ?? 0)).toBe(44);
  // The note an InfoBar, with its "i", naming no xcube (D3).
  const note = page.getByRole('note');
  await expect(note).toHaveClass(/info-bar/);
  await expect(note.locator('svg[data-icon="info"]')).toBeVisible();
  await expect(note).not.toContainText('xcube');
  // The code across the pane, flush, with line numbers and wrap.
  const code = page.locator('.model-readonly__code .cm-editor');
  const pane = await page.locator('.model-page__main').boundingBox();
  const box = await code.boundingBox();
  expect(Math.round(box?.width ?? 0)).toBe(Math.round(pane?.width ?? 1));
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBe(
    Math.round((pane?.y ?? 0) + (pane?.height ?? 1)),
  );
  await expect(code.locator('.cm-lineNumbers')).toBeVisible();
  await expect(code.locator('.cm-content')).toHaveClass(/cm-lineWrapping/);
});

test('T493: New view chooses no cube for the user — it opens on Cubes, its join path to pick (MW-19)', async ({
  page,
}) => {
  await page.goto('/model');
  await page
    .getByRole('navigation', { name: 'Model files' })
    .getByRole('button', { name: 'New view' })
    .click();
  await expect(page).toHaveURL(/\/model\/files\/views%2Fnew_view_1\.yml$/);
  const yaml = page.getByRole('textbox', { name: 'views/new_view_1.yml, as YAML' });
  await expect(yaml).toContainText('name: new_view_1');
  // No cube, and no members, the user didn't choose.
  await expect(yaml).not.toContainText('cubes:');
  await expect(yaml).not.toContainText('join_path');
  const form = page.getByRole('region', { name: 'View new_view_1' });
  await expect(form.getByRole('tab', { name: /^Cubes/ })).toHaveAttribute('aria-selected', 'true');
  const panel = form.getByRole('tabpanel');
  await expect(panel.locator('.model-members__note')).toHaveText(
    'A view shows nothing until it includes a cube.',
  );
  // A new entry, open, its join path picked from the model's cubes and their joins.
  const joinPath = panel.getByLabel('Join path', { exact: true });
  await expect(joinPath).toBeFocused();
  await expect(joinPath.locator('option')).toContainText(['orders', 'orders.customers']);
  // Picked, it is written; the note goes.
  await joinPath.selectOption('orders.customers');
  await expect(yaml).toContainText('join_path: orders.customers');
  await expect(panel.locator('.model-members__note')).toHaveCount(0);
});

test('T487: below 1,280 px the editor is one pane at a time, behind Form | YAML (MW-26)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(ORDERS);
  const formPane = page.getByRole('region', { name: 'Form editor' });
  const codePane = page.getByRole('region', { name: 'YAML and join diagram' });
  const head = formPane.locator(':scope > .model-editor__head');
  // In the editor's head, with the path, the state, Discard and Save.
  const switcher = head.getByRole('group', { name: 'Show' });
  const [form, yaml] = [
    switcher.getByRole('button', { name: 'Form' }),
    switcher.getByRole('button', { name: 'YAML' }),
  ];
  await expect(form).toHaveAttribute('aria-pressed', 'true');
  const body = formPane.locator('.model-editor__form');
  await expect(body).toBeVisible();
  await expect(codePane).toBeHidden();
  // Every tab in view, in the pane's width.
  const pane = await formPane.boundingBox();
  const tabs = await formPane.getByRole('tab').all();
  expect(tabs).toHaveLength(8);
  for (const tab of tabs) {
    const box = await tab.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      (pane?.x ?? 0) + (pane?.width ?? 0),
    );
  }
  // No segment label wraps: each is one line tall.
  for (const button of [form, yaml])
    expect(
      await button.evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
    ).toBe(true);

  // YAML: the code in the form's place, beneath the head, which stays (T487's review);
  // pressed from the keyboard, focus stays on it (Safari focuses no button on a click).
  await yaml.focus();
  await page.keyboard.press('Enter');
  await expect(yaml).toHaveAttribute('aria-pressed', 'true');
  await expect(yaml).toBeFocused();
  await expect(body).toBeHidden();
  await expect(codePane).toBeVisible();
  await expect(head.getByTestId('selected-object')).toHaveText('cubes/orders.yml');
  await expect(head.locator('.model-editor__state')).toBeVisible();
  await expect(head.getByRole('button', { name: 'Save & reload Cube' })).toBeVisible();
  const [headBox, codeBox] = [await head.boundingBox(), await codePane.boundingBox()];
  expect(Math.round(codeBox?.y ?? 0)).toBeGreaterThanOrEqual(
    Math.round((headBox?.y ?? 0) + (headBox?.height ?? 0)),
  );
  expect(Math.round(codeBox?.width ?? 0)).toBe(Math.round(pane?.width ?? 1));
  await expect(codePane.locator('.model-editor__sync')).toBeHidden();
  const joins = codePane.getByRole('button', { name: 'Join diagram' });
  expect(await joins.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(
    true,
  );
  await form.click();
  await expect(body).toBeVisible();

  // Show in YAML goes to the YAML (T482's bar), focus to the code it shows.
  await formPane.getByRole('note').getByRole('button', { name: 'Show in YAML' }).click();
  await expect(codePane).toBeVisible();
  await expect(yaml).toHaveAttribute('aria-pressed', 'true');
  await expect(codePane.locator('.cm-content')).toBeFocused();

  // Generate docked takes the code's place: the form, and no switch.
  await page
    .getByRole('navigation', { name: 'Model files' })
    .getByRole('button', { name: 'Generate from a data source…' })
    .click();
  const generate = page.getByRole('dialog', { name: 'Generate cubes' });
  await expect(generate).toBeVisible();
  await expect(body).toBeVisible();
  await expect(page.locator('.model-editor__switch:visible')).toHaveCount(0);
  await generate.getByRole('button', { name: 'Close' }).click();

  // At 1,279 px still one pane at a time; from 1,280 both, every tab in view, no switch.
  await page.setViewportSize({ width: 1279, height: 800 });
  await expect(switcher).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.model-editor__switch:visible')).toHaveCount(0);
  await expect(body).toBeVisible();
  await expect(codePane).toBeVisible();
  const wide = await formPane.boundingBox();
  for (const tab of await formPane.getByRole('tab').all()) {
    const box = await tab.boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
      (wide?.x ?? 0) + (wide?.width ?? 0),
    );
  }
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
