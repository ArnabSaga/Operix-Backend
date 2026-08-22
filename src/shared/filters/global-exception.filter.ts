import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorResponse } from '../errors/api-error-response.js';

const statusCodes: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'AUTH_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMessage(response: unknown, fallback: string): string {
  if (typeof response === 'string') {
    return response;
  }
  if (!isRecord(response)) {
    return fallback;
  }

  const message = response.message;
  if (typeof message === 'string') {
    return message;
  }
  if (
    Array.isArray(message) &&
    message.every((item) => typeof item === 'string')
  ) {
    return 'Validation failed';
  }

  return fallback;
}

function readDetails(response: unknown): unknown {
  if (!isRecord(response)) {
    return null;
  }
  if (response.details !== undefined) {
    return response.details;
  }
  if (Array.isArray(response.message)) {
    return response.message;
  }

  return null;
}

function readCode(response: unknown, status: number): string {
  if (isRecord(response) && typeof response.code === 'string') {
    return response.code;
  }

  return statusCodes[status] ?? 'HTTP_ERROR';
}

function isMulterError(
  value: unknown,
): value is { code: string; message: string } {
  return (
    isRecord(value) &&
    value.name === 'MulterError' &&
    typeof value.code === 'string'
  );
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (isMulterError(exception)) {
      const status =
        exception.code === 'LIMIT_FILE_SIZE'
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : HttpStatus.BAD_REQUEST;
      const code =
        exception.code === 'LIMIT_FILE_SIZE'
          ? 'FILE_TOO_LARGE'
          : exception.code === 'LIMIT_FILE_COUNT'
            ? 'TOO_MANY_FILES'
            : 'VALIDATION_ERROR';

      response.status(status).json({
        success: false,
        message:
          exception.code === 'LIMIT_FILE_SIZE'
            ? 'File is too large.'
            : exception.code === 'LIMIT_FILE_COUNT'
              ? 'Too many files were uploaded.'
              : 'Invalid multipart upload.',
        code,
        details: null,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const body: ApiErrorResponse = {
        success: false,
        message: readMessage(exceptionResponse, exception.message),
        code: readCode(exceptionResponse, status),
        details: readDetails(exceptionResponse),
      };
      response.status(status).json(body);
      return;
    }

    const body: ApiErrorResponse = {
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      details: null,
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}
