#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import { runCli } from '../cli.js';

runCli(process.argv.slice(2)).then((code) => {
  if (code !== 0) {
    process.exit(code);
  }
}).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
