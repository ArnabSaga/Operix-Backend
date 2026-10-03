import { UserRole, UserStatus } from '../../../generated/prisma/enums';
import type { OperixViewer } from '../../../src/shared/auth/viewer.interface';
import { buildDocumentScopeWhere } from '../../../src/modules/document/policies/document-scope.policy';

function memberViewer(userId: string): OperixViewer {
  return {
    userId,
    role: UserRole.MEMBER,
    status: UserStatus.ACTIVE,
    scope: { type: 'MEMBER', teamId: 'team-a' },
  };
}

function adminViewer(userId: string): OperixViewer {
  return {
    userId,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    scope: { type: 'ADMIN', teamIds: ['team-a'] },
  };
}

function superAdminViewer(): OperixViewer {
  return {
    userId: 'chief-a',
    role: UserRole.SUPER_ADMIN,
    status: UserStatus.ACTIVE,
    scope: { type: 'GLOBAL' },
  };
}

describe('buildDocumentScopeWhere', () => {
  it('restricts members to their own uploads plus legitimate sources', () => {
    expect(buildDocumentScopeWhere(memberViewer('member-a'))).toEqual({
      AND: [
        {
          OR: [
            { taskAttachments: { some: {} } },
            { submissionAttachments: { some: {} } },
          ],
        },
        { uploadedById: 'member-a' },
      ],
    });
  });

  it('gives admins own files plus current-team member files', () => {
    expect(buildDocumentScopeWhere(adminViewer('admin-a'))).toEqual({
      AND: [
        {
          OR: [
            { taskAttachments: { some: {} } },
            { submissionAttachments: { some: {} } },
          ],
        },
        {
          OR: [
            { uploadedById: 'admin-a' },
            {
              uploadedBy: {
                role: UserRole.MEMBER,
                teamMembership: { team: { adminId: 'admin-a' } },
              },
            },
          ],
        },
      ],
    });
  });

  it('gives super admins every legitimate document with no owner constraint', () => {
    expect(buildDocumentScopeWhere(superAdminViewer())).toEqual({
      OR: [
        { taskAttachments: { some: {} } },
        { submissionAttachments: { some: {} } },
      ],
    });
  });
});
