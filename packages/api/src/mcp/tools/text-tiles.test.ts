import {
  textDocumentFromMarkdown,
  textDocumentToMarkdown,
  type TextDocument,
  type TextNode,
} from '@wechart/core';
import { describe, expect, it } from 'vitest';

import { USER_DATA } from '../result';
import type { McpCall, WebAnswer } from '../server';
import { mcpTools } from '.';

/**
 * T891 / AC-527: WHEN an MCP client reads a dashboard (AC-437), THE SYSTEM
 * SHALL return each Text tile's content as markdown, each element as a
 * `{{…}}` token naming its kind and source, inside the data fields AC-443
 * describes; and WHEN an MCP client writes a dashboard (AC-438) with a Text
 * tile given as markdown, THE SYSTEM SHALL store it converted as AC-512
 * converts and checked as AC-513 and AC-518, every element kind's token
 * becoming its element; and, written over an existing Text tile, each
 * element SHALL keep the stored settings of the stored element of the same
 * kind and source, matched in order of appearance, a token with no match
 * taking the defaults AC-512's conversion gives (decision T891-1).
 * `Fails when: an MCP read returns a Text tile's stored document or HTML, or
 * an element without its token, kind or source; or a Text tile written in
 * markdown through MCP is stored as markdown, with HTML, or with more than
 * 10 elements; or a re-written tile whose tokens are unchanged loses a
 * stored element's settings.`
 *
 * The tools as they run, against a stand-in for the web app's routes: what
 * they ask, and what they send.
 */
const ID = 'd-1';
const p = (...content: TextNode[]): TextNode => ({ type: 'paragraph', content });
const doc = (...content: TextNode[]): TextDocument => ({
  version: 1,
  doc: { type: 'doc', content },
});

const STORED = doc(
  p(
    { type: 'text', text: 'Revenue ' },
    {
      type: 'value',
      attrs: {
        measure: 'orders.revenue',
        filters: [{ member: 'orders.country', operator: 'equals', values: ['DE'] }],
      },
    },
    { type: 'text', text: ', change ' },
    { type: 'change', attrs: { measure: 'orders.revenue', direction: 'lower', show: 'amount' } },
    { type: 'text', text: ' ' },
    {
      type: 'actionButton',
      attrs: {
        label: 'Go to Detail',
        actions: [{ kind: 'resetFilters' }, { kind: 'page', page: 'detail' }],
      },
    },
  ),
);

const dashboard = (tiles: unknown[]) => ({
  schemaVersion: 1,
  title: 'Sales',
  folderId: 'mine',
  settings: { width: 'fixed' },
  pages: [
    {
      id: 'p1',
      title: 'Overview',
      items: [
        { id: 'chart', kind: 'chart', w: 6, h: 40, chartId: 'c1' },
        { id: 's1', kind: 'section', title: 'More', items: tiles },
      ],
    },
  ],
});

/** The web app's routes, as the tools ask them, and what each change sent. */
function webApp(stored: unknown[]) {
  const sent: { url: string; body: unknown }[] = [];
  const call = {
    caller: { key: 'writer', name: 'Wren', groups: [], superAdmin: false },
    token: { id: 't', name: 'token', scopes: ['read', 'workspace-edit'] },
    ask(url: string, init?: { method?: string; body?: unknown }): Promise<WebAnswer> {
      if (init?.method === 'PUT') {
        sent.push({ url, body: init.body });
        return Promise.resolve({ status: 200, body: { id: ID, version: 2 } });
      }
      if (url === `/api/documents/dashboard/${ID}`)
        return Promise.resolve({
          status: 200,
          body: { id: ID, kind: 'dashboard', version: 1, body: dashboard(stored) },
        });
      return Promise.resolve({ status: 404, body: { error: 'Not found' } });
    },
    page: () => undefined,
  } as unknown as McpCall;
  return { call, sent };
}

const tool = (name: string) => {
  const found = mcpTools('UTC').find((each) => each.name === name);
  if (found === undefined) throw new Error(`No tool ${name}`);
  return found;
};

const dataOf = (result: unknown) =>
  (result as { structuredContent: Record<string, unknown> }).structuredContent[USER_DATA] as {
    dashboard: { body: { pages: { items: { items?: Record<string, unknown>[] }[] }[] } };
  };

const textTile = (extra: Record<string, unknown>) => ({
  id: 'note',
  kind: 'text',
  w: 6,
  h: 6,
  ...extra,
});

describe('a Text tile through MCP (T891, AC-527)', () => {
  it('reads as markdown with a token per element, inside the marked data field', async () => {
    const { call } = webApp([textTile({ document: STORED })]);
    const read = dataOf(await tool('read_dashboard').run({ id: ID }, call));
    const tile = read.dashboard.body.pages[0]?.items[1]?.items?.[0];
    expect(tile).toEqual({
      id: 'note',
      kind: 'text',
      w: 6,
      h: 6,
      markdown: textDocumentToMarkdown(STORED),
    });
    expect(tile?.['markdown']).toBe(
      'Revenue {{measure:orders.revenue}}, change {{change:orders.revenue | vs:previous_period}} {{button:Go to Detail}}',
    );
    expect(JSON.stringify(read)).not.toContain('"document"');
  });

  it('stores a tile written in markdown as the document its conversion gives', async () => {
    const markdown = '## Sales\n\n**{{icon:orders.count}}** for {{filter-value:f-country}}';
    const { call, sent } = webApp([]);
    await tool('change_item').run(
      { kind: 'dashboard', id: ID, version: 1, body: dashboard([textTile({ markdown })]) },
      call,
    );
    const saved = (sent[0]?.body as { body: ReturnType<typeof dashboard> }).body;
    const tile = saved.pages[0]?.items[1] as { items: Record<string, unknown>[] };
    expect(tile.items[0]).toEqual(
      textTile({ document: textDocumentFromMarkdown(markdown, { exported: true }) }),
    );
  });

  it('stores HTML written in markdown as its literal text', async () => {
    const markdown = 'Hi <script>alert(1)</script>';
    const { call, sent } = webApp([]);
    await tool('change_item').run(
      { kind: 'dashboard', id: ID, version: 1, body: dashboard([textTile({ markdown })]) },
      call,
    );
    const saved = JSON.stringify(sent[0]?.body);
    expect(saved).toContain('"text":"Hi <script>alert(1)</script>"');
    expect(saved).not.toContain('"markdown"');
  });

  it('refuses a tile of 11 tokens, naming it, and sends nothing', async () => {
    const markdown = Array.from({ length: 11 }, () => '{{measure:orders.count}}').join(' ');
    const { call, sent } = webApp([]);
    const result = (await tool('change_item').run(
      { kind: 'dashboard', id: ID, version: 1, body: dashboard([textTile({ markdown })]) },
      call,
    )) as { isError?: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    // The reason, under the marked field (AC-443).
    const said = JSON.parse(result.content[0]?.text ?? '{}') as {
      [USER_DATA]?: { reason?: string };
    };
    expect(said[USER_DATA]?.reason).toBe(
      'The Text tile "note" can\'t be saved: The text holds 11 elements; a Text tile holds at most 10.',
    );
    expect(sent).toEqual([]);
  });

  it('keeps every stored setting when its tokens come back unchanged, and a new token takes the defaults', async () => {
    const { call, sent } = webApp([textTile({ document: STORED })]);
    const read = dataOf(await tool('read_dashboard').run({ id: ID }, call));
    const body = structuredClone(read.dashboard.body) as ReturnType<typeof dashboard>;
    const section = body.pages[0]?.items[1] as { items: Record<string, unknown>[] };
    const tile = section.items[0] as { markdown: string };
    // A paragraph put in before, and a new token after: matched by kind and
    // source in order, not by place.
    tile.markdown = `Intro\n\n${tile.markdown} {{icon:orders.count}}`;
    const result = await tool('change_item').run(
      { kind: 'dashboard', id: ID, version: 1, body },
      call,
    );
    expect(JSON.stringify(result)).not.toContain('refused');

    const saved = (sent[0]?.body as { body: ReturnType<typeof dashboard> }).body;
    const stored = (saved.pages[0]?.items[1] as { items: { document: TextDocument }[] }).items[0];
    const elements = stored?.document.doc.content?.[1]?.content?.filter(
      (node) => node.type !== 'text',
    );
    expect(elements).toEqual([
      {
        type: 'value',
        attrs: {
          measure: 'orders.revenue',
          filters: [{ member: 'orders.country', operator: 'equals', values: ['DE'] }],
        },
      },
      {
        type: 'change',
        attrs: { measure: 'orders.revenue', direction: 'lower', show: 'amount' },
      },
      {
        type: 'actionButton',
        attrs: {
          label: 'Go to Detail',
          actions: [{ kind: 'resetFilters' }, { kind: 'page', page: 'detail' }],
        },
      },
      { type: 'icon', attrs: { measure: 'orders.count' } },
    ]);
  });

  // Checkpoint 3 (AC-527, AC-512): a Large value came back a paragraph from
  // every change_item, on tiles the client never touched.
  it('keeps a Large value through a full read and write, on a tile changed and one untouched', async () => {
    const large = doc(
      { type: 'largeValue', content: [{ type: 'value', attrs: { measure: 'orders.revenue' } }] },
      p({ type: 'text', text: 'Revenue this quarter' }),
    );
    const { call, sent } = webApp([
      textTile({ id: 'kept', document: large }),
      textTile({ id: 'changed', document: large }),
    ]);
    const read = dataOf(await tool('read_dashboard').run({ id: ID }, call));
    const body = structuredClone(read.dashboard.body) as ReturnType<typeof dashboard>;
    const section = body.pages[0]?.items[1] as { items: { markdown: string }[] };
    const changed = section.items[1] as { markdown: string };
    changed.markdown = changed.markdown.replace('this quarter', 'this year');
    await tool('change_item').run({ kind: 'dashboard', id: ID, version: 1, body }, call);
    const saved = (sent[0]?.body as { body: ReturnType<typeof dashboard> }).body;
    const tiles = (saved.pages[0]?.items[1] as { items: { document: TextDocument }[] }).items;
    expect(tiles[0]?.document).toEqual(large);
    expect(tiles[1]?.document).toEqual(
      doc(
        { type: 'largeValue', content: [{ type: 'value', attrs: { measure: 'orders.revenue' } }] },
        p({ type: 'text', text: 'Revenue this year' }),
      ),
    );
  });

  it('matches the second token of a kind and source to the second stored one', async () => {
    const twice = doc(
      p(
        { type: 'value', attrs: { measure: 'orders.count', marking: 'Picks' } },
        { type: 'text', text: ' ' },
        {
          type: 'value',
          attrs: { measure: 'orders.count', whenUnmarked: 'none', marking: 'Picks' },
        },
      ),
    );
    const { call, sent } = webApp([textTile({ document: twice })]);
    const read = dataOf(await tool('read_dashboard').run({ id: ID }, call));
    await tool('change_item').run(
      { kind: 'dashboard', id: ID, version: 1, body: read.dashboard.body },
      call,
    );
    const saved = (sent[0]?.body as { body: ReturnType<typeof dashboard> }).body;
    const stored = (saved.pages[0]?.items[1] as { items: { document: TextDocument }[] }).items[0];
    expect(stored?.document).toEqual(twice);
  });
});
