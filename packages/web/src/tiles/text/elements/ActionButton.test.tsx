import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { csvOf, textDocumentProblems, type RenderSpec, type TextNode } from '@wechart/core';

import { BYTE_ORDER_MARK } from '../../../dashboard/TileViewMenu';
import { ActionButton, exportTilesAsCsv, viewAfterReset, type ActionRunner } from './ActionButton';

/**
 * T894 / AC-530: … an ordered list of actions, each one of Go to page tab
 * (a page), Apply bookmark (a bookmark), Reset filters (to the dashboard's
 * saved values, leaving parameters as they are) and Export (the chosen
 * tiles' data, one CSV per tile, each as AC-171 makes it) …; and WHEN a
 * reader presses it, THE SYSTEM SHALL run those actions in that order and
 * nothing else.
 * `Fails when: an action of another kind can be added, or one stored runs;
 * the actions run out of order; Reset filters changes a parameter; or Export
 * produces anything but each chosen tile's CSV.`
 */

const button = (attrs: Record<string, unknown>): TextNode => ({ type: 'actionButton', attrs });

function recorder() {
  const ran: string[] = [];
  const runner: ActionRunner = {
    goToPage: (page) => {
      ran.push(`page ${page}`);
    },
    applyBookmark: (bookmark) => {
      ran.push(`bookmark ${bookmark}`);
    },
    resetFilters: () => {
      ran.push('reset');
    },
    exportTiles: (tiles) => {
      ran.push(`export ${tiles.join(',')}`);
    },
  };
  return { ran, runner };
}

describe('an Action button (T894, AC-530)', () => {
  it('is a button with its label in its style', () => {
    const { runner } = recorder();
    render(
      <ActionButton element={button({ label: 'Go to Detail', style: 'primary' })} run={runner} />,
    );
    const pressed = screen.getByRole('button', { name: 'Go to Detail' });
    expect([...pressed.classList]).toEqual(['text-action', 'text-action--primary']);
  });

  it('runs Reset filters, then Go to page tab Detail, in that order', async () => {
    const { ran, runner } = recorder();
    render(
      <ActionButton
        element={button({
          label: 'Go to Detail',
          actions: [{ kind: 'resetFilters' }, { kind: 'page', page: 'detail' }],
        })}
        run={runner}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Go to Detail' }));
    expect(ran).toEqual(['reset', 'page detail']);
  });

  it('applies a bookmark before what follows it', async () => {
    const order: string[] = [];
    let finish: () => void = () => undefined;
    const runner: ActionRunner = {
      goToPage: (page) => {
        order.push(`page ${page}`);
      },
      applyBookmark: (bookmark) =>
        new Promise<void>((resolve) => {
          finish = () => {
            order.push(`bookmark ${bookmark}`);
            resolve();
          };
        }),
      resetFilters: () => undefined,
      exportTiles: () => undefined,
    };
    render(
      <ActionButton
        element={button({
          label: 'Q3',
          actions: [
            { kind: 'bookmark', bookmark: 'b1' },
            { kind: 'page', page: 'detail' },
          ],
        })}
        run={runner}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Q3' }));
    expect(order).toEqual([]);
    finish();
    await vi.waitFor(() => {
      expect(order).toEqual(['bookmark b1', 'page detail']);
    });
  });

  it('runs nothing for a stored action of another kind, which the schema refuses', async () => {
    const script = button({
      label: 'Run it',
      actions: [{ kind: 'resetFilters' }, { kind: 'script', code: 'alert(1)' }],
    });
    expect(
      textDocumentProblems({
        version: 1,
        doc: { type: 'doc', content: [{ type: 'paragraph', content: [script] }] },
      }),
    ).not.toEqual([]);
    const { ran, runner } = recorder();
    render(<ActionButton element={script} run={runner} />);
    await userEvent.click(screen.getByRole('button', { name: 'Run it' }));
    expect(ran).toEqual([]);
  });

  it('leaves every parameter as it is on Reset filters', () => {
    const view = {
      filters: { 'f-country customers.country': { kind: 'values', values: ['France'] } as const },
      markFilters: [{ id: 'mf1' }],
      crossFilters: [{ id: 'x1' }],
      parameters: { p1: 'orders.count' },
      page: 'overview',
    };
    expect(viewAfterReset(view)).toEqual({
      filters: {},
      markFilters: [],
      crossFilters: [],
      parameters: { p1: 'orders.count' },
      page: 'overview',
    });
  });

  it('exports two tiles as two CSVs, each its table as Download CSV writes it', () => {
    const spec = (title: string) =>
      ({
        type: 'bar',
        title,
        fields: ['orders.status'],
        measures: ['orders.count'],
        rows: [{ 'orders.status': 'shipped', 'orders.count': 80 }],
      }) as unknown as RenderSpec;
    const saved: [string, string][] = [];
    exportTilesAsCsv(
      ['t1', 't2'],
      (tile) =>
        tile === 't1'
          ? { title: 'Revenue by month', spec: spec('Revenue by month') }
          : { title: 'Top products', spec: spec('Top products') },
      (name, data) => {
        saved.push([name, String(data)]);
      },
    );
    expect(saved).toEqual([
      ['Revenue by month.csv', `${BYTE_ORDER_MARK}${csvOf(spec('Revenue by month'))}`],
      ['Top products.csv', `${BYTE_ORDER_MARK}${csvOf(spec('Top products'))}`],
    ]);
  });
});
