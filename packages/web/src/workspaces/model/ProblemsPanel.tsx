import type { Problem } from './problems';

/** The prototype's status glyphs (ui.js, STATUS_SVG): error and ok. */
function ErrorGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="var(--wc-status-error-icon)" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" strokeWidth="1.8" />
    </svg>
  );
}

function OkGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="var(--wc-status-success-icon)" />
      <path
        d="M4.5 8.2l2.2 2.2 4.8-4.8"
        stroke="var(--wc-bg-surface)"
        strokeWidth="1.8"
        fill="none"
      />
    </svg>
  );
}

/**
 * The Problems panel beneath the YAML (direction.md §7b; rule 28), as the
 * prototype draws it: each thing that stops the file parsing, by file and
 * line (T141, AC-135), and each a link to its line.
 */
export function ProblemsPanel({
  path,
  problems,
  onPick,
}: {
  path: string;
  problems: readonly Problem[];
  /** A problem picked: the editor goes to where it is. */
  onPick?: (problem: Problem) => void;
}) {
  const errors = problems.length;
  return (
    <section className="model-problems" aria-label="Problems">
      <h2 className="model-problems__head">
        Problems · {errors} {errors === 1 ? 'error' : 'errors'}
      </h2>
      {errors === 0 ? (
        <p className="model-problems__row">
          <OkGlyph />
          <span>No problems in {path}</span>
        </p>
      ) : (
        <ul className="model-problems__list">
          {problems.map((problem) => (
            // Two problems do not start at one place with one message.
            <li key={`${String(problem.from)} ${problem.message}`}>
              <button
                type="button"
                className="model-problems__row"
                onClick={() => {
                  onPick?.(problem);
                }}
              >
                <ErrorGlyph />
                <span>{problem.message}</span>
                <span className="model-problems__where">
                  {problem.path}:{problem.line}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
