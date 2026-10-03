import {
  ConflictException,
  type ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { GlobalExceptionFilter } from '../../../src/shared/filters/global-exception.filter';
import { AppException } from '../../../src/shared/errors/app.exception';

const jestApi = import.meta.jest;

interface ResponseHarness {
  response: Response;
  status: jest.Mock;
  json: jest.Mock;
  setHeader: jest.Mock;
}

function createResponseHarness(): ResponseHarness {
  const json = jestApi.fn();
  const status = jestApi.fn().mockReturnValue({ json });
  const setHeader = jestApi.fn();
  const response = { status, setHeader } as unknown as Response;

  return { response, status, json, setHeader };
}

function createHost(response: Response): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ArgumentsHost;
}

describe('GlobalExceptionFilter', () => {
  const filter = new GlobalExceptionFilter();

  it('preserves known HTTP statuses in the shared envelope', () => {
    const { response, status, json } = createResponseHarness();

    filter.catch(
      new ConflictException('Resource conflict'),
      createHost(response),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Resource conflict',
      code: 'CONFLICT',
      details: null,
    });
  });

  it('hides internal details for unexpected failures', () => {
    const { response, status, json } = createResponseHarness();

    filter.catch(
      new Error('DATABASE_URL=secret SQL SELECT * FROM users'),
      createHost(response),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      details: null,
    });
  });

  it('adds a normalized Retry-After header for rate limit responses', () => {
    const { response, status, json, setHeader } = createResponseHarness();

    filter.catch(
      new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        'Too many requests.',
        { retryAfter: 41.2 },
      ),
      createHost(response),
    );

    expect(setHeader).toHaveBeenCalledWith('Retry-After', '42');
    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Too many requests.',
      code: 'RATE_LIMITED',
      details: { retryAfter: 41.2 },
    });
  });

  it('does not write unsafe Retry-After values', () => {
    const { response, setHeader } = createResponseHarness();

    filter.catch(
      new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'RATE_LIMITED',
        'Too many requests.',
        { retryAfter: Number.NaN },
      ),
      createHost(response),
    );

    expect(setHeader).not.toHaveBeenCalled();
  });

  it('logs unexpected failures with Prisma code while keeping response sanitized', () => {
    const { response, status, json } = createResponseHarness();
    const logged: string[] = [];
    const testFilter = new GlobalExceptionFilter();
    (
      testFilter as unknown as {
        logger: { error: (message: string, stack?: string) => void };
      }
    ).logger = {
      error: (message: string): void => {
        logged.push(message);
      },
    };

    const failure = Object.assign(new Error('transaction expired'), {
      code: 'P2028',
    });
    testFilter.catch(failure, createHost(response));

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
      details: null,
    });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('P2028');
    expect(logged[0]).toContain('transaction expired');
  });

  it('redacts connection strings from server logs', () => {
    const { response } = createResponseHarness();
    const logged: string[] = [];
    const testFilter = new GlobalExceptionFilter();
    (
      testFilter as unknown as {
        logger: { error: (message: string, stack?: string) => void };
      }
    ).logger = {
      error: (message: string): void => {
        logged.push(message);
      },
    };

    testFilter.catch(
      new Error('connect postgres://admin:s3cret@db:5432/app failed'),
      createHost(response),
    );

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('postgres://[REDACTED]');
    expect(logged[0]).not.toContain('s3cret');
  });
});
