import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * T413–T415, T417: the Cube image wechart runs is the user's fork's package on
 * an unmodified Cube v1.7.45. It was `cube-introspection/` at `0b6eef90a9`
 * (research/cube/introspection-api.md; the user's 2026-09-25 note) and is now
 * xcube, the same package renamed, at `a13b9cff43` (slice 0 of the
 * integration plan; docs/inputs/2026-09-26-integration-plan-decisions.md). Its
 * own `CMD` starts the package's server: a `command` of `cubejs server` would
 * start Cube without the introspection routes (research, "Don't override the
 * container command").
 *
 * T447: from `83cb9f0888` xcube serves the model too (slice 2;
 * docs/research/xcube-slice-2.md).
 *
 * T449, AC-333: from `c0610bb768` it serves the model as items, and the
 * fork's CI publishes the image, pulled by digest: its moving tag isn't a
 * version (research xcube-slice-3b.md, "Install", Gotcha 1).
 *
 * T420, AC-326: `ed08180c37` carries slices 4, 5 and 6 (the folder gate and
 * RS256 tokens, overlays, connections), the image the user chose for them
 * (R31; research xcube-overlay-data-sources.md, "Install").
 *
 * T459, AC-157: `e53cf2a8b8` adds each cube's bound data source to
 * `GET …/items`, a rebound cube's own SQL alias (AC-273), the connection
 * heartbeat (AC-161) and the publish/removal race fixed: the image built
 * last, as R31 asks (research xcube-22132c309c.md, xcube-e53cf2a8b8.md).
 *
 * T501, AC-161: `919cff8c6e` serves a data source changed in place from its
 * new target at once, as a new epoch, never the old one's cache or rollups;
 * keeps a cube's names while its data source is at the target it was first
 * served with (R38, AC-328); and answers the folder 403 on GET `/v1/sql` and
 * `/v1/dry-run` too (research xcube-4754c2c960.md, xcube-bc18f82c01.md,
 * xcube-2d5ac86f24.md, xcube-919cff8c6e.md).
 */
const IMAGE =
  'ghcr.io/senthilkrajagopal/xcube:v1.7.45-919cff8c6e@sha256:cb04cb9ba8e3b7db58ae8297a986f2deeaaf12497c853ab6d5c25c88797c5596';
/** Slice 2's image, built locally: only the way back names it. */
const SLICE_2_IMAGE = 'xcube:v1.7.45-83cb9f0888';

const fromRoot = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../${path}`, import.meta.url)), 'utf8');

/** A top-level compose service's block: its lines up to the next service. */
function serviceBlock(compose: string, name: string): string {
  const lines = compose.split('\n');
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) throw new Error(`docker-compose.yml has no service ${name}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line) || /^\S/.test(line));
  return rest.slice(0, end === -1 ? undefined : end).join('\n');
}

describe('docs/deploy.md pulls the fork’s published image by digest (T449, AC-248)', () => {
  const deploy = fromRoot('docs/deploy.md');

  it('pulls it by its digest, never its moving tag', () => {
    expect(deploy).toContain(`docker pull ${IMAGE}`);
    expect(deploy).not.toMatch(/xcube:v1\.7\.45-feat-xcube(?!`, )/);
    expect(deploy).not.toContain('cd ~/Work/bi/cube/cube-introspection');
    // The overlay build is gone with the branch it lived on.
    expect(deploy).not.toContain('overlay.Dockerfile');
  });

  it('names the image the release runs, and slice 2’s only for the way back, with how to build it', () => {
    // No other xcube tag, and no build of the package under its old name.
    expect(deploy).not.toMatch(/xcube:v1\.7\.45-(?!919cff8c6e@|83cb9f0888|feat-xcube|\$|<)/);
    expect(deploy).not.toContain('cube:v1.7.45-introspection-');
    // Slice 2's image was built locally and never published: the way back says how.
    const back = deploy.slice(deploy.indexOf('### Items mode, and the way back'));
    expect(back).toContain(`\`${SLICE_2_IMAGE}\``);
    expect(back).toContain('git -C ~/Work/bi/cube worktree add');
    expect(back).toContain(`docker build -t ${SLICE_2_IMAGE} .`);
  });
});

describe('the docker-desktop Helm release runs it (T414, T417, AC-248)', () => {
  it('names it as Cube’s image, for Cube and its refresh worker', () => {
    const values = fromRoot('deploy/helm/values/docker-desktop.yaml');
    const cube = /^cube:\n((?: {2}.*\n|\s*\n)+)/m.exec(values)?.[1] ?? '';
    expect(/^ {2}image: (.+)$/m.exec(cube)?.[1]).toBe(IMAGE);
  });

  it('is the chart’s own default too (T501’s review)', () => {
    const values = fromRoot('deploy/helm/wechart/values.yaml');
    const cube = /^cube:\n((?: {2}.*\n|\s*\n)+)/m.exec(values)?.[1] ?? '';
    expect(/^ {2}image: (.+)$/m.exec(cube)?.[1]).toBe(IMAGE);
  });

  /**
   * T420, AC-326: the service key pair is generated once and kept, as the
   * chart's other secrets are (`lookup`); the API gets the private half,
   * Cube's API instance a certificate of the public half, and no pod the
   * static admin token (research `cube/tokens-and-service-credential.md`,
   * "Kubernetes": `genSelfSignedCert`).
   */
  it('gives the API the service key, and Cube’s API instance its certificate alone', () => {
    const secrets = fromRoot('deploy/helm/wechart/templates/secrets.yaml');
    expect(secrets).toContain('genSelfSignedCert');
    expect(secrets).toMatch(/get \$data "service-key\.pem"/);
    // Made only when the Secret holds no pair: an upgrade keeps it (T420's review).
    expect(secrets).toMatch(
      /\{\{- if not \(and \$serviceKey \$serviceCert\) \}\}\n\{\{- \$generated := genSelfSignedCert/,
    );
    expect(secrets).toMatch(/^ {2}service-key\.pem: /m);
    expect(secrets).toMatch(/^ {2}service-cert\.pem: /m);
    expect(secrets).not.toContain('xcube-admin-token');

    const api = fromRoot('deploy/helm/wechart/templates/api.yaml');
    expect(api).toMatch(/- name: WECHART_SERVICE_KEY\n[^-]*key: service-key\.pem/);
    expect(api).not.toContain('WECHART_XCUBE_ADMIN_TOKEN');

    const cube = fromRoot('deploy/helm/wechart/templates/cube.yaml');
    const apiInstance = cube.slice(cube.indexOf('{{- else }}'));
    expect(apiInstance).toMatch(/- name: XCUBE_SERVICE_KEYS\n[^-]*key: service-cert\.pem/);
    // Not the worker's: it verifies no token of wechart's.
    const worker = cube.slice(
      cube.indexOf('{{- if eq $component "cube-refresh-worker" }}'),
      cube.indexOf('{{- else }}'),
    );
    expect(worker).toContain('CUBEJS_REFRESH_WORKER');
    expect(worker).not.toContain('XCUBE_SERVICE_KEYS');
    expect(cube).not.toContain('XCUBE_ADMIN_TOKENS');
    expect(cube).not.toContain('service-key.pem');
  });

  /**
   * T437, AC-326: the query signing key is generated once and kept, as the
   * chart's other secrets are (`lookup`), and only the API has it: xcube
   * learns its public half from the API's push, never by configuration
   * (research `cube/tokens-and-service-credential.md`, "Kubernetes":
   * `genPrivateKey "rsa"`).
   */
  it('gives the query signing key to the API alone, generated once', () => {
    const secrets = fromRoot('deploy/helm/wechart/templates/secrets.yaml');
    // Made only when the Secret holds none: an upgrade keeps it.
    expect(secrets).toMatch(
      /\$signingKey := get \$data "signing-key\.pem" \| b64dec \| default \(genPrivateKey "rsa"\)/,
    );
    expect(secrets).toMatch(/^ {2}signing-key\.pem: /m);

    const api = fromRoot('deploy/helm/wechart/templates/api.yaml');
    expect(api).toMatch(/- name: WECHART_SIGNING_KEY\n[^-]*key: signing-key\.pem/);
    for (const other of [
      'cube.yaml',
      'cubestore.yaml',
      'dex.yaml',
      'meta.yaml',
      'seed-default.yaml',
      'web.yaml',
      'xcube-bootstrap.yaml',
      'xcube-credential-key.yaml',
    ])
      expect(fromRoot(`deploy/helm/wechart/templates/${other}`), other).not.toContain(
        'signing-key.pem',
      );
  });

  /**
   * T361's review: nginx gives up on a request silent for 60 s by default
   * (research nginx.md, "Longest single API request"). A connection test
   * waits on two 30 s steps, and a publish on xcube's 120 s compile wait.
   */
  it('lets the web app wait on the API as long as a connection test or a publish takes', () => {
    const web = fromRoot('deploy/helm/wechart/templates/web-config.yaml');
    // The block, to its own closing brace: its proxy_pass holds a template's braces.
    const api = /location \/api\/ \{\n([\s\S]*?)\n {8}\}/.exec(web)?.[1] ?? '';
    expect(api).toContain('proxy_pass http://');
    expect(api).toMatch(/^\s+proxy_read_timeout 130s;$/m);
  });

  it('gives Cube’s containers the image’s own command', () => {
    const template = fromRoot('deploy/helm/wechart/templates/cube.yaml');
    // One template serves both Deployments (research, "Where it runs today").
    expect(template).toContain('image: {{ $.Values.cube.image }}');
    // Cube's own container: the init container that waits for xcube's
    // schema runs a command of its own (T447).
    const containers = template.slice(template.indexOf('\n      containers:'));
    expect(containers).toContain('image: {{ $.Values.cube.image }}');
    expect(containers).not.toMatch(/^\s*(command|args):/m);
  });
});

describe('compose runs the package’s image for Cube and its refresh worker (T413, T417, AC-139, AC-250)', () => {
  const compose = fromRoot('docker-compose.yml');

  it.each(['cube', 'cube-refresh-worker'])(
    '%s defaults to it, with the image’s own command',
    (name) => {
      const block = serviceBlock(compose, name);
      expect(/^ {4}image: (.+)$/m.exec(block)?.[1]).toBe(`\${CUBE_IMAGE:-${IMAGE}}`);
      expect(block).not.toMatch(/^ {4}(command|entrypoint):/m);
    },
  );
});

/**
 * T447, AC-333: xcube serves the model from its schema in the metadata
 * database (research xcube-slice-2.md, "Install"): `XCUBE_DATABASE_URL` on
 * every Cube process; `XCUBE_ADMIN_TOKENS` on the API instance only, never the
 * worker; the bootstrap run to completion before either starts (Gotcha 14).
 */
describe('compose serves the model from xcube’s schema (T447, AC-333)', () => {
  const compose = fromRoot('docker-compose.yml');
  const shared =
    /^x-cube-environment: &cube-environment\n((?: {2}.*\n)+)/m.exec(compose)?.[1] ?? '';

  it('gives both Cube processes xcube’s database, as the role the bootstrap makes', () => {
    expect(shared).toMatch(
      /^ {2}XCUBE_DATABASE_URL: postgres:\/\/xcube:\$\{XCUBE_DB_PASSWORD:-[^}]+\}@wechart-meta:5432\/wechart_meta$/m,
    );
    for (const name of ['cube', 'cube-refresh-worker'])
      expect(serviceBlock(compose, name)).toContain('<<: *cube-environment');
    // Cube no longer reads wechart's model store.
    expect(compose).not.toContain('WECHART_MODEL_STORES');
  });

  /**
   * T420, AC-326: slice 4's service credential replaces the static admin
   * token (research xcube-slice-4.md, "Environment"): its public half, as a
   * PEM file, on the API instance alone, which serves the admin routes, jobs
   * and introspection; the worker verifies no token of wechart's.
   */
  it('gives the service key’s public half to the API instance alone, and no admin token to any', () => {
    expect(serviceBlock(compose, 'cube')).toMatch(
      /^ {6}XCUBE_SERVICE_KEYS_FILE: \/run\/secrets\/xcube-service-keys$/m,
    );
    expect(serviceBlock(compose, 'cube')).toMatch(/^ {6}- xcube-service-keys$/m);
    expect(compose).toMatch(
      /^ {2}xcube-service-keys:\n {4}file: \.\/infra\/xcube\/dev-service-key\.pub\.pem$/m,
    );
    expect(serviceBlock(compose, 'cube-refresh-worker')).not.toContain('XCUBE_SERVICE_KEYS');
    expect(shared).not.toContain('XCUBE_SERVICE_KEYS');
    expect(compose).not.toContain('XCUBE_ADMIN_TOKENS');
  });

  /**
   * T455, AC-324: xcube opens data sources' secrets with the development key,
   * loaded by the kid `XCUBE_CREDENTIAL_KEY_IDS` names, from `<kid>.pem` and
   * the `<kid>.check` sample credential that proves it (research
   * xcube-slice-6.md, "xcube's credential key, for compose and Helm"): in both
   * Cube processes, since the worker builds through connections too, and in
   * no container of wechart's (AC-298).
   */
  it('gives both Cube processes the credential key and its sample credential, by its kid, and wechart neither', () => {
    const kid = (JSON.parse(fromRoot('infra/xcube/dev-credential-key.pub.jwk')) as { kid: string })
      .kid;
    expect(shared).toMatch(new RegExp(`^ {2}XCUBE_CREDENTIAL_KEY_IDS: ${kid}$`, 'm'));
    const mounts = /^x-cube-secrets: &cube-secrets\n((?: {2}.*\n)+)/m.exec(compose)?.[1] ?? '';
    for (const file of [`${kid}.pem`, `${kid}.check`])
      expect(mounts).toContain(`target: /run/secrets/xcube-credential-keys/${file}`);
    expect(compose).toMatch(
      /^ {2}xcube_credential_check:\n {4}file: \.\/infra\/xcube\/dev-credential-key\.check$/m,
    );
    expect(serviceBlock(compose, 'cube')).toMatch(
      /secrets:\n {6}- \*xcube-credential-key\n {6}- \*xcube-credential-check\n/,
    );
    expect(serviceBlock(compose, 'cube-refresh-worker')).toContain('secrets: *cube-secrets');
    for (const name of ['wechart-meta', 'sample-db', 'cubestore', 'dex'])
      expect(serviceBlock(compose, name), name).not.toContain('xcube-credential');
  });

  it('runs xcube’s bootstrap on the metadata database before either starts', () => {
    const init = serviceBlock(compose, 'xcube-db-init');
    expect(init).toContain('./infra/xcube/bootstrap.sql:/bootstrap.sql:ro');
    expect(init).toContain('- ON_ERROR_STOP=1');
    expect(init).toContain('- xcube_password=${XCUBE_DB_PASSWORD:-');
    expect(init).toContain('- wechart_meta');
    expect(serviceBlock(compose, 'cube')).toMatch(
      /xcube-db-init:\n {8}condition: service_completed_successfully/,
    );
    // The worker shares the API instance's dependencies.
    expect(serviceBlock(compose, 'cube-refresh-worker')).toContain('depends_on: *cube-depends-on');
  });

  it('runs the fork’s own bootstrap, as it was at the image’s commit', () => {
    const bootstrap = fromRoot('infra/xcube/bootstrap.sql');
    expect(bootstrap).toContain('83cb9f0888');
    // Its statements exactly, as the fork has them (research, "Database
    // bootstrap"): the comments aside, nothing more and nothing less.
    const statements = bootstrap
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.startsWith('--'));
    expect(statements).toEqual([
      "SELECT 'CREATE ROLE xcube LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'",
      " WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'xcube') \\gexec",
      "ALTER ROLE xcube WITH LOGIN PASSWORD :'xcube_password' CONNECTION LIMIT 64;",
      "SELECT format('GRANT CONNECT ON DATABASE %I TO xcube', current_database()) \\gexec",
      'CREATE SCHEMA IF NOT EXISTS xcube AUTHORIZATION xcube;',
    ]);
  });
});
