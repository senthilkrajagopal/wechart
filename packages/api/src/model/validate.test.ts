import { describe, expect, it } from 'vitest';

import { compileErrorsOf } from './validate';

/**
 * T142 / AC-136: WHEN the user saves model changes, THE SYSTEM SHALL
 * validate them against Cube before publishing and refuse to publish a model
 * Cube rejects, showing Cube's error per file.
 * Fails when: an invalid model is published, or the error is not attributed
 * to a file.
 *
 * Cube's errors as they come, observed through wechart's own cube.js
 * (research/cube/spike-model-store-and-quick-calcs.md §1a). Some name their
 * file; the rest are placed on the changed file they come from — the live
 * model compiled, so a draft's error is in what the draft changed.
 */
const ORDERS = {
  path: 'cubes/orders.yml',
  content:
    'cubes:\n  - name: orders\n    measures:\n      - name: broken\n        sql: "{no_such_member}"\n',
};
const PRODUCTS = {
  path: 'cubes/products.yml',
  content: 'cubes: [\n  - name: products\n    sql_table: public.products\n',
};
const CUSTOMERS = { path: 'cubes/customers.yml', content: 'cubes:\n  - name: customers\n' };

describe('Cube’s compile errors, by file', () => {
  it('takes the file Cube names', () => {
    const message =
      "Error: Compile errors:\ncubes/customers.yml Errors:\nMember names must be unique within a cube. Found duplicate measure 'count' in cube 'customers'.\n";

    expect(compileErrorsOf(message, [CUSTOMERS, ORDERS])).toEqual([
      {
        path: 'cubes/customers.yml',
        message:
          "Member names must be unique within a cube. Found duplicate measure 'count' in cube 'customers'.",
      },
    ]);
  });

  it('places an undefined name on the changed file that holds it', () => {
    const message = 'Error: Compile errors:\nErrors:\nno_such_member is not defined\n';

    expect(compileErrorsOf(message, [CUSTOMERS, ORDERS])).toEqual([
      { path: 'cubes/orders.yml', message: 'no_such_member is not defined' },
    ]);
  });

  it('places a YAML error on the changed file whose line it shows, with the line', () => {
    const message =
      'YAMLException: missed comma between flow collection entries (2:3)\n\n 1 | cubes: [\n 2 |   - name: products\n-------^\n 3 |     sql_table: public.products\n 4 | ';

    expect(compileErrorsOf(message, [ORDERS, PRODUCTS])).toEqual([
      {
        path: 'cubes/products.yml',
        line: 2,
        message: 'YAMLException: missed comma between flow collection entries (2:3)',
      },
    ]);
  });

  it('keeps each file’s errors apart, several to a file', () => {
    const message =
      'Error: Compile errors:\ncubes/a.yml Errors:\nfirst\nsecond\ncubes/b.yml Errors:\nthird\n';

    expect(compileErrorsOf(message, [])).toEqual([
      { path: 'cubes/a.yml', message: 'first' },
      { path: 'cubes/a.yml', message: 'second' },
      { path: 'cubes/b.yml', message: 'third' },
    ]);
  });

  it('puts an error it can’t place on each changed file, not on none', () => {
    const message = 'Error: Compile errors:\nErrors:\nSomething Cube did not like\n';

    expect(compileErrorsOf(message, [CUSTOMERS, ORDERS])).toEqual([
      { path: 'cubes/customers.yml', message: 'Something Cube did not like' },
      { path: 'cubes/orders.yml', message: 'Something Cube did not like' },
    ]);
  });
});
