import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer, request as forward } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import { crc32 } from 'node:zlib';

import { type ApiProcess, startApi, stopApi } from '../api-process';

/**
 * An API serving MCP for Claude Code to reach (T790, AC-444): sign-in on,
 * the MCP host named, on a database of its own, with a forward proxy that
 * brings the MCP host's requests to it, as an ingress would.
 */

/** The MCP host this API names (`WECHART_MCP_HOST`): a name with a dot, as a certificate's. */
export const MCP_HOST = 'mcp.wechart.test';

/** SQL in the metadata Postgres, as its admin, on stdin; `-v` variables keep text out of it. */
export const psql = (database: string, sql: string, variables: Record<string, string> = {}) =>
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      'wechart-meta',
      'psql',
      '-U',
      'wechart',
      '-d',
      database,
      '-v',
      'ON_ERROR_STOP=1',
      ...Object.entries(variables).flatMap(([name, value]) => ['-v', `${name}=${value}`]),
      '-At',
      '-f',
      '-',
    ],
    { encoding: 'utf8', input: sql, stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim();

export interface McpStack {
  readonly api: ApiProcess;
  readonly database: string;
  readonly port: number;
}

/**
 * A new database, and an API on `port` serving MCP from it with sign-in on,
 * its xcube model the project's own. None may hold the port already: a
 * process left there would answer the start's health check in its stead.
 */
export async function startMcpStack(port: number, project: string, run: string): Promise<McpStack> {
  const busy = await fetch(`http://localhost:${String(port)}/api/health`).catch(() => undefined);
  if (busy !== undefined) throw new Error(`Port ${String(port)} is in use: stop what holds it.`);
  const database = `wechart_mcp_${project}_${run}`;
  psql('wechart_meta', `DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
  psql('wechart_meta', `CREATE DATABASE ${database}`);
  const api = await startApi(port, {
    database,
    model: `e2e-mcp-${project}`,
    settings: {
      WECHART_SECURITY: 'oidc',
      WECHART_PUBLIC_URL: `http://localhost:${String(port)}`,
      WECHART_SESSION_SECRET: 'the-mcp-suite-session-secret-0123456789abcdef',
      WECHART_OIDC_ISSUER: 'http://localhost:5556/dex',
      WECHART_OIDC_CLIENT_ID: 'wechart',
      WECHART_OIDC_CLIENT_SECRET: 'dev-oidc-secret',
      WECHART_OIDC_SCOPES: 'openid profile email groups',
      WECHART_OIDC_ALLOW_HTTP: 'true',
      WECHART_SUPER_ADMIN_GROUP: 'wechart-super-admins',
      WECHART_MCP_HOST: MCP_HOST,
    },
  });
  return { api, database, port };
}

export async function stopMcpStack(stack: McpStack | undefined): Promise<void> {
  if (stack === undefined) return;
  await stopApi(stack.api.process);
  psql('wechart_meta', `DROP DATABASE IF EXISTS ${stack.database} WITH (FORCE)`);
}

/**
 * A personal access token's text and SHA-256, in the shape the API mints
 * (`packages/api/src/mcp/tokenText.ts`, T767): `wct_`, 64 hex digits, `_`,
 * and the CRC32 of what comes before.
 */
function mintToken(): { text: string; digest: string } {
  const body = `wct_${randomBytes(32).toString('hex')}`;
  const text = `${body}_${crc32(body).toString(16).padStart(8, '0')}`;
  return { text, digest: createHash('sha256').update(text).digest('hex') };
}

export interface Seeded {
  /** The read token of `owner`, and its id. */
  readonly token: string;
  readonly tokenId: string;
  /** A folder `owner`'s group writes, and one only another user's group may see. */
  readonly theirs: string;
  readonly another: string;
}

/**
 * A user with a web sign-in on record, in `sales-rw`; a folder that group
 * writes and one only `g01` sees; and a read token of that user's, as the
 * token page would make it.
 */
export function seed(database: string, run: string): Seeded {
  const theirs = `Sales MCP ${run}`;
  const another = `Ops MCP ${run}`;
  const owner = `mcp-owner-${run}`;
  const { text, digest } = mintToken();
  const tokenId = randomUUID();
  psql(
    database,
    `
    INSERT INTO latest_sign_ins (user_key, groups, signed_in_at)
      VALUES (:'owner', ARRAY['sales-rw'], now());
    INSERT INTO documents (kind, id, body) VALUES
      ('folder', :'theirsId', jsonb_build_object('owner', 'admin', 'title', :'theirs', 'folderId', 'root',
        'access', jsonb_build_object('readOnly', '[]'::jsonb, 'readWrite', '["sales-rw"]'::jsonb))),
      ('folder', :'anotherId', jsonb_build_object('owner', 'admin', 'title', :'another', 'folderId', 'root',
        'access', jsonb_build_object('readOnly', '[]'::jsonb, 'readWrite', '["g01"]'::jsonb)));
    INSERT INTO personal_access_tokens (id, owner_key, owner_name, name, scopes, digest, expires_at)
      VALUES (:'tokenId', :'owner', 'Wren Writer', :'tokenName', ARRAY['read'],
        decode(:'digest', 'hex'), now() + interval '30 days');
    `,
    {
      owner,
      theirsId: randomUUID(),
      theirs,
      anotherId: randomUUID(),
      another,
      tokenId,
      tokenName: `Claude Code ${run}`,
      digest,
    },
  );
  return { token: text, tokenId, theirs, another };
}

/**
 * A forward proxy, as Claude Code is told by `HTTP_PROXY`: requests for the
 * MCP host go to the API on `apiPort`, their `Host` kept, as an ingress for
 * that host would send them; CONNECT tunnels (Claude Code's own traffic to
 * Anthropic) pass through. The MCP host needs no DNS name this way.
 */
export async function mcpHostProxy(
  apiPort: number,
): Promise<{ readonly url: string; close(): Promise<void> }> {
  const server = createServer((incoming, answer) => {
    const target = new URL(incoming.url ?? '/', `http://${incoming.headers.host ?? ''}`);
    if (target.hostname !== MCP_HOST) {
      answer.writeHead(502).end();
      return;
    }
    const out = forward(
      {
        host: '127.0.0.1',
        port: apiPort,
        method: incoming.method,
        path: `${target.pathname}${target.search}`,
        headers: incoming.headers,
      },
      (reply) => {
        answer.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(answer);
      },
    );
    out.on('error', () => answer.writeHead(502).end());
    incoming.pipe(out);
  });
  // Every tunnel, so closing the proxy ends them too.
  const tunnels = new Set<{ destroy(): void }>();
  server.on('close', () => {
    for (const each of tunnels) each.destroy();
  });
  server.on('connect', (incoming, socket, head) => {
    const [host, port] = (incoming.url ?? '').split(':');
    const upstream = connect(Number(port ?? 443), host ?? '', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    tunnels.add(socket).add(upstream);
    upstream.on('error', () => socket.destroy());
    socket.on('error', () => upstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
        for (const each of tunnels) each.destroy();
      }),
  };
}

/** What a run of Claude Code's CLI gave: its exit code and its output, stdin closed. */
export function claude(
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv; readonly timeoutMs: number },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    const timer = setTimeout(() => child.kill(), options.timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}
