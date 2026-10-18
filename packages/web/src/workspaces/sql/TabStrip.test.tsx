import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useReducer } from 'react';
import { describe, expect, it } from 'vitest';

import { TabStrip } from './TabStrip';
import { tabsReducer, type SqlTab, type TabsAction, type TabsState } from './tabs';

/**
 * T800 (AC-450): "+" opens a tab on the current tab's data source; the ⋯
 * offers Rename…, Duplicate, Close and Close other tabs; a tab's state is in
 * its tooltip and accessible name, with an icon, never colour alone; and a
 * tab whose text is neither saved nor its last run's SQL is closed only
 * after asking, focus on the safe choice.
 * Fails when: one of those four actions is missing; the state is shown by
 * colour alone; or such a tab closes without asking.
 */
const NAMES: Readonly<Record<string, string>> = { emea: 'emea_replica', fx: 'fx_warehouse' };

const tab = (over: Partial<SqlTab> & Pick<SqlTab, 'id' | 'name'>): SqlTab => ({
  sourceId: 'emea',
  sql: '',
  params: {},
  savedSql: null,
  lastRunSql: null,
  run: null,
  ...over,
});

let made = 0;
function Harness({ start }: { readonly start: TabsState }) {
  const [state, dispatch] = useReducer(
    (now: TabsState, action: TabsAction) =>
      tabsReducer(now, action, () => {
        made += 1;
        return `new${String(made)}`;
      }),
    start,
  );
  return (
    <TabStrip
      state={state}
      dispatch={dispatch}
      sourceName={(id) => NAMES[id]}
      tabId={(id) => `tab-${id}`}
      panelId={(id) => `panel-${id}`}
    />
  );
}

const open = (tabs: readonly SqlTab[], active = tabs[0]?.id ?? '') => {
  render(<Harness start={{ tabs, active }} />);
};
const tabNames = () => screen.getAllByRole('tab').map((each) => each.getAttribute('aria-label'));

describe('the tab strip (T800, AC-450)', () => {
  it('opens a tab from “+” on the current tab’s data source, selected', async () => {
    open([tab({ id: 'a', name: 'Query 1', sourceId: 'fx' }), tab({ id: 'b', name: 'Query 2' })]);

    await userEvent.click(screen.getByRole('button', { name: 'New tab on fx_warehouse' }));

    const added = screen.getByRole('tab', { name: 'Query 3, Not run yet, on fx_warehouse' });
    expect(added.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(added);
  });

  it('offers Rename…, Duplicate, Close and Close other tabs on a tab’s ⋯', async () => {
    open([tab({ id: 'a', name: 'Query 1' })]);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Query 1' }));

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Rename…',
      'Duplicate',
      'Close',
      'Close other tabs',
    ]);
  });

  it('renames a tab from Rename…', async () => {
    open([tab({ id: 'a', name: 'Query 1' })]);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Query 1' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename…' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename Query 1' });
    const field = within(dialog).getByRole('textbox', { name: 'Name' });
    expect(document.activeElement).toBe(field);
    await userEvent.clear(field);
    await userEvent.type(field, 'orders check');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(tabNames()).toEqual(['orders check, Not run yet, on emea_replica']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('duplicates a tab from Duplicate, after it and selected', async () => {
    open([tab({ id: 'a', name: 'Query 1', sql: 'SELECT 1' }), tab({ id: 'b', name: 'Query 2' })]);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Query 1' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));

    expect(tabNames()).toEqual([
      'Query 1, Not run yet, on emea_replica',
      'Query 1 (copy), Not run yet, on emea_replica',
      'Query 2, Not run yet, on emea_replica',
    ]);
    expect(
      screen.getByRole('tab', { name: /^Query 1 \(copy\)/ }).getAttribute('aria-selected'),
    ).toBe('true');
  });

  it('closes a tab from Close, and the others from Close other tabs', async () => {
    open([
      tab({ id: 'a', name: 'Query 1' }),
      tab({ id: 'b', name: 'Query 2' }),
      tab({ id: 'c', name: 'Query 3' }),
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Query 1' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Close' }));
    expect(tabNames()).toEqual([
      'Query 2, Not run yet, on emea_replica',
      'Query 3, Not run yet, on emea_replica',
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Query 3' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Close other tabs' }));
    expect(tabNames()).toEqual(['Query 3, Not run yet, on emea_replica']);
  });

  it('gives a finished tab its state in its accessible name and tooltip, with an icon', () => {
    open([
      tab({
        id: 'a',
        name: 'Query 1',
        run: {
          kind: 'done',
          sql: 'SELECT 1',
          at: 0,
          outcome: {
            outcome: 'finished',
            columns: [],
            rows: [],
            rowCount: 1284,
            truncated: null,
            durationMs: 840,
            statement: 'select',
          },
        },
      }),
    ]);

    const finished = screen.getByRole('tab', { name: 'Query 1, Finished, 1,284 rows, on emea_replica' });
    expect(finished.getAttribute('title')).toBe('Query 1, Finished, 1,284 rows, on emea_replica');
    // The state as an icon, not a colour alone (design 17's Q6).
    expect(finished.querySelector('svg[data-icon="ok"]')).not.toBeNull();
    // The label isn't on the tab itself, to keep tabs short.
    expect(finished.textContent).toBe('Query 1');
  });

  it('names a tab with no data source without one', () => {
    open([tab({ id: 'a', name: 'Query 1', sourceId: '' })]);

    expect(tabNames()).toEqual(['Query 1, Not run yet']);
    expect(screen.getByRole('button', { name: 'New tab' })).toBeTruthy();
  });

  it('asks before closing a tab whose text is neither saved nor its last run’s, focus on Keep it open', async () => {
    open([tab({ id: 'a', name: 'Query 1' }), tab({ id: 'b', name: 'Query 2', sql: 'SELECT 1' })], 'b');
    const close = screen.getByRole('button', { name: 'Close Query 2' });

    await userEvent.click(close);
    const asking = screen.getByRole('alertdialog', { name: 'Close Query 2?' });
    expect(asking.textContent).toContain(
      'Its SQL isn’t saved, and isn’t the SQL it last ran. Closing it loses the text. Its runs stay in History.',
    );
    expect(document.activeElement).toBe(within(asking).getByRole('button', { name: 'Keep it open' }));

    await userEvent.click(within(asking).getByRole('button', { name: 'Keep it open' }));
    expect(tabNames()).toHaveLength(2);
    expect(document.activeElement).toBe(close);

    await userEvent.click(close);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(tabNames()).toHaveLength(2);

    await userEvent.click(close);
    await userEvent.click(screen.getByRole('button', { name: 'Close tab' }));
    expect(tabNames()).toEqual(['Query 1, Not run yet, on emea_replica']);
  });

  it('closes without asking a tab whose text it last ran, or is saved, or is empty', async () => {
    open([
      tab({ id: 'a', name: 'Query 1', sql: 'SELECT 1', lastRunSql: 'SELECT 1' }),
      tab({ id: 'b', name: 'Query 2', sql: 'SELECT 2', savedSql: 'SELECT 2' }),
      tab({ id: 'c', name: 'Query 3' }),
      tab({ id: 'd', name: 'Query 4' }),
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Close Query 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close Query 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close Query 3' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(tabNames()).toEqual(['Query 4, Not run yet, on emea_replica']);
  });

  it('asks before Close other tabs closes one whose text would be lost', async () => {
    open([tab({ id: 'a', name: 'Query 1' }), tab({ id: 'b', name: 'Query 2', sql: 'SELECT 1' })]);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Query 1' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Close other tabs' }));
    const asking = screen.getByRole('alertdialog', { name: 'Close the other tabs?' });
    expect(document.activeElement).toBe(within(asking).getByRole('button', { name: 'Keep them open' }));

    await userEvent.click(within(asking).getByRole('button', { name: 'Close tabs' }));
    expect(tabNames()).toEqual(['Query 1, Not run yet, on emea_replica']);
  });

  it('moves along the tabs with the arrow keys, as the built tab lists do', async () => {
    open([tab({ id: 'a', name: 'Query 1' }), tab({ id: 'b', name: 'Query 2' })]);

    screen.getByRole('tab', { name: /^Query 1/ }).focus();
    await userEvent.keyboard('{ArrowRight}');

    const second = screen.getByRole('tab', { name: /^Query 2/ });
    expect(second.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute('aria-controls')).toBe('panel-b');
  });
});
