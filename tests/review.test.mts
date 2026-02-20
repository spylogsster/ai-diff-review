/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSubagentOutput,
  evaluateResults,
  resolveBinary,
  resolveCodexMacAppBinary,
  resolveCommandFromPath,
  logVerboseRunnerOutput,
  runReview,
} from '../src/review.ts';
import {
  extractReferencedMarkdownFiles,
  buildReferencedMarkdownContext,
  resolvePromptHeaderLines,
  DEFAULT_PROMPT_HEADER_LINES,
} from '../src/prompt.ts';

const PASS_RESULT = { status: 'pass', summary: 'No issues', findings: [] };
const FAIL_RESULT = { status: 'fail', summary: 'Bad code', findings: [{ severity: 'high', title: 'Bug', details: 'x', file: 'src/file.ts', line: 1 }] };
const PASS_WITH_FINDINGS = { status: 'pass', summary: 'Needs fixes', findings: [{ severity: 'low', title: 'Nit', details: 'y', file: 'src/file.ts', line: 2 }] };

test('parseSubagentOutput accepts valid payload', () => {
  const parsed = parseSubagentOutput(JSON.stringify(PASS_RESULT));
  assert.equal(parsed.status, 'pass');
  assert.equal(parsed.findings.length, 0);
});

test('parseSubagentOutput strips markdown fences', () => {
  const parsed = parseSubagentOutput('```json\n{"status":"pass","summary":"ok","findings":[]}\n```');
  assert.equal(parsed.status, 'pass');
});

test('extractReferencedMarkdownFiles finds markdown references', () => {
  const files = extractReferencedMarkdownFiles('Read `BRANCHING.md` and deploy*.md and AGENTS.md');
  assert.deepEqual(files, ['BRANCHING.md', 'deploy*.md']);
});

test('buildReferencedMarkdownContext expands tracked wildcard references', () => {
  const blocks = buildReferencedMarkdownContext(
    ['deploy*.md', 'functions/DEPLOY.md'],
    ['deploy.prod.md', 'deploy.staging.md', 'functions/DEPLOY.md'],
    (file) => `CONTENT:${file}`,
  );

  assert.deepEqual(blocks, [
    '--- FILE: deploy.prod.md ---\nCONTENT:deploy.prod.md',
    '--- FILE: deploy.staging.md ---\nCONTENT:deploy.staging.md',
    '--- FILE: functions/DEPLOY.md ---\nCONTENT:functions/DEPLOY.md',
  ]);
});

test('evaluateResults blocks when both reviewers unavailable', () => {
  const verdict = evaluateResults({ available: false }, { available: false });
  assert.equal(verdict.pass, false);
});

test('evaluateResults blocks pass status with findings', () => {
  const verdict = evaluateResults(
    { available: true, result: PASS_RESULT },
    { available: true, result: PASS_WITH_FINDINGS },
  );
  assert.equal(verdict.pass, false);
});

test('evaluateResults passes when one available and clean', () => {
  const verdict = evaluateResults(
    { available: true, result: PASS_RESULT },
    { available: false },
  );
  assert.equal(verdict.pass, true);
});

test('evaluateResults blocks explicit failure', () => {
  const verdict = evaluateResults(
    { available: true, result: FAIL_RESULT },
    { available: false },
  );
  assert.equal(verdict.pass, false);
});


test('resolvePromptHeaderLines returns defaults when unset', () => {
  const lines = resolvePromptHeaderLines(undefined);
  assert.deepEqual(lines, [...DEFAULT_PROMPT_HEADER_LINES]);
});

test('resolvePromptHeaderLines accepts JSON array override', () => {
  const lines = resolvePromptHeaderLines('["Line A","Line B"]');
  assert.deepEqual(lines, ['Line A', 'Line B']);
});

test('resolvePromptHeaderLines accepts multiline override', () => {
  const lines = resolvePromptHeaderLines('Line A\nLine B');
  assert.deepEqual(lines, ['Line A', 'Line B']);
});

test('resolvePromptHeaderLines falls back to defaults for empty override', () => {
  const lines = resolvePromptHeaderLines('   ');
  assert.deepEqual(lines, [...DEFAULT_PROMPT_HEADER_LINES]);
});

test('resolvePromptHeaderLines falls back to defaults for empty JSON array', () => {
  const lines = resolvePromptHeaderLines('[]');
  assert.deepEqual(lines, [...DEFAULT_PROMPT_HEADER_LINES]);
});


test('resolveCodexMacAppBinary returns bundle executable on macOS when app exists', () => {
  const existing = new Set([
    '/Applications/Codex.app',
    '/Applications/Codex.app/Contents/Resources/codex',
  ]);

  const resolved = resolveCodexMacAppBinary('darwin', (path) => existing.has(path));
  assert.equal(resolved, '/Applications/Codex.app/Contents/Resources/codex');
});

test('resolveCommandFromPath rejects candidates with shell metacharacters', () => {
  assert.equal(resolveCommandFromPath('$(whoami)'), null);
  assert.equal(resolveCommandFromPath('foo;rm -rf /'), null);
  assert.equal(resolveCommandFromPath('a b'), null);
  assert.equal(resolveCommandFromPath('cmd`id`'), null);
});

test('resolveCodexMacAppBinary returns null outside macOS', () => {
  const resolved = resolveCodexMacAppBinary('linux', () => true);
  assert.equal(resolved, null);
});

test('resolveBinary prefers env override over PATH and fallback', () => {
  const resolved = resolveBinary(
    'CODEX_BIN',
    ['codex'],
    {
      env: { CODEX_BIN: '/custom/codex' } as NodeJS.ProcessEnv,
      resolveFromPath: () => '/usr/local/bin/codex',
      resolveCodexFallback: () => '/Applications/Codex.app/Contents/Resources/codex',
    },
  );

  assert.equal(resolved, '/custom/codex');
});

test('resolveBinary prefers PATH before macOS fallback', () => {
  const resolved = resolveBinary(
    'CODEX_BIN',
    ['codex'],
    {
      env: {} as NodeJS.ProcessEnv,
      resolveFromPath: () => '/usr/local/bin/codex',
      resolveCodexFallback: () => '/Applications/Codex.app/Contents/Resources/codex',
    },
  );

  assert.equal(resolved, '/usr/local/bin/codex');
});

test('resolveBinary uses macOS fallback for CODEX_BIN when env and PATH are missing', () => {
  const resolved = resolveBinary(
    'CODEX_BIN',
    ['codex'],
    {
      env: {} as NodeJS.ProcessEnv,
      resolveFromPath: () => null,
      resolveCodexFallback: () => '/Applications/Codex.app/Contents/Resources/codex',
    },
  );

  assert.equal(resolved, '/Applications/Codex.app/Contents/Resources/codex');
});

test('runReview uses verbose branch and forwards verbose to reviewers', () => {
  const logs: string[] = [];
  let codexVerbose = false;
  let copilotVerbose = false;

  const result = runReview(
    '/tmp/repo',
    { verbose: true },
    {
      getStagedDiff: () => 'diff --cached',
      buildPrompt: () => 'PROMPT_CONTENT',
      runCodex: (_prompt, verbose) => {
        codexVerbose = verbose;
        return { available: false };
      },
      runCopilot: (_prompt, verbose) => {
        copilotVerbose = verbose;
        return { available: false };
      },
      writeReport: () => {},
      log: (line) => {
        logs.push(line);
      },
    },
  );

  assert.equal(codexVerbose, true);
  assert.equal(copilotVerbose, true);
  assert.equal(result.pass, false);
  assert.ok(logs.includes('----- REVIEW PROMPT (FULL) -----'));
  assert.ok(logs.includes('PROMPT_CONTENT'));
});

test('logVerboseRunnerOutput prints stdout, stderr, and response file', () => {
  const lines: string[] = [];
  logVerboseRunnerOutput(
    {
      model: 'Codex',
      stdout: 'out-data',
      stderr: 'err-data',
      responseFile: '{"status":"pass"}',
    },
    (msg) => lines.push(msg),
  );

  assert.ok(lines.some((l) => l.includes('CODEX STDOUT (RAW)')));
  assert.ok(lines.includes('out-data'));
  assert.ok(lines.some((l) => l.includes('CODEX STDERR (RAW)')));
  assert.ok(lines.includes('err-data'));
  assert.ok(lines.some((l) => l.includes('CODEX RESPONSE FILE (RAW)')));
  assert.ok(lines.includes('{"status":"pass"}'));
  assert.ok(lines.some((l) => l.includes('END CODEX RAW OUTPUT')));
});

test('runReview with reviewer=codex skips Copilot even when Codex is unavailable', () => {
  let codexCalled = false;
  let copilotCalled = false;

  const result = runReview(
    '/tmp/repo',
    { reviewer: 'codex' },
    {
      getStagedDiff: () => 'diff --cached',
      buildPrompt: () => 'PROMPT',
      runCodex: () => {
        codexCalled = true;
        return { available: false };
      },
      runCopilot: () => {
        copilotCalled = true;
        return { available: false };
      },
      writeReport: () => {},
      log: () => {},
    },
  );

  assert.equal(codexCalled, true);
  assert.equal(copilotCalled, false);
  assert.equal(result.pass, false);
});

test('runReview with reviewer=copilot skips Codex', () => {
  let codexCalled = false;
  let copilotCalled = false;

  const result = runReview(
    '/tmp/repo',
    { reviewer: 'copilot' },
    {
      getStagedDiff: () => 'diff --cached',
      buildPrompt: () => 'PROMPT',
      runCodex: () => {
        codexCalled = true;
        return { available: true, result: PASS_RESULT };
      },
      runCopilot: () => {
        copilotCalled = true;
        return { available: true, result: PASS_RESULT };
      },
      writeReport: () => {},
      log: () => {},
    },
  );

  assert.equal(codexCalled, false);
  assert.equal(copilotCalled, true);
  assert.equal(result.pass, true);
});

test('runReview without reviewer uses default Codex-first-then-Copilot-fallback', () => {
  let codexCalled = false;
  let copilotCalled = false;

  const result = runReview(
    '/tmp/repo',
    {},
    {
      getStagedDiff: () => 'diff --cached',
      buildPrompt: () => 'PROMPT',
      runCodex: () => {
        codexCalled = true;
        return { available: false };
      },
      runCopilot: () => {
        copilotCalled = true;
        return { available: true, result: PASS_RESULT };
      },
      writeReport: () => {},
      log: () => {},
    },
  );

  assert.equal(codexCalled, true);
  assert.equal(copilotCalled, true);
  assert.equal(result.pass, true);
});

test('logVerboseRunnerOutput omits response file section when not provided', () => {
  const lines: string[] = [];
  logVerboseRunnerOutput(
    { model: 'Copilot', stdout: 'ok', stderr: '' },
    (msg) => lines.push(msg),
  );

  assert.ok(lines.some((l) => l.includes('COPILOT STDOUT (RAW)')));
  assert.ok(!lines.some((l) => l.includes('RESPONSE FILE')));
  assert.ok(lines.some((l) => l.includes('END COPILOT RAW OUTPUT')));
});
