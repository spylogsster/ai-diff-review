/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasVerboseFlag, runCli, type CliDeps } from '../src/cli.ts';

function makeDeps() {
  const calls = {
    runReview: [] as Array<{ cwd: string; options: { verbose: boolean } }>,
    runPreCommit: [] as Array<{ cwd: string; options: { verbose: boolean } }>,
    install: 0,
    logs: [] as string[],
  };

  const deps: CliDeps = {
    runReview: (cwd, options) => {
      calls.runReview.push({ cwd, options: { verbose: options?.verbose === true } });
      return { pass: true, reportPath: 'report.json', reason: 'ok' };
    },
    runPreCommit: (cwd, options) => {
      calls.runPreCommit.push({ cwd, options: { verbose: options?.verbose === true } });
      return 0;
    },
    installPreCommitHook: () => {
      calls.install += 1;
    },
    getCwd: () => '/tmp/repo',
    log: (message) => {
      calls.logs.push(message);
    },
  };

  return { deps, calls };
}

test('hasVerboseFlag detects --verbose option', () => {
  assert.equal(hasVerboseFlag(['review', '--verbose']), true);
  assert.equal(hasVerboseFlag(['review']), false);
});

test('runCli passes verbose=true to review command', () => {
  const { deps, calls } = makeDeps();
  const exitCode = runCli(['review', '--verbose'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runReview, [{ cwd: '/tmp/repo', options: { verbose: true } }]);
});

test('runCli passes verbose=true to pre-commit command', () => {
  const { deps, calls } = makeDeps();
  const exitCode = runCli(['pre-commit', '--verbose'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runPreCommit, [{ cwd: '/tmp/repo', options: { verbose: true } }]);
});

test('runCli renders help for unknown command and exits with failure', () => {
  const { deps, calls } = makeDeps();
  const exitCode = runCli(['unknown'], deps);
  assert.equal(exitCode, 1);
  assert.ok(calls.logs.some((line) => line.includes('ai-review-hook <command> [options]')));
});
