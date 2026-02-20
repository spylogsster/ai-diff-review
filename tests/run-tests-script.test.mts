/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("../scripts/run-tests.mjs", import.meta.url));

test("scripts/run-tests.mjs exits with 1 when no test files are found", () => {
  const tmp = mkdtempSync(join(tmpdir(), "run-tests-"));
  mkdirSync(join(tmp, "tests"));
  const result = spawnSync("node", [scriptPath], {
    stdio: "pipe",
    encoding: "utf-8",
    cwd: tmp,
    env: { ...process.env, _AI_REVIEW_RUN_TESTS_DEPTH: "0" },
  });
  rmSync(tmp, { recursive: true, force: true });
  assert.strictEqual(result.status, 1);
  const output = (result.stderr || "") + (result.stdout || "");
  assert.ok(output.includes("No test files found"), `Expected "No test files found" in output: ${output}`);
});

test("scripts/run-tests.mjs aborts on recursive invocation", () => {
  const result = spawnSync("node", [scriptPath], {
    stdio: "pipe",
    encoding: "utf-8",
    env: { ...process.env, _AI_REVIEW_RUN_TESTS_DEPTH: "1" },
  });
  assert.strictEqual(result.status, 1);
  assert.ok(result.stderr.includes("Recursive invocation detected"));
});
