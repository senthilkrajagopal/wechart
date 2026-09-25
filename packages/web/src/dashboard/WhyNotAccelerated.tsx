import { useEffect, useId, useRef } from 'react';

import { AccelerationPanel } from '../editor/AccelerationPanel';
import { useFocusTrap } from '../shell/useFocusTrap';

/**
 * Data as of › Why not accelerated? (T273, AC-245): the chart editor's
 * acceleration panel (T150, AC-144) — which rollup is nearest the tile's
 * query and the member that stops it — asked of the query the tile runs, its
 * dashboard filters included, in a dialog on the dashboard. A reader has
 * nothing to edit, so it opens here rather than in the editor (decided so by
 * T273; the design review's P6 named the editor's panel).
 *
 * Escape or Close puts it away; the caller gives focus back to the menu.
 */
export function WhyNotAccelerated({
  title,
  query,
  onClose,
}: {
  title: string;
  query: Record<string, unknown>;
  onClose: () => void;
}) {
  const heading = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useFocusTrap(box);

  const closing = useRef(onClose);
  useEffect(() => {
    closing.current = onClose;
  }, [onClose]);
  useEffect(() => {
    close.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closing.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className="dialog-backdrop">
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={heading} className="dialog">
        <h2 id={heading}>Why {title} is not accelerated</h2>
        <AccelerationPanel query={query} />
        <div className="dialog__actions">
          <button type="button" ref={close} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
