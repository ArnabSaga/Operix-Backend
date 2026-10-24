import type {
  TaskCompletionMode,
  TaskPriority,
} from '../../../generated/prisma/enums.js';

/**
 * Advisory draft produced by the AI provider. It intentionally contains no
 * identifiers, scope, team, assignee, recurrence or self-claim information:
 * those stay under explicit human control in `POST /tasks`.
 */
export interface TaskAiDraft {
  title: string;
  description: string;
  suggestedPriority: TaskPriority;
  suggestedCompletionMode: TaskCompletionMode;
  /** ISO 8601 UTC timestamp, or null when no usable timing was inferred. */
  suggestedDueAt: string | null;
  reasoning: string;
}

export interface TaskAiDraftMeta {
  model: string;
  /** Provider calls actually made: 1 on success, 2 after one retry. */
  attempts: number;
  /** Total time spent across all attempts. */
  latencyMs: number;
}

export type TaskAiDraftResponse = TaskAiDraft & { meta: TaskAiDraftMeta };

export type TaskAiValidationFailureReason =
  | 'invalid_json'
  | 'invalid_shape'
  | 'invalid_title'
  | 'invalid_description'
  | 'invalid_priority'
  | 'invalid_completion_mode'
  | 'invalid_due_at'
  | 'invalid_reasoning';

export type TaskAiValidationResult =
  | { ok: true; draft: TaskAiDraft }
  | { ok: false; reason: TaskAiValidationFailureReason };
