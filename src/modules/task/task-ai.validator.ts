import {
  TaskCompletionMode,
  TaskPriority,
} from '../../../generated/prisma/enums.js';
import {
  TASK_AI_DESCRIPTION_MAX_LENGTH,
  TASK_AI_REASONING_MAX_LENGTH,
  TASK_AI_TITLE_MAX_LENGTH,
} from './task-ai.constant.js';
import type {
  TaskAiDraft,
  TaskAiValidationResult,
} from './task-ai.interface.js';

const PRIORITIES: ReadonlySet<string> = new Set(Object.values(TaskPriority));

const COMPLETION_MODES: ReadonlySet<string> = new Set(
  Object.values(TaskCompletionMode),
);

/**
 * Authoritative validation of model output.
 *
 * Constrained decoding guarantees JSON syntax and the enum membership declared
 * in the response schema, but it does not enforce string lengths, non-empty
 * text, or plausible dates. Everything the endpoint returns must pass here.
 *
 * The same function is reused after a retry, so it stays pure and synchronous
 * with no Nest or provider dependencies.
 */
export function parseTaskAiDraft(
  raw: string,
  now: Date = new Date(),
): TaskAiValidationResult {
  const parsed = parseJsonObject(raw);

  if (parsed.ok === false) {
    return parsed;
  }

  const value = parsed.value;

  const title = readTrimmedString(value.title);
  if (
    title === null ||
    title.length === 0 ||
    title.length > TASK_AI_TITLE_MAX_LENGTH
  ) {
    return { ok: false, reason: 'invalid_title' };
  }

  const description = readTrimmedString(value.description);
  if (
    description === null ||
    description.length === 0 ||
    description.length > TASK_AI_DESCRIPTION_MAX_LENGTH
  ) {
    return { ok: false, reason: 'invalid_description' };
  }

  const priority = readTrimmedString(value.suggestedPriority);
  if (priority === null || !PRIORITIES.has(priority)) {
    return { ok: false, reason: 'invalid_priority' };
  }

  const completionMode = readTrimmedString(value.suggestedCompletionMode);
  if (completionMode === null || !COMPLETION_MODES.has(completionMode)) {
    return { ok: false, reason: 'invalid_completion_mode' };
  }

  const dueAt = readDueAt(value.suggestedDueAt, now);
  if (dueAt.ok === false) {
    return { ok: false, reason: 'invalid_due_at' };
  }

  const reasoning = readTrimmedString(value.reasoning);
  if (
    reasoning === null ||
    reasoning.length === 0 ||
    reasoning.length > TASK_AI_REASONING_MAX_LENGTH
  ) {
    return { ok: false, reason: 'invalid_reasoning' };
  }

  const draft: TaskAiDraft = {
    title,
    description,
    suggestedPriority: priority as TaskPriority,
    suggestedCompletionMode: completionMode as TaskCompletionMode,
    suggestedDueAt: dueAt.value,
    reasoning,
  };

  return { ok: true, draft };
}

type JsonObjectResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: 'invalid_json' | 'invalid_shape' };

function parseJsonObject(raw: string): JsonObjectResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stripCodeFence(raw));
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'invalid_shape' };
  }

  return { ok: true, value: parsed as Record<string, unknown> };
}

/**
 * Removes a surrounding Markdown code fence if the model added one despite the
 * schema. This only tolerates a transport formatting artefact; it never
 * relaxes the business validation below.
 */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();

  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() : null;
}

/**
 * Past dates are dropped rather than treated as a hard failure: a stale due
 * date is unusable but does not invalidate an otherwise sound draft.
 */
function readDueAt(
  value: unknown,
  now: Date,
): { ok: true; value: string | null } | { ok: false } {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }

  if (typeof value !== 'string') {
    return { ok: false };
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }

  const parsed = new Date(trimmed);

  if (Number.isNaN(parsed.getTime())) {
    return { ok: false };
  }

  if (parsed.getTime() <= now.getTime()) {
    return { ok: true, value: null };
  }

  return { ok: true, value: parsed.toISOString() };
}
