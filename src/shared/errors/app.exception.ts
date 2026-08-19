import { HttpException } from '@nestjs/common';

export class AppException extends HttpException {
  constructor(
    status: number,
    code: string,
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
