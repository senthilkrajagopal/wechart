import { useQuery } from '@tanstack/react-query';

import { MODEL_FILES_QUERY } from '../model/FileList';
import { AuthWarning } from './AuthWarning';
import { ContextPreview } from './ContextPreview';
import {
  conditionsText,
  groupsText,
  maskingText,
  membersText,
  policiesOf,
  rowsText,
  type Policy,
} from './policies';

/**
 * The Security workspace (F19): the model's access policies, listed as
 * declared (T171, AC-165), as the prototype's Security page lists them — one
 * row each, naming the file it is declared in — then the cubes and views with
 * none, which are open to every security context. Policies are authored in
 * the Model workspace; users and groups come in phase 2. Beside them, the
 * prototype's right pane: a security context to preview dashboards as (T172).
 */
export function SecurityPage() {
  // The files as the Model workspace reads them: fresh on each visit.
  const files = useQuery({ ...MODEL_FILES_QUERY, refetchOnMount: 'always' });

  const rows: { policy: Policy; path: string }[] = [];
  const open: string[] = [];
  const unread: string[] = [];
  for (const file of files.data ?? []) {
    const read = policiesOf(file.path, file.content);
    for (const policy of read.policies) rows.push({ policy, path: file.path });
    for (const object of read.open) open.push(object.name);
    if (read.code !== undefined) unread.push(`${file.path} (${read.code})`);
    if (read.problem !== undefined) unread.push(`${file.path} (${read.problem})`);
  }

  // The groups the policies name, to write a previewed context against.
  const groups = [...new Set(rows.flatMap(({ policy }) => policy.groups))];

  return (
    <div className="security-layout">
      <div className="security-workspace">
        <h1>Access policies</h1>
        {/* Whether Cube refuses requests nobody signed (T175, AC-169): said
            whatever becomes of the model's files, and in one place, so it is
            not put up again — and announced again — when they arrive. */}
        <AuthWarning />
        {files.isPending ? (
          <p>Reading the model…</p>
        ) : files.isError ? (
          <p role="alert">{files.error.message}</p>
        ) : (
          <PolicyList rows={rows} open={open} unread={unread} />
        )}
      </div>
      <ContextPreview groups={groups} />
    </div>
  );
}

/** The policies as declared, the objects open for want of one, and the files not read. */
function PolicyList({
  rows,
  open,
  unread,
}: {
  rows: readonly { policy: Policy; path: string }[];
  open: readonly string[];
  unread: readonly string[];
}) {
  return (
    <>
      <p className="security-workspace__note">
        Users and groups come in phase 2. In phase 1, policies are authored in the model, and a
        security context&rsquo;s groups decide which apply.
      </p>
      {rows.length === 0 ? (
        <p>The model declares no access policies.</p>
      ) : (
        <table className="query-log" aria-label="Access policies">
          <thead>
            <tr>
              <th scope="col">Cube / view</th>
              <th scope="col">Group</th>
              <th scope="col">Members</th>
              <th scope="col">Rows</th>
              <th scope="col">Conditions</th>
              <th scope="col">Masked</th>
              <th scope="col">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ policy, path }, index) => (
              // Positions: one object may declare several policies for one group.
              <tr key={`${path}:${String(index)}`}>
                <td className="query-log__query">{policy.object}</td>
                <td className="query-log__query">{groupsText(policy)}</td>
                <td>{membersText(policy.memberLevel)}</td>
                <td>{rowsText(policy.rowLevel)}</td>
                <td className="query-log__query">{conditionsText(policy.conditions)}</td>
                <td>{maskingText(policy.memberMasking)}</td>
                <td className="query-log__query">{path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open.length === 0 ? null : (
        <p data-testid="policies-open">
          No access_policy, so open to every security context: {open.join(', ')}.
        </p>
      )}
      {unread.length === 0 ? null : (
        // Their policies are not listed here, and are said not to be.
        <p data-testid="policies-unread">
          Not read here: {unread.join('; ')}. Any policies in these files are not listed.
        </p>
      )}
    </>
  );
}
