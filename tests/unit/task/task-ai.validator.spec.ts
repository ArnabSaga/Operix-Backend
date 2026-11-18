import {
  TaskCompletionMode,
  TaskPriority,
} from '../../../generated/prisma/enums';
import {
  TASK_AI_DESCRIPTION_MAX_LENGTH,
  TASK_AI_REASONING_MAX_LENGTH,
  TASK_AI_TITLE_MAX_LENGTH,
} from '../../../src/modules/task/task-ai.constant';
import { parseTaskAiDraft } from '../../../src/modules/task/task-ai.validator';

const now = new Date('2026-10-22T00:00:00.000Z');

function validDraft(): Record<string, unknown> {
  return {
    title: 'Verify cold chain temperature logs',
    description:
      'Review the cold chain temperature logs for the past week.\n- Collect logger exports\n- Flag excursions above the allowed range',
    suggestedPriority: 'HIGH',
    suggestedCompletionMode: 'REVIEW_REQUIRED',
    suggestedDueAt: '2026-10-25T09:00:00.000Z',
    reasoning:
      'Temperature excursions are compliance relevant, so a second reviewer must confirm the corrective action.',
  };
}

function parse(value: unknown) {
  return parseTaskAiDraft(JSON.stringify(value), now);
}

describe('parseTaskAiDraft', () => {
  it('accepts a complete draft and normalizes surrounding whitespace', () => {
    const result = parse({
      ...validDraft(),
      title: '  Verify cold chain temperature logs  ',
      suggestedPriority: ' HIGH ',
    });

    expect(result).toEqual({
      ok: true,
      draft: {
        title: 'Verify cold chain temperature logs',
        description: validDraft().description,
        suggestedPriority: TaskPriority.HIGH,
        suggestedCompletionMode: TaskCompletionMode.REVIEW_REQUIRED,
        suggestedDueAt: '2026-10-25T09:00:00.000Z',
        reasoning: validDraft().reasoning,
      },
    });
  });

  it('accepts a null due date when no timing signal was inferred', () => {
    const result = parse({ ...validDraft(), suggestedDueAt: null });

    expect(result.ok).toBe(true);
    expect(result.ok && result.draft.suggestedDueAt).toBeNull();
  });

  it('drops a past due date instead of failing the whole draft', () => {
    const result = parse({
      ...validDraft(),
      suggestedDueAt: '2026-10-01T09:00:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.draft.suggestedDueAt).toBeNull();
  });

  it('tolerates a surrounding markdown code fence', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(validDraft())}\n\`\`\``;

    expect(parseTaskAiDraft(fenced, now).ok).toBe(true);
  });

  it('normalizes an offset timestamp to UTC ISO 8601', () => {
    const result = parse({
      ...validDraft(),
      suggestedDueAt: '2026-10-25T15:00:00.000+06:00',
    });

    expect(result.ok && result.draft.suggestedDueAt).toBe(
      '2026-10-25T09:00:00.000Z',
    );
  });

  it('rejects unparseable JSON', () => {
    expect(parseTaskAiDraft('not json at all', now)).toEqual({
      ok: false,
      reason: 'invalid_json',
    });
  });

  it('rejects non-object payloads', () => {
    expect(parseTaskAiDraft('["a"]', now)).toEqual({
      ok: false,
      reason: 'invalid_shape',
    });
    expect(parseTaskAiDraft('null', now)).toEqual({
      ok: false,
      reason: 'invalid_shape',
    });
  });

  it('rejects an empty, missing, non-string, or oversized title', () => {
    expect(parse({ ...validDraft(), title: '   ' })).toEqual({
      ok: false,
      reason: 'invalid_title',
    });
    expect(parse({ ...validDraft(), title: undefined })).toEqual({
      ok: false,
      reason: 'invalid_title',
    });
    expect(parse({ ...validDraft(), title: 42 })).toEqual({
      ok: false,
      reason: 'invalid_title',
    });
    expect(
      parse({
        ...validDraft(),
        title: 'a'.repeat(TASK_AI_TITLE_MAX_LENGTH + 1),
      }),
    ).toEqual({ ok: false, reason: 'invalid_title' });
  });

  it('rejects an empty or oversized description', () => {
    expect(parse({ ...validDraft(), description: '' })).toEqual({
      ok: false,
      reason: 'invalid_description',
    });
    expect(
      parse({
        ...validDraft(),
        description: 'a'.repeat(TASK_AI_DESCRIPTION_MAX_LENGTH + 1),
      }),
    ).toEqual({ ok: false, reason: 'invalid_description' });
  });

  it('rejects unknown priorities and completion modes', () => {
    expect(parse({ ...validDraft(), suggestedPriority: 'CRITICAL' })).toEqual({
      ok: false,
      reason: 'invalid_priority',
    });
    expect(
      parse({ ...validDraft(), suggestedCompletionMode: 'AUTO_APPROVE' }),
    ).toEqual({ ok: false, reason: 'invalid_completion_mode' });
  });

  it('rejects an unparseable due date', () => {
    expect(parse({ ...validDraft(), suggestedDueAt: 'next tuesday' })).toEqual({
      ok: false,
      reason: 'invalid_due_at',
    });
    expect(parse({ ...validDraft(), suggestedDueAt: 123 })).toEqual({
      ok: false,
      reason: 'invalid_due_at',
    });
  });

  it('rejects an empty or oversized reasoning field', () => {
    expect(parse({ ...validDraft(), reasoning: '   ' })).toEqual({
      ok: false,
      reason: 'invalid_reasoning',
    });
    expect(
      parse({
        ...validDraft(),
        reasoning: 'a'.repeat(TASK_AI_REASONING_MAX_LENGTH + 1),
      }),
    ).toEqual({ ok: false, reason: 'invalid_reasoning' });
  });

  it('ignores unknown properties instead of trusting them', () => {
    const result = parse({
      ...validDraft(),
      taskId: 'tsk_123',
      assigneeId: 'usr_123',
      shouldAssign: true,
    });

    expect(result.ok).toBe(true);
    expect(result.ok && Object.keys(result.draft)).toEqual([
      'title',
      'description',
      'suggestedPriority',
      'suggestedCompletionMode',
      'suggestedDueAt',
      'reasoning',
    ]);
  });
});
