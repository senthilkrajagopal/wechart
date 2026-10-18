import { nameInUse, nameKey, nameProblem } from '@wechart/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { stringify } from 'yaml';

import { CloseIcon } from '../../shell/paneIcons';
import { StateLine } from '../../shell/StatusIcon';
import type { SqlColumn } from '../data-sources/SqlResult';
import { TargetTree } from '../data-sources/TargetTree';
import { PersonIcon } from '../explore/WorkspaceBand';
import { modelFilesQuery } from '../model/FileList';
import { objectsOf } from '../model/objects';
import { publishModel, refusedText } from '../model/publish';
import { targetsOf } from '../model/workspaceModels';
import {
  columnKinds,
  cubeTypeOf,
  DIMENSION_TYPES,
  MEASURE_TYPES,
  memberNameOf,
  type ColumnRow,
} from './columnKinds';
import { writeValuesIn } from './literalSql';
import type { MakeKind } from './ResultHead';
import type { RunParameter } from './tabs';
import { placeOf, type SqlSourceRow } from './sources';

/** My workspace's root, as the API names it to the client (T343). */
const MINE = 'mine';
const NOTE =
  'Whoever queries this cube reads it through Cube, as the data source’s serving login, with folder permissions and access policies applying. The SQL runner’s caps don’t apply.';

/** A column the grammar doesn't take, quoted as its database quotes a name. */
function columnSql(column: string, driver: string | null): string {
  if (/^[a-z_][a-z0-9_]*$/.test(column)) return `{CUBE}.${column}`;
  if (driver === 'mysql' || driver === 'bigquery') return `{CUBE}.\`${column.replace(/`/g, '``')}\``;
  if (driver === 'mssql') return `{CUBE}.[${column.replace(/]/g, ']]')}]`;
  return `{CUBE}."${column.replace(/"/g, '""')}"`;
}

/**
 * The SQL a cube reads: what ran, without a closing semicolon, which Cube's
 * subquery can't hold; ending on a line comment, with a new line after it,
 * so the comment closes before the subquery does (T820's review).
 */
export function cubeSqlOf(sql: string): string {
  const ran = sql.trim().replace(/;\s*$/, '').trimEnd();
  return /--[^\n]*$/.test(ran) ? `${ran}\n` : ran;
}

/**
 * The SQL as a YAML model's `sql` holds it (research `cube/data-modeling.md`,
 * "Literal braces in YAML are escaped as `\{` and `\}`"): Cube reads the value
 * as a Python f-string, so each brace the SQL holds is written escaped; and
 * no `{{` or `}}` is left for Cube to render the file as Jinja first. Each
 * backslash is doubled too: Cube makes the f-string's text a JavaScript
 * template's, whose escapes are evaluated (research `sql-literals.md`,
 * "Cube's YAML sql"), so `\d` would reach the database as `d`.
 */
const escapedForCube = (sql: string) => sql.replace(/[\\{}]/g, (character) => `\\${character}`);

/** Why the SQL, its values written in, can't be a cube's as it is; none where it can (T820's review). */
function sqlProblem(sql: string): string | undefined {
  // `{%` escaped is still `{%`, which makes Cube render the whole file as a template.
  if (sql.includes('{%'))
    return 'Its SQL holds “{%”, which Cube reads as the start of a template. Write it another way, and run it again.';
  return undefined;
}

/**
 * The draft's one file (research `cube/data-modeling.md` §1, §4, §5): a cube
 * defined by the SQL that ran, on the run's data source, each column
 * included as the pane has it, and Cube's `count`, as Generate cubes adds
 * one (AC-139).
 */
export function cubeFileOf({
  name,
  sql,
  source,
  rows,
}: {
  readonly name: string;
  readonly sql: string;
  readonly source: Pick<SqlSourceRow, 'name' | 'driver'>;
  readonly rows: readonly ColumnRow[];
}): string {
  const included = rows.filter((row) => row.include);
  const member = (row: ColumnRow) => ({
    name: row.member,
    sql: columnSql(row.column, source.driver),
    type: row.type,
    ...(row.key ? { primary_key: true } : {}),
  });
  const dimensions = included.filter((row) => row.kind === 'dimension').map(member);
  const measures = [
    { name: 'count', type: 'count' },
    ...included.filter((row) => row.kind === 'measure').map(member),
  ];
  return stringify(
    {
      cubes: [
        {
          name,
          sql: escapedForCube(cubeSqlOf(sql)),
          data_source: source.name,
          ...(dimensions.length === 0 ? {} : { dimensions }),
          measures,
        },
      ],
    },
    { lineWidth: 0 },
  );
}

/** Why the columns can't make a cube as they are; none where they can. */
function columnsProblem(rows: readonly ColumnRow[]): string | undefined {
  const included = rows.filter((row) => row.include);
  if (included.length === 0) return 'Include at least one column.';
  const seen = new Set<string>(['count']);
  for (const row of included) {
    const problem = nameProblem(row.member, 'cube');
    if (row.member === '' || problem !== undefined)
      return problem ?? 'Give each column a member name.';
    if (seen.has(nameKey(row.member)))
      return `Two members are named “${row.member}”: give each its own name.`;
    seen.add(nameKey(row.member));
  }
  if (!included.some((row) => row.key)) return 'Choose its primary key among the columns it includes.';
  return undefined;
}

/** What was added, for the workspace to say and open. */
export interface Added {
  readonly kind: MakeKind;
  readonly name: string;
  readonly path: string;
  readonly targetFolderId: string;
}

/**
 * Make a cube from this query (T820, AC-462; design 17 §6): the docked pane,
 * headed as Generate cubes' is (T691-4) with "in My workspace", holding the
 * cube's name, the folder it is to go to, the run's data source, fixed, the
 * SQL that ran, read-only, and a row per column. Add to My workspace saves
 * it into the workspace's model, unpublished, through the route New cube's
 * save takes there; it reaches a folder only through a proposal.
 */
export function MakeCubePane({
  kind,
  source,
  sql: ran,
  parameters = [],
  columns,
  suggested,
  onClose,
  onAdded,
}: {
  readonly kind: MakeKind;
  readonly source: SqlSourceRow;
  /** The SQL that ran: only the selection, when a selection ran. */
  readonly sql: string;
  /** The parameter values the run sent, written in as literals (T822). */
  readonly parameters?: readonly RunParameter[];
  readonly columns: readonly SqlColumn[];
  /** What the name is suggested from: the tab's name. */
  readonly suggested: string;
  readonly onClose: () => void;
  readonly onAdded: (added: Added) => void;
}) {
  const ids = useId();
  const queryClient = useQueryClient();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [name, setName] = useState(() => memberNameOf(suggested, new Set()));
  const [rows, setRows] = useState<ColumnRow[]>(() => columnKinds(columns));
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const targets = useQuery({ queryKey: ['folder-targets'], queryFn: targetsOf });
  // My workspace's own drafts, whose names it can't take (AC-422).
  const own = useQuery(modelFilesQuery(MINE));
  /** The data source's own folder where the user may write there; else none (AC-462). */
  const start =
    !source.inWorkspace && (targets.data ?? []).some((target) => target.id === source.folderId)
      ? source.folderId
      : '';
  const target = chosen ?? start;

  const path = `cubes/${name}.yml`;
  const heldHere =
    own.data?.some(
      (file) =>
        file.path === path ||
        objectsOf(file.path, file.content).objects.some((each) => nameKey(each.name) === nameKey(name)),
    ) === true;
  const nameError = nameProblem(name, 'cube') ?? (heldHere ? nameInUse(name) : undefined);
  const columnsError = columnsProblem(rows);
  // The run's values written in as literals, in its driver's escaping, or why they can't be (T822).
  const withValues = writeValuesIn(ran, source.driver, parameters);
  const sql = 'refused' in withValues ? ran : withValues.sql;
  const sqlError = 'refused' in withValues ? withValues.refused : sqlProblem(sql);
  /** Why Add is held where nothing else on the pane says so. */
  const held = own.isError
    ? 'My workspace’s model couldn’t be read, so whether the name is free isn’t known. Try again.'
    : targets.isSuccess && targets.data.length > 0 && target === ''
      ? 'Choose the folder it is to go to.'
      : undefined;
  const ready =
    !busy &&
    nameError === undefined &&
    columnsError === undefined &&
    sqlError === undefined &&
    target !== '' &&
    own.isSuccess;

  const change = (at: number, next: (row: ColumnRow) => ColumnRow) => {
    setRows((now) => now.map((row, index) => (index === at ? next(row) : row)));
  };
  /** One key: a dimension, of its database type's where it was a measure. */
  const keyAt = (at: number) => {
    setRows((now) =>
      now.map((row, index) => {
        if (index !== at) return { ...row, key: false };
        const type = row.kind === 'dimension' ? row.type : cubeTypeOf(columns[index]?.type ?? null);
        return { ...row, key: true, include: true, kind: 'dimension', type };
      }),
    );
  };

  const addIt = async () => {
    if (!ready) return;
    setBusy(true);
    setRefused(null);
    const content = cubeFileOf({ name, sql, source, rows });
    const outcome = await publishModel([{ path, content }], {
      created: [path],
      folderId: MINE,
      targetFolderId: target,
    });
    setBusy(false);
    if (outcome.kind === 'published') {
      void queryClient.invalidateQueries({ queryKey: modelFilesQuery(MINE).queryKey });
      onAdded({ kind, name, path, targetFolderId: target });
      return;
    }
    setRefused(
      outcome.kind === 'refused'
        ? refusedText(outcome.problems, outcome.hidden)
        : outcome.message,
    );
  };

  // Make a chart… is the same pane, its primary Add and make a chart (design 17 §6).
  const title = 'Make a cube from this query';
  return (
    <aside
      role="dialog"
      aria-label={`${title} · in My workspace`}
      className="source-pane sql-make"
      data-testid="make-cube-pane"
    >
      <header className="source-pane__head">
        <h2 ref={heading} tabIndex={-1}>
          {title}
        </h2>
        <span className="source-pane__where">
          <PersonIcon />
          in My workspace
        </span>
        <button type="button" className="icon-button source-pane__close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      <div className="source-pane__body sql-make__body">
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-name`}>
            Cube name
          </label>
          <input
            id={`${ids}-name`}
            className="sql-make__name"
            value={name}
            aria-invalid={nameError === undefined ? undefined : true}
            aria-describedby={nameError === undefined ? undefined : `${ids}-name-error`}
            onChange={(event) => {
              setName(event.target.value);
              setRefused(null);
            }}
          />
          {nameError === undefined ? null : (
            <p id={`${ids}-name-error`} className="field__error" data-testid="make-cube-name-error">
              {nameError}
            </p>
          )}
        </div>
        {targets.isError ? (
          <StateLine kind="err">The folders it may go to couldn’t be read: {targets.error.message}</StateLine>
        ) : targets.data === undefined ? (
          <StateLine kind="run">Reading the folders it may go to…</StateLine>
        ) : targets.data.length === 0 ? (
          <StateLine kind="err">
            You have read-write access to no shared folder, so there is nowhere for it to go.
          </StateLine>
        ) : (
          <div className="sql-make__target">
            <TargetTree targets={targets.data} chosen={target} onChoose={setChosen} describedBy={`${ids}-target-note`} />
            <p id={`${ids}-target-note`} className="connection-form__note">
              It stays private in My workspace until you propose it to the folder.
            </p>
          </div>
        )}
        <div className="field">
          <span className="field__label">Data source</span>
          <p className="sql-make__fixed" data-testid="make-cube-source">
            {source.name} · {placeOf(source)}
          </p>
        </div>
        <div className="field">
          <span className="field__label" id={`${ids}-sql`}>
            SQL
          </span>
          <pre className="sql-make__sql" aria-labelledby={`${ids}-sql`} data-testid="make-cube-sql">
            {cubeSqlOf(sql)}
          </pre>
          {'written' in withValues && withValues.written ? (
            <p className="connection-form__note" data-testid="make-cube-sql-note">
              The run’s parameter values are written in as literals.
            </p>
          ) : null}
          {sqlError === undefined ? null : (
            <p className="field__error" data-testid="make-cube-sql-error">
              {sqlError}
            </p>
          )}
        </div>
        <div className="sql-make__columns">
          <table className="sql-make__table" aria-label="Columns">
            <thead>
              <tr>
                <th scope="col">Include</th>
                <th scope="col">Member</th>
                <th scope="col">Kind</th>
                <th scope="col">Cube type</th>
                <th scope="col">Key</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, at) => (
                <tr key={String(at)}>
                  <td>
                    <input
                      type="checkbox"
                      checked={row.include}
                      aria-label={`Include ${row.column}`}
                      onChange={(event) => {
                        const include = event.target.checked;
                        change(at, (now) => ({ ...now, include, key: include && now.key }));
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="sql-make__member"
                      value={row.member}
                      aria-label={`Member name for ${row.column}`}
                      onChange={(event) => {
                        const member = event.target.value;
                        change(at, (now) => ({ ...now, member }));
                      }}
                    />
                  </td>
                  <td>
                    <select
                      value={row.kind}
                      aria-label={`Dimension or measure, ${row.column}`}
                      disabled={row.key}
                      onChange={(event) => {
                        const to = event.target.value;
                        change(at, (now): ColumnRow =>
                          to === 'measure'
                            ? { ...now, kind: 'measure', type: 'sum' }
                            : { ...now, kind: 'dimension', type: cubeTypeOf(columns[at]?.type ?? null) },
                        );
                      }}
                    >
                      <option value="dimension">Dimension</option>
                      <option value="measure">Measure</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={row.type}
                      aria-label={`Cube type, ${row.column}`}
                      onChange={(event) => {
                        const type = event.target.value;
                        change(at, (now): ColumnRow =>
                          now.kind === 'measure'
                            ? { ...now, type: type as (typeof MEASURE_TYPES)[number] }
                            : { ...now, type: type as (typeof DIMENSION_TYPES)[number] },
                        );
                      }}
                    >
                      {(row.kind === 'measure' ? MEASURE_TYPES : DIMENSION_TYPES).map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="radio"
                      name={`${ids}-key`}
                      checked={row.key}
                      aria-label={`Primary key, ${row.column}`}
                      onChange={() => {
                        keyAt(at);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {columnsError === undefined ? null : (
            <p className="field__error" data-testid="make-cube-columns-error">
              {columnsError}
            </p>
          )}
          <p className="connection-form__note">It gets a count measure too, as generated cubes do.</p>
        </div>
        <p className="connection-form__note">{NOTE}</p>
      </div>
      <footer className="source-pane__foot">
        {refused === null ? null : (
          <p className="source-pane__foot-note is-err" role="alert">
            {refused}
          </p>
        )}
        {refused !== null || held === undefined ? null : (
          <p className="source-pane__foot-note" data-testid="make-cube-held">
            {held}
          </p>
        )}
        <span className="source-pane__spacer" />
        <button type="button" className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          aria-disabled={ready ? undefined : 'true'}
          onClick={() => void addIt()}
        >
          {busy ? 'Adding…' : kind === 'cube' ? 'Add to My workspace' : 'Add and make a chart'}
        </button>
      </footer>
    </aside>
  );
}
