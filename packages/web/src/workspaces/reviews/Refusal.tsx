import { StateLine } from '../../shell/StatusIcon';
import { folderText } from './reviews';

/**
 * An approval the publish check refused (T451; AC-322, AC-321; design 05,
 * state L): each break in a folder the reviewer may see, with its file, its
 * folder, the line and column where xcube gives them, and its error; a count
 * for the rest. Nothing changed: the folder and the proposal are as they
 * were.
 */
export interface Break {
  readonly path: string;
  /** Its folder from Shared down: `['Shared', 'Sales', 'EMEA']`. */
  readonly folderPath: readonly string[];
  readonly line?: number;
  readonly column?: number;
  readonly message: string;
}

const items = (n: number) => `${String(n)} ${n === 1 ? 'item' : 'items'}`;

export function Refusal({
  breaks,
  hidden,
}: {
  readonly breaks: readonly Break[];
  /** Breaks in folders the reviewer may not see: counted, never named. */
  readonly hidden: number;
}) {
  return (
    <div className="review-refusal">
      <StateLine kind="err">
        {breaks.length === 0
          ? `Can’t approve: ${items(hidden)} in folders you can’t see would break`
          : `Can’t approve: ${items(breaks.length)} would break`}
      </StateLine>
      {breaks.length === 0 ? null : (
        <ul className="review-refusal__breaks">
          {breaks.map((each, at) => (
            <li key={`${each.path}-${String(at)}`} className="review-refusal__break">
              <span>
                <b className="mono">{each.path}</b> · {folderText(each.folderPath)}
                {each.line === undefined
                  ? ''
                  : ` · line ${String(each.line)}${each.column === undefined ? '' : `, column ${String(each.column)}`}`}
              </span>
              <span className="mono">{each.message}</span>
            </li>
          ))}
        </ul>
      )}
      {breaks.length > 0 && hidden > 0 ? (
        <p className="review-refusal__hidden">
          {items(hidden)} in {hidden === 1 ? 'a folder' : 'folders'} you can’t see would also break.
        </p>
      ) : null}
    </div>
  );
}
