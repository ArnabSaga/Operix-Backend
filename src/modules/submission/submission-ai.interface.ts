/**
 * Advisory outcome of `POST /submissions/:submissionId/ai-review`.
 *
 * Nothing here is an instruction to the workflow. The reviewer decides, and the
 * existing `POST /submissions/:submissionId/reviews` endpoint remains the only
 * way a Submission can be approved or sent back for revision.
 */
export type SubmissionAiSuggestedDecision =
  'APPROVE' | 'REQUEST_REVISION' | 'MANUAL_REVIEW';

export type SubmissionAiCoverageStatus = 'COVERED' | 'PARTIAL' | 'MISSING';

export type SubmissionAiIssueSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface SubmissionAiCoverageItem {
  requirement: string;
  status: SubmissionAiCoverageStatus;
  evidence: string;
}

export interface SubmissionAiIssue {
  severity: SubmissionAiIssueSeverity;
  finding: string;
  rationale: string;
}

export interface SubmissionAiReview {
  summary: string;
  requirementCoverage: SubmissionAiCoverageItem[];
  issues: SubmissionAiIssue[];
  questionsForReviewer: string[];
  suggestedDecision: SubmissionAiSuggestedDecision;
  /** Empty unless the model has draft feedback for the Member. */
  suggestedFeedback: string;
}

export interface SubmissionAiReviewMeta {
  provider: string;
  model: string;
  /** Provider calls actually made: 1 on success, 2 after one retry. */
  attempts: number;
  /** Total time spent across all attempts. */
  latencyMs: number;
}

export interface SubmissionAiReviewResponse extends SubmissionAiReview {
  /**
   * Deterministic, server-owned caveats. They are never taken from the model
   * because they describe what the server did or did not send.
   */
  limitations: string[];
  meta: SubmissionAiReviewMeta;
}

export interface SubmissionAiPreviousRevision {
  submissionVersion: number;
  feedback: string;
}

export type SubmissionAiAttachmentContentStatus =
  'EXTRACTED' | 'UNSUPPORTED' | 'EMPTY' | 'FAILED' | 'SKIPPED_LIMIT';

export interface SubmissionAiAttachmentEvidence {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  contentStatus: SubmissionAiAttachmentContentStatus;
  extractedText: string | null;
}

export interface SubmissionAiPromptInput {
  businessDate: string;
  businessTimezone: string;
  taskTitle: string;
  taskDescription: string | null;
  taskRemarks: string | null;
  taskPriority: string;
  taskStatus: string;
  taskDueAt: Date | null;
  submissionVersion: number;
  submittedAt: Date;
  submissionText: string | null;
  attachments: SubmissionAiAttachmentEvidence[];
  attachmentsTruncated: boolean;
  previousRevision: SubmissionAiPreviousRevision | null;
}

export interface SubmissionAiPromptResult {
  userPrompt: string;
  /**
   * Caveats discovered while building the prompt (truncation, attachment
   * handling). The service merges them with its fixed advisories.
   */
  limitations: string[];
}

export type SubmissionAiValidationFailureReason =
  | 'invalid_json'
  | 'invalid_shape'
  | 'invalid_summary'
  | 'invalid_coverage'
  | 'invalid_issues'
  | 'invalid_questions'
  | 'invalid_decision'
  | 'invalid_feedback';

export type SubmissionAiValidationResult =
  | { ok: true; review: SubmissionAiReview }
  | { ok: false; reason: SubmissionAiValidationFailureReason };
