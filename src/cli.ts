import { runReview } from './review.js';
import { runPreCommit } from './precommit.js';
import { installPreCommitHook } from './install.js';

function printHelp(): void {
  console.log('ai-review-hook <command>');
  console.log('');
  console.log('Commands:');
  console.log('  review      Run AI review for staged changes');
  console.log('  pre-commit  Run lock-aware pre-commit flow');
  console.log('  install     Install .githooks/pre-commit and set core.hooksPath');
}

export function runCli(argv = process.argv.slice(2)): number {
  const command = argv[0] || 'help';

  if (command === 'review') {
    const result = runReview();
    return result.pass ? 0 : 1;
  }

  if (command === 'pre-commit') {
    return runPreCommit();
  }

  if (command === 'install') {
    installPreCommitHook();
    return 0;
  }

  printHelp();
  return command === 'help' || command === '--help' || command === '-h' ? 0 : 1;
}
