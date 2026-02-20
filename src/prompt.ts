/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { git } from './git.js';

export const DEFAULT_PROMPT_HEADER_LINES = [
  'You are a strict reviewer for all AGENTS.md rules.',
  'Review ONLY the staged git diff provided below.',
  'Focus on: safety, architecture correctness, clean logic, componentization quality, likely regressions, maintainability.',
  'Do not comment on formatting-only changes unless they create risk.',
  'Return status=fail if any meaningful issue exists.',
] as const;

export function resolvePromptHeaderLines(rawValue = process.env.AI_REVIEW_PROMPT_HEADER): string[] {
  const value = rawValue?.trim();
  if (!value) {
    return [...DEFAULT_PROMPT_HEADER_LINES];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      const lines = parsed
        .filter((line): line is string => typeof line === 'string')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      return lines.length > 0 ? lines : [...DEFAULT_PROMPT_HEADER_LINES];
    }
  } catch {
    // fallback to plain multiline text parsing
  }

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.length > 0 ? lines : [...DEFAULT_PROMPT_HEADER_LINES];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = escapeRegex(pattern)
    .replace(/\\\*/g, '.*')
    .replace(/\\\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

function listTrackedMarkdownFiles(): string[] {
  const output = git(['ls-files', '*.md']);
  if (!output) {
    return [];
  }
  return output
    .split('\n')
    .map((file) => file.trim())
    .filter((file) => file.length > 0);
}

function expandMarkdownReference(reference: string, trackedMdFiles: string[]): string[] {
  if (!reference.includes('*') && !reference.includes('?')) {
    return trackedMdFiles.includes(reference) ? [reference] : [];
  }
  const matcher = wildcardToRegex(reference);
  return trackedMdFiles.filter((file) => matcher.test(file));
}

export function extractReferencedMarkdownFiles(agentsMd: string): string[] {
  const referenced = new Set<string>();
  const backticked = /`([^`]+\.md)`/gi;
  for (const match of agentsMd.matchAll(backticked)) {
    const value = match[1]?.trim();
    if (value) referenced.add(value);
  }

  const plain = /\b([A-Za-z0-9_.*?/\-]+\.md)\b/g;
  for (const match of agentsMd.matchAll(plain)) {
    const value = match[1]?.trim();
    if (value) referenced.add(value);
  }

  referenced.delete('AGENTS.md');
  return [...referenced].map((file) => file.replace(/\\/g, '/')).sort();
}

export function buildReferencedMarkdownContext(
  references: string[],
  trackedMdFiles: string[],
  readMarkdownFile: (file: string) => string,
  skippedFiles: ReadonlySet<string> = new Set<string>(),
): string[] {
  const blocks: string[] = [];
  const known = new Set<string>(skippedFiles);
  const expandedFiles = references.flatMap((reference) => expandMarkdownReference(reference, trackedMdFiles));

  for (const file of expandedFiles) {
    if (known.has(file)) continue;
    known.add(file);
    blocks.push(`--- FILE: ${file} ---\n${readMarkdownFile(file)}`);
  }

  return blocks;
}

export function buildAgentsContext(cwd = process.cwd()): { agents: string; referenced: string[] } {
  const agentsPath = resolve(cwd, 'AGENTS.md');
  const agents = readFileSync(agentsPath, 'utf8');
  const references = extractReferencedMarkdownFiles(agents);
  const trackedMdFiles = listTrackedMarkdownFiles();

  return {
    agents,
    referenced: buildReferencedMarkdownContext(
      references,
      trackedMdFiles,
      (file) => readFileSync(resolve(cwd, file), 'utf8'),
      new Set<string>(['AGENTS.md']),
    ),
  };
}
