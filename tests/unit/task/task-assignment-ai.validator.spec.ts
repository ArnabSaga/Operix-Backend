import { parseTaskAssignmentAiDraft } from '../../../src/modules/task/task-assignment-ai.validator';

function valid(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    summary:
      'Candidate C01 has balanced current workload and relevant history.',
    decision: 'RECOMMEND',
    recommendations: [
      {
        candidateRef: 'C01',
        rationale: 'Low overdue workload and relevant completed work.',
        strengths: ['No overdue Tasks'],
        cautions: ['Availability is not modeled'],
      },
    ],
    confidence: 'MEDIUM',
    limitations: [],
    ...overrides,
  });
}

describe('parseTaskAssignmentAiDraft', () => {
  const refs = new Set(['C01', 'C02']);

  it('accepts a strict recommendation and manual selection fallback', () => {
    expect(parseTaskAssignmentAiDraft(valid(), refs)).toMatchObject({
      ok: true,
      draft: { decision: 'RECOMMEND' },
    });
    expect(
      parseTaskAssignmentAiDraft(
        valid({ decision: 'MANUAL_SELECTION', recommendations: [] }),
        refs,
      ),
    ).toMatchObject({ ok: true, draft: { recommendations: [] } });
  });

  it('rejects unknown and duplicate candidate references', () => {
    expect(
      parseTaskAssignmentAiDraft(
        valid({
          recommendations: [
            {
              candidateRef: 'C99',
              rationale: 'Unknown.',
              strengths: [],
              cautions: [],
            },
          ],
        }),
        refs,
      ),
    ).toEqual({ ok: false, reason: 'invalid_candidate_ref' });
    const duplicate = {
      candidateRef: 'C01',
      rationale: 'Same.',
      strengths: [],
      cautions: [],
    };
    expect(
      parseTaskAssignmentAiDraft(
        valid({ recommendations: [duplicate, duplicate] }),
        refs,
      ),
    ).toEqual({ ok: false, reason: 'invalid_candidate_ref' });
  });

  it('rejects unknown keys and recommendation overflow', () => {
    expect(parseTaskAssignmentAiDraft(valid({ extra: true }), refs)).toEqual({
      ok: false,
      reason: 'invalid_shape',
    });
    expect(
      parseTaskAssignmentAiDraft(
        valid({
          recommendations: Array.from({ length: 4 }, (_, index) => ({
            candidateRef: index % 2 === 0 ? 'C01' : 'C02',
            rationale: 'Candidate.',
            strengths: [],
            cautions: [],
          })),
        }),
        refs,
      ),
    ).toEqual({ ok: false, reason: 'invalid_recommendations' });
  });
});
