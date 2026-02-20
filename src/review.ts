/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { platform, tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { REVIEW_SCHEMA } from './schema.js';
import type { ParsedReview, ReviewReport, ReviewRunnerResult } from './types.js';
import { buildAgentsContext, resolvePromptHeaderLines } from './prompt.js';
import { getGitPath, git } from './git.js';

const COPILOT_MODEL = process.env.COPILOT_REVIEW_MODEL || 'gpt-5.3-codex';
const TIMEOUT_MS = Number(process.env.AI_REVIEW_TIMEOUT_MS || 180000);
const PREFLIGHT_TIMEOUT_SEC = Number(process.env.AI_REVIEW_PREFLIGHT_TIMEOUT_SEC || 8);

export interface RunReviewOptions {
  verbose?: boolean;
}

export interface RunReviewDeps {
  getStagedDiff: () => string;
  buildPrompt: (diff: string, cwd: string) => string;
  runCodex: (prompt: string, verbose: boolean) => ReviewRunnerResult;
  runCopilot: (prompt: string, verbose: boolean) => ReviewRunnerResult;
  writeReport: (reportPath: string, report: ReviewReport) => void;
  log: (message: string) => void;
}

export interface VerboseRunnerOutput {
  model: string;
  stdout: string;
  stderr: string;
  responseFile?: string;
}

export function logVerboseRunnerOutput(
  output: VerboseRunnerOutput,
  log: (message: string) => void = console.log,
): void {
  const label = output.model.toUpperCase();
  log(`\n----- ${label} STDOUT (RAW) -----`);
  log(output.stdout || '');
  log(`----- ${label} STDERR (RAW) -----`);
  log(output.stderr || '');
  if (output.responseFile !== undefined) {
    log(`----- ${label} RESPONSE FILE (RAW) -----`);
    log(output.responseFile);
  }
  log(`----- END ${label} RAW OUTPUT -----\n`);
}

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

function resolveCommandFromPath(candidate: string): string | null {
  try {
    const path = execFileSync('sh', ['-lc', `command -v ${candidate}`], { encoding: 'utf8' }).trim();
    return path || null;
  } catch {
    return null;
  }
}

export function resolveCodexMacAppBinary(
  osPlatform = platform(),
  pathExists: (path: string) => boolean = existsSync,
): string | null {
  if (osPlatform !== 'darwin' || !pathExists('/Applications/Codex.app')) {
    return null;
  }

  const bundleCandidates = [
    '/Applications/Codex.app/Contents/Resources/codex',
    '/Applications/Codex.app/Contents/Resources/Codex',
  ];

  for (const candidate of bundleCandidates) {
    if (pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export interface ResolveBinaryOptions {
  env?: NodeJS.ProcessEnv;
  resolveFromPath?: (candidate: string) => string | null;
  resolveCodexFallback?: () => string | null;
}

export function resolveBinary(
  envName: string,
  candidates: string[],
  options: ResolveBinaryOptions = {},
): string | null {
  const env = options.env ?? process.env;
  const resolveFromPath = options.resolveFromPath ?? resolveCommandFromPath;
  const resolveCodexFallback = options.resolveCodexFallback ?? resolveCodexMacAppBinary;

  const envBinary = env[envName]?.trim();
  if (envBinary) {
    return envBinary;
  }

  for (const candidate of candidates) {
    const path = resolveFromPath(candidate);
    if (path) {
      return path;
    }
  }

  if (envName === 'CODEX_BIN') {
    const codexAppBinary = resolveCodexFallback();
    if (codexAppBinary) {
      return codexAppBinary;
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
    ...resolvePromptHeaderLines(),
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

function runCodex(prompt: string, verbose: boolean): ReviewRunnerResult {
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
    const codexCommand = [
        'exec',
        '--ephemeral',
        '--sandbox', 'read-only',
        '--output-schema', schemaPath,
        '--output-last-message', resultPath,
        '-'
    ];

    if (verbose) {
      console.log(codex, codexCommand.join(' '))
    }
    const run = spawnSync(
      codex,
      codexCommand,
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: TIMEOUT_MS,
        input: readFileSync(promptPath, 'utf8'),
      },
    );

    if (verbose) {
      logVerboseRunnerOutput({
        model: 'Codex',
        stdout: run.stdout || '',
        stderr: run.stderr || '',
        responseFile: existsSync(resultPath) ? readFileSync(resultPath, 'utf8') : undefined,
      });
    }

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

function runCopilot(prompt: string, verbose: boolean): ReviewRunnerResult {
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

    if (verbose) {
      logVerboseRunnerOutput({
        model: 'Copilot',
        stdout: run.stdout || '',
        stderr: run.stderr || '',
      });
    }

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

export function runReview(
  cwd = process.cwd(),
  options: RunReviewOptions = {},
  deps: Partial<RunReviewDeps> = {},
): { pass: boolean; reportPath: string; reason: string } {
  const verbose = options.verbose === true;
  const runtimeDeps: RunReviewDeps = {
    getStagedDiff,
    buildPrompt,
    runCodex,
    runCopilot,
    writeReport: (reportPath, report) => {
      writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    },
    log: (message) => console.log(message),
    ...deps,
  };

  const diff = runtimeDeps.getStagedDiff();
  if (!diff) {
    runtimeDeps.log('AI review: no staged changes.');
    return { pass: true, reportPath: resolve(cwd, getGitPath('ai-review-last.json')), reason: 'No staged changes.' };
  }

  const prompt = runtimeDeps.buildPrompt(diff, cwd);

  if (verbose) {
    runtimeDeps.log('----- REVIEW PROMPT (FULL) -----');
    runtimeDeps.log(prompt);
    runtimeDeps.log('----- END REVIEW PROMPT -----');
  }

  runtimeDeps.log('Running Codex review...');
  const codex = runtimeDeps.runCodex(prompt, verbose);

  let copilot: ReviewRunnerResult = { available: false };
  if (!codex.available) {
    runtimeDeps.log('Codex unavailable — falling back to Copilot review...');
    copilot = runtimeDeps.runCopilot(prompt, verbose);
  }

  const report: ReviewReport = {
    codex: codex.available ? codex.result : { status: 'unavailable' },
    copilot: copilot.available ? copilot.result : { status: 'unavailable' },
  };

  const reportPath = resolve(cwd, process.env.AI_REVIEW_REPORT_PATH || getGitPath('ai-review-last.json'));
  runtimeDeps.writeReport(reportPath, report);
  runtimeDeps.log(`AI review raw report saved: ${reportPath}`);

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
