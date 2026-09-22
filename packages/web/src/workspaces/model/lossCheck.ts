import { isAlias, isNode, parseDocument, visit, type Document } from 'yaml';

import { CUBE_PARSE } from './objects';

/**
 * What a change to a model file would lose (T140, AC-134): the comments,
 * anchors and aliases the file has before it and not after — each named, so
 * the form can say so before the change is applied.
 */
export interface Loss {
  readonly kind: 'comment' | 'anchor' | 'alias';
  /** The comment's text; the anchor's or the alias's name. */
  readonly text: string;
}

/**
 * Every comment, anchor and alias in the file, in its order
 * (research/yaml.md, "Comments and anchors": each node's `commentBefore`
 * and `comment`, its `anchor`, and each `Alias`'s `source`).
 */
function constructsOf(document: Document): Loss[] {
  const found: Loss[] = [];
  const comments = (comment: string | null | undefined) => {
    if (typeof comment !== 'string') return;
    const text = comment.trim();
    if (text !== '') found.push({ kind: 'comment', text });
  };
  comments(document.commentBefore);
  visit(document, (_key, node) => {
    if (!isNode(node)) return;
    comments(node.commentBefore);
    if (isAlias(node)) found.push({ kind: 'alias', text: node.source });
    else if (typeof node.anchor === 'string') found.push({ kind: 'anchor', text: node.anchor });
    // An alias has a comment too: `yaml` puts one written after it on it.
    comments(node.comment);
  });
  comments(document.comment);
  return found;
}

/**
 * What is counted: an anchor or alias whole, and a comment line by line —
 * `yaml` may write a block back split or merged with another (research/
 * yaml.md, "Comment attachment is not perfectly stable"), which loses no line.
 */
const partsOf = (loss: Loss): string[] =>
  loss.kind === 'comment'
    ? loss.text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .map((line) => `comment ${line}`)
    : [`${loss.kind} ${loss.text}`];

/**
 * Those of `before`'s constructs that `after` does not have, counted: a
 * comment the file has twice and keeps once is lost once. A comment is named
 * whole where any of its lines goes.
 */
export function lossOf(before: string, after: string): Loss[] {
  if (before === after) return [];
  const kept = new Map<string, number>();
  for (const part of constructsOf(parseDocument(after, CUBE_PARSE)).flatMap(partsOf))
    kept.set(part, (kept.get(part) ?? 0) + 1);
  return constructsOf(parseDocument(before, CUBE_PARSE)).filter((each) => {
    let lost = false;
    for (const part of partsOf(each)) {
      const left = kept.get(part) ?? 0;
      if (left === 0) lost = true;
      else kept.set(part, left - 1);
    }
    return lost;
  });
}
