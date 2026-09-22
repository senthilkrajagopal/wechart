import { useId, useState } from 'react';

import type { JoinGraph } from './joinGraph';

/**
 * The join editor (T144, AC-138): the model's join graph, as the prototype
 * draws it (model.js, renderDiagram) — a box a cube, its name and what it
 * holds; a curved arrow a join, from the cube declaring it to the cube it
 * names, labelled with the relationship — and a form to add a join to a cube
 * of this file.
 *
 * Drawn as SVG from the tokens: a picture whose every element a test can
 * find, and the joins are also listed in words, with links to the cubes'
 * files. Laid out on a circle sized so no two boxes meet, the cube being
 * edited at the top; each arrow bends to its own right, as the prototype's
 * curved edges do, so two cubes joining each other show two arrows; and the
 * arrows are drawn over the boxes, haloed, so one crossing a box is never
 * hidden by it (T144's review).
 */
const BOX = { width: 168, height: 52 };
const MARGIN = 16;
/** Room above the top box for a cube's loop to itself. */
const LOOP_ROOM = 48;

/** The three relationships the docs use (research Y.5). */
const RELATIONSHIPS = ['many_to_one', 'one_to_many', 'one_to_one'] as const;

const words = (relationship: string) => relationship.replace(/_/g, ' ');
const round = (value: number) => Math.round(value * 10) / 10;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Placed {
  readonly name: string;
  readonly path: string | undefined;
  readonly holds: string;
  readonly missing: boolean;
  readonly x: number;
  readonly y: number;
}

const centreOf = (box: Placed): Point => ({ x: box.x + BOX.width / 2, y: box.y + BOX.height / 2 });

/** Where the line from a box's centre toward a point leaves the box. */
function borderToward(box: Placed, toward: Point): Point {
  const centre = centreOf(box);
  const [dx, dy] = [toward.x - centre.x, toward.y - centre.y];
  const scale = Math.min(
    dx === 0 ? Infinity : BOX.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : BOX.height / 2 / Math.abs(dy),
  );
  return { x: centre.x + dx * scale, y: centre.y + dy * scale };
}

/**
 * On a circle whose neighbours' centres are further apart than a box's
 * diagonal, so no two boxes meet whatever the count; the first at the top.
 */
function layOut(boxes: readonly Omit<Placed, 'x' | 'y'>[]): Placed[] {
  const count = boxes.length;
  const apart = BOX.width + 24;
  const radius = count < 2 ? 0 : Math.max(110, apart / (2 * Math.sin(Math.PI / count)));
  const around = boxes.map((box, index) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(count, 1);
    return {
      ...box,
      x: Math.round(Math.cos(angle) * radius - BOX.width / 2),
      y: Math.round(Math.sin(angle) * radius - BOX.height / 2),
    };
  });
  const left = Math.min(...around.map((box) => box.x));
  const top = Math.min(...around.map((box) => box.y));
  return around.map((box) => ({
    ...box,
    x: box.x - left + MARGIN,
    y: box.y - top + MARGIN + LOOP_ROOM,
  }));
}

/** A join's path, and where its label goes: a curve bending to its right; a loop for a cube to itself. */
function drawJoin(from: Placed, to: Placed): { d: string; label: Point } {
  if (from === to) {
    const [x, y] = [from.x + BOX.width, from.y];
    const start = { x: x - 44, y };
    const end = { x, y: y + 16 };
    return {
      d: `M ${String(round(start.x))} ${String(round(start.y))} C ${String(round(start.x))} ${String(round(y - 40))}, ${String(round(x + 40))} ${String(round(y - 40))}, ${String(round(end.x))} ${String(round(end.y))}`,
      label: { x: round(x + 14), y: round(y - 30) },
    };
  }
  const [a, b] = [centreOf(from), centreOf(to)];
  const [dx, dy] = [b.x - a.x, b.y - a.y];
  const length = Math.hypot(dx, dy) || 1;
  // Its right-hand side: the way back bends the other way.
  const normal = { x: -dy / length, y: dx / length };
  const lift = Math.max(28, length * 0.16);
  const bend = { x: (a.x + b.x) / 2 + normal.x * lift, y: (a.y + b.y) / 2 + normal.y * lift };
  const start = borderToward(from, bend);
  const end = borderToward(to, bend);
  const middle = {
    x: 0.25 * start.x + 0.5 * bend.x + 0.25 * end.x + normal.x * 12,
    y: 0.25 * start.y + 0.5 * bend.y + 0.25 * end.y + normal.y * 12,
  };
  return {
    d: `M ${String(round(start.x))} ${String(round(start.y))} Q ${String(round(bend.x))} ${String(round(bend.y))} ${String(round(end.x))} ${String(round(end.y))}`,
    label: { x: round(middle.x), y: round(middle.y) },
  };
}

export function JoinEditor({
  graph,
  cube,
  cubes,
  onAdd,
  readOnly = false,
}: {
  graph: JoinGraph;
  /** The cube the editor opens on: marked, and the one a join is added to. */
  cube: string | undefined;
  /** The cubes this file defines, any of which a join can be added to. */
  cubes: readonly string[];
  /** Add a join to a cube of this file; whether it went in. */
  onAdd: (cube: string, join: { name: string; relationship: string; sql: string }) => boolean;
  /** While the page is read-only (AC-135), no join is taken. */
  readOnly?: boolean;
}) {
  const id = useId();
  const [chosen, setChosen] = useState(cube);
  const current = chosen !== undefined && cubes.includes(chosen) ? chosen : cubes[0];
  const [target, setTarget] = useState('');
  const [relationship, setRelationship] = useState('');
  const [condition, setCondition] = useState('');

  const boxes = [
    ...graph.cubes.map((each) => ({
      name: each.name,
      path: each.path as string | undefined,
      holds: `${String(each.dimensions)} dims · ${String(each.measures)} measures`,
      missing: false,
    })),
    ...graph.missing.map((name) => ({
      name,
      path: undefined,
      holds: 'not in plain YAML',
      missing: true,
    })),
  ];
  // The cube being edited first, so at the top.
  const placed = layOut([
    ...boxes.filter((each) => each.name === current),
    ...boxes.filter((each) => each.name !== current),
  ]);
  const at = new Map(placed.map((each) => [each.name, each]));
  const width = Math.max(...placed.map((each) => each.x + BOX.width), BOX.width) + MARGIN * 2 + 40;
  const height = Math.max(...placed.map((each) => each.y + BOX.height), BOX.height) + MARGIN;
  const pathOf = (name: string) => graph.cubes.find((each) => each.name === name)?.path;

  // At most one join per target cube (research Y.5).
  const joined = new Set(
    graph.joins.filter((join) => join.from === current).map((join) => join.to),
  );
  const targets = graph.cubes
    .map((each) => each.name)
    .filter((name) => name !== current && !joined.has(name));
  const ready =
    current !== undefined &&
    targets.includes(target) &&
    relationship !== '' &&
    condition.trim() !== '';

  const cubeLink = (name: string) => {
    const path = pathOf(name);
    return path === undefined || name === current ? (
      name
    ) : (
      <a href={`/model/files/${encodeURIComponent(path)}`}>{name}</a>
    );
  };

  return (
    <div className="join-editor">
      <div className="join-editor__canvas">
        <svg
          role="img"
          aria-label={`Join diagram: ${String(placed.length)} cubes, ${String(graph.joins.length)} joins${current === undefined ? '' : `, ${current} marked`}`}
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          width={width}
          height={height}
          className="join-editor__diagram"
        >
          <defs>
            <marker
              id="join-arrow"
              viewBox="0 0 8 8"
              refX="8"
              refY="4"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L8,4 L0,8 z" className="join-editor__arrow" />
            </marker>
          </defs>
          {placed.map((each) => (
            <g
              key={each.name}
              data-cube={each.name}
              data-current={each.name === current ? 'true' : undefined}
              data-missing={each.missing ? 'true' : undefined}
              className="join-editor__cube"
            >
              <rect x={each.x} y={each.y} width={BOX.width} height={BOX.height} rx={6} />
              <text x={each.x + 12} y={each.y + 21} className="join-editor__name">
                {each.name}
              </text>
              <text x={each.x + 12} y={each.y + 39} className="join-editor__holds">
                {each.holds}
              </text>
            </g>
          ))}
          {/* The joins over the boxes, haloed: a crossing never hides one. */}
          {graph.joins.map((join, index) => {
            const from = at.get(join.from);
            const to = at.get(join.to);
            if (from === undefined || to === undefined) return null;
            const { d, label } = drawJoin(from, to);
            return (
              <g
                key={`${String(index)} ${join.from}→${join.to}`}
                data-join={`${join.from}→${join.to}`}
              >
                <path d={d} className="join-editor__halo" />
                <path d={d} className="join-editor__edge" markerEnd="url(#join-arrow)" />
                <text
                  x={label.x}
                  y={label.y}
                  className="join-editor__relationship"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {words(join.relationship)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <ul className="join-editor__list" aria-label="Joins">
        {graph.joins.map((join, index) => (
          <li key={`${String(index)} ${join.from}→${join.to}`}>
            {cubeLink(join.from)} → {cubeLink(join.to)}, {words(join.relationship)}
            {graph.missing.includes(join.to) ? ` (${join.to} is in no plain YAML file)` : ''}
          </li>
        ))}
      </ul>

      {current === undefined ? (
        <p className="model-files__note">This file defines no cube to add a join to.</p>
      ) : (
        <form
          aria-label={`Add a join to ${current}`}
          className="join-editor__add"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready || readOnly) return;
            // Cleared only once it went in: held or refused, what was entered stays.
            if (onAdd(current, { name: target, relationship, sql: condition.trim() })) {
              setTarget('');
              setRelationship('');
              setCondition('');
            }
          }}
        >
          <fieldset className="join-editor__fields" disabled={readOnly}>
            {cubes.length < 2 ? null : (
              <div className="field">
                <label htmlFor={`${id}-cube`}>Joins for</label>
                <select
                  id={`${id}-cube`}
                  value={current}
                  onChange={(event) => {
                    setChosen(event.target.value);
                    setTarget('');
                  }}
                >
                  {cubes.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label htmlFor={`${id}-target`}>Target cube</label>
              <select
                id={`${id}-target`}
                value={targets.includes(target) ? target : ''}
                onChange={(event) => {
                  setTarget(event.target.value);
                }}
              >
                <option value="">(choose)</option>
                {targets.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-relationship`}>Relationship</label>
              <select
                id={`${id}-relationship`}
                value={relationship}
                onChange={(event) => {
                  setRelationship(event.target.value);
                }}
              >
                <option value="">(choose)</option>
                {RELATIONSHIPS.map((each) => (
                  <option key={each} value={each}>
                    {each}
                  </option>
                ))}
              </select>
            </div>
            <div className="field join-editor__condition">
              <label htmlFor={`${id}-condition`}>Condition</label>
              <input
                id={`${id}-condition`}
                type="text"
                placeholder={`{CUBE}.column = {${target === '' ? 'target' : target}}.column`}
                value={condition}
                onChange={(event) => {
                  setCondition(event.target.value);
                }}
              />
            </div>
            <button type="submit" className="btn-sm btn-primary" disabled={!ready}>
              Add join
            </button>
          </fieldset>
        </form>
      )}
    </div>
  );
}
