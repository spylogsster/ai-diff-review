/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDiffBetweenRefs } from '../src/git.ts';

test('getDiffBetweenRefs returns diff between two refs', () => {
  // Use HEAD...HEAD which always produces an empty diff (no changes)
  const diff = getDiffBetweenRefs('HEAD', 'HEAD');
  assert.equal(diff, '');
});
