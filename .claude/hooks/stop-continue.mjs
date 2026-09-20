#!/usr/bin/env node
// Hook 6: Stop. Keeps Claude working while acceptance criteria are open and the test suite passes.
// Capped at N continuations without progress; the counter resets when the number of unchecked criteria changes.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { abs, block, criteria, done, hook, read, run } from './lib.mjs';

const MAX = Number(process.env.HARNESS_MAX_CONTINUATIONS ?? 3);
const STATE = abs('.claude/state/stop-continue.json');

hook('stop-continue', 'feedback', ({ session_id: session }) => {
  const open = criteria(read(abs('docs/spec.md'))).filter((a) => !a.done);
  const scripts = JSON.parse(read(abs('package.json')) ?? '{}').scripts ?? {};
  if (!open.length || !scripts.test) return;

  const pm = existsSync(abs('pnpm-lock.yaml')) ? 'pnpm' : 'npm';
  const tests = run(pm, ['test'], { timeout: 300_000, env: { ...process.env, CI: '1' } });
  if (tests.status !== 0) return; // failing or timed out: allow the stop so a person sees the red state

  let state = {};
  try { state = JSON.parse(read(STATE) ?? '{}'); } catch { /* a corrupt counter counts as zero */ }
  const count = state.session === session && state.unchecked === open.length ? state.count : 0;
  const save = (n) => { mkdirSync(abs('.claude/state'), { recursive: true }); writeFileSync(STATE, JSON.stringify({ session, unchecked: open.length, count: n })); };
  if (count >= MAX) {
    if (count > MAX) return; // the cap was already reported
    save(MAX + 1);
    done({ systemMessage: `stop-continue: ${MAX} continuations passed without a newly checked criterion; ${open.length} remain open.` });
  }
  save(count + 1);
  const ids = open.slice(0, 5).map((a) => a.id).join(', ') + (open.length > 5 ? ', …' : '');
  block(`${open.length} acceptance criteria in docs/spec.md are still unchecked (${ids}) and \`${pm} test\` passes. ` +
    `This is continuation ${count + 1} of ${MAX} since the last newly checked criterion.`);
});
