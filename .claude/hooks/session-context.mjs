#!/usr/bin/env node
// Hook 1: SessionStart. Reports the workflow phase and the open acceptance criteria as factual context.
import { abs, criteria, done, hook, read, UNRESOLVED } from './lib.mjs';

const TASK = /^\s*- \[([ xX])\] (T\d+)\b(.*)$/gm;

hook('session-context', 'feedback', () => {
  const [req, spec, tasks] = ['requirements', 'spec', 'tasks'].map((f) => read(abs(`docs/${f}.md`)));
  const acs = criteria(spec);
  const open = acs.filter((a) => !a.done);
  const unresolved = (spec ?? '').split('\n').filter((l) => UNRESOLVED.test(l)).length;
  const taskList = [...(tasks ?? '').matchAll(TASK)];
  const next = taskList.find((m) => m[1] === ' ');

  let phase;
  if (!req) phase = 'interview (docs/requirements.md does not exist)';
  else if (!spec) phase = 'spec (docs/requirements.md exists; docs/spec.md does not)';
  else if (unresolved) phase = `spec-unresolved (docs/spec.md has ${unresolved} line(s) marked TBD or NEEDS CLARIFICATION; edits outside docs/ are blocked)`;
  else if (!tasks) phase = 'planning (docs/spec.md is resolved; docs/tasks.md does not exist)';
  else if (acs.length && !open.length) phase = 'complete (every acceptance criterion in docs/spec.md is checked)';
  else phase = next ? `implement (next unchecked task: ${next[2]}${next[3]})` : 'implement (all tasks are checked; acceptance criteria remain open)';

  const lines = [`The wechart harness phase is ${phase}.`];
  if (acs.length) lines.push(`docs/spec.md has ${open.length} of ${acs.length} acceptance criteria unchecked${open.length ? ':' : '.'}`);
  for (const a of open.slice(0, 25)) lines.push(`- ${a.id} ${a.text.slice(0, 200)}`);
  if (open.length > 25) lines.push(`- ${open.length - 25} more are listed in docs/spec.md.`);
  if (taskList.length) lines.push(`docs/tasks.md has ${taskList.filter((m) => m[1] === ' ').length} of ${taskList.length} tasks unchecked.`);
  done({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join('\n') } });
});
