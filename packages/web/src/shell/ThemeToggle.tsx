import { useTheme } from './ThemeProvider';

/**
 * The theme control in the top bar: the prototype's icon button (AC-187).
 * Its name says which theme it switches *to*, so it is never ambiguous to a
 * screen reader, and a tooltip says the same to a pointer. Rule 3's icon and
 * label is for states, not controls; this is a control, named.
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const next = theme === 'light' ? 'dark' : 'light';
  const name = `Switch to ${next} theme`;

  return (
    <button
      type="button"
      className="theme-toggle icon-button"
      onClick={toggleTheme}
      aria-pressed={theme === 'dark'}
      aria-label={name}
      title={name}
    >
      {/* The prototype's half-filled circle. */}
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.5a6.5 6.5 0 1 0 0 13z" fill="currentColor" />
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    </button>
  );
}
