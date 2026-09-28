import { StatusIcon } from '../../shell/StatusIcon';
import type { Annotation } from './annotations';

/**
 * What a form edit could lose, said upfront (T482, AC-134; design 03 note 4,
 * UX-070, MW-07): the file's comments, anchors and aliases, counted, each
 * place named by its YAML lines and the first by its words, with Show in YAML
 * and Hide. The form keeps them as built — edits go into the parsed file in
 * place (sync.ts) — and asks before the one edit that loses one, so the bar
 * says that, rather than design 03's "drops it". The just-in-time question
 * (LossWarning) still asks.
 */
const plural = (count: number, one: string, many: string) =>
  `${String(count)} ${count === 1 ? one : many}`;

/** About design 03's quote: "Cube hides primary keys from metadata unless told …". */
const QUOTE_LENGTH = 52;

/** A comment's first line, cut at a word inside the quote's length. */
function quoteOf(text: string): string {
  if (text.length <= QUOTE_LENGTH) return text;
  const cut = text.slice(0, QUOTE_LENGTH);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1))} …`;
}

const linesOf = (each: Annotation) =>
  each.from === each.to ? String(each.from) : `${String(each.from)}–${String(each.to)}`;

/** Places listed before "and n more". */
const SHOWN = 4;

export function AnnotationsBar({
  annotations,
  onShow,
  onHide,
}: {
  annotations: readonly Annotation[];
  onShow: () => void;
  onHide: () => void;
}) {
  if (annotations.length === 0) return null;
  const count = (kind: Annotation['kind']) =>
    annotations.filter((each) => each.kind === kind).length;
  const counts = [
    [count('comment'), 'comment', 'comments'],
    [count('anchor'), 'anchor', 'anchors'],
    [count('alias'), 'alias', 'aliases'],
  ] as const;
  const said = counts.filter(([n]) => n > 0).map(([n, one, many]) => plural(n, one, many));
  const what = said.length === 1 ? said[0] : `${said.slice(0, -1).join(', ')} and ${said.at(-1)}`;
  const [first, ...rest] = annotations;
  const places = [
    first === undefined
      ? ''
      : first.kind === 'comment'
        ? `${linesOf(first)}, “${quoteOf(first.text)}”`
        : `${linesOf(first)}, ${first.kind === 'anchor' ? '&' : '*'}${first.text}`,
    ...rest.slice(0, SHOWN - 1).map(linesOf),
  ];
  const more = annotations.length - SHOWN;
  const single = annotations.length === 1;
  return (
    <div className="model-editor__warnbar model-annotations" role="note">
      <StatusIcon kind="warn" />
      <div className="model-editor__warnbar-text">
        <p className="model-annotations__what">
          This file has {what} (YAML lines {places.join(', ')}
          {more > 0 ? `, and ${String(more)} more` : ''}).
        </p>{' '}
        <p className="model-annotations__why">
          The form keeps {single ? 'it' : 'them'}, and asks first before an edit that would take
          away the key {single ? 'it is' : 'one is'} written on; the YAML keeps everything.
        </p>
        <div className="model-annotations__actions">
          <button type="button" className="btn-sm" onClick={onShow}>
            Show in YAML
          </button>
          <button type="button" className="btn-sm" onClick={onHide}>
            Hide
          </button>
        </div>
      </div>
    </div>
  );
}
