import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProductMap } from '../src/parse.js';
import { resolveLink, renderMarkdown } from '../src/markdown.js';
import { slugify, parseFrontmatter, headingAnchors } from '../src/markdown-utils.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const example = path.join(here, '..', 'example', 'product');

test('loads the example into a model', () => {
  const map = loadProductMap(example);
  assert.equal(map.name, 'Tasko');
  assert.equal(map.counts.features, 11);
  assert.equal(map.counts.flows, 6);
  assert.equal(map.counts.unclear, 2);
  assert.deepEqual(map.featureMap.areas.map((a) => a.name), ['Tasks', 'Collaboration', 'Account']);
  const add = map.featureMap.areas[0].features[0];
  assert.equal(add.id, 'add-task');
  assert.equal(add.slug, 'add-a-task');
  assert.equal(add.status, 'active');
  assert.deepEqual(add.flows.map((f) => f.id), ['add-task', 'onboarding']);
  assert.deepEqual(add.implementation, ['`src/features/quick-add/`', '`src/lib/parse-task-text.ts`']);
  const planned = map.featureMap.areas[2].features.find((f) => f.id === 'export-data');
  assert.equal(planned.status, 'planned');
});

test('flow model carries diagram, goal, sections and feature back-links', () => {
  const map = loadProductMap(example);
  const flow = map.flows.find((f) => f.id === 'add-task');
  assert.equal(flow.title, 'Add a task');
  assert.match(flow.diagram, /^flowchart TD/);
  assert.match(flow.goalHtml, /Capture a task/);
  assert.deepEqual(flow.sections.map((s) => s.title), ['Behavior details', 'Related features', 'Related flows', 'Implementation references']);
  assert.match(flow.sections[0].html, /<h4 id="save" data-heading="Save">/);
  assert.match(flow.sections[0].html, /marker-unclear/);
  assert.match(flow.sections[1].html, /href="#\/features\/add-a-task" class="internal"/);
  assert.match(flow.sections[2].html, /href="#\/flows\/onboarding"/);
  assert.match(flow.sections[3].html, /<code>src\/sync\/outbox.ts<\/code>/);
  const scheduling = map.featureMap.areas[0].features.find((f) => f.id === 'scheduling');
  assert.deepEqual(scheduling.usedBy.map((u) => u.id).sort(), ['add-task', 'complete-recurring-task', 'plan-the-day']);
});

test('a missing folder yields an empty model', () => {
  const map = loadProductMap(path.join(here, 'nope'));
  assert.equal(map.readme, null);
  assert.equal(map.featureMap, null);
  assert.deepEqual(map.flows, []);
});

test('resolveLink maps Product Map links to viewer routes', () => {
  assert.deepEqual(resolveLink('README.md', 'flows/add-task.md'), { href: '#/flows/add-task', kind: 'route' });
  assert.deepEqual(resolveLink('README.md', 'features.md#tasks'), { href: '#/features/tasks', kind: 'route' });
  assert.deepEqual(resolveLink('flows/a.md', '../features.md#add-a-task'), { href: '#/features/add-a-task', kind: 'route' });
  assert.deepEqual(resolveLink('flows/a.md', 'b.md'), { href: '#/flows/b', kind: 'route' });
  assert.deepEqual(resolveLink('flows/a.md', '../README.md'), { href: '#/overview', kind: 'route' });
  assert.deepEqual(resolveLink('features.md', '../src/app/page.tsx'), { href: '../src/app/page.tsx', kind: 'repo' });
  assert.deepEqual(resolveLink('features.md', 'https://example.com'), { href: 'https://example.com', kind: 'external' });
});

test('renderMarkdown adds heading ids, rewrites links and keeps mermaid blocks', () => {
  const html = renderMarkdown('## Hello World\n\nSee [x](flows/x.md) and [ext](https://e.com).\n\n```mermaid\nflowchart TD\n  A --> B\n```\n', { fromRel: 'README.md' });
  assert.match(html, /<h2 id="hello-world"/);
  assert.match(html, /<a href="#\/flows\/x" class="internal">x<\/a>/);
  assert.match(html, /target="_blank" rel="noopener">ext<\/a>/);
  assert.match(html, /class="mermaid-block" data-mermaid="flowchart TD/);
});

test('markdown utils match the Python validator', () => {
  assert.equal(slugify('Organize tasks in projects & sections'), 'organize-tasks-in-projects--sections');
  assert.equal(slugify('`code` and *emphasis*'), 'code-and-emphasis');
  assert.deepEqual([...headingAnchors('# A\n## A\n```\n# not a heading\n```\n## B c')], ['a', 'a-1', 'b-c']);
  const { data, bodyStart } = parseFrontmatter('---\nid: x\nfeatures:\n  - a\n  - "b"\ntags: [p, q]\nstatus: active\n---\n# T');
  assert.deepEqual(data, { id: 'x', features: ['a', 'b'], tags: ['p', 'q'], status: 'active' });
  assert.equal(bodyStart, 8);
  assert.deepEqual(parseFrontmatter('no frontmatter'), { data: null, bodyStart: 0 });
});
