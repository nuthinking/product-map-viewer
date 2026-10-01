import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, resolveProductDir } from '../src/cli.js';
import { serve } from '../src/server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const example = path.join(root, 'example', 'product');
const bin = path.join(root, 'bin', 'product-map.js');

test('parseArgs', () => {
  assert.equal(parseArgs([]).command, 'serve');
  assert.deepEqual(parseArgs(['validate', 'docs/product', '--json']), { ...parseArgs([]), command: 'validate', dir: 'docs/product', json: true });
  assert.equal(parseArgs(['serve', '-p', '5000', '--no-open']).port, 5000);
  assert.equal(parseArgs(['--port=5001']).port, 5001);
  assert.equal(parseArgs(['--no-open']).open, false);
  assert.equal(parseArgs(['--open']).open, true);
  assert.equal(parseArgs(['-H', '0.0.0.0']).host, '0.0.0.0');
  assert.throws(() => parseArgs(['--bogus']), /Unknown option/);
  assert.throws(() => parseArgs(['a', 'b']), /Unexpected argument/);
  assert.throws(() => parseArgs(['--port', 'x']), /Invalid port/);
});

test('resolveProductDir', () => {
  assert.equal(resolveProductDir('x/y', '/cwd'), path.resolve('/cwd', 'x/y'));
  assert.equal(resolveProductDir(null, path.join(root, 'example')), example);
  assert.equal(resolveProductDir(null, example), example);
  assert.equal(resolveProductDir(null, '/nowhere'), '/nowhere/product');
});

test('validate exits 0 on the example and 1 on the broken fixture', () => {
  const ok = spawnSync(process.execPath, [bin, 'validate', example], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /Product Map is structurally valid/);
  const bad = spawnSync(process.execPath, [bin, 'validate', path.join(here, 'fixtures', 'broken', 'product'), '--json'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  const json = JSON.parse(bad.stdout);
  assert.ok(json.errors > 0);
  assert.ok(Array.isArray(json.items));
});

test('--help and --version', () => {
  const h = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' });
  assert.equal(h.status, 0);
  assert.match(h.stdout, /Usage/);
  const v = spawnSync(process.execPath, [bin, '--version'], { encoding: 'utf8' });
  assert.match(v.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('server serves the client, the model, the report and mermaid', async () => {
  const { url, close } = await serve({ productDir: example, port: 0, watch: false });
  try {
    const index = await fetch(`${url}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /<div id="app"/);
    const map = await (await fetch(`${url}/api/map`)).json();
    assert.equal(map.name, 'Tasko');
    assert.equal(map.flows.length, 6);
    const report = await (await fetch(`${url}/api/validate`)).json();
    assert.equal(report.errors, 0);
    const mermaid = await fetch(`${url}/vendor/mermaid/mermaid.min.js`);
    assert.equal(mermaid.status, 200);
    assert.match(mermaid.headers.get('content-type'), /javascript/);
    const fuse = await fetch(`${url}/vendor/fuse/fuse.min.mjs`);
    assert.equal(fuse.status, 200);
    const raw = await fetch(`${url}/raw/flows/add-task.md`);
    assert.equal(raw.status, 200);
    assert.equal((await fetch(`${url}/raw/..%2F..%2Fpackage.json`)).status, 403);
    assert.equal((await fetch(`${url}/raw/flows/add-task.txt`)).status, 403);
    assert.equal((await fetch(`${url}/nope.js`)).status, 404);
  } finally {
    await close();
  }
});
