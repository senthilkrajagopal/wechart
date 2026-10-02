import { useQuery } from '@tanstack/react-query';

import { ME_QUERY } from '../../shell/me';
import { REVIEWS_COUNT_QUERY } from './reviews';

/**
 * The top bar's Reviews control (T355, AC-287; design 05 of 2026-09-27,
 * state C; rule 76): after search, an icon, "Reviews" and the number waiting
 * in "To review", hidden at 0. Only for those who may decide something:
 * Super-Admins and read-write members, and with sign-in off the single user,
 * who approves their own (T359, AC-254). It isn't in the workspace switcher,
 * so AC-001's list stays as it is.
 */
export function ReviewsControl({ current = false }: { readonly current?: boolean }) {
  const me = useQuery({ ...ME_QUERY, retry: false });
  const may =
    me.data !== undefined &&
    (me.data.security === 'off' || me.data.superAdmin || me.data.readWrite === true);
  // Asked again now and then, so a proposal made meanwhile is counted.
  const counted = useQuery({ ...REVIEWS_COUNT_QUERY, enabled: may, refetchInterval: 60_000 });
  if (!may) return null;
  const waiting = counted.data ?? 0;
  return (
    <a
      href="/reviews"
      className="app-reviews"
      aria-label={waiting === 0 ? 'Reviews' : `Reviews, ${String(waiting)} waiting`}
      aria-current={current ? 'page' : undefined}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M3 2.5h7l3 3v8H3z M10 2.5v3h3 M5.5 9l1.8 1.8L10.5 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      <span className="app-reviews__label">Reviews</span>
      {waiting === 0 ? null : (
        <span className="app-reviews__count" data-testid="reviews-count" aria-hidden="true">
          {waiting}
        </span>
      )}
    </a>
  );
}
