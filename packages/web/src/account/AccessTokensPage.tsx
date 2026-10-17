import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { ExportedToast } from '../dashboard/export/ExportedToast';
import { clockOf, dayOf, exactOf, whenOf } from '../shell/formatTime';
import { hasWorkspace, ME_QUERY } from '../shell/me';
import { StateLine, StatusIcon } from '../shell/StatusIcon';
import { NewTokenDialog } from './NewTokenDialog';
import { RevokeTokenDialog } from './RevokeTokenDialog';
import { TokenShownOnce } from './TokenShownOnce';
import {
  removeToken,
  revokeToken,
  SCOPES,
  TOKENS_QUERY,
  type AccessToken,
  type MadeToken,
  type StoppedToken,
  type TokenScope,
} from './tokensApi';

const DAY_MS = 86_400_000;

/**
 * The MCP server's address, as the command names it: this origin's `/mcp`
 * until T774 gives the deployment's own MCP host (AC-476).
 */
const mcpUrl = () => `${window.location.origin}/mcp`;
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** "1 Nov · in 15 days", or "Expires today · 17:30" (design 18, D3). */
export function expiresText(expires: Date, now: Date): string {
  if (sameDay(expires, now)) return `Expires today · ${clockOf(expires)}`;
  // Rounded: the server's clock and the browser's may differ by seconds.
  const left = Math.max(1, Math.round((expires.getTime() - now.getTime()) / DAY_MS));
  return `${dayOf(expires, now)} · in ${String(left)} ${left === 1 ? 'day' : 'days'}`;
}

/**
 * Access tokens, the user's own (T769, AC-430, AC-468, AC-469, AC-479;
 * design 18, screen 1 and states D and H): at `/account/tokens`, from the
 * account menu, or the single-user chip's with sign-in off. Each working
 * token's name, its scopes as text tags, when it was made, when it expires
 * and when it was last used; never any part of its text. New token opens
 * screen 2's dialog.
 */
export function AccessTokensPage() {
  const queries = useQueryClient();
  const me = useQuery({ ...ME_QUERY, retry: false });
  const list = useQuery(TOKENS_QUERY);
  const [making, setMaking] = useState(false);
  /** A token just made, its text shown once (T770, AC-430); null once closed. */
  const [shown, setShown] = useState<MadeToken | null>(null);
  const newToken = useRef<HTMLButtonElement>(null);
  /** The token being revoked, asked first (T771, state E), and the button that asked. */
  const [revoking, setRevoking] = useState<AccessToken | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [toast, setToast] = useState('');
  const [removeFailed, setRemoveFailed] = useState<string | null>(null);
  /** The stopped token being removed: its Remove is held, so it's sent once. */
  const [removing, setRemoving] = useState<string | null>(null);
  /**
   * Where focus goes once the list is read again after a row went (design
   * 18's keyboard table): the next row's button, else the list.
   */
  const focusAfter = useRef<{
    readonly button: string | null;
    readonly list: 'working' | 'stopped';
  } | null>(null);
  const workingList = useRef<HTMLElement>(null);
  const stoppedList = useRef<HTMLElement>(null);
  const now = new Date();
  const single = me.data?.security === 'off';
  const refresh = () => queries.invalidateQueries({ queryKey: TOKENS_QUERY.queryKey });
  const working = list.data?.tokens ?? [];
  const stopped = list.data?.stopped ?? [];
  /** The id of the row after `id`'s, or before it for the last; null for the only one. */
  const neighbour = (rows: readonly AccessToken[], id: string) => {
    const at = rows.findIndex((row) => row.id === id);
    return (rows[at + 1] ?? rows[at - 1])?.id ?? null;
  };
  useEffect(() => {
    const target = focusAfter.current;
    if (target === null || list.isFetching) return;
    focusAfter.current = null;
    const button =
      target.button === null
        ? null
        : document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(target.button)}"]`);
    if (button !== null) button.focus();
    else if (target.list === 'stopped' && stoppedList.current !== null) stoppedList.current.focus();
    else workingList.current?.focus();
  }, [list.data, list.isFetching]);

  return (
    <div className="account-page">
      <div className="account-page__head">
        <h1 className="workspace-title">Access tokens</h1>
        <button
          ref={newToken}
          type="button"
          className="btn btn-primary"
          // Held until wechart says who is asking: which scopes are on offer depends on it.
          disabled={me.data === undefined}
          onClick={() => {
            setMaking(true);
          }}
        >
          New token
        </button>
      </div>
      <p className="account-page__lead">
        A token lets an MCP client, such as Claude Code, work in wechart as you: it sees what you
        see, edits only in My workspace, and never approves a proposal.
      </p>
      {me.data === undefined ? null : single ? (
        // Design 18, state H: in the groups note's place.
        <p className="account-page__note">
          Sign-in is off. A token acts as wechart’s single user, with every permission. Everything
          else on this page applies as it does with sign-in on: the scopes, the expiry, the limits
          and the audit.
        </p>
      ) : (
        <p className="account-page__note">
          Your tokens use the groups from your latest sign-in to wechart. If your groups change,
          sign in again here and your tokens follow.
        </p>
      )}

      {/* A region focus can land on once a revoked row is gone (design 18's keyboard table). */}
      <section
        ref={workingList}
        className="account-page__list"
        aria-label="Your tokens"
        tabIndex={-1}
      >
        {list.isPending ? (
          <StateLine kind="run">Reading your tokens…</StateLine>
        ) : list.isError ? (
          <div className="account-page__error">
            <StateLine kind="err" role="alert">
              Your tokens couldn’t be read.
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
        ) : list.data.tokens.length === 0 ? (
          <p className="account-page__empty">No tokens yet</p>
        ) : (
          <div className="table-scroll">
            <table className="grid-table tokens-table" aria-label="Your tokens">
              <thead>
                <tr>
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
                {list.data.tokens.map((token) => (
                  <TokenRow
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
      </section>

      {stopped.length === 0 ? null : (
        <section
          ref={stoppedList}
          className="account-page__stopped"
          aria-labelledby="tokens-stopped"
          tabIndex={-1}
        >
          <h2 id="tokens-stopped" className="account-page__subhead">
            No longer working
          </h2>
          <div className="table-scroll">
            <table className="grid-table tokens-table" aria-labelledby="tokens-stopped">
              <tbody>
                {stopped.map((token) => (
                  <StoppedRow
                    key={token.id}
                    token={token}
                    now={now}
                    removing={removing === token.id}
                    onRemove={() => {
                      if (removing !== null) return;
                      setRemoveFailed(null);
                      setRemoving(token.id);
                      const next = neighbour(stopped, token.id);
                      removeToken(token.id).then(
                        () => {
                          focusAfter.current = {
                            button: next === null ? null : `remove:${next}`,
                            list: 'stopped',
                          };
                          void refresh().finally(() => {
                            setRemoving(null);
                          });
                        },
                        (error: unknown) => {
                          setRemoving(null);
                          setRemoveFailed(error instanceof Error ? error.message : String(error));
                        },
                      );
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {removeFailed === null ? null : (
            <StateLine kind="err" role="alert">
              {removeFailed}
            </StateLine>
          )}
        </section>
      )}

      <p className="account-page__once">
        A token’s text is shown once, when it’s made. wechart keeps only what it needs to check a
        token, so nobody can read it again, Super-Admins included. If you lose one, revoke it and
        make another. Making and revoking tokens is recorded in the audit trail.
      </p>

      <section className="account-page__section" aria-labelledby="token-can-do">
        <h2 id="token-can-do">What a token can do</h2>
        <ul className="account-page__can">
          <li>
            <b>Read:</b> list folders and items, read definitions, query cubes and views. Always
            included.
          </li>
          <li>
            <b>Workspace edit:</b> change things in My workspace only.
          </li>
          <li>
            <b>Proposals and jobs:</b> propose, withdraw, Run now and Cancel.
          </li>
          <li>
            <b>Never:</b> approve or reject; change a data source; run SQL; read the audit trail;
            make or revoke tokens.
          </li>
        </ul>
      </section>

      {making && me.data !== undefined ? (
        <NewTokenDialog
          readWrite={hasWorkspace(me.data)}
          onMade={(made) => {
            // The dialog turns into the shown-once one, the new row behind it (T770).
            setMaking(false);
            setShown(made);
            void queries.invalidateQueries({ queryKey: TOKENS_QUERY.queryKey });
          }}
          onClose={() => {
            setMaking(false);
          }}
        />
      ) : null}
      {shown === null ? null : (
        <TokenShownOnce
          made={shown}
          serverUrl={mcpUrl()}
          onClose={() => {
            // Gone for good: the text was held here alone (AC-430). Focus
            // back to New token, which opened it all (rule 85): the dialog
            // that opened this one is gone.
            setShown(null);
            newToken.current?.focus();
          }}
        />
      )}
      {revoking === null ? null : (
        <RevokeTokenDialog
          title={`Revoke “${revoking.name}”?`}
          revoke={() =>
            revokeToken(revoking.id).catch((error: unknown) => {
              // Refused, perhaps because it stopped meanwhile: the list as it is now.
              void refresh();
              throw error;
            })
          }
          onRevoked={() => {
            // No Undo: a revoked token can't work again (state E2).
            setToast(`Revoked “${revoking.name}”. Clients using it now get 401.`);
            const next = neighbour(working, revoking.id);
            focusAfter.current = {
              button: next === null ? null : `revoke:${next}`,
              list: 'working',
            };
            setRevoking(null);
            void refresh();
          }}
          onClose={() => {
            setRevoking(null);
            // Its row may have gone meanwhile, when the revoke was refused.
            if (opener.current?.isConnected === true) opener.current.focus();
            else workingList.current?.focus();
          }}
        />
      )}
      <ExportedToast
        message={toast}
        onDismiss={() => {
          setToast('');
        }}
      />
    </div>
  );
}

/** Name, scopes as text tags, and when it was made: a working token's and a stopped one's. */
function TokenCells({ token, now }: { readonly token: AccessToken; readonly now: Date }) {
  const made = new Date(token.createdAt);
  return (
    <>
      <td className="tokens-table__name">{token.name}</td>
      <td>
        <TokenScopeTags scopes={token.scopes} />
      </td>
      <td title={exactOf(made)}>{dayOf(made, now)}</td>
    </>
  );
}

/** A token's scopes as text tags, never colour alone (screen 1, pin 5). */
export function TokenScopeTags({ scopes }: { readonly scopes: readonly TokenScope[] }) {
  return (
    <ul className="token-scopes" aria-label="Scopes">
      {SCOPES.filter((scope) => scopes.includes(scope.id)).map((scope) => (
        <li key={scope.id} className="token-scope">
          {scope.label}
        </li>
      ))}
    </ul>
  );
}

function UsedCell({ token, now }: { readonly token: AccessToken; readonly now: Date }) {
  const used = token.lastUsedAt === null ? null : new Date(token.lastUsedAt);
  return (
    <td {...(used === null ? {} : { title: exactOf(used) })}>
      {used === null ? 'Never' : whenOf(used, now)}
    </td>
  );
}

function TokenRow({
  token,
  now,
  onRevoke,
}: {
  readonly token: AccessToken;
  readonly now: Date;
  readonly onRevoke: (button: HTMLButtonElement) => void;
}) {
  const expires = new Date(token.expiresAt);
  return (
    <tr>
      <TokenCells token={token} now={now} />
      <td title={exactOf(expires)}>{expiresText(expires, now)}</td>
      <UsedCell token={token} now={now} />
      <td className="tokens-table__act">
        <button
          type="button"
          className="btn btn-sm btn-danger"
          // Labelled with its token, starting with what it shows (WCAG 2.5.3).
          aria-label={`Revoke ${token.name}`}
          data-focus-key={`revoke:${token.id}`}
          onClick={(event) => {
            onRevoke(event.currentTarget);
          }}
        >
          Revoke
        </button>
      </td>
    </tr>
  );
}

/** "Revoked · by Ada Admin, 12 Oct", or "Expired · 31 Aug" (design 18, D3), with its icon. */
export function stoppedText(
  token: Pick<StoppedToken, 'state' | 'stoppedAt' | 'revokedBy'>,
  now: Date,
): string {
  const when = dayOf(new Date(token.stoppedAt), now);
  if (token.state === 'expired') return `Expired · ${when}`;
  return token.revokedBy === null
    ? `Revoked · ${when}`
    : `Revoked · by ${token.revokedBy.name}, ${when}`;
}

/** A token under "No longer working" (T771, AC-431): its state for its expiry, and Remove. */
function StoppedRow({
  token,
  now,
  removing,
  onRemove,
}: {
  readonly token: StoppedToken;
  readonly now: Date;
  /** Its Remove is on its way: held, so it's sent once. */
  readonly removing: boolean;
  readonly onRemove: () => void;
}) {
  return (
    <tr className="tokens-table__stopped">
      <TokenCells token={token} now={now} />
      <td title={exactOf(new Date(token.stoppedAt))}>
        <span className="token-state">
          {token.state === 'expired' ? <StatusIcon kind="idle" /> : <RevokedIcon />}
          {stoppedText(token, now)}
        </span>
      </td>
      <UsedCell token={token} now={now} />
      <td className="tokens-table__act">
        <button
          type="button"
          className="btn btn-sm"
          aria-label={`Remove ${token.name}`}
          data-focus-key={`remove:${token.id}`}
          disabled={removing}
          onClick={onRemove}
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

/** Revoked's own icon, a filled circle struck through (design 18's `s-revoked`). */
export function RevokedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" data-icon="revoked">
      <circle cx="8" cy="8" r="7" fill="var(--wc-status-error-icon)" />
      <path d="M4.6 11.4l6.8-6.8" stroke="#fff" strokeWidth="1.8" />
    </svg>
  );
}
