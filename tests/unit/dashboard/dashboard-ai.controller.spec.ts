import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { UserRole } from '../../../generated/prisma/enums';
import { AccountStatusGuard } from '../../../src/shared/auth/account-status.guard';
import { OPERIX_REQUIRED_ROLES_METADATA_KEY } from '../../../src/shared/auth/auth-metadata.constant';
import { OperixRoleGuard } from '../../../src/shared/auth/operix-role.guard';
import { ViewerContextGuard } from '../../../src/shared/auth/viewer-context.guard';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import { OperixUserThrottlerGuard } from '../../../src/shared/rate-limit/operix-user-throttler.guard';
import { DashboardAiController } from '../../../src/modules/dashboard/dashboard-ai.controller';
import type { DashboardAiService } from '../../../src/modules/dashboard/dashboard-ai.service';

const jestApi = import.meta.jest;
const THROTTLER_LIMIT_METADATA_KEY = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_METADATA_KEY = 'THROTTLER:TTLdefault';

function handler(): object {
  return (DashboardAiController.prototype as unknown as { generate: object })
    .generate;
}

describe('DashboardAiController', () => {
  it('uses the Dashboard route and the normal authenticated guard chain', () => {
    expect(Reflect.getMetadata(PATH_METADATA, DashboardAiController)).toBe(
      'dashboard',
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, DashboardAiController)).toEqual(
      [
        ViewerContextGuard,
        AccountStatusGuard,
        OperixRoleGuard,
        OperixUserThrottlerGuard,
      ],
    );
  });

  it('allows Super Admin and Admin but not Member', () => {
    expect(
      Reflect.getMetadata(OPERIX_REQUIRED_ROLES_METADATA_KEY, handler()),
    ).toEqual([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
  });

  it('uses a four request per minute user throttle', () => {
    expect(Reflect.getMetadata(THROTTLER_LIMIT_METADATA_KEY, handler())).toBe(
      4,
    );
    expect(Reflect.getMetadata(THROTTLER_TTL_METADATA_KEY, handler())).toBe(
      60_000,
    );
  });

  it('defaults to seven days and forwards an explicit period', () => {
    const generate = jestApi.fn().mockResolvedValue({ headline: 'brief' });
    const controller = new DashboardAiController({
      generate,
    } as unknown as DashboardAiService);
    const viewer = { role: UserRole.ADMIN } as OperixViewer;
    void controller.generate(viewer, {});
    void controller.generate(viewer, { days: 30 });
    expect(generate).toHaveBeenNthCalledWith(1, viewer, 7);
    expect(generate).toHaveBeenNthCalledWith(2, viewer, 30);
  });
});
