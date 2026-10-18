import type { CompletionSource } from '@codemirror/autocomplete';
import { schemaCompletionSource, type SQLDialect, type SQLNamespace } from '@codemirror/lang-sql';
import type { QueryClient } from '@tanstack/react-query';

/**
 * Autocomplete in the SQL runner's editor (T808, AC-456): the tab's data
 * source's schemas, tables and columns that match what is typed, from the
 * names introspection has read so far, which are the schema browser's kept
 * answers (`SchemaBrowser.tsx`, under `['sql-catalog', id, version, …]`).
 * Nothing is asked for anew: a schema or a table not yet opened offers only
 * what is known of it.
 *
 * Built on `@codemirror/lang-sql`'s `schemaCompletionSource`
 * (research/code-editor.md, addendum 2026-10-17): `schema.table.column`
 * paths, a table's alias in its FROM, and a name the dialect must quote put
 * in quoted.
 *
 * Lane SQL's call (T808-1, decisions-sql.md): every schema's tables are
 * offered by their own names too, as well as after their schema's, since a
 * driver's default schema (public, dbo, a MySQL database) isn't known here.
 * A table whose name is a schema's too is offered under the schema only.
 */

/** A schema browser answer's shapes, as it keeps them. */
interface Schemas {
  readonly schemas: readonly { readonly name: string }[];
}
interface TablePages {
  readonly pages: readonly { readonly tables: readonly { readonly schema: string; readonly name: string }[] }[];
}
type Columns = readonly { readonly name: string }[];

/** A name for lang-sql's namespace, whose dots split a path unless escaped. */
const part = (name: string) => name.replace(/\./g, '\\.');

/** The names read of a data source, at its latest version read, as a lang-sql namespace. */
export function catalogRead(client: QueryClient, sourceId: string): SQLNamespace {
  const kept = client.getQueriesData<unknown>({ queryKey: ['sql-catalog', sourceId] });
  const latest = kept.reduce((most, [key]) => {
    const version = key[2];
    return typeof version === 'number' && version > most ? version : most;
  }, Number.NEGATIVE_INFINITY);
  const schemas = new Map<string, Map<string, string[]>>();
  const schemaOf = (name: string) => {
    let found = schemas.get(name);
    if (found === undefined) {
      found = new Map();
      schemas.set(name, found);
    }
    return found;
  };
  const columns: [string, string, Columns][] = [];
  for (const [key, data] of kept) {
    if (key[2] !== latest || data === undefined) continue;
    const kind = key[3];
    if (kind === 'schemas') for (const { name } of (data as Schemas).schemas) schemaOf(name);
    else if (kind === 'tables' && typeof key[4] === 'string') {
      const tables = schemaOf(key[4]);
      for (const page of (data as TablePages).pages)
        for (const { name } of page.tables) if (!tables.has(name)) tables.set(name, []);
    } else if (kind === 'columns' && typeof key[4] === 'string' && typeof key[5] === 'string')
      columns.push([key[4], key[5], data as Columns]);
  }
  for (const [schema, table, read] of columns) schemaOf(schema).set(table, read.map(({ name }) => name));

  const namespace: Record<string, Record<string, string[]>> = {};
  const byName: Record<string, string[]> = {};
  for (const [schema, tables] of schemas) {
    const inSchema: Record<string, string[]> = {};
    for (const [table, read] of tables) {
      inSchema[part(table)] = read;
      if (!schemas.has(table)) byName[part(table)] = [...new Set([...(byName[part(table)] ?? []), ...read])];
    }
    namespace[part(schema)] = inSchema;
  }
  return { ...byName, ...namespace } as SQLNamespace;
}

/**
 * The editor's completion source: the names read at the moment it is asked,
 * in the tab's source's dialect, which says how a name is quoted.
 */
export function schemaCompletion(read: () => SQLNamespace, dialect: SQLDialect): CompletionSource {
  return (context) => schemaCompletionSource({ schema: read(), dialect })(context);
}
