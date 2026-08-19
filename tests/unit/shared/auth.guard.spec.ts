import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import { OperixAuthService } from '../../../src/modules/auth/auth.service';
import { AccountStatusGuard } from '../../../src/shared/auth/account-status.guard';
import { getCurrentViewerFromContext } from '../../../src/shared/auth/current-viewer.decorator';
import { OperixRoleGuard } from '../../../src/shared/auth/operix-role.guard';
import type { OperixRequest } from '../../../src/shared/auth/operix-request.interface';
import { OPERIX_REQUIRED_ROLES_METADATA_KEY } from '../../../src/shared/auth/auth-metadata.constant';
import { ViewerContextGuard } from '../../../src/shared/auth/viewer-context.guard';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';

const jestApi = import.meta.jest;

function createViewer(overrides: Partial<OperixViewer> = {}): OperixViewer {
  return {
    userId: 'user-a',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    scope: {
      type: 'ADMIN',
      teamIds: ['team-a'],
    },
    ...overrides,
  };
}

function createExecutionContext(request: OperixRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
    getHandler: () => createExecutionContext,
    getClass: () => AccountStatusGuard,
  } as unknown as ExecutionContext;
}

function expectAppException(
  error: unknown,
  input: {
    status: number;
    code: string;
  },
): void {
  expect(error).toBeInstanceOf(Error);

  const exception = error as {
    getStatus: () => number;
    getResponse: () => unknown;
  };

  expect(exception.getStatus()).toBe(input.status);
  expect(exception.getResponse()).toMatchObject({
    code: input.code,
  });
}

describe('ViewerContextGuard', () => {
  it('hydrates the Operix viewer from the authenticated request user', async () => {
    const viewer = createViewer();
    const getViewer = jestApi.fn().mockResolvedValue(viewer);
    const guard = new ViewerContextGuard({
      getViewer,
    } as unknown as OperixAuthService);
    const request = {
      user: {
        id: 'user-a',
      },
    } as OperixRequest;

    await expect(
      guard.canActivate(createExecutionContext(request)),
    ).resolves.toBe(true);

    expect(getViewer).toHaveBeenCalledWith('user-a');
    expect(request.operixViewer).toBe(viewer);
  });

  it('rejects a request without an authenticated user id', async () => {
    const guard = new ViewerContextGuard({
      getViewer: jestApi.fn(),
    } as unknown as OperixAuthService);

    try {
      await guard.canActivate(createExecutionContext({} as OperixRequest));
      throw new Error('Expected guard to reject.');
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.UNAUTHORIZED,
        code: APP_ERROR_CODE.AUTH_REQUIRED,
      });
    }
  });
});

describe('AccountStatusGuard', () => {
  const guard = new AccountStatusGuard();

  it('allows active viewers', () => {
    const context = createExecutionContext({
      operixViewer: createViewer(),
    } as OperixRequest);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('treats a missing hydrated viewer as authentication required', () => {
    expect(() =>
      guard.canActivate(createExecutionContext({} as OperixRequest)),
    ).toThrow();

    try {
      guard.canActivate(createExecutionContext({} as OperixRequest));
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.UNAUTHORIZED,
        code: APP_ERROR_CODE.AUTH_REQUIRED,
      });
    }
  });

  it('blocks inactive accounts', () => {
    const context = createExecutionContext({
      operixViewer: createViewer({ status: UserStatus.INACTIVE }),
    } as OperixRequest);

    try {
      guard.canActivate(context);
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.FORBIDDEN,
        code: APP_ERROR_CODE.ACCOUNT_INACTIVE,
      });
    }
  });

  it('blocks suspended accounts', () => {
    const context = createExecutionContext({
      operixViewer: createViewer({ status: UserStatus.SUSPENDED }),
    } as OperixRequest);

    try {
      guard.canActivate(context);
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.FORBIDDEN,
        code: APP_ERROR_CODE.ACCOUNT_SUSPENDED,
      });
    }
  });
});

describe('OperixRoleGuard', () => {
  it('allows hydrated viewers when no roles are required', () => {
    const reflector = {
      getAllAndOverride: jestApi.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new OperixRoleGuard(reflector);

    expect(
      guard.canActivate(
        createExecutionContext({
          operixViewer: createViewer({ role: UserRole.MEMBER }),
        } as OperixRequest),
      ),
    ).toBe(true);
  });

  it('allows matching roles', () => {
    const reflector = {
      getAllAndOverride: jestApi
        .fn()
        .mockReturnValue([UserRole.SUPER_ADMIN, UserRole.ADMIN]),
    } as unknown as Reflector;
    const guard = new OperixRoleGuard(reflector);

    expect(
      guard.canActivate(
        createExecutionContext({
          operixViewer: createViewer({ role: UserRole.ADMIN }),
        } as OperixRequest),
      ),
    ).toBe(true);
  });

  it('rejects missing hydrated viewers as authentication required', () => {
    const guard = new OperixRoleGuard(new Reflector());

    try {
      guard.canActivate(createExecutionContext({} as OperixRequest));
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.UNAUTHORIZED,
        code: APP_ERROR_CODE.AUTH_REQUIRED,
      });
    }
  });

  it('rejects wrong roles as forbidden', () => {
    const reflector = {
      getAllAndOverride: jestApi.fn((key: string) =>
        key === OPERIX_REQUIRED_ROLES_METADATA_KEY
          ? [UserRole.SUPER_ADMIN]
          : [],
      ),
    } as unknown as Reflector;
    const guard = new OperixRoleGuard(reflector);

    try {
      guard.canActivate(
        createExecutionContext({
          operixViewer: createViewer({ role: UserRole.MEMBER }),
        } as OperixRequest),
      );
    } catch (error) {
      expectAppException(error, {
        status: HttpStatus.FORBIDDEN,
        code: APP_ERROR_CODE.FORBIDDEN,
      });
    }
  });
});

describe('CurrentViewer', () => {
  it('returns the already hydrated viewer from the request', () => {
    const viewer = createViewer();

    expect(
      getCurrentViewerFromContext(
        createExecutionContext({
          operixViewer: viewer,
        } as OperixRequest),
      ),
    ).toBe(viewer);
  });
});
