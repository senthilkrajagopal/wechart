import type { Marking } from '@wechart/core';
import { useId } from 'react';

/**
 * Which marking a chart tile marks with (AC-085, direction.md rule 44).
 *
 * Three answers, not two: a marking of the dashboard's, "(None)" for a tile
 * that cannot be marked at all, and — for a tile that names none — the
 * dashboard's default, which is what it is actually marking with. "(None)"
 * is stored as `''` rather than by removing the field, because an absent
 * field means "follow the default" and those are different answers.
 */
export interface TileMarkingProps {
  readonly markings: readonly Marking[];
  /** The tile's own setting: a marking's id, `''` for none, absent to follow the default. */
  readonly marksWith: string | undefined;
  readonly onChange: (marksWith: string) => void;
}

export function TileMarking({ markings, marksWith, onChange }: TileMarkingProps) {
  const id = useId();
  const fallback = markings.find((each) => each.isDefault)?.id ?? '';
  const chosen = marksWith ?? fallback;

  return (
    <div className="field">
      <label htmlFor={id}>Marking</label>
      <select
        id={id}
        className="select-sm"
        value={chosen}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {/* A tile that marks with nothing: clicking it changes no marking. */}
        <option value="">(None)</option>
        {markings.map((marking) => (
          <option key={marking.id} value={marking.id}>
            {marking.name}
          </option>
        ))}
      </select>
    </div>
  );
}
