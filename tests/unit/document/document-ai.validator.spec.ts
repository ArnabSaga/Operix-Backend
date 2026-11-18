import {
  DOCUMENT_AI_ACTION_DUE_DATE_MAX_LENGTH,
  DOCUMENT_AI_ACTION_ITEMS_MAX_ITEMS,
  DOCUMENT_AI_ACTION_MAX_LENGTH,
  DOCUMENT_AI_ACTION_OWNER_MAX_LENGTH,
  DOCUMENT_AI_IMPORTANT_DATES_MAX_ITEMS,
  DOCUMENT_AI_IMPORTANT_DATE_CONTEXT_MAX_LENGTH,
  DOCUMENT_AI_IMPORTANT_DATE_TEXT_MAX_LENGTH,
  DOCUMENT_AI_KEY_POINTS_MAX_ITEMS,
  DOCUMENT_AI_KEY_POINT_MAX_LENGTH,
  DOCUMENT_AI_RISKS_MAX_ITEMS,
  DOCUMENT_AI_RISK_MAX_LENGTH,
  DOCUMENT_AI_SUMMARY_MAX_LENGTH,
} from '../../../src/modules/document/document-ai.constant';
import type {
  DocumentAiAnalysis,
  DocumentAiValidationFailureReason,
} from '../../../src/modules/document/document-ai.interface';
import { parseDocumentAiAnalysis } from '../../../src/modules/document/document-ai.validator';

function validAnalysis(): Record<string, unknown> {
  return {
    summary: 'The batch record review is due on 2026-08-25.',
    keyPoints: ['The batch record was reviewed.'],
    actionItems: [
      {
        action: 'Review the batch record.',
        ownerMentioned: 'QA Lead',
        dueDateMentioned: '2026-08-25',
      },
    ],
    importantDates: [
      {
        dateText: '2026-08-25',
        context: 'Batch record review due date.',
      },
    ],
    risksOrWarnings: ['The second page is unsigned.'],
    confidence: 'MEDIUM',
  };
}

function expectValid(value: unknown): DocumentAiAnalysis {
  const result = parseDocumentAiAnalysis(JSON.stringify(value));

  if (!result.ok) {
    throw new Error(`Expected a valid analysis, received ${result.reason}.`);
  }

  return result.analysis;
}

function expectReason(
  value: unknown,
  reason: DocumentAiValidationFailureReason,
): void {
  expect(parseDocumentAiAnalysis(JSON.stringify(value))).toEqual({
    ok: false,
    reason,
  });
}

function expectRawReason(
  raw: string,
  reason: DocumentAiValidationFailureReason,
): void {
  expect(parseDocumentAiAnalysis(raw)).toEqual({ ok: false, reason });
}

describe('parseDocumentAiAnalysis', () => {
  it('accepts a complete analysis', () => {
    expect(expectValid(validAnalysis())).toEqual(validAnalysis());
  });

  it('accepts empty advisory collections', () => {
    const analysis = validAnalysis();
    analysis.keyPoints = [];
    analysis.actionItems = [];
    analysis.importantDates = [];
    analysis.risksOrWarnings = [];

    expect(expectValid(analysis)).toEqual(analysis);
  });

  it('trims text fields and maps blank mentions to null', () => {
    const analysis = validAnalysis();
    analysis.summary = '  Reviewed record.  ';
    analysis.keyPoints = ['  First point.  '];
    analysis.actionItems = [
      {
        action: '  Sign the record.  ',
        ownerMentioned: '  QA Lead  ',
        dueDateMentioned: '   ',
      },
    ];
    analysis.importantDates = [
      {
        dateText: '  2026-08-25  ',
        context: '  Review date.  ',
      },
    ];
    analysis.risksOrWarnings = ['  Unsigned page.  '];

    expect(expectValid(analysis)).toEqual({
      summary: 'Reviewed record.',
      keyPoints: ['First point.'],
      actionItems: [
        {
          action: 'Sign the record.',
          ownerMentioned: 'QA Lead',
          dueDateMentioned: null,
        },
      ],
      importantDates: [
        {
          dateText: '2026-08-25',
          context: 'Review date.',
        },
      ],
      risksOrWarnings: ['Unsigned page.'],
      confidence: 'MEDIUM',
    });
  });

  it('maps empty-string mentions to null', () => {
    const analysis = validAnalysis();
    analysis.actionItems = [
      {
        action: 'Sign the record.',
        ownerMentioned: '',
        dueDateMentioned: '',
      },
    ];

    const result = expectValid(analysis);

    expect(result.actionItems).toEqual([
      {
        action: 'Sign the record.',
        ownerMentioned: null,
        dueDateMentioned: null,
      },
    ]);
  });

  it('rejects malformed JSON', () => {
    expectRawReason('not json', 'invalid_json');
  });

  it('rejects non-object roots', () => {
    expectRawReason('[]', 'invalid_shape');
    expectRawReason('null', 'invalid_shape');
    expectRawReason('"text"', 'invalid_shape');
  });

  it('rejects a missing root key', () => {
    const analysis = validAnalysis();
    delete analysis.confidence;

    expectReason(analysis, 'invalid_shape');
  });

  it('rejects an unknown root key', () => {
    const analysis = validAnalysis();
    analysis.extra = true;

    expectReason(analysis, 'invalid_shape');
  });

  it('rejects an empty or over-long summary', () => {
    expectReason({ ...validAnalysis(), summary: '   ' }, 'invalid_summary');
    expectReason(
      {
        ...validAnalysis(),
        summary: 'a'.repeat(DOCUMENT_AI_SUMMARY_MAX_LENGTH + 1),
      },
      'invalid_summary',
    );
    expectReason({ ...validAnalysis(), summary: 42 }, 'invalid_summary');
  });

  it('rejects key points outside the count and length caps', () => {
    expectReason(
      {
        ...validAnalysis(),
        keyPoints: Array.from(
          { length: DOCUMENT_AI_KEY_POINTS_MAX_ITEMS + 1 },
          () => 'point',
        ),
      },
      'invalid_key_points',
    );
    expectReason(
      { ...validAnalysis(), keyPoints: ['  '] },
      'invalid_key_points',
    );
    expectReason(
      {
        ...validAnalysis(),
        keyPoints: ['a'.repeat(DOCUMENT_AI_KEY_POINT_MAX_LENGTH + 1)],
      },
      'invalid_key_points',
    );
  });

  it('rejects action items outside the count cap', () => {
    expectReason(
      {
        ...validAnalysis(),
        actionItems: Array.from(
          { length: DOCUMENT_AI_ACTION_ITEMS_MAX_ITEMS + 1 },
          () => ({
            action: 'Act.',
            ownerMentioned: '',
            dueDateMentioned: '',
          }),
        ),
      },
      'invalid_action_items',
    );
  });

  it('rejects action items with unknown or missing keys', () => {
    expectReason(
      {
        ...validAnalysis(),
        actionItems: [
          {
            action: 'Act.',
            ownerMentioned: '',
            dueDateMentioned: '',
            extra: true,
          },
        ],
      },
      'invalid_action_items',
    );
    expectReason(
      {
        ...validAnalysis(),
        actionItems: [{ action: 'Act.', ownerMentioned: '' }],
      },
      'invalid_action_items',
    );
  });

  it('rejects an empty action or invalid mentions', () => {
    expectReason(
      {
        ...validAnalysis(),
        actionItems: [
          { action: '   ', ownerMentioned: '', dueDateMentioned: '' },
        ],
      },
      'invalid_action_items',
    );
    expectReason(
      {
        ...validAnalysis(),
        actionItems: [
          { action: 'Act.', ownerMentioned: null, dueDateMentioned: '' },
        ],
      },
      'invalid_action_items',
    );
    expectReason(
      {
        ...validAnalysis(),
        actionItems: [
          {
            action: 'Act.',
            ownerMentioned: 'a'.repeat(DOCUMENT_AI_ACTION_OWNER_MAX_LENGTH + 1),
            dueDateMentioned: '',
          },
        ],
      },
      'invalid_action_items',
    );
    expectReason(
      {
        ...validAnalysis(),
        actionItems: [
          {
            action: 'a'.repeat(DOCUMENT_AI_ACTION_MAX_LENGTH + 1),
            ownerMentioned: '',
            dueDateMentioned: '',
          },
        ],
      },
      'invalid_action_items',
    );
    expectReason(
      {
        ...validAnalysis(),
        actionItems: [
          {
            action: 'Act.',
            ownerMentioned: '',
            dueDateMentioned: 'a'.repeat(
              DOCUMENT_AI_ACTION_DUE_DATE_MAX_LENGTH + 1,
            ),
          },
        ],
      },
      'invalid_action_items',
    );
  });

  it('rejects important dates outside the count cap and contract', () => {
    expectReason(
      {
        ...validAnalysis(),
        importantDates: Array.from(
          { length: DOCUMENT_AI_IMPORTANT_DATES_MAX_ITEMS + 1 },
          () => ({ dateText: '2026-08-25', context: 'Review date.' }),
        ),
      },
      'invalid_important_dates',
    );
    expectReason(
      {
        ...validAnalysis(),
        importantDates: [
          { dateText: '2026-08-25', context: 'Review date.', extra: true },
        ],
      },
      'invalid_important_dates',
    );
    expectReason(
      {
        ...validAnalysis(),
        importantDates: [{ dateText: '  ', context: 'x' }],
      },
      'invalid_important_dates',
    );
    expectReason(
      {
        ...validAnalysis(),
        importantDates: [
          {
            dateText: 'a'.repeat(
              DOCUMENT_AI_IMPORTANT_DATE_TEXT_MAX_LENGTH + 1,
            ),
            context: 'Review date.',
          },
        ],
      },
      'invalid_important_dates',
    );
    expectReason(
      {
        ...validAnalysis(),
        importantDates: [
          {
            dateText: '2026-08-25',
            context: 'a'.repeat(
              DOCUMENT_AI_IMPORTANT_DATE_CONTEXT_MAX_LENGTH + 1,
            ),
          },
        ],
      },
      'invalid_important_dates',
    );
  });

  it('rejects risks outside the count and length caps', () => {
    expectReason(
      {
        ...validAnalysis(),
        risksOrWarnings: Array.from(
          { length: DOCUMENT_AI_RISKS_MAX_ITEMS + 1 },
          () => 'risk',
        ),
      },
      'invalid_risks',
    );
    expectReason(
      { ...validAnalysis(), risksOrWarnings: [' '] },
      'invalid_risks',
    );
    expectReason(
      {
        ...validAnalysis(),
        risksOrWarnings: ['a'.repeat(DOCUMENT_AI_RISK_MAX_LENGTH + 1)],
      },
      'invalid_risks',
    );
  });

  it('rejects an unknown or non-string confidence', () => {
    expectReason(
      { ...validAnalysis(), confidence: 'CERTAIN' },
      'invalid_confidence',
    );
    expectReason(
      { ...validAnalysis(), confidence: 'high' },
      'invalid_confidence',
    );
    expectReason({ ...validAnalysis(), confidence: 3 }, 'invalid_confidence');
  });

  it('returns only the declared analysis keys', () => {
    const result = expectValid(validAnalysis());

    expect(Object.keys(result).sort()).toEqual(
      [
        'actionItems',
        'confidence',
        'importantDates',
        'keyPoints',
        'risksOrWarnings',
        'summary',
      ].sort(),
    );
  });
});
