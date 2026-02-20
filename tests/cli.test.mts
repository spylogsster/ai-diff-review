/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasVerboseFlag, hasClaudeFlag, hasCodexFlag, hasCopilotFlag, runCli, type CliDeps } from '../src/cli.ts';

function makeDeps() {
  const calls = {
    runReview: [] as Array<{ cwd: string; options: { verbose: boolean; reviewer?: string }; hasDepsOverride: boolean }>,
    runPreCommit: [] as Array<{ cwd: string; options: { verbose: boolean; reviewer?: string } }>,
    install: 0,
    logs: [] as string[],
    lastDepsOverride: undefined as Record<string, unknown> | undefined,
  };

  const deps: CliDeps = {
    runReview: async (cwd, options, depsOverride) => {
      calls.runReview.push({ cwd, options: { verbose: options?.verbose === true, reviewer: options?.reviewer }, hasDepsOverride: depsOverride !== undefined && Object.keys(depsOverride).length > 0 });
      calls.lastDepsOverride = depsOverride as Record<string, unknown> | undefined;
      return { pass: true, reportPath: 'report.json', reason: 'ok' };
    },
    runPreCommit: async (cwd, options) => {
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

test('runCli passes verbose=true to review command', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['review', '--verbose'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runReview, [{ cwd: '/tmp/repo', options: { verbose: true, reviewer: undefined }, hasDepsOverride: false }]);
});

test('runCli passes verbose=true to pre-commit command', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['pre-commit', '--verbose'], deps);
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

test('runCli passes reviewer=codex to review command', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['review', '--codex'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runReview, [{ cwd: '/tmp/repo', options: { verbose: false, reviewer: 'codex' }, hasDepsOverride: false }]);
});

test('runCli passes reviewer=copilot to review command', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['review', '--copilot'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runReview, [{ cwd: '/tmp/repo', options: { verbose: false, reviewer: 'copilot' }, hasDepsOverride: false }]);
});

test('runCli passes reviewer=codex to pre-commit command', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['pre-commit', '--codex'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runPreCommit, [{ cwd: '/tmp/repo', options: { verbose: false, reviewer: 'codex' } }]);
});

test('runCli passes reviewer=copilot to pre-commit command', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['pre-commit', '--copilot'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runPreCommit, [{ cwd: '/tmp/repo', options: { verbose: false, reviewer: 'copilot' } }]);
});

test('runCli rejects mutually exclusive --codex and --copilot flags', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['review', '--codex', '--copilot'], deps);
  assert.equal(exitCode, 1);
  assert.ok(calls.logs.some((line) => line.includes('mutually exclusive')));
  assert.equal(calls.runReview.length, 0);
});

test('runCli rejects mutually exclusive --claude and --codex flags', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['review', '--claude', '--codex'], deps);
  assert.equal(exitCode, 1);
  assert.ok(calls.logs.some((line) => line.includes('mutually exclusive')));
  assert.equal(calls.runReview.length, 0);
});

test('runCli rejects mutually exclusive --claude and --copilot flags', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['review', '--claude', '--copilot'], deps);
  assert.equal(exitCode, 1);
  assert.ok(calls.logs.some((line) => line.includes('mutually exclusive')));
  assert.equal(calls.runReview.length, 0);
});

test('runCli rejects all three reviewer flags together', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['review', '--claude', '--codex', '--copilot'], deps);
  assert.equal(exitCode, 1);
  assert.ok(calls.logs.some((line) => line.includes('mutually exclusive')));
  assert.equal(calls.runReview.length, 0);
});

test('runCli passes no reviewer when neither flag is set', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['review'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runReview, [{ cwd: '/tmp/repo', options: { verbose: false, reviewer: undefined }, hasDepsOverride: false }]);
});

test('hasClaudeFlag detects --claude option', () => {
  assert.equal(hasClaudeFlag(['review', '--claude']), true);
  assert.equal(hasClaudeFlag(['review']), false);
});

test('runCli passes reviewer=claude to review command', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['review', '--claude'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runReview, [{ cwd: '/tmp/repo', options: { verbose: false, reviewer: 'claude' }, hasDepsOverride: false }]);
});

test('runCli passes reviewer=claude to pre-commit command', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['pre-commit', '--claude'], deps);
  assert.equal(exitCode, 0);
  assert.deepEqual(calls.runPreCommit, [{ cwd: '/tmp/repo', options: { verbose: false, reviewer: 'claude' } }]);
});

test('runCli diff with base arg calls runReview with deps override', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['diff', 'main'], deps);
  assert.equal(exitCode, 0);
  assert.equal(calls.runReview.length, 1);
  assert.equal(calls.runReview[0].cwd, '/tmp/repo');
  assert.equal(calls.runReview[0].hasDepsOverride, true);
  assert.ok(calls.lastDepsOverride);
  assert.equal(typeof calls.lastDepsOverride.getStagedDiff, 'function');
  assert.equal(typeof calls.lastDepsOverride.buildPrompt, 'function');
});

test('runCli diff without base arg returns error', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['diff'], deps);
  assert.equal(exitCode, 1);
  assert.ok(calls.logs.some((line) => line.includes('diff command requires a base branch')));
  assert.equal(calls.runReview.length, 0);
});

test('runCli diff with base and head args passes both', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['diff', 'main', 'feature-branch'], deps);
  assert.equal(exitCode, 0);
  assert.equal(calls.runReview.length, 1);
  assert.equal(calls.runReview[0].hasDepsOverride, true);
});

test('runCli diff supports --verbose and reviewer flags', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['diff', 'main', '--verbose', '--codex'], deps);
  assert.equal(exitCode, 0);
  assert.equal(calls.runReview.length, 1);
  assert.equal(calls.runReview[0].options.verbose, true);
  assert.equal(calls.runReview[0].options.reviewer, 'codex');
  assert.equal(calls.runReview[0].hasDepsOverride, true);
});

test('runCli renders help for unknown command and exits with failure', async () => {
  const { deps, calls } = makeDeps();
  const exitCode = await runCli(['unknown'], deps);
  assert.equal(exitCode, 1);
  assert.ok(calls.logs.some((line) => line.includes('git-ai-review <command> [options]')));
});
