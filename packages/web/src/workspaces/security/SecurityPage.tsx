import { useQuery } from '@tanstack/react-query';

import { InfoBar } from '../../shell/InfoBar';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';
import { TableScroll } from '../../shell/TableScroll';
import { MODEL_FILES_QUERY } from '../model/FileList';
import { AuditTrail, NO_FILTERS, type AuditFilters } from './AuditTrail';
import { AuthWarning } from './AuthWarning';
import { modelHref } from './dashboardPreview';
import { GroupsPreview } from './GroupsPreview';
import { Scopes } from './Scopes';
import {
  conditionsText,
  groupsText,
  maskingText,
  membersText,
  policiesOf,
  rowsText,
  type Policy,
} from './policies';

/** Security's tabs with sign-in on, each at its own address (T500; design 08, pin 1). */
export type SecurityTab = 'policies' | 'preview' | 'audit';
const TABS: readonly (readonly [SecurityTab, string, string])[] = [
  ['policies', 'Policies', '/security'],
  ['preview', 'Preview as groups', '/security/preview'],
  ['audit', 'Audit trail', '/security/audit'],
];

/**
 * The Security workspace (F19): the model's access policies, listed as
 * declared (T171, AC-165), as the prototype's Security page lists them — one
 * row each, naming the file it is declared in — then the cubes and views with
 * none. Policies are authored in the Model workspace. With sign-in off, beside
 * them, the prototype's right pane: a security context to preview dashboards
 * as (T172); with it on, Security's tabs (T500).
 */
export function SecurityPage({
  signedIn = false,
  tab = 'policies',
  audit,
}: {
  /** The audit trail's filters, as the page's address holds them (T369). */
  readonly audit?: {
    readonly filters: AuditFilters;
    readonly onFilters: (next: AuditFilters) => void;
  };
  /**
   * With sign-in on, Security is the Super-Admins' tabs (T500; design 08).
   * With it off, the single user's, the same tabs (security-Q1, T699).
   */
  readonly signedIn?: boolean;
  readonly tab?: SecurityTab;
} = {}) {
  // The files as the Model workspace reads them: fresh on each visit.
  const files = useQuery({ ...MODEL_FILES_QUERY, refetchOnMount: 'always' });

  const rows: { policy: Policy; path: string }[] = [];
  const open: string[] = [];
  const openObjects: { kind: 'cube' | 'view'; name: string }[] = [];
  const reaches: Record<string, readonly string[]> = {};
  const unread: string[] = [];
  for (const file of files.data ?? []) {
    const read = policiesOf(file.path, file.content);
    for (const policy of read.policies) rows.push({ policy, path: file.path });
    for (const object of read.open) {
      open.push(object.name);
      openObjects.push(object);
    }
    Object.assign(reaches, read.reaches);
    if (read.code !== undefined) unread.push(`${file.path} (${read.code})`);
    if (read.problem !== undefined) unread.push(`${file.path} (${read.problem})`);
  }

  // The groups the policies name, offered as presets to preview as.
  const groups = [...new Set(rows.flatMap(({ policy }) => policy.groups))];

  const policies = (
    <>
      {/* Whether Cube refuses requests nobody signed (T175, AC-169): said
          whatever becomes of the model's files, and in one place, so it is
          not put up again — and announced again — when they arrive. */}
      <AuthWarning />
      {files.isPending ? (
        <StateLine kind="run">Reading the model…</StateLine>
      ) : files.isError ? (
        <StateLine kind="err">{files.error.message}</StateLine>
      ) : (
        <PolicyList rows={rows} open={open} unread={unread} signedIn={signedIn} />
      )}
      {/* The API scopes wechart's own context has (T176, AC-170). */}
      <h2 className="security-workspace__head">Cube API scopes</h2>
      <Scopes />
    </>
  );

  // The same tabs with sign-in off as on: phase 1's floating JSON pane and
  // its "Find a dashboard" are gone (security-Q1, R76; T699, UX-085).
  return (
    <div className="security-workspace security-workspace--tabs">
      <h1 className="workspace-title">Security</h1>
      {/* Tabs as places, each at its own address (pin 1, AC-002). */}
      <nav aria-label="Security" className="security-tabs">
        {TABS.map(([key, label, href]) => (
          <a key={key} href={href} aria-current={key === tab ? 'page' : undefined}>
            {label}
          </a>
        ))}
      </nav>
      {tab === 'audit' ? (
        <AuditTrail
          filters={audit?.filters ?? NO_FILTERS}
          onFilters={audit?.onFilters ?? (() => undefined)}
        />
      ) : tab === 'preview' ? (
        <>
          {/* The model's state said here too: an empty preview isn't "no
                cubes" while the files are read, or after they fail (T500's review). */}
          {files.isPending ? (
            <StateLine kind="run">Reading the model…</StateLine>
          ) : files.isError ? (
            <StateLine kind="err">{files.error.message}</StateLine>
          ) : null}
          {/* As groups, with sign-in on (T438; design 08, state E). */}
          <GroupsPreview
            model={{ declared: rows, open: openObjects, reaches }}
            unread={unread}
            policyGroups={groups}
          />
        </>
      ) : (
        policies
      )}
    </div>
  );
}

/** The policies as declared, the objects open for want of one, and the files not read. */
function PolicyList({
  rows,
  open,
  unread,
  signedIn,
}: {
  rows: readonly { policy: Policy; path: string }[];
  open: readonly string[];
  unread: readonly string[];
  signedIn: boolean;
}) {
  return (
    <>
      {/* What the page is for, with no word of phases (T466, UX-111); with
          sign-in on, where access comes from now (design 08, state F). */}
      <InfoBar>
        {signedIn ? (
          <p>
            Access comes from AD groups set on folders: Cube refuses a folder’s cubes to anyone
            without one of its groups. Within that, the access policies below, written in the model,
            decide rows and members.
          </p>
        ) : (
          <p>
            Access policies are written in the model. The groups a request carries decide which of
            them apply.
          </p>
        )}
      </InfoBar>
      {rows.length === 0 ? <p>The model declares no access policies.</p> : null}
      {rows.length === 0 && open.length === 0 ? null : (
        <TableScroll label="Access policies">
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
                // Identifiers in the code face, as state F draws its cube, group and
                // row filter (T699, SEC-15).
                <tr key={`${path}:${String(index)}`}>
                  <td className="query-log__query is-code">{policy.object}</td>
                  <td className="query-log__query is-code">{groupsText(policy)}</td>
                  <td>{membersText(policy.memberLevel)}</td>
                  <td className="is-code">{rowsText(policy.rowLevel)}</td>
                  <td className="query-log__query is-code">{conditionsText(policy.conditions)}</td>
                  <td>{maskingText(policy.memberMasking)}</td>
                  <td className="query-log__query">
                    {/* Its file, opened in Model where it is authored (AC-232). */}
                    <a href={modelHref(path)}>{path}</a>
                  </td>
                </tr>
              ))}
              {/* Each cube and view with no policy, a row of its own as state F
                  draws "No policy" (T699, SEC-16; security-Q2). */}
              {open.map((name) => (
                <tr key={`open:${name}`}>
                  <td className="query-log__query is-code">{name}</td>
                  <td className="policies__none">
                    {signedIn
                      ? 'No policy: open within its folder’s groups'
                      : 'No policy: open to every security context'}
                  </td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
      {unread.length === 0 ? null : (
        // Their policies are not listed here, and are said not to be.
        <p data-testid="policies-unread" className="state-line">
          <StatusIcon kind="warn" />
          <span>
            Not read here: {unread.join('; ')}. Any policies in these files are not listed.
          </span>
        </p>
      )}
    </>
  );
}
