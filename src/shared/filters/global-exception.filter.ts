import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorResponse } from '../errors/api-error-response.js';

const statusCodes: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'AUTH_REQUIRED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'RESOURCE_NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
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

function readRetryAfter(response: unknown): number | null {
  if (!isRecord(response) || !isRecord(response.details)) return null;
  const value = response.details.retryAfter;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.max(1, Math.ceil(value));
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
  private readonly logger = new Logger(GlobalExceptionFilter.name);

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
      if (status === 429) {
        const retryAfter = readRetryAfter(exceptionResponse);
        if (retryAfter !== null) {
          response.setHeader('Retry-After', String(retryAfter));
        }
      }
      response.status(status).json(body);
      return;
    }

    const body: ApiErrorResponse = {
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      details: null,
    };
    this.logUnexpectedException(exception, host);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }

  private logUnexpectedException(
    exception: unknown,
    host: ArgumentsHost,
  ): void {
    try {
      const rawRequest: unknown = host.switchToHttp().getRequest?.();
      const request =
        isRecord(rawRequest) &&
        (typeof rawRequest.method === 'string' ||
          typeof rawRequest.url === 'string' ||
          isRecord(rawRequest.route))
          ? (rawRequest as {
              method?: unknown;
              url?: unknown;
              route?: { path?: unknown };
            })
          : undefined;
      const method =
        typeof request?.method === 'string' ? request.method : null;
      const url = typeof request?.url === 'string' ? request.url : null;
      const routePath =
        typeof request?.route?.path === 'string' ? request.route.path : null;
      const name =
        exception instanceof Error
          ? exception.name || 'Error'
          : typeof exception === 'object' && exception !== null
            ? 'NonErrorObject'
            : typeof exception;
      const rawMessage =
        exception instanceof Error ? exception.message : String(exception);
      const stack =
        exception instanceof Error ? (exception.stack ?? null) : null;
      const prismaCode = readPrismaCode(exception);

      this.logger.error(
        [
          'Unexpected exception',
          `name=${name}`,
          prismaCode ? `prismaCode=${prismaCode}` : null,
          method ? `method=${method}` : null,
          routePath ? `route=${routePath}` : null,
          url ? `url=${sanitizeLogFragment(url)}` : null,
          `message=${sanitizeLogFragment(rawMessage)}`,
        ]
          .filter((part): part is string => part !== null)
          .join(' '),
        stack ?? undefined,
      );
    } catch {
      // Logging must never break the sanitized 500 response.
    }
  }
}

function readPrismaCode(exception: unknown): string | null {
  if (typeof exception !== 'object' || exception === null) return null;
  const code = (exception as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

function sanitizeLogFragment(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/DATABASE_URL\s*=\s*\S+/gi, 'DATABASE_URL=[REDACTED]')
    .replace(
      /(password|passwd|pwd|secret|access[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token|reset[_-]?token|authorization|cookie|api[_-]?key|smtp[_-]?pass|cloudinary[_-]?secret)\s*[:=]\s*\S+/gi,
      '$1=[REDACTED]',
    )
    .slice(0, 2000);
}
