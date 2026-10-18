import { describe, expect, it } from 'vitest';

import { selectOf } from './tableMenu';

/**
 * T807 (AC-449): Insert SELECT writes `SELECT <its columns> FROM
 * <schema>.<table>`, limited to 100 rows in the driver's own syntax
 * (research sql-row-limits.md), and runs nothing.
 * Fails when: Insert SELECT runs anything or omits the limit.
 */
const table = { schema: 'sales', name: 'orders' };
const columns = ['order_id', 'customer_id', 'amount'];

describe('Insert SELECT, 100 rows in the driver’s own syntax (T807, AC-449)', () => {
  it('ends with LIMIT 100 on PostgreSQL and MySQL', () => {
    expect(selectOf('postgres', table, columns)).toBe(
      'SELECT order_id, customer_id, amount\nFROM sales.orders\nLIMIT 100',
    );
    expect(selectOf('mysql', table, columns)).toBe(
      'SELECT order_id, customer_id, amount\nFROM sales.orders\nLIMIT 100',
    );
  });

  it('takes TOP (100) on SQL Server, with the parentheses Microsoft recommends', () => {
    expect(selectOf('mssql', table, columns)).toBe(
      'SELECT TOP (100) order_id, customer_id, amount\nFROM sales.orders',
    );
  });

  it('ends with FETCH FIRST 100 ROWS ONLY on Oracle', () => {
    expect(selectOf('oracle', table, columns)).toBe(
      'SELECT order_id, customer_id, amount\nFROM sales.orders\nFETCH FIRST 100 ROWS ONLY',
    );
  });

  it('ends with LIMIT 100 on Redshift, Snowflake, BigQuery and Dremio', () => {
    for (const driver of ['redshift', 'snowflake', 'bigquery', 'dremio'] as const)
      expect(selectOf(driver, table, columns)).toMatch(/\nLIMIT 100$/);
  });

  it('selects * where no column is known', () => {
    expect(selectOf('postgres', table, [])).toBe('SELECT *\nFROM sales.orders\nLIMIT 100');
  });
});
