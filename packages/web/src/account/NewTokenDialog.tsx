import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';

import { DiscardQuestion } from '../shell/DiscardQuestion';
import { dayOf } from '../shell/formatTime';
import { useFocusTrap } from '../shell/useFocusTrap';
import { useReturnFocus } from '../shell/useReturnFocus';
import {
  DEFAULT_DAYS,
  makeToken,
  SCOPES,
  TOKEN_DAYS,
  TOKEN_NAME_LIMIT,
  type MadeToken,
  type TokenDays,
  type TokenScope,
} from './tokensApi';

/** What each scope allows, in a sentence (design 18, screen 2, pins 2 and 3). */
const SCOPE_SAYS: Record<TokenScope, string> = {
  read: 'List folders and their items, read the definitions of dashboards, charts, cubes, views and data sources, and query cubes and views.',
  'workspace-edit':
    'Copy items into My workspace, and create, change or delete dashboards, charts, cubes and views there. Nothing else.',
  'proposals-and-jobs':
    'Propose workspace items to their folders, withdraw and list your proposals; list jobs, builds and schedules, with Run now and Cancel where you may.',
};
/** Why a user read-only everywhere can't have the other two (design 18, A5; Q10). */
const READ_ONLY_REASON = 'You have no My workspace, so this wouldn’t let a client do anything.';
const DAY_MS = 86_400_000;

/**
 * New token (T769, AC-430, AC-468, AC-469; design 18, screen 2 and state
 * B): a 520 px dialog asking for a name, the scopes, Read always among
 * them, and 7, 30 or 90 days, 30 at the start. Create token is held until
 * there's a name; a refusal is shown with the API's reason. Cancel or Esc
 * closes it, asking first once a name is typed (rule 85).
 */
export function NewTokenDialog({
  readWrite,
  onMade,
  onClose,
}: {
  /** Whether the user has a My workspace: else only Read can be had (AC-469). */
  readonly readWrite: boolean;
  readonly onMade: (made: MadeToken) => void;
  readonly onClose: () => void;
}) {
  const ids = useId();
  const box = useRef<HTMLDivElement>(null);
  const nameField = useRef<HTMLInputElement>(null);
  useFocusTrap(box);
  useReturnFocus();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ReadonlySet<TokenScope>>(() => new Set(['read']));
  const [days, setDays] = useState<TokenDays>(DEFAULT_DAYS);
  const [asking, setAsking] = useState(false);
  const make = useMutation({
    mutationFn: makeToken,
    onSuccess: (made) => {
      onMade(made);
    },
  });

  const typed = name.trim() !== '';
  /** Closes, asking first over a typed name. */
  const leave = useRef(() => {});
  const isAsking = useRef(asking);
  useEffect(() => {
    leave.current = () => {
      if (typed) setAsking(true);
      else onClose();
    };
    isAsking.current = asking;
  }, [typed, asking, onClose]);
  /** When it opened: the expiry's date counts from it. */
  const [openedAt] = useState(() => Date.now());
  useEffect(() => {
    nameField.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // The question's own Esc is Keep editing, back to the name.
      if (isAsking.current) {
        setAsking(false);
        nameField.current?.focus();
      } else leave.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const expiresOn = new Date(openedAt + days * DAY_MS);
  const create = () => {
    make.mutate({
      name: name.trim(),
      scopes: SCOPES.map((scope) => scope.id).filter((id) => scopes.has(id)),
      days,
    });
  };

  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-heading`}
        className="dialog new-token"
      >
        <h2 id={`${ids}-heading`}>New access token</h2>
        <form
          className="new-token__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (typed && !make.isPending) create();
          }}
        >
          <label className="new-token__field">
            <span className="new-token__label">
              Name{' '}
              <span className="new-token__hint">
                · names it in your list and in the audit trail
              </span>
            </span>
            <input
              ref={nameField}
              type="text"
              className="input"
              value={name}
              maxLength={TOKEN_NAME_LIMIT}
              placeholder="Name it after the client"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </label>
          <fieldset className="new-token__scopes">
            <legend className="new-token__label">Scopes</legend>
            {SCOPES.map((scope) => {
              const read = scope.id === 'read';
              const held = !read && !readWrite;
              const reasonId = `${ids}-${scope.id}-reason`;
              return (
                <div key={scope.id} className="new-token__scope">
                  <label className="new-token__scope-name">
                    <input
                      type="checkbox"
                      checked={read || (!held && scopes.has(scope.id))}
                      disabled={read || held}
                      aria-describedby={reasonId}
                      onChange={(event) => {
                        const on = event.target.checked;
                        setScopes((was) => {
                          const next = new Set(was);
                          if (on) next.add(scope.id);
                          else next.delete(scope.id);
                          return next;
                        });
                      }}
                    />
                    <span>{scope.label}</span>
                  </label>
                  {read ? (
                    <span className="new-token__always">
                      <LockIcon />
                      Always included
                    </span>
                  ) : null}
                  <span id={reasonId} className="new-token__scope-says">
                    {held ? READ_ONLY_REASON : SCOPE_SAYS[scope.id]}
                  </span>
                </div>
              );
            })}
          </fieldset>
          <div className="new-token__expiry">
            <span className="new-token__label" id={`${ids}-expires`}>
              Expires in
            </span>
            <div
              role="radiogroup"
              aria-labelledby={`${ids}-expires`}
              className="choice choice--segmented new-token__days"
            >
              {TOKEN_DAYS.map((each) => (
                <label key={each} className="choice__option">
                  <input
                    type="radio"
                    className="visually-hidden"
                    name={`${ids}-days`}
                    checked={each === days}
                    onChange={() => {
                      setDays(each);
                    }}
                  />
                  {each} days
                </label>
              ))}
            </div>
            <span className="new-token__on" data-testid="expires-on">
              on {dayOf(expiresOn)}
            </span>
          </div>
          <p className="new-token__note">No token lasts longer than 90 days.</p>
          <p className="new-token__acts">
            It acts as you, with the groups of your latest sign-in. Whatever its scopes, it never
            approves or rejects a proposal, changes a data source, runs SQL or reads the audit
            trail.
          </p>
          {make.isError ? (
            <p role="alert" className="propose-dialog__refused">
              {make.error.message}
            </p>
          ) : null}
          <div className="dialog__actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                leave.current();
              }}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!typed || make.isPending}>
              Create token
            </button>
          </div>
        </form>
      </div>
      {asking ? (
        <DiscardQuestion
          body="The token isn’t made yet, and the name you typed will be lost."
          onKeep={() => {
            setAsking(false);
            nameField.current?.focus();
          }}
          onDiscard={onClose}
        />
      ) : null}
    </div>
  );
}

/** Design 18's lock, beside "Always included". */
function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" data-icon="lock">
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
