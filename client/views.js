import { el, html, raw, fromHtml, statusClass, storage, store, toast, icons } from './util.js';
import { createDiagram, renderInlineMermaid } from './diagram.js';
import { createRelMap } from './relmap.js';
import { markerPrompt, issuePrompt, allMarkersPrompt, allIssuesPrompt, copyText } from './prompts.js';

const flowById = (map, id) => map.flows.find((f) => f.id === id);
const allFeatures = (map) => (map.featureMap?.areas || []).flatMap((a) => a.features);
const featureById = (map, id) => allFeatures(map).find((f) => f.id === id);

function statusBadge(status) {
  const cls = statusClass(status);
  return html`<span class="badge ${cls}" title="Status">${cls === 'unknown' ? `status: ${status}` : status}</span>`;
}

function markerBadges(item) {
  const out = [];
  if (item.unclear) out.push(html`<span class="badge unclear" title="Behavior unclear markers">⚠️ ${item.unclear} unclear</span>`);
  if (item.disagree) out.push(html`<span class="badge disagree" title="UI and code disagree markers">⚠️ ${item.disagree} UI/code</span>`);
  return out;
}

function scrollToAnchor(container, anchor, highlightSel = null) {
  if (!anchor) return;
  const target = container.querySelector(`#${CSS.escape(anchor)}`);
  if (!target) return;
  requestAnimationFrame(() => {
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (highlightSel) {
      target.classList.add(highlightSel);
      setTimeout(() => target.classList.remove(highlightSel), 1800);
    }
  });
}

/* ---------- Overview ---------- */
export function renderOverview(map, report, anchor) {
  const view = el('div', { class: 'view' });
  const errors = report?.errors ?? 0;
  const warnings = report?.warnings ?? 0;
  const problemClass = errors ? 'err' : warnings ? 'warn' : 'ok';
  view.append(
    fromHtml(html`
      <div class="eyebrow"><span>Overview</span><span class="file"><a href="/raw/README.md" target="_blank" rel="noopener" title="Open the Markdown source">README.md</a></span></div>
      <div class="stats">
        <a class="stat" href="#/features"><div class="n">${map.counts.features}</div><div class="l">Features in ${map.featureMap?.areas?.length ?? 0} areas</div></a>
        <a class="stat" href="#/flows"><div class="n">${map.counts.flows}</div><div class="l">Product flows</div></a>
        <a class="stat ${map.counts.unclear || map.counts.disagree ? 'warn' : ''}" href="#/review/markers"><div class="n">${map.counts.unclear + map.counts.disagree}</div><div class="l">Open questions</div></a>
        <a class="stat ${problemClass}" href="#/review"><div class="n">${errors + warnings}</div><div class="l">${errors ? `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}` : warnings ? 'Validation warnings' : 'Validation clean'}</div></a>
      </div>
    `),
  );
  const prose = el('article', { class: 'prose' });
  prose.append(fromHtml(map.readme?.html || '<p><em>No README.md in the Product Map folder.</em></p>'));
  view.append(prose);
  view.afterMount = async () => {
    await renderInlineMermaid(prose);
    scrollToAnchor(prose, anchor);
  };
  return view;
}

/* ---------- Feature Map ---------- */
export function renderFeatures(map, anchor, { mode: forcedMode } = {}) {
  const view = el('div', { class: 'view' });
  const fm = map.featureMap;
  let mode = forcedMode || storage('pm-features-mode', 'cards');
  const setMode = (m) => {
    mode = m;
    store('pm-features-mode', m);
    body.firstChild?.destroy?.();
    body.innerHTML = '';
    body.append(mode === 'map' ? buildMap() : buildCards());
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    if (mode === 'map') requestAnimationFrame(() => body.firstChild.draw());
  };
  const seg = el('div', { class: 'seg', role: 'tablist' }, [
    el('button', { type: 'button', 'data-mode': 'cards', onclick: () => setMode('cards') }, 'Cards'),
    el('button', { type: 'button', 'data-mode': 'map', onclick: () => setMode('map') }, 'Map'),
  ]);
  view.append(
    fromHtml(html`
      <div class="eyebrow"><span>Feature Map</span><span class="file"><a href="/raw/features.md" target="_blank" rel="noopener" title="Open the Markdown source">features.md</a></span></div>
      <h1 class="title">${fm?.title && fm.title !== 'Feature Map' ? fm.title : 'What the product can do'}</h1>
    `),
  );
  if (fm?.introHtml) {
    const lead = el('div', { class: 'lead' });
    lead.append(fromHtml(fm.introHtml));
    view.append(lead);
  }
  const toolbar = el('div', { class: 'toolbar' }, [seg, el('span', { class: 'spacer' })]);
  toolbar.append(el('span', { class: 'hint' }, `${map.counts.features} features · ${fm?.areas?.length ?? 0} areas · ${map.counts.flows} flows`));
  view.append(toolbar);
  const body = el('div');
  view.append(body);

  function buildCards() {
    const wrap = el('div');
    if (!fm || !fm.areas.length) {
      wrap.append(fromHtml(html`<div class="all-good">No features found. Expected <code>## Area</code> headings with <code>### Feature</code> entries in features.md.</div>`));
      return wrap;
    }
    for (const area of fm.areas) {
      const sec = el('section', { class: 'area', id: area.slug });
      sec.append(
        fromHtml(html`<div class="area-head"><h2>${area.name}</h2><span class="count">${area.features.length} feature${area.features.length === 1 ? '' : 's'}</span></div>`),
      );
      if (area.descriptionHtml) {
        const d = el('div', { class: 'area-desc' });
        d.append(fromHtml(area.descriptionHtml));
        sec.append(d);
      }
      const cards = el('div', { class: 'cards' });
      for (const f of area.features) cards.append(featureCard(map, f));
      sec.append(cards);
      wrap.append(sec);
    }
    return wrap;
  }
  function buildMap() {
    return createRelMap(map);
  }
  setMode(mode);
  view.afterMount = async () => {
    if (mode === 'map') body.firstChild.draw();
    if (anchor) {
      if (mode !== 'cards') setMode('cards');
      scrollToAnchor(view, anchor, 'target');
    }
    await renderInlineMermaid(body);
  };
  view.cleanup = () => body.firstChild?.destroy?.();
  return view;
}

function featureCard(map, f) {
  const card = el('article', { class: 'card', id: f.slug, 'data-id': f.id || '' });
  const flows = f.flows.map((fl) => {
    const exists = fl.id && flowById(map, fl.id);
    return html`<a href="${fl.href}" class="${exists ? '' : 'missing'}" title="${exists ? 'Open flow' : 'This flow file does not exist'}">${fl.title}</a>`;
  });
  // flows that list this feature in frontmatter but are not linked from the card
  for (const u of f.usedBy || []) {
    if (!f.flows.some((fl) => fl.id === u.id)) flows.push(html`<a href="#/flows/${u.id}" title="Listed in the flow's frontmatter">${u.title}</a>`);
  }
  card.append(
    fromHtml(html`
      <div class="card-main">
        <div class="card-top">
          <h3>${f.name}</h3>
          ${statusBadge(f.status)}
        </div>
        ${f.id ? html`<div class="id">${f.id}</div>` : html`<div class="id" style="color: var(--err)">missing **ID:** line</div>`}
        ${f.descriptionHtml ? html`<p class="desc">${raw(f.descriptionHtml)}</p>` : ''}
        ${f.bodyHtml ? html`<div class="bodyhtml">${raw(f.bodyHtml)}</div>` : ''}
        ${f.unclear || f.disagree ? html`<div class="markers">${markerBadges(f)}</div>` : ''}
      </div>
      <div class="card-meta">
        ${f.entryHtml ? html`<div class="row"><span class="k">Entry</span><span class="v">${raw(f.entryHtml)}</span></div>` : ''}
        ${f.extra.map((x) => html`<div class="row"><span class="k">${x.label}</span><span class="v">${raw(x.html)}</span></div>`)}
        ${flows.length ? html`<div class="row"><span class="k">Flows</span><span class="v flows">${flows}</span></div>` : ''}
        ${f.implementation.length ? html`<div class="row"><span class="k">Code</span><span class="v impl">${f.implementation.map((i) => html`<code>${i.replace(/^`|`$/g, '')}</code>`)}</span></div>` : ''}
      </div>
    `),
  );
  return card;
}

/* ---------- Flows index ---------- */
export function renderFlowsIndex(map) {
  const view = el('div', { class: 'view' });
  view.append(fromHtml(html`<div class="eyebrow"><span>Product Flows</span><span class="file">flows/</span></div><h1 class="title">How the product behaves</h1>`));
  if (!map.flows.length) {
    view.append(fromHtml(html`<div class="all-good">No flows yet. Each flow is one Markdown file in <code>flows/</code> with a Mermaid flowchart.</div>`));
    return view;
  }
  const cards = el('div', { class: 'cards', style: 'margin-top: 20px' });
  for (const fl of map.flows) {
    const feats = fl.features.map((id) => {
      const f = featureById(map, id);
      return f ? html`<a href="#/features/${f.slug}">${f.name}</a>` : html`<a class="missing" title="Unknown feature id">${id}</a>`;
    });
    const card = el('article', { class: 'card' });
    card.append(
      fromHtml(html`
        <div class="card-top"><h3><a href="#/flows/${fl.id}">${fl.title}</a></h3>${statusBadge(fl.status)}</div>
        <div class="id">${fl.file}</div>
        <div class="desc">${raw(fl.goalHtml)}</div>
        ${feats.length ? html`<div class="row"><span class="k">Uses</span><span class="v flows">${feats}</span></div>` : ''}
        ${fl.unclear || fl.disagree ? html`<div class="markers">${markerBadges(fl)}</div>` : ''}
      `),
    );
    cards.append(card);
  }
  view.append(cards);
  return view;
}

/* ---------- Flow page ---------- */
export function renderFlow(map, id, anchor) {
  const fl = flowById(map, id);
  const view = el('div', { class: 'view' });
  if (!fl) {
    view.append(fromHtml(html`<div class="empty-state"><h1>Flow not found</h1><p>There is no <code>flows/${id}.md</code> in this Product Map.</p><p><a href="#/flows">All flows</a></p></div>`));
    return view;
  }
  const feats = fl.features.map((fid) => {
    const f = featureById(map, fid);
    return f
      ? html`<a class="chip" href="#/features/${f.slug}" title="${f.area}"><span class="dot ${statusClass(f.status)}"></span>${f.name}</a>`
      : html`<span class="chip missing" title="Not defined in features.md">${fid}</span>`;
  });
  view.append(
    fromHtml(html`
      <div class="eyebrow"><span>Flow</span><span class="file"><a href="/raw/${fl.file}" target="_blank" rel="noopener" title="Open the Markdown source">${fl.file}</a></span></div>
      <div class="page-head">
        <div>
          <h1 class="title">${fl.title}</h1>
          <div class="meta">${statusBadge(fl.status)}${markerBadges(fl)}${feats}</div>
        </div>
      </div>
    `),
  );
  if (fl.goalHtml) {
    const lead = el('div', { class: 'lead' });
    lead.append(fromHtml(fl.goalHtml));
    view.append(lead);
  }
  // Behavior detail headings (#### Node label) that the diagram can jump to
  const sectionsEl = el('div', { class: 'flow-sections' });
  for (const s of fl.sections) {
    const sec = el('section', { class: 'section prose', id: s.slug });
    sec.append(fromHtml(html`<h2>${s.title}</h2>`));
    sec.append(fromHtml(s.html));
    sectionsEl.append(sec);
  }
  const headingIndex = new Map();
  for (const h of sectionsEl.querySelectorAll('h4[data-heading]')) {
    headingIndex.set(norm(h.dataset.heading), h);
  }
  const diagram = createDiagram(fl.diagram, {
    isLinked: (label) => headingIndex.has(norm(label)),
    onNode: (label) => {
      const h = headingIndex.get(norm(label));
      if (h) {
        h.scrollIntoView({ block: 'center', behavior: 'smooth' });
        h.classList.remove('hit');
        void h.offsetWidth;
        h.classList.add('hit');
      } else toast('No behavior details for this node');
    },
  });
  view.append(diagram);
  if (fl.flowExtraHtml) {
    const extra = el('div', { class: 'prose' });
    extra.append(fromHtml(fl.flowExtraHtml));
    view.append(extra);
  }
  view.append(sectionsEl);

  // prev / next
  const idx = map.flows.indexOf(fl);
  const prev = map.flows[idx - 1];
  const next = map.flows[idx + 1];
  if (prev || next) {
    view.append(
      fromHtml(html`<nav class="pager">
        ${prev ? html`<a href="#/flows/${prev.id}"><span class="k">Previous flow</span><span>${prev.title}</span></a>` : ''}
        ${next ? html`<a class="next" href="#/flows/${next.id}"><span class="k">Next flow</span><span>${next.title}</span></a>` : ''}
      </nav>`),
    );
  }
  view.afterMount = async () => {
    if (diagram.render) await diagram.render();
    await renderInlineMermaid(sectionsEl);
    scrollToAnchor(view, anchor, 'hit');
  };
  view.cleanup = () => diagram.destroy?.();
  return view;
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

/* ---------- Review ---------- */
export function renderReview(map, report, tab = 'validation') {
  const view = el('div', { class: 'view' });
  const items = report?.items ?? [];
  const errors = items.filter((i) => i.level === 'error');
  const warnings = items.filter((i) => i.level === 'warning');
  const infos = items.filter((i) => i.level === 'info');
  const markers = map.markers || [];
  view.append(
    fromHtml(html`
      <div class="eyebrow"><span>Review</span></div>
      <h1 class="title">Is the map in good shape?</h1>
      <div class="toolbar">
        <div class="seg" role="tablist">
          <a href="#/review" class="${tab === 'validation' ? 'on' : ''}" role="tab" aria-selected="${tab === 'validation'}">Validation <span class="pill ${errors.length ? 'err' : warnings.length ? 'warn' : 'ok'}">${errors.length + warnings.length}</span></a>
          <a href="#/review/markers" class="${tab === 'markers' ? 'on' : ''}" role="tab" aria-selected="${tab === 'markers'}">Open questions <span class="pill ${markers.length ? 'warn' : 'ok'}">${markers.length}</span></a>
        </div>
      </div>
    `),
  );
  if (tab === 'markers') {
    const g = el('div', { class: 'review-group' });
    if (!markers.length) g.append(fromHtml(html`<div class="all-good">No ⚠️ markers. Every documented behavior was determined with confidence.</div>`));
    else {
      g.append(
        fromHtml(html`<p class="lead" style="font-size:15px">Places where the map says the behavior could not be determined, or where the UI and the code disagree. Each one is a question for the team, and often a real bug.</p>`),
      );
      const sel = selection((items) => (items.length === 1 ? markerPrompt(map, items[0]) : allMarkersPrompt(map, items)));
      g.append(sel.bar);
      const list = el('div', { class: 'issue-list' });
      for (const m of markers) {
        const card = el('div', { class: 'issue marker' });
        sel.register(card, m);
        card.append(
          fromHtml(html`<div class="loc"><span class="badge ${m.kind}">${m.kind === 'unclear' ? 'Behavior unclear' : 'UI and code disagree'}</span> &nbsp;<a href="${fileRoute(m.file)}">${m.file}</a>:${m.line}</div>
            <div class="mtext">${m.text.replace(/^[-*]\s+/, '')}</div>`),
        );
        card.append(copyButton('Copy fix prompt', () => markerPrompt(map, m)));
        list.append(card);
      }
      g.append(list);
    }
    view.append(g);
    return view;
  }
  const sel = selection((items) => (items.length === 1 ? issuePrompt(map, items[0]) : allIssuesPrompt(map, items)));
  const group = (title, list, cls) => {
    const g = el('div', { class: 'review-group' });
    g.append(fromHtml(html`<h2>${title} <span class="pill ${list.length ? cls : ''}">${list.length}</span></h2>`));
    if (!list.length) {
      g.append(fromHtml(html`<div class="all-good">None.</div>`));
    } else {
      const ul = el('div', { class: 'issue-list' });
      for (const it of list) {
        const card = el('div', { class: `issue ${it.level}` });
        if (it.level !== 'info') sel.register(card, it);
        card.append(
          fromHtml(html`<div><div class="loc"><span class="badge ${it.level}">${it.level}</span> &nbsp;<a href="${fileRoute(it.path)}">${it.path}</a>${it.line ? `:${it.line}` : ''}</div><div class="msg">${it.message}</div></div>`),
        );
        if (it.level !== 'info') card.append(copyButton('Copy fix prompt', () => issuePrompt(map, it)));
        ul.append(card);
      }
      g.append(ul);
    }
    return g;
  };
  if (!items.length) view.append(fromHtml(html`<div class="all-good">Nothing to report.</div>`));
  if (errors.length + warnings.length) view.append(sel.bar);
  view.append(group('Errors', errors, 'err'), group('Warnings', warnings, 'warn'), group('Info', infos, 'info'));
  view.append(
    fromHtml(html`<p class="hint" style="color: var(--text-3); font-size: 12.5px">Same checks as <code>product-map validate</code>. Run it in CI to keep the map honest.</p>`),
  );
  return view;
}

/**
 * Multi-select for issue cards. Returns { bar, register(card, item) }.
 * The bar keeps its height so the button appearing does not shift the list.
 */
function selection(makePrompt) {
  const selected = new Map();
  const bar = el('div', { class: 'review-actions' });
  const clear = el('button', { type: 'button', class: 'link-btn', onclick: () => clearAll() }, 'Clear');
  const copy = copyButton('Copy prompt for selected', () => makePrompt([...selected.values()]), { small: false });
  bar.append(clear, copy);
  const dots = new Set();
  const update = () => {
    const n = selected.size;
    bar.classList.toggle('has-selection', n > 0);
    copy.querySelector('span').textContent = n === 1 ? 'Copy prompt for selected' : `Copy one prompt for ${n} selected`;
  };
  const clearAll = () => {
    selected.clear();
    for (const { dot, card } of dots) {
      dot.setAttribute('aria-checked', 'false');
      card.classList.remove('selected');
    }
    update();
  };
  const register = (card, item) => {
    const dot = el('button', { type: 'button', class: 'select-dot', role: 'checkbox', 'aria-checked': 'false', title: 'Select to build one prompt for several items' });
    dot.addEventListener('click', () => {
      const on = !selected.has(item);
      if (on) selected.set(item, item);
      else selected.delete(item);
      dot.setAttribute('aria-checked', String(on));
      card.classList.toggle('selected', on);
      update();
    });
    dots.add({ dot, card });
    card.prepend(dot);
  };
  update();
  return { bar, register };
}

function copyButton(label, getText, { small = true } = {}) {
  const b = el('button', { type: 'button', class: `copy-btn ${small ? 'small' : ''}`, title: 'Copy a prompt you can paste to your coding agent' });
  b.append(fromHtml(icons.copy));
  const span = el('span', {}, label);
  b.append(span);
  b.addEventListener('click', async () => {
    const ok = await copyText(getText());
    span.textContent = ok ? 'Copied' : 'Copy failed';
    b.classList.toggle('done', ok);
    toast(ok ? 'Prompt copied. Paste it to your coding agent.' : 'Could not copy to the clipboard');
    setTimeout(() => {
      span.textContent = label;
      b.classList.remove('done');
    }, 1600);
  });
  return b;
}

function fileRoute(file) {
  if (file === 'README.md') return '#/overview';
  if (file === 'features.md') return '#/features';
  const m = /^flows\/(.+)\.md$/.exec(file);
  if (m) return `#/flows/${m[1]}`;
  return '#/review';
}

/* ---------- Empty state ---------- */
export function renderEmpty(map) {
  const view = el('div', { class: 'view' });
  view.append(
    fromHtml(html`
      <div class="empty-state">
        <div class="eyebrow">Product Map</div>
        <h1>No Product Map here yet</h1>
        <p>Looking for <code>README.md</code>, <code>features.md</code> and <code>flows/*.md</code> in:</p>
        <pre><code>${map.root}</code></pre>
        <p>A Product Map is a sitemap for what your software <em>does</em>: a Feature Map of capabilities and one Mermaid flow per major user goal, kept in the repo next to the code. The quickest way to get one is to let a coding agent write it with the <strong>product-map</strong> skill:</p>
        <ol class="steps">
          <li>Install the skill: <code>claude plugins install nuthinking-skills</code> or <code>npx skills@latest add nuthinking/skills</code></li>
          <li>Ask your agent: <em>“Map this product.”</em></li>
          <li>Keep this page open. It reloads as soon as the files appear.</li>
        </ol>
        <p>Pointing at a different folder? Run <code>product-map serve path/to/product</code>.</p>
      </div>
    `),
  );
  return view;
}
