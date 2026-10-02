import { HttpStatus } from '@nestjs/common';
import {
  TaskDistributionStatus,
  TaskScope,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { PrismaService } from '../../../src/database/prisma.service';
import { TASK_ERROR_CODE } from '../../../src/modules/task/task.constant';
import { TaskDistributionService } from '../../../src/modules/task/task-distribution.service';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;
const now = new Date('2026-09-12T10:00:00.000Z');

function viewer(role: UserRole = UserRole.ADMIN): OperixViewer {
  return {
    userId: role === UserRole.SUPER_ADMIN ? 'chief-db' : 'owner-db',
    role,
    status: UserStatus.ACTIVE,
    scope:
      role === UserRole.SUPER_ADMIN
        ? { type: 'GLOBAL' }
        : { type: 'ADMIN', teamIds: [] },
  };
}

function createPrisma(tx: Record<string, unknown>): PrismaService {
  return {
    $transaction: jestApi.fn(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  } as unknown as PrismaService;
}

describe('TaskDistributionService', () => {
  it('claims a due distribution and creates one deduplicated fan-out', async () => {
    const task = {
      id: 'task-db',
      publicId: '11111111-1111-4111-8111-111111111111',
      scope: TaskScope.GLOBAL,
      title: 'Organization update',
      dueAt: new Date('2026-09-13T10:00:00.000Z'),
      createdBy: { name: 'Chief' },
    };
    const tx = {
      taskDistribution: {
        findUnique: jestApi.fn().mockResolvedValue({
          id: 'distribution-db',
          status: TaskDistributionStatus.PENDING,
          scheduledAt: new Date('2026-09-12T09:00:00.000Z'),
          task,
        }),
        updateMany: jestApi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findMany: jestApi
          .fn()
          .mockResolvedValue([
            { id: 'chief-db' },
            { id: 'member-db' },
            { id: 'member-db' },
          ]),
      },
      notification: {
        createMany: jestApi.fn().mockResolvedValue({ count: 2 }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity-db' }),
      },
      task: {
        findUnique: jestApi.fn().mockResolvedValue({
          publicId: task.publicId,
        }),
      },
    };
    const service = new TaskDistributionService(createPrisma(tx));

    const result = await service.processDistribution('distribution-db', now);

    expect(result).toEqual({ state: 'sent', recipients: 2 });
    expect(tx.taskDistribution.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'distribution-db',
        status: TaskDistributionStatus.PENDING,
        scheduledAt: { lte: now },
      },
      data: { status: TaskDistributionStatus.SENT, sentAt: now },
    });
    expect(tx.notification.createMany).toHaveBeenCalledTimes(1);
    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          receiverId: 'chief-db',
          targetPublicId: task.publicId,
        }) as object,
        expect.objectContaining({
          receiverId: 'member-db',
          targetPublicId: task.publicId,
        }) as object,
      ],
    });
    expect(tx.activityLog.create).toHaveBeenCalledTimes(1);
  });

  it('is a safe no-op when another worker wins the claim', async () => {
    const tx = {
      taskDistribution: {
        findUnique: jestApi.fn().mockResolvedValue({
          id: 'distribution-db',
          status: TaskDistributionStatus.PENDING,
          scheduledAt: new Date('2026-09-12T09:00:00.000Z'),
          task: {
            id: 'task-db',
            publicId: '11111111-1111-4111-8111-111111111111',
            scope: TaskScope.GLOBAL,
            title: 'Organization update',
            dueAt: null,
            createdBy: { name: 'Chief' },
          },
        }),
        updateMany: jestApi.fn().mockResolvedValue({ count: 0 }),
      },
      user: { findMany: jestApi.fn() },
      notification: { createMany: jestApi.fn() },
      activityLog: { create: jestApi.fn() },
    };
    const service = new TaskDistributionService(createPrisma(tx));

    await expect(
      service.processDistribution('distribution-db', now),
    ).resolves.toEqual({ state: 'noop', recipients: 0 });
    expect(tx.user.findMany).not.toHaveBeenCalled();
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it('rejects rescheduling after a distribution is sent', async () => {
    const tx = {
      task: {
        findUnique: jestApi.fn().mockResolvedValue({
          id: 'task-db',
          createdById: 'owner-db',
          scope: TaskScope.GLOBAL,
          distribution: {
            id: 'distribution-db',
            status: TaskDistributionStatus.SENT,
          },
        }),
      },
      taskDistribution: { update: jestApi.fn() },
    };
    const service = new TaskDistributionService(createPrisma(tx));

    await expect(
      service.reschedule(viewer(), '11111111-1111-4111-8111-111111111111', now),
    ).rejects.toMatchObject({
      status: HttpStatus.CONFLICT,
      response: { code: TASK_ERROR_CODE.TASK_DISTRIBUTION_IMMUTABLE },
    });
    expect(tx.taskDistribution.update).not.toHaveBeenCalled();
  });
});
