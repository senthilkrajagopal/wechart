import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { clockOf, dayOf, exactOf, whenOf } from '../shell/formatTime';
import { hasWorkspace, ME_QUERY } from '../shell/me';
import { StateLine } from '../shell/StatusIcon';
import { NewTokenDialog } from './NewTokenDialog';
import { SCOPES, TOKENS_QUERY, type AccessToken } from './tokensApi';

const DAY_MS = 86_400_000;
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
  const now = new Date();
  const single = me.data?.security === 'off';

  return (
    <div className="account-page">
      <div className="account-page__head">
        <h1 className="workspace-title">Access tokens</h1>
        <button
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
              </tr>
            </thead>
            <tbody>
              {list.data.tokens.map((token) => (
                <TokenRow key={token.id} token={token} now={now} />
              ))}
            </tbody>
          </table>
        </div>
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
          onMade={() => {
            setMaking(false);
            void queries.invalidateQueries({ queryKey: TOKENS_QUERY.queryKey });
          }}
          onClose={() => {
            setMaking(false);
          }}
        />
      ) : null}
    </div>
  );
}

function TokenRow({ token, now }: { readonly token: AccessToken; readonly now: Date }) {
  const made = new Date(token.createdAt);
  const expires = new Date(token.expiresAt);
  const used = token.lastUsedAt === null ? null : new Date(token.lastUsedAt);
  return (
    <tr>
      <td className="tokens-table__name">{token.name}</td>
      <td>
        <ul className="token-scopes" aria-label="Scopes">
          {SCOPES.filter((scope) => token.scopes.includes(scope.id)).map((scope) => (
            <li key={scope.id} className="token-scope">
              {scope.label}
            </li>
          ))}
        </ul>
      </td>
      <td title={exactOf(made)}>{dayOf(made, now)}</td>
      <td title={exactOf(expires)}>{expiresText(expires, now)}</td>
      <td {...(used === null ? {} : { title: exactOf(used) })}>
        {used === null ? 'Never' : whenOf(used, now)}
      </td>
    </tr>
  );
}
