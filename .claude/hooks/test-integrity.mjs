#!/usr/bin/env node
// Hook 5: PostToolUse Edit|Write|Bash. Flags skipped, disabled, commented-out, or weakened assertions in test diffs.
import { abs, block, hook, read, rel, run } from './lib.mjs';

const TEST = /[._](test|spec)\.[cm]?[jt]sx?$|(^|\/)(__tests__|tests?)\/|(^|\/)test_[^/]+\.py$|Tests?\.(java|kt)$/;
const SKIP = /\b(it|test|describe|suite|context)\.(skip|only|todo)\b|\b(xit|xtest|xdescribe)\s*\(|@Ignore\b|@Disabled\b|\bxfail\b|pytest\.mark\.skip|\bt\.Skip\(|\.skip\(/;
const COMMENTED = /^\s*(\/\/|#|\/?\*)\s*(expect|assert\w*)\s*[(.]|^\s*#\s*assert\s+\S.*\s(==|!=|is|in)\s/;
const ASSERT = /\b(expect|assert)(\w*\s*[(.]|\s)/g;
const STRONG = /\.(toBe|toEqual|toStrictEqual|toHaveBeenCalledWith|toHaveLength|toThrow)\(\s*[^)\s]/;
const WEAK = /\.(toBeTruthy|toBeDefined|toBeFalsy|toMatchObject)\(|\.not\.(toBeNull|toBeUndefined)\(|expect\.anything\(/;
const git = (...args) => { const r = run('git', args); return r.status === 0 ? r.stdout : null; };
const asDiff = (sign, text) => (text ?? '').split('\n').map((line) => sign + line);

hook('test-integrity', 'feedback', ({ tool_name, tool_input: input = {} }) => {
  const files = tool_name === 'Bash'
    ? (git('status', '--porcelain', '-uall') ?? '').split('\n').map((l) => l.slice(3).split(' -> ').pop()).filter(Boolean)
    : [rel(input.file_path ?? '')].filter((f) => f !== null);
  const findings = [];
  for (const file of files.filter((f) => TEST.test(f))) {
    const tracked = git('rev-parse', '--verify', '-q', 'HEAD') !== null && git('ls-files', '--error-unmatch', file) !== null;
    const diff = tracked ? (git('diff', '-U0', 'HEAD', '--', file) ?? '').split('\n')
      : tool_name === 'Edit' ? [...asDiff('-', input.old_string), ...asDiff('+', input.new_string)]
      : asDiff('+', read(abs(file)));
    const added = diff.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
    const removed = diff.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1));
    for (const l of added.filter((l) => SKIP.test(l))) findings.push(`${file}: adds a skip/only/disable marker: ${l.trim()}`);
    for (const l of added.filter((l) => COMMENTED.test(l))) findings.push(`${file}: adds a commented-out assertion: ${l.trim()}`);
    const count = (lines) => lines.filter((l) => !COMMENTED.test(l)).reduce((n, l) => n + (l.match(ASSERT) ?? []).length, 0);
    if (count(removed) > count(added)) findings.push(`${file}: removes ${count(removed)} assertion(s) but adds only ${count(added)}`);
    if (removed.some((l) => STRONG.test(l)) && added.some((l) => WEAK.test(l))) findings.push(`${file}: replaces a strict matcher with a weaker one`);
  }
  if (findings.length) block(`test-integrity: the change is already on disk; restore the assertions (or raise it with the user):\n- ${findings.join('\n- ')}`);
});
