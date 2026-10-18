import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import {
  expiresText,
  McpServerUrl,
  RevokedIcon,
  stoppedText,
  TokenScopeTags,
} from '../../account/AccessTokensPage';
import { RevokeTokenDialog } from '../../account/RevokeTokenDialog';
import {
  EVERYONES_TOKENS_QUERY,
  revokeAnyonesToken,
  SCOPES,
  TOKENS_QUERY,
  type AnyonesToken,
  type TokenScope,
} from '../../account/tokensApi';
import { ExportedToast } from '../../dashboard/export/ExportedToast';
import { dayOf, exactOf, whenOf } from '../../shell/formatTime';
import { ME_QUERY } from '../../shell/me';
import { StateLine, StatusIcon } from '../../shell/StatusIcon';

type StateFilter = 'working' | 'stopped' | 'any';
interface Filters {
  /** An owner's key; empty for anyone. */
  readonly user: string;
  readonly state: StateFilter;
  readonly scope: TokenScope | '';
  readonly search: string;
}
/** Working, at the start, as screen 4 draws it. */
const START: Filters = { user: '', state: 'working', scope: '', search: '' };

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** "3 working tokens · 3 people", as screen 4 counts what's shown. */
function countOf(shown: readonly AnyonesToken[], state: StateFilter): string {
  const kind = state === 'working' ? 'working ' : state === 'stopped' ? 'stopped ' : '';
  const people = new Set(shown.map((token) => token.owner.key)).size;
  return `${plural(shown.length, `${kind}token`, `${kind}tokens`)} · ${plural(people, 'person', 'people')} · newest first`;
}

/**
 * Security › Access tokens (T772, AC-470; design 18, screen 4 and state F):
 * every user's tokens, to a Super-Admin alone (the surface's gate). The
 * owner first, then the fields of the owner's own list, never the text.
 * Filters by user, state and scope, combined with AND, and a search over
 * names. Revoke on any working row names the owner and the token, and has
 * AC-431's effect: the owner sees this Super-Admin as who revoked it.
 */
export function AccessTokensTab() {
  const queries = useQueryClient();
  const me = useQuery({ ...ME_QUERY, retry: false });
  const list = useQuery(EVERYONES_TOKENS_QUERY);
  const [filters, setFilters] = useState<Filters>(START);
  const [revoking, setRevoking] = useState<AnyonesToken | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const firstFilter = useRef<HTMLSelectElement>(null);
  const [toast, setToast] = useState('');
  /**
   * After a revoke, once the list is read again: the next row's Revoke, else
   * the list (design 18's keyboard table), as the owner's page does.
   */
  const focusAfter = useRef<{ readonly next: string | null } | null>(null);
  const table = useRef<HTMLTableElement>(null);
  const now = new Date();
  const tokens = list.data?.tokens ?? [];
  const refresh = async () => {
    await queries.invalidateQueries({ queryKey: EVERYONES_TOKENS_QUERY.queryKey });
    // The Super-Admin's own list too, should it hold the token.
    await queries.invalidateQueries({ queryKey: TOKENS_QUERY.queryKey, exact: true });
  };
  useEffect(() => {
    const target = focusAfter.current;
    if (target === null || list.isFetching) return;
    focusAfter.current = null;
    const button =
      target.next === null
        ? null
        : document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(target.next)}"]`);
    if (button !== null) button.focus();
    else if (table.current !== null) table.current.focus();
    else firstFilter.current?.focus();
  }, [list.data, list.isFetching]);

  const owners = [
    ...new Map(tokens.map((token) => [token.owner.key, token.owner.name] as const)),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const search = filters.search.trim().toLocaleLowerCase();
  const shown = tokens.filter(
    (token) =>
      (filters.user === '' || token.owner.key === filters.user) &&
      (filters.state === 'any' || (filters.state === 'working') === (token.state === 'working')) &&
      (filters.scope === '' || token.scopes.includes(filters.scope)) &&
      (search === '' || token.name.toLocaleLowerCase().includes(search)),
  );
  const filtered =
    filters.user !== START.user ||
    filters.state !== START.state ||
    filters.scope !== START.scope ||
    filters.search !== START.search;
  const clear = () => {
    setFilters(START);
    firstFilter.current?.focus();
  };
  const clearButton = (
    <button type="button" className="link-button" onClick={clear}>
      Clear filters
    </button>
  );

  return (
    <section className="tokens-tab" aria-label="Access tokens">
      <div className="sources-filters tokens-tab__filters">
        <Pill label="User">
          {(id) => (
            <select
              id={id}
              ref={firstFilter}
              value={filters.user}
              onChange={(event) => {
                setFilters({ ...filters, user: event.target.value });
              }}
            >
              <option value="">Anyone</option>
              {owners.map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </Pill>
        <Pill label="State">
          {(id) => (
            <select
              id={id}
              value={filters.state}
              onChange={(event) => {
                setFilters({ ...filters, state: event.target.value as StateFilter });
              }}
            >
              <option value="working">Working</option>
              <option value="stopped">No longer working</option>
              <option value="any">Any</option>
            </select>
          )}
        </Pill>
        <Pill label="Scope">
          {(id) => (
            <select
              id={id}
              value={filters.scope}
              onChange={(event) => {
                setFilters({ ...filters, scope: event.target.value as TokenScope | '' });
              }}
            >
              <option value="">Any</option>
              {SCOPES.map((scope) => (
                <option key={scope.id} value={scope.id}>
                  {scope.label}
                </option>
              ))}
            </select>
          )}
        </Pill>
        <input
          type="search"
          className="tokens-tab__search"
          aria-label="Search token names"
          placeholder="Search token names"
          value={filters.search}
          onChange={(event) => {
            setFilters({ ...filters, search: event.target.value });
          }}
        />
        {filtered ? clearButton : null}
        <p className="tokens-tab__count" role="status">
          {list.data === undefined ? '' : countOf(shown, filters.state)}
        </p>
      </div>

      {list.isPending ? (
        <StateLine kind="run">Reading the tokens…</StateLine>
      ) : list.isError ? (
        <div className="account-page__error">
          <StateLine kind="err" role="alert">
            The tokens couldn’t be read.
          </StateLine>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void list.refetch();
            }}
          >
            Try again
          </button>
        </div>
      ) : shown.length === 0 ? (
        // State F3.
        <p className="tokens-tab__none">
          {/* D1's words for none at all; F3's for none matching. */}
          {tokens.length === 0 ? 'No access tokens' : 'No token matches these filters.'}{' '}
          {filtered ? clearButton : null}
        </p>
      ) : (
        <div className="table-scroll">
          <table
            ref={table}
            className="grid-table tokens-table"
            aria-label="Everyone’s tokens"
            tabIndex={-1}
          >
            <thead>
              <tr>
                <th scope="col">Owner</th>
                <th scope="col">Name</th>
                <th scope="col">Scopes</th>
                <th scope="col">Made</th>
                <th scope="col">Expires</th>
                <th scope="col">Last used</th>
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((token) => (
                <AnyonesRow
                  key={token.id}
                  token={token}
                  now={now}
                  onRevoke={(button) => {
                    opener.current = button;
                    setRevoking(token);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Where MCP is served, or that it isn't (T774, AC-476). */}
      {list.data === undefined ? null : <McpServerUrl url={list.data.mcpUrl} />}

      <p className="account-page__once">
        <b>A token’s text is never shown here,</b> or anywhere after it’s made. Revoking one stops
        every client using it at once. Each revoke is recorded in the audit trail with your name.
      </p>

      {revoking === null ? null : (
        <RevokeTokenDialog
          title={`Revoke ${revoking.owner.name}’s token “${revoking.name}”?`}
          body={
            revoking.yours
              ? 'Every MCP client using it stops working at once: wechart answers it with 401 and runs nothing. It can’t be turned back on; you can make a new one.'
              : `Every MCP client using it stops working at once: wechart answers it with 401 and runs nothing. It can’t be turned back on; ${firstName(revoking.owner.name)} can make a new one.`
          }
          revoke={() =>
            revokeAnyonesToken(revoking.id).catch((error: unknown) => {
              void refresh();
              throw error;
            })
          }
          onRevoked={() => {
            setToast(
              `Revoked ${revoking.owner.name}’s “${revoking.name}”. Clients using it now get 401.`,
            );
            const revokable = shown.filter((token) => token.state === 'working');
            const at = revokable.findIndex((token) => token.id === revoking.id);
            const next = (revokable[at + 1] ?? revokable[at - 1])?.id;
            focusAfter.current = { next: next === undefined ? null : `revoke:${next}` };
            setRevoking(null);
            void refresh();
          }}
          onClose={() => {
            setRevoking(null);
            if (opener.current?.isConnected === true) opener.current.focus();
            else firstFilter.current?.focus();
          }}
        >
          <RevokeDetails token={revoking} me={me.data?.name} now={now} />
        </RevokeTokenDialog>
      )}
      <ExportedToast
        message={toast}
        onDismiss={() => {
          setToast('');
        }}
      />
    </section>
  );
}

const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

/** Screen 4's facts in the dialog: its scopes, when last used, and what the owner will see. */
function RevokeDetails({
  token,
  me,
  now,
}: {
  readonly token: AnyonesToken;
  readonly me: string | undefined;
  readonly now: Date;
}) {
  const ids = useId();
  const used = token.lastUsedAt === null ? 'Never' : whenOf(new Date(token.lastUsedAt), now);
  const scopes = SCOPES.filter((scope) => token.scopes.includes(scope.id))
    .map((scope) => scope.label)
    .join(', ');
  const rows: [string, string][] = [
    ['Scopes', scopes],
    ['Last used', used],
  ];
  if (!token.yours && me !== undefined)
    rows.push([
      `${firstName(token.owner.name)} sees`,
      `“Revoked · by ${me}, ${dayOf(now, now)}” in their list`,
    ]);
  return (
    <dl className="tokens-tab__facts">
      {rows.map(([term, value], index) => (
        <div key={term}>
          <dt id={`${ids}-${String(index)}`}>{term}</dt>
          <dd aria-labelledby={`${ids}-${String(index)}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function AnyonesRow({
  token,
  now,
  onRevoke,
}: {
  readonly token: AnyonesToken;
  readonly now: Date;
  readonly onRevoke: (button: HTMLButtonElement) => void;
}) {
  const made = new Date(token.createdAt);
  const expires = new Date(token.expiresAt);
  const used = token.lastUsedAt === null ? null : new Date(token.lastUsedAt);
  let state: ReactNode;
  if (token.state === 'working' || token.stoppedAt === null) state = expiresText(expires, now);
  else
    state = (
      <span className="token-state">
        {token.state === 'expired' ? <StatusIcon kind="idle" /> : <RevokedIcon />}
        {stoppedText(
          { state: token.state, stoppedAt: token.stoppedAt, revokedBy: token.revokedBy },
          now,
        )}
      </span>
    );
  return (
    <tr className={token.state === 'working' ? undefined : 'tokens-table__stopped'}>
      <td>
        {token.owner.name}
        {token.yours ? <span className="tokens-table__you"> · you</span> : null}
      </td>
      <td className="tokens-table__name">{token.name}</td>
      <td>
        <TokenScopeTags scopes={token.scopes} />
      </td>
      <td title={exactOf(made)}>{dayOf(made, now)}</td>
      <td title={exactOf(token.stoppedAt === null ? expires : new Date(token.stoppedAt))}>
        {state}
      </td>
      <td {...(used === null ? {} : { title: exactOf(used) })}>
        {used === null ? 'Never' : whenOf(used, now)}
      </td>
      <td className="tokens-table__act">
        {token.state === 'working' ? (
          <button
            type="button"
            className="btn btn-sm btn-danger"
            aria-label={`Revoke ${token.owner.name}’s ${token.name}`}
            data-focus-key={`revoke:${token.id}`}
            onClick={(event) => {
              onRevoke(event.currentTarget);
            }}
          >
            Revoke
          </button>
        ) : null}
      </td>
    </tr>
  );
}

function Pill({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <span className="select-pill">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </span>
  );
}
