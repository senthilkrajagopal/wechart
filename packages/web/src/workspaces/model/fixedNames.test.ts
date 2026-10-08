import { describe, expect, it } from 'vitest';

import { fixedNameProblems } from './fixedNames';

/**
 * T737's follow-up (AC-423): a landed cube's or view's name changed in the
 * YAML is held as the form holds it, at the name, in the form's words: the
 * API would refuse it only at save.
 */
const LANDED = 'cubes:\n  - name: orders\n    sql_table: public.orders\n';

describe('a landed name changed in the YAML (T737, AC-423)', () => {
  it('is a problem that holds the save, at the name, saying it is fixed', () => {
    const text = 'cubes:\n  - name: orders_renamed\n    sql_table: public.orders\n';
    const at = text.indexOf('orders_renamed');
    expect(fixedNameProblems('cubes/orders.yml', text, LANDED)).toEqual([
      {
        path: 'cubes/orders.yml',
        line: 2,
        column: 11,
        message: '“orders” has landed, so its name is fixed. Its title can still change.',
        from: at,
        to: at + 'orders_renamed'.length,
        severity: 'error',
        holds: true,
      },
    ]);
  });

  it('holds a change of case too, and a view’s name', () => {
    expect(
      fixedNameProblems(
        'cubes/orders.yml',
        'cubes:\n  - name: Orders\n    sql_table: public.orders\n',
        LANDED,
      ).map((problem) => problem.message),
    ).toEqual(['“orders” has landed, so its name is fixed. Its title can still change.']);
    expect(
      fixedNameProblems(
        'views/lens.yml',
        'views:\n  - name: lens_2\n    cubes: []\n',
        'views:\n  - name: lens\n    cubes: []\n',
      ).map((problem) => problem.message),
    ).toEqual(['“lens” has landed, so its name is fixed. Its title can still change.']);
  });

  it('is nothing for its title changed, or the name kept', () => {
    expect(
      fixedNameProblems(
        'cubes/orders.yml',
        'cubes:\n  - name: orders\n    title: Orders, now\n    sql_table: public.orders\n',
        LANDED,
      ),
    ).toEqual([]);
  });

  it('is nothing for a text that does not parse: its own problem is listed', () => {
    expect(fixedNameProblems('cubes/orders.yml', 'cubes:\n  - name: [', LANDED)).toEqual([]);
  });
});
