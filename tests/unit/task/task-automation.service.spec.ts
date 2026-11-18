import { TaskAutomationService } from '../../../src/modules/task/task-automation.service';

const jestApi = import.meta.jest;

describe('TaskAutomationService', () => {
  it('processes a newly generated due distribution in the same automation run', async () => {
    let dueDistributionExists = false;
    const recurrenceService = {
      reconcileDueRecurrences: jestApi.fn().mockImplementation(() => {
        dueDistributionExists = true;
        return Promise.resolve({ eligible: 1, generated: 1, blocked: 0 });
      }),
    };
    const distributionService = {
      processDueDistributions: jestApi.fn().mockImplementation(() => {
        expect(dueDistributionExists).toBe(true);
        return Promise.resolve({ eligible: 1, sent: 1, recipients: 3 });
      }),
    };
    const bulkService = {
      reconcileDueRecurrences: jestApi
        .fn()
        .mockResolvedValue({ eligible: 0, generated: 0, blocked: 0 }),
    };
    const service = new TaskAutomationService(
      {} as never,
      recurrenceService as never,
      {} as never,
      distributionService as never,
      bulkService as never,
    );
    const reminderResult = { eligible: 0, sent: 0, cancelled: 0 };
    const processDueReminders = jestApi.fn().mockResolvedValue(reminderResult);
    service.processDueReminders = processDueReminders;

    const result = await service.run(new Date('2026-11-05T04:00:00.000Z'));

    expect(result).toEqual({
      reminders: reminderResult,
      recurrences: { eligible: 1, generated: 1, blocked: 0 },
      bulkRecurrences: { eligible: 0, generated: 0, blocked: 0 },
      distributions: { eligible: 1, sent: 1, recipients: 3 },
    });
    expect(processDueReminders.mock.invocationCallOrder[0]).toBeLessThan(
      recurrenceService.reconcileDueRecurrences.mock.invocationCallOrder[0]!,
    );
    expect(
      recurrenceService.reconcileDueRecurrences.mock.invocationCallOrder[0],
    ).toBeLessThan(
      bulkService.reconcileDueRecurrences.mock.invocationCallOrder[0]!,
    );
    expect(
      bulkService.reconcileDueRecurrences.mock.invocationCallOrder[0],
    ).toBeLessThan(
      distributionService.processDueDistributions.mock.invocationCallOrder[0]!,
    );
  });
});
