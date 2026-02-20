// SPDX-License-Identifier: MPL-2.0
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const depth = Number(process.env._AI_REVIEW_RUN_TESTS_DEPTH || "0");
if (depth > 0) {
  console.error("Recursive invocation detected, aborting");
  process.exit(1);
}

const files = existsSync("tests")
  ? readdirSync("tests", { recursive: true, withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith(".test.mts"))
      .map((d) => join(d.parentPath || d.path || "tests", d.name))
  : [];

if (!files.length) {
  console.error("No test files found");
  process.exit(1);
}

const result = spawnSync("node", ["--import", "tsx", "--test", ...files], {
  stdio: "inherit",
  env: { ...process.env, _AI_REVIEW_RUN_TESTS_DEPTH: String(depth + 1) },
});

if (result.error) {
  console.error("Failed to spawn test process:", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
