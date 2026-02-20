export interface ReviewFinding {
  severity: string;
  title: string;
  details: string;
  file?: string;
  line?: number;
}

export interface ParsedReview {
  status: 'pass' | 'fail';
  summary: string;
  findings: ReviewFinding[];
}

export type ReviewRunnerResult =
  | { available: false }
  | { available: true; result: ParsedReview };

export interface ReviewReport {
  codex: ParsedReview | { status: 'unavailable' };
  copilot: ParsedReview | { status: 'unavailable' };
}
