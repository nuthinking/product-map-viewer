// Finds an icon for the product in the repository around the /product folder,
// so the viewer can show the product's own favicon instead of a generic one.

import fs from 'node:fs';
import path from 'node:path';

const EXTS = ['svg', 'png', 'ico', 'webp', 'jpg', 'jpeg', 'gif'];
export const ICON_MIME = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

// Folders where web projects usually keep their favicon, relative to the repo root.
const DIRS = ['', 'public', 'static', 'assets', 'app', 'src/app', 'src', 'web', 'www', 'client', 'client/public', 'site', 'docs', '.github'];
const NAMES = ['favicon', 'icon', 'logo', 'apple-touch-icon', 'app-icon'];

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** Nearest ancestor of the product folder that looks like a repo root, else its parent. */
export function findRepoRoot(productDir) {
  let dir = path.dirname(path.resolve(productDir));
  for (let i = 0; i < 6; i++) {
    for (const marker of ['.git', 'package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'Gemfile', 'composer.json', 'pubspec.yaml']) {
      if (fs.existsSync(path.join(dir, marker))) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.dirname(path.resolve(productDir));
}

/** <link rel="icon" href="..."> in an HTML file, resolved against the file's folder and the repo root. */
function iconFromHtml(htmlPath, root) {
  if (!isFile(htmlPath)) return null;
  const html = fs.readFileSync(htmlPath, 'utf8').slice(0, 20000);
  const re = /<link\b[^>]*\brel=["']([^"']*)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!/\b(icon|apple-touch-icon)\b/i.test(m[1])) continue;
    const href = /\bhref=["']([^"']+)["']/i.exec(m[0])?.[1];
    if (!href || /^(https?:|data:|\/\/)/i.test(href)) continue;
    const clean = href.split(/[?#]/)[0];
    const candidates = [path.join(path.dirname(htmlPath), clean), path.join(root, clean), path.join(root, 'public', clean), path.join(root, 'static', clean)];
    for (const c of candidates) {
      if (isFile(c) && path.resolve(c).startsWith(path.resolve(root)) && ICON_MIME[path.extname(c).toLowerCase()]) return c;
    }
  }
  return null;
}

/**
 * Look for an icon. Order: an icon shipped inside /product, then the repo's
 * index.html link tags, then the usual favicon locations (vector first).
 * Returns { path, mime } or null.
 */
export function findProductIcon(productDir) {
  const product = path.resolve(productDir);
  const root = findRepoRoot(product);
  const found = (p) => (p ? { path: p, mime: ICON_MIME[path.extname(p).toLowerCase()], root } : null);

  for (const name of ['icon', 'favicon', 'logo']) {
    for (const ext of EXTS) {
      const p = path.join(product, `${name}.${ext}`);
      if (isFile(p)) return found(p);
    }
  }
  for (const html of ['index.html', 'public/index.html', 'static/index.html', 'src/index.html', 'app/index.html', 'src/app.html']) {
    const p = iconFromHtml(path.join(root, html), root);
    if (p) return found(p);
  }
  for (const ext of EXTS) {
    for (const dir of DIRS) {
      for (const name of NAMES) {
        const p = path.join(root, dir, `${name}.${ext}`);
        if (isFile(p)) return found(p);
      }
    }
  }
  return null;
}
