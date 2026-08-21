import { HttpStatus } from '@nestjs/common';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import { PrismaService } from '../../../src/database/prisma.service';
import { TeamService } from '../../../src/modules/team/team.service';
import { AccountProvisioningService } from '../../../src/modules/user-management/account-provisioning.service';
import { MemberService } from '../../../src/modules/user-management/member/member.service';
import { buildMemberScopeWhere } from '../../../src/modules/user-management/member/member-scope.policy';
import { USER_MANAGEMENT_ERROR_CODE } from '../../../src/modules/user-management/user-management.constant';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;

function createViewer(role: UserRole): OperixViewer {
  return {
    userId: 'viewer-a',
    role,
    status: UserStatus.ACTIVE,
    scope:
      role === UserRole.SUPER_ADMIN
        ? { type: 'GLOBAL' }
        : { type: 'ADMIN', teamIds: ['team-a'] },
  };
}

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

describe('member scope policy', () => {
  it('scopes Admin viewers to their own team members', () => {
    expect(buildMemberScopeWhere(createViewer(UserRole.ADMIN))).toMatchObject({
      role: UserRole.MEMBER,
      teamMembership: {
        teamId: {
          in: ['team-a'],
        },
      },
    });
  });
});

describe('MemberService', () => {
  it('rejects Admin attempts to edit employeeId', async () => {
    const service = new MemberService(
      {} as PrismaService,
      {} as AccountProvisioningService,
      {} as TeamService,
    );

    try {
      await service.updateMember(createViewer(UserRole.ADMIN), 'member-a', {
        employeeId: 'M-2',
      });
      throw new Error('Expected update to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.FORBIDDEN,
        code: APP_ERROR_CODE.FORBIDDEN,
      });
    }
  });

  it('uses privacy-safe MEMBER_NOT_FOUND for absent or out-of-scope members', async () => {
    const prisma = {
      user: {
        findFirst: jestApi.fn().mockResolvedValue(null),
      },
    };
    const service = new MemberService(
      prisma as unknown as PrismaService,
      {} as AccountProvisioningService,
      {} as TeamService,
    );

    try {
      await service.getMember(createViewer(UserRole.ADMIN), 'member-b');
      throw new Error('Expected lookup to fail.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.NOT_FOUND,
        code: USER_MANAGEMENT_ERROR_CODE.MEMBER_NOT_FOUND,
      });
    }
  });
});
