import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { git } from './git.js';

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
