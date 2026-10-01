// Markdown → HTML for the viewer, with Product Map links rewritten to viewer routes.
import { Marked } from 'marked';
import path from 'node:path';
import { slugify, UNCLEAR, DISAGREE } from './markdown-utils.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function isExternal(href) {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
}

/**
 * Map a Markdown link found in `fromRel` (path relative to the product root)
 * to a viewer route. Returns { href, kind } where kind is 'route' | 'external' | 'repo' | 'anchor'.
 */
export function resolveLink(fromRel, href) {
  if (isExternal(href)) return { href, kind: 'external' };
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

/** Wrap the two known ⚠️ markers in a span so the viewer can style and find them. */
function markMarkers(html) {
  return html
    .split(escapeHtml(UNCLEAR)).join(`<mark class="marker marker-unclear">${escapeHtml(UNCLEAR)}</mark>`)
    .split(escapeHtml(DISAGREE)).join(`<mark class="marker marker-disagree">${escapeHtml(DISAGREE)}</mark>`);
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
  const marked = new Marked({
    gfm: true,
    breaks: false,
    walkTokens(token) {
      if (token.type === 'link' && fromRel) {
        const r = resolveLink(fromRel, token.href);
        token.href = r.href;
        token.linkKind = r.kind;
      }
    },
    renderer: {
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
      link({ href, title, tokens, linkKind }) {
        const text = this.parser.parseInline(tokens);
        const t = title ? ` title="${escapeHtml(title)}"` : '';
        if (linkKind === 'external') return `<a href="${escapeHtml(href)}"${t} target="_blank" rel="noopener">${text}</a>`;
        if (linkKind === 'repo') return `<span class="repo-link" title="Repository path: ${escapeHtml(href)}">${text}</span>`;
        return `<a href="${escapeHtml(href)}"${t} class="internal">${text}</a>`;
      },
      code({ text, lang }) {
        if ((lang || '').trim() === 'mermaid') {
          return `<div class="mermaid-block" data-mermaid="${escapeHtml(text)}"></div>\n`;
        }
        const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
        return `<pre><code${cls}>${escapeHtml(text)}</code></pre>\n`;
      },
    },
  });
  return markMarkers(marked.parse(md));
}

/** Inline Markdown (a single line) to HTML, with links rewritten. */
export function renderInline(md, { fromRel } = {}) {
  const marked = new Marked({
    gfm: true,
    walkTokens(token) {
      if (token.type === 'link' && fromRel) {
        const r = resolveLink(fromRel, token.href);
        token.href = r.href;
        token.linkKind = r.kind;
      }
    },
    renderer: {
      link({ href, title, tokens, linkKind }) {
        const text = this.parser.parseInline(tokens);
        const t = title ? ` title="${escapeHtml(title)}"` : '';
        if (linkKind === 'external') return `<a href="${escapeHtml(href)}"${t} target="_blank" rel="noopener">${text}</a>`;
        if (linkKind === 'repo') return `<span class="repo-link" title="Repository path: ${escapeHtml(href)}">${text}</span>`;
        return `<a href="${escapeHtml(href)}"${t} class="internal">${text}</a>`;
      },
    },
  });
  return markMarkers(marked.parseInline(md));
}
