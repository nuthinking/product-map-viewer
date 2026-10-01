import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProductMap, formatReport } from '../src/validate.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const example = path.join(here, '..', 'example', 'product');
const broken = path.join(here, 'fixtures', 'broken', 'product');

test('the example Product Map is valid', () => {
  const rep = validateProductMap(example);
  assert.equal(rep.errors.length, 0, formatReport(rep));
  assert.equal(rep.warnings.length, 0, formatReport(rep));
  const summary = rep.infos.at(-1).message;
  assert.match(summary, /11 features, 6 flows, 2 unclear-behavior markers, 0 UI\/code disagreements/);
});

test('a missing folder is an error', () => {
  const rep = validateProductMap(path.join(here, 'nope'));
  assert.equal(rep.errors.length, 1);
  assert.match(rep.errors[0].message, /does not exist/);
});

test('the broken fixture reports every class of problem', () => {
  const rep = validateProductMap(broken);
  const msgs = rep.items.map((i) => `${i.level} ${i.path}: ${i.message}`);
  const has = (level, re) => assert.ok(msgs.some((m) => m.startsWith(level) && re.test(m)), `expected ${level} matching ${re}\n${msgs.join('\n')}`);
  has('error', /feature 'No id here' has no \*\*ID:\*\* line/);
  has('error', /feature ID 'Bad_ID' is not kebab-case/);
  has('error', /duplicate feature ID 'good-feature'/);
  has('error', /feature status 'shipped' must be one of/);
  has('error', /broken link: \[Missing\]\(flows\/does-not-exist.md\)/);
  has('error', /broken anchor: \[Nope\]\(..\/features.md#nope\)/);
  has('error', /frontmatter id 'wrong-id' must match the file name 'unlisted'/);
  has('error', /status 'someday' must be one of/);
  has('error', /references unknown feature 'ghost-feature'/);
  has('warning', /flows\/unlisted.md: missing '## Goal' section/);
  has('error', /mermaid: 'end' is a reserved word/);
  has('warning', /mermaid: a label in .* contains/);
  has('warning', /node 'B' is used but never given a label|node 'C' is used but never given a label/);
  has('warning', /flows with the same title 'working flow'/);
  has('warning', /feature 'Bad_ID' links to flow 'working' but that flow's frontmatter does not list 'Bad_ID'/);
  has('warning', /README.md: does not link to flows\/unlisted.md/);
  has('warning', /README.md: does not link to features.md/);
  assert.ok(rep.errors.length >= 9);
});

test('formatReport ends with the verdict line', () => {
  const rep = validateProductMap(example);
  const text = formatReport(rep);
  assert.ok(text.endsWith('Product Map is structurally valid.'));
  assert.match(text, /0 error\(s\), 0 warning\(s\)/);
});
