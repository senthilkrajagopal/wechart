import { isMap, isScalar, isSeq, parseDocument, type Document } from 'yaml';

import { CUBE_PARSE } from './objects';
import { placeOf, type Problem } from './problems';

/** Each cube's and view's name in a text, by its list, with where its value is; none if it doesn't parse. */
function namesIn(text: string): {
  document: Document;
  names: { list: 'cubes' | 'views'; index: number; name: string; range: [number, number] }[];
} | null {
  let document: Document;
  try {
    document = parseDocument(text, CUBE_PARSE);
  } catch {
    return null;
  }
  if (document.errors.length > 0) return null;
  const names: { list: 'cubes' | 'views'; index: number; name: string; range: [number, number] }[] =
    [];
  for (const list of ['cubes', 'views'] as const) {
    const items = document.get(list, true);
    if (!isSeq(items)) continue;
    items.items.forEach((item, index) => {
      if (!isMap(item)) return;
      const value = item.get('name', true);
      if (!isScalar(value) || typeof value.value !== 'string') return;
      const [from = 0, to = from] = value.range ?? [];
      names.push({ list, index, name: value.value, range: [from, to] });
    });
  }
  return { document, names };
}

/**
 * A landed cube's or view's name changed in the YAML (T737's follow-up,
 * AC-423): held as the form holds it, at the name, in the form's words. The
 * landed names are the saved text's, which the API keeps (T706). Each item
 * is matched by its place in its list. A text that doesn't parse has its own
 * problem, so none is added here.
 */
export function fixedNameProblems(path: string, text: string, landed: string): Problem[] {
  const now = namesIn(text);
  const before = namesIn(landed);
  if (now === null || before === null) return [];
  return now.names.flatMap(({ list, index, name, range: [from, to] }) => {
    const kept = before.names.find((each) => each.list === list && each.index === index);
    if (kept === undefined || kept.name === name) return [];
    return [
      {
        path,
        ...placeOf(text, from),
        message: `“${kept.name}” has landed, so its name is fixed. Its title can still change.`,
        from,
        to,
        severity: 'error' as const,
        holds: true as const,
      },
    ];
  });
}
