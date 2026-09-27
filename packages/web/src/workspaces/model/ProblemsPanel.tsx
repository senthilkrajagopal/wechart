import { StatusIcon } from '../../shell/StatusIcon';
import { exploreHref, folderChain } from '../explore/folders';
import type { FolderNode } from '../explore/FolderTree';
import type { Problem } from './problems';

/**
 * The prototype's status glyphs (ui.js, STATUS_SVG): error, the shared one
 * (T183, AC-177), and ok, in the success colour of its own.
 */
function ErrorGlyph() {
  return <StatusIcon kind="err" />;
}

function OkGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" data-icon="ok">
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

/** A reason Cube gave for refusing the model, on the file it is about (T142, AC-136). */
export interface CubeProblem {
  readonly path: string;
  /** The folder whose file it is, where that isn't the shared root's (T452). */
  readonly folderId?: string;
  readonly message: string;
  readonly line?: number;
  /**
   * A rollup refused: which. With the names, shown on its row in the
   * Pre-aggregations tab, when it names what the model doesn't have (T207,
   * AC-189); without, when Cube can't join its cubes (T265, AC-235).
   */
  readonly preAggregation?: {
    readonly cube: string;
    readonly name: string;
    readonly unknown?: readonly { readonly list: string; readonly name: string }[];
  };
}

/**
 * The Problems panel beneath the YAML (direction.md §7b; rule 28), as the
 * prototype draws it: each thing that stops the file parsing, by file and
 * line (T141, AC-135), and each a link to its line; then Cube's reasons for
 * refusing the last save, by file (T142, AC-136).
 */
export function ProblemsPanel({
  path,
  problems,
  cubeProblems = [],
  folders = [],
  onPick,
}: {
  path: string;
  problems: readonly Problem[];
  cubeProblems?: readonly CubeProblem[];
  /** The folders, to name the one a refusal about another folder's file is in. */
  folders?: readonly FolderNode[];
  /** A problem picked: the editor goes to where it is. */
  onPick?: (problem: Problem) => void;
}) {
  // Counted apart (AC-223), as the prototype's head does.
  const warnings = problems.filter((problem) => problem.severity === 'warning').length;
  const errors = problems.length - warnings + cubeProblems.length;
  return (
    <section className="model-problems" aria-label="Problems">
      <h2 className="model-problems__head">
        Problems · {errors} {errors === 1 ? 'error' : 'errors'} · {warnings}{' '}
        {warnings === 1 ? 'warning' : 'warnings'}
      </h2>
      {errors + warnings === 0 ? (
        <p className="model-problems__row">
          <OkGlyph />
          <span>
            No problems in <code>{path}</code>
          </span>
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
                {problem.severity === 'warning' ? <StatusIcon kind="warn" /> : <ErrorGlyph />}
                <span className="model-problems__message">{problem.message}</span>
                <span className="model-problems__where">
                  {problem.path}:{problem.line}
                </span>
              </button>
            </li>
          ))}
          {cubeProblems.map((problem, index) => (
            // Cube's own order: the same message can be on two files.
            <li key={`cube ${String(index)}`}>
              <p className="model-problems__row">
                <ErrorGlyph />
                <span className="model-problems__message">
                  {/* A rollup's unknown names are wechart's refusal, not Cube's (T207's review). */}
                  {problem.preAggregation === undefined ? 'Cube: ' : ''}
                  {problem.message}
                </span>
                {problem.folderId !== undefined ? (
                  // Another folder's file (T450's review): said with its
                  // folder, and a way to that folder, never to the root's
                  // file of the same path.
                  <a className="model-problems__where" href={exploreHref(problem.folderId)}>
                    {folderChain(folders, problem.folderId)
                      .map((crumb) => crumb.title)
                      .join(' / ')}
                    {' · '}
                    {problem.line === undefined
                      ? problem.path
                      : `${problem.path}:${String(problem.line)}`}
                  </a>
                ) : problem.path === path ? (
                  <span className="model-problems__where">
                    {problem.line === undefined
                      ? problem.path
                      : `${problem.path}:${String(problem.line)}`}
                  </span>
                ) : (
                  // In another file: a way to it, where its rollup's row says what is wrong.
                  <a
                    className="model-problems__where"
                    href={`/model/files/${encodeURIComponent(problem.path)}`}
                  >
                    {problem.line === undefined
                      ? problem.path
                      : `${problem.path}:${String(problem.line)}`}
                  </a>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
