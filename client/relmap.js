// Bipartite relationship map: features (grouped by area) on the left, flows on the right, wires between.
import { el, statusClass } from './util.js';

export function createRelMap(map, { onNavigate } = {}) {
  const root = el('div', { class: 'relmap' });
  const left = el('div', { class: 'col left' });
  const mid = el('div', { class: 'col mid' });
  const right = el('div', { class: 'col right' });
  const wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  wires.setAttribute('class', 'wires');
  root.append(left, mid, right, wires);
  left.append(el('div', { class: 'col-head' }, 'Features'));
  right.append(el('div', { class: 'col-head' }, 'Flows'));

  const featureEls = new Map();
  const flowEls = new Map();
  const edges = []; // [featureId, flowId]
  const flowIds = new Set(map.flows.map((f) => f.id));

  for (const area of map.featureMap?.areas || []) {
    left.append(el('div', { class: 'rm-area' }, area.name));
    for (const f of area.features) {
      const a = el('a', { class: 'node feature', href: `#/features/${f.slug}`, 'data-id': f.id || f.slug }, [
        el('span', { class: `dot ${statusClass(f.status)}` }),
        el('span', { class: 'label', title: f.name }, f.name),
      ]);
      left.append(a);
      featureEls.set(f.id || f.slug, a);
      const seen = new Set();
      for (const u of f.usedBy || []) {
        if (flowIds.has(u.id) && !seen.has(u.id)) {
          seen.add(u.id);
          edges.push([f.id || f.slug, u.id]);
        }
      }
    }
  }
  for (const fl of map.flows) {
    const a = el('a', { class: 'node flow', href: `#/flows/${fl.id}`, 'data-id': fl.id }, [
      el('span', { class: `dot ${statusClass(fl.status)}` }),
      el('span', { class: 'label', title: fl.title }, fl.title),
    ]);
    right.append(a);
    flowEls.set(fl.id, a);
  }
  root.append(el('div', { class: 'legend' }, 'Hover a feature or a flow to see what it connects to. Click to open.'));

  const paths = [];
  const draw = () => {
    wires.innerHTML = '';
    paths.length = 0;
    const rr = root.getBoundingClientRect();
    for (const [fid, flid] of edges) {
      const a = featureEls.get(fid);
      const b = flowEls.get(flid);
      if (!a || !b) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const x1 = ra.right - rr.left;
      const y1 = ra.top + ra.height / 2 - rr.top;
      const x2 = rb.left - rr.left;
      const y2 = rb.top + rb.height / 2 - rr.top;
      const dx = Math.max(30, (x2 - x1) / 2);
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
      p.dataset.f = fid;
      p.dataset.fl = flid;
      wires.append(p);
      paths.push(p);
    }
  };
  const light = (kind, id) => {
    root.classList.toggle('focus', !!id);
    const litF = new Set();
    const litFl = new Set();
    if (id) {
      for (const [fid, flid] of edges) {
        if ((kind === 'f' && fid === id) || (kind === 'fl' && flid === id)) {
          litF.add(fid);
          litFl.add(flid);
        }
      }
      if (kind === 'f') litF.add(id);
      else litFl.add(id);
    }
    for (const [fid, e] of featureEls) e.classList.toggle('lit', litF.has(fid));
    for (const [flid, e] of flowEls) e.classList.toggle('lit', litFl.has(flid));
    for (const p of paths) p.classList.toggle('lit', litF.has(p.dataset.f) && litFl.has(p.dataset.fl));
  };
  for (const [fid, e] of featureEls) {
    e.addEventListener('mouseenter', () => light('f', fid));
    e.addEventListener('mouseleave', () => light(null, null));
  }
  for (const [flid, e] of flowEls) {
    e.addEventListener('mouseenter', () => light('fl', flid));
    e.addEventListener('mouseleave', () => light(null, null));
  }
  const ro = new ResizeObserver(() => draw());
  ro.observe(root);
  root.draw = draw;
  return root;
}
