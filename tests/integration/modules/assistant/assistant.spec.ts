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
import type { AskOperixResponse } from '../../../../src/modules/assistant/assistant.interface';
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
  chief: `ask-chief-${runId}@operix.test`,
  admin: `ask-admin-${runId}@operix.test`,
  member: `ask-member-${runId}@operix.test`,
  outside: `ask-outside-${runId}@operix.test`,
};

describe('Ask Operix integration', () => {
  jestApi.setTimeout(60_000);
  let app: NestExpressApplication | undefined;
  let prisma: PrismaService | undefined;
  let chiefCookie = '';
  let adminCookie = '';
  let memberCookie = '';
  const userIds: string[] = [];
  const teamIds: string[] = [];
  const taskIds: string[] = [];

  const generate = jestApi.fn((input: AiGenerationRequest) => {
    if (input.systemInstruction.includes('classify one user question')) {
      const operations = input.userPrompt.includes('operations summary');
      return Promise.resolve({
        text: operations
          ? JSON.stringify({ intent: 'OPERATIONS_SNAPSHOT', days: 7 })
          : JSON.stringify({
              intent: 'TASK_QUERY',
              taskQuery: {
                status: null,
                priority: null,
                overdue: null,
                scope: null,
                recurrenceFrequency: null,
                text: null,
                sort: 'CREATED_AT_DESC',
                limit: 10,
              },
              responseMode: 'LIST',
            }),
        model: 'integration-fake-model',
      });
    }
    const refs = [...input.userPrompt.matchAll(/"taskRef": "(T\d{2})"/g)].map(
      (match) => match[1],
    );
    return Promise.resolve({
      text: JSON.stringify({
        answer: 'Authorized Operix facts are available.',
        highlights: [],
        referencedTaskRefs: refs,
        confidence: 'HIGH',
        limitations: [],
      }),
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
          body: { email, password, name: `Ask ${key} ${runId}` },
        }),
      ),
    );
    const users = await prisma.user.findMany({
      where: { email: { in: Object.values(emails) } },
      select: { id: true, email: true },
    });
    const chiefId = userIdFor(users, emails.chief);
    const adminId = userIdFor(users, emails.admin);
    const memberId = userIdFor(users, emails.member);
    const outsideId = userIdFor(users, emails.outside);
    userIds.push(chiefId, adminId, memberId, outsideId);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: chiefId },
        data: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE },
      }),
      prisma.user.update({
        where: { id: adminId },
        data: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      }),
      prisma.user.update({
        where: { id: memberId },
        data: { role: UserRole.MEMBER, status: UserStatus.ACTIVE },
      }),
      prisma.user.update({
        where: { id: outsideId },
        data: { role: UserRole.MEMBER, status: UserStatus.ACTIVE },
      }),
    ]);
    const [team, outsideTeam] = await Promise.all([
      prisma.team.create({ data: { name: `Ask Team ${runId}`, adminId } }),
      prisma.team.create({
        data: { name: `Ask Outside ${runId}`, adminId: chiefId },
      }),
    ]);
    teamIds.push(team.id, outsideTeam.id);
    await prisma.teamMember.createMany({
      data: [
        { teamId: team.id, memberId },
        { teamId: outsideTeam.id, memberId: outsideId },
      ],
    });
    const [scopedTask, outsideTask] = await Promise.all([
      prisma.task.create({
        data: {
          referenceCode: `ASK-SCOPED-${runId}`,
          title: `Scoped Task ${runId}`,
          priority: TaskPriority.HIGH,
          status: TaskStatus.ASSIGNED,
          teamId: team.id,
          createdById: adminId,
        },
      }),
      prisma.task.create({
        data: {
          referenceCode: `ASK-OUTSIDE-${runId}`,
          title: `Outside Task ${runId}`,
          priority: TaskPriority.URGENT,
          status: TaskStatus.ASSIGNED,
          teamId: outsideTeam.id,
          createdById: chiefId,
        },
      }),
    ]);
    taskIds.push(scopedTask.id, outsideTask.id);
    await prisma.taskAssignment.createMany({
      data: [
        {
          taskId: scopedTask.id,
          responsibleUserId: memberId,
          assignedById: adminId,
        },
        {
          taskId: outsideTask.id,
          responsibleUserId: outsideId,
          assignedById: chiefId,
        },
      ],
    });

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
    chiefCookie = await signIn(emails.chief);
    adminCookie = await signIn(emails.admin);
    memberCookie = await signIn(emails.member);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (!prisma) return;
    await prisma.taskAssignment.deleteMany({
      where: { taskId: { in: taskIds } },
    });
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.teamMember.deleteMany({
      where: { memberId: { in: userIds } },
    });
    await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.onModuleDestroy();
  }, 60_000);

  it('keeps Member Task answers inside current assignment scope without workflow writes', async () => {
    const before = await workflowCounts();
    const response = await postAs(
      memberCookie,
      '198.51.100.91',
      'show my Tasks',
    ).expect(201);
    const body = response.body as AskOperixResponse;
    expect(body.references.tasks).toHaveLength(1);
    expect(body.references.tasks[0]?.referenceCode).toContain('ASK-SCOPED');
    expect(JSON.stringify(body)).not.toContain('ASK-OUTSIDE');
    expect(await workflowCounts()).toEqual(before);
  });

  it('preserves Admin Team scope and allows Super Admin Task queries', async () => {
    const admin = await postAs(
      adminCookie,
      '198.51.100.92',
      'show Tasks',
    ).expect(201);
    expect(JSON.stringify(admin.body)).toContain('ASK-SCOPED');
    expect(JSON.stringify(admin.body)).not.toContain('ASK-OUTSIDE');
    const chief = await postAs(
      chiefCookie,
      '198.51.100.93',
      'show Tasks',
    ).expect(201);
    const chiefBody = JSON.stringify(chief.body);
    expect(chiefBody).toContain('ASK-SCOPED');
    expect(chiefBody).toContain('ASK-OUTSIDE');
  });

  it('allows Admin Operations and safely denies Member Operations before data explanation', async () => {
    const admin = await postAs(
      adminCookie,
      '198.51.100.94',
      'give me an operations summary',
    ).expect(201);
    expect((admin.body as AskOperixResponse).references.operations?.days).toBe(
      7,
    );
    const member = await postAs(
      memberCookie,
      '198.51.100.95',
      'give me an operations summary',
    ).expect(201);
    expect((member.body as AskOperixResponse).status).toBe('UNSUPPORTED');
    expect((member.body as AskOperixResponse).references.operations).toBeNull();
  });

  it('rejects invalid bodies', async () => {
    await request(getApp().getHttpServer())
      .post('/api/v1/assistant/ask')
      .set('Cookie', memberCookie)
      .send({ question: 'x', role: 'SUPER_ADMIN' })
      .expect(400);
  });

  async function signIn(email: string): Promise<string> {
    const response = await request(getApp().getHttpServer())
      .post('/api/v1/auth/sign-in/email')
      .send({ email, password })
      .expect(200);
    const values = response.headers['set-cookie'] as unknown;
    const cookie = (Array.isArray(values) ? values : [values])
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.split(';', 1)[0])
      .join('; ');
    if (!cookie) throw new Error('Expected an authenticated session cookie.');
    return cookie;
  }
  function postAs(cookie: string, address: string, question: string) {
    return request(getApp().getHttpServer())
      .post('/api/v1/assistant/ask')
      .set('Cookie', cookie)
      .set('X-Forwarded-For', address)
      .send({ question });
  }
  async function workflowCounts() {
    const client = prismaOrThrow();
    const [
      tasks,
      assignments,
      submissions,
      reviews,
      activities,
      notifications,
    ] = await Promise.all([
      client.task.count(),
      client.taskAssignment.count(),
      client.taskSubmission.count(),
      client.taskReview.count(),
      client.activityLog.count(),
      client.notification.count(),
    ]);
    return {
      tasks,
      assignments,
      submissions,
      reviews,
      activities,
      notifications,
    };
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
