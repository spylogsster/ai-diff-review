<!-- SPDX-License-Identifier: MPL-2.0 -->
# git-ai-review

Review your git diff with your locally installed **Codex CLI** or **Copilot CLI** — run it manually in one command or automatically as a git pre-commit hook.

## License

This package is licensed under **MPL-2.0**.

## What it does

`git-ai-review` uses your local Codex CLI and Copilot CLI installations to AI-review staged changes before they are committed. You can run it on demand with a single command (`npx git-ai-review review`) or install it as a git hook so every commit is reviewed automatically.

- Uses your local **Codex CLI** as the primary reviewer.
- Falls back to your local **Copilot CLI** when Codex is unavailable.
- Blocks commit when:
  - any reviewer returns `status: fail`, or
  - any findings are returned (even with `status: pass`), or
  - both reviewers are unavailable.
- Tracks consecutive failures and enables a hard lock after a limit (default `10`).
- Builds prompt context from:
  - full `AGENTS.md`,
  - tracked markdown files referenced by `AGENTS.md` (including wildcard refs like `deploy*.md`).
- Resolves binaries via environment variables or system PATH, with macOS app-bundle fallback for Codex (`/Applications/Codex.app/Contents/Resources/codex`).

## Prerequisites

At least one reviewer CLI must be installed and authenticated on each developer machine.
Recommended: install both for resilient fallback behavior.

- Codex CLI (`codex`) with active login (`codex login`)
- Copilot CLI (`copilot`) with active login (`copilot auth`)

If Codex is unavailable, fallback to Copilot is used. If both are unavailable, review fails.

## Install in another repository

```bash
npm i -D git-ai-review
```

Install hook files and configure Git:

```bash
npx git-ai-review install
```

This creates/updates `.githooks/pre-commit` and sets:

```bash
git config core.hooksPath .githooks
```

## Commands

Via `npx`:

```bash
npx git-ai-review review
npx git-ai-review review --verbose
npx git-ai-review review --codex
npx git-ai-review review --copilot
npx git-ai-review pre-commit
npx git-ai-review pre-commit --verbose
npx git-ai-review install
```

Via npm scripts (pass flags after `--`):

```bash
npm run git-ai-review -- review
npm run git-ai-review -- review --verbose
npm run git-ai-review -- review --codex
npm run git-ai-review -- review --copilot
npm run git-ai-review -- pre-commit
npm run git-ai-review -- pre-commit --verbose
npm run git-ai-review -- install
```

`npm run ai-review` is an alias for `npm run git-ai-review` — both accept the same commands and flags.

- `review`: run AI review against staged diff.
- `review --verbose`: print full prompt plus raw Codex/Copilot outputs to stdout.
- `review --codex`: force Codex reviewer only (skip Copilot fallback).
- `review --copilot`: force Copilot reviewer only (skip Codex).
- `pre-commit`: run lock-aware pre-commit flow (recommended for hooks).
- `pre-commit --verbose`: same as pre-commit, but with detailed prompt/raw model logs.
- `install`: install hook script and set `core.hooksPath`.

The `--codex` and `--copilot` flags are mutually exclusive and can be combined with `--verbose`.

## Repository requirements

In each target repository:

- `AGENTS.md` must exist in repo root.
- Optional referenced markdown docs (from `AGENTS.md`) should be tracked in git to be included in prompt context.
- Commits should be made with staged changes (`git add ...`) so diff is reviewable.

## Runtime behavior

- In CI (`CI=true|1|yes`) pre-commit review is skipped.
- Report is written to `.git/ai-review-last.json` by default.
- Failure counter file: `.git/ai-review-fail-count`.
- Lock file after repeated failures: `.git/ai-review.lock`.
- Unlock manually by removing lock and fail-count files.

## Environment variables

- `CODEX_BIN`: custom Codex executable path/name.
- `COPILOT_BIN`: custom Copilot executable path/name.
- `COPILOT_REVIEW_MODEL`: default `gpt-5.3-codex`.
- `AI_REVIEW_TIMEOUT_MS`: default `180000`.
- `AI_REVIEW_PREFLIGHT_TIMEOUT_SEC`: default `8`.
- `AI_REVIEW_FAIL_LIMIT`: default `10`.
- `AI_REVIEW_REPORT_PATH`: custom report location.
- `AI_REVIEW_PROMPT_HEADER`: optional prompt-header override.
  - JSON array format example: `["Line 1","Line 2"]`
  - Multiline string format example: `Line 1\nLine 2`
  - If unset/empty, built-in default header lines are used.

## Verbose logging

Use `--verbose` to print:

- full generated review prompt
- raw Codex stdout/stderr and structured response file
- raw Copilot stdout/stderr (when fallback runs)

This is useful for debugging prompt behavior and model integration issues.

## Example setup in a target repo

```bash
npm i -D git-ai-review
npx git-ai-review install
```

Then commit as usual:

```bash
git add .
git commit -m "Your change"
```

The hook will run automatically.

## Publishing

Typical release flow:

```bash
npm version patch
npm publish
```

Recommended checks before publish:

```bash
npm run typecheck
npm test
npm run build
npm publish --dry-run
```
