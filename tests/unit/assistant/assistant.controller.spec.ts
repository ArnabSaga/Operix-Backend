import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserRole } from '../../../generated/prisma/enums';
import { AssistantController } from '../../../src/modules/assistant/assistant.controller';
import type { AssistantService } from '../../../src/modules/assistant/assistant.service';
import { AccountStatusGuard } from '../../../src/shared/auth/account-status.guard';
import { OPERIX_REQUIRED_ROLES_METADATA_KEY } from '../../../src/shared/auth/auth-metadata.constant';
import { OperixRoleGuard } from '../../../src/shared/auth/operix-role.guard';
import { ViewerContextGuard } from '../../../src/shared/auth/viewer-context.guard';
import { OperixUserThrottlerGuard } from '../../../src/shared/rate-limit/operix-user-throttler.guard';

const THROTTLER_LIMIT_METADATA_KEY = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_METADATA_KEY = 'THROTTLER:TTLdefault';

describe('AssistantController', () => {
  it('uses the authenticated all role route with a four request throttle', () => {
    const handler = (
      AssistantController.prototype as unknown as { ask: object }
    ).ask;
    expect(Reflect.getMetadata(PATH_METADATA, AssistantController)).toBe(
      'assistant',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, AssistantController)).toEqual([
      ViewerContextGuard,
      AccountStatusGuard,
      OperixRoleGuard,
      OperixUserThrottlerGuard,
    ]);
    expect(
      Reflect.getMetadata(OPERIX_REQUIRED_ROLES_METADATA_KEY, handler),
    ).toEqual([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER]);
    expect(Reflect.getMetadata(THROTTLER_LIMIT_METADATA_KEY, handler)).toBe(4);
    expect(Reflect.getMetadata(THROTTLER_TTL_METADATA_KEY, handler)).toBe(
      60_000,
    );
  });

  it('forwards only the authenticated viewer and validated question', () => {
    const ask = import.meta.jest.fn();
    const controller = new AssistantController({
      ask,
    } as unknown as AssistantService);
    const viewer = { role: UserRole.MEMBER } as never;
    void controller.ask(viewer, { question: 'Show my Tasks' });
    expect(ask).toHaveBeenCalledWith(viewer, 'Show my Tasks');
  });
});
