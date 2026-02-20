/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasVerboseFlag, hasCodexFlag, hasCopilotFlag, runCli, type CliDeps } from '../src/cli.ts';

function makeDeps() {
  const calls = {
    runReview: [] as Array<{ cwd: string; options: { verbose: boolean; reviewer?: string } }>,
    runPreCommit: [] as Array<{ cwd: string; options: { verbose: boolean; reviewer?: string } }>,
    install: 0,
    logs: [] as string[],
  };

  const deps: CliDeps = {
    runReview: (cwd, options) => {
      calls.runReview.push({ cwd, options: { verbose: options?.verbose === true, reviewer: options?.reviewer } });
      return { pass: true, reportPath: 'report.json', reason: 'ok' };
    },
    runPreCommit: (cwd, options) => {
      calls.runPreCommit.push({ cwd, options: { verbose: options?.verbose === true, reviewer: options?.reviewer } });
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
  assert.deepEqual(calls.runReview, [{ cwd: '/tmp/repo', options: { verbose: true, reviewer: undefined } }]);
});

test('runCli passes verbose=true to pre-commit command', () => {
  const { deps, calls } = makeDeps();
  const exitCode = runCli(['pre-commit', '--verbose'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runPreCommit, [{ cwd: '/tmp/repo', options: { verbose: true, reviewer: undefined } }]);
});

test('hasCodexFlag detects --codex option', () => {
  assert.equal(hasCodexFlag(['review', '--codex']), true);
  assert.equal(hasCodexFlag(['review']), false);
});

test('hasCopilotFlag detects --copilot option', () => {
  assert.equal(hasCopilotFlag(['review', '--copilot']), true);
  assert.equal(hasCopilotFlag(['review']), false);
});

test('runCli passes reviewer=codex to review command', () => {
  const { deps, calls } = makeDeps();
  const exitCode = runCli(['review', '--codex'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runReview, [{ cwd: '/tmp/repo', options: { verbose: false, reviewer: 'codex' } }]);
});

test('runCli passes reviewer=copilot to review command', () => {
  const { deps, calls } = makeDeps();
  const exitCode = runCli(['review', '--copilot'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runReview, [{ cwd: '/tmp/repo', options: { verbose: false, reviewer: 'copilot' } }]);
});

test('runCli passes reviewer=codex to pre-commit command', () => {
  const { deps, calls } = makeDeps();
  const exitCode = runCli(['pre-commit', '--codex'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runPreCommit, [{ cwd: '/tmp/repo', options: { verbose: false, reviewer: 'codex' } }]);
});

test('runCli passes reviewer=copilot to pre-commit command', () => {
  const { deps, calls } = makeDeps();
  const exitCode = runCli(['pre-commit', '--copilot'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runPreCommit, [{ cwd: '/tmp/repo', options: { verbose: false, reviewer: 'copilot' } }]);
});

test('runCli rejects mutually exclusive --codex and --copilot flags', () => {
  const { deps, calls } = makeDeps();
  const exitCode = runCli(['review', '--codex', '--copilot'], deps);
  assert.equal(exitCode, 1);
  assert.ok(calls.logs.some((line) => line.includes('mutually exclusive')));
  assert.equal(calls.runReview.length, 0);
});

test('runCli passes no reviewer when neither flag is set', () => {
  const { deps, calls } = makeDeps();
  const exitCode = runCli(['review'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runReview, [{ cwd: '/tmp/repo', options: { verbose: false, reviewer: undefined } }]);
});

test('runCli renders help for unknown command and exits with failure', () => {
  const { deps, calls } = makeDeps();
  const exitCode = runCli(['unknown'], deps);
  assert.equal(exitCode, 1);
  assert.ok(calls.logs.some((line) => line.includes('ai-diff-review <command> [options]')));
});
