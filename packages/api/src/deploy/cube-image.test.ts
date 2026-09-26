import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * T413–T415: the Cube image wechart runs is the user's fork's introspection
 * package on an unmodified Cube v1.7.45, at `0b6eef90a9`
 * (research/cube/introspection-api.md; the user's 2026-09-25 note). Its own
 * `CMD` starts the package's server: a `command` of `cubejs server` would start
 * Cube without the introspection routes (research, "Don't override the
 * container command").
 */
const IMAGE = 'cube:v1.7.45-introspection-0b6eef90a9';

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

describe('compose runs the package’s image for Cube and its refresh worker (T413, AC-139, AC-250)', () => {
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
