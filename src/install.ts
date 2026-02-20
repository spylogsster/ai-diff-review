/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const HOOK_CONTENT = `#!/bin/sh
set -e

if npx --no-install ai-review-hook pre-commit; then
  exit 0
fi

npx ai-review-hook pre-commit
`;

function setHooksPath(hooksPath: string): void {
  const run = spawnSync('git', ['config', 'core.hooksPath', hooksPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (run.status !== 0) {
    const error = (run.stderr || run.stdout || 'git config failed').trim();
    throw new Error(error);
  }
}

export function installPreCommitHook(cwd = process.cwd()): void {
  const hooksDir = resolve(cwd, '.githooks');
  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  const hookPath = join(hooksDir, 'pre-commit');
  writeFileSync(hookPath, HOOK_CONTENT, 'utf8');
  chmodSync(hookPath, 0o755);
  setHooksPath('.githooks');

  console.log(`Installed pre-commit hook at ${hookPath}`);
  console.log('Configured git core.hooksPath=.githooks');
}
