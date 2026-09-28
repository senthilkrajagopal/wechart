import { memberIndexOf } from './form/scopes';

interface ModelFile {
  readonly path: string;
  readonly content: string;
}

/**
 * The unpublished files to publish with `file` (T488, AC-346): those that
 * alone define a cube its cubes join, then the ones those join, each once.
 * Cube refuses a join to a cube it doesn't have (R36; research/cube/
 * rollup-join-paths.md, "Cube <B> doesn't exist"), so a draft joining a draft
 * compiles only with it. A cube a published file defines needs no draft, and
 * a cube the model lacks has none to bring.
 */
export function draftJoinsOf(
  file: ModelFile,
  stored: readonly ModelFile[],
  drafts: readonly ModelFile[],
): string[] {
  // A cube the file defines itself, or a published file does, needs no draft.
  const published = new Set([...memberIndexOf(stored).keys(), ...memberIndexOf([file]).keys()]);
  const draftOf = new Map<string, ModelFile>();
  for (const draft of drafts)
    for (const name of memberIndexOf([draft]).keys())
      if (!draftOf.has(name)) draftOf.set(name, draft);
  const found: string[] = [];
  const seen = new Set([file.path]);
  const queue = [file];
  for (let at = 0; at < queue.length; at += 1) {
    const each = queue[at];
    if (each === undefined) continue;
    for (const members of memberIndexOf([each]).values())
      for (const join of members.joins) {
        const draft = published.has(join) ? undefined : draftOf.get(join);
        if (draft === undefined || seen.has(draft.path)) continue;
        seen.add(draft.path);
        found.push(draft.path);
        queue.push(draft);
      }
  }
  return found;
}
