import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { UserRole, UserStatus } from '../../../../generated/prisma/enums';
import { PrismaService } from '../../../../src/database/prisma.service';
import { createOperixSeedAuth } from '../../../../src/modules/auth/auth.factory';
import { TEAM_ERROR_CODE } from '../../../../src/modules/team/team.constant';
import { USER_MANAGEMENT_ERROR_CODE } from '../../../../src/modules/user-management/user-management.constant';
import { APP_ERROR_CODE } from '../../../../src/shared/errors/app-error-code.constant';
import { getTestDatabaseUrl } from '../../../support/database/test-database-url';
import { createTestApplication } from '../../../support/server/create-test-application';

describe('User and Team management integration', () => {
  let app: NestExpressApplication | undefined;
  let prisma: PrismaService | undefined;
  let superAdminAgent: ReturnType<typeof request.agent> | undefined;
  let adminAAgent: ReturnType<typeof request.agent> | undefined;
  let adminBAgent: ReturnType<typeof request.agent> | undefined;
  let memberAgent: ReturnType<typeof request.agent> | undefined;
  const runId = randomUUID();
  const password = 'integration-password';
  const emails = {
    superAdmin: `chief-${runId}@operix.test`,
    adminA: `admin-a-${runId}@operix.test`,
    adminB: `admin-b-${runId}@operix.test`,
    memberA: `member-a-${runId}@operix.test`,
    memberB: `member-b-${runId}@operix.test`,
  };
  const ids = {
    adminA: '',
    adminB: '',
    memberA: '',
    memberB: '',
    teamA: '',
    teamB: '',
  };

  beforeAll(async () => {
    const databaseUrl = getTestDatabaseUrl();
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = databaseUrl;
    process.env.FRONTEND_URL = 'http://localhost:3001';
    process.env.SWAGGER_ENABLED = 'false';
    process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-auth';
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';

    prisma = new PrismaService(
      new ConfigService({
        database: {
          url: databaseUrl,
        },
      }),
    );

    const seedAuth = createOperixSeedAuth({
      prisma,
      baseUrl: process.env.BETTER_AUTH_URL,
      secret: process.env.BETTER_AUTH_SECRET,
    });

    await seedAuth.api.signUpEmail({
      body: {
        email: emails.superAdmin,
        password,
        name: 'Integration Chief',
      },
    });

    await prisma.user.update({
      where: {
        email: emails.superAdmin,
      },
      data: {
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    app = await createTestApplication();
    superAdminAgent = await signIn(emails.superAdmin);
  });

  afterAll(async () => {
    await app?.close();

    if (prisma) {
      await prisma.teamMember.deleteMany({
        where: {
          OR: [{ memberId: ids.memberA }, { memberId: ids.memberB }],
        },
      });
      await prisma.team.deleteMany({
        where: {
          OR: [{ id: ids.teamA }, { id: ids.teamB }],
        },
      });
      await prisma.user.deleteMany({
        where: {
          email: {
            in: Object.values(emails),
          },
        },
      });
      await prisma.onModuleDestroy();
    }
  });

  it('protects management routes through real guard dependency injection', async () => {
    await request(getApp().getHttpServer())
      .get('/api/v1/members')
      .expect(401)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: APP_ERROR_CODE.AUTH_REQUIRED,
        });
      });
  });

  it('lets Super Admin create Admins, Members, Teams, and assignments', async () => {
    const chief = getSuperAdminAgent();

    ids.adminA = extractId(
      await chief
        .post('/api/v1/admins')
        .send({
          name: 'Admin A',
          email: emails.adminA,
          initialPassword: password,
          employeeId: `ADM-A-${runId}`,
          designation: 'Admin',
        })
        .expect(201),
    );
    ids.adminB = extractId(
      await chief
        .post('/api/v1/admins')
        .send({
          name: 'Admin B',
          email: emails.adminB,
          initialPassword: password,
          employeeId: `ADM-B-${runId}`,
          designation: 'Admin',
        })
        .expect(201),
    );
    ids.memberA = extractId(
      await chief
        .post('/api/v1/members')
        .send({
          name: 'Member A',
          email: emails.memberA,
          initialPassword: password,
          employeeId: `MEM-A-${runId}`,
          designation: 'Member',
        })
        .expect(201),
    );
    ids.memberB = extractId(
      await chief
        .post('/api/v1/members')
        .send({
          name: 'Member B',
          email: emails.memberB,
          initialPassword: password,
          employeeId: `MEM-B-${runId}`,
          designation: 'Member',
        })
        .expect(201),
    );

    ids.teamA = extractId(
      await chief
        .post('/api/v1/teams')
        .send({
          name: 'Team A',
          adminId: ids.adminA,
        })
        .expect(201),
    );
    ids.teamB = extractId(
      await chief
        .post('/api/v1/teams')
        .send({
          name: 'Team B',
          adminId: ids.adminB,
        })
        .expect(201),
    );

    await chief
      .post(`/api/v1/teams/${ids.teamA}/members`)
      .send({ memberId: ids.memberA })
      .expect(201);
    await chief
      .post(`/api/v1/teams/${ids.teamB}/members`)
      .send({ memberId: ids.memberB })
      .expect(201);

    adminAAgent = await signIn(emails.adminA);
    adminBAgent = await signIn(emails.adminB);
    memberAgent = await signIn(emails.memberA);
  });

  it('enforces Admin member scope with privacy safe 404 responses', async () => {
    const adminA = getAdminAAgent();
    const adminB = getAdminBAgent();

    await adminA
      .get('/api/v1/members')
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          data: { id: string }[];
        };
        expect(body.data.map((member) => member.id)).toContain(ids.memberA);
        expect(body.data.map((member) => member.id)).not.toContain(ids.memberB);
      });

    await adminB
      .get('/api/v1/members')
      .expect(200)
      .expect((response) => {
        const body = response.body as {
          data: { id: string }[];
        };
        expect(body.data.map((member) => member.id)).toContain(ids.memberB);
        expect(body.data.map((member) => member.id)).not.toContain(ids.memberA);
      });

    await adminA
      .get(`/api/v1/members/${ids.memberB}`)
      .expect(404)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: USER_MANAGEMENT_ERROR_CODE.MEMBER_NOT_FOUND,
        });
      });
  });

  it('blocks disallowed management actions for Admins and Members', async () => {
    await getAdminAAgent()
      .post('/api/v1/members')
      .send({
        name: 'Forbidden Member',
        email: `forbidden-${runId}@operix.test`,
        initialPassword: password,
      })
      .expect(403);

    await getAdminAAgent()
      .patch(`/api/v1/members/${ids.memberA}/status`)
      .send({ status: UserStatus.SUSPENDED })
      .expect(403);

    await getMemberAgent().get('/api/v1/members').expect(403);
  });

  it('updates visibility after transfer and Team Admin reassignment', async () => {
    const chief = getSuperAdminAgent();

    await chief
      .post(`/api/v1/members/${ids.memberA}/transfer`)
      .send({ targetTeamId: ids.teamB })
      .expect(201);

    await getAdminAAgent().get(`/api/v1/members/${ids.memberA}`).expect(404);
    await getAdminBAgent().get(`/api/v1/members/${ids.memberA}`).expect(200);

    await chief
      .post(`/api/v1/teams/${ids.teamA}/reassign-admin`)
      .send({ adminId: ids.adminB })
      .expect(201);

    await getAdminAAgent().get(`/api/v1/teams/${ids.teamA}`).expect(404);
    await getAdminBAgent().get(`/api/v1/teams/${ids.teamA}`).expect(200);
  });

  it('blocks suspending Admins with owned Teams and blocks inactive Admin access', async () => {
    const chief = getSuperAdminAgent();

    await chief
      .patch(`/api/v1/admins/${ids.adminB}/status`)
      .send({ status: UserStatus.SUSPENDED })
      .expect(409)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: USER_MANAGEMENT_ERROR_CODE.ADMIN_HAS_ASSIGNED_TEAMS,
        });
      });

    await prismaOrThrow().user.update({
      where: {
        id: ids.adminA,
      },
      data: {
        status: UserStatus.INACTIVE,
      },
    });

    await getAdminAAgent()
      .get('/api/v1/members')
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: APP_ERROR_CODE.ACCOUNT_INACTIVE,
        });
      });
  });

  it('creates responsibility activity and notification rows', async () => {
    const prismaClient = prismaOrThrow();

    const activityCount = await prismaClient.activityLog.count({
      where: {
        action: {
          in: [
            'MEMBER_ASSIGNED_TO_TEAM',
            'MEMBER_TRANSFERRED',
            'TEAM_ADMIN_REASSIGNED',
          ],
        },
      },
    });
    const notificationCount = await prismaClient.notification.count({
      where: {
        type: {
          in: [
            'MEMBER_ASSIGNED_TO_TEAM',
            'MEMBER_TRANSFERRED',
            'TEAM_ADMIN_REASSIGNED',
          ],
        },
      },
    });

    expect(activityCount).toBeGreaterThanOrEqual(3);
    expect(notificationCount).toBeGreaterThanOrEqual(3);
  });

  it('prevents concurrent suspend and Team creation from producing a suspended Team owner', async () => {
    const chief = getSuperAdminAgent();
    const adminEmail = `race-admin-${runId}@operix.test`;
    const adminId = extractId(
      await chief
        .post('/api/v1/admins')
        .send({
          name: 'Race Admin',
          email: adminEmail,
          initialPassword: password,
          employeeId: `RACE-ADM-${runId}`,
          designation: 'Race Admin',
        })
        .expect(201),
    );

    const [statusResult, teamResult] = await Promise.allSettled([
      chief
        .patch(`/api/v1/admins/${adminId}/status`)
        .send({ status: UserStatus.SUSPENDED }),
      chief.post('/api/v1/teams').send({
        name: 'Race Team',
        adminId,
      }),
    ]);

    expect(statusResult.status).toBe('fulfilled');
    expect(teamResult.status).toBe('fulfilled');

    const suspendedOwnedTeamCount = await prismaOrThrow().team.count({
      where: {
        adminId,
        admin: {
          status: UserStatus.SUSPENDED,
        },
      },
    });

    expect(suspendedOwnedTeamCount).toBe(0);
  });

  it('maps concurrent Member assignment to one success and one controlled conflict', async () => {
    const chief = getSuperAdminAgent();
    const memberId = extractId(
      await chief
        .post('/api/v1/members')
        .send({
          name: 'Race Member',
          email: `race-member-${runId}@operix.test`,
          initialPassword: password,
          employeeId: `RACE-MEM-${runId}`,
          designation: 'Race Member',
        })
        .expect(201),
    );
    const teamCId = extractId(
      await chief
        .post('/api/v1/teams')
        .send({
          name: 'Race Team C',
          adminId: ids.adminB,
        })
        .expect(201),
    );
    const teamDId = extractId(
      await chief
        .post('/api/v1/teams')
        .send({
          name: 'Race Team D',
          adminId: ids.adminB,
        })
        .expect(201),
    );

    const responses = await Promise.all([
      chief.post(`/api/v1/teams/${teamCId}/members`).send({ memberId }),
      chief.post(`/api/v1/teams/${teamDId}/members`).send({ memberId }),
    ]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([201, 409]);
    expect(
      responses.some(
        (response) =>
          response.status === 409 &&
          (response.body as { code?: unknown }).code ===
            TEAM_ERROR_CODE.MEMBER_ALREADY_ASSIGNED,
      ),
    ).toBe(true);

    const membershipCount = await prismaOrThrow().teamMember.count({
      where: {
        memberId,
      },
    });

    expect(membershipCount).toBe(1);
  });

  async function signIn(
    email: string,
  ): Promise<ReturnType<typeof request.agent>> {
    const agent = request.agent(getApp().getHttpServer());
    await agent
      .post('/api/v1/auth/sign-in/email')
      .send({
        email,
        password,
      })
      .expect(200);

    return agent;
  }

  function getApp(): NestExpressApplication {
    if (!app) {
      throw new Error('Nest test application was not initialized');
    }

    return app;
  }

  function prismaOrThrow(): PrismaService {
    if (!prisma) {
      throw new Error('Prisma test client was not initialized');
    }

    return prisma;
  }

  function getSuperAdminAgent(): ReturnType<typeof request.agent> {
    if (!superAdminAgent) {
      throw new Error('Super Admin agent was not initialized');
    }

    return superAdminAgent;
  }

  function getAdminAAgent(): ReturnType<typeof request.agent> {
    if (!adminAAgent) {
      throw new Error('Admin A agent was not initialized');
    }

    return adminAAgent;
  }

  function getAdminBAgent(): ReturnType<typeof request.agent> {
    if (!adminBAgent) {
      throw new Error('Admin B agent was not initialized');
    }

    return adminBAgent;
  }

  function getMemberAgent(): ReturnType<typeof request.agent> {
    if (!memberAgent) {
      throw new Error('Member agent was not initialized');
    }

    return memberAgent;
  }
});

function extractId(response: request.Response): string {
  const body = response.body as { id?: unknown };

  if (typeof body.id !== 'string') {
    throw new Error('Expected response body to contain an id string');
  }

  return body.id;
}
