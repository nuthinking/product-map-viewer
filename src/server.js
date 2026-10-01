// Local HTTP server: serves the client, the parsed Product Map as JSON,
// the validation report, the Mermaid bundle, and a live-reload event stream.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadProductMap } from './parse.js';
import { validateProductMap } from './validate.js';
import { findProductIcon, findRepoRoot } from './icon.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.join(here, '..', 'client');
const require = createRequire(import.meta.url);
const mermaidDist = path.join(path.dirname(require.resolve('mermaid/package.json')), 'dist');
const fuseDist = path.dirname(require.resolve('fuse.js/min'));
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

function send(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(body);
}

function sendFile(res, filePath, cache = false) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return send(res, 404, 'Not found');
  const type = MIME[path.extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache ? 'public, max-age=86400' : 'no-store' });
  fs.createReadStream(filePath).pipe(res);
}

function insideDir(dir, target) {
  const rel = path.relative(dir, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Watch the product folder; calls onChange (debounced) on any change. Returns a close() function.
 * A Product Map is two levels deep (product/ and product/flows/), so both are watched directly
 * rather than relying on recursive watching, which Node 18 silently ignores on Linux. Folders that
 * do not exist yet (a map being created) are picked up on the next change event, so the watch
 * keeps working after /product or /product/flows appears.
 */
function watchProduct(productDir, onChange) {
  const watchers = new Map(); // dir -> FSWatcher
  let timer = null;
  const targets = () => [path.dirname(productDir), productDir, path.join(productDir, 'flows')];
  const arm = () => {
    for (const dir of targets()) {
      if (watchers.has(dir) || !fs.existsSync(dir)) continue;
      try {
        const w = fs.watch(dir, {}, fire);
        w.on('error', () => {
          w.close();
          watchers.delete(dir);
        });
        watchers.set(dir, w);
      } catch {
        // unwatchable folder: ignored, retried on the next change
      }
    }
  };
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      arm();
      onChange();
    }, 120);
  };
  arm();
  return () => {
    clearTimeout(timer);
    for (const w of watchers.values()) w.close();
    watchers.clear();
  };
}

/**
 * Start the viewer. Resolves to { server, url, port, close }.
 * @param {object} opts
 * @param {string} opts.productDir absolute path to /product
 * @param {number} [opts.port] preferred port; the next free ones are tried when busy
 * @param {string} [opts.host]
 * @param {boolean} [opts.watch]
 * @param {(msg: string) => void} [opts.log]
 */
export async function serve({ productDir, port = 4747, host = '127.0.0.1', watch = true, log = () => {} }) {
  const clients = new Set();
  let cache = null;
  const getData = () => {
    if (!cache) {
      const map = loadProductMap(productDir);
      const report = validateProductMap(productDir).toJSON();
      const icon = findProductIcon(productDir);
      const iconUrl = icon ? `/product-icon?v=${fs.statSync(icon.path).mtimeMs}${path.extname(icon.path)}` : null;
      const productRel = path.relative(findRepoRoot(productDir), productDir).split(path.sep).join('/') || 'product';
      cache = { map: { ...map, icon: iconUrl, iconFile: icon ? path.relative(icon.root, icon.path) : null, productRel }, report, icon };
    }
    return cache;
  };
  const invalidate = () => {
    cache = null;
    for (const res of clients) res.write(`event: change\ndata: ${Date.now()}\n\n`);
    log(`change detected, ${clients.size} viewer${clients.size === 1 ? '' : 's'} notified`);
  };
  const closeWatch = watch ? watchProduct(productDir, invalidate) : () => {};

  const server = http.createServer((req, res) => {
    let p;
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      try {
        p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      } catch {
        return send(res, 400, 'Bad request: malformed URL');
      }
      if (p === '/' || p === '/index.html') return sendFile(res, path.join(clientDir, 'index.html'));
      if (p === '/api/map') {
        const { map } = getData();
        return send(res, 200, JSON.stringify({ ...map, version: pkg.version }), MIME['.json']);
      }
      if (p === '/api/validate') {
        const { report } = getData();
        return send(res, 200, JSON.stringify(report), MIME['.json']);
      }
      if (p === '/product-icon') {
        const { icon } = getData();
        if (!icon) return send(res, 404, 'No product icon found');
        res.writeHead(200, { 'Content-Type': icon.mime, 'Cache-Control': 'no-cache' });
        return fs.createReadStream(icon.path).pipe(res);
      }
      if (p === '/api/health') return send(res, 200, JSON.stringify({ ok: true, version: pkg.version, productDir }), MIME['.json']);
      if (p === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write(`event: hello\ndata: ${Date.now()}\n\n`);
        clients.add(res);
        const ping = setInterval(() => res.write(': ping\n\n'), 25000);
        req.on('close', () => {
          clearInterval(ping);
          clients.delete(res);
        });
        return;
      }
      if (p.startsWith('/vendor/mermaid/')) {
        const file = path.join(mermaidDist, p.slice('/vendor/mermaid/'.length));
        if (!insideDir(mermaidDist, file)) return send(res, 403, 'Forbidden');
        return sendFile(res, file, true);
      }
      if (p.startsWith('/vendor/fuse/')) {
        const file = path.join(fuseDist, p.slice('/vendor/fuse/'.length));
        if (!insideDir(fuseDist, file)) return send(res, 403, 'Forbidden');
        return sendFile(res, file, true);
      }
      if (p.startsWith('/raw/')) {
        const file = path.join(productDir, p.slice('/raw/'.length));
        if (!insideDir(productDir, file) || !file.endsWith('.md')) return send(res, 403, 'Forbidden');
        return sendFile(res, file);
      }
      const asset = path.join(clientDir, p);
      if (insideDir(clientDir, asset)) return sendFile(res, asset);
      return send(res, 404, 'Not found');
    } catch (err) {
      log(`error handling ${p}: ${err.message}`);
      return send(res, 500, `Internal error: ${err.message}`);
    }
  });

  const chosenPort = await listen(server, host, port);
  const url = `http://${host === '0.0.0.0' ? 'localhost' : host}:${chosenPort}`;
  const close = () =>
    new Promise((resolve) => {
      closeWatch();
      for (const res of clients) res.end();
      clients.clear();
      server.close(() => resolve());
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    });
  return { server, url, port: chosenPort, close };
}

function listen(server, host, port, attempts = 20) {
  return new Promise((resolve, reject) => {
    let current = port;
    let tries = 0;
    const onError = (err) => {
      if (err.code === 'EADDRINUSE' && tries < attempts) {
        tries++;
        current++;
        server.listen(current, host);
      } else {
        server.off('error', onError);
        reject(err);
      }
    };
    server.on('error', onError);
    server.once('listening', () => {
      server.off('error', onError);
      resolve(server.address().port);
    });
    server.listen(current, host);
  });
}
