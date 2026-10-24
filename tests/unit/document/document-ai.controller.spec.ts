import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { UserRole } from '../../../generated/prisma/enums';
import { DocumentAiController } from '../../../src/modules/document/document-ai.controller';
import type { DocumentAiService } from '../../../src/modules/document/document-ai.service';
import { AccountStatusGuard } from '../../../src/shared/auth/account-status.guard';
import { OPERIX_REQUIRED_ROLES_METADATA_KEY } from '../../../src/shared/auth/auth-metadata.constant';
import { OperixRoleGuard } from '../../../src/shared/auth/operix-role.guard';
import { ViewerContextGuard } from '../../../src/shared/auth/viewer-context.guard';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import { OperixUserThrottlerGuard } from '../../../src/shared/rate-limit/operix-user-throttler.guard';

const jestApi = import.meta.jest;

const THROTTLER_LIMIT_METADATA_KEY = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_METADATA_KEY = 'THROTTLER:TTLdefault';

function analyzeHandler(): object {
  const handlers = DocumentAiController.prototype as unknown as {
    analyzeDocument: object;
  };

  return handlers.analyzeDocument;
}

describe('DocumentAiController route contract', () => {
  it('is mounted on the documents surface with a document id parameter', () => {
    expect(Reflect.getMetadata(PATH_METADATA, DocumentAiController)).toBe(
      'documents',
    );
    expect(Reflect.getMetadata(PATH_METADATA, analyzeHandler())).toBe(
      ':documentId/ai-analysis',
    );
  });

  it('is a POST endpoint', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, analyzeHandler())).toBe(
      RequestMethod.POST,
    );
  });

  it('runs viewer, account-status, role, then per-user throttle guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DocumentAiController)).toEqual([
      ViewerContextGuard,
      AccountStatusGuard,
      OperixRoleGuard,
      OperixUserThrottlerGuard,
    ]);
  });
});

describe('DocumentAiController authorization contract', () => {
  it('permits every role that can view a Document', () => {
    expect(
      Reflect.getMetadata(OPERIX_REQUIRED_ROLES_METADATA_KEY, analyzeHandler()),
    ).toEqual([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER]);
  });
});

describe('DocumentAiController request budget', () => {
  it('caps analysis to four requests per minute per user', () => {
    expect(
      Reflect.getMetadata(THROTTLER_LIMIT_METADATA_KEY, analyzeHandler()),
    ).toBe(4);
    expect(
      Reflect.getMetadata(THROTTLER_TTL_METADATA_KEY, analyzeHandler()),
    ).toBe(60_000);
  });
});

describe('DocumentAiController delegation', () => {
  it('forwards the viewer and document id without a request body', () => {
    const analyzeDocument = jestApi.fn().mockResolvedValue({ summary: '' });
    const service = {
      analyzeDocument,
    } as unknown as DocumentAiService;
    const controller = new DocumentAiController(service);
    const viewer = {
      userId: 'admin-a',
      role: UserRole.ADMIN,
      status: 'ACTIVE',
      scope: { type: 'ADMIN', teamIds: ['team-a'] },
    } as unknown as OperixViewer;

    void controller.analyzeDocument(viewer, 'doc-public-a');

    expect(analyzeDocument).toHaveBeenCalledWith(viewer, 'doc-public-a');
  });
});
