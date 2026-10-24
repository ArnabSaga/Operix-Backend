import {
  TaskPriority,
  TaskRecurrenceFrequency,
  TaskScope,
  TaskStatus,
} from '../../../generated/prisma/enums.js';
import { TaskSort } from '../task/task.constant.js';
import { ASK_OPERIX_TASK_LIMIT } from './assistant.constant.js';
import {
  ASK_OPERIX_RESPONSE_MODES,
  type AskOperixPlan,
  type AskOperixResponseMode,
  type AskOperixTaskQuery,
  type AskOperixValidationResult,
} from './assistant.interface.js';

const TASK_ROOT_KEYS = ['intent', 'taskQuery', 'responseMode'] as const;
const TASK_QUERY_KEYS = [
  'status',
  'priority',
  'overdue',
  'scope',
  'recurrenceFrequency',
  'text',
  'sort',
  'limit',
] as const;
const OPERATIONS_KEYS = ['intent', 'days'] as const;
const CLARIFICATION_KEYS = ['intent', 'clarification'] as const;
const UNSUPPORTED_KEYS = ['intent', 'reason'] as const;
const responseModes = new Set<string>(ASK_OPERIX_RESPONSE_MODES);

export function parseAskOperixPlan(
  raw: string,
): AskOperixValidationResult<AskOperixPlan> {
  const parsed = parseJson(raw);
  if (!isRecord(parsed) || typeof parsed.intent !== 'string')
    return invalid('invalid_shape');

  if (parsed.intent === 'TASK_QUERY') {
    if (
      !hasExactKeys(parsed, TASK_ROOT_KEYS) ||
      !isRecord(parsed.taskQuery) ||
      !hasExactKeys(parsed.taskQuery, TASK_QUERY_KEYS)
    )
      return invalid('invalid_task_query');
    const query = readTaskQuery(parsed.taskQuery);
    if (
      !query ||
      typeof parsed.responseMode !== 'string' ||
      !responseModes.has(parsed.responseMode)
    )
      return invalid('invalid_task_query');
    return {
      ok: true,
      value: {
        intent: 'TASK_QUERY',
        taskQuery: query,
        responseMode: parsed.responseMode as AskOperixResponseMode,
      },
    };
  }
  if (parsed.intent === 'OPERATIONS_SNAPSHOT') {
    if (
      !hasExactKeys(parsed, OPERATIONS_KEYS) ||
      (parsed.days !== 7 && parsed.days !== 30 && parsed.days !== 90)
    )
      return invalid('invalid_operations');
    return {
      ok: true,
      value: { intent: 'OPERATIONS_SNAPSHOT', days: parsed.days },
    };
  }
  if (parsed.intent === 'NEEDS_CLARIFICATION') {
    if (!hasExactKeys(parsed, CLARIFICATION_KEYS))
      return invalid('invalid_clarification');
    const clarification = readText(parsed.clarification, 500);
    return clarification
      ? { ok: true, value: { intent: 'NEEDS_CLARIFICATION', clarification } }
      : invalid('invalid_clarification');
  }
  if (parsed.intent === 'UNSUPPORTED') {
    if (!hasExactKeys(parsed, UNSUPPORTED_KEYS))
      return invalid('invalid_unsupported');
    const reason = readText(parsed.reason, 500);
    return reason
      ? { ok: true, value: { intent: 'UNSUPPORTED', reason } }
      : invalid('invalid_unsupported');
  }
  return invalid('unknown_intent');
}

function readTaskQuery(
  value: Record<string, unknown>,
): AskOperixTaskQuery | null {
  const status = readNullableEnum(value.status, Object.values(TaskStatus));
  const priority = readNullableEnum(
    value.priority,
    Object.values(TaskPriority),
  );
  const scope = readNullableEnum(value.scope, Object.values(TaskScope));
  const recurrenceFrequency = readNullableEnum(
    value.recurrenceFrequency,
    Object.values(TaskRecurrenceFrequency),
  );
  const sort = readNullableEnum(value.sort, Object.values(TaskSort));
  const text = value.text === null ? null : readText(value.text, 100);
  if (
    status === undefined ||
    priority === undefined ||
    scope === undefined ||
    recurrenceFrequency === undefined ||
    sort === undefined ||
    text === undefined
  )
    return null;
  if (value.overdue !== null && typeof value.overdue !== 'boolean') return null;
  if (
    !Number.isInteger(value.limit) ||
    (value.limit as number) < 1 ||
    (value.limit as number) > ASK_OPERIX_TASK_LIMIT
  )
    return null;
  return {
    status: status as TaskStatus | null,
    priority: priority as TaskPriority | null,
    overdue: value.overdue,
    scope: scope as TaskScope | null,
    recurrenceFrequency: recurrenceFrequency as TaskRecurrenceFrequency | null,
    text,
    sort: sort as TaskSort | null,
    limit: value.limit as number,
  };
}

function readNullableEnum(
  value: unknown,
  allowed: string[],
): string | null | undefined {
  if (value === null) return null;
  return typeof value === 'string' && allowed.includes(value)
    ? value
    : undefined;
}
function readText(value: unknown, max: number): string | null | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : undefined;
}
function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key))
  );
}
function invalid(reason: string): AskOperixValidationResult<never> {
  return { ok: false, reason };
}
