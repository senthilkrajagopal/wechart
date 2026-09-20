import { themeCss } from '@wechart/ui';

/**
 * The generated token custom properties plus the shell's own rules. Injected
 * once at start-up rather than imported as a .css file, so the tokens have a
 * single source in TypeScript and the audit in @wechart/ui checks the same
 * values the browser paints (AC-004, AC-005).
 */
const SHELL_CSS = `
* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--wc-bg-page);
  color: var(--wc-text-primary);
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: var(--wc-text-sm-size);
  line-height: var(--wc-text-sm-line);
}

.app-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 48px;
  padding: 0 16px;
  background: var(--wc-bg-surface);
  border-bottom: 1px solid var(--wc-border-subtle);
}

.app-bar__product {
  font-size: var(--wc-text-md-size);
  font-weight: var(--wc-text-md-weight);
}

.workspace-switcher ul {
  display: flex;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.workspace-switcher a {
  display: inline-block;
  padding: 6px 10px;
  border-radius: 4px;
  color: var(--wc-text-secondary);
  text-decoration: none;
}

.workspace-switcher a:hover { background: var(--wc-bg-subtle); }

.workspace-switcher a[aria-current='page'] {
  color: var(--wc-text-primary);
  background: var(--wc-bg-subtle);
  font-weight: var(--wc-text-sm-strong-weight);
}

.theme-toggle {
  margin-left: auto;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--wc-border-strong);
  border-radius: 4px;
  background: var(--wc-bg-surface);
  color: var(--wc-text-primary);
  font: inherit;
  cursor: pointer;
}

main { padding: 16px; }

:focus-visible {
  outline: 2px solid var(--wc-accent);
  outline-offset: 2px;
}
`;

export function installStyles(doc: Document = document): void {
  if (doc.querySelector('style[data-wechart-tokens]')) return;

  const style = doc.createElement('style');
  style.dataset['wechartTokens'] = '';
  style.textContent = `${themeCss()}\n${SHELL_CSS}`;
  doc.head.append(style);
}
