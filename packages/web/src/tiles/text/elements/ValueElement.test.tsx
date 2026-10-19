import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ValueText } from './ValueElement';

/**
 * T884 / AC-520: a Value shows a measure in its model's format (AC-046) …
 * showing all data when nothing is marked unless the author chose "—".
 * `Fails when: a Value's format differs from its member's …`
 */
describe('a Value (T884, AC-520)', () => {
  it('shows Revenue in its model’s currency format', () => {
    const { container } = render(
      <ValueText
        value="1270000"
        member="orders.revenue"
        formats={{ 'orders.revenue': 'currency' }}
      />,
    );
    expect(container.textContent).toBe('$1,270,000');
  });

  it('shows "—" for nothing to show: the author’s choice with nothing marked, or no data', () => {
    expect(render(<ValueText none member="orders.revenue" />).container.textContent).toBe('—');
    const empty = render(<ValueText value={null} member="orders.revenue" />);
    expect(empty.container.textContent).toBe('—');
  });
});
