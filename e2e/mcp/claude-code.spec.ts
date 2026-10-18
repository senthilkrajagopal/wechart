import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  claude,
  MCP_HOST,
  mcpHostProxy,
  type McpStack,
  psql,
  seed,
  type Seeded,
  startMcpStack,
  stopMcpStack,
} from './fixtures';

/**
 * T790 (AC-444): Claude Code, set up with wechart's `/mcp` URL over its HTTP
 * transport and a personal access token in its `Authorization` header,
 * connects, lists the token's tools and answers a read as the token's owner.
 *
 * Against an API of its own (sign-in on, `WECHART_MCP_HOST` named, on a
 * database of its own), reached at its MCP host through a forward proxy, as
 * an ingress for that host would bring it (`fixtures.ts`). `claude mcp add`
 * and `claude mcp get` run in a scratch config (`CLAUDE_CONFIG_DIR`), so the
 * user's own is never touched. `claude -p` runs with the user's own sign-in
 * to Claude, the server given by `--mcp-config` alone (`--strict-mcp-config`)
 * and only the folder-listing tool allowed. The owner's folders are read from
 * the tool's own result in Claude Code's event stream, not from the model's
 * words.
 */
const RUN = Math.random().toString(36).slice(2, 8);

let stack: McpStack | undefined;
let proxy: Awaited<ReturnType<typeof mcpHostProxy>> | undefined;
let seeded: Seeded;
let scratch = '';

test.describe.serial('Claude Code on wechart’s MCP (T790, AC-444)', () => {
  test.setTimeout(300_000);

  test.beforeAll(async () => {
    const testInfo = test.info();
    testInfo.setTimeout(300_000);
    stack = await startMcpStack(4580 + testInfo.parallelIndex, testInfo.project.name, RUN);
    seeded = seed(stack.database, RUN);
    proxy = await mcpHostProxy(stack.port);
    scratch = mkdtempSync(join(tmpdir(), 'wechart-claude-code-'));
  });

  test.afterAll(async () => {
    // The API first, so nothing is left on its port whatever the proxy does.
    await stopMcpStack(stack);
    await proxy?.close();
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true });
  });

  /** wechart's `/mcp` at its host, as the token page gives it, on this API's port. */
  const mcpUrl = () => `http://${MCP_HOST}:${String(stack!.port)}/mcp`;
  /** Claude Code's environment: through the proxy, and in the scratch config where asked. */
  const env = (configDir?: string) => ({
    ...process.env,
    HTTP_PROXY: proxy!.url,
    HTTPS_PROXY: proxy!.url,
    NO_PROXY: '',
    ...(configDir === undefined ? {} : { CLAUDE_CONFIG_DIR: configDir }),
  });

  test('claude mcp add, then claude mcp get reports it connected', async () => {
    const config = join(scratch, 'config');
    const added = await claude(
      [
        'mcp',
        'add',
        '--transport',
        'http',
        'wechart',
        mcpUrl(),
        '--header',
        `Authorization: Bearer ${seeded.token}`,
      ],
      { cwd: scratch, env: env(config), timeoutMs: 60_000 },
    );
    expect(added.code, added.stderr).toBe(0);
    const got = await claude(['mcp', 'get', 'wechart'], {
      cwd: scratch,
      env: env(config),
      timeoutMs: 90_000,
    });
    // Its mark is a check, ✔ in Claude Code 2.1.283; a failure reads "✘ Failed to connect".
    expect(got.stdout).toMatch(/Status: \S+ Connected\n/);
    expect(got.stdout).toContain(`URL: ${mcpUrl()}`);
  });

  test('claude -p lists the token’s tools and reads the owner’s folders, and none of another user’s', async () => {
    const mcpConfig = join(scratch, 'mcp.json');
    writeFileSync(
      mcpConfig,
      JSON.stringify({
        mcpServers: {
          wechart: {
            type: 'http',
            url: mcpUrl(),
            headers: { Authorization: `Bearer ${seeded.token}` },
          },
        },
      }),
    );
    const asked = await claude(
      [
        '-p',
        'Call the wechart list_folders tool once, then reply with the titles of the folders it gave, one per line.',
        '--model',
        'haiku',
        '--max-turns',
        '5',
        '--output-format',
        'stream-json',
        '--verbose',
        '--strict-mcp-config',
        '--mcp-config',
        mcpConfig,
        '--allowedTools',
        'mcp__wechart__list_folders',
      ],
      { cwd: scratch, env: env(), timeoutMs: 240_000 },
    );
    const events = asked.stdout
      .split('\n')
      .filter((line) => line.trim().startsWith('{'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const told = `${asked.stderr}\n${asked.stdout.slice(-3000)}`;

    // Connected, with the token's read tools listed.
    const init = events.find((event) => event['type'] === 'system' && event['subtype'] === 'init');
    const servers = (init?.['mcp_servers'] ?? []) as { name: string; status: string }[];
    expect(
      servers.filter((server) => server.name === 'wechart').map((server) => server.status),
      told,
    ).toEqual(['connected']);
    const tools = init?.['tools'] as string[];
    for (const name of [
      'list_folders',
      'list_folder_items',
      'read_dashboard',
      'read_chart',
      'read_cube',
      'read_view',
      'query',
    ])
      expect(tools).toContain(`mcp__wechart__${name}`);

    // The folder-listing tool called, and its result: the owner's folder, not another user's.
    const blocks = events.flatMap((event) => {
      const content = (event['message'] as { content?: unknown } | undefined)?.content;
      return Array.isArray(content) ? (content as Record<string, unknown>[]) : [];
    });
    const call = blocks.find(
      (block) => block['type'] === 'tool_use' && block['name'] === 'mcp__wechart__list_folders',
    );
    expect(call, told).toBeDefined();
    const result = blocks.find(
      (block) => block['type'] === 'tool_result' && block['tool_use_id'] === call!['id'],
    );
    expect(result?.['is_error'] ?? false, told).toBe(false);
    const said = JSON.stringify(result?.['content']);
    expect(said).toContain(seeded.theirs);
    expect(said).not.toContain(seeded.another);

    // As the token's owner, through `/mcp`: the call is in the audit trail under the token.
    const recorded = psql(
      stack!.database,
      `SELECT (details->>'tool') || ' ' || (details->>'outcome') FROM audit_records
         WHERE event = 'mcp-call' AND details->'token'->>'id' = :'tokenId'`,
      { tokenId: seeded.tokenId },
    );
    expect(recorded.split('\n')).toContain('list_folders ok');
  });
});
