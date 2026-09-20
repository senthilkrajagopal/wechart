import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { GROUP_LABELS, cubesFrom, groupMembers, membersOf } from './fields';

/**
 * The chart editor's field list (AC-025): the cubes and views the model
 * exposes, and the members of the chosen one, grouped by type.
 *
 * Metadata comes from wechart's API, never from Cube directly — the browser
 * holds no Cube credentials and makes no request to the Cube host (AC-007).
 */
const MEMBER_ICON: Record<string, string> = {
  measure: 'Σ',
  dimension: 'Aa',
  timeDimension: '◷',
  segment: '⊂',
};

export interface FieldListProps {
  /** Lifted so the editor can build a query from the chosen cube's members. */
  readonly cubeName?: string;
  readonly onCubeChange?: (cubeName: string) => void;
}

export function FieldList({ cubeName: controlled, onCubeChange }: FieldListProps = {}) {
  const [own, setOwn] = useState('');
  const cubeName = controlled ?? own;
  const setCubeName = (next: string) => {
    setOwn(next);
    onCubeChange?.(next);
  };

  const meta = useQuery({
    queryKey: ['meta'],
    queryFn: async () => {
      const response = await fetch('/api/meta');
      if (!response.ok) throw new Error(`Could not load the model: ${String(response.status)}`);
      return (await response.json()) as unknown;
    },
  });

  if (meta.isPending) return <p>Loading the model…</p>;
  if (meta.isError) {
    return <p role="alert">{(meta.error as Error).message}</p>;
  }

  const cubes = cubesFrom(meta.data);
  const groups = cubeName ? groupMembers(membersOf(meta.data, cubeName)) : [];

  return (
    <div className="field-list">
      <label htmlFor="cube-picker">Cube or view</label>
      <select
        id="cube-picker"
        value={cubeName}
        onChange={(event) => setCubeName(event.target.value)}
      >
        <option value="">Choose a cube or view…</option>
        {cubes.map((cube) => (
          <option key={cube.name} value={cube.name}>
            {cube.title}
            {cube.isView ? ' (view)' : ''}
          </option>
        ))}
      </select>

      {cubeName === '' ? (
        <p data-testid="no-cube-chosen">Choose a cube or view to see its fields.</p>
      ) : (
        groups.map(([kind, members]) => (
          <section key={kind} data-testid={`group-${kind}`}>
            <h3>{GROUP_LABELS[kind]}</h3>
            <ul aria-label={GROUP_LABELS[kind]}>
              {members.map((member) => (
                <li
                  key={member.name}
                  data-testid={`member-${member.name}`}
                  draggable
                  // The pointer route into a well (AC-026). The keyboard route
                  // is each well's "+" picker, not this.
                  onDragStart={(event) => {
                    event.dataTransfer.setData('text/plain', member.name);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                >
                  {/* Type shown as an icon and a group heading, never colour
                      alone (direction.md rule 3). */}
                  <span data-icon={kind} aria-hidden="true">
                    {MEMBER_ICON[kind]}
                  </span>{' '}
                  {member.shortTitle}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
