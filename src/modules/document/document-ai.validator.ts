import {
  DOCUMENT_AI_ACTION_DUE_DATE_MAX_LENGTH,
  DOCUMENT_AI_ACTION_ITEMS_MAX_ITEMS,
  DOCUMENT_AI_ACTION_MAX_LENGTH,
  DOCUMENT_AI_ACTION_OWNER_MAX_LENGTH,
  DOCUMENT_AI_CONFIDENCE_LEVELS,
  DOCUMENT_AI_IMPORTANT_DATES_MAX_ITEMS,
  DOCUMENT_AI_IMPORTANT_DATE_CONTEXT_MAX_LENGTH,
  DOCUMENT_AI_IMPORTANT_DATE_TEXT_MAX_LENGTH,
  DOCUMENT_AI_KEY_POINTS_MAX_ITEMS,
  DOCUMENT_AI_KEY_POINT_MAX_LENGTH,
  DOCUMENT_AI_RISKS_MAX_ITEMS,
  DOCUMENT_AI_RISK_MAX_LENGTH,
  DOCUMENT_AI_SUMMARY_MAX_LENGTH,
} from './document-ai.constant.js';
import type {
  DocumentAiActionItem,
  DocumentAiAnalysis,
  DocumentAiConfidence,
  DocumentAiImportantDate,
  DocumentAiValidationResult,
} from './document-ai.interface.js';

const CONFIDENCE_LEVELS: ReadonlySet<string> = new Set(
  DOCUMENT_AI_CONFIDENCE_LEVELS,
);

const ROOT_KEYS = [
  'summary',
  'keyPoints',
  'actionItems',
  'importantDates',
  'risksOrWarnings',
  'confidence',
] as const;

const ACTION_ITEM_KEYS = [
  'action',
  'ownerMentioned',
  'dueDateMentioned',
] as const;

const IMPORTANT_DATE_KEYS = ['dateText', 'context'] as const;

/**
 * Authoritative validation of document-assistant output.
 *
 * Constrained decoding guarantees JSON syntax and declared enums, but it does
 * not enforce string lengths, non-empty required text, array bounds, or
 * rejected unknown fields. Nothing leaves the endpoint without passing here,
 * and the same pure function runs again after a semantic retry.
 */
export function parseDocumentAiAnalysis(
  raw: string,
): DocumentAiValidationResult {
  const parsed = parseJson(raw);

  if (parsed === undefined) {
    return { ok: false, reason: 'invalid_json' };
  }

  if (!isRecord(parsed) || !hasExactKeys(parsed, ROOT_KEYS)) {
    return { ok: false, reason: 'invalid_shape' };
  }

  const summary = readText(parsed.summary, DOCUMENT_AI_SUMMARY_MAX_LENGTH);
  if (summary === null) {
    return { ok: false, reason: 'invalid_summary' };
  }

  const keyPoints = readStringList(
    parsed.keyPoints,
    DOCUMENT_AI_KEY_POINTS_MAX_ITEMS,
    DOCUMENT_AI_KEY_POINT_MAX_LENGTH,
  );
  if (keyPoints === null) {
    return { ok: false, reason: 'invalid_key_points' };
  }

  const actionItems = readActionItems(parsed.actionItems);
  if (actionItems === null) {
    return { ok: false, reason: 'invalid_action_items' };
  }

  const importantDates = readImportantDates(parsed.importantDates);
  if (importantDates === null) {
    return { ok: false, reason: 'invalid_important_dates' };
  }

  const risksOrWarnings = readStringList(
    parsed.risksOrWarnings,
    DOCUMENT_AI_RISKS_MAX_ITEMS,
    DOCUMENT_AI_RISK_MAX_LENGTH,
  );
  if (risksOrWarnings === null) {
    return { ok: false, reason: 'invalid_risks' };
  }

  if (
    typeof parsed.confidence !== 'string' ||
    !CONFIDENCE_LEVELS.has(parsed.confidence)
  ) {
    return { ok: false, reason: 'invalid_confidence' };
  }

  const analysis: DocumentAiAnalysis = {
    summary,
    keyPoints,
    actionItems,
    importantDates,
    risksOrWarnings,
    confidence: parsed.confidence as DocumentAiConfidence,
  };

  return { ok: true, analysis };
}

function readActionItems(value: unknown): DocumentAiActionItem[] | null {
  if (
    !Array.isArray(value) ||
    value.length > DOCUMENT_AI_ACTION_ITEMS_MAX_ITEMS
  ) {
    return null;
  }

  const items: DocumentAiActionItem[] = [];

  for (const entry of value) {
    if (!isRecord(entry) || !hasExactKeys(entry, ACTION_ITEM_KEYS)) {
      return null;
    }

    const action = readText(entry.action, DOCUMENT_AI_ACTION_MAX_LENGTH);
    if (action === null) {
      return null;
    }

    const owner = readOptionalText(
      entry.ownerMentioned,
      DOCUMENT_AI_ACTION_OWNER_MAX_LENGTH,
    );
    const dueDate = readOptionalText(
      entry.dueDateMentioned,
      DOCUMENT_AI_ACTION_DUE_DATE_MAX_LENGTH,
    );

    if (owner === undefined || dueDate === undefined) {
      return null;
    }

    items.push({
      action,
      ownerMentioned: owner,
      dueDateMentioned: dueDate,
    });
  }

  return items;
}

function readImportantDates(value: unknown): DocumentAiImportantDate[] | null {
  if (
    !Array.isArray(value) ||
    value.length > DOCUMENT_AI_IMPORTANT_DATES_MAX_ITEMS
  ) {
    return null;
  }

  const items: DocumentAiImportantDate[] = [];

  for (const entry of value) {
    if (!isRecord(entry) || !hasExactKeys(entry, IMPORTANT_DATE_KEYS)) {
      return null;
    }

    const dateText = readText(
      entry.dateText,
      DOCUMENT_AI_IMPORTANT_DATE_TEXT_MAX_LENGTH,
    );
    if (dateText === null) {
      return null;
    }

    const context = readText(
      entry.context,
      DOCUMENT_AI_IMPORTANT_DATE_CONTEXT_MAX_LENGTH,
    );
    if (context === null) {
      return null;
    }

    items.push({ dateText, context });
  }

  return items;
}

function readStringList(
  value: unknown,
  maxItems: number,
  maxLength: number,
): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) {
    return null;
  }

  const items: string[] = [];

  for (const entry of value) {
    const text = readText(entry, maxLength);

    if (text === null) {
      return null;
    }

    items.push(text);
  }

  return items;
}

/**
 * Returns `undefined` for an invalid value and `null` for an explicitly empty
 * mention, so "not mentioned" is represented the same way in every response.
 */
function readOptionalText(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    return undefined;
  }

  return trimmed.length === 0 ? null : trimmed;
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

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }

  return trimmed;
}
