import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from '../../../../generated/prisma/client';
import {
  RegistrationRequestStatus,
  UserRole,
} from '../../../../generated/prisma/enums';
import { mapNotificationResponse } from '../../../../src/modules/notification/notification.mapper';
import { notificationSelect } from '../../../../src/modules/notification/notification.select';
import { getTestDatabaseUrl } from '../../../support/database/test-database-url';

const MIGRATION_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../prisma/migrations/20261118120000_add_notification_resolution/migration.sql',
);

interface BackfillFixture {
  approvedRequestId: string;
  rejectedRequestId: string;
  pendingRequestId: string;
  receiverId: string;
  approvedNotificationPublicId: string;
  rejectedNotificationPublicId: string;
  pendingNotificationPublicId: string;
  approvedAt: Date;
  rejectedAt: Date;
}

describe('notification resolution backfill', () => {
  let pool: Pool | undefined;
  let prisma: PrismaClient | undefined;
  let fixture: BackfillFixture | undefined;

  beforeAll(() => {
    const testPool = new Pool({ connectionString: getTestDatabaseUrl() });
    pool = testPool;
    prisma = new PrismaClient({ adapter: new PrismaPg(testPool) });
  });

  beforeEach(async () => {
    const client = getPrismaClient(prisma);
    const prefix = `notification-backfill-${randomUUID()}`;
    const receiverId = `${prefix}-receiver`;
    const approvedRequestId = `${prefix}-approved`;
    const rejectedRequestId = `${prefix}-rejected`;
    const pendingRequestId = `${prefix}-pending`;
    const approvedAt = new Date('2026-09-04T08:15:00.000Z');
    const rejectedAt = new Date('2026-09-11T13:45:00.000Z');

    await client.user.create({
      data: {
        id: receiverId,
        name: 'Notification Backfill Receiver',
        email: `${receiverId}@operix.test`,
        role: UserRole.SUPER_ADMIN,
      },
    });

    await client.registrationRequest.createMany({
      data: [
        {
          id: approvedRequestId,
          name: 'Historical Approved Applicant',
          normalizedEmail: `${prefix}-approved@operix.test`,
          status: RegistrationRequestStatus.APPROVED,
          reviewedAt: approvedAt,
          approvedAt,
        },
        {
          id: rejectedRequestId,
          name: 'Historical Rejected Applicant',
          normalizedEmail: `${prefix}-rejected@operix.test`,
          status: RegistrationRequestStatus.REJECTED,
          reviewedAt: rejectedAt,
          rejectedAt,
        },
        {
          id: pendingRequestId,
          name: 'Still Pending Applicant',
          normalizedEmail: `${prefix}-pending@operix.test`,
          status: RegistrationRequestStatus.PENDING,
        },
      ],
    });

    const notificationData = (requestId: string, description: string) => ({
      receiverId,
      type: 'REGISTRATION_REQUESTED',
      title: 'New registration request',
      body: `${description} submitted an access request.`,
      targetType: 'REGISTRATION_REQUEST',
      targetId: requestId,
      targetPublicId: randomUUID(),
    });

    const [approvedNotification, rejectedNotification, pendingNotification] =
      await Promise.all([
        client.notification.create({
          data: notificationData(approvedRequestId, 'Approved applicant'),
        }),
        client.notification.create({
          data: notificationData(rejectedRequestId, 'Rejected applicant'),
        }),
        client.notification.create({
          data: notificationData(pendingRequestId, 'Pending applicant'),
        }),
      ]);

    fixture = {
      approvedRequestId,
      rejectedRequestId,
      pendingRequestId,
      receiverId,
      approvedNotificationPublicId: approvedNotification.publicId,
      rejectedNotificationPublicId: rejectedNotification.publicId,
      pendingNotificationPublicId: pendingNotification.publicId,
      approvedAt,
      rejectedAt,
    };
  });

  afterEach(async () => {
    if (!prisma || !fixture) return;

    await prisma.notification.deleteMany({
      where: { receiverId: fixture.receiverId },
    });
    await prisma.registrationRequest.deleteMany({
      where: {
        id: {
          in: [
            fixture.approvedRequestId,
            fixture.rejectedRequestId,
            fixture.pendingRequestId,
          ],
        },
      },
    });
    await prisma.user.delete({ where: { id: fixture.receiverId } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  it('backfills historical approvals and rejections with their real decision time', async () => {
    const client = getPrismaClient(prisma);
    const testFixture = getFixture(fixture);

    const updated = await client.$executeRawUnsafe(loadBackfillStatement());
    expect(updated).toEqual(expect.any(Number));

    const rows = await client.notification.findMany({
      where: { receiverId: testFixture.receiverId },
      select: notificationSelect,
    });
    const byId = new Map(rows.map((row) => [row.publicId, row]));

    const approved = byId.get(testFixture.approvedNotificationPublicId);
    const rejected = byId.get(testFixture.rejectedNotificationPublicId);
    const pending = byId.get(testFixture.pendingNotificationPublicId);

    // The backfill must preserve the decision timestamp, not the migration time.
    expect(approved?.resolvedAt?.getTime()).toBe(
      testFixture.approvedAt.getTime(),
    );
    expect(approved?.resolution).toBe(RegistrationRequestStatus.APPROVED);
    expect(rejected?.resolvedAt?.getTime()).toBe(
      testFixture.rejectedAt.getTime(),
    );
    expect(rejected?.resolution).toBe(RegistrationRequestStatus.REJECTED);

    // Still-pending work stays actionable.
    expect(pending?.resolvedAt).toBeNull();

    // Resolution never implies the receiver read the notification.
    expect(approved?.readAt).toBeNull();
    expect(
      approved ? mapNotificationResponse(approved).actionState : null,
    ).toBe('RESOLVED');
    expect(pending ? mapNotificationResponse(pending).actionState : null).toBe(
      'ACTIONABLE',
    );
  });
});

/**
 * Runs the exact backfill statement from the shipped migration so the test
 * cannot drift from what a real deployment executes.
 */
function loadBackfillStatement(): string {
  const sql = readFileSync(MIGRATION_PATH, 'utf8');
  const start = sql.indexOf('UPDATE "notification"');

  if (start === -1) {
    throw new Error(
      'Notification resolution migration no longer contains a backfill UPDATE.',
    );
  }

  return sql.slice(start).trim();
}

function getPrismaClient(prismaClient: PrismaClient | undefined): PrismaClient {
  if (!prismaClient) {
    throw new Error('Prisma test client was not initialized');
  }

  return prismaClient;
}

function getFixture(
  backfillFixture: BackfillFixture | undefined,
): BackfillFixture {
  if (!backfillFixture) {
    throw new Error('Notification backfill fixture was not initialized');
  }

  return backfillFixture;
}
