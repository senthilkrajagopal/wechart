import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';

/**
 * The chart's MCP host through the Gateway API (AC-476; research
 * `gateway-api.md`, "Init / auth pattern"), rendered by `helm template` with
 * docker-desktop's values.
 *
 * T792: with `mcp.host` set, an HTTPRoute of its own routes only `Exact`
 * `/mcp` on that host to the API Service. In mode A (`mcp.gateway.create`)
 * the chart's own Gateway carries one HTTPS listener for the host,
 * terminating TLS with the named Secret, and the route attaches to it; in
 * mode B the route attaches to exactly the `parentRefs` given, and the chart
 * makes no Gateway.
 */
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const HOST = 'mcp.wechart.example.com';
const SECRET = 'mcp-tls';

type Manifest = {
  kind: string;
  apiVersion: string;
  metadata: { name: string };
  spec: Record<string, unknown>;
};

/** The chart rendered with docker-desktop's values and `set`, or helm's refusal. */
function helm(set: readonly string[]) {
  return spawnSync(
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
}

/** Each rendered manifest, parsed. */
function render(set: readonly string[] = []): Manifest[] {
  const rendered = helm(set);
  expect(rendered.status, rendered.stderr).toBe(0);
  return parseAllDocuments(rendered.stdout)
    .map((doc) => doc.toJS() as Manifest | null)
    .filter((each): each is Manifest => each !== null);
}

const ofKind = (manifests: Manifest[], kind: string) =>
  manifests.filter((manifest) => manifest.kind === kind);

const MODE_A = [
  `mcp.host=${HOST}`,
  `mcp.tlsSecretName=${SECRET}`,
  'mcp.gateway.create=true',
  'mcp.gateway.className=eg',
];
const MODE_B = [
  `mcp.host=${HOST}`,
  'mcp.gateway.create=false',
  'mcp.gateway.parentRefs[0].name=shared',
  'mcp.gateway.parentRefs[0].namespace=infra',
  'mcp.gateway.parentRefs[0].sectionName=https-mcp',
];

/** The one rule's match and backend: `/mcp` alone, to the API Service. */
function expectOnlyMcp(route: Manifest) {
  expect(route.apiVersion).toBe('gateway.networking.k8s.io/v1');
  expect(route.spec['hostnames']).toEqual([HOST]);
  const rules = route.spec['rules'] as {
    matches: unknown[];
    backendRefs: unknown[];
  }[];
  expect(rules).toHaveLength(1);
  expect(rules[0]!.matches).toEqual([{ path: { type: 'Exact', value: '/mcp' } }]);
  expect(rules[0]!.backendRefs).toEqual([{ name: 'wechart-api', port: 4100 }]);
}

describe('the MCP host’s HTTPRoute (T792, AC-476)', () => {
  it('mode A: the chart’s own Gateway, one HTTPS listener for the host with the named Secret, and the route on it', () => {
    const manifests = render(MODE_A);
    const gateways = ofKind(manifests, 'Gateway');
    expect(gateways).toHaveLength(1);
    const gateway = gateways[0]!;
    expect(gateway.apiVersion).toBe('gateway.networking.k8s.io/v1');
    expect(gateway.spec['gatewayClassName']).toBe('eg');
    expect(gateway.spec['listeners']).toEqual([
      {
        name: 'mcp-https',
        hostname: HOST,
        protocol: 'HTTPS',
        port: 443,
        tls: {
          mode: 'Terminate',
          certificateRefs: [{ group: '', kind: 'Secret', name: SECRET }],
        },
      },
    ]);

    const routes = ofKind(manifests, 'HTTPRoute');
    expect(routes).toHaveLength(1);
    expect(routes[0]!.spec['parentRefs']).toEqual([
      { name: gateway.metadata.name, sectionName: 'mcp-https' },
    ]);
    expectOnlyMcp(routes[0]!);
  });

  it('mode B: no Gateway, and the route attached to exactly the parentRefs given', () => {
    const manifests = render(MODE_B);
    expect(ofKind(manifests, 'Gateway')).toHaveLength(0);
    const routes = ofKind(manifests, 'HTTPRoute');
    expect(routes).toHaveLength(1);
    expect(routes[0]!.spec['parentRefs']).toEqual([
      { name: 'shared', namespace: 'infra', sectionName: 'https-mcp' },
    ]);
    expectOnlyMcp(routes[0]!);
  });

  it('refuses mode A without a TLS Secret or a class, and mode B without a parent', () => {
    const without = (values: string[], name: string) =>
      values.filter((each) => !each.startsWith(name));
    for (const [values, says] of [
      [without(MODE_A, 'mcp.tlsSecretName'), /mcp\.tlsSecretName is required/],
      [without(MODE_A, 'mcp.gateway.className'), /mcp\.gateway\.className is required/],
      [without(MODE_B, 'mcp.gateway.parentRefs'), /mcp\.gateway\.parentRefs is required/],
    ] as const) {
      const refused = helm(values);
      expect(refused.status, values.join(' ')).not.toBe(0);
      expect(refused.stderr).toMatch(says);
    }
  });
});
