import { parseAskOperixAnswer } from '../../../src/modules/assistant/assistant-answer.validator';

const answer = {
  answer: 'Two matching Tasks are available.',
  highlights: ['Two Tasks matched.'],
  referencedTaskRefs: ['T01'],
  confidence: 'HIGH',
  limitations: [],
};

describe('parseAskOperixAnswer', () => {
  it('accepts only supplied ephemeral Task references', () => {
    expect(
      parseAskOperixAnswer(JSON.stringify(answer), new Set(['T01'])).ok,
    ).toBe(true);
    expect(
      parseAskOperixAnswer(
        JSON.stringify({ ...answer, referencedTaskRefs: ['T99'] }),
        new Set(['T01']),
      ).ok,
    ).toBe(false);
  });

  it('rejects unexpected fields', () => {
    expect(
      parseAskOperixAnswer(
        JSON.stringify({ ...answer, taskId: 'private-id' }),
        new Set(['T01']),
      ).ok,
    ).toBe(false);
  });
});
