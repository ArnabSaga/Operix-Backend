import { ConfigService } from '@nestjs/config';
import {
  RegistrationRequestStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';
import { RegistrationService } from '../../../src/modules/registration/registration.service';
import { REGISTRATION_GENERIC_RESPONSE } from '../../../src/modules/registration/registration.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import type { AccountProvisioningService } from '../../../src/modules/user-management/account-provisioning.service';
import type { MailService } from '../../../src/shared/mail/mail.service';
import type { OperixAuthService } from '../../../src/modules/auth/auth.service';

const jestApi = import.meta.jest;

const superAdminViewer: OperixViewer = {
  userId: 'super-admin-internal-id',
  role: UserRole.SUPER_ADMIN,
  status: UserStatus.ACTIVE,
  scope: {
    type: 'GLOBAL',
  },
};

function createService(input?: { count?: number; existingUser?: boolean }) {
  const prisma = {
    registrationThrottleBucket: {
      upsert: jestApi.fn().mockResolvedValue({ count: input?.count ?? 1 }),
    },
    user: {
      findUnique: jestApi
        .fn()
        .mockResolvedValue(
          input?.existingUser ? { id: 'private-user-id' } : null,
        ),
    },
    registrationRequest: {
      findFirst: jestApi.fn().mockResolvedValue(null),
    },
  };
  const config = new ConfigService({
    registration: {
      rateLimitSecret: 'registration-rate-limit-secret-at-least-32-characters',
      cronSecret: 'cron-secret-at-least-32-characters-long',
    },
  });
  const service = new RegistrationService(
    prisma as never,
    config as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, prisma };
}

describe('RegistrationService public boundary', () => {
  it('returns the same generic response when the email already belongs to a User', async () => {
    const { service, prisma } = createService({ existingUser: true });
    await expect(
      service.createPublicRequest(
        { name: 'Applicant', email: 'applicant@example.com' },
        '203.0.113.10',
      ),
    ).resolves.toEqual(REGISTRATION_GENERIC_RESPONSE);
    expect(prisma.registrationThrottleBucket.upsert).toHaveBeenCalledTimes(1);
  });

  it('rate limits before looking up email state', async () => {
    const { service, prisma } = createService({ count: 6 });
    await expect(
      service.createPublicRequest(
        { name: 'Applicant', email: 'applicant@example.com' },
        '203.0.113.10',
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('uses constant time cron authorization semantics', () => {
    const { service } = createService();
    expect(
      service.isValidCronAuthorization(
        'Bearer cron-secret-at-least-32-characters-long',
      ),
    ).toBe(true);
    expect(service.isValidCronAuthorization('Bearer wrong')).toBe(false);
    expect(service.isValidCronAuthorization(undefined)).toBe(false);
  });

  it('maps only the public request identity', async () => {
    const publicId = '126dad59-f92d-43cb-8577-5cb742668953';
    const { service, prisma } = createService();
    prisma.registrationRequest.findFirst.mockResolvedValue(null);
    (prisma.registrationRequest as Record<string, unknown>).findUnique = jestApi
      .fn()
      .mockResolvedValue({
        id: 'private-request-id',
        publicId,
        name: 'Applicant',
        normalizedEmail: 'applicant@example.com',
        status: RegistrationRequestStatus.PENDING,
        selectedRole: null,
        selectedEmployeeId: null,
        selectedDesignation: null,
        selectedTeam: null,
        reviewer: null,
        rejectionReason: null,
        reviewedAt: null,
        approvedAt: null,
        passwordConfiguredAt: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
      });
    const result = await service.get(publicId);
    expect(result.id).toBe(publicId);
    expect(JSON.stringify(result)).not.toContain('private-request-id');
  });
});

describe('RegistrationService approve workflow', () => {
  it('successfully approves an admin registration and requests password setup', async () => {
    const requestId = '126dad59-f92d-43cb-8577-5cb742668953';
    const internalRequestId = 'req_cuid_123';
    const provisionedUser = {
      id: 'user_cuid_456',
      publicId: '22222222-2222-2222-2222-222222222222',
      name: 'Applicant',
      email: 'applicant@example.com',
      employeeId: 'ADM-01',
      designation: 'Operations Admin',
      role: UserRole.ADMIN,
      status: UserStatus.INACTIVE,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    };

    const finalizedRequestRecord = {
      id: internalRequestId,
      publicId: requestId,
      name: 'Applicant',
      normalizedEmail: 'applicant@example.com',
      status: RegistrationRequestStatus.APPROVED,
      selectedRole: UserRole.ADMIN,
      selectedEmployeeId: 'ADM-01',
      selectedDesignation: 'Operations Admin',
      selectedTeam: null,
      reviewer: {
        publicId: '00000000-0000-0000-0000-000000000000',
        name: 'Super Admin',
      },
      rejectionReason: null,
      reviewedAt: new Date('2026-09-01T00:00:00.000Z'),
      approvedAt: new Date('2026-09-01T00:00:00.000Z'),
      passwordConfiguredAt: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    };

    const tx = {
      registrationRequest: {
        findUnique: jestApi.fn().mockResolvedValue({
          id: internalRequestId,
          status: RegistrationRequestStatus.PENDING,
          name: 'Applicant',
          normalizedEmail: 'applicant@example.com',
        }),
        findFirst: jestApi.fn().mockResolvedValue({ id: internalRequestId }),
        update: jestApi.fn().mockResolvedValue(finalizedRequestRecord),
      },
      user: {
        findFirst: jestApi.fn().mockResolvedValue({ id: provisionedUser.id }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'act_123' }),
      },
    };

    const prisma = {
      registrationRequest: {
        findFirst: jestApi.fn().mockResolvedValue(null), // no stale approval
      },
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    const provisioner = {
      provisionAccount: jestApi.fn().mockResolvedValue(provisionedUser),
      cleanupCreatedUser: jestApi.fn().mockResolvedValue(undefined),
    };

    const authService = {
      requestPasswordSetup: jestApi.fn().mockResolvedValue(undefined),
    };

    const mailService = {
      sendRegistrationRejectedEmail: jestApi.fn().mockResolvedValue(undefined),
    };

    const config = new ConfigService({
      registration: {
        rateLimitSecret:
          'registration-rate-limit-secret-at-least-32-characters',
        cronSecret: 'cron-secret-at-least-32-characters-long',
      },
    });

    const service = new RegistrationService(
      prisma as never,
      config as never,
      mailService as unknown as MailService,
      provisioner as unknown as AccountProvisioningService,
      authService as unknown as OperixAuthService,
    );

    const result = await service.approve(superAdminViewer, requestId, {
      role: UserRole.ADMIN,
      employeeId: 'ADM-01',
      designation: 'Operations Admin',
    });

    expect(result.id).toBe(requestId);
    expect(result.status).toBe(RegistrationRequestStatus.APPROVED);

    // Verify provisionAccount was called with correct registrationRequestId
    expect(provisioner.provisionAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'applicant@example.com',
        registrationRequestId: internalRequestId,
        role: UserRole.ADMIN,
      }) as unknown,
    );

    // Verify user was queried using user.id
    expect(tx.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: provisionedUser.id,
        registrationRequestId: internalRequestId,
      },
      select: { id: true },
    });

    // Verify password setup was initiated
    expect(authService.requestPasswordSetup).toHaveBeenCalledWith(
      'applicant@example.com',
    );
  });

  it('cleans up provisioned user and restores claim if final transaction fails', async () => {
    const requestId = '126dad59-f92d-43cb-8577-5cb742668953';
    const internalRequestId = 'req_cuid_123';
    const provisionedUser = {
      id: 'user_cuid_456',
      publicId: '22222222-2222-2222-2222-222222222222',
      name: 'Applicant',
      email: 'applicant@example.com',
      employeeId: null,
      designation: null,
      role: UserRole.ADMIN,
      status: UserStatus.INACTIVE,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    };

    let txCallCount = 0;
    const tx1 = {
      registrationRequest: {
        findUnique: jestApi.fn().mockResolvedValue({
          id: internalRequestId,
          status: RegistrationRequestStatus.PENDING,
          name: 'Applicant',
          normalizedEmail: 'applicant@example.com',
        }),
        update: jestApi.fn().mockResolvedValue({}),
      },
    };

    const prisma = {
      registrationRequest: {
        findFirst: jestApi.fn().mockResolvedValue(null),
        updateMany: jestApi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findUnique: jestApi.fn().mockResolvedValue({ id: provisionedUser.id }),
      },
      $transaction: jestApi.fn(
        (callback: (transaction: unknown) => Promise<unknown>) => {
          txCallCount += 1;
          if (txCallCount === 1) {
            return callback(tx1);
          }
          // Second transaction fails unexpectedly
          return Promise.reject(new Error('Transaction serialization error'));
        },
      ),
    };

    const provisioner = {
      provisionAccount: jestApi.fn().mockResolvedValue(provisionedUser),
      cleanupCreatedUser: jestApi.fn().mockResolvedValue(undefined),
    };

    const authService = {
      requestPasswordSetup: jestApi.fn(),
    };

    const config = new ConfigService({
      registration: {
        rateLimitSecret:
          'registration-rate-limit-secret-at-least-32-characters',
        cronSecret: 'cron-secret-at-least-32-characters-long',
      },
    });

    const service = new RegistrationService(
      prisma as never,
      config as never,
      {} as never,
      provisioner as unknown as AccountProvisioningService,
      authService as unknown as OperixAuthService,
    );

    await expect(
      service.approve(superAdminViewer, requestId, {
        role: UserRole.ADMIN,
      }),
    ).rejects.toThrow('Transaction serialization error');

    // Verify compensation cleaned up user by internal ID
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: provisionedUser.id },
      select: { id: true },
    });
    expect(provisioner.cleanupCreatedUser).toHaveBeenCalledWith(
      provisionedUser.id,
    );

    // Verify claim was restored to pending
    expect(prisma.registrationRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: internalRequestId,
        status: RegistrationRequestStatus.APPROVING,
        approvalClaimId: expect.any(String) as string,
      },
      data: {
        status: RegistrationRequestStatus.PENDING,
        approvalClaimId: null,
        approvalClaimedAt: null,
        selectedRole: null,
        selectedEmployeeId: null,
        selectedDesignation: null,
        selectedTeamId: null,
        reviewerId: null,
      },
    });
  });
});
