import { HttpStatus } from '@nestjs/common';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../src/database/prisma.service';
import {
  TEAM_ACTIVITY,
  TEAM_ERROR_CODE,
  TEAM_NOTIFICATION,
} from '../../../src/modules/team/team.constant';
import { TeamService } from '../../../src/modules/team/team.service';
import { buildTeamScopeWhere } from '../../../src/modules/team/team-scope.policy';
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

describe('team scope policy', () => {
  it('scopes Admin viewers to their own teams', () => {
    expect(
      buildTeamScopeWhere({
        ...viewer,
        userId: 'admin-a',
        role: UserRole.ADMIN,
        scope: {
          type: 'ADMIN',
          teamIds: ['team-a'],
        },
      }),
    ).toEqual({
      adminId: 'admin-a',
    });
  });
});

describe('TeamService', () => {
  it('rejects assigning an already assigned Member', async () => {
    const prisma = {
      team: {
        findUnique: jestApi.fn().mockResolvedValue({
          id: 'team-a',
          adminId: 'admin-a',
          admin: {
            status: UserStatus.ACTIVE,
          },
        }),
      },
      user: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'member-a',
          status: UserStatus.ACTIVE,
          teamMembership: {
            id: 'membership-a',
          },
        }),
      },
    };
    const service = new TeamService(prisma as unknown as PrismaService);

    try {
      await service.assignMember(viewer, 'team-a', {
        memberId: 'member-a',
      });
      throw new Error('Expected assignment to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.CONFLICT,
        code: TEAM_ERROR_CODE.MEMBER_ALREADY_ASSIGNED,
      });
    }
  });

  it('writes assignment activity and notification in the supplied transaction', async () => {
    const tx = {
      teamMember: {
        create: jestApi.fn().mockResolvedValue({ id: 'membership-a' }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity-a' }),
      },
      notification: {
        create: jestApi.fn().mockResolvedValue({ id: 'notification-a' }),
      },
      team: {
        findUniqueOrThrow: jestApi.fn().mockResolvedValue({
          id: 'team-a',
          name: 'Team A',
          adminId: 'admin-a',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
    };
    const prisma = {
      team: {
        findUnique: jestApi.fn().mockResolvedValue({
          id: 'team-a',
          adminId: 'admin-a',
          admin: {
            status: UserStatus.ACTIVE,
          },
        }),
      },
      user: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'member-a',
          status: UserStatus.ACTIVE,
          teamMembership: null,
        }),
      },
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new TeamService(prisma as unknown as PrismaService);

    await service.assignMember(viewer, 'team-a', {
      memberId: 'member-a',
    });

    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: {
        action: TEAM_ACTIVITY.MEMBER_ASSIGNED_TO_TEAM,
        actorId: viewer.userId,
        entityType: 'TEAM',
        entityId: 'team-a',
        metadata: {
          adminId: 'admin-a',
          memberId: 'member-a',
          teamId: 'team-a',
        },
        ipAddress: null,
        requestId: null,
        userAgent: null,
      },
    });
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: {
        actorId: viewer.userId,
        body: 'You have been assigned to a team.',
        receiverId: 'member-a',
        targetId: 'team-a',
        targetType: 'TEAM',
        title: 'Team assignment updated',
        type: TEAM_NOTIFICATION.MEMBER_ASSIGNED_TO_TEAM,
      },
    });
  });

  it('deletes the old membership before creating the new membership on transfer', async () => {
    const order: string[] = [];
    const tx = {
      teamMember: {
        delete: jestApi.fn().mockImplementation(() => {
          order.push('delete');
          return Promise.resolve({ id: 'membership-a' });
        }),
        create: jestApi.fn().mockImplementation(() => {
          order.push('create');
          return Promise.resolve({ id: 'membership-b' });
        }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'activity-a' }),
      },
      notification: {
        create: jestApi.fn().mockResolvedValue({ id: 'notification-a' }),
      },
      team: {
        findUniqueOrThrow: jestApi.fn().mockResolvedValue({
          id: 'team-b',
          name: 'Team B',
          adminId: 'admin-b',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
    };
    const prisma = {
      user: {
        findFirst: jestApi.fn().mockResolvedValue({
          id: 'member-a',
          teamMembership: {
            id: 'membership-a',
            teamId: 'team-a',
            team: {
              adminId: 'admin-a',
            },
          },
        }),
      },
      team: {
        findUnique: jestApi.fn().mockResolvedValue({
          id: 'team-b',
          adminId: 'admin-b',
          admin: {
            status: UserStatus.ACTIVE,
          },
        }),
      },
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new TeamService(prisma as unknown as PrismaService);

    await service.transferMember(viewer, 'member-a', 'team-b');

    expect(order).toEqual(['delete', 'create']);
    expect(tx.activityLog.create).toHaveBeenCalledWith({
      data: {
        action: TEAM_ACTIVITY.MEMBER_TRANSFERRED,
        actorId: viewer.userId,
        entityId: 'member-a',
        entityType: 'USER',
        metadata: {
          fromAdminId: 'admin-a',
          fromTeamId: 'team-a',
          memberId: 'member-a',
          toAdminId: 'admin-b',
          toTeamId: 'team-b',
        },
        ipAddress: null,
        requestId: null,
        userAgent: null,
      },
    });
  });
});
