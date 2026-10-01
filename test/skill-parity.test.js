// The cases from the skill's scripts/test_validate.py, so the port stays in lockstep.
// Set PRODUCT_MAP_SKILL=/path/to/skills/product-map to also diff the output of the two validators.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateProductMap, formatReport } from '../src/validate.js';
import { headingAnchors } from '../src/markdown-utils.js';

const FEATURES = `# Feature Map

## Area

### Add a task
**ID:** \`add-task\`
**Description:** Add a task.
**Flows:** [Add a task](flows/add-task.md)
**Status:** \`active\`
`;
const README = `# App

See [Feature Map](features.md#area) and [Add a task](flows/add-task.md).
`;
const flow = ({ features = '  - add-task', heading = '## Flow', body = '    A[Start] --> B{Ok?}\n    B -->|Yes| C([Done])\n    B -->|No| A' } = {}) =>
  `---\nid: add-task\ntitle: Add a task\nfeatures:\n${features}\nstatus: active\n---\n\n# Add a task\n\n## Goal\n\nGoal.\n\n${heading}\n\n\`\`\`mermaid\nflowchart TD\n${body}\n\`\`\`\n`;

function withProduct(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-'));
  const product = path.join(dir, 'product');
  fs.mkdirSync(path.join(product, 'flows'), { recursive: true });
  const all = { 'README.md': README, 'features.md': FEATURES, ...files };
  for (const [rel, content] of Object.entries(all)) fs.writeFileSync(path.join(product, rel), content);
  try {
    const rep = validateProductMap(product);
    parity(product, rep);
    return fn(rep.errors.map((e) => e.message), rep.warnings.map((w) => w.message), product);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function parity(product, rep) {
  const skill = process.env.PRODUCT_MAP_SKILL;
  if (!skill) return;
  const py = spawnSync('python3', [path.join(skill, 'scripts', 'validate.py'), product], { encoding: 'utf8' });
  assert.equal(py.stdout.trim(), formatReport(rep).trim(), 'Python and JS validators disagree');
}

test('clean map passes', () =>
  withProduct({ 'flows/add-task.md': flow() }, (errors, warnings) => {
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  }));

test('unindented feature list is parsed', () =>
  withProduct({ 'flows/add-task.md': flow({ features: '- add-taskz' }) }, (errors) => {
    assert.ok(errors.some((e) => e.includes("unknown feature 'add-taskz'")), errors);
  }));

test('backticked status accepted and bad status rejected', () => {
  withProduct({ 'flows/add-task.md': flow() }, (errors) => assert.deepEqual(errors, []));
  withProduct({ 'flows/add-task.md': flow(), 'features.md': FEATURES.replace('`active`', '`shipped`') }, (errors) => {
    assert.ok(errors.some((e) => e.includes("status 'shipped'")), errors);
  });
});

test('diagram outside the Flow section is an error', () =>
  withProduct({ 'flows/add-task.md': flow({ heading: '## Flow\n\n## Notes' }) }, (errors) => {
    assert.ok(errors.some((e) => e.includes("inside the '## Flow' section")), errors);
  }));

test('keyword-prefixed node ids are checked', () =>
  withProduct({ 'flows/add-task.md': flow({ body: '    style-picker[Pick style] --> end-x[Done (now)]' }) }, (_, warnings) => {
    assert.ok(warnings.some((w) => w.includes('quote it')), warnings);
  }));

test("reserved word 'end' is still rejected", () =>
  withProduct({ 'flows/add-task.md': flow({ body: '    A[Start] --> end' }) }, (errors) => {
    assert.ok(errors.some((e) => e.includes("'end' is a reserved word")), errors);
  }));

test('digits in kebab ids do not split', () =>
  withProduct({ 'flows/add-task.md': flow({ body: '    add-2-cart[Add to cart] --> B{Ok?}\n    B -->|Yes| C([Done])\n    B -->|No| add-2-cart' }) }, (_, warnings) => {
    assert.deepEqual(warnings, []);
  }));

test('anchors ignore headings inside nested fences', () =>
  withProduct({ 'flows/add-task.md': flow(), 'features.md': FEATURES + '\n````md\n### Not a feature\n```\n### Also not\n```\n````\n' }, (errors, _, product) => {
    assert.deepEqual(errors, []);
    const anchors = headingAnchors(fs.readFileSync(path.join(product, 'features.md'), 'utf8'));
    assert.ok(!anchors.has('not-a-feature'));
    assert.ok(!anchors.has('also-not'));
  }));

test('non-Markdown files in the folder are ignored', () =>
  withProduct({ 'flows/add-task.md': flow(), 'validate.py': 'print(1)\n', 'flows/notes.txt': 'x' }, (errors, warnings) => {
    assert.deepEqual(errors, []);
    assert.deepEqual(warnings, []);
  }));
