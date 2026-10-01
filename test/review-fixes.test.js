// Regression tests for the issues found in the review of PR #1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '../src/server.js';
import { validateProductMap } from '../src/validate.js';
import { renderMarkdown } from '../src/markdown.js';
import { sections, splitLines, pyStr } from '../src/markdown-utils.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const example = path.join(here, '..', 'example', 'product');

function copyExample() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-fix-'));
  fs.cpSync(example, path.join(dir, 'product'), { recursive: true });
  return { dir, product: path.join(dir, 'product') };
}

test('a malformed URL gets a 400 and the server stays up', async () => {
  const { url, close } = await serve({ productDir: example, port: 0, watch: false });
  try {
    assert.equal((await fetch(`${url}/%E0%A4%A`)).status, 400);
    assert.equal((await fetch(`${url}/%`)).status, 400);
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
  } finally {
    await close();
  }
});

test('an absolute href is a warning, like the Python validator', () => {
  const { dir, product } = copyExample();
  try {
    fs.appendFileSync(path.join(product, 'features.md'), '\nSee [page](/src/app/page.tsx).\n');
    const rep = validateProductMap(product);
    assert.equal(rep.errors.length, 0, JSON.stringify(rep.errors));
    assert.ok(rep.warnings.some((w) => w.message.includes('outside /product')), JSON.stringify(rep.warnings));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty status: reports the same two errors as the Python validator', () => {
  const { dir, product } = copyExample();
  try {
    const f = path.join(product, 'flows', 'upgrade.md');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/^status: active$/m, 'status:'));
    const msgs = validateProductMap(product).errors.map((e) => e.message);
    assert.ok(msgs.includes("frontmatter is missing required key 'status'"), msgs);
    assert.ok(msgs.some((m) => m.startsWith("status '[]' must be one of")), msgs);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('README line count ignores the trailing newline', () => {
  assert.equal(splitLines('a\nb\n').length, 2);
  assert.equal(splitLines('a\nb').length, 2);
  assert.equal(splitLines('').length, 0);
  const { dir, product } = copyExample();
  try {
    const readme = path.join(product, 'README.md');
    const lines = fs.readFileSync(readme, 'utf8').split('\n').filter((l, i, a) => i < a.length - 1);
    while (lines.length < 90) lines.push('');
    fs.writeFileSync(readme, lines.slice(0, 90).join('\n') + '\n');
    assert.ok(!validateProductMap(product).warnings.some((w) => w.message.includes('is long')));
    fs.writeFileSync(readme, lines.slice(0, 90).join('\n') + '\n\n');
    assert.ok(validateProductMap(product).warnings.some((w) => w.message.includes('is long')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pyStr matches Python str() for frontmatter values', () => {
  assert.equal(pyStr([]), '[]');
  assert.equal(pyStr(['a', 'b']), "['a', 'b']");
  assert.equal(pyStr('x'), 'x');
});

test('sections() honours nested fences like stripFences()', () => {
  const md = '## Goal\n\ntext\n\n````md\n```\n## Not a section\n```\n````\n\n## Flow\n';
  assert.deepEqual(sections(md).sections.map((s) => s.title), ['Goal', 'Flow']);
});

test('markers inside attributes are left alone', () => {
  const html = renderMarkdown('```mermaid\nflowchart TD\n  A["⚠️ Behavior unclear from the current implementation."] --> B\n```\n\n⚠️ Behavior unclear from the current implementation. Text.\n', { fromRel: 'README.md' });
  const attr = /data-mermaid="([^"]*)"/.exec(html)[1];
  assert.ok(!attr.includes('<mark'), attr);
  assert.equal((html.match(/<mark class="marker marker-unclear">/g) || []).length, 1);
});

test('watcher keeps working after /product and /product/flows appear', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-watch-'));
  const product = path.join(dir, 'product');
  const { url, close } = await serve({ productDir: product, port: 0, watch: true });
  const events = [];
  const ac = new AbortController();
  const stream = fetch(`${url}/events`, { signal: ac.signal }).then(async (res) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const m = /^event: (\w+)/m.exec(chunk);
        if (m) events.push(m[1]);
      }
    }
  }).catch(() => {});
  const waitFor = (n) => new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => (events.filter((e) => e === 'change').length >= n ? resolve() : Date.now() - t0 > 4000 ? reject(new Error(`only ${events} after 4s`)) : setTimeout(tick, 50));
    tick();
  });
  try {
    await new Promise((r) => setTimeout(r, 200));
    fs.mkdirSync(path.join(product, 'flows'), { recursive: true });
    fs.writeFileSync(path.join(product, 'features.md'), '# Feature Map\n');
    await waitFor(1);
    await new Promise((r) => setTimeout(r, 300));
    fs.writeFileSync(path.join(product, 'flows', 'a.md'), '---\nid: a\n---\n');
    await waitFor(2);
    await new Promise((r) => setTimeout(r, 300));
    fs.appendFileSync(path.join(product, 'features.md'), '\n## Area\n');
    await waitFor(3);
  } finally {
    ac.abort();
    await close();
    await stream;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
