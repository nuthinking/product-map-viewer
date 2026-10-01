import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProductMap, formatReport } from './validate.js';
import { serve } from './server.js';
import { openBrowser } from './open.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

const HELP = `product-map ${pkg.version}
Local viewer and validator for a repo-native Product Map (/product).

Usage
  product-map [serve] [dir] [options]   Serve the viewer (default command)
  product-map validate [dir] [--json]   Validate the Product Map and exit 1 on errors
  product-map --help | --version

Arguments
  dir                 Path to the Product Map folder. Defaults to ./product,
                      or to the current folder when it contains features.md.

Options (serve)
  -p, --port <n>      Port to listen on (default 4747; the next free port is used when busy)
  -H, --host <host>   Host to bind (default 127.0.0.1; use 0.0.0.0 to expose on the network)
      --open          Open the browser (default when running in a terminal)
      --no-open       Do not open the browser
      --no-watch      Do not watch the folder for changes

Options (validate)
      --json          Machine-readable report
`;

export function parseArgs(argv) {
  const opts = { command: null, dir: null, port: 4747, host: '127.0.0.1', open: null, watch: true, json: false, help: false, version: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') opts.help = true;
    else if (a === '-v' || a === '--version') opts.version = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--open') opts.open = true;
    else if (a === '--no-open') opts.open = false;
    else if (a === '--no-watch') opts.watch = false;
    else if (a === '-p' || a === '--port') opts.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) opts.port = Number(a.slice(7));
    else if (a === '-H' || a === '--host') opts.host = argv[++i];
    else if (a.startsWith('--host=')) opts.host = a.slice(7);
    else if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    else positional.push(a);
  }
  if (positional[0] === 'serve' || positional[0] === 'validate') opts.command = positional.shift();
  else opts.command = 'serve';
  opts.dir = positional[0] ?? null;
  if (positional.length > 1) throw new Error(`Unexpected argument: ${positional[1]}`);
  if (!Number.isInteger(opts.port) || opts.port < 0 || opts.port > 65535) throw new Error(`Invalid port: ${opts.port}`);
  return opts;
}

/** ./product, or the cwd itself when it already is a Product Map folder. */
export function resolveProductDir(dir, cwd = process.cwd()) {
  if (dir) return path.resolve(cwd, dir);
  const candidate = path.join(cwd, 'product');
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
  if (fs.existsSync(path.join(cwd, 'features.md')) && fs.existsSync(path.join(cwd, 'flows'))) return cwd;
  return candidate;
}

export async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    io.stderr.write(`${err.message}\n\n${HELP}`);
    return 2;
  }
  if (opts.help) {
    io.stdout.write(HELP);
    return 0;
  }
  if (opts.version) {
    io.stdout.write(`${pkg.version}\n`);
    return 0;
  }
  const productDir = resolveProductDir(opts.dir);

  if (opts.command === 'validate') {
    const rep = validateProductMap(productDir);
    io.stdout.write(opts.json ? JSON.stringify(rep.toJSON(), null, 2) + '\n' : formatReport(rep) + '\n');
    return rep.errors.length ? 1 : 0;
  }

  const rel = path.relative(process.cwd(), productDir) || '.';
  if (!fs.existsSync(productDir)) {
    io.stderr.write(`Note: ${rel} does not exist yet. The viewer will show how to create it and reload when it appears.\n`);
  }
  const log = (msg) => io.stdout.write(`  ${msg}\n`);
  const { url, close } = await serve({ productDir, port: opts.port, host: opts.host, watch: opts.watch, log });
  io.stdout.write(`\n  Product Map viewer ${pkg.version}\n\n  Folder   ${rel}\n  Local    ${url}\n\n  Press Ctrl+C to stop.\n\n`);
  const shouldOpen = opts.open ?? (Boolean(process.stdout.isTTY) && !process.env.CI);
  if (shouldOpen) openBrowser(url);
  const stop = async () => {
    await close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return null; // keeps running
}
