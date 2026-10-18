import { useId } from 'react';

import type { MakeFrom } from './makeFrom';

/** What Make a cube… or Make a chart… was chosen for. */
export type MakeKind = 'cube' | 'chart';

/** A reason's text, a name between backticks in the code face, the backticks dropped. */
function withCode(reason: string) {
  return reason
    .split('`')
    .map((part, index) => (index % 2 === 1 ? <code key={String(index)}>{part}</code> : part));
}

/**
 * Make a cube… and Make a chart… in a run's result head, before Download CSV
 * (T819, AC-461; design 17 §2 and §6, rule 101). Where `makeFrom` disables
 * them, they say why: one reason beside both, which each names as its
 * description. `aria-disabled`, not `disabled`, so the keyboard still reaches
 * them and hears the reason (as the edit bar's and the menus' are).
 */
export function MakeFromButtons({
  make,
  onMake,
}: {
  readonly make: MakeFrom;
  readonly onMake: (kind: MakeKind) => void;
}) {
  const whyId = useId();
  const off = !make.enabled;
  const button = (kind: MakeKind, label: string) => (
    <button
      type="button"
      className="btn btn-sm"
      aria-disabled={off ? 'true' : undefined}
      aria-describedby={off ? whyId : undefined}
      onClick={() => {
        if (!off) onMake(kind);
      }}
    >
      {label}
    </button>
  );
  return (
    <>
      {make.enabled ? null : (
        <span id={whyId} className="sql-make__why" data-testid="sql-make-why">
          {withCode(make.reason)}
        </span>
      )}
      {button('cube', 'Make a cube…')}
      {button('chart', 'Make a chart…')}
    </>
  );
}
