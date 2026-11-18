/**
 * Live Gemini smoke.
 *
 * This is a standalone operator tool, not a Jest suite. It intentionally runs
 * on plain Node against the compiled build so a real provider call can never
 * happen during `pnpm test:unit` or `pnpm test:integration`, and so it uses the
 * same HTTP stack that production uses. (Jest's VM does not expose an undici
 * dispatcher to the `@google/genai` client, so real calls cannot run there.)
 *
 * Opt in explicitly:
 *
 *   RUN_LIVE_AI_TESTS=true pnpm test:ai:live
 *
 * The script never prints the API key, prompts, system instructions, raw model
 * output, or raw provider messages. It reports only the neutral classification,
 * the HTTP status, the model name, and latency.
 */

import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';

import { GeminiAiProvider } from '../../dist/src/shared/ai/gemini-ai.provider.js';
import { AiService } from '../../dist/src/shared/ai/ai.service.js';
import { AiProviderError } from '../../dist/src/shared/ai/ai-provider.error.js';
import { ASK_OPERIX_PLAN_JSON_SCHEMA } from '../../dist/src/modules/assistant/assistant.constant.js';
import {
  ASK_OPERIX_PLANNER_SYSTEM_INSTRUCTION,
  buildAskOperixPlannerPrompt,
} from '../../dist/src/modules/assistant/assistant-planner.prompt.js';
import { parseAskOperixPlan } from '../../dist/src/modules/assistant/assistant-planner.validator.js';
import { TASK_AI_DRAFT_JSON_SCHEMA } from '../../dist/src/modules/task/task-ai.constant.js';
import {
  TASK_AI_SYSTEM_INSTRUCTION,
  buildTaskAiUserPrompt,
} from '../../dist/src/modules/task/task-ai.prompt.js';
import { parseTaskAiDraft } from '../../dist/src/modules/task/task-ai.validator.js';
import {
  DASHBOARD_AI_BRIEF_JSON_SCHEMA,
  DASHBOARD_AI_SYSTEM_INSTRUCTION,
} from '../../dist/src/modules/dashboard/dashboard-ai.constant.js';
import { buildDashboardAiPrompt } from '../../dist/src/modules/dashboard/dashboard-ai.prompt.js';
import { parseDashboardAiBrief } from '../../dist/src/modules/dashboard/dashboard-ai.validator.js';
import {
  SUBMISSION_AI_REVIEW_JSON_SCHEMA,
  SUBMISSION_AI_SYSTEM_INSTRUCTION,
} from '../../dist/src/modules/submission/submission-ai.constant.js';
import { buildSubmissionAiUserPrompt } from '../../dist/src/modules/submission/submission-ai.prompt.js';
import { parseSubmissionAiReview } from '../../dist/src/modules/submission/submission-ai.validator.js';
import {
  DOCUMENT_AI_ANALYSIS_JSON_SCHEMA,
  DOCUMENT_AI_SYSTEM_INSTRUCTION,
} from '../../dist/src/modules/document/document-ai.constant.js';
import { buildDocumentAiUserPrompt } from '../../dist/src/modules/document/document-ai.prompt.js';
import { parseDocumentAiAnalysis } from '../../dist/src/modules/document/document-ai.validator.js';
import {
  TASK_ASSIGNMENT_AI_JSON_SCHEMA,
  TASK_ASSIGNMENT_AI_SYSTEM_INSTRUCTION,
} from '../../dist/src/modules/task/task-assignment-ai.constant.js';
import { buildTaskAssignmentAiPrompt } from '../../dist/src/modules/task/task-assignment-ai.prompt.js';
import { parseTaskAssignmentAiDraft } from '../../dist/src/modules/task/task-assignment-ai.validator.js';
import { ASK_OPERIX_ANSWER_JSON_SCHEMA } from '../../dist/src/modules/assistant/assistant.constant.js';
import {
  ASK_OPERIX_ANSWER_SYSTEM_INSTRUCTION,
  buildAskOperixAnswerPrompt,
} from '../../dist/src/modules/assistant/assistant-answer.prompt.js';
import { parseAskOperixAnswer } from '../../dist/src/modules/assistant/assistant-answer.validator.js';

const RUN_LIVE = process.env.RUN_LIVE_AI_TESTS === 'true';

if (!RUN_LIVE) {
  console.log(
    'AI live smoke skipped. Set RUN_LIVE_AI_TESTS=true (and configure GEMINI_API_KEY / GEMINI_MODEL) to run it.',
  );
  process.exit(0);
}

const apiKey = process.env.GEMINI_API_KEY ?? '';
const model = process.env.GEMINI_MODEL ?? '';
const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 30_000);
const aiEnabled = process.env.AI_ENABLED === 'true';

const PROBE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['OK'] },
  },
  required: ['status'],
  additionalProperties: false,
};

const REDACTED = '<redacted>';

function redact(value) {
  const text = String(value ?? '');
  return apiKey.length > 0 ? text.replaceAll(apiKey, REDACTED) : text;
}

function createConfigService(overrides = {}) {
  return {
    get: () => ({
      enabled: aiEnabled,
      provider: process.env.AI_PROVIDER || 'gemini',
      apiKey: overrides.apiKey ?? apiKey,
      model: overrides.model ?? model,
      timeoutMs,
    }),
  };
}

function createProvider(overrides = {}) {
  return new GeminiAiProvider(createConfigService(overrides));
}

function createAiService(provider) {
  return new AiService(createConfigService(), provider);
}

function probeRequest(overrides = {}) {
  return {
    systemInstruction:
      'You are a connectivity probe. Return only the JSON object required by the response schema.',
    userPrompt: 'Report the probe status.',
    responseJsonSchema: PROBE_SCHEMA,
    temperature: 0,
    maxOutputTokens: 64,
    ...overrides,
  };
}

function asProviderError(error) {
  assert.ok(
    error instanceof AiProviderError,
    `expected AiProviderError, received ${error?.constructor?.name ?? typeof error}`,
  );
  return error;
}

function assertClientFailure(error, allowedClassifications) {
  const translated = asProviderError(error);
  assert.equal(translated.kind, 'FAILED');
  assert.notEqual(translated.kind, 'UNAVAILABLE');
  assert.ok(
    allowedClassifications.includes(translated.classification),
    `unexpected classification ${translated.classification}`,
  );
  assert.ok(
    typeof translated.providerStatus === 'number' &&
      translated.providerStatus >= 400 &&
      translated.providerStatus < 500,
    `unexpected provider status ${String(translated.providerStatus)}`,
  );
  return translated;
}

const checks = [];

function check(name, run) {
  checks.push({ name, run });
}

/**
 * A verification tool must not report a false failure when the provider itself
 * returns a transient 5xx. Only an outage-shaped failure is retried, and only
 * here in the smoke. The product retry policy is unchanged: feature services
 * never retry a 5xx.
 *
 * Checks that call the provider directly see an `AiProviderError`; checks that
 * go through `AiService` see the already-mapped `AI_PROVIDER_UNAVAILABLE`
 * AppException, so both shapes are recognised.
 */
function isTransientOutage(error) {
  if (error instanceof AiProviderError) {
    return error.kind === 'UNAVAILABLE';
  }

  const code = error?.getResponse?.()?.code;

  return code === 'AI_PROVIDER_UNAVAILABLE';
}

async function withProviderRetry(run, attempts = 3) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await run();
      return attempt;
    } catch (error) {
      if (!isTransientOutage(error) || attempt === attempts) throw error;

      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }

  return attempts;
}

check(
  'produces a schema-constrained response through the real boundary',
  async () => {
    const service = createAiService(createProvider());
    const result = await service.generate(probeRequest());
    assert.equal(result.model, model);
    assert.deepEqual(JSON.parse(result.text), { status: 'OK' });
  },
);

check('stops waiting when the shared deadline is already aborted', async () => {
  const controller = new AbortController();
  controller.abort();

  const providerError = await createProvider()
    .generate(probeRequest({ signal: controller.signal }))
    .catch((error) => error);

  const translated = asProviderError(providerError);
  assert.equal(translated.kind, 'TIMEOUT');
  assert.equal(translated.classification, 'PROVIDER_TIMEOUT');

  const serviceError = await createAiService(createProvider())
    .generate(probeRequest({ signal: controller.signal }))
    .catch((error) => error);

  const response = serviceError?.getResponse?.();
  assert.equal(response?.code, 'AI_TIMEOUT');
});

check(
  'fails a one-millisecond budget through the neutral contract',
  async () => {
    const error = await createProvider()
      .generate(probeRequest({ timeoutMs: 1 }))
      .catch((caught) => caught);

    const translated = asProviderError(error);
    assert.ok(
      ['TIMEOUT', 'UNAVAILABLE', 'FAILED'].includes(translated.kind),
      `unexpected kind ${translated.kind}`,
    );
  },
);

check('classifies a rejected credential as a client failure', async () => {
  const error = await createProvider({
    apiKey: 'operix-live-smoke-invalid-key',
  })
    .generate(probeRequest())
    .catch((caught) => caught);

  const translated = assertClientFailure(error, [
    'PROVIDER_AUTH_REJECTED',
    'PROVIDER_FORBIDDEN',
    'PROVIDER_BAD_REQUEST',
  ]);
  assert.ok(
    !redact(translated.message).includes('operix-live-smoke-invalid-key'),
  );
});

check('classifies an unknown model as a client failure', async () => {
  const error = await createProvider({
    model: 'operix-model-that-does-not-exist',
  })
    .generate(probeRequest())
    .catch((caught) => caught);

  assertClientFailure(error, [
    'PROVIDER_MODEL_NOT_FOUND',
    'PROVIDER_BAD_REQUEST',
    'PROVIDER_FORBIDDEN',
  ]);
});

async function plan(question) {
  const provider = createProvider();
  const result = await provider.generate({
    systemInstruction: ASK_OPERIX_PLANNER_SYSTEM_INSTRUCTION,
    userPrompt: buildAskOperixPlannerPrompt('ADMIN', question),
    responseJsonSchema: ASK_OPERIX_PLAN_JSON_SCHEMA,
    temperature: 0.1,
    maxOutputTokens: 600,
  });

  const parsed = parseAskOperixPlan(result.text);
  assert.equal(
    parsed.ok,
    true,
    `planner output failed validation: ${parsed.ok ? '' : parsed.reason}`,
  );
  return parsed.value;
}

check(
  'accepts the Ask Operix oneOf planner schema for a Task question',
  async () => {
    const value = await plan('Show my overdue high priority Tasks.');

    assert.equal(value.intent, 'TASK_QUERY');
    assert.ok(['COUNT', 'LIST', 'SUMMARY'].includes(value.responseMode));
  },
);

check(
  'accepts the Ask Operix oneOf planner schema for an operations question',
  async () => {
    const value = await plan('Give me a 30 day operational summary.');

    assert.equal(value.intent, 'OPERATIONS_SNAPSHOT');
    assert.equal(value.days, 30);
  },
);

/**
 * Feature-by-feature contract checks.
 *
 * The probe above proves transport, schema plumbing, and failure translation.
 * These checks prove the part that unit tests cannot: that the real model obeys
 * each feature's actual system instruction and response schema, and that the
 * real validator accepts the result. A schema the validator rejects (the old
 * Ask Operix planner bug) fails here.
 */
async function generateForFeature(request) {
  const result = await createProvider().generate({
    temperature: 0.2,
    maxOutputTokens: 3_000,
    ...request,
  });

  return result.text;
}

function assertValid(parsed, label) {
  assert.equal(
    parsed.ok,
    true,
    `${label} failed validation: ${parsed.ok ? '' : parsed.reason}`,
  );
  return parsed;
}

function adminDashboardContext() {
  const statusCounts = {
    PENDING: 1,
    ASSIGNED: 2,
    IN_PROGRESS: 6,
    SUBMITTED: 1,
    UNDER_REVIEW: 1,
    COMPLETED: 17,
    REVISION_REQUIRED: 1,
    RESUBMITTED: 0,
    CANCELLED: 0,
  };
  const points = Array.from({ length: 7 }, (_, index) => ({
    date: `2026-11-${String(13 + index).padStart(2, '0')}`,
    completedTasks: index === 4 ? 5 : index % 2,
  }));

  return {
    role: 'ADMIN',
    asOf: '2026-11-19T04:00:00.000Z',
    period: 'LAST_7_DAYS',
    trendDays: 7,
    kpis: {
      totalMembers: 4,
      totalTeamTasks: 29,
      activeTeamTasks: 9,
      completedTasks: 17,
      overdueTasks: 3,
      reviewQueueTasks: 2,
      revisionRequiredTasks: 1,
      dueSoonTasks: 2,
      completionRate: 74,
    },
    taskStatusCounts: statusCounts,
    managementReports: {
      statusCounts: { DRAFT: 1, SUBMITTED: 2, ACKNOWLEDGED: 1 },
      scope: 'CURRENT_MONTH',
    },
    teams: [
      {
        name: 'Quality Control',
        activeMembers: 4,
        activeTasks: 9,
        overdueTasks: 3,
        reviewQueueTasks: 2,
        revisionRequiredTasks: 1,
      },
    ],
    teamSummary: {
      activeTasks: 9,
      overdueTasks: 3,
      reviewQueueTasks: 2,
      revisionRequiredTasks: 1,
      statusCounts,
    },
    members: [
      {
        name: 'Member A',
        teamName: 'Quality Control',
        activeTasks: 5,
        overdueTasks: 2,
        statusCounts,
        activePriorityCounts: { LOW: 0, MEDIUM: 1, HIGH: 3, URGENT: 1 },
      },
    ],
    completionTrend: {
      points,
      completedInWindow: 17,
      recentWindowDays: 7,
      recentWindowCompleted: 17,
      priorWindowDays: null,
      priorWindowCompleted: null,
      peakDay: { date: '2026-11-17', completedTasks: 5 },
      zeroCompletionDays: 3,
    },
    recentActivity: [
      {
        action: 'TASK_COMPLETED',
        entityType: 'TASK',
        actorName: 'Member A',
        createdAt: '2026-11-18T09:00:00.000Z',
      },
    ],
  };
}

function candidateMetrics(overrides = {}) {
  return {
    activeTasks: 4,
    overdueTasks: 1,
    activeUrgentTasks: 0,
    activeHighTasks: 2,
    completionRate: 88,
    onTimeRate: 92,
    averageCompletionMinutes: 640,
    completedTasks: 24,
    completedWithDeadline: 20,
    relevantCategoryCompletedTasks: 6,
    relevantCategoryOnTimeTasks: 5,
    ...overrides,
  };
}

check('drafts a Task through the real Task AI contract', async () => {
  const raw = await generateForFeature({
    systemInstruction: TASK_AI_SYSTEM_INSTRUCTION,
    userPrompt: buildTaskAiUserPrompt({
      prompt:
        'Create a high priority task to review the cold chain temperature logs for this week and flag every excursion to the quality lead.',
      today: '2026-11-19',
      businessTimezone: 'Asia/Dhaka',
    }),
    responseJsonSchema: TASK_AI_DRAFT_JSON_SCHEMA,
  });

  const parsed = assertValid(parseTaskAiDraft(raw), 'Task AI draft');
  assert.ok(parsed.draft.title.length > 0);
  assert.ok(
    ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(
      parsed.draft.suggestedPriority,
    ),
  );
});

check(
  'produces a Dashboard brief through the real brief contract',
  async () => {
    const context = adminDashboardContext();
    const raw = await generateForFeature({
      systemInstruction: DASHBOARD_AI_SYSTEM_INSTRUCTION,
      userPrompt: buildDashboardAiPrompt(context),
      responseJsonSchema: DASHBOARD_AI_BRIEF_JSON_SCHEMA,
    });

    const parsed = assertValid(parseDashboardAiBrief(raw), 'Dashboard brief');
    assert.ok(parsed.brief.headline.length > 0);
    assert.ok(parsed.brief.priorities.length <= 5);
  },
);

check('reviews a Submission through the real review contract', async () => {
  const prompt = buildSubmissionAiUserPrompt({
    businessDate: '2026-11-19',
    businessTimezone: 'Asia/Dhaka',
    taskTitle: 'Review cold chain temperature logs',
    taskDescription:
      'Review the weekly logger export and flag every excursion to the quality lead.',
    taskRemarks: 'Compliance relevant, second reviewer required.',
    taskPriority: 'HIGH',
    taskStatus: 'SUBMITTED',
    taskDueAt: new Date('2026-11-21T09:00:00.000Z'),
    submissionVersion: 1,
    submittedAt: new Date('2026-11-18T10:00:00.000Z'),
    submissionText:
      'Reviewed all seven days of logger data. One excursion occurred on 2026-11-15 between 02:00 and 04:00 when the cold room reached 11.2 degrees. The excursion was reported to the quality lead the same morning and a CAPA was opened.',
    attachments: [
      {
        originalName: 'logger-export.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12_000,
        contentStatus: 'EXTRACTED',
        extractedText:
          'Cold chain logger export. 2026-11-15 02:00 to 04:00 peak 11.2 C. All other readings between 2 and 8 C.',
      },
    ],
    attachmentsTruncated: false,
    previousRevision: null,
  });

  const raw = await generateForFeature({
    systemInstruction: SUBMISSION_AI_SYSTEM_INSTRUCTION,
    userPrompt: prompt.userPrompt,
    responseJsonSchema: SUBMISSION_AI_REVIEW_JSON_SCHEMA,
  });

  const parsed = assertValid(
    parseSubmissionAiReview(raw),
    'Submission AI review',
  );
  assert.ok(parsed.review.summary.length > 0);
});

check('analyzes a Document through the real analysis contract', async () => {
  const raw = await generateForFeature({
    systemInstruction: DOCUMENT_AI_SYSTEM_INSTRUCTION,
    userPrompt: buildDocumentAiUserPrompt({
      documentName: 'batch-record.pdf',
      format: 'PDF',
      text: [
        'Batch record for paracetamol 500 mg, batch number BR-2026-0417.',
        'Manufacturing date 2026-11-02. Expiry date 2028-11-01.',
        'Step 4 blending completed by Operator R. Hasan and verified by Supervisor S. Akter.',
        'Step 7 compression recorded a mean weight of 498 mg with one deviation investigated under QA-118.',
        'The record is pending final QA release sign-off by the Quality Manager.',
      ].join('\n'),
    }),
    responseJsonSchema: DOCUMENT_AI_ANALYSIS_JSON_SCHEMA,
  });

  const parsed = assertValid(
    parseDocumentAiAnalysis(raw),
    'Document AI analysis',
  );
  assert.ok(parsed.analysis.summary.length > 0);
});

check(
  'recommends an assignee through the real assignment contract',
  async () => {
    const raw = await generateForFeature({
      systemInstruction: TASK_ASSIGNMENT_AI_SYSTEM_INSTRUCTION,
      userPrompt: buildTaskAssignmentAiPrompt({
        task: {
          title: 'Review cold chain temperature logs',
          description:
            'Review the weekly logger export and flag every excursion to the quality lead.',
          remarks: 'Compliance relevant.',
          priority: 'HIGH',
          dueAt: '2026-11-21T09:00:00.000Z',
          completionMode: 'REVIEW_REQUIRED',
          scope: 'TEAM',
          teamName: 'Quality Control',
          categoryName: 'Compliance',
        },
        candidates: [
          {
            candidateRef: 'C01',
            teamName: 'Quality Control',
            designation: 'Senior Officer',
            metrics: candidateMetrics({
              activeTasks: 2,
              overdueTasks: 0,
              completionRate: 95,
              onTimeRate: 96,
            }),
          },
          {
            candidateRef: 'C02',
            teamName: 'Quality Control',
            designation: 'Officer',
            metrics: candidateMetrics({ activeTasks: 6, overdueTasks: 3 }),
          },
        ],
      }),
      responseJsonSchema: TASK_ASSIGNMENT_AI_JSON_SCHEMA,
    });

    const parsed = assertValid(
      parseTaskAssignmentAiDraft(raw, new Set(['C01', 'C02'])),
      'Assignment AI recommendation',
    );
    assert.ok(parsed.draft.summary.length > 0);
  },
);

check(
  'answers an Ask Operix question through the real answer contract',
  async () => {
    const raw = await generateForFeature({
      systemInstruction: ASK_OPERIX_ANSWER_SYSTEM_INSTRUCTION,
      userPrompt: buildAskOperixAnswerPrompt({
        question: 'Which of my overdue Tasks are high priority?',
        facts: {
          scope: 'Assigned to the viewer',
          tasks: [
            {
              ref: 'T01',
              title: 'Review cold chain temperature logs',
              status: 'IN_PROGRESS',
              priority: 'HIGH',
              overdue: true,
            },
            {
              ref: 'T02',
              title: 'Update standard operating procedure',
              status: 'IN_PROGRESS',
              priority: 'MEDIUM',
              overdue: true,
            },
          ],
        },
      }),
      responseJsonSchema: ASK_OPERIX_ANSWER_JSON_SCHEMA,
    });

    const parsed = assertValid(
      parseAskOperixAnswer(raw, new Set(['T01', 'T02'])),
      'Ask Operix answer',
    );
    assert.ok(parsed.value.answer.length > 0);
    for (const ref of parsed.value.referencedTaskRefs) {
      assert.ok(
        ['T01', 'T02'].includes(ref),
        `unexpected Task reference ${ref}`,
      );
    }
  },
);

async function main() {
  assert.ok(apiKey.length > 0, 'GEMINI_API_KEY is empty.');
  assert.ok(model.length > 0, 'GEMINI_MODEL is empty.');
  assert.ok(
    Number.isFinite(timeoutMs) && timeoutMs > 0,
    'AI_TIMEOUT_MS must be a positive number.',
  );
  assert.ok(
    aiEnabled,
    'AI_ENABLED must be true to exercise the live provider.',
  );

  console.log(
    `AI live smoke: provider=${process.env.AI_PROVIDER || 'gemini'} model=${model} timeoutMs=${timeoutMs}`,
  );

  let failures = 0;

  for (const entry of checks) {
    const startedAt = Date.now();
    try {
      const attempts = await withProviderRetry(entry.run);
      const retried = attempts > 1 ? `, attempts=${attempts}` : '';
      console.log(
        `  PASS  ${entry.name} (${Date.now() - startedAt} ms${retried})`,
      );
    } catch (error) {
      failures += 1;
      console.error(
        `  FAIL  ${entry.name} (${Date.now() - startedAt} ms): ${redact(
          error?.message,
        )}`,
      );
    }
  }

  if (failures > 0) {
    console.error(
      `AI live smoke: ${failures} of ${checks.length} checks failed.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`AI live smoke: all ${checks.length} checks passed.`);
}

await main();
