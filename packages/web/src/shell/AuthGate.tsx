import { QueryClientContext } from '@tanstack/react-query';
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { isMe, ME_QUERY } from './me';

import { StatusIcon } from './StatusIcon';

/**
 * The page gate (T321; AC-251, AC-316; direction.md rule 60, references.md ›
 * Phase 2 › Surface 1).
 *
 * - Nothing of the app renders until `/api/me` has answered. A 401 means no
 *   one is signed in: the browser goes to sign-in, carrying where it was, and
 *   no wechart content is shown on the way.
 * - Any other answer renders the app. With security off `/api/me` always
 *   names the single user; when the API can't say who, it still refuses its
 *   own data to a request without a session (T318), so the page shows none.
 * - A session that ends mid-work (a sign-in lasts 12 hours, AC-316) shows up
 *   as a 401 from any API route but sign-in's own. It is said in a modal with
 *   only the product mark, that sentence and Sign in, nothing of wechart
 *   behind it, and nobody is sent away until they choose to sign in again.
 *
 * The app calls the API from many places with `fetch`, so the gate watches
 * every answer at `window.fetch` rather than asking each caller to report one.
 */
export interface AuthGateProps {
  readonly children: ReactNode;
  /** Where the browser goes to sign in; the page's own location outside tests. */
  readonly navigate?: (url: string) => void;
}

type Asked = 'asking' | 'in' | 'out';

/** Sign-in, and back to exactly this page after. */
export function signInUrl(): string {
  const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/api/auth/login?returnTo=${encodeURIComponent(here)}`;
}

/** An API route whose 401 means the session has gone: every one but sign-in's own. */
function isSessionBound(input: RequestInfo | URL): boolean {
  const raw =
    typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const path = new URL(raw, window.location.origin).pathname;
  return path.startsWith('/api/') && !path.startsWith('/api/auth/');
}

export function AuthGate({
  children,
  navigate = (url) => {
    window.location.assign(url);
  },
}: AuthGateProps) {
  const [asked, setAsked] = useState<Asked>('asking');
  const [ended, setEnded] = useState(false);
  const signIn = useRef<HTMLButtonElement>(null);
  // The app's query client, where there is one: its own tests render it bare.
  const client = useContext(QueryClientContext);

  // Every API answer, watched for a session that has gone.
  useEffect(() => {
    const original = window.fetch;
    const watched: typeof fetch = async (input, init) => {
      const response = await original(input, init);
      // wechart's own "nobody signed in" (T318), not a 401 Cube's answer
      // passed on, which the tile that asked shows as its error.
      if (response.status === 401 && isSessionBound(input)) {
        void response
          .clone()
          .json()
          .then((body: unknown) => {
            if ((body as { error?: unknown } | null)?.error === 'unauthenticated') setEnded(true);
          })
          .catch(() => undefined);
      }
      return response;
    };
    window.fetch = watched;
    return () => {
      if (window.fetch === watched) window.fetch = original;
    };
  }, []);

  useEffect(() => {
    const asking = new AbortController();
    fetch('/api/me', { signal: asking.signal })
      .then(async (response) => {
        if (response.status === 401) {
          setAsked('out');
          navigate(signInUrl());
          return;
        }
        // Who it is, given to the pages' shared query at once, so the bar
        // never shows what they may not open, even for a moment (T500's review).
        if (response.ok) {
          const me = (await response.json().catch(() => undefined)) as unknown;
          if (isMe(me)) client?.setQueryData(ME_QUERY.queryKey, me);
        }
        setAsked('in');
      })
      .catch(() => {
        if (!asking.signal.aborted) setAsked('in');
      });
    return () => {
      asking.abort();
    };
    // Asked once, as the page loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ended && asked === 'in') signIn.current?.focus();
  }, [ended, asked]);

  // While the API is asked who is signed in: the product mark and a state in
  // words with its icon (rules 3 and 60), never an empty page (T321's review).
  if (asked === 'asking') {
    return (
      <div className="auth-state">
        <div className="auth-state__card">
          <span className="app-bar__mark" data-testid="brand-mark" aria-hidden="true">
            we
          </span>
          <p role="status" className="state-line">
            <StatusIcon kind="run" />
            Opening wechart…
          </p>
        </div>
      </div>
    );
  }
  if (asked === 'out') return null;
  if (!ended) return <>{children}</>;
  return (
    <div className="auth-state">
      <div
        className="auth-state__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-state-title"
        aria-describedby="auth-state-sentence"
      >
        <span className="app-bar__mark" data-testid="brand-mark" aria-hidden="true">
          we
        </span>
        <h1 id="auth-state-title" className="auth-state__title">
          Your session has ended
        </h1>
        <p id="auth-state-sentence">
          Sign in again to continue. Changes you haven’t saved in this editor will be lost.
        </p>
        <button
          ref={signIn}
          type="button"
          className="btn-primary"
          onClick={() => {
            navigate(signInUrl());
          }}
        >
          Sign in
        </button>
      </div>
    </div>
  );
}
