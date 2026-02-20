/* SPDX-License-Identifier: MPL-2.0
 * Copyright (c) 2026 ai-review contributors
 */
export const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'summary', 'findings'],
  properties: {
    status: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string', minLength: 1 },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'title', 'details', 'file', 'line'],
        properties: {
          severity: { type: 'string' },
          title: { type: 'string' },
          details: { type: 'string' },
          file: { type: ['string', 'null'] },
          line: { type: ['integer', 'null'], minimum: 1 },
        },
      },
    },
  },
} as const;
