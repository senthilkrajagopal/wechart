import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * AC-187: THE SYSTEM SHALL draw the app bar, workspace navigation, buttons and
 * inputs, the dashboard header and page tabs, the filter bar, tiles, and the
 * edit sidebar with the component styles of the design prototype the user
 * approved (`docs/design/prototype/index.html`), in the tokens of
 * direction.md §3–5.
 * Fails when: one of those components' computed height, padding, border
 * width or radius, font size or weight, or colour token differs from the
 * prototype's rule for the same component.
 *
 * Each expectation cites the prototype rule it comes from. Colours are
 * compared as tokens — each resolved through a probe element in the page —
 * never as hex values, so a theme's token values can change without this
 * suite restating them.
 */

/** A token as the page computes it: the colour an element painted with it gets. */
async function token(page: Page, name: string, property: 'color' | 'background-color' = 'color') {
  return page.evaluate(
    ([tokenName, prop]) => {
      const probe = document.createElement('span');
      probe.style.setProperty(prop, `var(--wc-${tokenName})`);
      document.body.append(probe);
      const value = getComputedStyle(probe).getPropertyValue(prop);
      probe.remove();
      return value;
    },
    [name, property] as const,
  );
}

async function style(locator: Locator, ...properties: string[]) {
  return locator.evaluate(
    (element, props) =>
      Object.fromEntries(
        props.map((prop) => [prop, getComputedStyle(element).getPropertyValue(prop)]),
      ),
    properties,
  );
}

test.describe('T202: the app bar, workspace navigation, buttons and inputs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByTestId('explore-contents')).toBeVisible();
  });

  test('the app bar: 48 px, surface, a subtle rule beneath, and the "we" mark', async ({
    page,
  }) => {
    // .topbar { … background: var(--bg-surface); border-bottom: 1px solid var(--border-subtle) }
    // .app { grid-template-rows: 48px 1fr }
    const bar = page.getByRole('banner');
    expect(
      await style(bar, 'height', 'background-color', 'border-bottom-width', 'border-bottom-color'),
    ).toEqual({
      height: '48px',
      'background-color': await token(page, 'bg-surface'),
      'border-bottom-width': '1px',
      'border-bottom-color': await token(page, 'border-subtle'),
    });

    // .brand-mark { width: 22px; height: 22px; border-radius: 5px; background: var(--accent);
    //               color: var(--text-on-accent); font-size: 12px; font-weight: 600 }
    const mark = bar.getByTestId('brand-mark');
    await expect(mark).toHaveText('we');
    expect(
      await style(
        mark,
        'width',
        'height',
        'border-radius',
        'background-color',
        'color',
        'font-size',
        'font-weight',
      ),
    ).toEqual({
      width: '22px',
      height: '22px',
      'border-radius': '5px',
      'background-color': await token(page, 'accent'),
      color: await token(page, 'text-on-accent'),
      'font-size': '12px',
      'font-weight': '600',
    });
  });

  test('the workspace navigation: the current one underlined in the accent, the rest secondary', async ({
    page,
  }) => {
    // .wsnav button { color: var(--text-secondary); border-bottom: 2px solid transparent; padding: 0 12px; height: 100% }
    // .wsnav button[aria-current="page"] { color: var(--text-primary); border-bottom-color: var(--accent); font-weight: 600 }
    const nav = page.getByRole('navigation', { name: 'Workspaces' });
    const current = nav.getByRole('link', { name: 'Explore' });
    const other = nav.getByRole('link', { name: 'Model' });
    expect(
      await style(
        current,
        'color',
        'border-bottom-width',
        'border-bottom-color',
        'font-weight',
        'height',
        'padding-left',
      ),
    ).toEqual({
      color: await token(page, 'text-primary'),
      'border-bottom-width': '2px',
      'border-bottom-color': await token(page, 'accent'),
      'font-weight': '600',
      // Full height inside the 48 px bar's 1 px bottom rule: 47 px, as
      // measured on the prototype itself.
      height: '47px',
      'padding-left': '12px',
    });
    expect(await style(other, 'color', 'border-bottom-color', 'background-color')).toEqual({
      color: await token(page, 'text-secondary'),
      'border-bottom-color': 'rgba(0, 0, 0, 0)',
      'background-color': 'rgba(0, 0, 0, 0)',
    });
  });

  test('the theme control: a 32 px icon button', async ({ page }) => {
    // .iconbtn { width: 32px; height: 32px; border: 1px solid transparent; border-radius: 6px;
    //            background: none; color: var(--text-secondary) }
    const toggle = page.getByRole('banner').getByRole('button', { name: /theme/i });
    await expect(toggle.locator('svg')).toHaveCount(1);
    expect(
      await style(
        toggle,
        'width',
        'height',
        'border-radius',
        'background-color',
        'color',
        'border-top-color',
      ),
    ).toEqual({
      width: '32px',
      height: '32px',
      'border-radius': '6px',
      'background-color': 'rgba(0, 0, 0, 0)',
      color: await token(page, 'text-secondary'),
      'border-top-color': 'rgba(0, 0, 0, 0)',
    });
  });

  test('buttons, the primary button and inputs', async ({ page }) => {
    // .btn { height: 32px; padding: 0 12px; border-radius: 6px; border: 1px solid var(--border-strong);
    //        background: var(--bg-surface) }
    const plain = page.getByRole('button', { name: 'New dashboard' });
    expect(
      await style(
        plain,
        'height',
        'padding-left',
        'border-radius',
        'border-top-width',
        'border-top-color',
        'background-color',
      ),
    ).toEqual({
      height: '32px',
      'padding-left': '12px',
      'border-radius': '6px',
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-strong'),
      'background-color': await token(page, 'bg-surface'),
    });

    await plain.click();
    // .input { height: 32px; border: 1px solid var(--border-strong); border-radius: 4px;
    //          background: var(--bg-surface); padding: 0 8px }
    const input = page.getByLabel('New dashboard in this folder');
    expect(
      await style(
        input,
        'height',
        'border-top-width',
        'border-top-color',
        'border-radius',
        'background-color',
        'padding-left',
      ),
    ).toEqual({
      height: '32px',
      'border-top-width': '1px',
      'border-top-color': await token(page, 'border-strong'),
      'border-radius': '4px',
      'background-color': await token(page, 'bg-surface'),
      'padding-left': '8px',
    });

    // .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--text-on-accent); font-weight: 600 }
    await input.fill('Anything');
    // The form's own Create — other tests leave items whose names contain it.
    const primary = page
      .getByRole('form', { name: 'New dashboard' })
      .getByRole('button', { name: 'Create', exact: true });
    expect(
      await style(
        primary,
        'background-color',
        'border-top-color',
        'color',
        'font-weight',
        'height',
      ),
    ).toEqual({
      'background-color': await token(page, 'accent'),
      'border-top-color': await token(page, 'accent'),
      color: await token(page, 'text-on-accent'),
      'font-weight': '600',
      height: '32px',
    });
  });
});
