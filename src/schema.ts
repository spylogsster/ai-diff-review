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
        required: ['severity', 'title', 'details'],
        properties: {
          severity: { type: 'string' },
          title: { type: 'string' },
          details: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer', minimum: 1 },
        },
      },
    },
  },
} as const;
