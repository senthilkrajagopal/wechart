import { describe, expect, it } from 'vitest';

import { MAX_NAME, nameInUse, nameInUseOf, nameKey, nameProblem } from './names';

/**
 * T703 (AC-426): a cube's, view's or data source's name is an ASCII letter,
 * then ASCII letters, digits and underscores, with no `__`, not ending in `_`,
 * at most 40 characters; a cube's or view's is no reserved word, in any case
 * (R72's grammar, as xcube `256d632371` holds it: research
 * `xcube-256d632371.md`, "The grammar").
 */
describe('a name, in R72’s grammar (T703, AC-426)', () => {
  it('takes a letter, then letters, digits and single underscores, upper case too', () => {
    for (const kind of ['cube', 'view', 'data-source'] as const)
      for (const name of ['Orders', 'order_items', 'a1', 'x'.repeat(MAX_NAME)])
        expect(nameProblem(name, kind), `${kind} ${name}`).toBeUndefined();
  });

  it('refuses anything else, for every kind, saying the grammar', () => {
    for (const kind of ['cube', 'view', 'data-source'] as const)
      for (const name of [
        '1orders',
        '_orders',
        'order items',
        'order-items',
        'order.items',
        'café',
        'order__items',
        'orders_',
        'x'.repeat(MAX_NAME + 1),
        '',
      ])
        expect(nameProblem(name, kind), `${kind} ${JSON.stringify(name)}`).toBe(
          `“${name}” isn’t a name: start with a letter, then use letters, digits and single underscores, not ending in one, at most 40 characters.`,
        );
  });

  it('refuses a reserved word for a cube or view, in any case, and takes it for a data source', () => {
    for (const name of [
      'class',
      'None',
      'true',
      'Cube',
      'table',
      'security_context',
      'FILTER_PARAMS',
    ])
      for (const kind of ['cube', 'view'] as const)
        expect(nameProblem(name, kind), `${kind} ${name}`).toBe(
          `“${name}” is a reserved word, so a cube or view can’t take it.`,
        );
    for (const name of ['table', 'class', 'None'])
      expect(nameProblem(name, 'data-source'), name).toBeUndefined();
  });

  it('compares names in any case', () => {
    expect(nameKey('Orders')).toBe(nameKey('orders'));
    expect(nameKey('ORDER_items')).toBe('order_items');
  });
});

/**
 * T723 (AC-424): a name refused as in use is said in one set of words, by
 * the API and read back by the web, which holds nothing of where.
 */
describe('a name in use (T723, AC-424)', () => {
  it('is said as in use and nothing more, and read back for its name alone', () => {
    expect(nameInUse('Orders')).toBe('The name “Orders” is already in use.');
    expect(nameInUseOf(nameInUse('Orders'))).toBe('Orders');
    for (const other of [
      'The name “Orders” is already in use, so nothing was approved.',
      'Cube refused the model.',
      '',
    ])
      expect(nameInUseOf(other), other).toBeUndefined();
  });
});
