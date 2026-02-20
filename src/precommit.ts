/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getGitPath } from './git.js';
import { runReview } from './review.js';

function isCiEnvironment(): boolean {
  const ci = String(process.env.CI || '').toLowerCase();
  return ci === 'true' || ci === '1' || ci === 'yes';
}

function readCount(path: string): number {
  if (!existsSync(path)) return 0;
  const value = Number.parseInt(readFileSync(path, 'utf8').trim(), 10);
  return Number.isNaN(value) ? 0 : value;
}

function printLastReport(reportPath: string): void {
  console.log(`Last report: ${reportPath}`);
  if (existsSync(reportPath)) {
    console.log('Review output:');
    console.log(readFileSync(reportPath, 'utf8'));
  } else {
    console.log('Review output: report file not found.');
  }
}

export interface PreCommitOptions {
  verbose?: boolean;
}

export interface PreCommitDeps {
  runReviewFn: typeof runReview;
}

export function runPreCommit(
  cwd = process.cwd(),
  options: PreCommitOptions = {},
  deps: Partial<PreCommitDeps> = {},
): number {
  const verbose = options.verbose === true;
  const runReviewFn = deps.runReviewFn ?? runReview;

  if (isCiEnvironment()) {
    console.log('Skip AI review in CI.');
    return 0;
  }

  const failCountPath = resolve(cwd, getGitPath('ai-review-fail-count'));
  const lockPath = resolve(cwd, getGitPath('ai-review.lock'));
  const reportPath = resolve(cwd, process.env.AI_REVIEW_REPORT_PATH || getGitPath('ai-review-last.json'));
  const failLimit = Number.parseInt(process.env.AI_REVIEW_FAIL_LIMIT || '10', 10);

  if (existsSync(lockPath)) {
    console.error('AI hook lock is active. Commits are blocked until manual unlock.');
    console.error(`To unlock: rm -f "${lockPath}" "${failCountPath}"`);
    printLastReport(reportPath);
    return 1;
  }

  const review = runReviewFn(cwd, { verbose });
  if (review.pass) {
    rmSync(failCountPath, { force: true });
    return 0;
  }

  const failCount = readCount(failCountPath) + 1;
  writeFileSync(failCountPath, String(failCount), 'utf8');

  if (failCount >= failLimit) {
    writeFileSync(lockPath, `locked_after=${failCount}\n`, 'utf8');
    console.error(`AI hook rejected ${failCount} commits in a row. Hard lock is now active.`);
    console.error(`To unlock: rm -f "${lockPath}" "${failCountPath}"`);
  } else {
    console.error('AI hook rejected the commit. Commit blocked.');
    console.error(`Consecutive AI-hook failures: ${failCount} (lock at ${failLimit}).`);
  }

  printLastReport(reportPath);
  return 1;
}
