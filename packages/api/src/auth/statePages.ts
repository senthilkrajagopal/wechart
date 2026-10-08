import { themeCss } from '@wechart/ui';

/**
 * wechart's own pages for the end of a sign-in (T697; design 09, states C and D;
 * direction.md rule 60): the product mark, one sentence and one action, with
 * nothing of wechart behind them.
 *
 * Served by the API, whole, because the web server hands the app's bundle
 * only to the signed-in (AC-251): someone just signed out, or refused, would
 * get sign-in again for the bundle, not the page. So each is plain HTML in the
 * tokens of `@wechart/ui`, the stylesheet's own source, in the viewer's theme.
 */

/** HTML's five characters escaped: text from a provider is never markup. */
const escape = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Design 09's `.state-page`, `.state-card` and `.brand-mark.lg`, in the tokens. */
const STYLE = `
${themeCss()}
:root { color-scheme: light; }
:root[data-theme='dark'] { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
  background: var(--wc-bg-page); color: var(--wc-text-primary);
  font: 400 var(--wc-text-sm-size)/var(--wc-text-sm-line) Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
}
.state-card { display: grid; justify-items: center; gap: 12px; text-align: center; max-width: 420px; padding: 24px; }
.brand-mark {
  width: 36px; height: 36px; display: grid; place-items: center; border-radius: 8px;
  background: var(--wc-accent); color: var(--wc-text-on-accent); font-size: 16px; font-weight: 600;
}
.state-card__title { margin: 0; font-size: var(--wc-text-md-size); line-height: var(--wc-text-md-line); font-weight: 600; }
.state-card p { margin: 0; color: var(--wc-text-secondary); }
.state-card__details {
  width: 100%; text-align: left; border: 1px solid var(--wc-border-subtle); border-radius: 6px;
  background: var(--wc-bg-surface);
}
.state-card__details summary {
  padding: 8px 12px; font-size: var(--wc-text-xs-size); line-height: var(--wc-text-xs-line);
  font-weight: 600; color: var(--wc-text-secondary); cursor: pointer;
}
.state-card__code {
  margin: 0 12px 12px; padding: 6px 8px; border-radius: 4px; background: var(--wc-bg-subtle);
  font: 400 12px/18px 'IBM Plex Mono', ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere;
}
.btn {
  display: inline-flex; align-items: center; height: 32px; padding: 0 12px; border-radius: 6px;
  border: 1px solid var(--wc-border-strong); background: var(--wc-bg-surface); color: var(--wc-text-primary);
  font: inherit; text-decoration: none; cursor: pointer;
}
.btn-primary { border-color: var(--wc-accent); background: var(--wc-accent); color: var(--wc-text-on-accent); font-weight: 600; }
.btn:focus-visible { outline: 2px solid var(--wc-accent); outline-offset: 2px; }
`;

/** The viewer's theme as the app keeps it (`wechart.theme`), else their system's. */
const THEME = `
try {
  var stored = localStorage.getItem('wechart.theme');
  var dark = stored === 'dark' || (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
} catch (error) {}
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · wechart</title>
<script>${THEME}</script>
<style>${STYLE}</style>
</head>
<body>
<main class="state-card">
<span class="brand-mark" aria-hidden="true">we</span>
<h1 class="state-card__title">${escape(title)}</h1>
${body}
</main>
</body>
</html>`;
}

/** State C: signed out of wechart. */
export function signedOutPage(): string {
  return page(
    'You’ve signed out of wechart.',
    '<a class="btn btn-primary" href="/api/auth/login">Sign in again</a>',
  );
}

/** State D: the sign-in failed, the provider's words only in Details. */
export function signInFailedPage(detail: string, returnTo: string): string {
  const again = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  return page(
    'wechart couldn’t sign you in.',
    [
      detail === ''
        ? ''
        : `<details class="state-card__details"><summary>Details</summary><pre class="state-card__code">${escape(detail)}</pre></details>`,
      `<a class="btn btn-primary" href="${escape(again)}">Try again</a>`,
    ].join('\n'),
  );
}
