import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  TaskPriority,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../../generated/prisma/enums';
import { AppModule } from '../../../../src/app.module';
import { configureApplication } from '../../../../src/app.setup';
import { PrismaService } from '../../../../src/database/prisma.service';
import { createOperixSeedAuth } from '../../../../src/modules/auth/auth.factory';
import type { TaskAssignmentAiResponse } from '../../../../src/modules/task/task-assignment-ai.interface';
import { AI_PROVIDER } from '../../../../src/shared/ai/ai.constant';
import type {
  AiGenerationRequest,
  AiProvider,
} from '../../../../src/shared/ai/ai.interface';
import { getTestDatabaseUrl } from '../../../support/database/test-database-url';

const jestApi: typeof jest = import.meta.jest as unknown as typeof jest;
const runId = randomUUID();
const password = 'integration-password';
const emails = {
  owner: `assignment-ai-owner-${runId}@operix.test`,
  otherAdmin: `assignment-ai-other-admin-${runId}@operix.test`,
  member: `assignment-ai-member-${runId}@operix.test`,
};

const providerResponse = JSON.stringify({
  summary: 'One eligible Member is available for manual assignment review.',
  decision: 'RECOMMEND',
  recommendations: [
    {
      candidateRef: 'C01',
      rationale: 'The supplied Operix metrics show no active or overdue Tasks.',
      strengths: ['No current overdue workload'],
      cautions: ['Availability is not modeled'],
    },
  ],
  confidence: 'MEDIUM',
  limitations: [],
});

describe('Task assignment AI recommendation integration', () => {
  jestApi.setTimeout(60_000);

  let app: NestExpressApplication | undefined;
  let prisma: PrismaService | undefined;
  let ownerCookie = '';
  let otherAdminCookie = '';
  let memberCookie = '';
  let taskPublicId = '';
  const userIds: string[] = [];
  const teamIds: string[] = [];
  const taskIds: string[] = [];
  const generate = jestApi.fn((input: AiGenerationRequest) => {
    void input;
    return Promise.resolve({
      text: providerResponse,
      model: 'integration-fake-model',
    });
  });
  const provider: AiProvider = { name: 'gemini', generate };

  beforeAll(async () => {
    const databaseUrl = getTestDatabaseUrl();
    configureTestEnvironment(databaseUrl);
    prisma = new PrismaService(
      new ConfigService({ database: { url: databaseUrl } }),
    );
    const seedAuth = createOperixSeedAuth({
      prisma,
      baseUrl: process.env.BETTER_AUTH_URL!,
      secret: process.env.BETTER_AUTH_SECRET!,
    });

    await Promise.all(
      Object.entries(emails).map(([key, email]) =>
        seedAuth.api.signUpEmail({
          body: { email, password, name: `Assignment AI ${key} ${runId}` },
        }),
      ),
    );
    const users = await prisma.user.findMany({
      where: { email: { in: Object.values(emails) } },
      select: { id: true, email: true },
    });
    const ownerId = userIdFor(users, emails.owner);
    const otherAdminId = userIdFor(users, emails.otherAdmin);
    const memberId = userIdFor(users, emails.member);
    userIds.push(ownerId, otherAdminId, memberId);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: ownerId },
        data: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      }),
      prisma.user.update({
        where: { id: otherAdminId },
        data: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      }),
      prisma.user.update({
        where: { id: memberId },
        data: { role: UserRole.MEMBER, status: UserStatus.ACTIVE },
      }),
    ]);

    const team = await prisma.team.create({
      data: { name: `Assignment AI Team ${runId}`, adminId: ownerId },
    });
    teamIds.push(team.id);
    await prisma.teamMember.create({ data: { teamId: team.id, memberId } });
    const task = await prisma.task.create({
      data: {
        referenceCode: `ASSIGN-AI-${runId}`,
        title: 'Verify assignment recommendation integration',
        priority: TaskPriority.HIGH,
        status: TaskStatus.PENDING,
        teamId: team.id,
        createdById: ownerId,
      },
      select: { id: true, publicId: true },
    });
    taskIds.push(task.id);
    taskPublicId = task.publicId;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_PROVIDER)
      .useValue(provider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    app.set('trust proxy', true);
    configureApplication(app);
    await app.init();

    ownerCookie = await signIn(emails.owner);
    otherAdminCookie = await signIn(emails.otherAdmin);
    memberCookie = await signIn(emails.member);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (!prisma) return;
    if (taskIds.length > 0) {
      await prisma.taskAssignment.deleteMany({
        where: { taskId: { in: taskIds } },
      });
      await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    }
    if (userIds.length > 0) {
      await prisma.teamMember.deleteMany({
        where: { memberId: { in: userIds } },
      });
    }
    if (teamIds.length > 0) {
      await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
    }
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.onModuleDestroy();
  }, 60_000);

  it('returns safe recommendations to the owner without mutating assignment state', async () => {
    const before = await prismaOrThrow().taskAssignment.count({
      where: { taskId: { in: taskIds } },
    });
    const response = await postAs(ownerCookie, '198.51.100.81').expect(201);
    const body = response.body as TaskAssignmentAiResponse;

    expect(body).toMatchObject({
      taskId: taskPublicId,
      decision: 'RECOMMEND',
      recommendations: [
        {
          rank: 1,
          member: { name: `Assignment AI member ${runId}` },
          metrics: { activeTasks: 0, overdueTasks: 0 },
        },
      ],
      meta: { provider: 'gemini', model: 'integration-fake-model' },
    });
    expect(JSON.stringify(body)).not.toContain('responsibleUserId');
    expect(
      await prismaOrThrow().taskAssignment.count({
        where: { taskId: { in: taskIds } },
      }),
    ).toBe(before);
  });

  it('rejects a non-owner Admin and Member before provider work', async () => {
    const callsBefore = generate.mock.calls.length;
    await postAs(otherAdminCookie, '198.51.100.82').expect(403);
    await postAs(memberCookie, '198.51.100.83').expect(403);
    expect(generate).toHaveBeenCalledTimes(callsBefore);
  });

  async function signIn(email: string): Promise<string> {
    const response = await request(getApp().getHttpServer())
      .post('/api/v1/auth/sign-in/email')
      .send({ email, password })
      .expect(200);
    const setCookie = response.headers['set-cookie'] as unknown;
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const cookie = cookies
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.split(';', 1)[0])
      .join('; ');
    if (!cookie) throw new Error('Expected an authenticated session cookie.');
    return cookie;
  }

  function postAs(cookie: string, address: string) {
    return request(getApp().getHttpServer())
      .post(`/api/v1/tasks/${taskPublicId}/ai-assignment-recommendations`)
      .set('Cookie', cookie)
      .set('X-Forwarded-For', address);
  }

  function getApp(): NestExpressApplication {
    if (!app) throw new Error('Nest test application was not initialized.');
    return app;
  }

  function prismaOrThrow(): PrismaService {
    if (!prisma) throw new Error('Prisma test client was not initialized.');
    return prisma;
  }
});

function configureTestEnvironment(databaseUrl: string): void {
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3000';
  process.env.DATABASE_URL = databaseUrl;
  process.env.FRONTEND_URL = 'http://localhost:3001';
  process.env.FRONTEND_APP_URL = 'http://localhost:3001';
  process.env.SWAGGER_ENABLED = 'false';
  process.env.SMTP_ENABLED = 'false';
  process.env.FILE_STORAGE_ENABLED = 'false';
  process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-auth';
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';
  process.env.REGISTRATION_RATE_LIMIT_SECRET =
    'integration-registration-secret';
  process.env.CRON_SECRET = 'integration-cron-secret-that-is-long-enough';
  process.env.API_RATE_LIMIT_SECRET =
    'integration-api-secret-that-is-long-enough';
  process.env.OPERIX_BUSINESS_TIMEZONE = 'Asia/Dhaka';
  process.env.AI_ENABLED = 'true';
  process.env.AI_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY = 'integration-gemini-key';
  process.env.GEMINI_MODEL = 'integration-fake-model';
  process.env.AI_TIMEOUT_MS = '30000';
}

function userIdFor(
  users: { id: string; email: string }[],
  email: string,
): string {
  const user = users.find((candidate) => candidate.email === email);
  if (!user) throw new Error(`Expected seeded integration user ${email}.`);
  return user.id;
}
