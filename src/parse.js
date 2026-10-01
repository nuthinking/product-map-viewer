// Turns a /product folder into the JSON model the viewer renders.
// Lenient on purpose: malformed files still produce a model; validate.js reports the problems.

import fs from 'node:fs';
import path from 'node:path';
import {
  UNCLEAR,
  DISAGREE,
  LINK_RE,
  slugify,
  parseFrontmatter,
  stripFences,
  mermaidBlocks,
  sections,
  countOccurrences,
} from './markdown-utils.js';
import { renderMarkdown, renderInline, resolveLink } from './markdown.js';

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);

function firstHeading(md) {
  const m = /^#\s+(.*?)\s*#*\s*$/m.exec(stripFences(md));
  return m ? m[1].trim() : null;
}

/** Collect every line carrying one of the ⚠️ markers. */
function findMarkers(rel, md) {
  const out = [];
  md.split('\n').forEach((line, i) => {
    if (line.includes(UNCLEAR)) out.push({ kind: 'unclear', file: rel, line: i + 1, text: line.trim() });
    if (line.includes(DISAGREE)) out.push({ kind: 'disagree', file: rel, line: i + 1, text: line.trim() });
  });
  return out;
}

const FIELD_RE = /^\*\*([A-Za-z][A-Za-z ]*?):\*\*\s*(.*)$/;

function parseFeatures(md) {
  const lines = md.split('\n');
  const masked = stripFences(md).split('\n');
  const areas = [];
  const introLines = [];
  const headingCounts = new Map();
  const anchorFor = (text) => {
    const base = slugify(text);
    const n = headingCounts.get(base) || 0;
    headingCounts.set(base, n + 1);
    return n === 0 ? base : `${base}-${n}`;
  };
  let title = null;
  let area = null;
  let feature = null;
  let lastField = null;
  masked.forEach((line, i) => {
    const raw = lines[i];
    const n = i + 1;
    let m = /^#\s+(.*?)\s*#*\s*$/.exec(line);
    if (m && !title && !area) {
      title = m[1].trim();
      anchorFor(title);
      return;
    }
    m = /^##\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) {
      area = { name: m[1].trim(), slug: anchorFor(m[1]), line: n, descriptionLines: [], features: [] };
      areas.push(area);
      feature = null;
      lastField = null;
      return;
    }
    m = /^###\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) {
      if (!area) {
        area = { name: 'Features', slug: anchorFor('Features'), line: n, descriptionLines: [], features: [], implicit: true };
        areas.push(area);
      }
      feature = { name: m[1].trim(), slug: anchorFor(m[1]), line: n, id: null, fields: {}, order: [], bodyLines: [] };
      area.features.push(feature);
      lastField = null;
      return;
    }
    if (feature) {
      m = FIELD_RE.exec(line);
      if (m) {
        const key = m[1].trim();
        feature.fields[key] = m[2].trim();
        feature.order.push(key);
        lastField = key;
        if (key === 'ID') feature.id = m[2].trim().replace(/^`|`$/g, '');
        return;
      }
      if (lastField && line.trim() && !/^\s*$/.test(line) && !line.startsWith('#')) {
        // continuation line of the previous field
        feature.fields[lastField] += ' ' + raw.trim();
        return;
      }
      lastField = null;
      feature.bodyLines.push(raw);
      return;
    }
    if (area) area.descriptionLines.push(raw);
    else introLines.push(raw);
  });
  return { title, introLines, areas };
}

function parseFlowLinks(value, fromRel) {
  const out = [];
  for (const m of value.matchAll(LINK_RE)) {
    const [, text, href] = m;
    const r = resolveLink(fromRel, href);
    const id = /^#\/flows\/([^/]+)/.exec(r.href)?.[1] ?? null;
    out.push({ title: text, id, href: r.href });
  }
  return out;
}

function splitList(value) {
  // "`a`, `b`" or "a, b" → ['a', 'b'] (keeps backticked content, strips the ticks)
  return value
    .split(/,\s*(?=(?:[^`]*`[^`]*`)*[^`]*$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Load a Product Map folder.
 * @param {string} product path to the /product folder
 */
export function loadProductMap(product) {
  const root = path.resolve(product);
  const model = {
    root,
    name: null,
    generatedAt: new Date().toISOString(),
    readme: null,
    featureMap: null,
    flows: [],
    markers: [],
    counts: { features: 0, flows: 0, unclear: 0, disagree: 0 },
  };
  if (!exists(root) || !fs.statSync(root).isDirectory()) return model;

  // README
  const readmeP = path.join(root, 'README.md');
  if (exists(readmeP)) {
    const md = read(readmeP);
    model.name = firstHeading(md);
    model.readme = { file: 'README.md', raw: md, html: renderMarkdown(md, { fromRel: 'README.md' }) };
    model.markers.push(...findMarkers('README.md', md));
  }

  // Feature Map
  const featuresP = path.join(root, 'features.md');
  const featureIndex = new Map();
  if (exists(featuresP)) {
    const md = read(featuresP);
    const parsed = parseFeatures(md);
    const areas = parsed.areas.map((a) => ({
      name: a.name,
      slug: a.slug,
      line: a.line,
      implicit: !!a.implicit,
      descriptionHtml: renderMarkdown(a.descriptionLines.join('\n').trim(), { fromRel: 'features.md' }),
      features: a.features.map((f) => {
        const fields = f.fields;
        const known = new Set(['ID', 'Description', 'Entry', 'Flows', 'Status', 'Implementation']);
        const extra = f.order
          .filter((k) => !known.has(k))
          .map((k) => ({ label: k, html: renderInline(fields[k], { fromRel: 'features.md' }) }));
        const text = [fields.Description, ...f.bodyLines].join('\n');
        const feature = {
          id: f.id,
          name: f.name,
          slug: f.slug,
          line: f.line,
          area: a.name,
          areaSlug: a.slug,
          description: fields.Description ?? '',
          descriptionHtml: fields.Description ? renderInline(fields.Description, { fromRel: 'features.md' }) : '',
          entry: fields.Entry ?? null,
          entryHtml: fields.Entry ? renderInline(fields.Entry, { fromRel: 'features.md' }) : null,
          flows: fields.Flows ? parseFlowLinks(fields.Flows, 'features.md') : [],
          status: (fields.Status ?? 'active').replace(/^`|`$/g, ''),
          implementation: fields.Implementation ? splitList(fields.Implementation) : [],
          extra,
          bodyHtml: f.bodyLines.join('\n').trim() ? renderMarkdown(f.bodyLines.join('\n').trim(), { fromRel: 'features.md' }) : '',
          unclear: countOccurrences(text, UNCLEAR),
          disagree: countOccurrences(text, DISAGREE),
          usedBy: [],
        };
        if (feature.id) featureIndex.set(feature.id, feature);
        return feature;
      }),
    }));
    model.featureMap = {
      file: 'features.md',
      title: parsed.title,
      introHtml: renderMarkdown(parsed.introLines.join('\n').trim(), { fromRel: 'features.md' }),
      areas,
    };
    model.markers.push(...findMarkers('features.md', md));
    model.counts.features = areas.reduce((n, a) => n + a.features.length, 0);
  }

  // Flows
  const flowsD = path.join(root, 'flows');
  if (exists(flowsD) && fs.statSync(flowsD).isDirectory()) {
    const files = fs.readdirSync(flowsD).filter((f) => f.endsWith('.md')).sort();
    for (const fname of files) {
      const rel = `flows/${fname}`;
      const md = read(path.join(flowsD, fname));
      const { data: fm, bodyStart } = parseFrontmatter(md);
      const body = fm ? md.split('\n').slice(bodyStart).join('\n') : md;
      const stem = fname.slice(0, -3);
      const secs = sections(body);
      const blocks = mermaidBlocks(md);
      const flowSec = secs.sections.find((s) => s.title.trim().toLowerCase() === 'flow');
      const goalSec = secs.sections.find((s) => s.title.trim().toLowerCase() === 'goal');
      // the diagram: first mermaid block inside ## Flow, else the first anywhere
      let diagram = null;
      if (flowSec) {
        const inFlow = mermaidBlocks(flowSec.body);
        if (inFlow.length) diagram = inFlow[0].code;
      }
      if (!diagram && blocks.length) diagram = blocks[0].code;
      const otherSections = secs.sections
        .filter((s) => s !== flowSec && s !== goalSec)
        .map((s) => ({
          title: s.title,
          slug: slugify(s.title),
          html: renderMarkdown(s.body.trim(), { fromRel: rel, headingOffset: 0 }),
        }));
      let feats = fm?.features ?? [];
      if (typeof feats === 'string') feats = [feats];
      const flow = {
        id: String(fm?.id ?? stem),
        file: rel,
        title: String(fm?.title ?? firstHeading(body) ?? stem),
        status: String(fm?.status ?? 'active'),
        features: feats.map(String),
        goalHtml: goalSec ? renderMarkdown(goalSec.body.trim(), { fromRel: rel }) : '',
        diagram,
        diagramCount: blocks.length,
        flowExtraHtml:
          flowSec && flowSec.body.replace(/```mermaid[\s\S]*?```/g, '').trim()
            ? renderMarkdown(flowSec.body.replace(/```mermaid[\s\S]*?```/g, '').trim(), { fromRel: rel })
            : '',
        sections: otherSections,
        unclear: countOccurrences(md, UNCLEAR),
        disagree: countOccurrences(md, DISAGREE),
        raw: md,
      };
      for (const fid of flow.features) {
        const f = featureIndex.get(fid);
        if (f && !f.usedBy.some((u) => u.id === flow.id)) f.usedBy.push({ id: flow.id, title: flow.title });
      }
      model.flows.push(flow);
      model.markers.push(...findMarkers(rel, md));
    }
    model.counts.flows = model.flows.length;
  }

  // Features that link to a flow which does not list them still count as "used by" for navigation
  const flowIndex = new Map(model.flows.map((f) => [f.id, f]));
  for (const f of featureIndex.values()) {
    for (const link of f.flows) {
      const fl = link.id && flowIndex.get(link.id);
      if (fl && !f.usedBy.some((u) => u.id === fl.id)) f.usedBy.push({ id: fl.id, title: fl.title, unlisted: true });
    }
  }

  model.counts.unclear = model.markers.filter((m) => m.kind === 'unclear').length;
  model.counts.disagree = model.markers.filter((m) => m.kind === 'disagree').length;
  if (!model.name) model.name = model.featureMap?.title && model.featureMap.title !== 'Feature Map' ? model.featureMap.title : 'Product Map';
  return model;
}
