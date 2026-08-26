import { HttpStatus } from '@nestjs/common';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../src/database/prisma.service';
import { AccountProvisioningService } from '../../../src/modules/user-management/account-provisioning.service';
import { AdminService } from '../../../src/modules/user-management/admin/admin.service';
import {
  USER_MANAGEMENT_ACTIVITY,
  USER_MANAGEMENT_ERROR_CODE,
} from '../../../src/modules/user-management/user-management.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import type { MailService } from '../../../src/shared/mail/mail.service';

const jestApi = import.meta.jest;

const viewer: OperixViewer = {
  userId: 'super-admin',
  role: UserRole.SUPER_ADMIN,
  status: UserStatus.ACTIVE,
  scope: {
    type: 'GLOBAL',
  },
};

function expectAppException(
  error: unknown,
  input: {
    status: number;
    code: string;
  },
): void {
  const exception = error as {
    getStatus: () => number;
    getResponse: () => unknown;
  };

  expect(exception.getStatus()).toBe(input.status);
  expect(exception.getResponse()).toMatchObject({
    code: input.code,
  });
}

describe('AdminService', () => {
  it('returns the current admin and writes no activity for identical updates', async () => {
    const admin = {
      id: 'admin-a',
      name: 'Admin A',
      email: 'admin-a@example.com',
      employeeId: 'A-1',
      designation: 'Lead',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const prisma = {
      user: {
        findFirst: jestApi.fn().mockResolvedValue(admin),
      },
      $transaction: jestApi.fn(),
    };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      {} as AccountProvisioningService,
      {} as MailService,
    );

    await expect(
      service.updateAdmin(viewer, 'admin-a', {
        name: admin.name,
        employeeId: admin.employeeId,
        designation: admin.designation,
      }),
    ).resolves.toBe(admin);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('prevents suspending an Admin that owns teams', async () => {
    const admin = {
      id: 'admin-a',
      name: 'Admin A',
      email: 'admin-a@example.com',
      employeeId: null,
      designation: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const prisma = {
      $transaction: jestApi.fn(
        (
          callback: (transaction: {
            user: { findFirst: () => Promise<typeof admin> };
            team: { count: () => Promise<number> };
          }) => Promise<unknown>,
        ) =>
          callback({
            user: {
              findFirst: jestApi.fn().mockResolvedValue(admin),
            },
            team: {
              count: jestApi.fn().mockResolvedValue(1),
            },
          }),
      ),
    };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      {} as AccountProvisioningService,
      {} as MailService,
    );

    try {
      await service.updateAdminStatus(viewer, 'admin-a', {
        status: UserStatus.SUSPENDED,
      });
      throw new Error('Expected status update to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.CONFLICT,
        code: USER_MANAGEMENT_ERROR_CODE.ADMIN_HAS_ASSIGNED_TEAMS,
      });
    }
  });

  it('creates Admin activity only after provisioning succeeds', async () => {
    const admin = {
      id: 'admin-a',
      name: 'Admin A',
      email: 'admin-a@example.com',
      employeeId: null,
      designation: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const tx = {
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity-a' }),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const provisioner = {
      provisionAccount: jestApi.fn().mockResolvedValue(admin),
    };
    const mailService = {
      sendWelcomeUserEmail: jestApi.fn().mockResolvedValue(undefined),
    };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      provisioner as unknown as AccountProvisioningService,
      mailService as unknown as MailService,
    );

    await service.createAdmin(viewer, {
      name: 'Admin A',
      email: 'admin-a@example.com',
      initialPassword: 'super-secret-1',
    });

    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: {
        action: USER_MANAGEMENT_ACTIVITY.ADMIN_CREATED,
        actorId: viewer.userId,
        entityType: 'USER',
        entityId: 'admin-a',
        metadata: {
          adminId: 'admin-a',
        },
        ipAddress: null,
        requestId: null,
        userAgent: null,
      },
    });
    expect(mailService.sendWelcomeUserEmail).toHaveBeenCalledWith({
      userId: admin.id,
      recipientName: admin.name,
      accountEmail: admin.email,
      role: 'ADMIN',
    });
  });

  it('does not send Welcome and cleans up when required Activity fails', async () => {
    const admin = {
      id: 'admin-a',
      name: 'Admin A',
      email: 'admin-a@example.com',
      employeeId: null,
      designation: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const activityError = new Error('Activity failed.');
    const prisma = {
      $transaction: jestApi.fn().mockRejectedValue(activityError),
    };
    const provisioner = {
      provisionAccount: jestApi.fn().mockResolvedValue(admin),
      cleanupCreatedUser: jestApi.fn().mockResolvedValue(undefined),
    };
    const mailService = {
      sendWelcomeUserEmail: jestApi.fn(),
    };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      provisioner as unknown as AccountProvisioningService,
      mailService as unknown as MailService,
    );

    await expect(
      service.createAdmin(viewer, {
        name: admin.name,
        email: admin.email,
        initialPassword: 'super-secret-1',
      }),
    ).rejects.toBe(activityError);

    expect(provisioner.cleanupCreatedUser).toHaveBeenCalledWith(admin.id);
    expect(mailService.sendWelcomeUserEmail).not.toHaveBeenCalled();
  });

  it('keeps the created Admin when Welcome delivery fails', async () => {
    const admin = {
      id: 'admin-a',
      name: 'Admin A',
      email: 'admin-a@example.com',
      employeeId: null,
      designation: null,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const prisma = {
      $transaction: jestApi.fn(
        (
          callback: (tx: {
            activityLog: { create: () => Promise<unknown> };
          }) => Promise<unknown>,
        ) =>
          callback({
            activityLog: {
              create: jestApi.fn().mockResolvedValue({ id: 'activity-a' }),
            },
          }),
      ),
    };
    const provisioner = {
      provisionAccount: jestApi.fn().mockResolvedValue(admin),
      cleanupCreatedUser: jestApi.fn(),
    };
    const mailService = {
      sendWelcomeUserEmail: jestApi
        .fn()
        .mockRejectedValue(new Error('Delivery failed.')),
    };
    const service = new AdminService(
      prisma as unknown as PrismaService,
      provisioner as unknown as AccountProvisioningService,
      mailService as unknown as MailService,
    );

    await expect(
      service.createAdmin(viewer, {
        name: admin.name,
        email: admin.email,
        initialPassword: 'super-secret-1',
      }),
    ).resolves.toBe(admin);

    expect(provisioner.cleanupCreatedUser).not.toHaveBeenCalled();
  });
});
