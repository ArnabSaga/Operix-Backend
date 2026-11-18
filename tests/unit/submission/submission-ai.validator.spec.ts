import {
  SUBMISSION_AI_COVERAGE_MAX_ITEMS,
  SUBMISSION_AI_COVERAGE_EVIDENCE_MAX_LENGTH,
  SUBMISSION_AI_COVERAGE_REQUIREMENT_MAX_LENGTH,
  SUBMISSION_AI_ISSUES_MAX_ITEMS,
  SUBMISSION_AI_ISSUE_FINDING_MAX_LENGTH,
  SUBMISSION_AI_ISSUE_RATIONALE_MAX_LENGTH,
  SUBMISSION_AI_QUESTION_MAX_LENGTH,
  SUBMISSION_AI_QUESTIONS_MAX_ITEMS,
  SUBMISSION_AI_SUGGESTED_FEEDBACK_MAX_LENGTH,
  SUBMISSION_AI_SUMMARY_MAX_LENGTH,
} from '../../../src/modules/submission/submission-ai.constant';
import { parseSubmissionAiReview } from '../../../src/modules/submission/submission-ai.validator';

function buildReview(overrides: Record<string, unknown> = {}) {
  return {
    summary: 'The Member reports that the batch record review was completed.',
    requirementCoverage: [
      {
        requirement: 'Review the batch record.',
        status: 'COVERED',
        evidence: 'The submission states the record was reviewed.',
      },
    ],
    issues: [
      {
        severity: 'LOW',
        finding: 'No reviewer name is recorded.',
        rationale: 'Traceability would be weaker without it.',
      },
    ],
    questionsForReviewer: ['Was the second-page signature verified?'],
    suggestedDecision: 'MANUAL_REVIEW',
    suggestedFeedback: '',
    ...overrides,
  };
}

const stringOfLength = (length: number): string => 'a'.repeat(length);

describe('parseSubmissionAiReview', () => {
  it('accepts a well-formed review and trims every value', () => {
    const result = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          summary: '  Summary text.  ',
          suggestedFeedback: '  Please attach the signed page.  ',
          requirementCoverage: [
            {
              requirement: '  Requirement A  ',
              status: 'PARTIAL',
              evidence: '  Evidence A  ',
            },
          ],
        }),
      ),
    );

    expect(result).toEqual({
      ok: true,
      review: {
        summary: 'Summary text.',
        requirementCoverage: [
          {
            requirement: 'Requirement A',
            status: 'PARTIAL',
            evidence: 'Evidence A',
          },
        ],
        issues: [
          {
            severity: 'LOW',
            finding: 'No reviewer name is recorded.',
            rationale: 'Traceability would be weaker without it.',
          },
        ],
        questionsForReviewer: ['Was the second-page signature verified?'],
        suggestedDecision: 'MANUAL_REVIEW',
        suggestedFeedback: 'Please attach the signed page.',
      },
    });
  });

  it('accepts empty coverage, issues and questions', () => {
    const result = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          requirementCoverage: [],
          issues: [],
          questionsForReviewer: [],
        }),
      ),
    );

    expect(result.ok).toBe(true);
  });

  it('rejects malformed JSON', () => {
    expect(parseSubmissionAiReview('{not json')).toEqual({
      ok: false,
      reason: 'invalid_json',
    });
  });

  it.each([
    ['a JSON array', '[]'],
    ['a JSON string', '"review"'],
    ['null', 'null'],
  ])('rejects %s', (_name, raw) => {
    expect(parseSubmissionAiReview(raw)).toEqual({
      ok: false,
      reason: 'invalid_shape',
    });
  });

  it('rejects unknown root keys', () => {
    const result = parseSubmissionAiReview(
      JSON.stringify(buildReview({ suggestedPriority: 'HIGH' })),
    );

    expect(result).toEqual({ ok: false, reason: 'invalid_shape' });
  });

  it('rejects a missing root key', () => {
    const review = buildReview();
    delete (review as Record<string, unknown>).questionsForReviewer;

    expect(parseSubmissionAiReview(JSON.stringify(review))).toEqual({
      ok: false,
      reason: 'invalid_shape',
    });
  });

  it.each([
    ['an empty summary', { summary: '   ' }, 'invalid_summary'],
    [
      'an oversized summary',
      { summary: stringOfLength(SUBMISSION_AI_SUMMARY_MAX_LENGTH + 1) },
      'invalid_summary',
    ],
    ['a non-string summary', { summary: 42 }, 'invalid_summary'],
  ])('rejects %s', (_name, overrides, reason) => {
    expect(
      parseSubmissionAiReview(JSON.stringify(buildReview(overrides))),
    ).toEqual({ ok: false, reason });
  });

  it('accepts a summary exactly at the cap', () => {
    const result = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          summary: stringOfLength(SUBMISSION_AI_SUMMARY_MAX_LENGTH),
        }),
      ),
    );

    expect(result.ok).toBe(true);
  });

  it('rejects coverage above the item cap', () => {
    const items = Array.from(
      { length: SUBMISSION_AI_COVERAGE_MAX_ITEMS + 1 },
      (_value, index) => ({
        requirement: `Requirement ${index}`,
        status: 'COVERED',
        evidence: '',
      }),
    );

    expect(
      parseSubmissionAiReview(
        JSON.stringify(buildReview({ requirementCoverage: items })),
      ),
    ).toEqual({ ok: false, reason: 'invalid_coverage' });
  });

  it('rejects unknown coverage item keys', () => {
    expect(
      parseSubmissionAiReview(
        JSON.stringify(
          buildReview({
            requirementCoverage: [
              {
                requirement: 'Requirement A',
                status: 'COVERED',
                evidence: '',
                confidence: 0.9,
              },
            ],
          }),
        ),
      ),
    ).toEqual({ ok: false, reason: 'invalid_coverage' });
  });

  it('rejects an unknown coverage status', () => {
    expect(
      parseSubmissionAiReview(
        JSON.stringify(
          buildReview({
            requirementCoverage: [
              {
                requirement: 'Requirement A',
                status: 'DONE',
                evidence: '',
              },
            ],
          }),
        ),
      ),
    ).toEqual({ ok: false, reason: 'invalid_coverage' });
  });

  it('allows empty evidence but not empty requirements', () => {
    const withEmptyEvidence = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          requirementCoverage: [
            { requirement: 'Requirement A', status: 'MISSING', evidence: '' },
          ],
        }),
      ),
    );
    const withEmptyRequirement = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          requirementCoverage: [
            { requirement: '   ', status: 'MISSING', evidence: '' },
          ],
        }),
      ),
    );

    expect(withEmptyEvidence.ok).toBe(true);
    expect(withEmptyRequirement).toEqual({
      ok: false,
      reason: 'invalid_coverage',
    });
  });

  it('enforces coverage string caps', () => {
    const oversizedRequirement = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          requirementCoverage: [
            {
              requirement: stringOfLength(
                SUBMISSION_AI_COVERAGE_REQUIREMENT_MAX_LENGTH + 1,
              ),
              status: 'COVERED',
              evidence: '',
            },
          ],
        }),
      ),
    );
    const oversizedEvidence = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          requirementCoverage: [
            {
              requirement: 'Requirement A',
              status: 'COVERED',
              evidence: stringOfLength(
                SUBMISSION_AI_COVERAGE_EVIDENCE_MAX_LENGTH + 1,
              ),
            },
          ],
        }),
      ),
    );

    expect(oversizedRequirement).toEqual({
      ok: false,
      reason: 'invalid_coverage',
    });
    expect(oversizedEvidence).toEqual({
      ok: false,
      reason: 'invalid_coverage',
    });
  });

  it('rejects issues above the item cap', () => {
    const issues = Array.from(
      { length: SUBMISSION_AI_ISSUES_MAX_ITEMS + 1 },
      () => ({
        severity: 'LOW',
        finding: 'Finding.',
        rationale: 'Rationale.',
      }),
    );

    expect(
      parseSubmissionAiReview(JSON.stringify(buildReview({ issues }))),
    ).toEqual({ ok: false, reason: 'invalid_issues' });
  });

  it('rejects unknown issue keys and severities', () => {
    const unknownKey = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          issues: [
            {
              severity: 'LOW',
              finding: 'Finding.',
              rationale: 'Rationale.',
              category: 'documentation',
            },
          ],
        }),
      ),
    );
    const unknownSeverity = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          issues: [
            {
              severity: 'CRITICAL',
              finding: 'Finding.',
              rationale: 'Rationale.',
            },
          ],
        }),
      ),
    );

    expect(unknownKey).toEqual({ ok: false, reason: 'invalid_issues' });
    expect(unknownSeverity).toEqual({ ok: false, reason: 'invalid_issues' });
  });

  it('enforces issue string caps', () => {
    const oversizedFinding = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          issues: [
            {
              severity: 'HIGH',
              finding: stringOfLength(
                SUBMISSION_AI_ISSUE_FINDING_MAX_LENGTH + 1,
              ),
              rationale: 'Rationale.',
            },
          ],
        }),
      ),
    );
    const oversizedRationale = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          issues: [
            {
              severity: 'HIGH',
              finding: 'Finding.',
              rationale: stringOfLength(
                SUBMISSION_AI_ISSUE_RATIONALE_MAX_LENGTH + 1,
              ),
            },
          ],
        }),
      ),
    );

    expect(oversizedFinding).toEqual({
      ok: false,
      reason: 'invalid_issues',
    });
    expect(oversizedRationale).toEqual({
      ok: false,
      reason: 'invalid_issues',
    });
  });

  it('rejects questions above the item cap', () => {
    const questions = Array.from(
      { length: SUBMISSION_AI_QUESTIONS_MAX_ITEMS + 1 },
      () => 'Question?',
    );

    expect(
      parseSubmissionAiReview(
        JSON.stringify(buildReview({ questionsForReviewer: questions })),
      ),
    ).toEqual({ ok: false, reason: 'invalid_questions' });
  });

  it('rejects blank and oversized questions', () => {
    const blank = parseSubmissionAiReview(
      JSON.stringify(buildReview({ questionsForReviewer: ['   '] })),
    );
    const oversized = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          questionsForReviewer: [
            stringOfLength(SUBMISSION_AI_QUESTION_MAX_LENGTH + 1),
          ],
        }),
      ),
    );

    expect(blank).toEqual({ ok: false, reason: 'invalid_questions' });
    expect(oversized).toEqual({ ok: false, reason: 'invalid_questions' });
  });

  it('rejects unsupported decisions', () => {
    expect(
      parseSubmissionAiReview(
        JSON.stringify(buildReview({ suggestedDecision: 'REJECT' })),
      ),
    ).toEqual({ ok: false, reason: 'invalid_decision' });
  });

  it('requires feedback when revision is suggested', () => {
    const missing = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          suggestedDecision: 'REQUEST_REVISION',
          suggestedFeedback: '   ',
        }),
      ),
    );
    const present = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          suggestedDecision: 'REQUEST_REVISION',
          suggestedFeedback: 'Please attach the signed page.',
        }),
      ),
    );

    expect(missing).toEqual({ ok: false, reason: 'invalid_feedback' });
    expect(present.ok).toBe(true);
  });

  it('rejects oversized feedback', () => {
    expect(
      parseSubmissionAiReview(
        JSON.stringify(
          buildReview({
            suggestedFeedback: stringOfLength(
              SUBMISSION_AI_SUGGESTED_FEEDBACK_MAX_LENGTH + 1,
            ),
          }),
        ),
      ),
    ).toEqual({ ok: false, reason: 'invalid_feedback' });
  });

  it('accepts feedback exactly at the cap and ignores surrounding whitespace', () => {
    const result = parseSubmissionAiReview(
      JSON.stringify(
        buildReview({
          suggestedFeedback: `  ${stringOfLength(
            SUBMISSION_AI_SUGGESTED_FEEDBACK_MAX_LENGTH - 2,
          )}  `,
        }),
      ),
    );

    expect(result.ok).toBe(true);
  });
});
