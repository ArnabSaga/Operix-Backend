import {
  ASK_OPERIX_ANSWER_MAX_LENGTH,
  ASK_OPERIX_HIGHLIGHT_MAX_ITEMS,
  ASK_OPERIX_HIGHLIGHT_MAX_LENGTH,
  ASK_OPERIX_LIMITATION_MAX_ITEMS,
  ASK_OPERIX_LIMITATION_MAX_LENGTH,
  ASK_OPERIX_TASK_LIMIT,
} from './assistant.constant.js';
import {
  ASK_OPERIX_CONFIDENCE,
  type AskOperixAnswerDraft,
  type AskOperixConfidence,
  type AskOperixValidationResult,
} from './assistant.interface.js';

const ROOT_KEYS = [
  'answer',
  'highlights',
  'referencedTaskRefs',
  'confidence',
  'limitations',
] as const;
const confidenceValues = new Set<string>(ASK_OPERIX_CONFIDENCE);

export function parseAskOperixAnswer(
  raw: string,
  allowedRefs: ReadonlySet<string>,
): AskOperixValidationResult<AskOperixAnswerDraft> {
  const parsed = parseJson(raw);
  if (!isRecord(parsed) || !hasExactKeys(parsed, ROOT_KEYS))
    return { ok: false, reason: 'invalid_shape' };
  const answer = readText(parsed.answer, ASK_OPERIX_ANSWER_MAX_LENGTH);
  const highlights = readTextArray(
    parsed.highlights,
    ASK_OPERIX_HIGHLIGHT_MAX_ITEMS,
    ASK_OPERIX_HIGHLIGHT_MAX_LENGTH,
  );
  const limitations = readTextArray(
    parsed.limitations,
    ASK_OPERIX_LIMITATION_MAX_ITEMS,
    ASK_OPERIX_LIMITATION_MAX_LENGTH,
  );
  const refs = readRefs(parsed.referencedTaskRefs, allowedRefs);
  if (
    !answer ||
    !highlights ||
    !limitations ||
    !refs ||
    typeof parsed.confidence !== 'string' ||
    !confidenceValues.has(parsed.confidence)
  )
    return { ok: false, reason: 'invalid_answer' };
  return {
    ok: true,
    value: {
      answer,
      highlights,
      limitations,
      referencedTaskRefs: refs,
      confidence: parsed.confidence as AskOperixConfidence,
    },
  };
}

function readRefs(
  value: unknown,
  allowed: ReadonlySet<string>,
): string[] | null {
  if (!Array.isArray(value) || value.length > ASK_OPERIX_TASK_LIMIT)
    return null;
  const refs: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !allowed.has(item) || refs.includes(item))
      return null;
    refs.push(item);
  }
  return refs;
}
function readTextArray(
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const result: string[] = [];
  for (const item of value) {
    const text = readText(item, maxLength);
    if (!text) return null;
    result.push(text);
  }
  return result;
}
function readText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
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
