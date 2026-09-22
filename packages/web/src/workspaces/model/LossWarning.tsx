import { useEffect, useRef } from 'react';

import { StatusIcon } from '../../shell/StatusIcon';
import type { Loss } from './lossCheck';

/** The way the warning names one thing: a comment by its first line. */
function nameOf(loss: Loss): string {
  if (loss.kind === 'anchor') return `the anchor &${loss.text}`;
  if (loss.kind === 'alias') return `the alias *${loss.text}`;
  const [first = '', ...more] = loss.text.split('\n');
  return `the comment “${first.trim()}${more.length > 0 ? ' …' : ''}”`;
}

/** "a", "a and b", "a, b and c". */
function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/**
 * The warning before a form edit that would lose something (T140, AC-134):
 * the prototype's .warnbar (model.js), naming each thing the edit would drop,
 * with the choice to apply it or keep the file as it is.
 */
export function LossWarning({
  lost,
  onApply,
  onKeep,
}: {
  lost: readonly Loss[];
  onApply: () => void;
  onKeep: () => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  // The form locks while this waits, which takes the focus from the field
  // being edited: it comes here, on the choice that loses nothing, and the
  // bar is brought into view where the form had scrolled away from it.
  useEffect(() => {
    const element = bar.current;
    // Not in every DOM (jsdom has none): the focus below is what matters most.
    if (element !== null && typeof element.scrollIntoView === 'function')
      element.scrollIntoView({ block: 'nearest' });
    keep.current?.focus();
  }, []);
  return (
    <div ref={bar} className="model-editor__warnbar" role="alert">
      <StatusIcon kind="warn" />
      <span className="model-editor__warnbar-text">
        This edit would drop {listOf(lost.map(nameOf))}. The YAML keeps them while you edit there.
      </span>
      <button type="button" className="btn-sm" onClick={onApply}>
        Apply anyway
      </button>
      <button ref={keep} type="button" className="btn-sm" onClick={onKeep}>
        Keep the file
      </button>
    </div>
  );
}
