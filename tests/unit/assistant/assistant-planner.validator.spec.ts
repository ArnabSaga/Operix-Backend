import { parseAskOperixPlan } from '../../../src/modules/assistant/assistant-planner.validator';

const taskPlan = {
  intent: 'TASK_QUERY',
  taskQuery: {
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    overdue: true,
    scope: null,
    recurrenceFrequency: null,
    text: null,
    sort: 'DUE_AT_ASC',
    limit: 10,
  },
  responseMode: 'LIST',
};

describe('parseAskOperixPlan', () => {
  it('accepts each allowlisted intent', () => {
    expect(parseAskOperixPlan(JSON.stringify(taskPlan)).ok).toBe(true);
    expect(
      parseAskOperixPlan(
        JSON.stringify({ intent: 'OPERATIONS_SNAPSHOT', days: 30 }),
      ).ok,
    ).toBe(true);
    expect(
      parseAskOperixPlan(
        JSON.stringify({
          intent: 'NEEDS_CLARIFICATION',
          clarification: 'Which Task state?',
        }),
      ).ok,
    ).toBe(true);
    expect(
      parseAskOperixPlan(
        JSON.stringify({
          intent: 'UNSUPPORTED',
          reason: 'Named Member search is unavailable.',
        }),
      ).ok,
    ).toBe(true);
  });

  it.each([
    { ...taskPlan, intent: 'DATABASE_QUERY' },
    { ...taskPlan, teamId: 'team-id' },
    { ...taskPlan, taskQuery: { ...taskPlan.taskQuery, ownerId: 'user-id' } },
    { ...taskPlan, taskQuery: { ...taskPlan.taskQuery, status: 'UNKNOWN' } },
    { ...taskPlan, taskQuery: { ...taskPlan.taskQuery, limit: 11 } },
  ])('rejects expanded or invalid plans', (value) => {
    expect(parseAskOperixPlan(JSON.stringify(value)).ok).toBe(false);
  });
});
