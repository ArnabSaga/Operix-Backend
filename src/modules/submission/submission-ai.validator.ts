import {
  SUBMISSION_AI_COVERAGE_EVIDENCE_MAX_LENGTH,
  SUBMISSION_AI_COVERAGE_MAX_ITEMS,
  SUBMISSION_AI_COVERAGE_REQUIREMENT_MAX_LENGTH,
  SUBMISSION_AI_COVERAGE_STATUSES,
  SUBMISSION_AI_ISSUES_MAX_ITEMS,
  SUBMISSION_AI_ISSUE_FINDING_MAX_LENGTH,
  SUBMISSION_AI_ISSUE_RATIONALE_MAX_LENGTH,
  SUBMISSION_AI_ISSUE_SEVERITIES,
  SUBMISSION_AI_QUESTION_MAX_LENGTH,
  SUBMISSION_AI_QUESTIONS_MAX_ITEMS,
  SUBMISSION_AI_SUGGESTED_DECISIONS,
  SUBMISSION_AI_SUGGESTED_FEEDBACK_MAX_LENGTH,
  SUBMISSION_AI_SUMMARY_MAX_LENGTH,
} from './submission-ai.constant.js';
import type {
  SubmissionAiCoverageItem,
  SubmissionAiCoverageStatus,
  SubmissionAiIssue,
  SubmissionAiIssueSeverity,
  SubmissionAiReview,
  SubmissionAiSuggestedDecision,
  SubmissionAiValidationResult,
} from './submission-ai.interface.js';

const DECISIONS: ReadonlySet<string> = new Set(
  SUBMISSION_AI_SUGGESTED_DECISIONS,
);

const COVERAGE_STATUSES: ReadonlySet<string> = new Set(
  SUBMISSION_AI_COVERAGE_STATUSES,
);

const ISSUE_SEVERITIES: ReadonlySet<string> = new Set(
  SUBMISSION_AI_ISSUE_SEVERITIES,
);

const ROOT_KEYS = [
  'summary',
  'requirementCoverage',
  'issues',
  'questionsForReviewer',
  'suggestedDecision',
  'suggestedFeedback',
] as const;

const COVERAGE_KEYS = ['requirement', 'status', 'evidence'] as const;

const ISSUE_KEYS = ['severity', 'finding', 'rationale'] as const;

/**
 * Authoritative validation of review-assistant output.
 *
 * Constrained decoding guarantees JSON syntax and declared enums, but it does
 * not enforce string lengths, non-empty required text, array bounds, or
 * rejected unknown fields. Nothing leaves the endpoint without passing here,
 * and the same pure function runs again after a semantic retry.
 *
 * Every failure maps to a stable internal reason so the service can log an
 * outcome without ever logging model content.
 */
export function parseSubmissionAiReview(
  raw: string,
): SubmissionAiValidationResult {
  const parsed = parseJson(raw);

  if (parsed === undefined) {
    return { ok: false, reason: 'invalid_json' };
  }

  if (!isRecord(parsed) || !hasExactKeys(parsed, ROOT_KEYS)) {
    return { ok: false, reason: 'invalid_shape' };
  }

  const summary = readText(
    parsed.summary,
    SUBMISSION_AI_SUMMARY_MAX_LENGTH,
    false,
  );

  if (summary === null) {
    return { ok: false, reason: 'invalid_summary' };
  }

  const coverage = readCoverage(parsed.requirementCoverage);

  if (coverage === null) {
    return { ok: false, reason: 'invalid_coverage' };
  }

  const issues = readIssues(parsed.issues);

  if (issues === null) {
    return { ok: false, reason: 'invalid_issues' };
  }

  const questions = readQuestions(parsed.questionsForReviewer);

  if (questions === null) {
    return { ok: false, reason: 'invalid_questions' };
  }

  if (
    typeof parsed.suggestedDecision !== 'string' ||
    !DECISIONS.has(parsed.suggestedDecision)
  ) {
    return { ok: false, reason: 'invalid_decision' };
  }

  const suggestedDecision =
    parsed.suggestedDecision as SubmissionAiSuggestedDecision;

  const suggestedFeedback = readText(
    parsed.suggestedFeedback,
    SUBMISSION_AI_SUGGESTED_FEEDBACK_MAX_LENGTH,
    true,
  );

  if (suggestedFeedback === null) {
    return { ok: false, reason: 'invalid_feedback' };
  }

  if (
    suggestedDecision === 'REQUEST_REVISION' &&
    suggestedFeedback.length === 0
  ) {
    return { ok: false, reason: 'invalid_feedback' };
  }

  const review: SubmissionAiReview = {
    summary,
    requirementCoverage: coverage,
    issues,
    questionsForReviewer: questions,
    suggestedDecision,
    suggestedFeedback,
  };

  return { ok: true, review };
}

function readCoverage(value: unknown): SubmissionAiCoverageItem[] | null {
  if (
    !Array.isArray(value) ||
    value.length > SUBMISSION_AI_COVERAGE_MAX_ITEMS
  ) {
    return null;
  }

  const items: SubmissionAiCoverageItem[] = [];

  for (const entry of value) {
    if (!isRecord(entry) || !hasExactKeys(entry, COVERAGE_KEYS)) {
      return null;
    }

    const requirement = readText(
      entry.requirement,
      SUBMISSION_AI_COVERAGE_REQUIREMENT_MAX_LENGTH,
      false,
    );

    if (requirement === null) {
      return null;
    }

    if (
      typeof entry.status !== 'string' ||
      !COVERAGE_STATUSES.has(entry.status)
    ) {
      return null;
    }

    const evidence = readText(
      entry.evidence,
      SUBMISSION_AI_COVERAGE_EVIDENCE_MAX_LENGTH,
      true,
    );

    if (evidence === null) {
      return null;
    }

    items.push({
      requirement,
      status: entry.status as SubmissionAiCoverageStatus,
      evidence,
    });
  }

  return items;
}

function readIssues(value: unknown): SubmissionAiIssue[] | null {
  if (!Array.isArray(value) || value.length > SUBMISSION_AI_ISSUES_MAX_ITEMS) {
    return null;
  }

  const items: SubmissionAiIssue[] = [];

  for (const entry of value) {
    if (!isRecord(entry) || !hasExactKeys(entry, ISSUE_KEYS)) {
      return null;
    }

    if (
      typeof entry.severity !== 'string' ||
      !ISSUE_SEVERITIES.has(entry.severity)
    ) {
      return null;
    }

    const finding = readText(
      entry.finding,
      SUBMISSION_AI_ISSUE_FINDING_MAX_LENGTH,
      false,
    );

    if (finding === null) {
      return null;
    }

    const rationale = readText(
      entry.rationale,
      SUBMISSION_AI_ISSUE_RATIONALE_MAX_LENGTH,
      false,
    );

    if (rationale === null) {
      return null;
    }

    items.push({
      severity: entry.severity as SubmissionAiIssueSeverity,
      finding,
      rationale,
    });
  }

  return items;
}

function readQuestions(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > SUBMISSION_AI_QUESTIONS_MAX_ITEMS
  ) {
    return null;
  }

  const questions: string[] = [];

  for (const entry of value) {
    const question = readText(entry, SUBMISSION_AI_QUESTION_MAX_LENGTH, false);

    if (question === null) {
      return null;
    }

    questions.push(question);
  }

  return questions;
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

function readText(
  value: unknown,
  maxLength: number,
  allowEmpty: boolean,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length > maxLength) {
    return null;
  }

  if (!allowEmpty && trimmed.length === 0) {
    return null;
  }

  return trimmed;
}
