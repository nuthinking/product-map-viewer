import { html, fromHtml, raw, icons, statusClass, storage, store, toast, debounce } from './util.js';
import { initMermaid, isDark } from './diagram.js';
import { renderOverview, renderFeatures, renderFlowsIndex, renderFlow, renderReview, renderEmpty } from './views.js';
import Fuse from '/vendor/fuse/fuse.min.mjs';

const state = { map: null, report: null, query: '', route: null, live: false, fuse: null };

/* ---------- Search index (Fuse.js, fuzzy) ---------- */
function buildIndex(map) {
  const docs = [];
  for (const area of map.featureMap?.areas || []) {
    for (const f of area.features) docs.push({ kind: 'feature', key: f.slug, name: f.name, id: f.id || '', text: f.description || '', area: area.name, entry: f.entry || '' });
  }
  for (const fl of map.flows) docs.push({ kind: 'flow', key: fl.id, name: fl.title, id: fl.id, text: fl.features.join(' '), area: '', entry: '' });
  state.fuse = new Fuse(docs, {
    keys: [
      { name: 'name', weight: 3 },
      { name: 'id', weight: 2 },
      { name: 'area', weight: 1 },
      { name: 'entry', weight: 0.8 },
      { name: 'text', weight: 0.6 },
    ],
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });
}

/** Returns null when there is no query, else { features: Set<slug>, flows: Set<id>, best } ordered by score. */
function searchHits(q) {
  q = q.trim();
  if (!q || !state.fuse) return null;
  const results = state.fuse.search(q);
  const hits = { features: new Set(), flows: new Set(), best: results[0]?.item || null };
  for (const r of results) (r.item.kind === 'feature' ? hits.features : hits.flows).add(r.item.key);
  return hits;
}
const sidebar = document.getElementById('sidebar');
const main = document.getElementById('main');

/* ---------- Data ---------- */
async function load() {
  const [map, report] = await Promise.all([fetch('/api/map').then((r) => r.json()), fetch('/api/validate').then((r) => r.json())]);
  state.map = map;
  state.report = report;
  buildIndex(map);
  document.title = `${map.name || 'Product Map'} · Product Map`;
  applyFavicon(map);
}

/* ---------- Router ---------- */
function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c] = parts;
  if (!a || a === 'overview') return { name: 'overview', anchor: b };
  if (a === 'features') return { name: 'features', anchor: b };
  if (a === 'flows' && b) return { name: 'flow', id: b, anchor: c };
  if (a === 'flows') return { name: 'flows' };
  if (a === 'review') return { name: 'review', tab: b === 'markers' ? 'markers' : 'validation' };
  return { name: 'overview' };
}

const hasMap = () => state.map && (state.map.readme || state.map.featureMap || state.map.flows.length);

async function render({ keepScroll = false } = {}) {
  const route = parseRoute();
  state.route = route;
  const scrollTop = main.scrollTop;
  let view;
  if (!hasMap()) view = renderEmpty(state.map);
  else if (route.name === 'overview') view = renderOverview(state.map, state.report, route.anchor);
  else if (route.name === 'features') view = renderFeatures(state.map, route.anchor);
  else if (route.name === 'flows') view = renderFlowsIndex(state.map);
  else if (route.name === 'flow') view = renderFlow(state.map, route.id, route.anchor);
  else if (route.name === 'review') view = renderReview(state.map, state.report, route.tab);
  main.firstChild?.cleanup?.();
  main.innerHTML = '';
  main.append(view);
  if (keepScroll) main.scrollTop = scrollTop;
  else if (!route.anchor) main.scrollTop = 0;
  if (view.afterMount) await view.afterMount();
  renderSidebar();
}

/* ---------- Sidebar ---------- */
function renderSidebar() {
  const map = state.map;
  const r = state.route || {};
  const q = state.query.trim();
  const hits = searchHits(q);
  const errors = state.report?.errors ?? 0;
  const warnings = state.report?.warnings ?? 0;
  const markers = map?.markers?.length ?? 0;
  const reviewPill = errors
    ? html`<span class="pill err">${errors}</span>`
    : warnings
      ? html`<span class="pill warn">${warnings}</span>`
      : markers
        ? html`<span class="pill">${markers}</span>`
        : html`<span class="pill ok">✓</span>`;

  // Areas are plain jump links; individual features only show up as search results.
  const areas = hits
    ? (map?.featureMap?.areas || []).flatMap((area) =>
        area.features
          .filter((f) => hits.features.has(f.slug))
          .map(
            (f) => html`<a href="#/features/${f.slug}" class="${r.name === 'features' && r.anchor === f.slug ? 'active' : ''}" title="${area.name}"><span class="dot ${statusClass(f.status)}"></span><span class="label">${f.name}</span>${f.unclear || f.disagree ? html`<span class="pill warn" title="Has ⚠️ markers">⚠</span>` : ''}</a>`,
          ),
      )
    : (map?.featureMap?.areas || []).map(
        (area, i) => html`<a href="#/features/${area.slug}" class="${r.name === 'features' && (r.anchor === area.slug || (!r.anchor && i === 0)) ? 'active' : ''}"><span class="label">${area.name}</span><span class="count">${area.features.length}</span></a>`,
      );
  const flows = hits ? (map?.flows || []).filter((f) => hits.flows.has(f.id)) : map?.flows || [];

  sidebar.innerHTML = '';
  sidebar.append(
    fromHtml(html`
      <a class="brand" href="#/" title="Overview">
        ${map?.icon
          ? html`<img class="logo" src="${map.icon}" alt="" title="${map.iconFile}" />`
          : raw(LOGO_SVG)}
        <div style="min-width:0"><div class="name">${map?.name || 'Product Map'}</div><div class="sub">Product Map</div></div>
      </a>
      <div class="search"><input type="search" id="search" placeholder="Search the map" aria-label="Search" value="${state.query}" /><kbd class="search-kbd" aria-hidden="true">${IS_MAC ? '⌘K' : 'Ctrl K'}</kbd></div>
      <nav class="nav">
        <div class="nav-group">
          <a href="#/" class="${r.name === 'overview' ? 'active' : ''}"><span class="label">Overview</span></a>
          <a href="#/review" class="${r.name === 'review' ? 'active' : ''}"><span class="label">Review</span>${reviewPill}</a>
        </div>
        <div class="nav-group">
          <div class="nav-head"><span>Feature Map</span><span class="count">${map?.counts?.features ?? 0}</span></div>
          ${areas.length ? areas : html`<div class="empty">${q ? 'No matching features' : 'No features yet'}</div>`}
        </div>
        <div class="nav-group">
          <div class="nav-head"><a href="#/flows" style="padding:0;color:inherit;font:inherit">Flows</a><span class="count">${map?.counts?.flows ?? 0}</span></div>
          <a href="#/flows" class="${r.name === 'flows' ? 'active' : ''}"><span class="label">All flows</span></a>
          ${flows.length
            ? flows.map(
                (f) => html`<a href="#/flows/${f.id}" class="${r.name === 'flow' && r.id === f.id ? 'active' : ''}"><span class="dot ${statusClass(f.status)}"></span><span class="label">${f.title}</span>${f.unclear || f.disagree ? html`<span class="pill warn" title="Has ⚠️ markers">⚠</span>` : ''}</a>`,
              )
            : html`<div class="empty">${q ? 'No matching flows' : 'No flows yet'}</div>`}
        </div>
      </nav>
      <div class="side-foot">
        <div class="live ${state.live ? 'on' : ''}" title="${state.live ? 'Watching the folder for changes' : 'Live reload disconnected'}"><span class="dot"></span><span class="path" title="${map?.root || ''}">${shortPath(map?.root)}</span></div>
        <div class="theme-menu" id="theme-menu">
          <button type="button" class="icon-btn" id="theme" title="Theme: ${themeLabel()}" aria-haspopup="menu" aria-expanded="false">${raw(themeIcon())}</button>
          <div class="menu" role="menu" hidden>
            ${THEMES.map((t) => html`<button type="button" role="menuitemradio" aria-checked="${themePref() === t.id}" data-theme="${t.id}">${raw(t.icon)}<span>${t.label}</span></button>`)}
          </div>
        </div>
      </div>
    `),
  );
  const input = sidebar.querySelector('#search');
  input.addEventListener(
    'input',
    debounce(() => {
      state.query = input.value;
      const pos = input.selectionStart;
      renderSidebar();
      const again = sidebar.querySelector('#search');
      again.focus();
      again.setSelectionRange(pos, pos);
    }, 80),
  );
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      state.query = '';
      renderSidebar();
    }
    if (e.key === 'Enter') {
      const best = searchHits(input.value)?.best;
      if (best) location.hash = best.kind === 'feature' ? `#/features/${best.key}` : `#/flows/${best.key}`;
    }
  });
  const themeMenu = sidebar.querySelector('#theme-menu');
  const themeBtn = themeMenu.querySelector('#theme');
  const menu = themeMenu.querySelector('.menu');
  const closeMenu = () => {
    menu.hidden = true;
    themeBtn.setAttribute('aria-expanded', 'false');
  };
  themeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    themeBtn.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) {
      menu.querySelector('[aria-checked="true"]')?.focus();
      // Close on the next click anywhere else; registered only while the menu is open.
      document.addEventListener('click', closeMenu, { once: true });
    }
  });
  menu.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.theme)));
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
      themeBtn.focus();
    }
  });
  const active = sidebar.querySelector('a.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

const LOGO_SVG =
  '<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="var(--accent)"/><circle cx="10" cy="10" r="3.2" fill="var(--surface)"/><circle cx="22" cy="16" r="3.2" fill="var(--surface)"/><circle cx="11" cy="23" r="3.2" fill="var(--surface)"/><path d="M12.5 11.5 19.5 14.5M19.5 17.5 13.5 21.5" stroke="var(--surface)" stroke-width="2" stroke-linecap="round"/></svg>';

/** Use the product's own icon as the tab favicon when the server found one. */
function applyFavicon(map) {
  const link = document.querySelector('link[rel="icon"]');
  if (!link) return;
  if (!link.dataset.default) link.dataset.default = link.href;
  link.href = map?.icon || link.dataset.default;
}

const IS_MAC = /mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '');

const shortPath = (p) => {
  if (!p) return '';
  const parts = p.split('/').filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : p;
};

/* ---------- Theme ---------- */
// Preference lives in localStorage under the viewer's origin, so every repo served on the
// same local URL shares it. "system" follows the OS setting and is the default.
const THEMES = [
  { id: 'system', label: 'System', icon: icons.auto },
  { id: 'light', label: 'Light', icon: icons.sun },
  { id: 'dark', label: 'Dark', icon: icons.moon },
];
const themePref = () => {
  const v = storage('pm-theme-mode', 'system');
  return v === 'light' || v === 'dark' ? v : 'system';
};
const themeLabel = () => THEMES.find((t) => t.id === themePref()).label;
const themeIcon = () => (themePref() === 'system' ? icons.auto : isDark() ? icons.moon : icons.sun);
function setTheme(mode) {
  if (mode === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
  store('pm-theme-mode', mode);
  initMermaid();
  render({ keepScroll: true });
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (themePref() === 'system') {
    initMermaid();
    render({ keepScroll: true });
  }
});
// A change made in another tab (or another repo's viewer on the same origin) applies here too.
window.addEventListener('storage', (e) => {
  if (e.key === 'pm-theme-mode') setTheme(themePref());
});

/* ---------- Live reload ---------- */
function connectLive() {
  const es = new EventSource('/events');
  es.addEventListener('hello', () => {
    state.live = true;
    renderSidebar();
  });
  es.addEventListener('change', async () => {
    try {
      await load();
      await render({ keepScroll: true });
      toast('Product Map updated');
    } catch (e) {
      toast('Reload failed');
    }
  });
  es.onerror = () => {
    if (state.live) {
      state.live = false;
      renderSidebar();
    }
  };
}

/* ---------- Keyboard ---------- */
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
  if (!typing && (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'))) {
    e.preventDefault();
    const input = sidebar.querySelector('#search');
    input.focus();
    input.select();
  }
  if (!typing && state.route?.name === 'flow' && state.map && (e.key === '[' || e.key === ']')) {
    const idx = state.map.flows.findIndex((f) => f.id === state.route.id);
    const next = state.map.flows[idx + (e.key === ']' ? 1 : -1)];
    if (next) location.hash = `#/flows/${next.id}`;
  }
});

/* ---------- Boot ---------- */
window.addEventListener('hashchange', () => render());
(async () => {
  initMermaid();
  try {
    await load();
  } catch (e) {
    main.innerHTML = `<div class="view"><div class="empty-state"><h1>Could not load the Product Map</h1><p>${e.message}</p></div></div>`;
    return;
  }
  await render();
  connectLive();
})();
