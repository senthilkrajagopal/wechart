import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEXT_DOCUMENT_VERSION } from '@wechart/core';

import type { Config } from '../config';
import { closeDb, getDb } from '../db/client';
import { catalog } from '../repos/catalog';
import { documents, TextTileRefused } from '../repos/documents';
import { buildServer } from '../server';

/**
 * T871 / AC-513: IF a Text tile's document … holds HTML, a script, an
 * event-handler attribute, a node, mark or attribute outside the Text tile's
 * schema, or a link whose address is neither an http(s) URL nor a wechart
 * dashboard, THEN THE SYSTEM SHALL … refuse with 400, naming the tile, a
 * save whose document fails the schema.
 *
 * T871 / AC-518: … the API SHALL refuse with 400 a save holding a Text tile
 * of more than 10 elements.
 * `Fails when: … such a save is stored …`
 *
 * Against the suite's database, with sign-in off: the single user's
 * dashboard in My workspace. The check is the documents repo's, so every
 * writer of a dashboard — this route, imports, MCP — meets it.
 */
const config: Config = {
  port: 0,
  cubeApiUrl: 'http://cube.invalid/cubejs-api',
  cubeApiSecret: 'secret',
  securityContext: {},
  modelDir: '',
};
const MARK = `tt${randomUUID().replaceAll('-', '').slice(0, 8)}`;
const docs = () => documents(getDb());
const made: string[] = [];
let app: FastifyInstance;

const textDoc = (...content: unknown[]) => ({
  version: TEXT_DOCUMENT_VERSION,
  doc: { type: 'doc', content },
});
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });
const value = { type: 'value', attrs: { measure: 'orders.revenue' } };
const markdownTile = { id: 't1', kind: 'markdown', text: '## Notes\n{{measure:orders.count}}' };

const board = (title: string, ...items: unknown[]) => ({
  title,
  folderId: 'mine',
  pages: [{ id: 'p1', title: 'Page 1', items }],
});

async function newBoard(): Promise<string> {
  const id = randomUUID();
  await docs().create({
    kind: 'dashboard',
    id,
    body: board(`Board ${MARK} ${String(made.length)}`, markdownTile),
  });
  made.push(id);
  return id;
}

const put = (id: string, body: unknown, version = 1) =>
  app.inject({
    method: 'PUT',
    url: `/api/documents/dashboard/${id}`,
    payload: { body, version },
  });

beforeAll(() => {
  app = buildServer({ config, documents: docs(), catalog: catalog(getDb()) });
});

afterAll(async () => {
  if (app !== undefined) await app.close();
  for (const id of made) await docs().remove('dashboard', id);
  await closeDb();
});

describe('saving a dashboard’s Text tile (T871, AC-513, AC-518)', () => {
  const refusals: [string, unknown, string][] = [
    [
      'an image with an event handler',
      textDoc(paragraph({ type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } })),
      'Unknown node "image".',
    ],
    [
      'a javascript: link',
      textDoc(
        paragraph({
          type: 'text',
          text: 'go',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
        }),
      ),
      'The link "javascript:alert(1)" isn’t an http(s) address or a wechart dashboard.',
    ],
    [
      '11 elements',
      textDoc(paragraph(...Array.from({ length: 11 }, () => value))),
      'The text holds 11 elements; a Text tile holds at most 10.',
    ],
    [
      'no document at all',
      undefined,
      'A Text document must be an object with its version and doc.',
    ],
  ];

  it.each(refusals)(
    'refuses %s with 400, naming the tile, and stores nothing',
    async (_, document, problem) => {
      const id = await newBoard();
      const tile = { id: 'summary', kind: 'text', ...(document === undefined ? {} : { document }) };
      const title = `Refused ${MARK} ${id}`;
      const answer = await put(id, board(title, markdownTile, tile));
      expect(answer.statusCode, answer.body).toBe(400);
      expect(answer.json<{ error: string }>().error).toBe(
        `The Text tile "summary" can’t be saved: ${problem}`,
      );
      const stored = await docs().get('dashboard', id);
      expect(stored?.version).toBe(1);
      expect(stored?.body['title']).not.toBe(title);
    },
  );

  it('refuses a Text tile however deep it sits, in a section or a tab', async () => {
    const id = await newBoard();
    const bad = { id: 'deep', kind: 'text', document: textDoc(paragraph({ type: 'script' })) };
    const answer = await put(
      id,
      board(`Deep ${MARK}`, {
        id: 's1',
        kind: 'section',
        items: [{ id: 'g1', kind: 'tabs', tabs: [{ id: 'tab1', title: 'A', items: [bad] }] }],
      }),
    );
    expect(answer.statusCode, answer.body).toBe(400);
    expect(answer.json<{ error: string }>().error).toBe(
      'The Text tile "deep" can’t be saved: Unknown node "script".',
    );
  });

  it('saves a valid document, and reads it back as saved', async () => {
    const id = await newBoard();
    const tile = {
      id: 'summary',
      kind: 'text',
      document: textDoc(
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'EMEA' }] },
        paragraph({ type: 'text', text: 'Revenue is ' }, value),
      ),
    };
    const answer = await put(id, board(`Valid ${MARK}`, tile));
    expect(answer.statusCode, answer.body).toBe(200);
    const stored = await docs().get('dashboard', id);
    expect((stored?.body['pages'] as { items: unknown[] }[])[0]?.items).toEqual([tile]);
  });

  it('saves a tile still in markdown, and reads it back unchanged', async () => {
    const id = await newBoard();
    const answer = await put(id, board(`Markdown ${MARK}`, markdownTile));
    expect(answer.statusCode, answer.body).toBe(200);
    const stored = await docs().get('dashboard', id);
    expect((stored?.body['pages'] as { items: unknown[] }[])[0]?.items).toEqual([markdownTile]);
  });

  // Every writer goes through the repo: an import or an MCP write creates a
  // dashboard whole, with no route of this file in between.
  it('refuses to create a dashboard holding a bad Text tile, and creates nothing', async () => {
    const id = randomUUID();
    const refused = await docs()
      .create({
        kind: 'dashboard',
        id,
        body: board(`New ${MARK}`, {
          id: 'n1',
          kind: 'text',
          document: textDoc(paragraph({ type: 'paragraph', attrs: { onclick: 'x()' } })),
        }),
      })
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );
    expect(refused).toBeInstanceOf(TextTileRefused);
    expect((refused as Error).message).toBe(
      'The Text tile "n1" can’t be saved: A paragraph can’t hold a paragraph.',
    );
    expect(await docs().get('dashboard', id)).toBeNull();
  });
});
