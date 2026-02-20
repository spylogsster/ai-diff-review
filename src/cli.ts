/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import { runReview, buildPrompt } from './review.js';
import { runPreCommit } from './precommit.js';
import { installPreCommitHook } from './install.js';
import { getDiffBetweenRefs } from './git.js';

export interface CliDeps {
  runReview: typeof runReview;
  runPreCommit: typeof runPreCommit;
  installPreCommitHook: typeof installPreCommitHook;
  getCwd: () => string;
  log: (message: string) => void;
}

const DEFAULT_CLI_DEPS: CliDeps = {
  runReview,
  runPreCommit,
  installPreCommitHook,
  getCwd: () => process.cwd(),
  log: (message) => console.log(message),
};

function printHelp(log: (message: string) => void): void {
  log('git-ai-review <command> [options]');
  log('');
  log('Commands:');
  log('  review                Run AI review for staged changes');
  log('  diff <base> [head]    Run AI review for diff between branches');
  log('  pre-commit            Run lock-aware pre-commit flow');
  log('  install               Install .githooks/pre-commit and set core.hooksPath');
  log('');
  log('Options:');
  log('  --codex     Force Codex reviewer only (skip Copilot/Claude fallback)');
  log('  --copilot   Force Copilot reviewer only (skip Codex/Claude)');
  log('  --claude    Force Claude reviewer only (skip Codex/Copilot)');
  log('  --verbose   Print full prompt and raw model outputs to stdout');
}

export function hasVerboseFlag(args: string[]): boolean {
  return args.includes('--verbose');
}

export function hasClaudeFlag(args: string[]): boolean {
  return args.includes('--claude');
}

export function hasCodexFlag(args: string[]): boolean {
  return args.includes('--codex');
}

export function hasCopilotFlag(args: string[]): boolean {
  return args.includes('--copilot');
}

export async function runCli(argv = process.argv.slice(2), deps: CliDeps = DEFAULT_CLI_DEPS): Promise<number> {
  const command = argv[0] || 'help';
  const args = argv.slice(1);
  const verbose = hasVerboseFlag(args);
  const useClaude = hasClaudeFlag(args);
  const useCodex = hasCodexFlag(args);
  const useCopilot = hasCopilotFlag(args);
  const cwd = deps.getCwd();

  const selectedCount = [useClaude, useCodex, useCopilot].filter(Boolean).length;
  if (selectedCount > 1) {
    deps.log('Error: --claude, --codex, and --copilot are mutually exclusive.');
    return 1;
  }

  const reviewer = useClaude ? 'claude' as const : useCodex ? 'codex' as const : useCopilot ? 'copilot' as const : undefined;

  if (command === 'review') {
    const result = await deps.runReview(cwd, { verbose, reviewer });
    return result.pass ? 0 : 1;
  }

  if (command === 'diff') {
    const positional = args.filter((a) => !a.startsWith('--'));
    const base = positional[0];
    const head = positional[1] || 'HEAD';
    if (!base) {
      deps.log('Error: diff command requires a base branch. Usage: git-ai-review diff <base> [head]');
      return 1;
    }
    const result = await deps.runReview(cwd, { verbose, reviewer }, {
      getStagedDiff: () => getDiffBetweenRefs(base, head, cwd),
      buildPrompt: (diff, promptCwd) => buildPrompt(diff, promptCwd, `Branch diff (${base}...${head})`),
    });
    return result.pass ? 0 : 1;
  }

  if (command === 'pre-commit') {
    return await deps.runPreCommit(cwd, { verbose, reviewer });
  }

  if (command === 'install') {
    deps.installPreCommitHook();
    return 0;
  }

  printHelp(deps.log);
  return command === 'help' || command === '--help' || command === '-h' ? 0 : 1;
}
