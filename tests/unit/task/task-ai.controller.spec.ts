import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserRole } from '../../../generated/prisma/enums';
import { AccountStatusGuard } from '../../../src/shared/auth/account-status.guard';
import { OPERIX_REQUIRED_ROLES_METADATA_KEY } from '../../../src/shared/auth/auth-metadata.constant';
import { OperixRoleGuard } from '../../../src/shared/auth/operix-role.guard';
import { ViewerContextGuard } from '../../../src/shared/auth/viewer-context.guard';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import { OperixUserThrottlerGuard } from '../../../src/shared/rate-limit/operix-user-throttler.guard';
import { TaskAiController } from '../../../src/modules/task/task-ai.controller';
import type { TaskAiService } from '../../../src/modules/task/task-ai.service';

const jestApi = import.meta.jest;

/** `@Throttle` namespaces its metadata with the default throttler name. */
const THROTTLER_LIMIT_METADATA_KEY = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_METADATA_KEY = 'THROTTLER:TTLdefault';

function draftHandler(): object {
  const handlers = TaskAiController.prototype as unknown as { draft: object };

  return handlers.draft;
}

describe('TaskAiController route contract', () => {
  it('is mounted below the tasks surface', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TaskAiController)).toBe(
      'tasks/ai',
    );
  });

  it('runs viewer, account-status, role, then per-user throttle guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, TaskAiController)).toEqual([
      ViewerContextGuard,
      AccountStatusGuard,
      OperixRoleGuard,
      OperixUserThrottlerGuard,
    ]);
  });
});

describe('TaskAiController authorization contract', () => {
  it('permits only Super Admin and Admin', () => {
    expect(
      Reflect.getMetadata(OPERIX_REQUIRED_ROLES_METADATA_KEY, draftHandler()),
    ).toEqual([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
  });

  it('does not grant the route to Members', () => {
    const roles = Reflect.getMetadata(
      OPERIX_REQUIRED_ROLES_METADATA_KEY,
      draftHandler(),
    ) as UserRole[];

    expect(roles).not.toContain(UserRole.MEMBER);
  });
});

describe('TaskAiController request budget', () => {
  it('caps drafting to eight requests per minute per bucket', () => {
    expect(
      Reflect.getMetadata(THROTTLER_LIMIT_METADATA_KEY, draftHandler()),
    ).toBe(8);
    expect(
      Reflect.getMetadata(THROTTLER_TTL_METADATA_KEY, draftHandler()),
    ).toBe(60_000);
  });
});

describe('TaskAiController delegation', () => {
  it('forwards the viewer and the prompt-only body to the service', () => {
    const draft = jestApi.fn().mockResolvedValue({ title: 'draft' });
    const service = { draft } as unknown as TaskAiService;
    const controller = new TaskAiController(service);
    const viewer = {
      userId: 'admin-a',
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      scope: { type: 'GLOBAL' },
    } as unknown as OperixViewer;
    const dto = { prompt: 'Prepare the monthly workload report' };

    void controller.draft(viewer, dto);

    expect(draft).toHaveBeenCalledWith(viewer, dto);
  });
});
