export const TASK_AI_TITLE_MAX_LENGTH = 180;

export const TASK_AI_DESCRIPTION_MAX_LENGTH = 5_000;

export const TASK_AI_REASONING_MAX_LENGTH = 1_000;

/**
 * JSON Schema used to guide constrained decoding.
 *
 * Only the subset supported by `responseJsonSchema` is used: `type`, `enum`,
 * `anyOf`, `required`, `properties` and `additionalProperties`. `nullable` is
 * not supported, so optional dates use `anyOf: [{string}, {null}]`.
 *
 * String lengths are *not* enforced by constrained decoding. The authoritative
 * business validation lives in `task-ai.validator.ts`.
 */
export const TASK_AI_DRAFT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    suggestedPriority: {
      type: 'string',
      enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
    },
    suggestedCompletionMode: {
      type: 'string',
      enum: ['REVIEW_REQUIRED', 'DIRECT'],
    },
    suggestedDueAt: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    reasoning: { type: 'string' },
  },
  required: [
    'title',
    'description',
    'suggestedPriority',
    'suggestedCompletionMode',
    'suggestedDueAt',
    'reasoning',
  ],
  additionalProperties: false,
};
