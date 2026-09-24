import type { LimitCombination, Marking } from '@wechart/core';
import { useId } from 'react';

import type { NothingMarkedState } from '../tiles/NothingMarked';

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
/**
 * What the control changes on the tile. A patch rather than four callbacks:
 * choosing a first limit also settles what the tile does while that marking
 * is empty (AC-110), and the two have to land in one update or the tile is
 * briefly limited with no nothing-marked state at all.
 */
export interface TileLimitPatch {
  readonly limitedBy?: readonly string[];
  readonly limitCombination?: LimitCombination;
  readonly nothingMarked?: NothingMarkedState;
  readonly nothingMarkedMessage?: string;
}

export interface TileLimitsProps {
  readonly markings: readonly Marking[];
  /** The marking this tile marks with, or undefined for "(None)". */
  readonly marksWith: string | undefined;
  readonly limitedBy: readonly string[];
  /** How several limiting markings combine (AC-107). */
  readonly combination?: LimitCombination;
  /** What the tile shows while they are all empty, and the text it shows (AC-109). */
  readonly nothingMarked?: NothingMarkedState;
  readonly nothingMarkedMessage?: string;
  readonly onChange: (next: TileLimitPatch) => void;
}

/** The nothing-marked options, in the order direction.md rule 33 lists them. */
const NOTHING_MARKED_OPTIONS: readonly { value: NothingMarkedState; label: string }[] = [
  { value: 'all', label: 'All data' },
  { value: 'empty', label: 'Empty visualization' },
  { value: 'message', label: 'Message on an empty background' },
];

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

export function TileLimits({
  markings,
  marksWith,
  limitedBy,
  combination = 'all',
  nothingMarked = 'message',
  nothingMarkedMessage = '',
  onChange,
}: TileLimitsProps) {
  // Labels tied by id, not by wrapping: a <label> around a <select> takes its
  // options' text into the accessible name, so "When nothing is marked"
  // becomes "When nothing is markedAll dataEmpty visualization…".
  const ids = useId();
  /**
   * The marking the tile *actually* marks with, which for a tile that names
   * none is the dashboard's default — the same three-answer rule `TileMarking`
   * reads. Taking the field at face value would leave rule 45 unenforced on
   * every tile whose marking setting was never touched, which is most of them.
   */
  const own = marksWith ?? markings.find((each) => each.isDefault)?.id;
  const limits = allowedLimits(limitedBy, own);

  return (
    <fieldset className="tile-limits">
      <legend>Limit data using markings</legend>

      {markings.map((marking) => {
        const isOwn = marking.id === own;

        return (
          <label key={marking.id} className="tile-limits__row" data-testid={`limit-${marking.id}`}>
            <input
              type="checkbox"
              /**
               * Named for what it does, not just for the marking. Beside the
               * tile's "Marking" picker, a checkbox whose whole name is
               * "Marking" is a second control with the first one's name, and
               * neither a screen reader nor a test can tell them apart. The
               * visible text is still the marking's name, and the accessible
               * name contains it (WCAG 2.5.3).
               */
              aria-label={`Limit by ${marking.name}`}
              checked={limits.includes(marking.id)}
              disabled={isOwn}
              onChange={(event) => {
                onChange({
                  limitedBy: event.target.checked
                    ? [...limits, marking.id]
                    : limits.filter((id) => id !== marking.id),
                });
              }}
            />
            <span>{marking.name}</span>

            {/* Beside the option it explains. A disabled control with no
                reason is the most frustrating kind: the user cannot tell
                whether it is broken, forbidden, or waiting on them. */}
            {isOwn ? <span className="tile-limits__reason">{OWN_MARKING_REASON}</span> : null}
          </label>
        );
      })}

      {/* Only with two limits to combine. With one, All and Any mean the
          same thing, and a control that changes nothing is worse than no
          control: it invites a reader to look for the difference. */}
      {limits.length < 2 ? null : (
        <div className="field">
          <label htmlFor={`${ids}-combination`}>Combine markings</label>
          <select
            id={`${ids}-combination`}
            className="select-sm"
            value={combination}
            onChange={(event) => {
              onChange({ limitCombination: event.target.value as LimitCombination });
            }}
          >
            <option value="all">All markings (AND)</option>
            <option value="any">Any marking (OR)</option>
          </select>
        </div>
      )}

      {limits.length === 0 ? null : (
        <>
          <div className="field">
            <label htmlFor={`${ids}-nothing`}>When nothing is marked</label>
            <select
              id={`${ids}-nothing`}
              className="select-sm"
              value={nothingMarked}
              onChange={(event) => {
                onChange({ nothingMarked: event.target.value as NothingMarkedState });
              }}
            >
              {NOTHING_MARKED_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* The message is the tile's, so it is edited on the tile. It
              arrives pre-filled with the names of the tiles this one waits
              on (AC-110), which is the part a user cannot easily write
              themselves — the master may be on another page tab. */}
          {nothingMarked !== 'message' ? null : (
            <div className="field">
              <label htmlFor={`${ids}-message`}>Message</label>
              <textarea
                id={`${ids}-message`}
                value={nothingMarkedMessage}
                rows={2}
                onChange={(event) => {
                  onChange({ nothingMarkedMessage: event.target.value });
                }}
              />
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
