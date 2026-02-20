import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSubagentOutput, evaluateResults } from '../src/review.ts';
import { extractReferencedMarkdownFiles, buildReferencedMarkdownContext } from '../src/prompt.ts';

const PASS_RESULT = { status: 'pass', summary: 'No issues', findings: [] };
const FAIL_RESULT = { status: 'fail', summary: 'Bad code', findings: [{ severity: 'high', title: 'Bug', details: 'x' }] };
const PASS_WITH_FINDINGS = { status: 'pass', summary: 'Needs fixes', findings: [{ severity: 'low', title: 'Nit', details: 'y' }] };

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
