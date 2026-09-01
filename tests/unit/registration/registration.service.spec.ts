import { ConfigService } from '@nestjs/config';
import { RegistrationRequestStatus } from '../../../generated/prisma/enums';
import { RegistrationService } from '../../../src/modules/registration/registration.service';
import { REGISTRATION_GENERIC_RESPONSE } from '../../../src/modules/registration/registration.constant';

const jestApi = import.meta.jest;

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
