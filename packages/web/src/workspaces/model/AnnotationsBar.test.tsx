import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AnnotationsBar } from './AnnotationsBar';

/**
 * T482 / AC-134, design 03 note 4 (UX-070, MW-07): a file with comments,
 * anchors or aliases says so upfront — each named by its first line and its
 * YAML lines — with Show in YAML, before any edit could touch them.
 */
const ORDERS = [
  {
    kind: 'comment' as const,
    text: 'Cube hides primary keys from metadata unless told otherwise. This one',
    from: 19,
    to: 22,
  },
];

describe('the bar naming what a form edit could lose', () => {
  it('names a single comment by its first line and its lines, and says what the form does', () => {
    render(<AnnotationsBar annotations={ORDERS} onShow={vi.fn()} onHide={vi.fn()} />);
    const bar = screen.getByRole('note');
    expect(bar.textContent).toBe(
      'This file has 1 comment (YAML lines 19–22, “Cube hides primary keys from metadata unless told …”). ' +
        'The form keeps it, and asks first before an edit that would take away the key it is written on; ' +
        'the YAML keeps everything.Show in YAMLHide',
    );
  });

  it('counts each kind, and lists four places at most', () => {
    render(
      <AnnotationsBar
        annotations={[
          { kind: 'comment', text: 'The sample’s secured view (F19)', from: 2, to: 6 },
          { kind: 'comment', text: 'Managers: everything.', from: 18, to: 18 },
          { kind: 'comment', text: 'Sales: shipped orders only', from: 24, to: 24 },
          { kind: 'comment', text: 'Auditors: every row', from: 38, to: 38 },
          { kind: 'anchor', text: 'shared', from: 40, to: 40 },
          { kind: 'alias', text: 'shared', from: 44, to: 44 },
        ]}
        onShow={vi.fn()}
        onHide={vi.fn()}
      />,
    );
    expect(screen.getByRole('note').querySelector('.model-annotations__what')?.textContent).toBe(
      'This file has 4 comments, 1 anchor and 1 alias (YAML lines 2–6, “The sample’s secured view (F19)”, 18, 24, 38, and 2 more).',
    );
  });

  it('shows them in the YAML, or hides itself, as asked', async () => {
    const onShow = vi.fn();
    const onHide = vi.fn();
    render(<AnnotationsBar annotations={ORDERS} onShow={onShow} onHide={onHide} />);
    await userEvent.click(screen.getByRole('button', { name: 'Show in YAML' }));
    expect(onShow).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('draws nothing for a file with none', () => {
    const { container } = render(
      <AnnotationsBar annotations={[]} onShow={vi.fn()} onHide={vi.fn()} />,
    );
    expect(container.childElementCount).toBe(0);
  });
});
