#!/usr/bin/env node
// Hook 3: PreToolUse Edit|Write. Blocks code that imports a package that has no docs/research/ entry.
import { existsSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { abs, block, hook, read, rel } from './lib.mjs';

const CODE = /\.[cm]?[jt]sx?$/;
const IMPORT = /(?:^|[^\w$.])(?:import|export)\s[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|[^\w$.])import\s*\(?\s*['"]([^'"]+)['"]|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const local = (s) => /^(\.|\/|node:|#|~|virtual:|@\/)/.test(s) || builtinModules.includes(s.split('/')[0]);
const pkgName = (s) => s.split('/').slice(0, s.startsWith('@') ? 2 : 1).join('/');
const mdFiles = (dir) => (!existsSync(dir) ? [] : readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? mdFiles(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []));
// `packages: [a, @b/c]` or a YAML block list under `packages:` in a research doc's frontmatter.
const listed = (doc) => (doc.match(/^packages:[ \t]*(\[[^\]]*\]|(?:\n[ \t]+-[ \t]*\S.*)+)/m)?.[1] ?? '')
  .match(/@?[a-z0-9][\w.~-]*(?:\/[\w.~-]+)?/gi) ?? [];

hook('research-gate', 'gate', ({ tool_name, tool_input: input = {} }) => {
  const path = rel(input.file_path ?? '');
  if (path === null || path.startsWith('docs/') || !CODE.test(path)) return;
  const source = (tool_name === 'Write' ? input.content : input.new_string) ?? '';
  const imported = new Set([...source.matchAll(IMPORT)].map((m) => m[1] ?? m[2] ?? m[3]).filter((s) => !local(s)).map(pkgName));
  if (!imported.size) return;

  const workspace = ['apps', 'packages'].flatMap((d) => (existsSync(abs(d)) ? readdirSync(abs(d)) : []).map((n) => {
    try { return JSON.parse(read(abs(d, n, 'package.json')) ?? '{}').name; } catch { return undefined; }
  }));
  const covered = new Set([...workspace, ...mdFiles(abs('docs/research')).flatMap((f) => listed(read(f)))]);
  const missing = [...imported].filter((p) => !covered.has(p) && !existsSync(abs('docs/research', `${p}.md`)));
  if (missing.length) {
    block(`Blocked: ${path} imports package(s) with no research doc: ${missing.join(', ')}.\n` +
      missing.map((p) => `  expected docs/research/${p}.md, or a docs/research/*.md whose frontmatter lists it under packages:`).join('\n') +
      '\nThe component-research skill produces these docs.');
  }
});
