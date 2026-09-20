#!/usr/bin/env node
// Hook 4: PostToolUse Edit|Write. Formats, lints, and typechecks the touched file with the project's installed tools.
import { existsSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { block, hook, read, rel, ROOT, run, up } from './lib.mjs';

const FORMAT = /\.([cm]?[jt]sx?|json|css|scss|html|ya?ml)$/;

hook('quality-check', 'feedback', ({ tool_input: input = {} }) => {
  const file = input.file_path ?? '';
  const path = rel(file);
  if (path === null || path.startsWith('.claude/') || !FORMAT.test(path) || !existsSync(file)) return;
  const dir = dirname(file);
  const bin = (tool) => up(dir, `node_modules/.bin/${tool}`);
  const problems = [];

  let lint = { status: 0 };
  if (bin('biome')) lint = run(bin('biome'), ['check', '--write', file]);
  else if (bin('prettier')) run(bin('prettier'), ['--write', '--ignore-unknown', file]);
  if (!bin('biome') && bin('eslint') && /\.[cm]?[jt]sx?$/.test(path)) lint = run(bin('eslint'), ['--fix', file]);
  if (lint.status === 1) problems.push(`lint:\n${lint.out}`); // 1 = findings; other codes = tool/config errors

  if (/\.[cm]?tsx?$/.test(path)) {
    // Prefer the package's own `typecheck` script; otherwise tsc against the nearest tsconfig.json.
    const pkg = up(dir, 'package.json');
    const script = pkg && JSON.parse(read(pkg)).scripts?.typecheck;
    const [tsc, tsconfig, cwd] = [bin('tsc'), up(dir, 'tsconfig.json'), script ? dirname(pkg) : ROOT];
    const out = script ? run('npm', ['run', '--silent', 'typecheck'], { cwd }).out
      : tsc && tsconfig ? run(tsc, ['--noEmit', '--pretty', 'false', '-p', tsconfig]).out : '';
    const mine = out.split('\n').filter((l) => l.includes(relative(cwd, file)) && /error TS\d+/.test(l));
    if (mine.length) problems.push(`typecheck:\n${mine.join('\n')}`);
  }
  if (problems.length) block(`quality-check: ${path} was written but has problems to fix:\n\n${problems.join('\n\n')}`);
});
