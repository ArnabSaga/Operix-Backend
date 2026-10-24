/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { HttpStatus } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import type { ApplicationConfiguration } from '../../../src/config/configuration';
import type { PrismaService } from '../../../src/database/prisma.service';
import {
  SUBMISSION_AI_ADVISORY_LIMITATION,
  SUBMISSION_AI_ATTACHMENT_TEXT_COMBINED_MAX_LENGTH,
  SUBMISSION_AI_ATTACHMENT_TEXT_MAX_LENGTH,
  SUBMISSION_AI_MAX_ATTACHMENTS,
  SUBMISSION_AI_MAX_OUTPUT_TOKENS,
  SUBMISSION_AI_SYSTEM_INSTRUCTION,
  SUBMISSION_AI_TEMPERATURE,
} from '../../../src/modules/submission/submission-ai.constant';
import { SubmissionAiService } from '../../../src/modules/submission/submission-ai.service';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import { AppException } from '../../../src/shared/errors/app.exception';
import type { AiService } from '../../../src/shared/ai/ai.service';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import type { DocumentTextService } from '../../../src/shared/document-text/document-text.service';
import type { FileStorageService } from '../../../src/shared/file-storage/file-storage.service';
import { MAX_FILE_SIZE_BYTES } from '../../../src/shared/file-storage/file-storage.constant';
import {
  TaskCompletionMode,
  TaskPriority,
  TaskReviewAction,
  TaskStatus,
  UserRole,
  UserStatus,
} from '../../../generated/prisma/enums';

const jestApi: typeof jest = import.meta.jest as unknown as typeof jest;

const fixedDate = new Date('2026-08-21T10:00:00.000Z');

const VALID_REVIEW = {
  summary: 'The Member reports that the batch record review was completed.',
  requirementCoverage: [
    {
      requirement: 'Review the batch record.',
      status: 'COVERED',
      evidence: 'The submission states the record was reviewed.',
    },
  ],
  issues: [],
  questionsForReviewer: ['Was the signature verified?'],
  suggestedDecision: 'MANUAL_REVIEW',
  suggestedFeedback: '',
};

const VALID_TEXT = JSON.stringify(VALID_REVIEW);

function createViewer(role: UserRole = UserRole.ADMIN): OperixViewer {
  return {
    userId:
      role === UserRole.ADMIN
        ? 'admin-a'
        : role === UserRole.MEMBER
          ? 'member-a'
          : 'chief-a',
    role,
    status: UserStatus.ACTIVE,
    scope:
      role === UserRole.SUPER_ADMIN
        ? { type: 'GLOBAL' }
        : role === UserRole.ADMIN
          ? { type: 'ADMIN', teamIds: ['team-a'] }
          : { type: 'MEMBER', teamId: 'team-a' },
  };
}

interface SubmissionOverrides {
  version?: number;
  status?: TaskStatus;
  submissionText?: string | null;
}

function createSubmission(overrides: SubmissionOverrides = {}) {
  return {
    id: 'submission-internal-a',
    publicId: 'submission-public-a',
    taskId: 'task-internal-a',
    submittedById: 'member-internal-a',
    version: overrides.version ?? 1,
    submissionText:
      overrides.submissionText === undefined
        ? 'The batch record was reviewed.'
        : overrides.submissionText,
    submittedAt: fixedDate,
    task: {
      id: 'task-internal-a',
      publicId: 'task-public-a',
      title: 'Prepare batch record',
      description: 'Review the batch record and sign it.',
      remarks: null,
      priority: TaskPriority.HIGH,
      status: overrides.status ?? TaskStatus.SUBMITTED,
      dueAt: new Date('2026-08-25T10:00:00.000Z'),
      completionMode: TaskCompletionMode.REVIEW_REQUIRED,
      team: {
        adminId: 'admin-a',
        publicId: 'team-public-a',
        name: 'Quality Team',
      },
    },
  };
}

interface PrismaInput {
  submission?: ReturnType<typeof createSubmission> | null;
  latestId?: string | null;
  existingReview?: { id: string } | null;
  previousSubmission?: unknown;
  attachments?: {
    file: {
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
    };
  }[];
}

function createPrisma(input: PrismaInput = {}) {
  const submission = Object.hasOwn(input, 'submission')
    ? input.submission
    : createSubmission();
  const latestId = Object.hasOwn(input, 'latestId')
    ? input.latestId
    : 'submission-internal-a';

  return {
    taskSubmission: {
      findFirst: jestApi
        .fn()
        .mockResolvedValueOnce(submission)
        .mockResolvedValueOnce(latestId === null ? null : { id: latestId })
        .mockResolvedValueOnce(input.previousSubmission ?? null),
      update: jestApi.fn(),
    },
    taskReview: {
      findFirst: jestApi.fn().mockResolvedValue(input.existingReview ?? null),
      create: jestApi.fn(),
    },
    submissionAttachment: {
      findMany: jestApi.fn().mockResolvedValue(input.attachments ?? []),
    },
    task: {
      update: jestApi.fn(),
    },
    activityLog: {
      create: jestApi.fn(),
    },
    notification: {
      create: jestApi.fn(),
    },
    $transaction: jestApi.fn(),
  };
}

function createAiService() {
  return {
    assertEnabled: jestApi.fn(),
    getTimeoutMs: jestApi.fn().mockReturnValue(30_000),
    getProviderName: jestApi.fn().mockReturnValue('gemini'),
    generate: jestApi.fn(),
  };
}

function createFileStorage() {
  return {
    download: jestApi.fn().mockResolvedValue({
      stream: Readable.from([Buffer.from('document bytes')]),
    }),
  };
}

function createDocumentText() {
  return {
    isSupported: jestApi.fn((mimeType: string) =>
      [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ].includes(mimeType),
    ),
    extract: jestApi.fn().mockResolvedValue({
      format: 'PDF',
      text: 'Signed batch record attachment evidence.',
      limitations: [],
    }),
  };
}

function createService(
  prisma: ReturnType<typeof createPrisma>,
  aiService: ReturnType<typeof createAiService>,
  fileStorage: ReturnType<typeof createFileStorage> = createFileStorage(),
  documentText: ReturnType<typeof createDocumentText> = createDocumentText(),
): SubmissionAiService {
  const config = {
    get: jestApi.fn().mockReturnValue('Asia/Dhaka'),
  };

  return new SubmissionAiService(
    prisma as unknown as PrismaService,
    aiService as unknown as AiService,
    fileStorage as unknown as FileStorageService,
    documentText as unknown as DocumentTextService,
    config as unknown as ConfigService<ApplicationConfiguration, true>,
  );
}

function expectAppException(
  error: unknown,
  input: { status: number; code: string },
): void {
  const exception = error as {
    getStatus: () => number;
    getResponse: () => unknown;
  };

  expect(exception.getStatus()).toBe(input.status);
  expect(exception.getResponse()).toMatchObject({ code: input.code });
}

async function expectRejects(
  promise: Promise<unknown>,
  input: { status: number; code: string },
): Promise<void> {
  try {
    await promise;
    throw new Error('Expected the operation to fail.');
  } catch (error) {
    expectAppException(error, input);
  }
}

describe('SubmissionAiService', () => {
  it('returns a validated advisory review without writing anything', async () => {
    const prisma = createPrisma({
      submission: createSubmission({ version: 2 }),
      previousSubmission: {
        version: 1,
        reviews: [
          {
            action: TaskReviewAction.REQUEST_REVISION,
            feedback: 'Attach the signed second page.',
          },
        ],
      },
    });
    const aiService = createAiService();
    aiService.generate.mockResolvedValue({
      text: VALID_TEXT,
      model: 'gemini-2.5-flash',
    });

    const result = await createService(prisma, aiService).analyze(
      createViewer(),
      'submission-public-a',
    );

    expect(result).toMatchObject({
      ...VALID_REVIEW,
      meta: {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        attempts: 1,
      },
    });
    expect(result.limitations[0]).toBe(SUBMISSION_AI_ADVISORY_LIMITATION);
    expect(result.limitations).toContain(
      'This analysis covers Submission version 2 only.',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.taskReview.create).not.toHaveBeenCalled();
    expect(prisma.taskSubmission.update).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('sends only server-selected operational context with product rules in the system turn', async () => {
    const prisma = createPrisma({
      submission: createSubmission({ version: 2 }),
      previousSubmission: {
        version: 1,
        reviews: [
          {
            action: TaskReviewAction.REQUEST_REVISION,
            feedback: 'Attach the signed second page.',
          },
        ],
      },
      attachments: [
        {
          file: {
            originalName: 'batch-record.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 4_096,
            storageKey: 'storage-key-a',
          },
        },
      ],
    });
    const aiService = createAiService();
    aiService.generate.mockResolvedValue({
      text: VALID_TEXT,
      model: 'gemini-2.5-flash',
    });

    await createService(prisma, aiService).analyze(
      createViewer(),
      'submission-public-a',
    );

    const request = aiService.generate.mock.calls[0][0] as {
      systemInstruction: string;
      userPrompt: string;
      temperature: number;
      maxOutputTokens: number;
    };

    expect(request.systemInstruction).toBe(SUBMISSION_AI_SYSTEM_INSTRUCTION);
    expect(request.temperature).toBe(SUBMISSION_AI_TEMPERATURE);
    expect(request.maxOutputTokens).toBe(SUBMISSION_AI_MAX_OUTPUT_TOKENS);

    expect(request.userPrompt).toContain('Prepare batch record');
    expect(request.userPrompt).toContain('The batch record was reviewed.');
    expect(request.userPrompt).toContain('Attach the signed second page.');
    expect(request.userPrompt).toContain('Name: batch-record.pdf');
    expect(request.userPrompt).toContain(
      'Signed batch record attachment evidence.',
    );

    for (const privateValue of [
      'submission-internal-a',
      'task-internal-a',
      'member-internal-a',
      'team-public-a',
      'storage-key',
      'member@example.com',
      'admin@example.com',
    ]) {
      expect(request.userPrompt).not.toContain(privateValue);
    }
  });

  it('selects attachment metadata with a bounded, ordered read', async () => {
    const prisma = createPrisma();
    const aiService = createAiService();
    aiService.generate.mockResolvedValue({ text: VALID_TEXT, model: 'model' });

    await createService(prisma, aiService).analyze(
      createViewer(),
      'submission-public-a',
    );

    expect(prisma.submissionAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { submissionId: 'submission-internal-a' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: SUBMISSION_AI_MAX_ATTACHMENTS + 1,
      }),
    );
    expect(prisma.submissionAttachment.findMany).toHaveBeenCalledTimes(1);
  });

  it('retries once when the model output is unusable, then succeeds', async () => {
    const prisma = createPrisma();
    const aiService = createAiService();
    aiService.generate
      .mockResolvedValueOnce({ text: '{"summary": 42}', model: 'model' })
      .mockResolvedValueOnce({ text: VALID_TEXT, model: 'model' });

    const result = await createService(prisma, aiService).analyze(
      createViewer(),
      'submission-public-a',
    );

    expect(result.meta.attempts).toBe(2);
    expect(aiService.generate).toHaveBeenCalledTimes(2);
  });

  it('rejects with AI_RESPONSE_INVALID after one semantic retry', async () => {
    const prisma = createPrisma();
    const aiService = createAiService();
    aiService.generate.mockResolvedValue({ text: 'not json', model: 'model' });

    await expectRejects(
      createService(prisma, aiService).analyze(
        createViewer(),
        'submission-public-a',
      ),
      {
        status: HttpStatus.BAD_GATEWAY,
        code: APP_ERROR_CODE.AI_RESPONSE_INVALID,
      },
    );

    expect(aiService.generate).toHaveBeenCalledTimes(2);
  });

  it('never retries provider failures', async () => {
    const prisma = createPrisma();
    const aiService = createAiService();
    aiService.generate.mockRejectedValue(
      new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        APP_ERROR_CODE.AI_RATE_LIMITED,
        'Too many AI requests.',
      ),
    );

    await expectRejects(
      createService(prisma, aiService).analyze(
        createViewer(),
        'submission-public-a',
      ),
      {
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: APP_ERROR_CODE.AI_RATE_LIMITED,
      },
    );

    expect(aiService.generate).toHaveBeenCalledTimes(1);
  });

  it('fails with AI_PROVIDER_UNAVAILABLE when no time budget remains', async () => {
    const prisma = createPrisma();
    const aiService = createAiService();
    aiService.getTimeoutMs.mockReturnValue(0);

    await expectRejects(
      createService(prisma, aiService).analyze(
        createViewer(),
        'submission-public-a',
      ),
      {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: APP_ERROR_CODE.AI_PROVIDER_UNAVAILABLE,
      },
    );

    expect(aiService.generate).not.toHaveBeenCalled();
  });

  it('checks submission authority before AI availability', async () => {
    const prisma = createPrisma({ submission: null });
    const aiService = createAiService();
    aiService.assertEnabled.mockImplementation(() => {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        APP_ERROR_CODE.AI_DISABLED,
        'AI is disabled.',
      );
    });

    await expectRejects(
      createService(prisma, aiService).analyze(
        createViewer(),
        'submission-public-a',
      ),
      {
        status: HttpStatus.NOT_FOUND,
        code: 'SUBMISSION_NOT_FOUND',
      },
    );

    expect(aiService.assertEnabled).not.toHaveBeenCalled();
    expect(aiService.generate).not.toHaveBeenCalled();
  });

  it('stops before reading when AI is disabled', async () => {
    const prisma = createPrisma();
    const aiService = createAiService();
    aiService.assertEnabled.mockImplementation(() => {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        APP_ERROR_CODE.AI_DISABLED,
        'AI is disabled.',
      );
    });

    await expectRejects(
      createService(prisma, aiService).analyze(
        createViewer(),
        'submission-public-a',
      ),
      {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: APP_ERROR_CODE.AI_DISABLED,
      },
    );

    expect(prisma.taskSubmission.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.submissionAttachment.findMany).not.toHaveBeenCalled();
    expect(aiService.generate).not.toHaveBeenCalled();
  });

  it.each([UserRole.SUPER_ADMIN, UserRole.MEMBER])(
    'denies %s before touching the database',
    async (role) => {
      const prisma = createPrisma();
      const aiService = createAiService();

      await expectRejects(
        createService(prisma, aiService).analyze(
          createViewer(role),
          'submission-public-a',
        ),
        {
          status: HttpStatus.FORBIDDEN,
          code: APP_ERROR_CODE.FORBIDDEN,
        },
      );

      expect(prisma.taskSubmission.findFirst).not.toHaveBeenCalled();
      expect(aiService.generate).not.toHaveBeenCalled();
    },
  );

  it('rejects a Submission that already has a Review', async () => {
    const prisma = createPrisma({ existingReview: { id: 'review-a' } });
    const aiService = createAiService();

    await expectRejects(
      createService(prisma, aiService).analyze(
        createViewer(),
        'submission-public-a',
      ),
      {
        status: HttpStatus.CONFLICT,
        code: 'REVIEW_NOT_ALLOWED',
      },
    );

    expect(aiService.generate).not.toHaveBeenCalled();
  });

  it('reads the actual preceding version instead of assuming version - 1', async () => {
    const prisma = createPrisma({
      submission: createSubmission({ version: 4 }),
      previousSubmission: {
        version: 2,
        reviews: [
          {
            action: TaskReviewAction.REQUEST_REVISION,
            feedback: 'Add the deviation reference.',
          },
        ],
      },
    });
    const aiService = createAiService();
    aiService.generate.mockResolvedValue({ text: VALID_TEXT, model: 'model' });

    await createService(prisma, aiService).analyze(
      createViewer(),
      'submission-public-a',
    );

    expect(prisma.taskSubmission.findFirst).toHaveBeenNthCalledWith(3, {
      where: {
        taskId: 'task-internal-a',
        version: { lt: 4 },
      },
      orderBy: { version: 'desc' },
      select: expect.objectContaining({
        version: true,
        reviews: expect.any(Object),
      }),
    });

    const request = aiService.generate.mock.calls[0][0] as {
      userPrompt: string;
    };

    expect(request.userPrompt).toContain(
      'Previous revision (version 2) reviewer feedback:',
    );
    expect(request.userPrompt).toContain('Add the deviation reference.');
  });

  it('omits previous feedback unless the prior review requested a revision', async () => {
    const prisma = createPrisma({
      submission: createSubmission({ version: 2 }),
      previousSubmission: {
        version: 1,
        reviews: [
          {
            action: TaskReviewAction.APPROVE,
            feedback: 'Great work.',
          },
        ],
      },
    });
    const aiService = createAiService();
    aiService.generate.mockResolvedValue({ text: VALID_TEXT, model: 'model' });

    await createService(prisma, aiService).analyze(
      createViewer(),
      'submission-public-a',
    );

    const request = aiService.generate.mock.calls[0][0] as {
      userPrompt: string;
    };

    expect(request.userPrompt).not.toContain('Previous revision');
    expect(request.userPrompt).not.toContain('Great work.');
  });

  it('does not query a previous version for the first Submission', async () => {
    const prisma = createPrisma({
      submission: createSubmission({ version: 1 }),
    });
    const aiService = createAiService();
    aiService.generate.mockResolvedValue({ text: VALID_TEXT, model: 'model' });

    await createService(prisma, aiService).analyze(
      createViewer(),
      'submission-public-a',
    );

    expect(prisma.taskSubmission.findFirst).toHaveBeenCalledTimes(2);
  });

  it('caps attachment metadata and reports the truncation', async () => {
    const attachments = Array.from(
      { length: SUBMISSION_AI_MAX_ATTACHMENTS + 1 },
      (_value, index) => ({
        file: {
          originalName: `file-${index}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: index,
          storageKey: `storage-key-${index}`,
        },
      }),
    );
    const prisma = createPrisma({ attachments });
    const aiService = createAiService();
    aiService.generate.mockResolvedValue({ text: VALID_TEXT, model: 'model' });

    const result = await createService(prisma, aiService).analyze(
      createViewer(),
      'submission-public-a',
    );

    const request = aiService.generate.mock.calls[0][0] as {
      userPrompt: string;
    };

    expect(request.userPrompt).toContain('file-19.pdf');
    expect(request.userPrompt).not.toContain('file-20.pdf');
    expect(result.limitations).toContain(
      `Only the first ${SUBMISSION_AI_MAX_ATTACHMENTS} attachments were included for analysis.`,
    );
  });

  it('analyzes supported attachments without letting unsupported files consume extraction slots', async () => {
    const attachments = [
      {
        file: {
          originalName: 'photo.png',
          mimeType: 'image/png',
          sizeBytes: 100,
          storageKey: 'private-photo-key',
        },
      },
      ...Array.from({ length: 5 }, (_value, index) => ({
        file: {
          originalName: `report-${index}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 100,
          storageKey: `private-report-key-${index}`,
        },
      })),
    ];
    const prisma = createPrisma({ attachments });
    const aiService = createAiService();
    const fileStorage = createFileStorage();
    const documentText = createDocumentText();
    aiService.generate.mockResolvedValue({ text: VALID_TEXT, model: 'model' });

    const result = await createService(
      prisma,
      aiService,
      fileStorage,
      documentText,
    ).analyze(createViewer(), 'submission-public-a');

    expect(fileStorage.download).toHaveBeenCalledTimes(5);
    expect(documentText.extract).toHaveBeenCalledTimes(5);
    expect(result.limitations).toContain(
      '1 attachment used an unsupported format and was not text-analyzed.',
    );

    const request = aiService.generate.mock.calls[0][0] as {
      userPrompt: string;
    };
    expect(request.userPrompt).toContain('Content status: UNSUPPORTED');
    expect(request.userPrompt).toContain('Content status: EXTRACTED');
    expect(request.userPrompt).not.toContain('private-photo-key');
    expect(request.userPrompt).not.toContain('private-report-key');
  });

  it('continues when one extraction is empty and another fails', async () => {
    const attachments = ['empty.pdf', 'failed.pdf', 'usable.pdf'].map(
      (originalName, index) => ({
        file: {
          originalName,
          mimeType: 'application/pdf',
          sizeBytes: 100,
          storageKey: `storage-${index}`,
        },
      }),
    );
    const prisma = createPrisma({ attachments });
    const aiService = createAiService();
    const documentText = createDocumentText();
    documentText.extract
      .mockRejectedValueOnce(
        new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          APP_ERROR_CODE.DOCUMENT_TEXT_EMPTY,
          'No usable text could be extracted.',
        ),
      )
      .mockRejectedValueOnce(
        new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          APP_ERROR_CODE.DOCUMENT_TEXT_EXTRACTION_FAILED,
          'Parser details must stay private.',
        ),
      )
      .mockResolvedValueOnce({
        format: 'PDF',
        text: 'Useful evidence from the final file.',
        limitations: [],
      });
    aiService.generate.mockResolvedValue({ text: VALID_TEXT, model: 'model' });

    const result = await createService(
      prisma,
      aiService,
      createFileStorage(),
      documentText,
    ).analyze(createViewer(), 'submission-public-a');

    const request = aiService.generate.mock.calls[0][0] as {
      userPrompt: string;
    };
    expect(request.userPrompt).toContain('Content status: EMPTY');
    expect(request.userPrompt).toContain('Content status: FAILED');
    expect(request.userPrompt).toContain(
      'Useful evidence from the final file.',
    );
    expect(request.userPrompt).not.toContain(
      'Parser details must stay private.',
    );
    expect(result.limitations).toContain(
      '1 attachment contained no extractable text. Scanned or image-only content was not OCR processed.',
    );
    expect(result.limitations).toContain(
      '1 attachment could not be converted to readable text.',
    );
  });

  it('continues when storage fails or an actual stream exceeds the byte limit', async () => {
    const attachments = ['storage-failure.pdf', 'oversize.pdf'].map(
      (originalName, index) => ({
        file: {
          originalName,
          mimeType: 'application/pdf',
          sizeBytes: 100,
          storageKey: `storage-${index}`,
        },
      }),
    );
    const prisma = createPrisma({ attachments });
    const aiService = createAiService();
    const fileStorage = createFileStorage();
    fileStorage.download
      .mockRejectedValueOnce(new Error('private storage failure'))
      .mockResolvedValueOnce({
        stream: Readable.from([Buffer.alloc(MAX_FILE_SIZE_BYTES + 1)]),
      });
    const documentText = createDocumentText();
    aiService.generate.mockResolvedValue({ text: VALID_TEXT, model: 'model' });

    const result = await createService(
      prisma,
      aiService,
      fileStorage,
      documentText,
    ).analyze(createViewer(), 'submission-public-a');

    expect(aiService.generate).toHaveBeenCalledTimes(1);
    expect(documentText.extract).not.toHaveBeenCalled();
    expect(result.limitations).toContain(
      '2 attachments could not be converted to readable text.',
    );
  });

  it('enforces per-file and combined attachment text budgets', async () => {
    const attachments = Array.from({ length: 4 }, (_value, index) => ({
      file: {
        originalName: `large-${index}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 100,
        storageKey: `storage-${index}`,
      },
    }));
    const prisma = createPrisma({ attachments });
    const aiService = createAiService();
    const documentText = createDocumentText();
    documentText.extract.mockResolvedValue({
      format: 'PDF',
      text: 'x'.repeat(SUBMISSION_AI_ATTACHMENT_TEXT_MAX_LENGTH + 5_000),
      limitations: [],
    });
    aiService.generate.mockResolvedValue({ text: VALID_TEXT, model: 'model' });

    const result = await createService(
      prisma,
      aiService,
      createFileStorage(),
      documentText,
    ).analyze(createViewer(), 'submission-public-a');

    const request = aiService.generate.mock.calls[0][0] as {
      userPrompt: string;
    };
    const suppliedCharacters = (request.userPrompt.match(/x{100,}/g) ?? [])
      .map((value) => value.length)
      .reduce((total, value) => total + value, 0);
    expect(suppliedCharacters).toBe(
      SUBMISSION_AI_ATTACHMENT_TEXT_COMBINED_MAX_LENGTH,
    );
    expect(result.limitations).toContain(
      'Attachment evidence was truncated to the review context limit.',
    );
  });

  it('keeps limitations deterministic and bounded', async () => {
    const prisma = createPrisma({
      submission: createSubmission({ submissionText: null }),
    });
    const aiService = createAiService();
    aiService.generate.mockResolvedValue({ text: VALID_TEXT, model: 'model' });

    const result = await createService(prisma, aiService).analyze(
      createViewer(),
      'submission-public-a',
    );

    expect(result.limitations.length).toBeLessThanOrEqual(8);
    expect(result.limitations[0]).toBe(SUBMISSION_AI_ADVISORY_LIMITATION);
    expect(result.limitations).toContain(
      'This Submission contains no written submission text.',
    );
  });
});
