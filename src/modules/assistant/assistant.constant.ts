import {
  TaskPriority,
  TaskRecurrenceFrequency,
  TaskScope,
  TaskStatus,
} from '../../../generated/prisma/enums.js';
import { TaskSort } from '../task/task.constant.js';
import {
  ASK_OPERIX_CONFIDENCE,
  ASK_OPERIX_RESPONSE_MODES,
} from './assistant.interface.js';

export const ASK_OPERIX_TASK_LIMIT = 10;
export const ASK_OPERIX_QUESTION_MAX_LENGTH = 1000;
export const ASK_OPERIX_ANSWER_MAX_LENGTH = 1800;
export const ASK_OPERIX_HIGHLIGHT_MAX_ITEMS = 6;
export const ASK_OPERIX_HIGHLIGHT_MAX_LENGTH = 500;
export const ASK_OPERIX_LIMITATION_MAX_ITEMS = 8;
export const ASK_OPERIX_LIMITATION_MAX_LENGTH = 500;
export const ASK_OPERIX_MAX_OUTPUT_TOKENS = 2400;
export const ASK_OPERIX_TEMPERATURE = 0.1;

export const ASK_OPERIX_UNSUPPORTED_MESSAGE =
  'Ask Operix V1 can currently answer questions about Tasks and, for Admins and Super Admins, current operational Dashboard metrics.';
export const ASK_OPERIX_MEMBER_OPERATIONS_MESSAGE =
  'Operational Dashboard summaries are available to Admins and Super Admins. You can ask about your assigned Tasks.';
export const ASK_OPERIX_ZERO_RESULTS_MESSAGE =
  'No Tasks matched your question within your current Operix access scope.';

const nullable = (schema: Record<string, unknown>) => ({
  anyOf: [schema, { type: 'null' }],
});

const taskQuerySchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    status: nullable({ type: 'string', enum: Object.values(TaskStatus) }),
    priority: nullable({
      type: 'string',
      enum: Object.values(TaskPriority),
    }),
    overdue: nullable({ type: 'boolean' }),
    scope: nullable({ type: 'string', enum: Object.values(TaskScope) }),
    recurrenceFrequency: nullable({
      type: 'string',
      enum: Object.values(TaskRecurrenceFrequency),
    }),
    text: nullable({ type: 'string' }),
    sort: nullable({ type: 'string', enum: Object.values(TaskSort) }),
    limit: { type: 'integer', minimum: 1, maximum: ASK_OPERIX_TASK_LIMIT },
  },
  required: [
    'status',
    'priority',
    'overdue',
    'scope',
    'recurrenceFrequency',
    'text',
    'sort',
    'limit',
  ],
  additionalProperties: false,
};

/**
 * Exactly one branch per intent.
 *
 * The planner validator enforces an exact key set for whichever intent the
 * model chose. A flat schema with a single `required: ['intent']` let the model
 * emit a shape that was schema-valid but validator-invalid, which burned the
 * one semantic retry and surfaced as `AI_RESPONSE_INVALID`. Each branch here now
 * requires exactly the keys the validator demands for that intent.
 */
export const ASK_OPERIX_PLAN_JSON_SCHEMA: Record<string, unknown> = {
  oneOf: [
    {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: ['TASK_QUERY'] },
        taskQuery: taskQuerySchema,
        responseMode: {
          type: 'string',
          enum: [...ASK_OPERIX_RESPONSE_MODES],
        },
      },
      required: ['intent', 'taskQuery', 'responseMode'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: ['OPERATIONS_SNAPSHOT'] },
        days: { type: 'integer', enum: [7, 30, 90] },
      },
      required: ['intent', 'days'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: ['NEEDS_CLARIFICATION'] },
        clarification: { type: 'string' },
      },
      required: ['intent', 'clarification'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: ['UNSUPPORTED'] },
        reason: { type: 'string' },
      },
      required: ['intent', 'reason'],
      additionalProperties: false,
    },
  ],
};

export const ASK_OPERIX_ANSWER_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' } },
    referencedTaskRefs: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: [...ASK_OPERIX_CONFIDENCE] },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'answer',
    'highlights',
    'referencedTaskRefs',
    'confidence',
    'limitations',
  ],
  additionalProperties: false,
};
