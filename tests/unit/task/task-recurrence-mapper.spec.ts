import type { ConfigService } from '@nestjs/config';
import {
  TaskCompletionMode,
  TaskPriority,
  TaskRecurrenceFrequency,
  TaskScope,
  TaskStatus,
  UserRole,
} from '../../../generated/prisma/enums';
import type { ApplicationConfiguration } from '../../../src/config/configuration';
import { PrismaService } from '../../../src/database/prisma.service';
import { TaskRecurrenceService } from '../../../src/modules/task/task-recurrence.service';
import {
  mapTaskRecurrenceSummary,
  mapTaskResponse,
  type TaskResponseSource,
} from '../../../src/modules/task/task.mapper';

const jestApi = import.meta.jest;
const nextOccurrenceAt = new Date('2026-11-05T03:00:00.000Z');

function createSummarySource(distributionLeadMinutes: number | null) {
  return {
    publicId: '44444444-4444-4444-8444-444444444444',
    frequency: TaskRecurrenceFrequency.MONTHLY,
    nextOccurrenceAt,
    reminderLeadMinutes: 1_440,
    distributionLeadMinutes,
    isActive: true,
  };
}

function createTaskSource(
  distributionLeadMinutes: number | null,
): TaskResponseSource {
  return {
    id: 'task-db',
    publicId: '11111111-1111-4111-8111-111111111111',
    referenceCode: 'TASK-20261005-ABC123',
    title: 'Submit Bank Balance',
    description: null,
    remarks: null,
    priority: TaskPriority.MEDIUM,
    status: TaskStatus.ASSIGNED,
    scope: TaskScope.GLOBAL,
    dueAt: new Date('2026-10-05T03:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    completionMode: TaskCompletionMode.DIRECT,
    completionNote: null,
    allowSelfClaim: false,
    scheduledStartAt: null,
    occurrenceKey: '2026-10-05',
    team: null,
    category: null,
    createdBy: {
      publicId: '22222222-2222-4222-8222-222222222222',
      name: 'Owner',
      role: UserRole.SUPER_ADMIN,
      employeeId: null,
      designation: null,
    },
    assignments: [
      {
        responsibleUser: {
          publicId: '33333333-3333-4333-8333-333333333333',
          name: 'Responsible',
          role: UserRole.ADMIN,
          employeeId: null,
          designation: null,
        },
      },
    ],
    recurrence: createSummarySource(distributionLeadMinutes),
    reminder: null,
    distribution: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };
}

function createRecurrenceRecord(distributionLeadMinutes: number | null) {
  return {
    ...createSummarySource(distributionLeadMinutes),
    id: 'recurrence-db',
    scope: TaskScope.GLOBAL,
    title: 'Submit Bank Balance',
    description: null,
    remarks: null,
    priority: TaskPriority.MEDIUM,
    anchorDueAt: new Date('2026-10-05T03:00:00.000Z'),
    anchorLocalDay: 5,
    anchorLocalWeekday: null,
    anchorLocalTime: '09:00:00',
    broadcastAll: distributionLeadMinutes !== null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    createdBy: {
      publicId: '22222222-2222-4222-8222-222222222222',
      name: 'Owner',
      role: UserRole.SUPER_ADMIN,
      employeeId: null,
      designation: null,
    },
    defaultResponsibleUser: {
      publicId: '33333333-3333-4333-8333-333333333333',
      name: 'Responsible',
      role: UserRole.ADMIN,
      employeeId: null,
      designation: null,
    },
    team: null,
    category: null,
  };
}

function createService(recurrence: ReturnType<typeof createRecurrenceRecord>) {
  const prisma = {
    taskRecurrence: {
      findUnique: jestApi.fn().mockResolvedValue(recurrence),
    },
  } as unknown as PrismaService;
  const config = {
    get: jestApi.fn().mockReturnValue('Asia/Dhaka'),
  } as unknown as ConfigService<ApplicationConfiguration, true>;

  return new TaskRecurrenceService(prisma, {} as never, config);
}

describe('Task recurrence summary mapping', () => {
  it.each([
    ['TEAM or broadcast-disabled recurrence', null],
    ['broadcast exactly at due time', 0],
    ['advance broadcast', 720],
  ] as const)('preserves %s lead semantics', (_label, lead) => {
    expect(mapTaskRecurrenceSummary(createSummarySource(lead))).toEqual({
      id: '44444444-4444-4444-8444-444444444444',
      frequency: TaskRecurrenceFrequency.MONTHLY,
      nextOccurrenceAt,
      reminderLeadMinutes: 1_440,
      distributionLeadMinutes: lead,
      isActive: true,
    });
  });

  it.each([null, 0, 720] as const)(
    'keeps embedded and dedicated recurrence fields consistent for lead %s',
    async (lead) => {
      const recurrence = createRecurrenceRecord(lead);
      const task = mapTaskResponse(createTaskSource(lead), new Date());
      const dedicated = await createService(recurrence).getRecurrence(
        {} as never,
        recurrence.publicId,
      );

      expect(task.recurrence).toEqual({
        id: dedicated.id,
        frequency: dedicated.frequency,
        nextOccurrenceAt: dedicated.nextOccurrenceAt,
        reminderLeadMinutes: dedicated.reminderLeadMinutes,
        distributionLeadMinutes: dedicated.distributionLeadMinutes,
        isActive: dedicated.isActive,
      });
    },
  );
});
