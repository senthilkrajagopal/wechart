import { useEffect, useId, useRef, useState } from 'react';

import { Menu, type MenuEntry } from './Menu';

/**
 * Who is signed in, and signing out (T319; AC-252, AC-254; direction.md rule
 * 59, references.md › Phase 2 › Surface 1). At the top bar's right end:
 *
 * - Signed in: a 28 px avatar of the initials and the name, which hides below
 *   1,280 px and truncates at 160 px (the whole name as its tooltip). Its menu
 *   holds the name, the identity as the provider sent it, a Super-Admin label
 *   for Super-Admins, and Sign out.
 * - Security off: a "Single-user mode" chip, whose menu says what that means,
 *   and no Sign out: there is no one to sign out. Phase 1's identity avatar
 *   stays after it, at the far right (AC-190), so phase 1 is unchanged but for
 *   the chip.
 *
 * The button opens on Enter, Space or a click; the menu is the shell's APG
 * menu, so the arrows move in it and Escape closes it, back to the button.
 */
export interface Me {
  readonly name: string;
  /** The identity as the provider sent it (an email or a username); none with security off. */
  readonly identity?: string;
  readonly groups: readonly string[];
  readonly superAdmin: boolean;
  /** A read-write member of some folder; with security off, the one user is (T364's review). */
  readonly readWrite?: boolean;
  readonly security: 'off' | 'oidc';
}

/** The first letters of the first and last words; two letters of a single word. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]!}${words[words.length - 1]![0]!}`.toUpperCase();
}

const SINGLE_USER_NOTE = 'Sign-in is off, so wechart runs as one user with every permission.';

function isMe(value: unknown): value is Me {
  const me = value as Partial<Me> | null;
  return (
    typeof me === 'object' &&
    me !== null &&
    typeof me.name === 'string' &&
    (me.security === 'off' || me.security === 'oidc')
  );
}

export interface AccountMenuProps {
  /** Where the browser goes once signed out; the page's own location outside tests. */
  readonly navigate?: (url: string) => void;
}

export function AccountMenu({
  navigate = (url) => {
    window.location.assign(url);
  },
}: AccountMenuProps) {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLSpanElement>(null);
  const whoId = useId();

  useEffect(() => {
    const asked = new AbortController();
    // A plain fetch rather than a query: the shell's own tests render it
    // bare, and one small request needs no cache.
    fetch('/api/me', { signal: asked.signal })
      .then(async (response) => (response.ok ? ((await response.json()) as unknown) : null))
      .then((answer) => {
        if (isMe(answer)) setMe(answer);
      })
      .catch(() => undefined);
    return () => {
      asked.abort();
    };
  }, []);

  // A pointer going down anywhere outside closes it, as a menu does.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  /**
   * Until the API says who, a person in the avatar's place rather than an
   * empty slot the control later pops into (T211's review). With security off
   * the same element then names the single user, so it isn't swapped out
   * under a reader; signed in, the account button takes its place.
   */
  const identityAvatar = (
    <span
      className="app-avatar"
      role="img"
      aria-label={me === null ? 'Signed in' : `Signed in as ${me.name}`}
    >
      {me === null ? <PersonIcon /> : initialsOf(me.name)}
    </span>
  );
  const single = me?.security === 'off';
  const signOut = () => {
    void fetch('/api/auth/logout', { method: 'POST' })
      .then(async (response) =>
        response.ok ? ((await response.json()) as { redirectTo?: unknown }) : {},
      )
      .catch(() => ({}) as { redirectTo?: unknown })
      .then(({ redirectTo }) => {
        navigate(typeof redirectTo === 'string' ? redirectTo : '/');
      });
  };
  const entries: MenuEntry[] = single
    ? [{ kind: 'text', key: 'single-user', text: SINGLE_USER_NOTE }]
    : [{ kind: 'item', key: 'sign-out', label: 'Sign out', onSelect: signOut }];

  // The same slots in every state — button, menu, avatar — so the avatar
  // stays one element from loading to answered with security off (T319).
  return (
    <span ref={box} className="account">
      {me === null ? null : (
        <button
          ref={button}
          type="button"
          className={single ? 'account-button account-button--single' : 'account-button'}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={single ? 'Single-user mode' : `Account: ${me.name}`}
          {...(single ? { title: 'Single-user mode' } : {})}
          onClick={() => {
            setOpen((was) => !was);
          }}
        >
          {single ? (
            <>
              <OpenPadlockIcon />
              <span className="account-button__label">Single-user mode</span>
            </>
          ) : (
            <>
              <span className="app-avatar" data-testid="account-avatar" aria-hidden="true">
                {initialsOf(me.name)}
              </span>
              <span className="account-button__name" data-testid="account-name" title={me.name}>
                {me.name}
              </span>
            </>
          )}
        </button>
      )}
      {open && me !== null ? (
        <div className="account-panel" data-testid="account-panel">
          {single ? null : (
            // The menu is named by this, so entering it says who it is for
            // before Sign out (T319's review).
            <div className="account-panel__who" id={whoId}>
              {/* Spaces between the parts, so the menu's name reads as words. */}
              <span className="account-panel__name">{me.name}</span>{' '}
              {me.identity === undefined || me.identity === '' || me.identity === me.name ? null : (
                <span className="account-panel__identity">{me.identity}</span>
              )}{' '}
              {me.superAdmin ? (
                <span className="badge account-panel__badge">
                  <ShieldIcon />
                  Super-Admin
                </span>
              ) : null}
            </div>
          )}
          <Menu
            {...(single ? { label: 'Single-user mode' } : { labelledBy: whoId })}
            entries={entries}
            onClose={(how) => {
              setOpen(false);
              if (how === 'escape') button.current?.focus();
            }}
          />
        </div>
      ) : null}
      {/* Phase 1's identity avatar keeps its place at the far right (AC-190). */}
      {me === null || single ? identityAvatar : null}
    </span>
  );
}

function PersonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="5.5" r="3" fill="currentColor" />
      <path d="M2.5 14.5a5.5 5 0 0 1 11 0z" fill="currentColor" />
    </svg>
  );
}

/** Security off: nothing is locked (references.md › Surface 1, "open-padlock icon"). */
function OpenPadlockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      data-testid="single-user-icon"
    >
      <rect x="3" y="7" width="10" height="7.5" rx="1.5" fill="currentColor" />
      <path
        d="M5.5 7V4.5a2.5 2.5 0 0 1 5-0.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 1.5l5.5 2v4.2c0 3.2-2.3 5.8-5.5 6.8-3.2-1-5.5-3.6-5.5-6.8V3.5z"
        fill="currentColor"
      />
    </svg>
  );
}
