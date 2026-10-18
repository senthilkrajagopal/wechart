import { type CallToolResult, fromJsonSchema } from '@modelcontextprotocol/server';

import { dataResult, refusal, USER_DATA, USER_DATA_NOTICE } from './result';
import type { McpTool } from './server';

/**
 * Paging a tool's result (T784, AC-475, `[R78-6]`): one past 1,000 rows or
 * 50,000 characters comes back as its first page, of at most 1,000 rows and
 * fewer than 50,000 characters, saying it was cut and how much is left out,
 * with a cursor `next_page` takes for the next. Claude Code caps a tool's
 * output at 50,000 characters (`mcp-typescript-sdk.md`, Gotcha 13).
 *
 * Every page is built when the call is answered and kept for the token
 * (`repos/mcp-pages.ts`), so following the cursors gives every row once,
 * whatever has changed since. A result's rows are the array its tool names
 * (`McpTool.rows`); what else it holds comes once, on the first page. A row,
 * or a result without rows, too large for a page alone comes as its JSON
 * text in parts, which join to it (decision T784-2).
 */

/** The most rows a page holds (AC-475). */
export const MAX_ROWS = 1_000;
/** A page's text is shorter than this (AC-475). */
export const MAX_CHARS = 50_000;

/** What a page says where more is left out: fixed text. */
export const CUT_NOTICE =
  'This answer is cut: "leftOut" counts what is left out. Call next_page with "cursor" for the next page.';
/** What a cut answer's last page says: fixed text. */
export const LAST_PAGE_NOTICE = 'This is the answer’s last page: nothing more is left out.';

/** How much is left out after a page: whole rows, and parts of the row it gives a part of. */
export interface LeftOut {
  readonly rows: number;
  readonly parts: number;
}

/** One page as kept: what it gives under the marked field, and what follows it. */
export interface Piece {
  readonly userData: Record<string, unknown>;
  readonly leftOut: LeftOut;
}

/** A page's own account, wechart's alone: no user text (AC-443). */
interface PageInfo {
  readonly says: string;
  readonly number: number;
  readonly of: number;
  readonly leftOut: LeftOut;
  readonly cursor: string | null;
}

/** A cursor: the kept result's id and the page's index. */
const CURSOR = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.[0-9]{1,6}$';
const LONGEST_NUMBER = 999_999_999;
/** A page's account at its longest, so a page measured with it fits with its own. */
const LONGEST_PAGE: PageInfo = {
  says: CUT_NOTICE.length >= LAST_PAGE_NOTICE.length ? CUT_NOTICE : LAST_PAGE_NOTICE,
  number: LONGEST_NUMBER,
  of: LONGEST_NUMBER,
  leftOut: { rows: LONGEST_NUMBER, parts: LONGEST_NUMBER },
  cursor: `${'0'.repeat(36)}.${'9'.repeat(6)}`,
};

/** A page's text length, at its longest account, giving `userData`. */
const sizeOf = (userData: unknown): number =>
  JSON.stringify({ notice: USER_DATA_NOTICE, page: LONGEST_PAGE, [USER_DATA]: userData }).length;

/** `text` in parts, each of whose JSON string fits in `room` characters. */
function partsOf(text: string, room: number): string[] {
  const parts: string[] = [];
  let part = '';
  let used = 0;
  for (const char of text) {
    const width = JSON.stringify(char).length - 2;
    if (used + width > room && part !== '') {
      parts.push(part);
      part = '';
      used = 0;
    }
    part += char;
    used += width;
  }
  if (part !== '' || parts.length === 0) parts.push(part);
  return parts;
}

/** The pages of `value` as JSON text in parts, `rowsAfter` whole rows following them. */
function inParts(value: unknown, rowsAfter: number): Piece[] {
  const room = MAX_CHARS - 1 - sizeOf({ part: '' });
  const parts = partsOf(JSON.stringify(value), room);
  return parts.map((part, at) => ({
    userData: { part },
    leftOut: { rows: rowsAfter, parts: parts.length - at - 1 },
  }));
}

/**
 * The pages of a tool's answer `data`, whose rows are under `rowsKey`: as
 * many rows on each as fit both caps, what isn't a row on the first.
 */
export function piecesOf(data: Record<string, unknown>, rowsKey: string | undefined): Piece[] {
  const list = rowsKey === undefined ? undefined : data[rowsKey];
  if (rowsKey === undefined || !Array.isArray(list)) return inParts(data, 0);
  const { [rowsKey]: _rows, ...rest } = data;
  void _rows;
  // What isn't a row too large for a page beside none: the whole in parts.
  if (sizeOf({ ...rest, [rowsKey]: [] }) >= MAX_CHARS) return inParts(data, 0);
  const rows = list as unknown[];
  const pieces: Piece[] = [];
  let at = 0;
  while (at < rows.length || pieces.length === 0) {
    const head = pieces.length === 0 ? rest : {};
    let size = sizeOf({ ...head, [rowsKey]: [] });
    const taken: unknown[] = [];
    while (at < rows.length && taken.length < MAX_ROWS) {
      const width = JSON.stringify(rows[at] ?? null).length + (taken.length === 0 ? 0 : 1);
      if (size + width >= MAX_CHARS) break;
      taken.push(rows[at]);
      size += width;
      at += 1;
    }
    if (taken.length > 0 || at >= rows.length) {
      pieces.push({
        userData: { ...head, [rowsKey]: taken },
        leftOut: { rows: rows.length - at, parts: 0 },
      });
    } else if (pieces.length === 0 && Object.keys(rest).length > 0) {
      // The first row doesn't fit beside what isn't a row: that alone first,
      // and the row tried again on a page of its own.
      pieces.push({
        userData: { ...rest, [rowsKey]: [] },
        leftOut: { rows: rows.length - at, parts: 0 },
      });
    } else {
      // A row too large for a page alone: in parts of its own.
      pieces.push(...inParts(rows[at], rows.length - at - 1));
      at += 1;
    }
  }
  return pieces;
}

/** Page `index` of `count`, kept under `id`, as a result. */
export function pageResult(piece: Piece, index: number, count: number, id: string): CallToolResult {
  const last = index + 1 >= count;
  const page: PageInfo = {
    says: last ? LAST_PAGE_NOTICE : CUT_NOTICE,
    number: index + 1,
    of: count,
    leftOut: piece.leftOut,
    cursor: last ? null : `${id}.${index + 1}`,
  };
  return dataResult(piece.userData, { page });
}

/** Whether a result fits both caps as it is. */
function fits(result: CallToolResult, data: Record<string, unknown>, rowsKey?: string): boolean {
  const text = result.content.map((each) => (each.type === 'text' ? each.text : '')).join('');
  const rows = rowsKey === undefined ? undefined : data[rowsKey];
  return text.length < MAX_CHARS && (!Array.isArray(rows) || rows.length <= MAX_ROWS);
}

const TOO_LARGE =
  'This answer is too large to give whole, and wechart can’t keep its pages here, so none is given.';

/**
 * A tool's result within both caps (AC-475): as it is where it fits,
 * otherwise its first page, its pages kept by `save` for the cursors.
 */
export async function paged(
  result: CallToolResult,
  rowsKey: string | undefined,
  save: ((pages: readonly Piece[]) => Promise<string>) | undefined,
): Promise<CallToolResult> {
  if (result.isError === true) return result;
  const data = (result.structuredContent as Record<string, unknown> | undefined)?.[USER_DATA];
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return result;
  const answer = data as Record<string, unknown>;
  if (fits(result, answer, rowsKey)) return result;
  if (save === undefined) return refusal(TOO_LARGE);
  const pieces = piecesOf(answer, rowsKey);
  const id = await save(pieces);
  return pageResult(pieces[0]!, 0, pieces.length, id);
}

const NO_PAGE =
  'There’s no such page: its cursor is unknown, past its hour, or another token’s, or the answer has no more pages.';

/** Following a cursor (AC-475): the next page of a cut answer, for the token whose answer it is. */
export const NEXT_PAGE: McpTool = {
  name: 'next_page',
  description:
    'Gives the next page of an answer that was cut, by the cursor its last page gave. A cursor works for an hour, for this token alone.',
  scope: 'read',
  inputSchema: fromJsonSchema<{ cursor: string }>({
    type: 'object',
    properties: {
      cursor: { type: 'string', pattern: CURSOR, description: 'The cursor a page gave.' },
    },
    required: ['cursor'],
    additionalProperties: false,
  }),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async run(args, call) {
    const [id, at] = (args as { cursor: string }).cursor.split('.') as [string, string];
    const index = Number(at);
    const kept = await call.page(id, index);
    if (kept === null) return refusal(NO_PAGE);
    return pageResult(kept.page as Piece, index, kept.count, id);
  },
};
