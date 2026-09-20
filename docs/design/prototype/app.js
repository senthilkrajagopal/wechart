/* wechart prototype: shell, workspace navigation, theme toggle. */
(function () {
  const VIEWS = [
    { key: 'explore', label: 'Explore', mod: () => window.EXPLORE, cls: 'view browser' },
    { key: 'model', label: 'Model', mod: () => window.MODEL, cls: 'view model' },
    { key: 'sources', label: 'Data sources', mod: () => window.ADMIN.sources, cls: 'view admin' },
    { key: 'jobs', label: 'Jobs', mod: () => window.ADMIN.jobs, cls: 'view admin' },
    { key: 'schedules', label: 'Schedules', mod: () => window.ADMIN.schedules, cls: 'view admin' },
    { key: 'security', label: 'Security', mod: () => window.ADMIN.security, cls: 'view admin' },
  ];
  const host = document.getElementById('views');
  const nav = document.getElementById('wsnav');
  const els = {};
  let current = null;

  VIEWS.forEach((v) => {
    const el = document.createElement('section');
    el.className = v.cls;
    el.dataset.view = v.key;
    el.setAttribute('aria-label', v.label);
    host.appendChild(el);
    els[v.key] = el;
  });
  nav.innerHTML = VIEWS.map((v) => `<button data-go="${v.key}">${v.label}</button>`).join('');
  host.style.height = '100%';

  const mounted = new Set();
  function go(key, opts = {}) {
    const v = VIEWS.find((x) => x.key === key) || VIEWS[0];
    const el = els[v.key],
      mod = v.mod();
    if (!mounted.has(v.key)) {
      el.className = v.cls;
      mod.mount(el);
      mounted.add(v.key);
    }
    Object.values(els).forEach((x) => x.classList.remove('active'));
    el.classList.add('active');
    if (opts.open && window.EXPLORE.open) window.EXPLORE.open(opts.open.kind, opts.open.id, opts);
    mod.render(el);
    el.classList.add('active');
    current = v.key;
    nav
      .querySelectorAll('button')
      .forEach((b) =>
        b.getAttribute('data-go') === v.key
          ? b.setAttribute('aria-current', 'page')
          : b.removeAttribute('aria-current'),
      );
    if (location.hash !== `#${v.key}`) history.replaceState(null, '', `#${v.key}`);
  }
  nav.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) go(b.dataset.go);
  });

  document.getElementById('themeBtn').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = root.dataset.theme
      ? root.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    go(current);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!document.documentElement.dataset.theme) go(current);
  });

  window.addEventListener('hashchange', () => {
    const k = location.hash.slice(1);
    if (k && k !== current) go(k);
  });
  window.APP = { go };
  go((location.hash || '#explore').slice(1));
})();
