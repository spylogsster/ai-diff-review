import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { REVIEW_SCHEMA } from './schema.js';
import type { ParsedReview, ReviewReport, ReviewRunnerResult } from './types.js';
import { buildAgentsContext } from './prompt.js';
import { getGitPath, git } from './git.js';

const COPILOT_MODEL = process.env.COPILOT_REVIEW_MODEL || 'gpt-5.3-codex';
const TIMEOUT_MS = Number(process.env.AI_REVIEW_TIMEOUT_MS || 180000);
const PREFLIGHT_TIMEOUT_SEC = Number(process.env.AI_REVIEW_PREFLIGHT_TIMEOUT_SEC || 8);

function canReach(url: string): boolean {
  try {
    const out = execFileSync(
      'curl',
      ['-I', '--max-time', String(PREFLIGHT_TIMEOUT_SEC), '-sS', url],
      { encoding: 'utf8' },
    );
    return /HTTP\/[0-9.]+\s+\d{3}/i.test(out);
  } catch {
    return false;
  }
}

function resolveBinary(envName: string, candidates: string[]): string | null {
  const envBinary = process.env[envName]?.trim();
  if (envBinary) {
    return envBinary;
  }

  for (const candidate of candidates) {
    try {
      const path = execFileSync('sh', ['-lc', `command -v ${candidate}`], { encoding: 'utf8' }).trim();
      if (path) {
        return path;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function getStagedDiff(): string {
  return git(['diff', '--cached', '--no-color']);
}

function buildPrompt(diff: string, cwd = process.cwd()): string {
  const context = buildAgentsContext(cwd);
  return [
    'You are a strict reviewer for all AGENTS.md rules.',
    'Review ONLY the staged git diff provided below.',
    'Focus on: safety, architecture correctness, clean logic, componentization quality, likely regressions, maintainability.',
    'Do not comment on formatting-only changes unless they create risk.',
    'Return status=fail if any meaningful issue exists.',
    '',
    'Here is the full AGENTS.md for reference:',
    context.agents,
    ...(context.referenced.length > 0
      ? [
        '',
        'Additional markdown files referenced by AGENTS.md (full contents):',
        ...context.referenced,
      ]
      : []),
    '',
    'Respond with ONLY a JSON object matching this schema (no markdown, no backticks, no explanation):',
    JSON.stringify(REVIEW_SCHEMA, null, 2),
    '',
    'Staged diff:',
    diff,
  ].join('\n');
}

export function parseSubagentOutput(raw: string): ParsedReview {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    throw new Error('Subagent returned an empty response.');
  }

  let cleaned = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }

  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Subagent output is not a JSON object.');
  }
  if (!['pass', 'fail'].includes((parsed as ParsedReview).status)) {
    throw new Error('Subagent output has an invalid status.');
  }
  if (!Array.isArray((parsed as ParsedReview).findings)) {
    throw new Error('Subagent output has an invalid findings list.');
  }

  return parsed as ParsedReview;
}

function runCodex(prompt: string): ReviewRunnerResult {
  const codex = resolveBinary('CODEX_BIN', ['codex']);
  if (!codex) {
    console.error('Codex: binary not found in PATH (or CODEX_BIN not set) — skipping.');
    return { available: false };
  }

  if (!canReach('https://api.openai.com/v1/models') && !canReach('https://chatgpt.com')) {
    console.error('Codex: network preflight failed — skipping.');
    return { available: false };
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'ai-review-codex-'));
  const promptPath = join(tempDir, 'prompt.txt');
  const schemaPath = join(tempDir, 'schema.json');
  const resultPath = join(tempDir, 'result.json');
  writeFileSync(promptPath, prompt, 'utf8');
  writeFileSync(schemaPath, JSON.stringify(REVIEW_SCHEMA, null, 2), 'utf8');

  try {
    const run = spawnSync(
      codex,
      [
        'exec',
        '--ephemeral',
        '--sandbox', 'read-only',
        '--output-schema', schemaPath,
        '--output-last-message', resultPath,
        '-',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
        input: readFileSync(promptPath, 'utf8'),
      },
    );

    if (run.status !== 0 || !existsSync(resultPath)) {
      const err = (run.stderr || run.stdout || '').trim();
      console.error(`Codex: execution failed${err ? `: ${err}` : ''} — skipping.`);
      return { available: false };
    }

    return { available: true, result: parseSubagentOutput(readFileSync(resultPath, 'utf8')) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Codex: ${message} — skipping.`);
    return { available: false };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function runCopilot(prompt: string): ReviewRunnerResult {
  const copilot = resolveBinary('COPILOT_BIN', ['copilot']);
  if (!copilot) {
    console.error('Copilot: binary not found in PATH (or COPILOT_BIN not set) — skipping.');
    return { available: false };
  }

  if (!canReach('https://api.github.com')) {
    console.error('Copilot: network preflight failed (api.github.com) — skipping.');
    return { available: false };
  }

  try {
    const run = spawnSync(
      copilot,
      ['--model', COPILOT_MODEL, '-s'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
        input: prompt,
      },
    );

    if (run.status !== 0) {
      const err = (run.stderr || run.stdout || '').trim();
      console.error(`Copilot: execution failed${err ? `: ${err}` : ''} — skipping.`);
      return { available: false };
    }

    const stdout = (run.stdout || '').trim();
    if (!stdout) {
      console.error('Copilot: empty response — skipping.');
      return { available: false };
    }

    return { available: true, result: parseSubagentOutput(stdout) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Copilot: ${message} — skipping.`);
    return { available: false };
  }
}

export function evaluateResults(codex: ReviewRunnerResult, copilot: ReviewRunnerResult): { pass: boolean; reason: string } {
  if (!codex.available && !copilot.available) {
    return { pass: false, reason: 'Both Codex and Copilot are unavailable. At least one AI review is required.' };
  }

  const failures: string[] = [];
  if (codex.available && codex.result.status === 'fail') failures.push('Codex');
  if (copilot.available && copilot.result.status === 'fail') failures.push('Copilot');
  if (failures.length > 0) {
    return { pass: false, reason: `AI review rejected by: ${failures.join(', ')}.` };
  }

  const withFindings: string[] = [];
  if (codex.available && codex.result.findings.length > 0) withFindings.push('Codex');
  if (copilot.available && copilot.result.findings.length > 0) withFindings.push('Copilot');
  if (withFindings.length > 0) {
    return { pass: false, reason: `AI review has unresolved findings from: ${withFindings.join(', ')}. Pass requires zero findings.` };
  }

  const passed: string[] = [];
  if (codex.available) passed.push('Codex');
  if (copilot.available) passed.push('Copilot');
  return { pass: true, reason: `AI review approved by: ${passed.join(', ')}.` };
}

function printReview(model: string, result: ParsedReview): void {
  const label = result.status === 'fail'
    ? `${model} review FAILED`
    : result.findings.length > 0
      ? `${model} review has findings (pass requires zero)`
      : `${model} review PASSED`;

  console.log(`\n${label}:`);
  console.log(`Summary: ${result.summary}`);

  for (const finding of result.findings) {
    const at = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : 'n/a';
    console.log(`- [${finding.severity}] ${finding.title} (${at})`);
    console.log(`  ${finding.details}`);
  }
}

export function runReview(cwd = process.cwd()): { pass: boolean; reportPath: string; reason: string } {
  const diff = getStagedDiff();
  if (!diff) {
    console.log('AI review: no staged changes.');
    return { pass: true, reportPath: resolve(cwd, getGitPath('ai-review-last.json')), reason: 'No staged changes.' };
  }

  const prompt = buildPrompt(diff, cwd);

  console.log('Running Codex review...');
  const codex = runCodex(prompt);

  let copilot: ReviewRunnerResult = { available: false };
  if (!codex.available) {
    console.log('Codex unavailable — falling back to Copilot review...');
    copilot = runCopilot(prompt);
  }

  const report: ReviewReport = {
    codex: codex.available ? codex.result : { status: 'unavailable' },
    copilot: copilot.available ? copilot.result : { status: 'unavailable' },
  };

  const reportPath = resolve(cwd, process.env.AI_REVIEW_REPORT_PATH || getGitPath('ai-review-last.json'));
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`AI review raw report saved: ${reportPath}`);

  if (codex.available) {
    printReview('Codex', codex.result);
  } else {
    console.log('\nCodex: unavailable — skipped.');
  }
  if (copilot.available) {
    printReview('Copilot', copilot.result);
  } else {
    console.log('\nCopilot: unavailable — skipped.');
  }

  const verdict = evaluateResults(codex, copilot);
  console.log(`\n${verdict.reason}`);
  return { pass: verdict.pass, reportPath, reason: verdict.reason };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = runReview();
  if (!result.pass) process.exit(1);
}
