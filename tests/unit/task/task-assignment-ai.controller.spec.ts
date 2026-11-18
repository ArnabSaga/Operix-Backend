import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserRole } from '../../../generated/prisma/enums';
import { TaskAssignmentAiController } from '../../../src/modules/task/task-assignment-ai.controller';
import type { TaskAssignmentAiService } from '../../../src/modules/task/task-assignment-ai.service';
import { OPERIX_REQUIRED_ROLES_METADATA_KEY } from '../../../src/shared/auth/auth-metadata.constant';
import { AccountStatusGuard } from '../../../src/shared/auth/account-status.guard';
import { OperixRoleGuard } from '../../../src/shared/auth/operix-role.guard';
import { ViewerContextGuard } from '../../../src/shared/auth/viewer-context.guard';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import { OperixUserThrottlerGuard } from '../../../src/shared/rate-limit/operix-user-throttler.guard';

const jestApi = import.meta.jest;
const LIMIT = 'THROTTLER:LIMITdefault';
const TTL = 'THROTTLER:TTLdefault';

function handler(): object {
  return (
    TaskAssignmentAiController.prototype as unknown as { generate: object }
  ).generate;
}

describe('TaskAssignmentAiController', () => {
  it('uses the tasks route, authorized roles, guard order, and five per minute limit', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TaskAssignmentAiController)).toBe(
      'tasks',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, TaskAssignmentAiController),
    ).toEqual([
      ViewerContextGuard,
      AccountStatusGuard,
      OperixRoleGuard,
      OperixUserThrottlerGuard,
    ]);
    expect(
      Reflect.getMetadata(OPERIX_REQUIRED_ROLES_METADATA_KEY, handler()),
    ).toEqual([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
    expect(Reflect.getMetadata(LIMIT, handler())).toBe(5);
    expect(Reflect.getMetadata(TTL, handler())).toBe(60_000);
  });

  it('delegates without a request body', () => {
    const generate = jestApi.fn();
    const controller = new TaskAssignmentAiController({
      generate,
    } as unknown as TaskAssignmentAiService);
    const viewer = { userId: 'admin-db' } as OperixViewer;

    void controller.generate(viewer, 'task-public');

    expect(generate).toHaveBeenCalledWith(viewer, 'task-public');
  });
});
