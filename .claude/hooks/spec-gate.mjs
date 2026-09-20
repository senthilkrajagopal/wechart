#!/usr/bin/env node
// Hook 2: PreToolUse Edit|Write. Blocks edits outside docs/ until docs/spec.md exists with nothing unresolved.
import { abs, block, hook, read, rel, UNRESOLVED } from './lib.mjs';

hook('spec-gate', 'gate', ({ tool_input: input = {} }) => {
  const path = rel(input.file_path ?? '');
  if (path === null || path === 'docs' || path.startsWith('docs/')) return; // outside the project, or docs/

  const spec = read(abs('docs/spec.md'));
  if (spec === null) {
    block(
      `Blocked: docs/spec.md does not exist, so edits outside docs/ (here: ${path}) are not allowed yet. ` +
        'The workflow is project-interview (docs/requirements.md), then write-spec (docs/spec.md).',
    );
  }

  const unresolved = spec
    .split('\n')
    .map((line, i) => [i + 1, line.trim()])
    .filter(([, line]) => UNRESOLVED.test(line));
  if (unresolved.length) {
    block(
      `Blocked: docs/spec.md has ${unresolved.length} unresolved line(s) (TBD / NEEDS CLARIFICATION), ` +
        `so ${path} cannot be edited until the user resolves them:\n` +
        unresolved.slice(0, 20).map(([n, line]) => `  docs/spec.md:${n}: ${line}`).join('\n'),
    );
  }
});
