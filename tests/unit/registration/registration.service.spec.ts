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
    { cleanupExpired: jestApi.fn().mockResolvedValue(0) } as never,
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

describe('RegistrationService cleanup integration', () => {
  it('adds bounded generic rate-limit cleanup counts without changing registration cleanup', async () => {
    const prisma = {
      registrationRequest: {
        findMany: jestApi.fn().mockResolvedValue([]),
      },
      registrationThrottleBucket: {
        deleteMany: jestApi.fn().mockResolvedValue({ count: 4 }),
      },
    };
    const apiRateLimitService = {
      cleanupExpired: jestApi.fn().mockResolvedValue(17),
    };
    const service = new RegistrationService(
      prisma as never,
      new ConfigService({
        registration: {
          rateLimitSecret:
            'registration-rate-limit-secret-at-least-32-characters',
          cronSecret: 'cron-secret-at-least-32-characters-long',
        },
      }) as never,
      {} as never,
      {} as never,
      {} as never,
      apiRateLimitService as never,
    );

    await expect(service.cleanup()).resolves.toEqual({
      purgedRegistrations: 0,
      purgedThrottleBuckets: 4,
      purgedApiRateLimitBuckets: 17,
    });
    expect(apiRateLimitService.cleanupExpired).toHaveBeenCalledTimes(1);
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
      notification: {
        updateMany: jestApi.fn().mockResolvedValue({ count: 1 }),
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
      requestPasswordSetup: jestApi.fn().mockResolvedValue('ACCEPTED'),
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
      { cleanupExpired: jestApi.fn().mockResolvedValue(0) } as never,
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

    // Resolution is part of the same approving transaction.
    expect(tx.notification.updateMany).toHaveBeenCalledWith({
      where: {
        targetType: 'REGISTRATION_REQUEST',
        targetId: internalRequestId,
        resolvedAt: null,
      },
      data: {
        resolvedAt: expect.any(Date) as Date,
        resolution: RegistrationRequestStatus.APPROVED,
      },
    });

    // Verify password setup was initiated
    expect(authService.requestPasswordSetup).toHaveBeenCalledWith(
      'applicant@example.com',
    );
    expect(result.setupEmail).toEqual({ status: 'ACCEPTED' });
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
      { cleanupExpired: jestApi.fn().mockResolvedValue(0) } as never,
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

async function expectAppError(
  promise: Promise<unknown>,
  expectation: { status: number; code: string },
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toMatchObject({ status: expectation.status });
    const response = (error as { getResponse?: () => unknown }).getResponse?.();
    expect(response).toMatchObject({ code: expectation.code });
    return;
  }
  throw new Error(`Expected AppException ${expectation.code}.`);
}

describe('RegistrationService onboarding mail reliability', () => {
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

  const baseConfig = () =>
    new ConfigService({
      registration: {
        rateLimitSecret:
          'registration-rate-limit-secret-at-least-32-characters',
        cronSecret: 'cron-secret-at-least-32-characters-long',
      },
    });

  const finalizedRequestRecord = {
    id: internalRequestId,
    publicId: requestId,
    name: 'Applicant',
    normalizedEmail: 'applicant@example.com',
    status: RegistrationRequestStatus.APPROVED,
    selectedRole: UserRole.ADMIN,
    selectedEmployeeId: null,
    selectedDesignation: null,
    selectedTeam: null,
    reviewer: null,
    rejectionReason: null,
    reviewedAt: new Date('2026-09-01T00:00:00.000Z'),
    approvedAt: new Date('2026-09-01T00:00:00.000Z'),
    passwordConfiguredAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  };

  function createApprovalService(setupCall: () => Promise<unknown>) {
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
      notification: {
        updateMany: jestApi.fn().mockResolvedValue({ count: 1 }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'act_approve' }),
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
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    const provisioner = {
      provisionAccount: jestApi.fn().mockResolvedValue(provisionedUser),
      cleanupCreatedUser: jestApi.fn().mockResolvedValue(undefined),
    };
    const authService = { requestPasswordSetup: jestApi.fn(setupCall) };
    const mailService = {
      sendRegistrationRejectedEmail: jestApi.fn().mockResolvedValue(undefined),
    };

    const service = new RegistrationService(
      prisma as never,
      baseConfig() as never,
      mailService as unknown as MailService,
      provisioner as unknown as AccountProvisioningService,
      authService as unknown as OperixAuthService,
      { cleanupExpired: jestApi.fn().mockResolvedValue(0) } as never,
    );

    return { service, prisma, provisioner, authService, mailService };
  }

  it('never compensates after the approval commits when setup mail is FAILED', async () => {
    const harness = createApprovalService(() => Promise.resolve('FAILED'));

    const result = await harness.service.approve(superAdminViewer, requestId, {
      role: UserRole.ADMIN,
    });

    // The mapped record is still returned, so post-commit mapping completed.
    expect(result.id).toBe(requestId);
    expect(result.status).toBe(RegistrationRequestStatus.APPROVED);
    expect(result.setupEmail).toEqual({ status: 'FAILED' });

    // Compensation must be unreachable once APPROVED has committed. The
    // compensation block is the only caller of these two operations.
    expect(harness.provisioner.cleanupCreatedUser).not.toHaveBeenCalled();
    expect(
      harness.prisma.registrationRequest.updateMany,
    ).not.toHaveBeenCalled();
    expect(harness.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('never compensates after the approval commits when the mail integration throws', async () => {
    const harness = createApprovalService(() =>
      Promise.reject(
        new Error('Authentication mail integration is unavailable.'),
      ),
    );

    const result = await harness.service.approve(superAdminViewer, requestId, {
      role: UserRole.ADMIN,
    });

    expect(result.status).toBe(RegistrationRequestStatus.APPROVED);
    expect(result.setupEmail).toEqual({ status: 'FAILED' });
    expect(harness.provisioner.cleanupCreatedUser).not.toHaveBeenCalled();
    expect(
      harness.prisma.registrationRequest.updateMany,
    ).not.toHaveBeenCalled();
    expect(harness.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  function createResendService(input: {
    status?: RegistrationRequestStatus;
    passwordConfiguredAt?: Date | null;
    userStatus?: UserStatus | null;
    passwordSetupRequired?: boolean;
    missingRequest?: boolean;
    lastClaimAt?: Date | null;
    setupCall?: () => Promise<unknown>;
  }) {
    const approvedUser =
      input.userStatus === null
        ? null
        : {
            status: input.userStatus ?? UserStatus.INACTIVE,
            passwordSetupRequired: input.passwordSetupRequired ?? true,
          };

    const claimTx = {
      registrationRequest: {
        findUnique: jestApi.fn().mockResolvedValue({ publicId: requestId }),
      },
      activityLog: {
        findFirst: jestApi
          .fn()
          .mockResolvedValue(
            input.lastClaimAt ? { createdAt: input.lastClaimAt } : null,
          ),
        create: jestApi.fn().mockResolvedValue({ id: 'act_resend' }),
      },
    };

    const prisma = {
      registrationRequest: {
        findUnique: jestApi.fn().mockResolvedValue(
          input.missingRequest
            ? null
            : {
                id: internalRequestId,
                status: input.status ?? RegistrationRequestStatus.APPROVED,
                normalizedEmail: 'applicant@example.com',
                passwordConfiguredAt: input.passwordConfiguredAt ?? null,
                approvedUser,
              },
        ),
      },
      $transaction: jestApi.fn(
        (callback: (transaction: typeof claimTx) => Promise<unknown>) =>
          callback(claimTx),
      ),
    };

    const authService = {
      requestPasswordSetup: jestApi.fn(
        input.setupCall ?? (() => Promise.resolve('ACCEPTED')),
      ),
    };

    const service = new RegistrationService(
      prisma as never,
      baseConfig() as never,
      {} as never,
      {} as never,
      authService as unknown as OperixAuthService,
      { cleanupExpired: jestApi.fn().mockResolvedValue(0) } as never,
    );

    return { service, prisma, claimTx, authService };
  }

  it('resends a setup email for one approved employee and reports ACCEPTED', async () => {
    const harness = createResendService({});

    const result = await harness.service.resendSetup(
      superAdminViewer,
      requestId,
    );

    expect(result).toEqual({
      message: 'A new account setup link was requested.',
      setupEmail: { status: 'ACCEPTED' },
    });
    expect(harness.authService.requestPasswordSetup).toHaveBeenCalledWith(
      'applicant@example.com',
    );
    expect(harness.claimTx.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'REGISTRATION_SETUP_RESENT',
        entityType: 'REGISTRATION_REQUEST',
        entityId: internalRequestId,
        actorId: superAdminViewer.userId,
      }) as unknown,
    });
  });

  it('reports FAILED but still consumes the cooldown claim', async () => {
    const harness = createResendService({
      setupCall: () => Promise.resolve('FAILED'),
    });

    const result = await harness.service.resendSetup(
      superAdminViewer,
      requestId,
    );

    expect(result.setupEmail).toEqual({ status: 'FAILED' });
    expect(harness.claimTx.activityLog.create).toHaveBeenCalledTimes(1);
  });

  it('enforces the 60 second resend cooldown server side', async () => {
    const harness = createResendService({
      lastClaimAt: new Date(Date.now() - 20_000),
    });

    await expectAppError(
      harness.service.resendSetup(superAdminViewer, requestId),
      {
        status: 429,
        code: 'REGISTRATION_SETUP_RESEND_COOLDOWN',
      },
    );
    expect(harness.claimTx.activityLog.create).not.toHaveBeenCalled();
    expect(harness.authService.requestPasswordSetup).not.toHaveBeenCalled();
  });

  it('allows a resend once the cooldown window has elapsed', async () => {
    const harness = createResendService({
      lastClaimAt: new Date(Date.now() - 61_000),
    });

    const result = await harness.service.resendSetup(
      superAdminViewer,
      requestId,
    );

    expect(result.setupEmail).toEqual({ status: 'ACCEPTED' });
  });

  it('refuses a resend when the password is already configured', async () => {
    const harness = createResendService({
      passwordConfiguredAt: new Date('2026-11-01T00:00:00.000Z'),
      passwordSetupRequired: false,
      userStatus: UserStatus.ACTIVE,
    });

    await expectAppError(
      harness.service.resendSetup(superAdminViewer, requestId),
      {
        status: 409,
        code: 'REGISTRATION_SETUP_ALREADY_COMPLETED',
      },
    );
    expect(harness.authService.requestPasswordSetup).not.toHaveBeenCalled();
    expect(harness.claimTx.activityLog.create).not.toHaveBeenCalled();
  });

  it('refuses a resend when setup is no longer required', async () => {
    const harness = createResendService({ passwordSetupRequired: false });

    await expectAppError(
      harness.service.resendSetup(superAdminViewer, requestId),
      {
        status: 409,
        code: 'REGISTRATION_SETUP_ALREADY_COMPLETED',
      },
    );
  });

  it('refuses a resend for a registration that is not approved', async () => {
    const harness = createResendService({
      status: RegistrationRequestStatus.PENDING,
    });

    await expectAppError(
      harness.service.resendSetup(superAdminViewer, requestId),
      {
        status: 409,
        code: 'REGISTRATION_SETUP_ALREADY_COMPLETED',
      },
    );
  });

  it('refuses a resend when no approved account exists', async () => {
    const harness = createResendService({ userStatus: null });

    await expectAppError(
      harness.service.resendSetup(superAdminViewer, requestId),
      {
        status: 409,
        code: 'REGISTRATION_SETUP_ALREADY_COMPLETED',
      },
    );
  });

  it('returns not found for an unknown registration', async () => {
    const harness = createResendService({ missingRequest: true });

    await expectAppError(
      harness.service.resendSetup(superAdminViewer, requestId),
      {
        status: 404,
        code: 'REGISTRATION_REQUEST_NOT_FOUND',
      },
    );
  });
});

describe('RegistrationService public mail failures', () => {
  const requestId = '126dad59-f92d-43cb-8577-5cb742668953';

  function createPublicService(mailImplementation: () => Promise<void>) {
    const created = {
      id: 'req_cuid_public',
      publicId: requestId,
      name: 'Applicant',
      normalizedEmail: 'applicant@example.com',
    };

    const tx = {
      registrationRequest: {
        create: jestApi.fn().mockResolvedValue(created),
      },
      user: {
        findMany: jestApi.fn().mockResolvedValue([{ id: 'super-admin-id' }]),
      },
      notification: {
        createMany: jestApi.fn().mockResolvedValue({ count: 1 }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'act_public' }),
      },
    };

    const prisma = {
      registrationThrottleBucket: {
        upsert: jestApi.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: jestApi.fn().mockResolvedValue(null) },
      registrationRequest: { findFirst: jestApi.fn().mockResolvedValue(null) },
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };

    const mailService = {
      sendRegistrationReceivedEmail: jestApi.fn(mailImplementation),
    };

    const service = new RegistrationService(
      prisma as never,
      new ConfigService({
        registration: {
          rateLimitSecret:
            'registration-rate-limit-secret-at-least-32-characters',
          cronSecret: 'cron-secret-at-least-32-characters-long',
        },
      }) as never,
      mailService as unknown as MailService,
      {} as never,
      {} as never,
      { cleanupExpired: jestApi.fn().mockResolvedValue(0) } as never,
    );

    return { service, mailService, tx };
  }

  it('awaits the received email before answering the anonymous caller', async () => {
    let releaseSend: () => void = () => undefined;
    const pendingSend = new Promise<void>((resolve) => {
      releaseSend = resolve;
    });
    const harness = createPublicService(() => pendingSend);

    let settled = false;
    const request = harness.service
      .createPublicRequest(
        { name: 'Applicant', email: 'applicant@example.com' },
        '203.0.113.10',
      )
      .then((value) => {
        settled = true;
        return value;
      });

    for (let index = 0; index < 10; index += 1) {
      await Promise.resolve();
    }
    expect(settled).toBe(false);

    releaseSend();
    await expect(request).resolves.toEqual(REGISTRATION_GENERIC_RESPONSE);
  });

  it('still returns the generic response when the received email fails', async () => {
    const harness = createPublicService(() =>
      Promise.reject(new Error('smtp unavailable')),
    );

    await expect(
      harness.service.createPublicRequest(
        { name: 'Applicant', email: 'applicant@example.com' },
        '203.0.113.10',
      ),
    ).resolves.toEqual(REGISTRATION_GENERIC_RESPONSE);
    expect(harness.tx.registrationRequest.create).toHaveBeenCalledTimes(1);
  });
});

describe('RegistrationService rejection mail failures', () => {
  const requestId = '126dad59-f92d-43cb-8577-5cb742668953';
  const internalRequestId = 'req_cuid_reject';

  const rejectedRecord = {
    id: internalRequestId,
    publicId: requestId,
    name: 'Applicant',
    normalizedEmail: 'applicant@example.com',
    status: RegistrationRequestStatus.REJECTED,
    selectedRole: null,
    selectedEmployeeId: null,
    selectedDesignation: null,
    selectedTeam: null,
    reviewer: null,
    rejectionReason: null,
    reviewedAt: new Date('2026-09-01T00:00:00.000Z'),
    approvedAt: null,
    passwordConfiguredAt: null,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  };

  it('keeps the rejection committed when the rejection email fails', async () => {
    const tx = {
      registrationRequest: {
        findUnique: jestApi.fn().mockResolvedValue({
          id: internalRequestId,
          status: RegistrationRequestStatus.PENDING,
          name: 'Applicant',
          normalizedEmail: 'applicant@example.com',
        }),
        update: jestApi.fn().mockResolvedValue(rejectedRecord),
      },
      notification: {
        updateMany: jestApi.fn().mockResolvedValue({ count: 1 }),
      },
      activityLog: {
        create: jestApi.fn().mockResolvedValue({ id: 'act_reject' }),
      },
    };
    const prisma = {
      $transaction: jestApi.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const mailService = {
      sendRegistrationRejectedEmail: jestApi
        .fn()
        .mockRejectedValue(new Error('smtp unavailable')),
    };

    const service = new RegistrationService(
      prisma as never,
      new ConfigService({
        registration: {
          rateLimitSecret:
            'registration-rate-limit-secret-at-least-32-characters',
          cronSecret: 'cron-secret-at-least-32-characters-long',
        },
      }) as never,
      mailService as unknown as MailService,
      {} as never,
      {} as never,
      { cleanupExpired: jestApi.fn().mockResolvedValue(0) } as never,
    );

    const result = await service.reject(superAdminViewer, requestId, {
      reason: 'Registration request rejected by administrator.',
    });

    expect(result.status).toBe(RegistrationRequestStatus.REJECTED);
    expect(mailService.sendRegistrationRejectedEmail).toHaveBeenCalledTimes(1);
    expect(tx.registrationRequest.update).toHaveBeenCalledTimes(1);
    expect(tx.notification.updateMany).toHaveBeenCalledWith({
      where: {
        targetType: 'REGISTRATION_REQUEST',
        targetId: internalRequestId,
        resolvedAt: null,
      },
      data: {
        resolvedAt: expect.any(Date) as Date,
        resolution: RegistrationRequestStatus.REJECTED,
      },
    });
  });
});
