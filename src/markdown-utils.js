// Small Markdown helpers shared by the parser and the validator.
// They mirror scripts/validate.py from the product-map skill so both tools agree.

export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const STATUS_VALUES = new Set(['active', 'planned', 'deprecated']);
export const UNCLEAR = '⚠️ Behavior unclear from the current implementation.';
export const DISAGREE = '⚠️ UI and code disagree:';
export const LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** GitHub-style heading anchor. */
export function slugify(heading) {
  let text = heading.trim().toLowerCase();
  text = text.replace(/[`*_~]/g, '');
  text = text.replace(/[^\p{L}\p{N}_\- ]/gu, '');
  return text.trim().replace(/ /g, '-');
}

/** Returns the set of heading anchors in a document, GitHub-style, with -1, -2 suffixes for duplicates. */
export function headingAnchors(md) {
  const anchors = new Set();
  const counts = new Map();
  for (const line of stripFences(md).split('\n')) {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) {
      const base = slugify(m[2]);
      const n = counts.get(base) || 0;
      counts.set(base, n + 1);
      anchors.add(n === 0 ? base : `${base}-${n}`);
    }
  }
  return anchors;
}

function scalar(v) {
  v = v.trim();
  if (v.length >= 2 && v[0] === v[v.length - 1] && (v[0] === '"' || v[0] === "'")) v = v.slice(1, -1);
  return v;
}

/**
 * Tiny YAML subset: scalars, inline lists, block lists.
 * Returns { data, bodyStart } where bodyStart is the 1-based line of the closing ---,
 * or { data: null, bodyStart: 0 } when there is no (terminated) frontmatter.
 */
export function parseFrontmatter(md) {
  const lines = md.split('\n');
  if (!lines.length || lines[0].trim() !== '---') return { data: null, bodyStart: 0 };
  const data = {};
  let key = null;
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '---') return { data, bodyStart: i + 1 };
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    const mItem = /^\s*-\s*(.*)$/.exec(raw);
    if (mItem && key !== null && Array.isArray(data[key])) {
      data[key].push(scalar(mItem[1]));
      continue;
    }
    const mKv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(raw);
    if (mKv) {
      key = mKv[1];
      const val = mKv[2].trim();
      if (val === '') data[key] = [];
      else if (val.startsWith('[') && val.endsWith(']')) {
        const inner = val.slice(1, -1).trim();
        data[key] = inner ? inner.split(',').map(scalar) : [];
      } else data[key] = scalar(val);
    }
  }
  return { data: null, bodyStart: 0 };
}

/** Blank out fenced code blocks, keeping line numbers stable. */
export function stripFences(md) {
  const out = [];
  let fence = null;
  for (const line of md.split('\n')) {
    const m = /^(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (fence === null) fence = m[1];
      else if (line.startsWith(fence)) fence = null;
      out.push('');
      continue;
    }
    out.push(fence ? '' : line);
  }
  return out.join('\n');
}

/** All ```mermaid blocks as [{ line, code }], line being the 1-based line of the opening fence. */
export function mermaidBlocks(md) {
  const blocks = [];
  let cur = null;
  let start = 0;
  md.split('\n').forEach((line, i) => {
    const n = i + 1;
    if (cur === null && /^`{3,}\s*mermaid\s*$/.test(line)) {
      cur = [];
      start = n;
    } else if (cur !== null && /^`{3,}\s*$/.test(line)) {
      blocks.push({ line: start, code: cur.join('\n') });
      cur = null;
    } else if (cur !== null) {
      cur.push(line);
    }
  });
  return blocks;
}

/** Body of a `## Title` section (up to the next ## heading), or null. */
export function section(md, title) {
  const re = new RegExp(`^##\\s+${escapeRe(title)}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'm');
  const m = re.exec(md);
  return m ? m[1] : null;
}

/** All `## ` sections of a Markdown body, in order: [{ title, body, line }]. Text before the first ## is returned as preamble. */
export function sections(md) {
  const lines = md.split('\n');
  const masked = stripFences(md).split('\n'); // same fence rules as everywhere else, nested fences included
  const result = [];
  let preamble = [];
  let cur = null;
  lines.forEach((line, i) => {
    const m = /^##\s+(.*?)\s*#*\s*$/.exec(masked[i]);
    if (m) {
      cur = { title: m[1], line: i + 1, lines: [] };
      result.push(cur);
    } else if (cur) cur.lines.push(line);
    else preamble.push(line);
  });
  return {
    preamble: preamble.join('\n'),
    sections: result.map((s) => ({ title: s.title, line: s.line, body: s.lines.join('\n') })),
  };
}

/** Python's str.splitlines() for \n-terminated text: no phantom empty line after a trailing newline. */
export function splitLines(s) {
  const lines = s.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Python's str() for the values our frontmatter parser produces (strings and lists). */
export function pyStr(v) {
  if (Array.isArray(v)) return `[${v.map((x) => `'${x}'`).join(', ')}]`;
  return v === undefined || v === null ? '' : String(v);
}

/** Python truthiness for the same values: '' and [] are false. */
export function pyTruthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

/** A link target that leaves the file system: a URL scheme or protocol-relative. */
export function isExternalLink(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

export function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}
