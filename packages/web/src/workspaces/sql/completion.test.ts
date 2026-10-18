import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { PostgreSQL, sql } from '@codemirror/lang-sql';
import { EditorState } from '@codemirror/state';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { catalogRead, schemaCompletion } from './completion';

/**
 * T808 (AC-456): the editor offers the tab's source's schemas, tables and
 * columns that match what is typed, from the names introspection has read:
 * the schema browser's kept answers, nothing asked for anew.
 * Fails when: a column of a table already read isn't offered when its first
 * letters are typed.
 */
const KEY = ['sql-catalog', 'emea', 3] as const;
const table = (schema: string, name: string) => ({ schema, name, type: 'table', rawType: null });

/** The schema browser's answers, kept as it keeps them (SchemaBrowser.tsx). */
function readSoFar() {
  const client = new QueryClient();
  client.setQueryData([...KEY, 'schemas'], { schemas: [{ name: 'public' }, { name: 'sales' }] });
  client.setQueryData([...KEY, 'tables', 'public'], {
    pages: [{ tables: [table('public', 'customers'), table('public', 'orders')], total: 2 }],
    pageParams: [0],
  });
  client.setQueryData([...KEY, 'tables', 'sales'], {
    pages: [{ tables: [table('sales', 'Targets')], total: 1 }],
    pageParams: [0],
  });
  client.setQueryData(
    [...KEY, 'columns', 'public', 'customers'],
    [
      { name: 'id', rawType: 'integer', primaryKey: true },
      { name: 'country', rawType: 'text' },
    ],
  );
  // Another data source's names are not this one's.
  client.setQueryData(['sql-catalog', 'apac', 1, 'schemas'], { schemas: [{ name: 'custom_apac' }] });
  return client;
}

/** What the editor offers at the end of `text`, typed (not asked for with a key). */
function offered(client: QueryClient, text: string): readonly string[] {
  const state = EditorState.create({ doc: text, extensions: [sql({ dialect: PostgreSQL })] });
  const source = schemaCompletion(() => catalogRead(client, 'emea'), PostgreSQL);
  const result = source(new CompletionContext(state, text.length, false)) as CompletionResult | null;
  if (result === null) return [];
  const typed = text.slice(result.from).toLowerCase();
  return result.options.map((option) => option.label).filter((label) => label.toLowerCase().startsWith(typed));
}

describe('autocomplete from the names read (T808, AC-456)', () => {
  it('typing cust offers customers', () => {
    expect(offered(readSoFar(), 'SELECT * FROM cust')).toEqual(['customers']);
  });

  it('after customers., offers the columns read so far', () => {
    expect(offered(readSoFar(), 'SELECT customers.')).toEqual(['id', 'country']);
    expect(offered(readSoFar(), 'SELECT customers.co')).toEqual(['country']);
  });

  it('offers schemas, and a schema’s tables after its name', () => {
    expect(offered(readSoFar(), 'SELECT * FROM sa')).toEqual(['sales']);
    expect(offered(readSoFar(), 'SELECT * FROM public.')).toEqual(['customers', 'orders']);
    expect(offered(readSoFar(), 'SELECT public.customers.')).toEqual(['id', 'country']);
  });

  it('a table’s columns through its alias', () => {
    expect(offered(readSoFar(), 'SELECT c.')).toEqual([]);
    const text = 'SELECT * FROM customers c WHERE c.';
    expect(offered(readSoFar(), text)).toEqual(['id', 'country']);
  });

  it('offers nothing of a table whose columns aren’t read, nor another source’s names', () => {
    expect(offered(readSoFar(), 'SELECT orders.')).toEqual([]);
    expect(offered(readSoFar(), 'SELECT * FROM custom_')).toEqual([]);
  });

  it('puts in a name the dialect must quote, quoted', () => {
    const client = readSoFar();
    const state = EditorState.create({ doc: 'SELECT * FROM Tar', extensions: [sql({ dialect: PostgreSQL })] });
    const result = schemaCompletion(() => catalogRead(client, 'emea'), PostgreSQL)(
      new CompletionContext(state, state.doc.length, false),
    ) as CompletionResult;
    expect(result.options.find((option) => option.label === 'Targets')?.apply).toBe('"Targets"');
  });

  it('reads the latest version’s names where the settings changed', () => {
    const client = readSoFar();
    client.setQueryData(['sql-catalog', 'emea', 4, 'schemas'], { schemas: [{ name: 'public' }] });
    client.setQueryData(['sql-catalog', 'emea', 4, 'tables', 'public'], {
      pages: [{ tables: [table('public', 'customers_v2')], total: 1 }],
      pageParams: [0],
    });
    expect(offered(client, 'SELECT * FROM cust')).toEqual(['customers_v2']);
  });

  it('offers nothing with nothing read', () => {
    expect(offered(new QueryClient(), 'SELECT * FROM cust')).toEqual([]);
  });
});
