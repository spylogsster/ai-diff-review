#!/usr/bin/env node
/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import { runCli } from '../cli.js';

const code = runCli(process.argv.slice(2));
if (code !== 0) {
  process.exit(code);
}
