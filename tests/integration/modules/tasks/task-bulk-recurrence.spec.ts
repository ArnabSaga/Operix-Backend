import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from '../../../../generated/prisma/client';
import {
  TaskBatchScope,
  TaskCompletionMode,
  TaskRecurrenceFrequency,
  TaskScope,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../../generated/prisma/enums';
import type { PrismaService } from '../../../../src/database/prisma.service';
import { TaskBulkService } from '../../../../src/modules/task/task-bulk.service';
import type { OperixViewer } from '../../../../src/shared/auth/viewer.interface';
import type { MailService } from '../../../../src/shared/mail/mail.service';
import { getTestDatabaseUrl } from '../../../support/database/test-database-url';

interface Fixture {
  adminId: string;
  memberOneId: string;
  memberTwoId: string;
  superAdminId: string;
  teamId: string;
  teamPublicId: string;
}

describe('recurring Team bulk tasks', () => {
  let pool: Pool | undefined;
  let prisma: PrismaClient | undefined;
  let fixture: Fixture | undefined;
  let service: TaskBulkService | undefined;

  beforeAll(async () => {
    const testPool = new Pool({ connectionString: getTestDatabaseUrl() });
    pool = testPool;
    prisma = new PrismaClient({ adapter: new PrismaPg(testPool) });
    await cleanupBulkRecurrenceFixtures(prisma);
  }, 60_000);

  beforeEach(async () => {
    const client = requirePrisma(prisma);
    fixture = await createFixture(client);
    service = new TaskBulkService(
      client as unknown as PrismaService,
      {
        sendTaskAssignedEmail: () => Promise.resolve(),
      } as unknown as MailService,
      { get: () => 'Asia/Dhaka' } as never,
    );
  }, 60_000);

  afterEach(async () => {
    if (!prisma) return;
    await cleanupBulkRecurrenceFixtures(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  }, 60_000);

  it('creates one independent Task for each active Team recipient', async () => {
    const client = requirePrisma(prisma);
    const testFixture = requireFixture(fixture);
    const bulkService = requireService(service);
    const result = await bulkService.createBulkTask(
      superAdminViewer(testFixture),
      {
        title: 'One time Team compliance check',
        dueAt: new Date(Date.now() + 86_400_000),
        scope: TaskBatchScope.TEAM,
        teamId: testFixture.teamPublicId,
      },
    );

    expect(result.recipients).toEqual({ total: 2, admins: 1, members: 1 });
    const batch = await client.taskBatch.findUniqueOrThrow({
      where: { publicId: result.batchId },
      select: { id: true, recurrenceId: true },
    });
    expect(batch.recurrenceId).toBeNull();
    await expectBatchTasks(
      client,
      batch.id,
      reviewerMap(testFixture, false),
      false,
    );
  }, 60_000);

  it('creates Global Tasks for active recipients and excludes inactive users', async () => {
    const client = requirePrisma(prisma);
    const testFixture = requireFixture(fixture);
    const bulkService = requireService(service);
    const result = await bulkService.createBulkTask(
      superAdminViewer(testFixture),
      {
        title: 'One time Global compliance check',
        dueAt: new Date(Date.now() + 86_400_000),
        scope: TaskBatchScope.GLOBAL,
      },
    );

    expect(result.recipients).toEqual({ total: 2, admins: 1, members: 1 });
    const batch = await client.taskBatch.findUniqueOrThrow({
      where: { publicId: result.batchId },
      select: { id: true },
    });
    await expectBatchTasks(
      client,
      batch.id,
      reviewerMap(testFixture, false),
      false,
    );
  }, 60_000);

  it('reevaluates current Team recipients and materializes an occurrence once', async () => {
    const client = requirePrisma(prisma);
    const testFixture = requireFixture(fixture);
    const bulkService = requireService(service);
    const firstDueAt = new Date(Date.now() + 86_400_000);

    await bulkService.createBulkTask(superAdminViewer(testFixture), {
      title: 'Recurring Team compliance check',
      dueAt: firstDueAt,
      scope: TaskBatchScope.TEAM,
      teamId: testFixture.teamPublicId,
      recurrence: {
        frequency: TaskRecurrenceFrequency.WEEKLY,
        reminderLeadMinutes: 60,
      },
    });

    const recurrence = await client.taskBatchRecurrence.findFirstOrThrow({
      where: { createdById: testFixture.superAdminId },
      select: { id: true },
    });
    const initialBatch = await client.taskBatch.findFirstOrThrow({
      where: { recurrenceId: recurrence.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    await expectBatchTasks(
      client,
      initialBatch.id,
      reviewerMap(testFixture, false),
      true,
    );

    await client.user.update({
      where: { id: testFixture.memberTwoId },
      data: { status: UserStatus.ACTIVE },
    });
    await client.teamMember.create({
      data: {
        teamId: testFixture.teamId,
        memberId: testFixture.memberTwoId,
      },
    });
    const dueAt = new Date(Date.now() - 1_000);
    await client.taskBatchRecurrence.update({
      where: { id: recurrence.id },
      data: { nextOccurrenceAt: dueAt },
    });

    await expect(
      bulkService.reconcileRecurrence(recurrence.id, new Date()),
    ).resolves.toBe('generated');
    await expect(
      bulkService.reconcileRecurrence(recurrence.id, new Date()),
    ).resolves.toBe('noop');

    const batches = await client.taskBatch.findMany({
      where: { recurrenceId: recurrence.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    expect(batches).toHaveLength(2);
    await expectBatchTasks(
      client,
      batches[1]!.id,
      reviewerMap(testFixture, true),
      true,
    );
  }, 60_000);

  it('reevaluates active Global recipients for each recurring occurrence', async () => {
    const client = requirePrisma(prisma);
    const testFixture = requireFixture(fixture);
    const bulkService = requireService(service);
    await bulkService.createBulkTask(superAdminViewer(testFixture), {
      title: 'Recurring Global compliance check',
      dueAt: new Date(Date.now() + 86_400_000),
      scope: TaskBatchScope.GLOBAL,
      recurrence: {
        frequency: TaskRecurrenceFrequency.WEEKLY,
        reminderLeadMinutes: 120,
      },
    });

    const recurrence = await client.taskBatchRecurrence.findFirstOrThrow({
      where: { createdById: testFixture.superAdminId },
      select: { id: true },
    });
    await client.user.update({
      where: { id: testFixture.memberTwoId },
      data: { status: UserStatus.ACTIVE },
    });
    await client.teamMember.create({
      data: {
        teamId: testFixture.teamId,
        memberId: testFixture.memberTwoId,
      },
    });
    await client.taskBatchRecurrence.update({
      where: { id: recurrence.id },
      data: { nextOccurrenceAt: new Date(Date.now() - 1_000) },
    });

    await expect(
      bulkService.reconcileRecurrence(recurrence.id, new Date()),
    ).resolves.toBe('generated');
    await expect(
      bulkService.reconcileRecurrence(recurrence.id, new Date()),
    ).resolves.toBe('noop');

    const batches = await client.taskBatch.findMany({
      where: { recurrenceId: recurrence.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    expect(batches).toHaveLength(2);
    await expectBatchTasks(
      client,
      batches[1]!.id,
      reviewerMap(testFixture, true),
      true,
    );
  }, 60_000);
});

async function expectBatchTasks(
  prismaClient: PrismaClient,
  batchId: string,
  expectedReviewers: Map<string, string>,
  expectReminder: boolean,
): Promise<void> {
  const tasks = await prismaClient.task.findMany({
    where: { batchId },
    select: {
      scope: true,
      status: true,
      completionMode: true,
      reviewerUserId: true,
      reminder: { select: { id: true } },
      assignments: {
        where: { unassignedAt: null },
        select: { responsibleUserId: true },
      },
    },
  });
  expect(tasks).toHaveLength(expectedReviewers.size);
  expect(
    tasks.map((task) => task.assignments[0]?.responsibleUserId).sort(),
  ).toEqual([...expectedReviewers.keys()].sort());
  for (const task of tasks) {
    const responsibleUserId = task.assignments[0]?.responsibleUserId;
    expect(task).toMatchObject({
      scope: TaskScope.INDIVIDUAL,
      status: TaskStatus.ASSIGNED,
      completionMode: TaskCompletionMode.REVIEW_REQUIRED,
    });
    expect(task.assignments).toHaveLength(1);
    expect(task.reminder !== null).toBe(expectReminder);
    expect(task.reviewerUserId).toBe(
      responsibleUserId ? expectedReviewers.get(responsibleUserId) : undefined,
    );
  }
}

async function createFixture(prismaClient: PrismaClient): Promise<Fixture> {
  const prefix = `bulk-recurrence-${randomUUID()}`;
  const superAdminId = `${prefix}-super-admin`;
  const adminId = `${prefix}-admin`;
  const memberOneId = `${prefix}-member-1`;
  const memberTwoId = `${prefix}-member-2`;
  await prismaClient.user.createMany({
    data: [
      user(superAdminId, UserRole.SUPER_ADMIN),
      user(adminId, UserRole.ADMIN),
      user(memberOneId, UserRole.MEMBER),
      user(memberTwoId, UserRole.MEMBER, UserStatus.INACTIVE),
    ],
  });
  const team = await prismaClient.team.create({
    data: {
      id: `${prefix}-team`,
      name: `Bulk recurrence ${prefix}`,
      adminId,
      members: { create: { memberId: memberOneId } },
    },
    select: { id: true, publicId: true },
  });
  return {
    superAdminId,
    adminId,
    memberOneId,
    memberTwoId,
    teamId: team.id,
    teamPublicId: team.publicId,
  };
}

function user(
  id: string,
  role: UserRole,
  status: UserStatus = UserStatus.ACTIVE,
) {
  return {
    id,
    name: id,
    email: `${id}@operix.test`,
    role,
    status,
  };
}

function superAdminViewer(testFixture: Fixture): OperixViewer {
  return {
    userId: testFixture.superAdminId,
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    scope: { type: 'GLOBAL' },
  };
}

function reviewerMap(
  testFixture: Fixture,
  includeMemberTwo: boolean,
): Map<string, string> {
  return new Map([
    [testFixture.adminId, testFixture.superAdminId],
    [testFixture.memberOneId, testFixture.adminId],
    ...(includeMemberTwo
      ? ([[testFixture.memberTwoId, testFixture.adminId]] as const)
      : []),
  ]);
}

async function cleanupBulkRecurrenceFixtures(
  prismaClient: PrismaClient,
): Promise<void> {
  const users = await prismaClient.user.findMany({
    where: { id: { startsWith: 'bulk-recurrence-' } },
    select: { id: true },
  });
  const userIds = users.map(({ id }) => id);
  if (userIds.length === 0) return;
  const teams = await prismaClient.team.findMany({
    where: { adminId: { in: userIds } },
    select: { id: true },
  });
  const teamIds = teams.map(({ id }) => id);
  const tasks = await prismaClient.task.findMany({
    where: { createdById: { in: userIds } },
    select: { id: true },
  });
  const taskIds = tasks.map(({ id }) => id);
  const recurrences = await prismaClient.taskBatchRecurrence.findMany({
    where: { createdById: { in: userIds } },
    select: { id: true },
  });
  const recurrenceIds = recurrences.map(({ id }) => id);

  await prismaClient.notification.deleteMany({
    where: {
      OR: [{ actorId: { in: userIds } }, { receiverId: { in: userIds } }],
    },
  });
  await prismaClient.activityLog.deleteMany({
    where: {
      OR: [
        { actorId: { in: userIds } },
        { entityId: { in: [...taskIds, ...recurrenceIds] } },
      ],
    },
  });
  await prismaClient.task.deleteMany({ where: { id: { in: taskIds } } });
  await prismaClient.taskBatch.deleteMany({
    where: { createdById: { in: userIds } },
  });
  await prismaClient.taskBatchRecurrence.deleteMany({
    where: { id: { in: recurrenceIds } },
  });
  await prismaClient.teamMember.deleteMany({
    where: { teamId: { in: teamIds } },
  });
  await prismaClient.team.deleteMany({ where: { id: { in: teamIds } } });
  await prismaClient.user.deleteMany({ where: { id: { in: userIds } } });
}

function requirePrisma(value: PrismaClient | undefined): PrismaClient {
  if (!value) throw new Error('Prisma test client was not initialized');
  return value;
}

function requireFixture(value: Fixture | undefined): Fixture {
  if (!value) throw new Error('Bulk recurrence fixture was not initialized');
  return value;
}

function requireService(value: TaskBulkService | undefined): TaskBulkService {
  if (!value) throw new Error('TaskBulkService was not initialized');
  return value;
}
