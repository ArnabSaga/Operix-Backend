import type {
  TaskPriority,
  TaskRecurrenceFrequency,
  TaskScope,
  TaskStatus,
} from '../../../generated/prisma/enums.js';
import type { TaskSort } from '../task/task.constant.js';

export const ASK_OPERIX_INTENTS = [
  'TASK_QUERY',
  'OPERATIONS_SNAPSHOT',
  'NEEDS_CLARIFICATION',
  'UNSUPPORTED',
] as const;
export type AskOperixIntent = (typeof ASK_OPERIX_INTENTS)[number];

export const ASK_OPERIX_RESPONSE_MODES = ['COUNT', 'LIST', 'SUMMARY'] as const;
export type AskOperixResponseMode = (typeof ASK_OPERIX_RESPONSE_MODES)[number];

export const ASK_OPERIX_CONFIDENCE = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type AskOperixConfidence = (typeof ASK_OPERIX_CONFIDENCE)[number];

export interface AskOperixTaskQuery {
  status: TaskStatus | null;
  priority: TaskPriority | null;
  overdue: boolean | null;
  scope: TaskScope | null;
  recurrenceFrequency: TaskRecurrenceFrequency | null;
  text: string | null;
  sort: TaskSort | null;
  limit: number;
}

export type AskOperixPlan =
  | {
      intent: 'TASK_QUERY';
      taskQuery: AskOperixTaskQuery;
      responseMode: AskOperixResponseMode;
    }
  | { intent: 'OPERATIONS_SNAPSHOT'; days: 7 | 30 | 90 }
  | { intent: 'NEEDS_CLARIFICATION'; clarification: string }
  | { intent: 'UNSUPPORTED'; reason: string };

export interface AskOperixAnswerDraft {
  answer: string;
  highlights: string[];
  referencedTaskRefs: string[];
  confidence: AskOperixConfidence;
  limitations: string[];
}

export type AskOperixValidationResult<T> =
  { ok: true; value: T } | { ok: false; reason: string };

export interface AskOperixTaskFact {
  taskRef: string;
  referenceCode: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  scope: TaskScope;
  dueAt: string | null;
  teamName: string | null;
  responsibleName: string | null;
}

export interface AskOperixTaskReference {
  id: string;
  referenceCode: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
}

export interface AskOperixResponse {
  status: 'ANSWERED' | 'NEEDS_CLARIFICATION' | 'UNSUPPORTED';
  answer: string | null;
  clarification: string | null;
  highlights: string[];
  references: {
    tasks: AskOperixTaskReference[];
    operations: { days: 7 | 30 | 90; asOf: string } | null;
  };
  confidence: AskOperixConfidence | null;
  limitations: string[];
  meta: {
    provider: string;
    model: string;
    attempts: number;
    latencyMs: number;
    intent: Extract<
      AskOperixIntent,
      'TASK_QUERY' | 'OPERATIONS_SNAPSHOT'
    > | null;
  };
}
