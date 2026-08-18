import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from '../../../../src/generated/prisma/client';
import {
  TaskPriority,
  TaskStatus,
  UserRole,
} from '../../../../src/generated/prisma/enums';
import { getTestDatabaseUrl } from '../../../support/database/test-database-url';

interface AssignmentFixture {
  adminId: string;
  memberOneId: string;
  memberTwoId: string;
  taskOneId: string;
  taskTwoId: string;
  teamId: string;
}

describe('TaskAssignment active assignment integrity', () => {
  let pool: Pool | undefined;
  let prisma: PrismaClient | undefined;
  let fixture: AssignmentFixture | undefined;

  beforeAll(() => {
    const testPool = new Pool({
      connectionString: getTestDatabaseUrl(),
    });
    pool = testPool;

    prisma = new PrismaClient({
      adapter: new PrismaPg(testPool),
    });
  });

  beforeEach(async () => {
    if (!prisma) {
      throw new Error('Prisma test client was not initialized');
    }

    fixture = await createAssignmentFixture(prisma);
  });

  afterEach(async () => {
    if (!prisma || !fixture) {
      return;
    }

    await prisma.taskAssignment.deleteMany({
      where: {
        taskId: {
          in: [fixture.taskOneId, fixture.taskTwoId],
        },
      },
    });
    await prisma.task.deleteMany({
      where: {
        id: {
          in: [fixture.taskOneId, fixture.taskTwoId],
        },
      },
    });
    await prisma.team.delete({
      where: {
        id: fixture.teamId,
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [fixture.adminId, fixture.memberOneId, fixture.memberTwoId],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  it('allows one active assignment for a task', async () => {
    const prismaClient = getPrismaClient(prisma);
    const testFixture = getAssignmentFixture(fixture);

    await expect(
      createAssignment(prismaClient, {
        taskId: testFixture.taskOneId,
        memberId: testFixture.memberOneId,
        assignedById: testFixture.adminId,
      }),
    ).resolves.toMatchObject({
      taskId: testFixture.taskOneId,
      memberId: testFixture.memberOneId,
      unassignedAt: null,
    });
  });

  it('rejects two active assignments for the same task', async () => {
    const prismaClient = getPrismaClient(prisma);
    const testFixture = getAssignmentFixture(fixture);

    await createAssignment(prismaClient, {
      taskId: testFixture.taskOneId,
      memberId: testFixture.memberOneId,
      assignedById: testFixture.adminId,
    });

    await expect(
      createAssignment(prismaClient, {
        taskId: testFixture.taskOneId,
        memberId: testFixture.memberTwoId,
        assignedById: testFixture.adminId,
      }),
    ).rejects.toThrow();
  });

  it('allows one historical assignment plus one active assignment for the same task', async () => {
    const prismaClient = getPrismaClient(prisma);
    const testFixture = getAssignmentFixture(fixture);

    await createAssignment(prismaClient, {
      taskId: testFixture.taskOneId,
      memberId: testFixture.memberOneId,
      assignedById: testFixture.adminId,
      unassignedAt: new Date('2026-08-17T00:00:00.000Z'),
    });

    await expect(
      createAssignment(prismaClient, {
        taskId: testFixture.taskOneId,
        memberId: testFixture.memberTwoId,
        assignedById: testFixture.adminId,
      }),
    ).resolves.toMatchObject({
      taskId: testFixture.taskOneId,
      memberId: testFixture.memberTwoId,
      unassignedAt: null,
    });
  });

  it('allows multiple historical assignments plus one active assignment for the same task', async () => {
    const prismaClient = getPrismaClient(prisma);
    const testFixture = getAssignmentFixture(fixture);

    await createAssignment(prismaClient, {
      taskId: testFixture.taskOneId,
      memberId: testFixture.memberOneId,
      assignedById: testFixture.adminId,
      unassignedAt: new Date('2026-08-16T00:00:00.000Z'),
    });
    await createAssignment(prismaClient, {
      taskId: testFixture.taskOneId,
      memberId: testFixture.memberTwoId,
      assignedById: testFixture.adminId,
      unassignedAt: new Date('2026-08-17T00:00:00.000Z'),
    });

    await expect(
      createAssignment(prismaClient, {
        taskId: testFixture.taskOneId,
        memberId: testFixture.memberOneId,
        assignedById: testFixture.adminId,
      }),
    ).resolves.toMatchObject({
      taskId: testFixture.taskOneId,
      unassignedAt: null,
    });
  });

  it('allows different tasks to each have one active assignment', async () => {
    const prismaClient = getPrismaClient(prisma);
    const testFixture = getAssignmentFixture(fixture);

    await createAssignment(prismaClient, {
      taskId: testFixture.taskOneId,
      memberId: testFixture.memberOneId,
      assignedById: testFixture.adminId,
    });

    await expect(
      createAssignment(prismaClient, {
        taskId: testFixture.taskTwoId,
        memberId: testFixture.memberTwoId,
        assignedById: testFixture.adminId,
      }),
    ).resolves.toMatchObject({
      taskId: testFixture.taskTwoId,
      memberId: testFixture.memberTwoId,
      unassignedAt: null,
    });
  });

  it('returns no more than one active assignment when queried by task', async () => {
    const prismaClient = getPrismaClient(prisma);
    const testFixture = getAssignmentFixture(fixture);

    await createAssignment(prismaClient, {
      taskId: testFixture.taskOneId,
      memberId: testFixture.memberOneId,
      assignedById: testFixture.adminId,
    });

    const activeAssignments = await prismaClient.taskAssignment.findMany({
      where: {
        taskId: testFixture.taskOneId,
        unassignedAt: null,
      },
    });

    expect(activeAssignments).toHaveLength(1);
    expect(activeAssignments.length).toBeLessThanOrEqual(1);
  });
});

function getPrismaClient(prismaClient: PrismaClient | undefined): PrismaClient {
  if (!prismaClient) {
    throw new Error('Prisma test client was not initialized');
  }

  return prismaClient;
}

function getAssignmentFixture(
  assignmentFixture: AssignmentFixture | undefined,
): AssignmentFixture {
  if (!assignmentFixture) {
    throw new Error('Assignment fixture was not initialized');
  }

  return assignmentFixture;
}

async function createAssignmentFixture(
  prismaClient: PrismaClient,
): Promise<AssignmentFixture> {
  const idPrefix = `assignment-integrity-${randomUUID()}`;
  const adminId = `${idPrefix}-admin`;
  const memberOneId = `${idPrefix}-member-1`;
  const memberTwoId = `${idPrefix}-member-2`;
  const teamId = `${idPrefix}-team`;
  const taskOneId = `${idPrefix}-task-1`;
  const taskTwoId = `${idPrefix}-task-2`;

  await prismaClient.user.createMany({
    data: [
      {
        id: adminId,
        name: 'Assignment Integrity Admin',
        email: `${adminId}@operix.test`,
        role: UserRole.ADMIN,
      },
      {
        id: memberOneId,
        name: 'Assignment Integrity Member One',
        email: `${memberOneId}@operix.test`,
        role: UserRole.MEMBER,
      },
      {
        id: memberTwoId,
        name: 'Assignment Integrity Member Two',
        email: `${memberTwoId}@operix.test`,
        role: UserRole.MEMBER,
      },
    ],
  });

  await prismaClient.team.create({
    data: {
      id: teamId,
      name: 'Assignment Integrity Team',
      adminId,
    },
  });

  await prismaClient.task.createMany({
    data: [
      {
        id: taskOneId,
        referenceCode: `${idPrefix}-task-1`,
        title: 'Assignment Integrity Task One',
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.ASSIGNED,
        teamId,
        createdById: adminId,
      },
      {
        id: taskTwoId,
        referenceCode: `${idPrefix}-task-2`,
        title: 'Assignment Integrity Task Two',
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.ASSIGNED,
        teamId,
        createdById: adminId,
      },
    ],
  });

  return {
    adminId,
    memberOneId,
    memberTwoId,
    taskOneId,
    taskTwoId,
    teamId,
  };
}

function createAssignment(
  prismaClient: PrismaClient,
  input: {
    taskId: string;
    memberId: string;
    assignedById: string;
    unassignedAt?: Date;
  },
) {
  return prismaClient.taskAssignment.create({
    data: {
      taskId: input.taskId,
      memberId: input.memberId,
      assignedById: input.assignedById,
      ...(input.unassignedAt ? { unassignedAt: input.unassignedAt } : {}),
    },
  });
}
