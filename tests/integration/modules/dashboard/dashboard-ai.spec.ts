import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { UserRole, UserStatus } from '../../../../generated/prisma/enums';
import { AppModule } from '../../../../src/app.module';
import { configureApplication } from '../../../../src/app.setup';
import { PrismaService } from '../../../../src/database/prisma.service';
import { createOperixSeedAuth } from '../../../../src/modules/auth/auth.factory';
import type { DashboardAiBriefResponse } from '../../../../src/modules/dashboard/dashboard-ai.interface';
import { AI_PROVIDER } from '../../../../src/shared/ai/ai.constant';
import type {
  AiGenerationRequest,
  AiProvider,
} from '../../../../src/shared/ai/ai.interface';
import { getTestDatabaseUrl } from '../../../support/database/test-database-url';

const jestApi: typeof jest = import.meta.jest as unknown as typeof jest;
const runId = randomUUID();
const password = 'integration-password';
const names = {
  superAdmin: `Operations Chief ${runId}`,
  admin: `Scoped Admin ${runId}`,
  member: `Scoped Member ${runId}`,
  outsideMember: `Outside Member ${runId}`,
};
const emails = {
  superAdmin: `dashboard-ai-chief-${runId}@operix.test`,
  admin: `dashboard-ai-admin-${runId}@operix.test`,
  member: `dashboard-ai-member-${runId}@operix.test`,
  outsideMember: `dashboard-ai-outside-${runId}@operix.test`,
};

const validBrief = JSON.stringify({
  headline: 'Operations remain stable',
  executiveSummary: 'The supplied Dashboard snapshot has no urgent exception.',
  priorities: [],
  workloadObservations: [],
  trendSummary: 'No completions were recorded in the selected window.',
  reportingSummary: null,
  nextActions: ['Continue monitoring the authorized Dashboard metrics.'],
  confidence: 'HIGH',
  limitations: ['The brief uses only the supplied snapshot.'],
});

describe('Dashboard AI operations brief integration', () => {
  jestApi.setTimeout(60_000);

  let app: NestExpressApplication | undefined;
  let prisma: PrismaService | undefined;
  let superAdminCookie = '';
  let adminCookie = '';
  let memberCookie = '';
  const teamIds: string[] = [];
  const userIds: string[] = [];
  const aiGenerate = jestApi.fn((generationRequest: AiGenerationRequest) => {
    void generationRequest;
    return Promise.resolve({
      text: validBrief,
      model: 'integration-fake-model',
    });
  });
  const aiProvider: AiProvider = {
    name: 'gemini',
    generate: (generationRequest) => aiGenerate(generationRequest),
  };

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

    for (const [key, email] of Object.entries(emails)) {
      await seedAuth.api.signUpEmail({
        body: { email, password, name: names[key as keyof typeof names] },
      });
    }

    const users = await prisma.user.findMany({
      where: { email: { in: Object.values(emails) } },
      select: { id: true, email: true },
    });
    const superAdminId = userIdFor(users, emails.superAdmin);
    const adminId = userIdFor(users, emails.admin);
    const memberId = userIdFor(users, emails.member);
    const outsideMemberId = userIdFor(users, emails.outsideMember);
    userIds.push(superAdminId, adminId, memberId, outsideMemberId);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: superAdminId },
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
        where: { id: outsideMemberId },
        data: { role: UserRole.MEMBER, status: UserStatus.ACTIVE },
      }),
    ]);

    const [team, outsideTeam] = await Promise.all([
      prisma.team.create({
        data: { name: `Scoped Team ${runId}`, adminId },
      }),
      prisma.team.create({
        data: { name: `Outside Team ${runId}`, adminId: superAdminId },
      }),
    ]);
    teamIds.push(team.id, outsideTeam.id);
    await prisma.teamMember.createMany({
      data: [
        { teamId: team.id, memberId },
        { teamId: outsideTeam.id, memberId: outsideMemberId },
      ],
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_PROVIDER)
      .useValue(aiProvider)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    app.set('trust proxy', true);
    configureApplication(app);
    await app.init();

    superAdminCookie = await signIn(emails.superAdmin);
    adminCookie = await signIn(emails.admin);
    memberCookie = await signIn(emails.member);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (!prisma) return;
    await prisma.teamMember.deleteMany({
      where: { memberId: { in: userIds } },
    });
    await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.onModuleDestroy();
  }, 60_000);

  it('returns an Admin-scoped brief without leaking out-of-scope members or mutating workflows', async () => {
    const before = await workflowCounts();
    const callsBefore = aiGenerate.mock.calls.length;
    const response = await postAs(
      adminCookie,
      '198.51.100.71',
      '/api/v1/dashboard/ai-brief?days=7',
    ).expect(201);
    const body = response.body as DashboardAiBriefResponse;

    expect(body).toMatchObject({
      headline: 'Operations remain stable',
      meta: {
        provider: 'gemini',
        model: 'integration-fake-model',
        attempts: 1,
        days: 7,
      },
    });
    expect(body.meta.asOf).toEqual(expect.any(String));
    expect(body.limitations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('advisory AI summary'),
        expect.stringContaining('does not change Tasks'),
      ]),
    );
    const prompt = aiGenerate.mock.calls[callsBefore]?.[0].userPrompt ?? '';
    expect(prompt).toContain(names.member);
    expect(prompt).not.toContain(names.outsideMember);
    expect(prompt).not.toContain(emails.member);
    expect(await workflowCounts()).toEqual(before);
  });

  it('allows Super Admin and rejects Member before provider work', async () => {
    await postAs(
      superAdminCookie,
      '198.51.100.72',
      '/api/v1/dashboard/ai-brief?days=30',
    ).expect(201);

    const callsBefore = aiGenerate.mock.calls.length;
    await postAs(
      memberCookie,
      '198.51.100.73',
      '/api/v1/dashboard/ai-brief?days=7',
    ).expect(403);
    expect(aiGenerate).toHaveBeenCalledTimes(callsBefore);
  });

  it('rejects unsupported trend periods before provider work', async () => {
    const callsBefore = aiGenerate.mock.calls.length;
    await postAs(
      adminCookie,
      '198.51.100.74',
      '/api/v1/dashboard/ai-brief?days=14',
    ).expect(400);
    expect(aiGenerate).toHaveBeenCalledTimes(callsBefore);
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

  function postAs(cookie: string, address: string, path: string) {
    return request(getApp().getHttpServer())
      .post(path)
      .set('Cookie', cookie)
      .set('X-Forwarded-For', address);
  }

  async function workflowCounts() {
    const client = prismaOrThrow();
    const [tasks, submissions, reviews, reports, activities, notifications] =
      await Promise.all([
        client.task.count(),
        client.taskSubmission.count(),
        client.taskReview.count(),
        client.managementReport.count(),
        client.activityLog.count(),
        client.notification.count(),
      ]);
    return { tasks, submissions, reviews, reports, activities, notifications };
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
    'integration-registration-rate-limit-secret';
  process.env.CRON_SECRET = 'integration-cron-secret-that-is-long-enough';
  process.env.API_RATE_LIMIT_SECRET =
    'integration-api-rate-limit-secret-that-is-long-enough';
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
