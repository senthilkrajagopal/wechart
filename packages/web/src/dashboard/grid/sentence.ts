/**
 * A tile's name spoken inside a sentence (AC-209): a name may already end one
 * — a Markdown tile's text often does — so a full stop is added only where it
 * has none, and dropped before a clause follows (T247, recheck-dashboard N9).
 */

/** A name as a sentence: its own closing mark kept, a full stop added only where it has none. */
export const sentenceOf = (name: string): string => (/[.!?…]$/.test(name) ? name : `${name}.`);

/** A name as the start of a clause, "…: position 2 of 3": its own full stop dropped. */
export const clauseOf = (name: string): string => name.replace(/\.$/, '');
