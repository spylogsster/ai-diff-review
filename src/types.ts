/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
export interface ReviewFinding {
  severity: string;
  title: string;
  details: string;
  file: string | null;
  line: number | null;
}

export interface ParsedReview {
  status: 'pass' | 'fail';
  summary: string;
  findings: ReviewFinding[];
}

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export type ReviewRunnerResult =
  | { available: false }
  | { available: true; result: ParsedReview; usage?: TokenUsage };

export interface ReviewReport {
  claude: ParsedReview | { status: 'unavailable' };
  codex: ParsedReview | { status: 'unavailable' };
  copilot: ParsedReview | { status: 'unavailable' };
}
