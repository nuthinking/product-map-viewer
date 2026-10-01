// Structural validator for a Product Map folder.
// A faithful port of scripts/validate.py from the product-map skill, so the
// package script and the skill's script report the same problems.

import fs from 'node:fs';
import path from 'node:path';
import {
  ID_RE,
  STATUS_VALUES,
  UNCLEAR,
  DISAGREE,
  LINK_RE,
  headingAnchors,
  parseFrontmatter,
  stripFences,
  mermaidBlocks,
  section,
  countOccurrences,
  splitLines,
  pyStr,
  pyTruthy,
  isExternalLink,
} from './markdown-utils.js';

/** Python-style list repr, so messages match scripts/validate.py byte for byte. */
const pyList = (arr) => `[${arr.map((v) => `'${v}'`).join(', ')}]`;
const STATUS_LIST = pyList([...STATUS_VALUES].sort());

const MERMAID_RESERVED = new Set(['end', 'graph', 'subgraph', 'style', 'class', 'click', 'default', 'linkStyle', 'classDef']);

export class Report {
  constructor() {
    this.items = [];
  }
  add(level, file, message, line = null) {
    this.items.push({ level, path: file, line, message });
  }
  error(file, message, line) {
    this.add('error', file, message, line);
  }
  warn(file, message, line) {
    this.add('warning', file, message, line);
  }
  info(file, message, line) {
    this.add('info', file, message, line);
  }
  get errors() {
    return this.items.filter((i) => i.level === 'error');
  }
  get warnings() {
    return this.items.filter((i) => i.level === 'warning');
  }
  get infos() {
    return this.items.filter((i) => i.level === 'info');
  }
  toJSON() {
    return { errors: this.errors.length, warnings: this.warnings.length, items: this.items };
  }
}

const read = (p) => fs.readFileSync(p, 'utf8');
const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();
const isDir = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();

function checkLinks(rep, product, rel, md) {
  const filePath = path.join(product, rel);
  const base = path.dirname(filePath);
  const productAbs = path.resolve(product);
  stripFences(md)
    .split('\n')
    .forEach((line, i) => {
      const n = i + 1;
      for (const m of line.matchAll(LINK_RE)) {
        const [, text, target] = m;
        if (isExternalLink(target)) continue;
        const hashIdx = target.indexOf('#');
        const filePart = hashIdx === -1 ? target : target.slice(0, hashIdx);
        const anchor = hashIdx === -1 ? '' : target.slice(hashIdx + 1);
        // Like Python's os.path.join: an absolute href replaces the base instead of being appended.
        const targetPath = filePart === '' ? filePath : path.normalize(path.isAbsolute(filePart) ? filePart : path.join(base, filePart));
        if (!fs.existsSync(targetPath)) {
          const inside = path.resolve(targetPath).startsWith(productAbs);
          if (inside || filePart.endsWith('.md')) {
            rep.error(rel, `broken link: [${text}](${target}) -> ${path.relative(product, targetPath)} does not exist`, n);
          } else {
            rep.warn(rel, `link target not found (outside /product, maybe a repo path): ${target}`, n);
          }
          continue;
        }
        if (anchor && targetPath.endsWith('.md') && isFile(targetPath)) {
          if (!headingAnchors(read(targetPath)).has(anchor)) {
            rep.error(rel, `broken anchor: [${text}](${target}) has no heading matching #${anchor}`, n);
          }
        }
      }
    });
}

// Mermaid node shapes: longer delimiters first so `([` is not read as `(`.
// The asymmetric shape `A>text]` only counts when `>` directly follows an id, so `-->` is not an opener.
const SHAPE_OPEN = String.raw`(?:\(\[|\[\(|\[\/|\[\\|\[\[|\(\(|\{\{|\[|\(|\{|(?<=\w)>)`;
const SHAPE_CLOSE = String.raw`(?:\]\)|\)\]|\/\]|\\\]|\]\]|\)\)|\}\}|\]|\)|\})`;
const SHAPE_LABEL_RE = new RegExp(SHAPE_OPEN + String.raw`([^\])}]*?)` + SHAPE_CLOSE, 'g');
const NODE_DEF_RE = new RegExp(String.raw`([A-Za-z_][\w-]*)\s*` + SHAPE_OPEN, 'g');
const MERMAID_KEYWORD_RE = /^(subgraph|end|style|classDef|class|linkStyle|click|direction)(?![\w-])/;
const EDGE_RE = /(-->|---|-\.->|==>|-\.-|--|==|\.-)/g;
const TOKEN_RE = /(?<![\w"'[\]{}()|/\\>-])([A-Za-z_][\w-]*)(?![\w-])/g;

export function checkMermaid(rep, rel, startLine, code) {
  const lines = code.split('\n').filter((l) => l.trim() && !l.trim().startsWith('%%'));
  if (!lines.length) {
    rep.error(rel, 'mermaid block is empty', startLine);
    return;
  }
  const header = lines[0].trim();
  if (!/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/.test(header)) {
    rep.error(rel, `mermaid block must start with 'flowchart TD' (or LR); found '${header}'`, startLine);
    return;
  }
  const defined = new Set();
  const referenced = new Set();
  lines.slice(1).forEach((raw, off) => {
    const ln = startLine + off + 2;
    const s = raw.trim();
    if (MERMAID_KEYWORD_RE.test(s)) return;
    const unq = s.replace(/"[^"]*"/g, '""');
    for (const [o, c] of [['[', ']'], ['(', ')'], ['{', '}']]) {
      if (countOccurrences(unq, o) !== countOccurrences(unq, c)) {
        rep.error(rel, `mermaid: unbalanced '${o}${c}' in line: ${s}`, ln);
      }
    }
    for (const m of unq.matchAll(SHAPE_LABEL_RE)) {
      const label = m[1];
      if (label.includes('""')) continue;
      if (/[()[\]{}|#;<>]/.test(label)) {
        rep.warn(rel, `mermaid: a label in '${s}' contains ( ) [ ] { } | # ; < or >; quote it, e.g. A["Export (PDF)"]`, ln);
        break;
      }
    }
    for (const m of unq.matchAll(NODE_DEF_RE)) defined.add(m[1]);
    let stripped = unq.replace(/\|[^|]*\|/g, '|');
    stripped = stripped.replace(SHAPE_LABEL_RE, '');
    stripped = stripped.replace(EDGE_RE, ' ');
    stripped = stripped.replace(/&/g, ' ');
    for (const m of stripped.matchAll(TOKEN_RE)) {
      const tok = m[1];
      referenced.add(tok);
      if (MERMAID_RESERVED.has(tok)) {
        rep.error(rel, `mermaid: '${tok}' is a reserved word and cannot be a node id`, ln);
      }
    }
  });
  const onlyRef = [...referenced].filter((t) => !defined.has(t) && !MERMAID_RESERVED.has(t)).sort();
  for (const t of onlyRef) {
    rep.warn(rel, `mermaid: node '${t}' is used but never given a label (typo, or an unlabeled node)`, startLine);
  }
  const nodeCount = new Set([...defined, ...referenced]).size;
  if (nodeCount > 20) {
    rep.warn(rel, `mermaid: ${nodeCount} nodes; consider splitting into another flow or subflow (target 6-15)`, startLine);
  }
  if (nodeCount < 3) {
    rep.warn(rel, `mermaid: only ${nodeCount} nodes; a flow usually needs a few steps and at least one decision or outcome`, startLine);
  }
}

/**
 * Validate a Product Map folder. Returns a Report.
 * @param {string} product absolute or relative path to the /product folder
 */
export function validateProductMap(product) {
  const rep = new Report();
  if (!isDir(product)) {
    rep.error(product, 'Product Map folder does not exist');
    return rep;
  }
  const readmeP = path.join(product, 'README.md');
  const featuresP = path.join(product, 'features.md');
  const flowsD = path.join(product, 'flows');
  for (const [p, label] of [[readmeP, 'README.md'], [featuresP, 'features.md']]) {
    if (!isFile(p)) rep.error(label, 'required file is missing');
  }
  if (!isDir(flowsD)) rep.error('flows/', 'required folder is missing');
  if (rep.errors.length) return rep;

  // ---- Feature Map
  const featuresMd = read(featuresP);
  const featureIds = new Map();
  const featureFlows = new Map();
  let areaCount = 0;
  let currentFeature = null;
  let currentLine = 0;
  let currentFid = null;
  let awaitingId = false;
  stripFences(featuresMd)
    .split('\n')
    .forEach((line, i) => {
      const n = i + 1;
      if (line.startsWith('## ')) areaCount++;
      if (line.startsWith('### ')) {
        if (awaitingId && currentFeature) {
          rep.error('features.md', `feature '${currentFeature}' has no **ID:** line`, currentLine);
        }
        currentFeature = line.slice(4).trim();
        currentLine = n;
        awaitingId = true;
        return;
      }
      let m = /^\*\*ID:\*\*\s*`?([^`\s]+)`?\s*$/.exec(line);
      if (m && currentFeature) {
        const fid = m[1];
        awaitingId = false;
        if (!ID_RE.test(fid)) rep.error('features.md', `feature ID '${fid}' is not kebab-case`, n);
        if (featureIds.has(fid)) {
          rep.error('features.md', `duplicate feature ID '${fid}' (first defined line ${featureIds.get(fid)})`, n);
        } else featureIds.set(fid, n);
        currentFid = fid;
        return;
      }
      m = /^\*\*Status:\*\*\s*`?([^`\s]+)`?/.exec(line);
      if (m && currentFeature && !STATUS_VALUES.has(m[1])) {
        rep.error('features.md', `feature status '${m[1]}' must be one of ${STATUS_LIST}`, n);
      }
      m = /^\*\*Flows:\*\*\s*(.*)$/.exec(line);
      if (m && currentFeature && !awaitingId) {
        for (const lm of m[1].matchAll(LINK_RE)) {
          const fname = path.basename(lm[2].split('#')[0]);
          if (fname.endsWith('.md')) {
            if (!featureFlows.has(currentFid)) featureFlows.set(currentFid, new Set());
            featureFlows.get(currentFid).add(fname.slice(0, -3));
          }
        }
      }
    });
  if (awaitingId && currentFeature) {
    rep.error('features.md', `feature '${currentFeature}' has no **ID:** line`, currentLine);
  }
  if (!featureIds.size) {
    rep.error('features.md', "no features found (expected '### Name' headings each followed by an **ID:** line)");
  }
  if (areaCount === 0) {
    rep.warn('features.md', "no '## Area' headings; group features into product areas so the map is scannable");
  }
  checkLinks(rep, product, 'features.md', featuresMd);

  // ---- Flows
  const flowFiles = fs.readdirSync(flowsD).filter((f) => f.endsWith('.md')).sort();
  if (!flowFiles.length) rep.error('flows/', 'no flow files found');
  const flowIds = new Map();
  const flowTitles = new Map();
  const flowFeatureSets = new Map();
  const flowFeatures = new Map();
  for (const fname of flowFiles) {
    const rel = `flows/${fname}`;
    const md = read(path.join(flowsD, fname));
    let { data: fm } = parseFrontmatter(md);
    const stem = fname.slice(0, -3);
    if (fm === null) {
      rep.error(rel, 'missing or unterminated YAML frontmatter (--- ... ---)', 1);
      fm = {};
    }
    for (const key of ['id', 'title', 'features', 'status']) {
      const v = fm[key];
      const empty = v === '' || (Array.isArray(v) && v.length === 0);
      if (!(key in fm) || (empty && key !== 'features')) {
        rep.error(rel, `frontmatter is missing required key '${key}'`, 1);
      }
    }
    const fid = pyStr(fm.id ?? stem);
    if (pyTruthy(fm.id) && fid !== stem) rep.error(rel, `frontmatter id '${fid}' must match the file name '${stem}'`, 1);
    if (!ID_RE.test(fid)) rep.error(rel, `flow id '${fid}' is not kebab-case`, 1);
    if (flowIds.has(fid)) rep.error(rel, `duplicate flow id '${fid}' (also in ${flowIds.get(fid)})`, 1);
    flowIds.set(fid, rel);
    const status = pyStr(fm.status ?? '');
    if (status && !STATUS_VALUES.has(status)) {
      rep.error(rel, `status '${status}' must be one of ${STATUS_LIST}`, 1);
    }
    let feats = fm.features ?? [];
    if (typeof feats === 'string') {
      feats = [feats];
      rep.error(rel, "'features' must be a list (use '- feature-id' lines)", 1);
    }
    feats = feats.map(String);
    if (!feats.length) rep.warn(rel, 'flow lists no features; link it to the Feature Map entries it exercises', 1);
    for (const f of feats) {
      if (!featureIds.has(f)) rep.error(rel, `references unknown feature '${f}' (not defined in features.md)`, 1);
    }
    flowFeatures.set(fid, new Set(feats));
    const title = pyStr(fm.title ?? '').trim();
    if (title) {
      const key = title.toLowerCase();
      if (!flowTitles.has(key)) flowTitles.set(key, []);
      flowTitles.get(key).push(rel);
    }
    if (feats.length >= 2) {
      const key = [...new Set(feats)].sort().join('\u0000');
      if (!flowFeatureSets.has(key)) flowFeatureSets.set(key, []);
      flowFeatureSets.get(key).push(rel);
    }

    if (section(md, 'Goal') === null) rep.warn(rel, "missing '## Goal' section");
    const flowSec = section(md, 'Flow');
    if (flowSec === null) rep.error(rel, "missing '## Flow' section with the Mermaid diagram");
    const blocks = mermaidBlocks(md);
    if (!blocks.length) {
      rep.error(rel, 'no ```mermaid block found; the flowchart is the primary artifact');
    } else if (flowSec !== null && !mermaidBlocks(flowSec).length) {
      rep.error(rel, "the mermaid diagram must be inside the '## Flow' section, not under another heading");
    } else {
      if (blocks.length > 1) {
        rep.warn(rel, `${blocks.length} mermaid blocks; a flow should have one diagram (split into another flow if needed)`);
      }
      for (const b of blocks) checkMermaid(rep, rel, b.line, b.code);
    }
    const unclearTail = UNCLEAR.split(' ').slice(1).join(' ');
    if (md.includes(unclearTail) && !md.includes(UNCLEAR)) {
      rep.warn(rel, `unclear-behavior marker should be written exactly as: ${UNCLEAR}`);
    }
    checkLinks(rep, product, rel, md);
  }

  // ---- Cross references
  for (const [fid, flows] of featureFlows) {
    for (const fl of flows) {
      if (flowFeatures.has(fl) && !flowFeatures.get(fl).has(fid)) {
        rep.warn('features.md', `feature '${fid}' links to flow '${fl}' but that flow's frontmatter does not list '${fid}'`);
      }
    }
  }
  const referencedByFlows = new Set();
  for (const s of flowFeatures.values()) for (const f of s) referencedByFlows.add(f);
  for (const [fid, line] of featureIds) {
    if (!referencedByFlows.has(fid) && !featureFlows.has(fid)) {
      rep.info('features.md', `feature '${fid}' is not part of any flow (fine for settings-like features)`, line);
    }
  }
  for (const [title, rels] of flowTitles) {
    if (rels.length > 1) rep.warn('flows/', `flows with the same title '${title}': ${rels.join(', ')} (duplicate flow?)`);
  }
  for (const [key, rels] of flowFeatureSets) {
    if (rels.length > 1) {
      const fs_ = key.split('\u0000');
      rep.warn('flows/', `flows with identical feature sets ${pyList(fs_)}: ${rels.join(', ')} (duplicate or mergeable flow?)`);
    }
  }

  // ---- README
  const readmeMd = read(readmeP);
  checkLinks(rep, product, 'README.md', readmeMd);
  const readmeLinks = [...stripFences(readmeMd).matchAll(LINK_RE)].map((m) => m[2]);
  const linked = new Set(readmeLinks.map((t) => path.basename(t.split('#')[0])));
  for (const fname of flowFiles) {
    if (!linked.has(fname)) {
      rep.warn('README.md', `does not link to flows/${fname}; every major flow should be reachable from the README`);
    }
  }
  if (!readmeLinks.some((t) => t.split('#')[0] === 'features.md')) rep.warn('README.md', 'does not link to features.md');
  if (splitLines(readmeMd).length > 90) rep.warn('README.md', 'is long; it should be readable in under a minute');

  // ---- Summary info
  const allFiles = ['README.md', 'features.md', ...flowFiles.map((f) => `flows/${f}`)];
  const allText = allFiles.map((p) => read(path.join(product, p))).join('');
  rep.info(
    'product/',
    `${featureIds.size} features, ${flowFiles.length} flows, ${countOccurrences(allText, UNCLEAR)} unclear-behavior markers, ${countOccurrences(allText, DISAGREE)} UI/code disagreements`,
  );
  return rep;
}

/** Plain-text rendering of a report, matching the Python script's output. */
export function formatReport(rep) {
  const lines = rep.items.map((it) => {
    const loc = it.line ? `${it.path}:${it.line}` : it.path;
    return `${it.level.padEnd(7)} ${loc}: ${it.message}`;
  });
  lines.push('');
  lines.push(`${rep.errors.length} error(s), ${rep.warnings.length} warning(s)`);
  lines.push(rep.errors.length ? 'Product Map has errors.' : 'Product Map is structurally valid.');
  return lines.join('\n');
}
