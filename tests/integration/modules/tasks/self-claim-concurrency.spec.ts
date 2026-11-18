import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from '../../../../generated/prisma/client';
import {
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../../generated/prisma/enums';
import { TaskService } from '../../../../src/modules/task/task.service';
import { TASK_ERROR_CODE } from '../../../../src/modules/task/task.constant';
import type { OperixViewer } from '../../../../src/shared/auth/viewer.interface';
import { getTestDatabaseUrl } from '../../../support/database/test-database-url';

interface Fixture {
  adminId: string;
  memberIds: [string, string];
  taskId: string;
  taskPublicId: string;
  teamId: string;
}

describe('Task Member self claim concurrency', () => {
  let pool: Pool | undefined;
  let prisma: PrismaClient | undefined;
  let fixture: Fixture | undefined;

  beforeAll(() => {
    const testPool = new Pool({ connectionString: getTestDatabaseUrl() });
    pool = testPool;
    prisma = new PrismaClient({ adapter: new PrismaPg(testPool) });
  }, 60_000);

  beforeEach(async () => {
    if (!prisma) throw new Error('Prisma test client was not initialized');
    fixture = await createFixture(prisma);
  }, 60_000);

  afterEach(async () => {
    if (!prisma || !fixture) return;
    await prisma.notification.deleteMany({
      where: { targetType: 'TASK', targetId: fixture.taskId },
    });
    await prisma.activityLog.deleteMany({
      where: { entityType: 'TASK', entityId: fixture.taskId },
    });
    await prisma.task.delete({ where: { id: fixture.taskId } });
    await prisma.team.delete({ where: { id: fixture.teamId } });
    await prisma.user.deleteMany({
      where: { id: { in: [fixture.adminId, ...fixture.memberIds] } },
    });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  }, 60_000);

  it('allows exactly one concurrent Member to claim the Task', async () => {
    if (!prisma || !fixture) throw new Error('Fixture was not initialized');
    const mailService = {
      sendTaskAssignedEmail: import.meta.jest.fn().mockResolvedValue(undefined),
    };
    const service = new TaskService(prisma as never, mailService as never);

    const results = await Promise.allSettled(
      fixture.memberIds.map((memberId) =>
        service.claimTask(memberViewer(memberId), fixture!.taskPublicId),
      ),
    );

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected?.status !== 'rejected') {
      throw new Error('Expected exactly one rejected claim attempt.');
    }
    const reason = rejected.reason as {
      status?: number;
      response?: { code?: string };
    };
    // The loser of the race may fail either inside its first attempt (an active
    // assignment already exists while the task is still PENDING) or after a
    // serializable retry observes the committed status (the task is no longer
    // PENDING). Both are legitimate 409 rejections of the same claim, so pinning
    // one code makes the test depend on transaction scheduling.
    expect(reason.status).toBe(409);
    expect([
      TASK_ERROR_CODE.TASK_CLAIM_CONFLICT,
      TASK_ERROR_CODE.TASK_INVALID_STATUS_TRANSITION,
    ]).toContain(reason.response?.code);

    const task = await prisma.task.findUniqueOrThrow({
      where: { id: fixture.taskId },
      include: {
        assignments: { where: { unassignedAt: null } },
      },
    });
    expect(task.status).toBe(TaskStatus.ASSIGNED);
    expect(task.allowSelfClaim).toBe(true);
    expect(task.assignments).toHaveLength(1);
    await expect(
      prisma.notification.count({
        where: { targetType: 'TASK', targetId: fixture.taskId },
      }),
    ).resolves.toBe(2);
  }, 60_000);
});

function memberViewer(userId: string): OperixViewer {
  return {
    userId,
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    scope: { type: 'MEMBER', teamId: null },
  };
}

async function createFixture(prisma: PrismaClient): Promise<Fixture> {
  const prefix = `self-claim-${randomUUID()}`;
  const adminId = `${prefix}-admin`;
  const memberIds: [string, string] = [
    `${prefix}-member-1`,
    `${prefix}-member-2`,
  ];
  const teamId = `${prefix}-team`;
  const taskId = `${prefix}-task`;

  await prisma.user.createMany({
    data: [
      {
        id: adminId,
        name: 'Self Claim Owner',
        email: `${adminId}@operix.test`,
        role: UserRole.ADMIN,
      },
      ...memberIds.map((id, index) => ({
        id,
        name: `Self Claim Member ${index + 1}`,
        email: `${id}@operix.test`,
        role: UserRole.MEMBER,
      })),
    ],
  });
  await prisma.team.create({
    data: { id: teamId, name: `Self Claim ${prefix}`, adminId },
  });
  const task = await prisma.task.create({
    data: {
      id: taskId,
      referenceCode: `${prefix}-task`,
      title: 'Cross Team claimable task',
      status: TaskStatus.PENDING,
      allowSelfClaim: true,
      teamId,
      createdById: adminId,
    },
    select: { publicId: true },
  });
  return { adminId, memberIds, taskId, taskPublicId: task.publicId, teamId };
}
