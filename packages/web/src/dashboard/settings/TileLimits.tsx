import type { Marking } from '@wechart/core';

/**
 * "Limit data using markings" on a tile (AC-108, direction.md rule 45: "A tile
 * can't be limited by the marking it marks with. That marking is disabled in
 * its limit list, with the reason shown").
 *
 * **Why the rule exists.** A tile limited by its own marking feeds back on
 * itself: marking two bars restricts the tile to those two bars, the others
 * vanish, and with them any way to change the marking. The tile locks itself,
 * and the only escape is a settings page the user has no reason to connect to
 * what just happened.
 *
 * "Prevent" is stronger than "do not offer", so the rule is enforced twice —
 * here, and in `allowedLimits`, which a stored document goes through. A
 * document can arrive hand-edited or from a build that predates the rule, and
 * a UI that only hid the option would apply it anyway.
 */
export interface TileLimitsProps {
  readonly markings: readonly Marking[];
  /** The marking this tile marks with, or undefined for "(None)". */
  readonly marksWith: string | undefined;
  readonly limitedBy: readonly string[];
  readonly onChange: (limitedBy: readonly string[]) => void;
}

/** Why the tile's own marking cannot limit it, said where it is offered. */
const OWN_MARKING_REASON = 'This tile marks with this, so it cannot also be limited by it.';

/**
 * The limits a tile may actually have: everything except the marking it marks
 * with.
 *
 * Returned by identity when nothing had to be removed, so a document that was
 * already valid is not rewritten — which would make the edit session think it
 * had changed.
 */
export function allowedLimits(
  limitedBy: readonly string[],
  marksWith: string | undefined,
): readonly string[] {
  if (marksWith === undefined || !limitedBy.includes(marksWith)) return limitedBy;

  return limitedBy.filter((id) => id !== marksWith);
}

export function TileLimits({ markings, marksWith, limitedBy, onChange }: TileLimitsProps) {
  const limits = allowedLimits(limitedBy, marksWith);

  return (
    <fieldset className="tile-limits">
      <legend>Limit data using markings</legend>

      {markings.map((marking) => {
        const own = marking.id === marksWith;

        return (
          <label key={marking.id} className="tile-limits__row" data-testid={`limit-${marking.id}`}>
            <input
              type="checkbox"
              checked={limits.includes(marking.id)}
              disabled={own}
              onChange={(event) => {
                onChange(
                  event.target.checked
                    ? [...limits, marking.id]
                    : limits.filter((id) => id !== marking.id),
                );
              }}
            />
            <span>{marking.name}</span>

            {/* Beside the option it explains. A disabled control with no
                reason is the most frustrating kind: the user cannot tell
                whether it is broken, forbidden, or waiting on them. */}
            {own ? <span className="tile-limits__reason">{OWN_MARKING_REASON}</span> : null}
          </label>
        );
      })}
    </fieldset>
  );
}
