import { CHART_TYPE_NAMES, type ChartType } from '@wechart/core';
import type { Explanation } from '@wechart/recommender';
import { useState } from 'react';

import { StatusIcon } from '../shell/StatusIcon';

/**
 * "Why this recommendation?" (AC-029 as amended by R76, chart-editor-Q3;
 * T689, EDI-12): design 01 pin 9 and state C's checklist, collapsed at first
 * and last in the inspector. Open, it lists with ✓/⚠ icons the signature,
 * each field's distinct values in this result, the rules that decided — each
 * type a hard rule rejected, and why — the pick with its reason, and the
 * runners-up with theirs (AC-028). "Show every rule for every type" keeps the
 * full table one click away: the signature with each field's cardinality, and
 * every hard rule with its verdict for every type, the rejected ones too.
 *
 * A trace of only the winner answers "what did you pick" and not "why not the
 * one I expected", which is the question someone opens this to ask. Members
 * are named by their titles throughout (AC-220).
 */
export interface WhyThisChartProps {
  readonly explanation: Explanation;
  /** The recommender's pick and runners-up, each with its reason. */
  readonly picked?:
    | {
        readonly type: ChartType;
        readonly reason: string;
        readonly runnersUp: readonly { readonly type: ChartType; readonly reason: string }[];
      }
    | undefined;
  /** Each member's title from the model: the trace names fields by them (AC-220). */
  readonly titles?: Readonly<Record<string, string>>;
}

const nameOf = (type: string) => CHART_TYPE_NAMES[type as ChartType] ?? type;
const counted = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

export function WhyThisChart({ explanation, picked, titles = {} }: WhyThisChartProps) {
  const [open, setOpen] = useState(false);
  const [every, setEvery] = useState(false);
  const titleOf = (name: string) => titles[name] ?? name;
  const fields = explanation.signature;
  const of = (kind: string) => fields.filter((field) => field.kind === kind).length;
  const times = of('timeDimension');
  const signature = `Signature: ${counted(of('dimension'), 'category', 'categories')} × ${counted(
    of('measure'),
    'measure',
    'measures',
  )}, ${times === 0 ? 'no time' : counted(times, 'time field', 'time fields')}`;
  /** Each type a hard rule rejected, by the first rule that did: what decided. */
  const rejected = explanation.candidates.flatMap((candidate) => {
    const rule = candidate.rules.find((each) => !each.passed);
    return candidate.legal || rule === undefined ? [] : [{ type: candidate.chartType, rule }];
  });
  const rules = Math.max(0, ...explanation.candidates.map((candidate) => candidate.rules.length));

  return (
    <section className="why-chart">
      {/* Design 01's .whybtn, its caret muted (pin 9). */}
      <button
        type="button"
        className="why-chart__toggle"
        aria-expanded={open}
        onClick={() => setOpen((shown) => !shown)}
      >
        <span className="why-chart__caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        Why this recommendation?
      </button>

      {open ? (
        <>
          <ul className="why-chart__checks" data-testid="why-checklist">
            <li className="why-chart__check">
              <StatusIcon kind="ok" />
              <span>{signature}</span>
            </li>
            {explanation.oneValueAxis === undefined ? null : (
              // A second axis the author drew in a combo (AC-510, design 20
              // state L): said, never weighed.
              <li className="why-chart__check" data-testid="check-one-value-axis">
                <StatusIcon kind="warn" />
                <span>One value axis: {explanation.oneValueAxis}</span>
              </li>
            )}
            {fields
              .filter((field) => field.kind !== 'measure')
              .map((field) => (
                <li key={field.name} className="why-chart__check">
                  <StatusIcon kind={field.cardinality === null ? 'warn' : 'ok'} />
                  <span>
                    {titleOf(field.name)}:{' '}
                    {field.cardinality === null
                      ? 'distinct values not yet counted'
                      : `${counted(field.cardinality, 'distinct value', 'distinct values')} in this result`}
                  </span>
                </li>
              ))}
            {rejected.map(({ type, rule }) => (
              <li key={type} className="why-chart__check" data-testid={`check-${type}`}>
                <StatusIcon kind="warn" />
                <span>
                  {nameOf(type)}: {rule.reason ?? rule.rule}
                </span>
              </li>
            ))}
            {picked === undefined ? null : (
              <>
                <li className="why-chart__check">
                  <StatusIcon kind="ok" />
                  <span data-testid="picked-type" data-chart-type={picked.type}>
                    <b>Picked {nameOf(picked.type)}:</b> {picked.reason}
                  </span>
                </li>
                {picked.runnersUp.length === 0 ? null : (
                  <li className="why-chart__check why-chart__check--plain">
                    <span aria-hidden="true" />
                    <span className="why-chart__runners">
                      Runners-up:{' '}
                      {picked.runnersUp.map((runnerUp, at) => (
                        <span key={runnerUp.type}>
                          {at === 0 ? null : ' · '}
                          <span data-testid={`runner-up-${runnerUp.type}`}>
                            {nameOf(runnerUp.type)} — {runnerUp.reason}
                          </span>
                        </span>
                      ))}
                    </span>
                  </li>
                )}
              </>
            )}
          </ul>
          {/* AC-029's full table, one click away. */}
          <button
            type="button"
            className="why-chart__every"
            aria-expanded={every}
            onClick={() => setEvery((shown) => !shown)}
          >
            Show every rule for every type (
            {counted(explanation.candidates.length, 'type', 'types')} ×{' '}
            {counted(rules, 'rule', 'rules')})
          </button>
          {every ? (
            <div className="why-chart__table" data-testid="why-this-chart">
              <h4>Fields</h4>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Field</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Distinct values</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => (
                    <tr key={field.name} data-testid={`trace-field-${field.name}`}>
                      <th scope="row">{titleOf(field.name)}</th>
                      <td>{field.kind}</td>
                      <td>{field.cardinality ?? 'unknown'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h4>Candidates</h4>
              <ul>
                {explanation.candidates.map((candidate) => (
                  <li key={candidate.chartType} data-testid={`trace-${candidate.chartType}`}>
                    <p>
                      {/* Icon plus word, never colour alone (direction.md rule 3). */}
                      <span data-icon={candidate.legal ? 'pass' : 'fail'} aria-hidden="true">
                        {candidate.legal ? '✓' : '✗'}
                      </span>{' '}
                      {/* By its name, never its id (AC-217). */}
                      {nameOf(candidate.chartType)} —{' '}
                      {candidate.legal
                        ? `allowed, cost ${String(candidate.score ?? 0)}`
                        : 'rejected'}
                    </p>
                    <ul>
                      {candidate.rules.map((rule) => (
                        <li
                          key={rule.rule}
                          data-testid={`trace-${candidate.chartType}-${rule.rule}`}
                        >
                          <span data-icon={rule.passed ? 'pass' : 'fail'} aria-hidden="true">
                            {rule.passed ? '✓' : '✗'}
                          </span>{' '}
                          {rule.rule}
                          {rule.passed ? ' passed' : `: ${rule.reason ?? 'failed'}`}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
