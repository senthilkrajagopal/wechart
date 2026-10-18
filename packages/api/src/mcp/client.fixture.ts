import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { FastifyInstance } from 'fastify';

/**
 * The SDK's own client, speaking to a wechart API through `inject` on the
 * MCP host, which `fetch` can't name as `Host` (as `transport.test.ts` does).
 */
export function fetchInto(app: FastifyInstance, host: string) {
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(url, init);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, name) => {
      headers[name] = value;
    });
    const body = request.body === null ? undefined : Buffer.from(await request.arrayBuffer());
    const answer = await app.inject({
      method: request.method as 'POST' | 'GET' | 'DELETE',
      url: new URL(request.url).pathname,
      headers: { ...headers, host },
      ...(body === undefined ? {} : { payload: body }),
    });
    const out = new Headers();
    for (const [name, value] of Object.entries(answer.headers)) {
      if (value === undefined) continue;
      for (const one of [value].flat()) out.append(name, String(one));
    }
    const empty = answer.statusCode === 202 || answer.statusCode === 204;
    return new Response(empty ? null : answer.rawPayload, {
      status: answer.statusCode,
      headers: out,
    });
  };
}

/** A 2026-07-28 client bearing `token`, connected to `app`'s `/mcp`. */
export async function mcpClient(app: FastifyInstance, host: string, token: string) {
  return (await mcpClientSeeing(app, host, token)).client;
}

/**
 * The same client, with every HTTP answer it was given, latest last (T785):
 * to see a refusal the SDK's client throws, such as a 403 scope challenge.
 */
export async function mcpClientSeeing(app: FastifyInstance, host: string, token: string) {
  const answers: Response[] = [];
  const into = fetchInto(app, host);
  const client = new Client(
    { name: 'wechart-tests', version: '1.0.0' },
    { versionNegotiation: { mode: 'auto' } },
  );
  const transport = new StreamableHTTPClientTransport(new URL(`https://${host}/mcp`), {
    fetch: async (url, init) => {
      const answer = await into(url, init);
      answers.push(answer.clone());
      return answer;
    },
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return { client, answers };
}

/** Whether `answer` is a 403 scope challenge for `scope` (T785, AC-433). */
export function challengesFor(answer: Response | undefined, scope: string): boolean {
  const challenge = answer?.headers.get('www-authenticate') ?? '';
  return (
    answer?.status === 403 &&
    challenge.startsWith('Bearer ') &&
    challenge.includes('error="insufficient_scope"') &&
    challenge.includes(`scope="${scope}"`)
  );
}
