import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * T773 (AC-474, AC-479): the chart sets `WECHART_TRUST_PROXY` on the API
 * container from `api.trustProxy`, and none where it is unset
 * (`mcp-deployment-and-tokens.md`, Finding 4; `gateway-api.md`, "At Fastify").
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

/** The chart rendered with docker-desktop's values and `set`. */
function render(set: readonly string[] = []): string {
  const rendered = spawnSync(
    'helm',
    [
      'template',
      'wechart',
      'deploy/helm/wechart',
      '-f',
      'deploy/helm/values/docker-desktop.yaml',
      ...set.flatMap((each) => ['--set', each]),
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );
  expect(rendered.status, rendered.stderr).toBe(0);
  return rendered.stdout;
}

/** The API Deployment's container env, as name → value. */
function apiEnv(manifests: string): Map<string, string | undefined> {
  const api = manifests
    .split(/^---$/m)
    .find((doc) => /^kind: Deployment$/m.test(doc) && /^ {2}name: wechart-api$/m.test(doc));
  expect(api, 'the API Deployment').toBeDefined();
  const container = api!.slice(api!.indexOf('\n        - name: api\n'));
  const env = new Map<string, string | undefined>();
  for (const match of container.matchAll(/^ {12}- name: (\S+)\n(?: {14}value: (.*)\n)?/gm))
    env.set(match[1]!, match[2]?.replace(/^"(.*)"$/, '$1'));
  return env;
}

// Each `helm template` takes a second or two, and past 5 s under a full run's load.
describe('the chart’s WECHART_TRUST_PROXY (T773, AC-474, AC-479)', { timeout: 60_000 }, () => {
  it('renders api.trustProxy as WECHART_TRUST_PROXY on the API container', () => {
    const env = apiEnv(render(['api.trustProxy=10.1.0.0/16']));
    expect(env.get('WECHART_TRUST_PROXY')).toBe('10.1.0.0/16');
  });

  it('takes a list too, joined with commas', () => {
    const env = apiEnv(render(['api.trustProxy={10.1.0.0/16,10.2.0.5}']));
    expect(env.get('WECHART_TRUST_PROXY')).toBe('10.1.0.0/16,10.2.0.5');
  });

  it('renders none when api.trustProxy is unset', () => {
    const env = apiEnv(render());
    expect(env.has('WECHART_PORT') || env.has('PORT')).toBe(true);
    expect(env.has('WECHART_TRUST_PROXY')).toBe(false);
  });
});
