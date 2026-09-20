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

export interface WellsProps {
  readonly spec: ChartSpec;
  readonly available: readonly Member[];
  readonly onAdd: (well: WellName, member: string) => void;
  readonly onRemove: (well: WellName, member: string) => void;
}

export function Wells({ spec, available, onAdd, onRemove }: WellsProps) {
  return (
    <div className="wells">
      {WELLS.map((well) => {
        const candidates = available.filter((member) => member.kind === well.accepts);
        const held = spec[well.name];

        return (
          <section
            key={well.name}
            className="well"
            data-testid={`well-${well.name}`}
            onDragOver={(event) => {
              // Preventing default is what marks this a valid drop target.
              if (event.dataTransfer.types.includes('text/plain')) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const dropped = event.dataTransfer.getData('text/plain');
              if (dropped) onAdd(well.name, dropped);
            }}
          >
            <h3 id={`well-${well.name}-label`}>{well.label}</h3>

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
