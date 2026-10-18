import { useQuery } from '@tanstack/react-query';

import { StateLine } from '../../shell/StatusIcon';
import { SchemaBrowser } from '../data-sources/SchemaBrowser';
import { sourceQuery } from '../data-sources/SourceSettings';
import type { SqlSourceRow } from './sources';

/**
 * The schema browser in the workspace's left pane (T805, AC-386; design 17,
 * screen 1 pins 4–6 and state C): the open tab's own data source's schemas,
 * tables and columns with their types, read as they're opened, a name
 * chosen going into that tab's editor at its cursor. It is the data source
 * page's tree (T539), shared, so a tab on another source shows that one's.
 *
 * Cube Store has no catalog to browse (design 17, C5, "as built"); an off
 * source, or none chosen, shows nothing here.
 */
export function SchemaTree({
  row,
  onChoose,
}: {
  /** The open tab's data source, as the picker lists it. */
  readonly row: SqlSourceRow | undefined;
  readonly onChoose: (name: string) => void;
}) {
  if (row === undefined || row.runner === 'off') return null;
  if (row.cubeStore)
    return (
      <p className="sql-schema__none">
        Cube Store has no catalog to browse. Its tables are listed in{' '}
        <code>information_schema.tables</code> and <code>system.tables</code>.
      </p>
    );
  return <SourceTree key={row.id} id={row.id} name={row.name} onChoose={onChoose} />;
}

/** A data source's tree, at its settings' version, which a change reads again (T539's review). */
function SourceTree({
  id,
  name,
  onChoose,
}: {
  readonly id: string;
  readonly name: string;
  readonly onChoose: (name: string) => void;
}) {
  const page = useQuery({ ...sourceQuery(id), retry: false });
  if (page.isError) return <StateLine kind="err">{page.error.message}</StateLine>;
  if (page.data === undefined) return null;
  return (
    <SchemaBrowser
      sourceId={id}
      sourceVersion={page.data.version}
      sourceName={name}
      heading={null}
      // Find a table, and PK and FK tags (T806, AC-448).
      extended
      onChoose={onChoose}
    />
  );
}
