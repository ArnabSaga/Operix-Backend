import {
  DASHBOARD_AI_EXECUTIVE_SUMMARY_MAX_LENGTH,
  DASHBOARD_AI_PRIORITIES_MAX_ITEMS,
} from '../../../src/modules/dashboard/dashboard-ai.constant';
import { parseDashboardAiBrief } from '../../../src/modules/dashboard/dashboard-ai.validator';

function validBrief() {
  return {
    headline: 'Review overdue work first',
    executiveSummary:
      'Operations are stable, with overdue work requiring attention.',
    priorities: [
      {
        severity: 'HIGH',
        category: 'OVERDUE',
        title: 'Overdue workload',
        evidence: 'Seven Tasks are overdue.',
        suggestedAction: 'Review the oldest overdue Tasks.',
      },
    ],
    workloadObservations: [
      {
        subjectType: 'TEAM',
        subject: 'Quality',
        observation: 'Quality has the highest overdue count in this snapshot.',
        evidence: 'Five overdue Tasks were supplied for Quality.',
      },
    ],
    trendSummary: 'Nine Tasks were completed in the selected window.',
    reportingSummary: null,
    nextActions: ['Review overdue Tasks.'],
    confidence: 'HIGH',
    limitations: [],
  };
}

describe('parseDashboardAiBrief', () => {
  it('accepts a complete strict response', () => {
    expect(parseDashboardAiBrief(JSON.stringify(validBrief()))).toMatchObject({
      ok: true,
      brief: { headline: 'Review overdue work first' },
    });
  });

  it.each([
    [
      'unknown category',
      (value: ReturnType<typeof validBrief>) => {
        value.priorities[0]!.category = 'OTHER';
      },
    ],
    [
      'unknown severity',
      (value: ReturnType<typeof validBrief>) => {
        value.priorities[0]!.severity = 'CRITICAL';
      },
    ],
    [
      'unknown nested key',
      (value: ReturnType<typeof validBrief>) => {
        Object.assign(value.priorities[0]!, { privateId: 'secret' });
      },
    ],
    [
      'missing suggested action',
      (value: ReturnType<typeof validBrief>) => {
        delete (
          value.priorities[0] as Partial<(typeof value.priorities)[number]>
        ).suggestedAction;
      },
    ],
    [
      'invalid confidence',
      (value: ReturnType<typeof validBrief>) => {
        value.confidence = 'CERTAIN';
      },
    ],
    [
      'unexpected root property',
      (value: ReturnType<typeof validBrief>) => {
        Object.assign(value, { extra: true });
      },
    ],
  ])('rejects %s', (_label, mutate) => {
    const value = validBrief();
    mutate(value);
    expect(parseDashboardAiBrief(JSON.stringify(value))).toMatchObject({
      ok: false,
    });
  });

  it('rejects too many priorities and observations', () => {
    const priorities = validBrief();
    priorities.priorities = Array.from(
      { length: DASHBOARD_AI_PRIORITIES_MAX_ITEMS + 1 },
      () => ({ ...validBrief().priorities[0]! }),
    );
    expect(parseDashboardAiBrief(JSON.stringify(priorities))).toMatchObject({
      ok: false,
      reason: 'invalid_priorities',
    });

    const observations = validBrief();
    observations.workloadObservations = Array.from({ length: 7 }, () => ({
      ...validBrief().workloadObservations[0]!,
    }));
    expect(parseDashboardAiBrief(JSON.stringify(observations))).toMatchObject({
      ok: false,
      reason: 'invalid_observations',
    });
  });

  it('rejects an oversized executive summary', () => {
    const value = validBrief();
    value.executiveSummary = 'x'.repeat(
      DASHBOARD_AI_EXECUTIVE_SUMMARY_MAX_LENGTH + 1,
    );
    expect(parseDashboardAiBrief(JSON.stringify(value))).toEqual({
      ok: false,
      reason: 'invalid_summary',
    });
  });
});
