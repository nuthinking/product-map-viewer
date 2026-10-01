// Markdown → HTML for the viewer, with Product Map links rewritten to viewer routes.
import { Marked } from 'marked';
import path from 'node:path';
import { slugify, UNCLEAR, DISAGREE, isExternalLink } from './markdown-utils.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * Map a Markdown link found in `fromRel` (path relative to the product root)
 * to a viewer route. Returns { href, kind } where kind is 'route' | 'external' | 'repo' | 'anchor'.
 */
export function resolveLink(fromRel, href) {
  if (isExternalLink(href)) return { href, kind: 'external' };
  const hashIdx = href.indexOf('#');
  const filePart = hashIdx === -1 ? href : href.slice(0, hashIdx);
  const anchor = hashIdx === -1 ? '' : href.slice(hashIdx + 1);
  const fromDir = path.posix.dirname(fromRel.split(path.sep).join('/'));
  const target = filePart === '' ? fromRel : path.posix.normalize(path.posix.join(fromDir, filePart));
  if (target.startsWith('..')) return { href, kind: 'repo' };
  if (target === 'README.md') return { href: anchor ? `#/overview/${anchor}` : '#/overview', kind: 'route' };
  if (target === 'features.md') return { href: anchor ? `#/features/${anchor}` : '#/features', kind: 'route' };
  const m = /^flows\/([^/]+)\.md$/.exec(target);
  if (m) return { href: anchor ? `#/flows/${m[1]}/${anchor}` : `#/flows/${m[1]}`, kind: 'route' };
  return { href, kind: 'repo' };
}

/** Wrap the two known ⚠️ markers in a <mark>, touching text between tags only, never attributes. */
function markMarkers(html) {
  const u = escapeHtml(UNCLEAR);
  const d = escapeHtml(DISAGREE);
  if (!html.includes(u) && !html.includes(d)) return html;
  return html
    .split(/(<[^>]*>)/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .split(u).join(`<mark class="marker marker-unclear">${u}</mark>`)
            .split(d).join(`<mark class="marker marker-disagree">${d}</mark>`),
    )
    .join('');
}

function linkRenderer() {
  return {
    link({ href, title, tokens, linkKind }) {
      const text = this.parser.parseInline(tokens);
      const t = title ? ` title="${escapeHtml(title)}"` : '';
      if (linkKind === 'external') return `<a href="${escapeHtml(href)}"${t} target="_blank" rel="noopener">${text}</a>`;
      if (linkKind === 'repo') return `<span class="repo-link" title="Repository path: ${escapeHtml(href)}">${text}</span>`;
      return `<a href="${escapeHtml(href)}"${t} class="internal">${text}</a>`;
    },
  };
}

/** A Marked instance whose links are resolved relative to `fromRel`, with optional extra renderer hooks. */
function makeMarked(fromRel, renderer = {}) {
  return new Marked({
    gfm: true,
    breaks: false,
    walkTokens(token) {
      if (token.type === 'link' && fromRel) {
        const r = resolveLink(fromRel, token.href);
        token.href = r.href;
        token.linkKind = r.kind;
      }
    },
    renderer: { ...linkRenderer(), ...renderer },
  });
}

/**
 * Render Markdown to HTML.
 * @param {string} md
 * @param {object} opts
 * @param {string} opts.fromRel path of the source file relative to /product (for link resolution)
 * @param {number} [opts.headingOffset] 0 keeps # as h1; 1 shifts headings down one level
 */
export function renderMarkdown(md, { fromRel, headingOffset = 0 } = {}) {
  const counts = new Map();
  const marked = makeMarked(fromRel, {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const raw = tokens.map((t) => t.raw ?? t.text ?? '').join('');
      const base = slugify(raw);
      const n = counts.get(base) || 0;
      counts.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      const level = Math.min(6, depth + headingOffset);
      return `<h${level} id="${escapeHtml(id)}" data-heading="${escapeHtml(raw.trim())}">${text}</h${level}>\n`;
    },
    code({ text, lang }) {
      if ((lang || '').trim() === 'mermaid') {
        return `<div class="mermaid-block" data-mermaid="${escapeHtml(text)}"></div>\n`;
      }
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      return `<pre><code${cls}>${escapeHtml(text)}</code></pre>\n`;
    },
  });
  return markMarkers(marked.parse(md));
}

/** Inline Markdown (a single line) to HTML, with links rewritten. */
export function renderInline(md, { fromRel } = {}) {
  return markMarkers(makeMarked(fromRel).parseInline(md));
}
