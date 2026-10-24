import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserRole } from '../../../generated/prisma/enums';
import { AccountStatusGuard } from '../../../src/shared/auth/account-status.guard';
import { OPERIX_REQUIRED_ROLES_METADATA_KEY } from '../../../src/shared/auth/auth-metadata.constant';
import { OperixRoleGuard } from '../../../src/shared/auth/operix-role.guard';
import { ViewerContextGuard } from '../../../src/shared/auth/viewer-context.guard';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import { OperixUserThrottlerGuard } from '../../../src/shared/rate-limit/operix-user-throttler.guard';
import { SubmissionAiController } from '../../../src/modules/submission/submission-ai.controller';
import type { SubmissionAiService } from '../../../src/modules/submission/submission-ai.service';

const jestApi = import.meta.jest;

/** `@Throttle` namespaces its metadata with the default throttler name. */
const THROTTLER_LIMIT_METADATA_KEY = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_METADATA_KEY = 'THROTTLER:TTLdefault';

function analyzeHandler(): object {
  const handlers = SubmissionAiController.prototype as unknown as {
    analyze: object;
  };

  return handlers.analyze;
}

describe('SubmissionAiController route contract', () => {
  it('is mounted below the submission surface and scoped by submission id', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SubmissionAiController)).toBe(
      'submissions/:submissionId/ai-review',
    );
  });

  it('runs viewer, account-status, role, then per-user throttle guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SubmissionAiController),
    ).toEqual([
      ViewerContextGuard,
      AccountStatusGuard,
      OperixRoleGuard,
      OperixUserThrottlerGuard,
    ]);
  });
});

describe('SubmissionAiController authorization contract', () => {
  it('permits only Admins, matching the real review authority', () => {
    expect(
      Reflect.getMetadata(OPERIX_REQUIRED_ROLES_METADATA_KEY, analyzeHandler()),
    ).toEqual([UserRole.ADMIN]);
  });

  it('does not grant the route to Super Admin or Members', () => {
    const roles = Reflect.getMetadata(
      OPERIX_REQUIRED_ROLES_METADATA_KEY,
      analyzeHandler(),
    ) as UserRole[];

    expect(roles).not.toContain(UserRole.SUPER_ADMIN);
    expect(roles).not.toContain(UserRole.MEMBER);
  });
});

describe('SubmissionAiController request budget', () => {
  it('caps analysis to six requests per minute per bucket', () => {
    expect(
      Reflect.getMetadata(THROTTLER_LIMIT_METADATA_KEY, analyzeHandler()),
    ).toBe(6);
    expect(
      Reflect.getMetadata(THROTTLER_TTL_METADATA_KEY, analyzeHandler()),
    ).toBe(60_000);
  });
});

describe('SubmissionAiController delegation', () => {
  it('forwards the viewer and submission id without a request body', () => {
    const analyze = jestApi.fn().mockResolvedValue({ summary: 'review' });
    const service = { analyze } as unknown as SubmissionAiService;
    const controller = new SubmissionAiController(service);
    const viewer = {
      userId: 'admin-a',
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      scope: { type: 'ADMIN', teamIds: ['team-a'] },
    } as unknown as OperixViewer;

    void controller.analyze(viewer, 'submission-a');

    expect(analyze).toHaveBeenCalledWith(viewer, 'submission-a');
  });
});
