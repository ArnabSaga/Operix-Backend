import {
  ConflictException,
  type ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { GlobalExceptionFilter } from '../../../src/shared/filters/global-exception.filter';

interface ResponseHarness {
  response: Response;
  status: jest.Mock;
  json: jest.Mock;
}

function createResponseHarness(): ResponseHarness {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status } as unknown as Response;

  return { response, status, json };
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
});
