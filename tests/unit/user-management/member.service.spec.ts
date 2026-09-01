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
import type { MailService } from '../../../src/shared/mail/mail.service';

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
  it('sends a password-free Welcome after required Activity succeeds', async () => {
    const member = {
      id: 'member-a',
      publicId: 'member-a',
      name: 'Member A',
      email: 'member-a@example.com',
      employeeId: null,
      designation: null,
      role: UserRole.MEMBER,
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
      provisionAccount: jestApi.fn().mockResolvedValue(member),
    };
    const mailService = {
      sendWelcomeUserEmail: jestApi.fn().mockResolvedValue(undefined),
    };
    const service = new MemberService(
      prisma as unknown as PrismaService,
      provisioner as unknown as AccountProvisioningService,
      {} as TeamService,
      mailService as unknown as MailService,
    );

    await service.createMember(createViewer(UserRole.SUPER_ADMIN), {
      name: member.name,
      email: member.email,
      initialPassword: 'super-secret-1',
    });

    expect(mailService.sendWelcomeUserEmail).toHaveBeenCalledWith({
      userId: member.id,
      recipientName: member.name,
      accountEmail: member.email,
      role: 'MEMBER',
    });
  });

  it('keeps the created Member when Welcome delivery fails', async () => {
    const member = {
      id: 'member-a',
      publicId: 'member-a',
      name: 'Member A',
      email: 'member-a@example.com',
      employeeId: null,
      designation: null,
      role: UserRole.MEMBER,
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
      provisionAccount: jestApi.fn().mockResolvedValue(member),
      cleanupCreatedUser: jestApi.fn(),
    };
    const mailService = {
      sendWelcomeUserEmail: jestApi
        .fn()
        .mockRejectedValue(new Error('Delivery failed.')),
    };
    const service = new MemberService(
      prisma as unknown as PrismaService,
      provisioner as unknown as AccountProvisioningService,
      {} as TeamService,
      mailService as unknown as MailService,
    );

    await expect(
      service.createMember(createViewer(UserRole.SUPER_ADMIN), {
        name: member.name,
        email: member.email,
        initialPassword: 'super-secret-1',
      }),
    ).resolves.toMatchObject({ id: member.publicId, email: member.email });

    expect(provisioner.cleanupCreatedUser).not.toHaveBeenCalled();
  });

  it('rejects Admin attempts to edit employeeId', async () => {
    const service = new MemberService(
      {} as PrismaService,
      {} as AccountProvisioningService,
      {} as TeamService,
      {} as MailService,
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
      {} as MailService,
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
