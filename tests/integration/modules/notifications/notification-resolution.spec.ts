import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from '../../../../generated/prisma/client';
import {
  RegistrationRequestStatus,
  UserRole,
} from '../../../../generated/prisma/enums';
import { mapNotificationResponse } from '../../../../src/modules/notification/notification.mapper';
import { notificationSelect } from '../../../../src/modules/notification/notification.select';
import { resolveNotifications } from '../../../../src/shared/notification/notification-resolution';
import { getTestDatabaseUrl } from '../../../support/database/test-database-url';

interface ResolutionFixture {
  receiverId: string;
  resolvedRequestId: string;
  otherRequestId: string;
  unresolvedNotificationPublicId: string;
  alreadyResolvedNotificationPublicId: string;
  otherTargetNotificationPublicId: string;
}

describe('notification resolution', () => {
  let pool: Pool | undefined;
  let prisma: PrismaClient | undefined;
  let fixture: ResolutionFixture | undefined;

  beforeAll(() => {
    const testPool = new Pool({ connectionString: getTestDatabaseUrl() });
    pool = testPool;
    prisma = new PrismaClient({ adapter: new PrismaPg(testPool) });
  });

  beforeEach(async () => {
    const client = getPrismaClient(prisma);
    const prefix = `notification-resolution-${randomUUID()}`;
    const receiverId = `${prefix}-receiver`;
    const resolvedRequestId = `${prefix}-request-a`;
    const otherRequestId = `${prefix}-request-b`;

    await client.user.create({
      data: {
        id: receiverId,
        name: 'Notification Resolution Receiver',
        email: `${receiverId}@operix.test`,
        role: UserRole.SUPER_ADMIN,
      },
    });

    await client.registrationRequest.createMany({
      data: [
        {
          id: resolvedRequestId,
          name: 'Applicant A',
          normalizedEmail: `${prefix}-a@operix.test`,
          status: RegistrationRequestStatus.APPROVED,
        },
        {
          id: otherRequestId,
          name: 'Applicant B',
          normalizedEmail: `${prefix}-b@operix.test`,
          status: RegistrationRequestStatus.PENDING,
        },
      ],
    });

    const [unresolved, alreadyResolved, otherTarget] = await Promise.all([
      client.notification.create({
        data: {
          receiverId,
          type: 'REGISTRATION_REQUESTED',
          title: 'New registration request',
          body: 'Applicant A submitted an access request.',
          targetType: 'REGISTRATION_REQUEST',
          targetId: resolvedRequestId,
          targetPublicId: randomUUID(),
        },
      }),
      client.notification.create({
        data: {
          receiverId,
          type: 'REGISTRATION_REQUESTED',
          title: 'Older registration request',
          body: 'Applicant A submitted an access request.',
          targetType: 'REGISTRATION_REQUEST',
          targetId: resolvedRequestId,
          targetPublicId: randomUUID(),
          resolvedAt: new Date('2026-11-10T10:00:00.000Z'),
          resolution: 'REJECTED',
        },
      }),
      client.notification.create({
        data: {
          receiverId,
          type: 'REGISTRATION_REQUESTED',
          title: 'Other registration request',
          body: 'Applicant B submitted an access request.',
          targetType: 'REGISTRATION_REQUEST',
          targetId: otherRequestId,
          targetPublicId: randomUUID(),
        },
      }),
    ]);

    fixture = {
      receiverId,
      resolvedRequestId,
      otherRequestId,
      unresolvedNotificationPublicId: unresolved.publicId,
      alreadyResolvedNotificationPublicId: alreadyResolved.publicId,
      otherTargetNotificationPublicId: otherTarget.publicId,
    };
  });

  afterEach(async () => {
    if (!prisma || !fixture) return;

    await prisma.notification.deleteMany({
      where: { receiverId: fixture.receiverId },
    });
    await prisma.registrationRequest.deleteMany({
      where: {
        id: { in: [fixture.resolvedRequestId, fixture.otherRequestId] },
      },
    });
    await prisma.user.delete({ where: { id: fixture.receiverId } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  it('resolves only unresolved notifications for the same target and ignores read state', async () => {
    const client = getPrismaClient(prisma);
    const testFixture = getFixture(fixture);

    const resolved = await resolveNotifications(client, {
      targetType: 'REGISTRATION_REQUEST',
      targetId: testFixture.resolvedRequestId,
      resolution: 'APPROVED',
      resolvedAt: new Date('2026-11-18T10:00:00.000Z'),
    });

    expect(resolved).toBe(1);

    const rows = await client.notification.findMany({
      where: { receiverId: testFixture.receiverId },
      select: notificationSelect,
    });
    const byId = new Map(rows.map((row) => [row.publicId, row]));

    const unresolvedRow = byId.get(testFixture.unresolvedNotificationPublicId);
    const alreadyResolvedRow = byId.get(
      testFixture.alreadyResolvedNotificationPublicId,
    );
    const otherTargetRow = byId.get(
      testFixture.otherTargetNotificationPublicId,
    );

    expect(unresolvedRow).toMatchObject({
      resolution: 'APPROVED',
      readAt: null,
    });
    // A second resolution pass must not overwrite the first outcome.
    expect(alreadyResolvedRow?.resolution).toBe('REJECTED');
    // A different target stays actionable.
    expect(otherTargetRow?.resolvedAt).toBeNull();

    expect(
      unresolvedRow ? mapNotificationResponse(unresolvedRow).actionState : null,
    ).toBe('RESOLVED');
    expect(
      unresolvedRow ? mapNotificationResponse(unresolvedRow).isRead : null,
    ).toBe(false);
  });

  it('is idempotent for a target that is already resolved', async () => {
    const client = getPrismaClient(prisma);
    const testFixture = getFixture(fixture);

    await resolveNotifications(client, {
      targetType: 'REGISTRATION_REQUEST',
      targetId: testFixture.resolvedRequestId,
      resolution: 'APPROVED',
    });
    const secondPass = await resolveNotifications(client, {
      targetType: 'REGISTRATION_REQUEST',
      targetId: testFixture.resolvedRequestId,
      resolution: 'APPROVED',
    });

    expect(secondPass).toBe(0);
  });
});

function getPrismaClient(prismaClient: PrismaClient | undefined): PrismaClient {
  if (!prismaClient) {
    throw new Error('Prisma test client was not initialized');
  }

  return prismaClient;
}

function getFixture(
  resolutionFixture: ResolutionFixture | undefined,
): ResolutionFixture {
  if (!resolutionFixture) {
    throw new Error('Notification resolution fixture was not initialized');
  }

  return resolutionFixture;
}
