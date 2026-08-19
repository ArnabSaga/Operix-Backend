import { HttpStatus } from '@nestjs/common';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant';
import { AppException } from '../../../src/shared/errors/app.exception';

describe('AppException', () => {
  it('stores status and compact error payload for the global filter', () => {
    const exception = new AppException(
      HttpStatus.FORBIDDEN,
      APP_ERROR_CODE.FORBIDDEN,
      'Access denied.',
      {
        reason: 'role',
      },
    );

    expect(exception.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(exception.getResponse()).toEqual({
      message: 'Access denied.',
      code: APP_ERROR_CODE.FORBIDDEN,
      details: {
        reason: 'role',
      },
    });
  });
});
