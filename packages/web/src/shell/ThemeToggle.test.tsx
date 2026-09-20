import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { ThemeProvider } from './ThemeProvider';
import { ThemeToggle } from './ThemeToggle';

/**
 * AC-003, at the component level: the switch is an attribute change on the
 * document element, so nothing remounts. The e2e in e2e/theme.spec.ts covers
 * what the browser actually paints.
 */
afterEach(() => {
  delete document.documentElement.dataset['theme'];
  localStorage.clear();
});

describe('theme toggle (AC-003)', () => {
  it('applies the theme to the document element', () => {
    render(
      <ThemeProvider initial="light">
        <ThemeToggle />
      </ThemeProvider>,
    );

    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('switches to the other theme when activated', async () => {
    render(
      <ThemeProvider initial="light">
        <ThemeToggle />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('switches back', async () => {
    render(
      <ThemeProvider initial="dark">
        <ThemeToggle />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('is reachable and operable from the keyboard', async () => {
    render(
      <ThemeProvider initial="light">
        <ThemeToggle />
      </ThemeProvider>,
    );

    await userEvent.tab();
    expect(screen.getByRole('button')).toBe(document.activeElement);

    await userEvent.keyboard('{Enter}');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('remembers the choice for the next visit', async () => {
    render(
      <ThemeProvider initial="light">
        <ThemeToggle />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(localStorage.getItem('wechart.theme')).toBe('dark');
  });

  it('reports its state, so it is not conveyed by appearance alone', async () => {
    render(
      <ThemeProvider initial="light">
        <ThemeToggle />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    await userEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});
