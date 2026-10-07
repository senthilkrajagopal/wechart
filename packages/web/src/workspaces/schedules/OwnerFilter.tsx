import { useRef } from 'react';

import { OwnerIcon } from './OwnerLabel';

/**
 * Schedules' owner filter (T557, AC-397; design 16, P4 and screen 2 pin 4,
 * keeping design 07's): All, Cube's refresh worker or wechart, each with the
 * count of the rows it then lists, each owner with the icon its rows wear.
 *
 * A segmented radio group of buttons, not of native radios: the page holds
 * no input that could read as editing one of Cube's schedules (AC-154). One
 * Tab stop, whose arrows, Home and End move and choose, as a radio group
 * does (AC-176), the way Explore's Show filter's native radios behave.
 */
export type ShownOwner = 'all' | 'cube' | 'wechart';

const CHOICES: readonly { readonly owner: ShownOwner; readonly label: string }[] = [
  { owner: 'all', label: 'All' },
  { owner: 'cube', label: 'Cube’s refresh worker' },
  { owner: 'wechart', label: 'wechart' },
];

/** The arrows' steps through the choices, round from either end. */
const STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

export function OwnerFilter({
  owner,
  counts,
  onChange,
}: {
  readonly owner: ShownOwner;
  readonly counts: Readonly<Record<ShownOwner, number>>;
  readonly onChange: (owner: ShownOwner) => void;
}) {
  const choices = useRef<(HTMLButtonElement | null)[]>([]);
  const indexOf = (key: string, at: number): number | undefined => {
    if (key === 'Home') return 0;
    if (key === 'End') return CHOICES.length - 1;
    const step = STEPS[key];
    return step === undefined ? undefined : (at + step + CHOICES.length) % CHOICES.length;
  };
  return (
    <div className="owner-filter" role="radiogroup" aria-label="Owner">
      {CHOICES.map((choice, at) => {
        const chosen = choice.owner === owner;
        return (
          <button
            key={choice.owner}
            ref={(element) => {
              choices.current[at] = element;
            }}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={chosen ? 0 : -1}
            className={chosen ? 'owner-filter__choice is-chosen' : 'owner-filter__choice'}
            onClick={() => {
              onChange(choice.owner);
            }}
            onKeyDown={(event) => {
              const to = indexOf(event.key, at);
              if (to === undefined) return;
              event.preventDefault();
              onChange(CHOICES[to]!.owner);
              choices.current[to]?.focus();
            }}
          >
            {choice.owner === 'all' ? null : <OwnerIcon owner={choice.owner} />}
            {choice.label}{' '}
            <span className="owner-filter__count">{String(counts[choice.owner])}</span>
          </button>
        );
      })}
    </div>
  );
}
