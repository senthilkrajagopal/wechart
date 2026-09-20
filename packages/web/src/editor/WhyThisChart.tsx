import type { Explanation } from '@wechart/recommender';
import { useState } from 'react';

/**
 * "Why this chart?" (AC-029): the field signature with each field's
 * cardinality, and every hard rule with its verdict — for the candidates that
 * were rejected as well as the one that won.
 *
 * A trace of only the winner answers "what did you pick" and not "why not the
 * one I expected", which is the question someone opens this to ask.
 */
export interface WhyThisChartProps {
  readonly explanation: Explanation;
}

export function WhyThisChart({ explanation }: WhyThisChartProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="why-chart">
      <button type="button" aria-expanded={open} onClick={() => setOpen((shown) => !shown)}>
        Why this chart?
      </button>

      {open ? (
        <div data-testid="why-this-chart">
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
              {explanation.signature.map((field) => (
                <tr key={field.name} data-testid={`trace-field-${field.name}`}>
                  <th scope="row">{field.name}</th>
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
                  {candidate.chartType} —{' '}
                  {candidate.legal ? `allowed, cost ${String(candidate.score ?? 0)}` : 'rejected'}
                </p>
                <ul>
                  {candidate.rules.map((rule) => (
                    <li key={rule.rule} data-testid={`trace-${candidate.chartType}-${rule.rule}`}>
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
    </section>
  );
}
