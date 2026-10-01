// Mermaid rendering with pan, zoom, fit, fullscreen, source toggle and node click-through.
import { el, fromHtml, icons, toast } from './util.js';

let counter = 0;

const LIGHT = {
  background: '#ffffff',
  fontFamily: 'ui-sans-serif, -apple-system, "Segoe UI", Inter, Roboto, sans-serif',
  fontSize: '14px',
  primaryColor: '#f4f3ef',
  primaryTextColor: '#1c1b19',
  primaryBorderColor: '#b8b5ad',
  lineColor: '#6b6962',
  secondaryColor: '#e0f2fe',
  tertiaryColor: '#fef3c7',
  edgeLabelBackground: '#ffffff',
  clusterBkg: '#f6f5f2',
  clusterBorder: '#d3d0c8',
  titleColor: '#1c1b19',
};
const DARK = {
  background: '#1b1b19',
  fontFamily: LIGHT.fontFamily,
  fontSize: '14px',
  primaryColor: '#2a2a27',
  primaryTextColor: '#ebe9e4',
  primaryBorderColor: '#5c5a54',
  lineColor: '#9a978f',
  secondaryColor: '#0c2f47',
  tertiaryColor: '#3a2a08',
  edgeLabelBackground: '#1b1b19',
  clusterBkg: '#222220',
  clusterBorder: '#3a3a36',
  titleColor: '#ebe9e4',
};

export function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function initMermaid() {
  if (!window.mermaid) return;
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: isDark() ? DARK : LIGHT,
    flowchart: { htmlLabels: true, curve: 'basis', padding: 12, nodeSpacing: 40, rankSpacing: 50, useMaxWidth: false },
  });
}

export async function renderMermaid(code) {
  if (!window.mermaid) throw new Error('Mermaid failed to load');
  const id = `pm-mermaid-${++counter}`;
  const { svg } = await window.mermaid.render(id, code);
  return svg;
}

/**
 * Build the diagram component. Returns the root element; call .render() after it is attached.
 * onNode(label) is called when a node is clicked; return true to mark it as linked.
 */
export function createDiagram(code, { onNode = null, isLinked = null, height = null } = {}) {
  const root = el('div', { class: 'diagram' });
  if (!code) {
    root.append(el('div', { class: 'dg-empty' }, 'No Mermaid flowchart found in this flow.'));
    return root;
  }
  const bar = el('div', { class: 'dg-bar' });
  const viewport = el('div', { class: 'dg-viewport', role: 'img', 'aria-label': 'Flow diagram' });
  if (height) viewport.style.height = `${height}px`;
  const canvas = el('div', { class: 'dg-canvas' });
  viewport.append(canvas);
  const source = el('pre', { class: 'dg-source' }, el('code', {}, code));
  root.append(bar, viewport, source);

  const state = { scale: 1, x: 0, y: 0, w: 0, h: 0 };
  const apply = () => {
    canvas.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
  };
  // Give tall diagrams enough room to be read at (close to) natural size.
  const sizeViewport = () => {
    if (height || root.classList.contains('full') || !state.h) return;
    const natural = Math.round(state.h + 56);
    viewport.style.height = `${Math.min(1200, Math.max(360, natural))}px`;
  };
  const fit = () => {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (!state.w || !state.h || !vw || !vh) return;
    const pad = 28;
    const s = Math.min((vw - pad * 2) / state.w, (vh - pad * 2) / state.h, 1.2);
    state.scale = Math.max(0.1, s);
    state.x = (vw - state.w * state.scale) / 2;
    state.y = (vh - state.h * state.scale) / 2;
    apply();
  };
  const zoomAt = (factor, cx, cy) => {
    const ns = Math.min(5, Math.max(0.15, state.scale * factor));
    const k = ns / state.scale;
    state.x = cx - (cx - state.x) * k;
    state.y = cy - (cy - state.y) * k;
    state.scale = ns;
    apply();
  };
  const center = () => [viewport.clientWidth / 2, viewport.clientHeight / 2];

  // Toolbar
  const btn = (icon, title, onclick, label = '') => {
    const b = el('button', { type: 'button', title, 'aria-label': title, onclick });
    b.append(fromHtml(icon));
    if (label) b.append(el('span', {}, label));
    return b;
  };
  const srcBtn = btn(icons.code, 'Show Mermaid source', () => {
    root.classList.toggle('show-source');
    srcBtn.classList.toggle('on', root.classList.contains('show-source'));
  }, 'Source');
  const fullBtn = btn(icons.expand, 'Toggle fullscreen', () => {
    root.classList.toggle('full');
    fullBtn.classList.toggle('on', root.classList.contains('full'));
    requestAnimationFrame(fit);
  });
  bar.append(
    btn(icons.minus, 'Zoom out', () => zoomAt(1 / 1.25, ...center())),
    btn(icons.fit, 'Fit to view', fit),
    btn(icons.plus, 'Zoom in', () => zoomAt(1.25, ...center())),
    el('span', { class: 'hint' }, 'Drag to pan · ⌘/Ctrl + scroll to zoom'),
    el('span', { class: 'spacer' }),
    btn(icons.copy, 'Copy Mermaid source', async () => {
      try {
        await navigator.clipboard.writeText(code);
        toast('Mermaid source copied');
      } catch {
        toast('Could not copy');
      }
    }),
    srcBtn,
    fullBtn,
  );

  // Pan
  let drag = null;
  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { sx: e.clientX, sy: e.clientY, ox: state.x, oy: state.y, moved: false };
    viewport.setPointerCapture(e.pointerId);
    viewport.classList.add('dragging');
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    state.x = drag.ox + dx;
    state.y = drag.oy + dy;
    apply();
  });
  const endDrag = () => {
    viewport.classList.remove('dragging');
    setTimeout(() => (drag = null), 0);
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  // Zoom (ctrl/cmd + wheel, or pinch which browsers report as ctrl+wheel)
  viewport.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );
  viewport.addEventListener('dblclick', (e) => {
    const r = viewport.getBoundingClientRect();
    zoomAt(1.5, e.clientX - r.left, e.clientY - r.top);
  });
  const onKey = (e) => {
    if (e.key === 'Escape' && root.classList.contains('full')) fullBtn.click();
  };
  document.addEventListener('keydown', onKey);

  root.render = async () => {
    canvas.innerHTML = '';
    try {
      const svg = await renderMermaid(code);
      canvas.append(fromHtml(svg));
      const svgEl = canvas.querySelector('svg');
      const vb = svgEl.viewBox?.baseVal;
      state.w = vb?.width || svgEl.getBoundingClientRect().width;
      state.h = vb?.height || svgEl.getBoundingClientRect().height;
      svgEl.style.width = `${state.w}px`;
      svgEl.style.height = `${state.h}px`;
      svgEl.removeAttribute('width');
      svgEl.style.maxWidth = 'none';
      sizeViewport();
      fit();
      // Node click-through
      for (const node of canvas.querySelectorAll('g.node')) {
        const label = (node.querySelector('.nodeLabel, .label')?.textContent || '').trim();
        if (isLinked && isLinked(label)) node.classList.add('linked');
        node.addEventListener('click', (e) => {
          if (drag && drag.moved) return;
          e.stopPropagation();
          canvas.querySelectorAll('g.node.sel').forEach((n) => n.classList.remove('sel'));
          node.classList.add('sel');
          if (onNode) onNode(label, node);
        });
      }
    } catch (err) {
      canvas.innerHTML = '';
      const box = el('div', { class: 'dg-error' });
      box.append(el('div', {}, `Mermaid could not render this diagram: ${err.message || err}`));
      box.append(el('pre', {}, el('code', {}, code)));
      viewport.replaceWith(box);
      // Mermaid leaves an error element in the body on failure
      document.querySelectorAll('body > svg[id^="pm-mermaid"], body > div[id^="dpm-mermaid"]').forEach((n) => n.remove());
    }
  };
  root.fit = fit;
  const ro = new ResizeObserver(() => fit());
  ro.observe(viewport);
  root.destroy = () => {
    document.removeEventListener('keydown', onKey);
    ro.disconnect();
  };
  return root;
}

/** Render any ```mermaid blocks that came through the Markdown renderer as .mermaid-block placeholders. */
export async function renderInlineMermaid(container) {
  for (const block of container.querySelectorAll('.mermaid-block[data-mermaid]')) {
    const code = block.dataset.mermaid;
    try {
      block.innerHTML = await renderMermaid(code);
      const svg = block.querySelector('svg');
      if (svg) {
        svg.removeAttribute('height');
        svg.style.maxWidth = '100%';
        svg.style.height = 'auto';
      }
    } catch (err) {
      block.innerHTML = '';
      block.append(el('div', { class: 'dg-error' }, `Mermaid could not render this diagram: ${err.message || err}`), el('pre', {}, el('code', {}, code)));
    }
  }
}
