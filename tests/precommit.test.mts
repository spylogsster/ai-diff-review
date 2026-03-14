/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPreCommit } from '../src/precommit.ts';

test('runPreCommit forwards verbose=true to runReview', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-review-precommit-test-'));
  mkdirSync(join(cwd, '.git'), { recursive: true });

  const savedCI = process.env.CI;
  delete process.env.CI;

  let capturedVerbose = false;
  try {
    const code = await runPreCommit(
      cwd,
      { verbose: true },
      {
        runReviewFn: async (_cwd, options) => {
          capturedVerbose = options?.verbose === true;
          return { pass: true, reportPath: join(cwd, '.git', 'ai-review-last.json'), reason: 'ok' };
        },
      },
    );

    assert.equal(code, 0);
    assert.equal(capturedVerbose, true);
  } finally {
    if (savedCI !== undefined) process.env.CI = savedCI;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('runPreCommit returns 0 when rmSync on fail-count throws EPERM', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-review-precommit-eperm-'));
  const gitDir = join(cwd, '.git');
  mkdirSync(gitDir, { recursive: true });

  const failCountPath = join(gitDir, 'ai-review-fail-count');
  writeFileSync(failCountPath, '3', 'utf8');

  const savedCI = process.env.CI;
  delete process.env.CI;

  try {
    // Make .git dir read-only so rmSync throws EPERM
    chmodSync(gitDir, 0o444);

    const code = await runPreCommit(
      cwd,
      {},
      {
        runReviewFn: async () => ({
          pass: true,
          reportPath: join(gitDir, 'ai-review-last.json'),
          reason: 'ok',
        }),
      },
    );

    assert.equal(code, 0, 'should return 0 even when rmSync fails');
  } finally {
    if (savedCI !== undefined) process.env.CI = savedCI;
    chmodSync(gitDir, 0o755);
    rmSync(cwd, { recursive: true, force: true });
  }
});
