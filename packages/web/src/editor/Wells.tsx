import type { ChartSpec, WellName } from '@wechart/core';

import type { Member } from './fields';

/**
 * The wells a chart is built from (AC-026).
 *
 * Two routes in, because the criterion names both: a drag for pointer users,
 * and a "+" picker for everyone. The picker is not a fallback — it is the only
 * route a keyboard or screen reader has, and drag-only would fail AC-176.
 */
export const WELLS: { name: WellName; label: string; accepts: Member['kind'] }[] = [
  { name: 'measures', label: 'Measures', accepts: 'measure' },
  { name: 'dimensions', label: 'Dimensions', accepts: 'dimension' },
  { name: 'timeDimensions', label: 'Time', accepts: 'timeDimension' },
];

const KIND_NAME: Record<Member['kind'], string> = {
  measure: 'a measure',
  dimension: 'a dimension',
  timeDimension: 'a time dimension',
  segment: 'a segment',
};

/**
 * AC-027: why a well will not take the field being dragged. Null when it will.
 *
 * The reason names both sides — what the well takes and what this field is —
 * because "not allowed here" leaves the user to guess which of the two is
 * wrong.
 */
export function rejectionReason(
  well: (typeof WELLS)[number],
  dragging: Member | null,
): string | null {
  if (!dragging) return null;
  if (dragging.kind === well.accepts) return null;
  return `${well.label} takes ${KIND_NAME[well.accepts]}; ${dragging.shortTitle} is ${KIND_NAME[dragging.kind]}.`;
}

export interface WellsProps {
  readonly spec: ChartSpec;
  readonly available: readonly Member[];
  readonly onAdd: (well: WellName, member: string) => void;
  readonly onRemove: (well: WellName, member: string) => void;
  /** The field currently being dragged, if any. */
  readonly dragging?: Member | null;
}

export function Wells({ spec, available, onAdd, onRemove, dragging = null }: WellsProps) {
  return (
    <div className="wells">
      {WELLS.map((well) => {
        const candidates = available.filter((member) => member.kind === well.accepts);
        const held = spec[well.name];
        const refusal = rejectionReason(well, dragging);
        const legal = dragging !== null && refusal === null;

        return (
          <section
            key={well.name}
            className="well"
            data-testid={`well-${well.name}`}
            data-drop={dragging === null ? undefined : legal ? 'legal' : 'illegal'}
            aria-describedby={refusal ? `well-${well.name}-reason` : undefined}
            onDragOver={(event) => {
              // Preventing default is what marks this a valid drop target, so
              // not preventing it is what refuses the drop (AC-027).
              if (legal) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!legal) return;
              const dropped = event.dataTransfer.getData('text/plain');
              if (dropped) onAdd(well.name, dropped);
            }}
          >
            <h3 id={`well-${well.name}-label`}>{well.label}</h3>

            {refusal ? (
              <p
                className="well__reason"
                id={`well-${well.name}-reason`}
                data-testid={`reason-${well.name}`}
              >
                {refusal}
              </p>
            ) : null}

            <ul aria-labelledby={`well-${well.name}-label`}>
              {held.map((member) => (
                <li key={member} data-testid={`in-${well.name}-${member}`}>
                  {member}
                  <button
                    type="button"
                    onClick={() => onRemove(well.name, member)}
                    aria-label={`Remove ${member} from ${well.label}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            <label htmlFor={`add-${well.name}`} className="visually-hidden">
              Add to {well.label}
            </label>
            <select
              id={`add-${well.name}`}
              data-testid={`add-${well.name}`}
              value=""
              onChange={(event) => {
                if (event.target.value) onAdd(well.name, event.target.value);
              }}
            >
              <option value="">+ Add to {well.label}…</option>
              {candidates
                .filter((member) => !held.includes(member.name))
                .map((member) => (
                  <option key={member.name} value={member.name}>
                    {member.shortTitle}
                  </option>
                ))}
            </select>
          </section>
        );
      })}
    </div>
  );
}
