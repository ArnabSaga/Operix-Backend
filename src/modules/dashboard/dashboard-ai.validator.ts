import {
  DASHBOARD_AI_EVIDENCE_MAX_LENGTH,
  DASHBOARD_AI_EXECUTIVE_SUMMARY_MAX_LENGTH,
  DASHBOARD_AI_HEADLINE_MAX_LENGTH,
  DASHBOARD_AI_LIMITATION_MAX_LENGTH,
  DASHBOARD_AI_LIMITATIONS_MAX_ITEMS,
  DASHBOARD_AI_NEXT_ACTION_MAX_LENGTH,
  DASHBOARD_AI_NEXT_ACTIONS_MAX_ITEMS,
  DASHBOARD_AI_OBSERVATION_MAX_LENGTH,
  DASHBOARD_AI_OBSERVATIONS_MAX_ITEMS,
  DASHBOARD_AI_PRIORITIES_MAX_ITEMS,
  DASHBOARD_AI_PRIORITY_TITLE_MAX_LENGTH,
  DASHBOARD_AI_REPORTING_SUMMARY_MAX_LENGTH,
  DASHBOARD_AI_SUBJECT_MAX_LENGTH,
  DASHBOARD_AI_SUGGESTED_ACTION_MAX_LENGTH,
  DASHBOARD_AI_TREND_SUMMARY_MAX_LENGTH,
} from './dashboard-ai.constant.js';
import {
  DASHBOARD_AI_CATEGORIES,
  DASHBOARD_AI_CONFIDENCE,
  DASHBOARD_AI_SEVERITIES,
  DASHBOARD_AI_SUBJECT_TYPES,
} from './dashboard-ai.interface.js';
import type {
  DashboardAiBrief,
  DashboardAiCategory,
  DashboardAiConfidence,
  DashboardAiPriority,
  DashboardAiSeverity,
  DashboardAiSubjectType,
  DashboardAiValidationResult,
  DashboardAiWorkloadObservation,
} from './dashboard-ai.interface.js';

const ROOT_KEYS = [
  'headline',
  'executiveSummary',
  'priorities',
  'workloadObservations',
  'trendSummary',
  'reportingSummary',
  'nextActions',
  'confidence',
  'limitations',
] as const;
const PRIORITY_KEYS = [
  'severity',
  'category',
  'title',
  'evidence',
  'suggestedAction',
] as const;
const OBSERVATION_KEYS = [
  'subjectType',
  'subject',
  'observation',
  'evidence',
] as const;

const SEVERITIES: ReadonlySet<string> = new Set(DASHBOARD_AI_SEVERITIES);
const CATEGORIES: ReadonlySet<string> = new Set(DASHBOARD_AI_CATEGORIES);
const SUBJECT_TYPES: ReadonlySet<string> = new Set(DASHBOARD_AI_SUBJECT_TYPES);
const CONFIDENCE: ReadonlySet<string> = new Set(DASHBOARD_AI_CONFIDENCE);

export function parseDashboardAiBrief(
  raw: string,
): DashboardAiValidationResult {
  const parsed = parseJson(raw);
  if (!isRecord(parsed) || !hasExactKeys(parsed, ROOT_KEYS)) {
    return {
      ok: false,
      reason: parsed === undefined ? 'invalid_json' : 'invalid_shape',
    };
  }

  const headline = readText(parsed.headline, DASHBOARD_AI_HEADLINE_MAX_LENGTH);
  if (headline === null) return { ok: false, reason: 'invalid_headline' };

  const executiveSummary = readText(
    parsed.executiveSummary,
    DASHBOARD_AI_EXECUTIVE_SUMMARY_MAX_LENGTH,
  );
  if (executiveSummary === null) {
    return { ok: false, reason: 'invalid_summary' };
  }

  const priorities = readPriorities(parsed.priorities);
  if (priorities === null) {
    return { ok: false, reason: 'invalid_priorities' };
  }

  const workloadObservations = readObservations(parsed.workloadObservations);
  if (workloadObservations === null) {
    return { ok: false, reason: 'invalid_observations' };
  }

  const trendSummary = readText(
    parsed.trendSummary,
    DASHBOARD_AI_TREND_SUMMARY_MAX_LENGTH,
  );
  if (trendSummary === null) {
    return { ok: false, reason: 'invalid_trend_summary' };
  }

  const reportingSummary = readNullableText(
    parsed.reportingSummary,
    DASHBOARD_AI_REPORTING_SUMMARY_MAX_LENGTH,
  );
  if (reportingSummary === undefined) {
    return { ok: false, reason: 'invalid_reporting_summary' };
  }

  const nextActions = readTextArray(
    parsed.nextActions,
    DASHBOARD_AI_NEXT_ACTIONS_MAX_ITEMS,
    DASHBOARD_AI_NEXT_ACTION_MAX_LENGTH,
  );
  if (nextActions === null) {
    return { ok: false, reason: 'invalid_next_actions' };
  }

  if (
    typeof parsed.confidence !== 'string' ||
    !CONFIDENCE.has(parsed.confidence)
  ) {
    return { ok: false, reason: 'invalid_confidence' };
  }

  const limitations = readTextArray(
    parsed.limitations,
    DASHBOARD_AI_LIMITATIONS_MAX_ITEMS,
    DASHBOARD_AI_LIMITATION_MAX_LENGTH,
  );
  if (limitations === null) {
    return { ok: false, reason: 'invalid_limitations' };
  }

  const brief: DashboardAiBrief = {
    headline,
    executiveSummary,
    priorities,
    workloadObservations,
    trendSummary,
    reportingSummary,
    nextActions,
    confidence: parsed.confidence as DashboardAiConfidence,
    limitations,
  };

  return { ok: true, brief };
}

function readPriorities(value: unknown): DashboardAiPriority[] | null {
  if (
    !Array.isArray(value) ||
    value.length > DASHBOARD_AI_PRIORITIES_MAX_ITEMS
  ) {
    return null;
  }

  const result: DashboardAiPriority[] = [];
  for (const item of value) {
    if (!isRecord(item) || !hasExactKeys(item, PRIORITY_KEYS)) return null;
    if (typeof item.severity !== 'string' || !SEVERITIES.has(item.severity)) {
      return null;
    }
    if (typeof item.category !== 'string' || !CATEGORIES.has(item.category)) {
      return null;
    }
    const title = readText(item.title, DASHBOARD_AI_PRIORITY_TITLE_MAX_LENGTH);
    const evidence = readText(item.evidence, DASHBOARD_AI_EVIDENCE_MAX_LENGTH);
    const suggestedAction = readText(
      item.suggestedAction,
      DASHBOARD_AI_SUGGESTED_ACTION_MAX_LENGTH,
    );
    if (title === null || evidence === null || suggestedAction === null) {
      return null;
    }
    result.push({
      severity: item.severity as DashboardAiSeverity,
      category: item.category as DashboardAiCategory,
      title,
      evidence,
      suggestedAction,
    });
  }
  return result;
}

function readObservations(
  value: unknown,
): DashboardAiWorkloadObservation[] | null {
  if (
    !Array.isArray(value) ||
    value.length > DASHBOARD_AI_OBSERVATIONS_MAX_ITEMS
  ) {
    return null;
  }

  const result: DashboardAiWorkloadObservation[] = [];
  for (const item of value) {
    if (!isRecord(item) || !hasExactKeys(item, OBSERVATION_KEYS)) return null;
    if (
      typeof item.subjectType !== 'string' ||
      !SUBJECT_TYPES.has(item.subjectType)
    ) {
      return null;
    }
    const subject = readText(item.subject, DASHBOARD_AI_SUBJECT_MAX_LENGTH);
    const observation = readText(
      item.observation,
      DASHBOARD_AI_OBSERVATION_MAX_LENGTH,
    );
    const evidence = readText(item.evidence, DASHBOARD_AI_EVIDENCE_MAX_LENGTH);
    if (subject === null || observation === null || evidence === null) {
      return null;
    }
    result.push({
      subjectType: item.subjectType as DashboardAiSubjectType,
      subject,
      observation,
      evidence,
    });
  }
  return result;
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
    if (text === null) return null;
    result.push(text);
  }
  return result;
}

function readNullableText(
  value: unknown,
  maxLength: number,
): string | null | undefined {
  if (value === null) return null;
  return readText(value, maxLength) ?? undefined;
}

function readText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
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
