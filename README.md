# ai-review-hook

`ai-review-hook` is a publishable npm package that provides a Git pre-commit AI review hook.

## Features
- Codex is the primary reviewer.
- Copilot is fallback when Codex is unavailable.
- Blocking mode: any failure or findings block commit.
- Consecutive-failure lock after configurable threshold.
- AGENTS.md-aware prompt context (includes markdown files referenced by AGENTS.md).
- No hardcoded binary paths; binaries are resolved from env vars or system PATH.

## Install
```bash
npm i -D ai-review-hook
npx ai-review-hook install
```

## Commands
```bash
npx ai-review-hook review
npx ai-review-hook pre-commit
npx ai-review-hook install
```

## Environment variables
- `CODEX_BIN`: optional custom Codex executable path/name.
- `COPILOT_BIN`: optional custom Copilot executable path/name.
- `COPILOT_REVIEW_MODEL`: default `gpt-5.3-codex`.
- `AI_REVIEW_TIMEOUT_MS`: default `180000`.
- `AI_REVIEW_PREFLIGHT_TIMEOUT_SEC`: default `8`.
- `AI_REVIEW_FAIL_LIMIT`: default `10`.
- `AI_REVIEW_REPORT_PATH`: optional custom report location.
