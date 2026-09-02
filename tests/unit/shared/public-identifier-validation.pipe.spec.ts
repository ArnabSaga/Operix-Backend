import type { ArgumentMetadata } from '@nestjs/common';
import { APP_ERROR_CODE } from '../../../src/shared/errors/app-error-code.constant.js';
import { PublicIdentifierValidationPipe } from '../../../src/shared/identity/public-identifier-validation.pipe.js';

describe('PublicIdentifierValidationPipe', () => {
  const pipe = new PublicIdentifierValidationPipe();

  it('bypasses custom decorators (e.g. CurrentViewer) to preserve internal non-UUID IDs', () => {
    const customMetadata: ArgumentMetadata = {
      type: 'custom',
    };
    const viewerContext = {
      userId: 'user_cmabc123',
      role: 'MEMBER',
      status: 'ACTIVE',
      scope: {
        type: 'MEMBER',
        teamId: 'team_cmabc456',
      },
    };

    const result = pipe.transform(viewerContext, customMetadata);
    expect(result).toEqual(viewerContext);
  });

  it('accepts valid UUID v4 identifiers in body / query payloads', () => {
    const bodyMetadata: ArgumentMetadata = {
      type: 'body',
    };
    const payload = {
      taskId: '84a64118-f008-4fd8-b095-298519091db2',
      memberId: '84a64118-f008-4fd8-b095-298519091db2',
      teamId: '84a64118-f008-4fd8-b095-298519091db2',
    };

    const result = pipe.transform(payload, bodyMetadata);
    expect(result).toEqual(payload);
  });

  it('rejects invalid non-v4 identifiers in body / query payloads', () => {
    const bodyMetadata: ArgumentMetadata = {
      type: 'body',
    };
    const payload = {
      taskId: 'invalid-cuid-or-uuid',
    };

    try {
      pipe.transform(payload, bodyMetadata);
      throw new Error('Expected validation to fail.');
    } catch (error) {
      const exception = error as {
        getStatus: () => number;
        getResponse: () => { code: string };
      };
      expect(exception.getStatus()).toBe(400);
      expect(exception.getResponse().code).toBe(
        APP_ERROR_CODE.VALIDATION_ERROR,
      );
    }
  });

  it('ignores empty and whitespace strings for optional identifier query parameters', () => {
    const queryMetadata: ArgumentMetadata = {
      type: 'query',
    };
    const payload = {
      teamId: '',
      memberId: '   ',
      taskId: null,
      categoryId: undefined,
    };

    const result = pipe.transform(payload, queryMetadata);
    expect(result).toEqual(payload);
  });

  it('validates identifier when metadata.data is a public identifier field name', () => {
    const paramMetadata: ArgumentMetadata = {
      type: 'param',
      data: 'taskId',
    };

    const validResult = pipe.transform(
      '84a64118-f008-4fd8-b095-298519091db2',
      paramMetadata,
    );
    expect(validResult).toBe('84a64118-f008-4fd8-b095-298519091db2');

    expect(() => pipe.transform('invalid-task-id', paramMetadata)).toThrow();
  });
});
