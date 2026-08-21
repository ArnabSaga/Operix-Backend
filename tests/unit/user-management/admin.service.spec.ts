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
    const service = new AdminService(
      prisma as unknown as PrismaService,
      provisioner as unknown as AccountProvisioningService,
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
  });
});
