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
 */
const IMAGE =
  'ghcr.io/senthilkrajagopal/xcube:v1.7.45-c0610bb768@sha256:d787e67c23f567437e49e1ad1e3eab1802c143bd1bfab465ded9e9468c5e1ab8';
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
    expect(deploy).not.toMatch(/xcube:v1\.7\.45-(?!c0610bb768@|83cb9f0888|feat-xcube|\$|<)/);
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

  it('gives the admin tokens to the API instance alone', () => {
    expect(serviceBlock(compose, 'cube')).toMatch(
      /^ {6}XCUBE_ADMIN_TOKENS: \$\{XCUBE_ADMIN_TOKENS:-.{32,}\}$/m,
    );
    expect(serviceBlock(compose, 'cube-refresh-worker')).not.toContain('XCUBE_ADMIN_TOKENS');
    expect(shared).not.toContain('XCUBE_ADMIN_TOKENS');
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
