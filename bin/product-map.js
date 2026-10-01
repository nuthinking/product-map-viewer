#!/usr/bin/env node
import { main } from '../src/cli.js';

main().then((code) => {
  if (code !== null && code !== undefined) process.exit(code);
}).catch((err) => {
  process.stderr.write(`product-map: ${err.message}\n`);
  process.exit(1);
});
