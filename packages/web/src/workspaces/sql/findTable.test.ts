import { describe, expect, it } from 'vitest';

import { findTables } from './findTable';

/**
 * T806 (AC-448): "Find a table" filters the tables already read by name.
 * Fails when: the filter hides a matching table already read or shows one
 * that doesn't match.
 */
const read = [
  { schema: 'sales', name: 'orders' },
  { schema: 'sales', name: 'order_lines' },
  { schema: 'sales', name: 'customers' },
  { schema: 'staging', name: 'raw_orders' },
  { schema: 'staging', name: 'returns' },
];

describe('Find a table, over the names read (T806, AC-448)', () => {
  it('keeps every read table whose name holds the text, and hides the rest', () => {
    expect(findTables(read, 'ord')).toEqual([
      { schema: 'sales', name: 'orders' },
      { schema: 'sales', name: 'order_lines' },
      { schema: 'staging', name: 'raw_orders' },
    ]);
  });

  it('ignores case and the space around the text', () => {
    expect(findTables(read, '  ORD ').map((table) => table.name)).toEqual(['orders', 'order_lines', 'raw_orders']);
  });

  it('keeps them all for no text, and none where nothing matches', () => {
    expect(findTables(read, '')).toEqual(read);
    expect(findTables(read, '   ')).toEqual(read);
    expect(findTables(read, 'zzz')).toEqual([]);
  });

  it('matches the table’s name, not its schema’s', () => {
    expect(findTables(read, 'stag')).toEqual([]);
  });
});
