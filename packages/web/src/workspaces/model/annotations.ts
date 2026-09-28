/**
 * What a model file holds that a form edit can lose (T482, AC-134; design 03
 * note 4): its comments, anchors and aliases, each with the YAML lines it is
 * on — so the editor names them before any edit, not only when one would
 * drop them (lossCheck.ts), and shows them in the YAML.
 *
 * Read line by line, as YAML writes them: a `#` begins a comment at a line's
 * start or after a space, outside quotes; a block scalar's lines (`|`, `>`)
 * are its text. Consecutive comment lines are one note, named by its first.
 */
export interface Annotation {
  readonly kind: 'comment' | 'anchor' | 'alias';
  /** A comment's first line, without its `#`; an anchor's or an alias's name. */
  readonly text: string;
  /** The 1-based YAML lines it spans. */
  readonly from: number;
  readonly to: number;
}

type Quote = '"' | "'" | null;

/**
 * A line read outside quotes: where its comment starts (or -1), its code with
 * every quoted character blanked, so nothing quoted reads as a mark, and the
 * quote it ends inside — a quoted value may run over lines (T482's review).
 */
function scan(line: string, from: Quote): { comment: number; code: string; quote: Quote } {
  let quote = from;
  let code = '';
  for (let at = 0; at < line.length; at += 1) {
    const char = line.charAt(at);
    if (quote === '"') {
      code += ' ';
      if (char === '\\') {
        code += ' ';
        at += 1;
      } else if (char === '"') quote = null;
    } else if (quote === "'") {
      code += ' ';
      // `''` is a quote inside single quotes.
      if (char === "'") {
        if (line.charAt(at + 1) === "'") {
          code += ' ';
          at += 1;
        } else quote = null;
      }
    } else if (char === '"' || char === "'") {
      // A quote opens a quoted scalar only where a value starts.
      const before = line.slice(0, at).trimEnd();
      if (before === '' || /[:[{,-]$/.test(before)) quote = char;
      code += quote === null ? char : ' ';
    } else if (char === '#' && (at === 0 || /\s/.test(line.charAt(at - 1)))) {
      return { comment: at, code, quote };
    } else code += char;
  }
  return { comment: -1, code, quote };
}

const indentOf = (line: string) => line.length - line.trimStart().length;

/** A block scalar's header ends a line: `key: |`, `- >-`, `key: |2+`. */
const BLOCK = /(?:^|[:-]\s|^\s*-\s)\s*[|>][0-9+-]*\s*$/;

/**
 * The column a block scalar's text must be deeper than: its key's, after any
 * `- ` before it; with no key (`- |`), its dash's (T482's review).
 */
function blockParent(code: string): number {
  const lead = /^\s*(?:-\s+)*/.exec(code)?.[0] ?? '';
  if (/^[|>]/.test(code.slice(lead.length))) {
    const dash = lead.lastIndexOf('-');
    return dash === -1 ? indentOf(code) : dash;
  }
  return lead.length;
}

/**
 * Anchors and aliases, `&name` and `*name`, only where a node starts (T482's
 * review): after the indent and any `- `, after `: `, after a tag, and — in a
 * flow collection — after `[`, `{` or `,`. Elsewhere they are a plain value's
 * text, as in "Orders *excluding* returns".
 */
const NAME = '([&*])([^\\s,[\\]{}]+)';
const MARKS = new RegExp(`(?:^\\s*(?:-\\s+)*|:\\s+|!\\S*\\s+)${NAME}`, 'g');
const FLOW_MARKS = new RegExp(`(?:^\\s*(?:-\\s+)*|:\\s+|!\\S*\\s+|[[{,]\\s*)${NAME}`, 'g');
/** A value that opens a flow collection: `key: [`, `- {`, `[`. */
const FLOW = /(?:^|:\s|-\s)\s*[[{]/;

export function annotationsOf(text: string): Annotation[] {
  const found: Annotation[] = [];
  const lines = text.split('\n');
  /** The indent a block scalar's text is deeper than, while in one. */
  let block: number | null = null;
  /** The quote a line starts inside: one opened on a line before. */
  let quote: Quote = null;
  /** The comment block being read: its first line and where it ends so far. */
  let open: { text: string; from: number; to: number } | null = null;
  const close = () => {
    if (open !== null) found.push({ kind: 'comment', ...open });
    open = null;
  };

  lines.forEach((line, index) => {
    const number = index + 1;
    if (block !== null) {
      if (line.trim() === '' || indentOf(line) > block) return;
      block = null;
    }
    const scanned = scan(line, quote);
    const { comment: at, code } = scanned;
    quote = scanned.quote;
    const note = at === -1 ? undefined : line.slice(at + 1).trim();

    if (code.trim() === '') {
      // A line of only a comment carries on the block; a blank line ends it.
      if (note !== undefined && note !== '') {
        if (open === null) open = { text: note, from: number, to: number };
        else open = { ...open, to: number };
      } else if (note === undefined) close();
      return;
    }
    close();
    for (const match of code.matchAll(FLOW.test(code) ? FLOW_MARKS : MARKS)) {
      const [, sign, name] = match;
      if (name === undefined) continue;
      found.push({ kind: sign === '&' ? 'anchor' : 'alias', text: name, from: number, to: number });
    }
    if (note !== undefined && note !== '')
      found.push({ kind: 'comment', text: note, from: number, to: number });
    if (quote === null && BLOCK.test(code)) block = blockParent(code);
  });
  close();
  return found;
}
