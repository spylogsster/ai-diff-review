import { execFileSync } from 'node:child_process';

export function git(args: string[], cwd = process.cwd()): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

export function getGitPath(name: string): string {
  try {
    return git(['rev-parse', '--git-path', name]);
  } catch {
    return `.git/${name}`;
  }
}
