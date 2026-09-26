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
 */
const IMAGE = 'xcube:v1.7.45-a13b9cff43';

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

describe('docs/deploy.md builds it from the package (T415, T417, AC-248)', () => {
  const deploy = fromRoot('docs/deploy.md');

  it('builds from the package’s directory, tagged by the fork’s commit', () => {
    expect(deploy).toContain('cd ~/Work/bi/cube/xcube');
    expect(deploy).not.toContain('cd ~/Work/bi/cube/cube-introspection');
    expect(deploy).toContain('docker build -t xcube:v1.7.45-$(git rev-parse --short=10 HEAD) .');
    // The overlay build is gone with the branch it lived on.
    expect(deploy).not.toContain('overlay.Dockerfile');
  });

  it('names the image the release runs, and no other', () => {
    expect(deploy).toContain(`\`${IMAGE}\``);
    // No other xcube tag, and no build of the package under its old name.
    expect(deploy).not.toMatch(/xcube:v1\.7\.45-(?!a13b9cff43|\$|<)/);
    expect(deploy).not.toContain('cube:v1.7.45-introspection-');
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
    expect(template).not.toMatch(/^\s*(command|args):/m);
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
