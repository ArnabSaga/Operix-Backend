import { HttpException } from '@nestjs/common';
import type { AppErrorCode } from './app-error-code.constant.js';

export class AppException extends HttpException {
  constructor(
    status: number,
    code: AppErrorCode,
    message: string,
    details: unknown = null,
  ) {
    super(
      {
        message,
        code,
        details,
      },
      status,
    );
  }
}
