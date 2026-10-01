# @nuthinking/product-map

A local viewer and validator for a **Product Map**: a sitemap for what your software *does*, kept as Markdown in `/product` next to the code.

A Product Map has two parts:

- **Feature Map** (`product/features.md`): user-visible capabilities grouped by product area, each with a stable ID.
- **Product Flows** (`product/flows/*.md`): one Mermaid flowchart per major user goal, with behavior details.

The Markdown is the source of truth and renders fine on GitHub. This package only reads, validates and renders it, a bit like Storybook does for components.

![A flow page: the Mermaid diagram with pan and zoom, behavior details below](https://raw.githubusercontent.com/nuthinking/product-map-viewer/main/docs/screenshots/flow.png)

The format and the agent skill that writes the map live in [nuthinking/skills](https://github.com/nuthinking/skills) (`product-map`).

## Use

One-off, in any repo that has a `product/` folder:

```bash
npx @nuthinking/product-map
```

As a dev dependency with a script:

```bash
npm install --save-dev @nuthinking/product-map
```

```json
{
  "scripts": {
    "product-map": "product-map"
  }
}
```

```bash
npm run product-map                 # serve the viewer
npm run product-map -- validate     # validate, exit 1 on errors (use it in CI)
```

The viewer opens at `http://127.0.0.1:4747` (or the next free port) and reloads whenever a file under `product/` changes.

## Commands

```text
product-map [serve] [dir] [options]   Serve the viewer (default)
product-map validate [dir] [--json]   Validate and exit 1 on errors

dir                 Path to the Product Map folder. Defaults to ./product,
                    or to the current folder when it contains features.md.

-p, --port <n>      Port (default 4747; the next free port is used when busy)
-H, --host <host>   Host to bind (default 127.0.0.1)
    --open          Open the browser (default when run from a terminal)
    --no-open       Do not open the browser
    --no-watch      Do not watch the folder for changes
    --json          Machine-readable validation report
```

## What the viewer shows

| Feature Map | Relationship map |
|---|---|
| ![Feature cards grouped by area](https://raw.githubusercontent.com/nuthinking/product-map-viewer/main/docs/screenshots/feature-map.png) | ![Features and flows side by side with their connections](https://raw.githubusercontent.com/nuthinking/product-map-viewer/main/docs/screenshots/relationship-map.png) |

| Overview | Review |
|---|---|
| ![The README with counts for features, flows and open questions](https://raw.githubusercontent.com/nuthinking/product-map-viewer/main/docs/screenshots/overview.png) | ![Open questions with copy-prompt buttons](https://raw.githubusercontent.com/nuthinking/product-map-viewer/main/docs/screenshots/review.png) |


- **Overview**: the README with counts for features, flows, open questions and validation problems.
- **Feature Map**: one card per feature (ID, description, entry point, flows, code pointers, status), grouped by area. A **Map** mode draws features and flows side by side with the connections between them.
- **Flows**: the Mermaid diagram with pan, zoom, fullscreen and source view. Clicking a node jumps to its behavior details. Related features and flows link across the viewer.
- **Review**: the validation report (same checks as `product-map validate`) and every `⚠️ Behavior unclear` or `⚠️ UI and code disagree` marker in one list. Each item has a **Copy fix prompt** button: paste the prompt into a coding agent that has the product-map skill and it fixes that one problem or resolves that one question. Select several cards with the dot on their left to get one prompt for all of them.

Theme follows the system by default; the menu in the sidebar footer lets you pin Light or Dark, and the choice is stored in the browser for the viewer's local URL, so every repo you open on the same port shares it. Fuzzy search over features and flows (`/` or `⌘K`, Enter opens the best match), `[` and `]` to move between flows.

The sidebar and the browser tab show the product's own icon when one can be found: `product/icon.*` or `product/favicon.*` first, then the `<link rel="icon">` of the repo's `index.html`, then the usual places (`favicon.svg|png|ico` at the repo root or under `public/`, `static/`, `app/`, `src/app/` and similar). Otherwise a generic icon is used.

## Validation

`product-map validate` checks the contract of the Product Map format:

- `README.md`, `features.md` and `flows/*.md` exist
- feature IDs are present, kebab-case and unique
- flow frontmatter has `id`, `title`, `features`, `status`; `id` matches the file name
- every feature a flow references exists
- relative links and `#anchors` between Product Map files resolve
- each flow has one Mermaid flowchart with sane syntax (balanced brackets, no reserved node IDs, labeled nodes)
- likely duplicate flows are flagged

It is a port of the `validate.py` script that ships with the skill, so both report the same problems. When the skill has copied that script into `product/validate.py`, the viewer ignores it, like any other non-Markdown file in the folder.

## Programmatic use

```js
import { loadProductMap, validateProductMap, serve } from '@nuthinking/product-map';

const map = loadProductMap('product');          // parsed model (features, flows, markers)
const report = validateProductMap('product');   // { errors, warnings, items }
const { url, close } = await serve({ productDir: 'product', port: 0 });
```

## Development

```bash
npm install
npm run dev        # serves example/product
npm test
```

Requires Node 18 or newer. No build step: the server is plain Node and the client is static files.

## License

MIT
# product-map-viewer
