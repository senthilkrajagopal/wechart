import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef } from 'react';

import { missingScopeOf, ScopeUnavailable } from '../../query/scopes';
import { MODEL_FILES_QUERY } from '../model/FileList';
import { objectsOf } from '../model/objects';
import { YamlEditor } from '../model/YamlEditor';
import { conditionsText, groupsText, policiesOf, rowsText, type Policy } from './policies';

export interface DeclaredFilter {
  readonly object: string;
  readonly groups: string;
  readonly rows: string;
  readonly conditions: string;
}

/**
 * The cubes and views a query asks for: its members' own, and — for a view —
 * the cubes it takes its members from, whose row filters Cube applies with
 * the view's: "combined together … Both will apply" (research/cube/
 * access-control.md, "Views").
 */
function queriedObjects(
  members: readonly string[],
  viewCubes: Readonly<Record<string, readonly string[]>>,
): Set<string> {
  const named = new Set(members.map((member) => member.split('.')[0] ?? ''));
  for (const object of [...named]) for (const cube of viewCubes[object] ?? []) named.add(cube);
  return named;
}

/**
 * The row filters the model's policies declare for a context's groups, on the
 * cubes and views a query asks for: each policy whose group is one of the
 * context's `groups` — which `contextToGroups` hands Cube (infra/cube/cube.js)
 * — or any group. Declared, not evaluated: its conditions are listed, not
 * judged, and how Cube combines them — a member's rows the union across the
 * policies granting it, intersected across members — shows in its SQL.
 */
export function declaredFiltersFor(
  policies: readonly Policy[],
  context: Readonly<Record<string, unknown>>,
  members: readonly string[],
  /** Each view's cubes, by name. */
  viewCubes: Readonly<Record<string, readonly string[]>> = {},
): DeclaredFilter[] {
  const groups = Array.isArray(context['groups'])
    ? context['groups'].filter((group): group is string => typeof group === 'string')
    : [];
  const objects = queriedObjects(members, viewCubes);
  return policies
    .filter((policy) => objects.has(policy.object))
    .filter((policy) => policy.groups.some((group) => group === '*' || groups.includes(group)))
    .map((policy) => ({
      object: policy.object,
      groups: groupsText(policy),
      rows: rowsText(policy.rowLevel),
      conditions: conditionsText(policy.conditions),
    }));
}

/** Every member a Cube query names: measures, dimensions, time dimensions, filters. */
function membersOf(query: Readonly<Record<string, unknown>>): string[] {
  const listed = (key: string) =>
    Array.isArray(query[key]) ? (query[key] as unknown[]).filter((m) => typeof m === 'string') : [];
  const named = (key: string, field: string) =>
    Array.isArray(query[key])
      ? (query[key] as unknown[]).flatMap((each) =>
          typeof each === 'object' &&
          each !== null &&
          typeof (each as Record<string, unknown>)[field] === 'string'
            ? [(each as Record<string, string>)[field] as string]
            : [],
        )
      : [];
  return [
    ...listed('measures'),
    ...listed('dimensions'),
    ...named('timeDimensions', 'dimension'),
    ...named('filters', 'member'),
  ] as string[];
}

/** Each statement Cube would run for the query: one, unless it runs several. */
interface Generated {
  readonly queries: readonly { readonly sql: string; readonly params: readonly unknown[] }[];
}

/**
 * What the model's files say, for the declared list: every policy, each
 * view's cubes (the last segment of each `join_path` its members come by),
 * and the files whose policies cannot be read from their text — named, so
 * none is left out silently (as the Security page names them, T171).
 */
function modelOf(files: readonly { path: string; content: string }[]) {
  const policies: Policy[] = [];
  const viewCubes: Record<string, string[]> = {};
  const unread: string[] = [];
  for (const file of files) {
    const read = policiesOf(file.path, file.content);
    policies.push(...read.policies);
    if (read.code !== undefined || read.problem !== undefined) unread.push(file.path);
    for (const object of objectsOf(file.path, file.content).objects) {
      if (object.kind !== 'view') continue;
      viewCubes[object.name] = [
        ...new Set(
          object.members
            .filter((member) => member.kind === 'include')
            .map((member) => member.name.split('.').slice(-2, -1)[0] ?? ''),
        ),
      ];
    }
  }
  return { policies, viewCubes, unread };
}

/**
 * A chart's SQL as the previewed security context (T174, AC-168): Cube's own,
 * generated after its policies apply, so the row filters they add are in it —
 * with the values it binds — read-only in the code view the model's files use
 * (research/code-editor.md: `@codemirror/lang-sql`; with nothing to type,
 * no completion). Beside it, the row filters the model's policies declare
 * for the context's groups.
 */
export function GeneratedSql({
  title,
  query,
  context,
  onClose,
}: {
  title: string;
  query: Readonly<Record<string, unknown>>;
  context: Readonly<Record<string, unknown>>;
  onClose: () => void;
}) {
  const heading = useId();
  const close = useRef<HTMLButtonElement>(null);
  const generated = useQuery({
    queryKey: ['generated-sql', query, context],
    queryFn: async ({ signal }): Promise<Generated> => {
      const response = await fetch('/api/sql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, context }),
        signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = (body as { error?: unknown } | null)?.error;
        throw new Error(
          typeof error === 'string' ? error : `Cube answered ${String(response.status)}.`,
        );
      }
      return body as Generated;
    },
    // Asked again each time it is opened: a publish since may have changed
    // the policies, and the list beside it is read fresh (T174's review).
    staleTime: 0,
  });
  const files = useQuery({ ...MODEL_FILES_QUERY, refetchOnMount: 'always' });
  const model = files.isSuccess ? modelOf(files.data) : undefined;
  const declared =
    model === undefined
      ? undefined
      : declaredFiltersFor(model.policies, context, membersOf(query), model.viewCubes);
  const statements = generated.data?.queries.length ?? 0;

  // The latest `onClose`, read by Escape without re-running the effect below —
  // which would take focus back to Close each time the page re-rendered.
  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    close.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="dialog-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={heading}
        className="dialog generated-sql"
      >
        <h2 id={heading}>SQL for {title} as this context</h2>
        {generated.isPending ? <p>Asking Cube for its SQL…</p> : null}
        {!generated.isError ? null : missingScopeOf(generated.error) === undefined ? (
          <p role="alert" className="generated-sql__problem">
            {generated.error.message}
          </p>
        ) : (
          // The previewed context's scope, not wechart's (T176's review).
          <ScopeUnavailable scope={missingScopeOf(generated.error) ?? 'sql'} what="Its SQL" />
        )}
        {generated.isSuccess
          ? generated.data.queries.map(({ sql, params }, index) => (
              // Positions: Cube's statements, in the order it gave them.
              <div key={String(index)} className="generated-sql__query" data-testid="generated-sql">
                <YamlEditor
                  value={sql}
                  onChange={() => undefined}
                  label={
                    statements > 1
                      ? `SQL, statement ${String(index + 1)} of ${String(statements)}`
                      : 'SQL'
                  }
                  readOnly
                  language="sql"
                />
                {params.length === 0 ? null : (
                  // Numbered as Cube binds them, in order — whatever the
                  // database's own placeholder, `$1` or `?`.
                  <p className="generated-sql__params" data-testid="generated-sql-params">
                    Values bound, in order:{' '}
                    {params.map((value, at) => `${String(at + 1)} = ${String(value)}`).join(', ')}
                  </p>
                )}
              </div>
            ))
          : null}
        <h3>Row filters declared for this context</h3>
        <p className="generated-sql__note">
          As the model declares them, not evaluated: Cube gives a member the rows of every policy
          that grants it, and a query the rows all its members share. The SQL above is what that
          came to.
        </p>
        {declared === undefined ? (
          <p>{files.isError ? files.error.message : 'Reading the model…'}</p>
        ) : declared.length === 0 ? (
          <p>No policy on these cubes or views names this context&rsquo;s groups.</p>
        ) : (
          <table className="query-log" aria-label="Row filters declared for this context">
            <thead>
              <tr>
                <th scope="col">Cube / view</th>
                <th scope="col">Group</th>
                <th scope="col">Rows</th>
                <th scope="col">Only if</th>
              </tr>
            </thead>
            <tbody>
              {declared.map((each, index) => (
                <tr key={String(index)}>
                  <td className="query-log__query">{each.object}</td>
                  <td className="query-log__query">{each.groups}</td>
                  <td>{each.rows}</td>
                  <td className="query-log__query">{each.conditions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {model === undefined || model.unread.length === 0 ? null : (
          <p data-testid="generated-sql-unread">
            Not read here: {model.unread.join(', ')}. Any policies in these files apply, and are not
            listed.
          </p>
        )}
        <div className="dialog__actions">
          <button ref={close} type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
