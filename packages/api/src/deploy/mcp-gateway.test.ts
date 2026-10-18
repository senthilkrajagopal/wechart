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
/** Each `helm template` takes a second or two, more under a full run's load. */
const SLOW = { timeout: 60_000 };

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

/** The enterprise's ranges, which a host must name from T793 on. */
const RANGES = [
  'mcp.allowedSourceRanges[0]=10.20.0.0/16',
  'mcp.allowedSourceRanges[1]=192.0.2.7/32',
];
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

describe('the MCP host’s HTTPRoute (T792, AC-476)', SLOW, () => {
  it('mode A: the chart’s own Gateway, one HTTPS listener for the host with the named Secret, and the route on it', () => {
    const manifests = render([...MODE_A, ...RANGES]);
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
    const manifests = render([...MODE_B, ...RANGES]);
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
      const refused = helm([...values, ...RANGES]);
      expect(refused.status, values.join(' ')).not.toBe(0);
      expect(refused.stderr).toMatch(says);
    }
  });
});

/**
 * T793 (AC-476, AC-474): only the listed source addresses reach `/mcp`, by
 * an Envoy Gateway SecurityPolicy on the route (`gateway-api.md`, "Envoy
 * Gateway SecurityPolicy"): everything denied but one Allow rule, whose
 * `clientCIDRs` are the enterprise's ranges. Anthropic's outbound range is
 * in it only when asked for. In mode A, the chart's ClientTrafficPolicy on
 * its Gateway says how the client's address is found, so the allow-list and
 * the API's per-address limit see the client, not a proxy in front.
 */
const ANTHROPIC = '160.79.104.0/21';

/** The SecurityPolicy's one rule's source ranges, after checking its shape. */
function allowedSources(manifests: Manifest[]): unknown {
  const policies = ofKind(manifests, 'SecurityPolicy');
  expect(policies).toHaveLength(1);
  const policy = policies[0]!;
  expect(policy.apiVersion).toBe('gateway.envoyproxy.io/v1alpha1');
  const route = ofKind(manifests, 'HTTPRoute')[0]!;
  expect(policy.spec['targetRefs']).toEqual([
    { group: 'gateway.networking.k8s.io', kind: 'HTTPRoute', name: route.metadata.name },
  ]);
  const authorization = policy.spec['authorization'] as {
    defaultAction: string;
    rules: { name: string; action: string; principal: { clientCIDRs: unknown } }[];
  };
  expect(authorization.defaultAction).toBe('Deny');
  expect(authorization.rules).toHaveLength(1);
  expect(authorization.rules[0]!.action).toBe('Allow');
  expect(Object.keys(authorization.rules[0]!.principal)).toEqual(['clientCIDRs']);
  return authorization.rules[0]!.principal.clientCIDRs;
}

describe('the MCP allow-list and client IP (T793, AC-476, AC-474)', SLOW, () => {
  it('lets in exactly the listed ranges, denying the rest, in both modes', () => {
    for (const mode of [MODE_A, MODE_B])
      expect(allowedSources(render([...mode, ...RANGES]))).toEqual([
        '10.20.0.0/16',
        '192.0.2.7/32',
      ]);
  });

  it('adds Anthropic’s range only with allowAnthropicEgress, off by default', () => {
    expect(JSON.stringify(render([...MODE_A, ...RANGES]))).not.toContain(ANTHROPIC);
    const withAnthropic = render([...MODE_A, ...RANGES, 'mcp.allowAnthropicEgress=true']);
    expect(allowedSources(withAnthropic)).toEqual(['10.20.0.0/16', '192.0.2.7/32', ANTHROPIC]);
    // Anthropic's range alone is a list too.
    expect(allowedSources(render([...MODE_B, 'mcp.allowAnthropicEgress=true']))).toEqual([
      ANTHROPIC,
    ]);
  });

  it('refuses a host with no range to let in', () => {
    const refused = helm(MODE_A);
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toMatch(/mcp\.allowedSourceRanges is required/);
  });

  it('mode A: a ClientTrafficPolicy on the chart’s Gateway takes the client-IP detection from the values', () => {
    const manifests = render([
      ...MODE_A,
      ...RANGES,
      'mcp.clientIPDetection.xForwardedFor.trustedCIDRs[0]=172.16.0.0/12',
    ]);
    const policies = ofKind(manifests, 'ClientTrafficPolicy');
    expect(policies).toHaveLength(1);
    expect(policies[0]!.apiVersion).toBe('gateway.envoyproxy.io/v1alpha1');
    const gateway = ofKind(manifests, 'Gateway')[0]!;
    expect(policies[0]!.spec).toEqual({
      targetRefs: [
        { group: 'gateway.networking.k8s.io', kind: 'Gateway', name: gateway.metadata.name },
      ],
      clientIPDetection: { xForwardedFor: { trustedCIDRs: ['172.16.0.0/12'] } },
    });
    // Unset: Envoy's own, the address of the connection to it; no policy.
    expect(ofKind(render([...MODE_A, ...RANGES]), 'ClientTrafficPolicy')).toHaveLength(0);
  });

  it('refuses client-IP detection in mode B, where the Gateway is its owner’s', () => {
    const refused = helm([
      ...MODE_B,
      ...RANGES,
      'mcp.clientIPDetection.directSourceIP.enabled=true',
    ]);
    expect(refused.status).not.toBe(0);
    expect(refused.stderr).toMatch(/mcp\.clientIPDetection is mode A's alone/);
  });
});
