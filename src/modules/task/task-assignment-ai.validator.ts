import {
  TASK_ASSIGNMENT_AI_LIMITATION_MAX_LENGTH,
  TASK_ASSIGNMENT_AI_LIMITATIONS_MAX_ITEMS,
  TASK_ASSIGNMENT_AI_LIST_ITEM_MAX_LENGTH,
  TASK_ASSIGNMENT_AI_LIST_MAX_ITEMS,
  TASK_ASSIGNMENT_AI_RATIONALE_MAX_LENGTH,
  TASK_ASSIGNMENT_AI_RECOMMENDATION_LIMIT,
  TASK_ASSIGNMENT_AI_SUMMARY_MAX_LENGTH,
} from './task-assignment-ai.constant.js';
import type {
  TaskAssignmentAiConfidence,
  TaskAssignmentAiDecision,
  TaskAssignmentAiDraft,
  TaskAssignmentAiRecommendationDraft,
  TaskAssignmentAiValidationResult,
} from './task-assignment-ai.interface.js';

const ROOT_KEYS = new Set([
  'summary',
  'decision',
  'recommendations',
  'confidence',
  'limitations',
]);
const RECOMMENDATION_KEYS = new Set([
  'candidateRef',
  'rationale',
  'strengths',
  'cautions',
]);
const DECISIONS = new Set<TaskAssignmentAiDecision>([
  'RECOMMEND',
  'MANUAL_SELECTION',
]);
const CONFIDENCE = new Set<TaskAssignmentAiConfidence>([
  'LOW',
  'MEDIUM',
  'HIGH',
]);

export function parseTaskAssignmentAiDraft(
  raw: string,
  allowedCandidateRefs: ReadonlySet<string>,
): TaskAssignmentAiValidationResult {
  let value: unknown;
  try {
    value = JSON.parse(stripCodeFence(raw));
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }

  if (!isExactObject(value, ROOT_KEYS)) {
    return { ok: false, reason: 'invalid_shape' };
  }

  const summary = readBoundedString(
    value.summary,
    TASK_ASSIGNMENT_AI_SUMMARY_MAX_LENGTH,
  );
  if (summary === null) return { ok: false, reason: 'invalid_summary' };

  if (
    typeof value.decision !== 'string' ||
    !DECISIONS.has(value.decision as TaskAssignmentAiDecision)
  ) {
    return { ok: false, reason: 'invalid_decision' };
  }
  const decision = value.decision as TaskAssignmentAiDecision;

  if (
    !Array.isArray(value.recommendations) ||
    value.recommendations.length > TASK_ASSIGNMENT_AI_RECOMMENDATION_LIMIT ||
    (decision === 'RECOMMEND' && value.recommendations.length === 0)
  ) {
    return { ok: false, reason: 'invalid_recommendations' };
  }

  const recommendations: TaskAssignmentAiRecommendationDraft[] = [];
  const usedRefs = new Set<string>();
  for (const item of value.recommendations) {
    if (!isExactObject(item, RECOMMENDATION_KEYS)) {
      return { ok: false, reason: 'invalid_recommendations' };
    }
    const candidateRef = readBoundedString(item.candidateRef, 20);
    if (
      candidateRef === null ||
      !allowedCandidateRefs.has(candidateRef) ||
      usedRefs.has(candidateRef)
    ) {
      return { ok: false, reason: 'invalid_candidate_ref' };
    }
    const rationale = readBoundedString(
      item.rationale,
      TASK_ASSIGNMENT_AI_RATIONALE_MAX_LENGTH,
    );
    const strengths = readStringList(item.strengths);
    const cautions = readStringList(item.cautions);
    if (rationale === null || strengths === null || cautions === null) {
      return { ok: false, reason: 'invalid_recommendations' };
    }
    usedRefs.add(candidateRef);
    recommendations.push({ candidateRef, rationale, strengths, cautions });
  }

  if (
    typeof value.confidence !== 'string' ||
    !CONFIDENCE.has(value.confidence as TaskAssignmentAiConfidence)
  ) {
    return { ok: false, reason: 'invalid_confidence' };
  }
  const limitations = readStringList(
    value.limitations,
    TASK_ASSIGNMENT_AI_LIMITATIONS_MAX_ITEMS,
    TASK_ASSIGNMENT_AI_LIMITATION_MAX_LENGTH,
  );
  if (limitations === null) {
    return { ok: false, reason: 'invalid_limitations' };
  }

  const draft: TaskAssignmentAiDraft = {
    summary,
    decision,
    recommendations,
    confidence: value.confidence as TaskAssignmentAiConfidence,
    limitations,
  };
  return { ok: true, draft };
}

function isExactObject(
  value: unknown,
  keys: ReadonlySet<string>,
): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function readBoundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function readStringList(
  value: unknown,
  maxItems = TASK_ASSIGNMENT_AI_LIST_MAX_ITEMS,
  maxLength = TASK_ASSIGNMENT_AI_LIST_ITEM_MAX_LENGTH,
): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const items = value.map((item) => readBoundedString(item, maxLength));
  return items.some((item) => item === null) ? null : (items as string[]);
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
}
