/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPreCommit } from '../src/precommit.ts';

test('runPreCommit forwards verbose=true to runReview', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-review-precommit-test-'));
  mkdirSync(join(cwd, '.git'), { recursive: true });

  const savedCI = process.env.CI;
  delete process.env.CI;

  let capturedVerbose = false;
  try {
    const code = runPreCommit(
      cwd,
      { verbose: true },
      {
        runReviewFn: (_cwd, options) => {
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
