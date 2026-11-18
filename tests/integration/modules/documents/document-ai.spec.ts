import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  TaskCompletionMode,
  TaskScope,
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
  AiGenerationResult,
  AiProvider,
} from '../../../../src/shared/ai/ai.interface';
import { APP_ERROR_CODE } from '../../../../src/shared/errors/app-error-code.constant';
import { FILE_STORAGE_ADAPTER } from '../../../../src/shared/file-storage/file-storage.constant';
import type { FileStorageAdapter } from '../../../../src/shared/file-storage/file-storage.interface';
import { buildPdfFixture } from '../../../support/fixtures/document-file.fixtures';
import { getTestDatabaseUrl } from '../../../support/database/test-database-url';

const jestApi: typeof jest = import.meta.jest as unknown as typeof jest;

const PDF_MIME = 'application/pdf';
const password = 'integration-password';
const runId = randomUUID();
const emails = {
  superAdmin: `document-chief-${runId}@operix.test`,
  adminA: `document-admin-a-${runId}@operix.test`,
  adminB: `document-admin-b-${runId}@operix.test`,
  memberA: `document-member-a-${runId}@operix.test`,
  memberB: `document-member-b-${runId}@operix.test`,
};

const validAnalysis = JSON.stringify({
  summary: 'The document describes a scheduled management review.',
  keyPoints: ['Management review is scheduled for 30 October 2026.'],
  actionItems: [
    {
      action: 'Prepare the regional performance report.',
      ownerMentioned: '',
      dueDateMentioned: '',
    },
  ],
  importantDates: [
    {
      dateText: '30 October 2026',
      context: 'Scheduled management review.',
    },
  ],
  risksOrWarnings: [],
  confidence: 'HIGH',
});

describe('Document AI integration', () => {
  jestApi.setTimeout(60_000);

  let app: NestExpressApplication | undefined;
  let prisma: PrismaService | undefined;
  let memberACookie: string | undefined;
  let memberBCookie: string | undefined;
  let adminACookie: string | undefined;
  let superAdminCookie: string | undefined;

  const ids = {
    superAdmin: '',
    adminA: '',
    adminB: '',
    memberA: '',
    memberB: '',
    teamA: '',
    teamB: '',
    taskA: '',
    taskB: '',
    fileA: '',
    fileB: '',
    orphanFile: '',
  };
  const publicIds = {
    fileA: '',
    fileB: '',
    orphanFile: '',
  };
  const storedFiles = new Map<string, Buffer>();
  const clientAddresses = new Map<string, string>();
  let clientAddressSequence = 1;

  const aiGenerate = jestApi.fn(
    (_request: AiGenerationRequest): Promise<AiGenerationResult> => {
      void _request;

      return Promise.resolve({
        text: validAnalysis,
        model: 'integration-fake-model',
      });
    },
  );
  const aiProvider: AiProvider = {
    name: 'gemini',
    generate: (request) => aiGenerate(request),
  };
  const storageDownload = jestApi.fn((storageKey: string) => {
    const buffer = storedFiles.get(storageKey);

    if (!buffer) {
      return Promise.reject(new Error('Missing integration storage fixture.'));
    }

    return Promise.resolve({ stream: Readable.from(buffer) });
  });
  const storageAdapter: FileStorageAdapter = {
    upload: jestApi.fn(),
    destroy: jestApi.fn(),
    download: (storageKey) => storageDownload(storageKey),
  };

  beforeAll(async () => {
    const databaseUrl = getTestDatabaseUrl();
    configureTestEnvironment(databaseUrl);

    prisma = new PrismaService(
      new ConfigService({
        database: {
          url: databaseUrl,
        },
      }),
    );

    const seedAuth = createOperixSeedAuth({
      prisma,
      baseUrl: process.env.BETTER_AUTH_URL!,
      secret: process.env.BETTER_AUTH_SECRET!,
    });

    for (const [name, email] of Object.entries(emails)) {
      await seedAuth.api.signUpEmail({
        body: {
          email,
          password,
          name,
        },
      });
    }

    const users = await prisma.user.findMany({
      where: { email: { in: Object.values(emails) } },
      select: { id: true, email: true },
    });

    ids.superAdmin = userIdFor(users, emails.superAdmin);
    ids.adminA = userIdFor(users, emails.adminA);
    ids.adminB = userIdFor(users, emails.adminB);
    ids.memberA = userIdFor(users, emails.memberA);
    ids.memberB = userIdFor(users, emails.memberB);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: ids.superAdmin },
        data: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE },
      }),
      prisma.user.update({
        where: { id: ids.adminA },
        data: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      }),
      prisma.user.update({
        where: { id: ids.adminB },
        data: { role: UserRole.ADMIN, status: UserStatus.ACTIVE },
      }),
      prisma.user.update({
        where: { id: ids.memberA },
        data: { role: UserRole.MEMBER, status: UserStatus.ACTIVE },
      }),
      prisma.user.update({
        where: { id: ids.memberB },
        data: { role: UserRole.MEMBER, status: UserStatus.ACTIVE },
      }),
    ]);

    const [teamA, teamB] = await Promise.all([
      prisma.team.create({
        data: { name: `Document Team A ${runId}`, adminId: ids.adminA },
      }),
      prisma.team.create({
        data: { name: `Document Team B ${runId}`, adminId: ids.adminB },
      }),
    ]);
    ids.teamA = teamA.id;
    ids.teamB = teamB.id;

    await prisma.teamMember.createMany({
      data: [
        { teamId: ids.teamA, memberId: ids.memberA },
        { teamId: ids.teamB, memberId: ids.memberB },
      ],
    });

    const [taskA, taskB] = await Promise.all([
      prisma.task.create({
        data: {
          referenceCode: `DOC-A-${runId}`,
          title: 'Document AI Task A',
          scope: TaskScope.TEAM,
          teamId: ids.teamA,
          createdById: ids.adminA,
          completionMode: TaskCompletionMode.DIRECT,
        },
      }),
      prisma.task.create({
        data: {
          referenceCode: `DOC-B-${runId}`,
          title: 'Document AI Task B',
          scope: TaskScope.TEAM,
          teamId: ids.teamB,
          createdById: ids.adminB,
          completionMode: TaskCompletionMode.DIRECT,
        },
      }),
    ]);
    ids.taskA = taskA.id;
    ids.taskB = taskB.id;

    const pdf = buildPdfFixture([
      'Operix Document Intelligence integration fixture with enough readable text.',
      'Management review is scheduled for 30 October 2026.',
    ]);
    const [fileA, fileB, orphanFile] = await Promise.all([
      createFile(ids.memberA, `document-a-${runId}`, pdf),
      createFile(ids.memberB, `document-b-${runId}`, pdf),
      createFile(ids.memberA, `document-orphan-${runId}`, pdf),
    ]);
    ids.fileA = fileA.id;
    ids.fileB = fileB.id;
    ids.orphanFile = orphanFile.id;
    publicIds.fileA = fileA.publicId;
    publicIds.fileB = fileB.publicId;
    publicIds.orphanFile = orphanFile.publicId;

    await prisma.taskAttachment.createMany({
      data: [
        { taskId: ids.taskA, fileId: ids.fileA },
        { taskId: ids.taskB, fileId: ids.fileB },
      ],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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

    memberACookie = await signIn(emails.memberA);
    memberBCookie = await signIn(emails.memberB);
    adminACookie = await signIn(emails.adminA);
    superAdminCookie = await signIn(emails.superAdmin);
  }, 60_000);

  afterAll(async () => {
    await app?.close();

    if (!prisma) return;

    await prisma.taskAttachment.deleteMany({
      where: { fileId: { in: [ids.fileA, ids.fileB] } },
    });
    await prisma.fileAsset.deleteMany({
      where: { id: { in: [ids.fileA, ids.fileB, ids.orphanFile] } },
    });
    await prisma.task.deleteMany({
      where: { id: { in: [ids.taskA, ids.taskB] } },
    });
    await prisma.teamMember.deleteMany({
      where: { memberId: { in: [ids.memberA, ids.memberB] } },
    });
    await prisma.team.deleteMany({
      where: { id: { in: [ids.teamA, ids.teamB] } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: Object.values(emails) } },
    });
    await prisma.onModuleDestroy();
  }, 60_000);

  it('lets a Member analyze their own legitimate document without workflow mutation', async () => {
    const before = await workflowCounts();

    const response = await postAs(
      getMemberACookie(),
      `/api/v1/documents/${publicIds.fileA}/ai-analysis`,
    ).expect(201);

    expect(response.body).toMatchObject({
      documentId: publicIds.fileA,
      summary: 'The document describes a scheduled management review.',
      confidence: 'HIGH',
      meta: {
        provider: 'gemini',
        model: 'integration-fake-model',
        attempts: 1,
      },
    });
    expect(await workflowCounts()).toEqual(before);
    expect(storageDownload).toHaveBeenCalled();
    expect(aiGenerate).toHaveBeenCalled();
  });

  it("hides another Member's document from a Member", async () => {
    await postAs(
      getMemberACookie(),
      `/api/v1/documents/${publicIds.fileB}/ai-analysis`,
    )
      .expect(404)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: APP_ERROR_CODE.FILE_NOT_FOUND,
        });
      });
  });

  it("lets an Admin analyze a current Team Member's document", async () => {
    await postAs(
      getAdminACookie(),
      `/api/v1/documents/${publicIds.fileA}/ai-analysis`,
    ).expect(201);
  });

  it('hides an unrelated Team document from an Admin', async () => {
    await postAs(
      getAdminACookie(),
      `/api/v1/documents/${publicIds.fileB}/ai-analysis`,
    )
      .expect(404)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: APP_ERROR_CODE.FILE_NOT_FOUND,
        });
      });
  });

  it('lets a Super Admin analyze any legitimate document', async () => {
    await postAs(
      getSuperAdminCookie(),
      `/api/v1/documents/${publicIds.fileB}/ai-analysis`,
    ).expect(201);
  });

  it('never exposes an orphan FileAsset through Document AI', async () => {
    for (const cookie of [
      getMemberACookie(),
      getMemberBCookie(),
      getAdminACookie(),
      getSuperAdminCookie(),
    ]) {
      await postAs(
        cookie,
        `/api/v1/documents/${publicIds.orphanFile}/ai-analysis`,
      )
        .expect(404)
        .expect((response) => {
          expect(response.body).toMatchObject({
            code: APP_ERROR_CODE.FILE_NOT_FOUND,
          });
        });
    }
  });

  async function createFile(
    uploadedById: string,
    storageKey: string,
    buffer: Buffer,
  ) {
    storedFiles.set(storageKey, buffer);

    return prismaOrThrow().fileAsset.create({
      data: {
        originalName: `${storageKey}.pdf`,
        mimeType: PDF_MIME,
        sizeBytes: buffer.length,
        storageKey,
        uploadedById,
      },
      select: { id: true, publicId: true },
    });
  }

  async function signIn(email: string) {
    const response = await request(getApp().getHttpServer())
      .post('/api/v1/auth/sign-in/email')
      .send({ email, password })
      .expect(200);
    const setCookie = response.headers['set-cookie'] as unknown;
    const cookies: unknown[] = Array.isArray(setCookie)
      ? (setCookie as unknown[])
      : [setCookie];
    const cookieHeader = cookies
      .filter((cookie): cookie is string => typeof cookie === 'string')
      .map((cookie) => cookie.split(';', 1)[0])
      .join('; ');

    if (!cookieHeader) {
      throw new Error('Expected Better Auth to return a session cookie.');
    }

    return cookieHeader;
  }

  function postAs(cookie: string, path: string) {
    let clientAddress = clientAddresses.get(cookie);

    if (!clientAddress) {
      clientAddress = `198.51.100.${clientAddressSequence}`;
      clientAddressSequence += 1;
      clientAddresses.set(cookie, clientAddress);
    }

    return request(getApp().getHttpServer())
      .post(path)
      .set('Cookie', cookie)
      .set('X-Forwarded-For', clientAddress);
  }

  async function workflowCounts() {
    const client = prismaOrThrow();
    const [tasks, submissions, reviews, notifications, activities, files] =
      await Promise.all([
        client.task.count(),
        client.taskSubmission.count(),
        client.taskReview.count(),
        client.notification.count(),
        client.activityLog.count(),
        client.fileAsset.count(),
      ]);

    return { tasks, submissions, reviews, notifications, activities, files };
  }

  function getApp(): NestExpressApplication {
    if (!app) throw new Error('Nest test application was not initialized.');
    return app;
  }

  function prismaOrThrow(): PrismaService {
    if (!prisma) throw new Error('Prisma test client was not initialized.');
    return prisma;
  }

  function getMemberACookie() {
    if (!memberACookie)
      throw new Error('Member A session was not initialized.');
    return memberACookie;
  }

  function getMemberBCookie() {
    if (!memberBCookie)
      throw new Error('Member B session was not initialized.');
    return memberBCookie;
  }

  function getAdminACookie() {
    if (!adminACookie) throw new Error('Admin A session was not initialized.');
    return adminACookie;
  }

  function getSuperAdminCookie() {
    if (!superAdminCookie) {
      throw new Error('Super Admin session was not initialized.');
    }
    return superAdminCookie;
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
