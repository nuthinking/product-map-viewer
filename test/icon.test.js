import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { findProductIcon, findRepoRoot } from '../src/icon.js';

function repo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-icon-'));
  for (const [rel, content] of Object.entries({ 'product/features.md': '# Feature Map\n', ...files })) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  return root;
}

test('finds the repo root by a marker file', () => {
  const root = repo({ 'package.json': '{}', 'docs/product/features.md': '# Feature Map\n' });
  assert.equal(findRepoRoot(path.join(root, 'docs', 'product')), root);
  const bare = repo({});
  assert.equal(findRepoRoot(path.join(bare, 'product')), bare);
});

test('no icon anywhere → null', () => {
  const root = repo({ 'package.json': '{}' });
  assert.equal(findProductIcon(path.join(root, 'product')), null);
});

test('prefers an icon shipped inside /product', () => {
  const root = repo({ 'package.json': '{}', 'public/favicon.ico': 'x', 'product/icon.png': 'x' });
  const icon = findProductIcon(path.join(root, 'product'));
  assert.equal(icon.path, path.join(root, 'product', 'icon.png'));
  assert.equal(icon.mime, 'image/png');
});

test('reads the link tag from index.html', () => {
  const root = repo({ 'package.json': '{}', 'public/favicon.ico': 'x', 'public/brand/mark.svg': '<svg/>', 'index.html': '<html><head><link rel="icon" type="image/svg+xml" href="/brand/mark.svg?v=2"></head></html>' });
  const icon = findProductIcon(path.join(root, 'product'));
  assert.equal(icon.path, path.join(root, 'public', 'brand', 'mark.svg'));
  assert.equal(icon.mime, 'image/svg+xml');
});

test('falls back to common favicon locations, vector first', () => {
  const root = repo({ '.git/HEAD': 'ref', 'public/favicon.ico': 'x', 'static/favicon.svg': '<svg/>' });
  assert.equal(findProductIcon(path.join(root, 'product')).path, path.join(root, 'static', 'favicon.svg'));
  const next = repo({ 'package.json': '{}', 'src/app/favicon.ico': 'x' });
  assert.equal(findProductIcon(path.join(next, 'product')).mime, 'image/x-icon');
});

test('ignores external and data: hrefs in link tags', () => {
  const root = repo({ 'package.json': '{}', 'index.html': '<link rel="icon" href="https://cdn.example.com/f.png"><link rel="icon" href="data:image/png;base64,AAAA">' });
  assert.equal(findProductIcon(path.join(root, 'product')), null);
});
