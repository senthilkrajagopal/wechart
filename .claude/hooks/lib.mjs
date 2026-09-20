// Shared helpers for the .claude/hooks/*.mjs hook scripts (not a hook itself).
// Contract: every hook reads JSON on stdin and exits 0 (allow / no-op) or 2 (block). Never 1.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';

export const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const abs = (...parts) => join(ROOT, ...parts);
export const read = (path) => (path && existsSync(path) ? readFileSync(path, 'utf8') : null);

/** Runs a command without a shell and returns its exit status, stdout, and combined output. */
export function run(cmd, args, { cwd = ROOT, timeout = 150_000, env } = {}) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, env });
  return { status: r.status, stdout: r.stdout ?? '', out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

/** Nearest `name` found walking up from `dir`, stopping at the project root; null if none. */
export function up(dir, name) {
  for (let d = dir; d.startsWith(ROOT) && d !== dirname(d); d = dirname(d)) {
    if (existsSync(join(d, name))) return join(d, name);
  }
  return null;
}

/** Project-relative POSIX path of `file`, or null when it lies outside the project. */
export function rel(file) {
  const r = relative(ROOT, String(file).replaceAll('\\', '/')).replaceAll('\\', '/');
  return r.startsWith('..') || isAbsolute(r) ? null : r;
}

export function block(message) {
  process.stderr.write(`${message.trim()}\n`);
  process.exit(2);
}

export function done(json) {
  if (json) process.stdout.write(JSON.stringify(json));
  process.exit(0);
}

/** Lines that leave docs/spec.md unresolved (the spec gate blocks on any of them). */
export const UNRESOLVED = /\bTBD\b|\[NEEDS CLARIFICATION/;

/** Acceptance criteria in docs/spec.md, written as `- [ ] AC-001 WHEN ..., THE SYSTEM SHALL ...`. */
export function criteria(spec) {
  return [...(spec ?? '').matchAll(/^\s*- \[([ xX])\] (AC-\d+)\b(.*)$/gm)].map((m) => ({
    done: m[1] !== ' ',
    id: m[2],
    text: m[3].trim(),
  }));
}

/**
 * Runs `main(input)`. On an internal error, a 'gate' hook fails closed (exit 2) and a
 * 'feedback' hook fails open (exit 0 with a systemMessage), so no hook ever exits 1.
 */
export function hook(name, mode, main) {
  const fail = (err) => {
    const message = `${name} hook internal error: ${err?.stack ?? err}`;
    if (mode === 'gate') block(`${message}\nBlocking because ${name} is a gate; fix .claude/hooks/${name}.mjs.`);
    done({ systemMessage: message });
  };
  process.on('uncaughtException', fail);
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (raw += chunk));
  process.stdin.on('end', async () => {
    try {
      await main(JSON.parse(raw || '{}'));
      done();
    } catch (err) {
      fail(err);
    }
  });
}
