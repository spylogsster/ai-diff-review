/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import { execFileSync } from 'node:child_process';

export function git(args: string[], cwd = process.cwd()): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

export function getDiffBetweenRefs(base: string, head: string, cwd = process.cwd()): string {
  return git(['diff', '--no-color', `${base}...${head}`, '--'], cwd);
}

export function getGitPath(name: string): string {
  try {
    return git(['rev-parse', '--git-path', name]);
  } catch {
    return `.git/${name}`;
  }
}
