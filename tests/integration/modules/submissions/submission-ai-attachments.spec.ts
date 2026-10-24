import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  TaskCompletionMode,
  TaskScope,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../../generated/prisma/enums';
import { AppModule } from '../../../../src/app.module';
import { configureApplication } from '../../../../src/app.setup';
import { PrismaService } from '../../../../src/database/prisma.service';
import { createOperixSeedAuth } from '../../../../src/modules/auth/auth.factory';
import { AI_PROVIDER } from '../../../../src/shared/ai/ai.constant';
import type {
  AiGenerationRequest,
  AiProvider,
} from '../../../../src/shared/ai/ai.interface';
import { FILE_STORAGE_ADAPTER } from '../../../../src/shared/file-storage/file-storage.constant';
import type { FileStorageAdapter } from '../../../../src/shared/file-storage/file-storage.interface';
import { getTestDatabaseUrl } from '../../../support/database/test-database-url';
import { buildPdfFixture } from '../../../support/fixtures/document-file.fixtures';

const jestApi: typeof jest = import.meta.jest as unknown as typeof jest;
const runId = randomUUID();
const password = 'integration-password';
const emails = {
  adminA: `submission-ai-admin-a-${runId}@operix.test`,
  adminB: `submission-ai-admin-b-${runId}@operix.test`,
  member: `submission-ai-member-${runId}@operix.test`,
};

const validReview = JSON.stringify({
  summary: 'The submission provides the requested attachment evidence.',
  requirementCoverage: [],
  issues: [],
  questionsForReviewer: [],
  suggestedDecision: 'MANUAL_REVIEW',
  suggestedFeedback: '',
});

describe('Submission AI attachment enrichment integration', () => {
  jestApi.setTimeout(60_000);

  let app: NestExpressApplication | undefined;
  let prisma: PrismaService | undefined;
  let adminACookie = '';
  let adminBCookie = '';
  const ids = {
    adminA: '',
    adminB: '',
    member: '',
    teamA: '',
    teamB: '',
    task: '',
    staleTask: '',
    submission: '',
    staleSubmission: '',
    latestSubmission: '',
    file: '',
  };
  const publicIds = { submission: '', staleSubmission: '' };
  const storedFiles = new Map<string, Buffer>();
  const storageDownload = jestApi.fn((storageKey: string) => {
    const buffer = storedFiles.get(storageKey);
    if (!buffer) return Promise.reject(new Error('Missing storage fixture.'));
    return Promise.resolve({ stream: Readable.from(buffer) });
  });
  const storageAdapter: FileStorageAdapter = {
    upload: jestApi.fn(),
    destroy: jestApi.fn(),
    download: (storageKey) => storageDownload(storageKey),
  };
  const aiGenerate = jestApi.fn((generationRequest: AiGenerationRequest) => {
    void generationRequest;
    return Promise.resolve({
      text: validReview,
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

    for (const [name, email] of Object.entries(emails)) {
      await seedAuth.api.signUpEmail({ body: { email, password, name } });
    }

    const users = await prisma.user.findMany({
      where: { email: { in: Object.values(emails) } },
      select: { id: true, email: true },
    });
    ids.adminA = userIdFor(users, emails.adminA);
    ids.adminB = userIdFor(users, emails.adminB);
    ids.member = userIdFor(users, emails.member);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: ids.adminA },
        data: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      }),
      prisma.user.update({
        where: { id: ids.adminB },
        data: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      }),
      prisma.user.update({
        where: { id: ids.member },
        data: { role: UserRole.MEMBER, status: UserStatus.ACTIVE },
      }),
    ]);

    const [teamA, teamB] = await Promise.all([
      prisma.team.create({
        data: { name: `Submission AI Team A ${runId}`, adminId: ids.adminA },
      }),
      prisma.team.create({
        data: { name: `Submission AI Team B ${runId}`, adminId: ids.adminB },
      }),
    ]);
    ids.teamA = teamA.id;
    ids.teamB = teamB.id;
    await prisma.teamMember.create({
      data: { teamId: ids.teamA, memberId: ids.member },
    });

    const [task, staleTask] = await Promise.all([
      prisma.task.create({
        data: {
          referenceCode: `SUB-AI-${runId}`,
          title: 'Review attached batch record',
          description: 'Confirm the attachment documents the completed work.',
          status: TaskStatus.SUBMITTED,
          scope: TaskScope.TEAM,
          teamId: ids.teamA,
          createdById: ids.adminA,
          completionMode: TaskCompletionMode.REVIEW_REQUIRED,
        },
      }),
      prisma.task.create({
        data: {
          referenceCode: `SUB-AI-STALE-${runId}`,
          title: 'Stale submission task',
          status: TaskStatus.RESUBMITTED,
          scope: TaskScope.TEAM,
          teamId: ids.teamA,
          createdById: ids.adminA,
          completionMode: TaskCompletionMode.REVIEW_REQUIRED,
        },
      }),
    ]);
    ids.task = task.id;
    ids.staleTask = staleTask.id;

    const [submission, staleSubmission, latestSubmission] = await Promise.all([
      prisma.taskSubmission.create({
        data: {
          taskId: ids.task,
          submittedById: ids.member,
          version: 1,
          submissionText: 'Please review the attached batch record.',
        },
      }),
      prisma.taskSubmission.create({
        data: {
          taskId: ids.staleTask,
          submittedById: ids.member,
          version: 1,
          submissionText: 'Old version.',
        },
      }),
      prisma.taskSubmission.create({
        data: {
          taskId: ids.staleTask,
          submittedById: ids.member,
          version: 2,
          submissionText: 'Current version.',
        },
      }),
    ]);
    ids.submission = submission.id;
    ids.staleSubmission = staleSubmission.id;
    ids.latestSubmission = latestSubmission.id;
    publicIds.submission = submission.publicId;
    publicIds.staleSubmission = staleSubmission.publicId;

    const pdf = buildPdfFixture([
      'Operix submission attachment integration evidence.',
      'The batch record was completed and signed by the responsible member.',
    ]);
    const storageKey = `submission-ai-${runId}`;
    storedFiles.set(storageKey, pdf);
    const file = await prisma.fileAsset.create({
      data: {
        originalName: 'batch-record.pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdf.length,
        storageKey,
        uploadedById: ids.member,
      },
    });
    ids.file = file.id;
    await prisma.submissionAttachment.create({
      data: { submissionId: ids.submission, fileId: ids.file },
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_PROVIDER)
      .useValue(aiProvider)
      .overrideProvider(FILE_STORAGE_ADAPTER)
      .useValue(storageAdapter)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    app.set('trust proxy', true);
    configureApplication(app);
    await app.init();
    adminACookie = await signIn(emails.adminA);
    adminBCookie = await signIn(emails.adminB);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (!prisma) return;
    await prisma.submissionAttachment.deleteMany({
      where: { submissionId: ids.submission },
    });
    await prisma.fileAsset.deleteMany({ where: { id: ids.file } });
    await prisma.taskSubmission.deleteMany({
      where: {
        id: { in: [ids.submission, ids.staleSubmission, ids.latestSubmission] },
      },
    });
    await prisma.task.deleteMany({
      where: { id: { in: [ids.task, ids.staleTask] } },
    });
    await prisma.teamMember.deleteMany({ where: { memberId: ids.member } });
    await prisma.team.deleteMany({
      where: { id: { in: [ids.teamA, ids.teamB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await prisma.onModuleDestroy();
  }, 60_000);

  it('enriches an authorized review with attachment text without workflow mutation', async () => {
    const before = await workflowCounts();
    const response = await postAs(
      adminACookie,
      '198.51.100.41',
      `/api/v1/submissions/${publicIds.submission}/ai-review`,
    ).expect(201);

    expect(response.body).toMatchObject({
      summary: 'The submission provides the requested attachment evidence.',
      meta: { provider: 'gemini', model: 'integration-fake-model' },
    });
    const generation = aiGenerate.mock.calls.at(-1)?.[0];
    expect(generation?.userPrompt).toContain(
      'Operix submission attachment integration evidence.',
    );
    expect(generation?.userPrompt).not.toContain(`submission-ai-${runId}`);
    expect(await workflowCounts()).toEqual(before);
  });

  it('denies the wrong Admin before storage access', async () => {
    const downloadsBefore = storageDownload.mock.calls.length;
    await postAs(
      adminBCookie,
      '198.51.100.42',
      `/api/v1/submissions/${publicIds.submission}/ai-review`,
    ).expect(404);
    expect(storageDownload).toHaveBeenCalledTimes(downloadsBefore);
  });

  it('denies a stale Submission before storage access', async () => {
    const downloadsBefore = storageDownload.mock.calls.length;
    await postAs(
      adminACookie,
      '198.51.100.43',
      `/api/v1/submissions/${publicIds.staleSubmission}/ai-review`,
    ).expect(409);
    expect(storageDownload).toHaveBeenCalledTimes(downloadsBefore);
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
    const [tasks, submissions, reviews, activities, notifications, files] =
      await Promise.all([
        client.task.count(),
        client.taskSubmission.count(),
        client.taskReview.count(),
        client.activityLog.count(),
        client.notification.count(),
        client.fileAsset.count(),
      ]);
    return { tasks, submissions, reviews, activities, notifications, files };
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
  process.env.FILE_STORAGE_ENABLED = 'true';
  process.env.CLOUDINARY_CLOUD_NAME = 'integration-cloud';
  process.env.CLOUDINARY_API_KEY = 'integration-key';
  process.env.CLOUDINARY_API_SECRET = 'integration-secret';
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
