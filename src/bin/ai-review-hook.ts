#!/usr/bin/env node
import { runCli } from '../cli.js';

const code = runCli(process.argv.slice(2));
if (code !== 0) {
  process.exit(code);
}
