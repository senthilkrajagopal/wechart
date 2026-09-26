import { Document, isMap, isNode, isScalar, isSeq, parseDocument, type YAMLSeq } from 'yaml';

import type { ModelFile } from '../server';

/**
 * One cube or one view per model file (T448, AC-337).
 *
 * From the move to xcube's items mode each file is one item, and an item
 * holds exactly one cube or view (research `xcube-slice-3a.md`, "Items";
 * R30). A file declaring several is split into one file each, named for what
 * it declares, in the same folder; each keeps its definition as it was
 * written, comments included (research `yaml.md`: the `Document` tree keeps
 * them, `lineWidth: 0` folds no long line).
 */

export interface Declared {
  readonly kind: 'cube' | 'view';
  readonly name: string;
}

/** Cube's own test for a YAML file it renders with Jinja first (as `publish.ts` has it). */
const JINJA = /{%|%}|{{|}}/;

/** A path segment the publish route takes (`publish.ts`'s MODEL_PATH, one segment). */
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

const KINDS = { cubes: 'cube', views: 'view' } as const;

/** Each top-level list of the file, cubes or views, in the file's order, with its items. */
function listsOf(content: string) {
  const document = parseDocument(content);
  if (document.errors.length > 0 || !isMap(document.contents)) return undefined;
  const lists: { key: keyof typeof KINDS; seq: YAMLSeq; comment: string | undefined }[] = [];
  for (const pair of document.contents.items) {
    const key = isScalar(pair.key) ? pair.key.value : pair.key;
    // A comment above `cubes:` or `views:` is held on that key.
    const comment = isScalar(pair.key) ? (pair.key.commentBefore ?? undefined) : undefined;
    if ((key === 'cubes' || key === 'views') && isSeq(pair.value))
      lists.push({ key, seq: pair.value, comment });
  }
  // A comment opening the file is the document's, or its map's.
  const opening =
    [document.commentBefore, document.contents.commentBefore].filter(Boolean).join('\n') ||
    undefined;
  return { document, lists, opening };
}

/** The cubes and views a file declares, in its order; nothing for one that doesn't parse. */
export function declaredIn(content: string): Declared[] {
  return (listsOf(content)?.lists ?? []).flatMap(({ key, seq }) =>
    seq.items.map((item) => {
      const name = isMap(item) ? item.get('name') : undefined;
      return { kind: KINDS[key], name: typeof name === 'string' ? name : '' };
    }),
  );
}

/**
 * A file as one file per cube or view it declares, never at a path in
 * `taken` but its own. A file declaring one or none, a Jinja template (not
 * wechart's to rewrite, AC-140) or one that doesn't parse comes back as it is.
 */
export function splitFile(file: ModelFile, taken: ReadonlySet<string>): ModelFile[] {
  // Only YAML is ever an item (AC-335); anything else is left as it is.
  if (!/\.ya?ml$/.test(file.path) || JINJA.test(file.content)) return [file];
  const parsed = listsOf(file.content);
  if (parsed === undefined) return [file];
  const items = parsed.lists.flatMap(({ key, seq, comment }) =>
    seq.items.map((item, at) => ({ key, item, comment: at === 0 ? comment : undefined })),
  );
  if (items.length < 2) return [file];

  const slash = file.path.lastIndexOf('/');
  const folder = file.path.slice(0, slash + 1);
  const extension = /\.ya?ml$/.exec(file.path)?.[0] ?? '.yml';
  const stem = file.path.slice(slash + 1, file.path.length - extension.length);
  // Its own path is free once it is split; another file's never is.
  const used = new Set([...taken].filter((path) => path !== file.path));

  return items.map(({ key, item, comment }, index) => {
    const name = isMap(item) ? item.get('name') : undefined;
    const base =
      typeof name === 'string' && SEGMENT.test(name) ? name : `${stem}-${String(index + 1)}`;
    let path = `${folder}${base}${extension}`;
    for (let n = 2; used.has(path); n += 1) path = `${folder}${base}-${String(n)}${extension}`;
    used.add(path);

    // The file's opening comment stays at the top of the first piece, and a
    // comment above `cubes:` or `views:` at the top of that list's first.
    const above = [index === 0 ? parsed.opening : undefined, comment].filter(Boolean).join('\n');
    const written = (value: unknown) => {
      const piece = new Document({ [key]: [] });
      (piece.get(key, true) as YAMLSeq).items.push(value);
      if (above !== '') piece.commentBefore = above;
      return piece.toString({ lineWidth: 0 });
    };
    try {
      return { path, content: written(item) };
    } catch {
      // An alias whose anchor is in another piece can't be written on its
      // own (yaml's "Unresolved alias"): that piece is written with what the
      // alias stood for, its comments dropped rather than the API stopped.
      return { path, content: written(isNode(item) ? item.toJS(parsed.document) : item) };
    }
  });
}

/** "a", "a and b", "a, b and c". */
const listed = (names: readonly string[]) =>
  names.length < 2
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;

/**
 * Why a file can't be published, where it declares more than one cube or
 * view, naming them (AC-337); undefined for a file declaring one or none.
 */
export function severalIn(file: ModelFile): { path: string; message: string } | undefined {
  const declared = declaredIn(file.content);
  if (declared.length < 2) return undefined;
  const named = (kind: Declared['kind']) =>
    declared.filter((each) => each.kind === kind).map((each) => each.name || '(unnamed)');
  const groups = (['cube', 'view'] as const)
    .map((kind) => [kind, named(kind)] as const)
    .filter(([, names]) => names.length > 0)
    .map(([kind, names]) => `the ${kind}${names.length > 1 ? 's' : ''} ${listed(names)}`);
  return {
    path: file.path,
    message: `A model file holds one cube or view, and this one declares ${String(declared.length)}: ${groups.join(', and ')}. Put each in a file of its own.`,
  };
}

/** A set of files with each that declares several split, and what each became. */
export function splitFiles(files: readonly ModelFile[]): {
  files: ModelFile[];
  split: { path: string; into: string[] }[];
} {
  const taken = new Set(files.map((file) => file.path));
  const out: ModelFile[] = [];
  const split: { path: string; into: string[] }[] = [];
  for (const file of files) {
    const pieces = splitFile(file, taken);
    out.push(...pieces);
    if (pieces.length < 2) continue;
    taken.delete(file.path);
    for (const piece of pieces) taken.add(piece.path);
    split.push({ path: file.path, into: pieces.map((piece) => piece.path) });
  }
  return { files: out, split };
}

/**
 * The stored model, one cube or view per file (T448, AC-337): run at start,
 * each stored file that declares several replaced by its pieces, and said.
 * A model already split is left alone, so a restart changes nothing.
 */
export async function splitStored(
  store: {
    list(): Promise<readonly ModelFile[]>;
    replace(path: string, files: readonly ModelFile[]): Promise<unknown>;
  },
  say: (message: string) => void,
): Promise<void> {
  const stored = await store.list();
  const { files, split } = splitFiles(stored);
  for (const { path, into } of split) {
    await store.replace(
      path,
      files.filter((file) => into.includes(file.path)),
    );
    say(`Split ${path} into ${into.join(', ')}: a model file holds one cube or view.`);
  }
}

/**
 * The model at start (T448, AC-337): what the store holds is split first, so
 * a file it already holds whole — edited since, maybe — keeps the names its
 * cubes are known by; then the model directory's files are seeded, split,
 * so none is taken in whole, and none twice (a seed never writes over a
 * stored path). T448's review, finding 1: seeded first, the store's copy
 * was split to `orders-2.yml` beside the directory's `orders.yml`, and every
 * cube was declared twice.
 */
export async function startModel(
  store: Parameters<typeof splitStored>[0] & {
    seed(files: readonly ModelFile[]): Promise<unknown>;
  },
  directory: readonly ModelFile[],
  say: (message: string) => void,
): Promise<void> {
  await splitStored(store, say);
  await store.seed(splitFiles(directory).files);
}
