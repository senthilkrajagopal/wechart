import { parallelOption } from '@wechart/charts';
import { formatterFor, membersOn, type ParallelBrush, type RenderSpec } from '@wechart/core';
import { useMemo } from 'react';

/** How many steps an axis's sliders take from its minimum to its maximum. */
const STEPS = 100;

/**
 * Parallel coordinates' brushes from the keyboard (T984, AC-600; design 23's
 * keyboard section; rules 159, 167): under the chart, a From and a To slider
 * for each axis, named "‹measure› from" and "‹measure› to", each from the
 * axis's minimum to its maximum in a hundred steps, so Tab reaches them and
 * ← and → move them. Moving one sets that axis's brush as a drag along it
 * does, added to the other axes' brushes; From is kept at or under To.
 */
export function ParallelSliders({
  spec,
  onBrush,
}: {
  readonly spec: RenderSpec;
  readonly onBrush: (brush: ParallelBrush, add: boolean) => void;
}) {
  const axes = useMemo(() => {
    const members = membersOn(spec.encoding, 'y');
    const drawn = (parallelOption(spec)['parallelAxis'] ?? []) as {
      dim: number;
      min: number;
      max: number;
    }[];
    return drawn.flatMap(({ dim, min, max }) => {
      const member = members[dim];
      return member === undefined ? [] : [{ member, min, max }];
    });
  }, [spec]);
  if (axes.length === 0) return null;

  const titleOf = (member: string) => spec.titles?.[member] ?? member;
  return (
    <div className="tile-notes parallel-sliders" data-testid="parallel-sliders">
      {axes.map(({ member, min, max }) => {
        const brush = spec.parallelBrushes?.find((one) => one.member === member);
        const [from, to] = [brush?.from ?? min, brush?.to ?? max];
        const write = formatterFor(member, spec.formats ?? {});
        const step = (max - min) / STEPS || 1;
        const slider = (end: 'from' | 'to', value: number) => (
          <input
            type="range"
            aria-label={`${titleOf(member)} ${end}`}
            aria-valuetext={write(value)}
            min={min}
            max={max}
            step={step}
            value={value}
            tabIndex={0}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (!Number.isFinite(next)) return;
              onBrush(
                end === 'from'
                  ? { member, from: Math.min(next, to), to }
                  : { member, from, to: Math.max(next, from) },
                true,
              );
            }}
          />
        );
        return (
          <span className="parallel-sliders__axis" key={member}>
            {/* Its measure, for the eye; each slider is named for itself. */}
            <span aria-hidden="true">{titleOf(member)}</span>
            {slider('from', from)}
            {slider('to', to)}
          </span>
        );
      })}
    </div>
  );
}
