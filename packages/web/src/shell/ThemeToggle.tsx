import { useTheme } from './ThemeProvider';

/**
 * The theme control in the top bar. It names the theme it will switch *to*, so
 * the label is never ambiguous, and it is a button rather than an icon alone
 * (direction.md rule 3).
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'light' ? 'dark' : 'light';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-pressed={theme === 'dark'}
    >
      {next === 'dark' ? 'Dark theme' : 'Light theme'}
    </button>
  );
}
