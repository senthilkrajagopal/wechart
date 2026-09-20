/* wechart prototype: shared UI helpers (escaping, field icons, status icons). */
(function () {
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const typeGlyph = (f) =>
    f.role === 'measure'
      ? 'Σ'
      : f.type === 'time'
        ? '◷'
        : f.type === 'boolean'
          ? '◐'
          : f.type === 'number'
            ? '#'
            : 'Aa';
  const ficon = (f) =>
    `<span class="ficon ${f.role === 'measure' ? 'measure' : 'dim'}" aria-hidden="true">${typeGlyph(f)}</span>`;
  const STATUS_SVG = {
    ok: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.5 8.2l2.2 2.2 4.8-4.8" stroke="var(--bg-surface)" stroke-width="1.8" fill="none"/></svg>',
    warn: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l7 12.5H1z" fill="var(--warn-icon)"/><path d="M8 6v4M8 11.6v.4" stroke="#1f1f1e" stroke-width="1.6"/></svg>',
    err: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="var(--err-icon)"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#fff" stroke-width="1.8"/></svg>',
    run: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="26 12"/></svg>',
    idle: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.5V8l2.5 1.5" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>',
  };
  const status = (kind, label) =>
    `<span class="status ${kind}">${STATUS_SVG[kind]}${esc(label)}</span>`;
  window.UI = { esc, ficon, status, STATUS_SVG, typeGlyph };
})();
