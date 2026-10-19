import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AsOfText } from './AsOfElement';
import { MarkingText } from './MarkingElement';

/**
 * T886 / AC-522: … an As of show the data's age ("as of 14:05"), its
 * tooltip saying whether a pre-aggregation answered; and a Marking show its
 * marking's count or summary (AC-116).
 */
const NOW = new Date(2026, 9, 18, 16, 30);

describe('an As of (T886, AC-522)', () => {
  it('reads "as of 14:05", its tooltip naming the pre-aggregation that answered', () => {
    const { container } = render(
      <AsOfText at={new Date(2026, 9, 18, 14, 5)} now={NOW} preAggregation="orders.main" />,
    );
    const asOf = container.firstElementChild as HTMLElement;
    expect(asOf.textContent).toBe('as of 14:05');
    expect(asOf.getAttribute('title')).toBe('Answered by the pre-aggregation orders.main');
  });

  it('says the database answered where no pre-aggregation did', () => {
    const { container } = render(<AsOfText at={new Date(2026, 9, 18, 14, 5)} now={NOW} />);
    expect((container.firstElementChild as HTMLElement).getAttribute('title')).toBe(
      'Answered by the database, not a pre-aggregation',
    );
  });

  it('reads "—" with no answer to date', () => {
    expect(render(<AsOfText at={undefined} now={NOW} />).container.textContent).toBe('—');
  });
});

describe('a Marking (T886, AC-522, AC-116)', () => {
  it('shows its marking’s count', () => {
    expect(render(<MarkingText text="3" />).container.textContent).toBe('3');
  });
});
