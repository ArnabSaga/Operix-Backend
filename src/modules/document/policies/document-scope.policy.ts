import type { Prisma } from '../../../../generated/prisma/client.js';
import { UserRole } from '../../../../generated/prisma/enums.js';
import type { OperixViewer } from '../../../shared/auth/viewer.interface.js';

/**
 * A FileAsset is a legitimate library document only when it is linked to a
 * supported operational source. Orphan uploads must never appear in
 * Documents and must never become downloadable through document scope.
 */
function legitimateDocumentWhere(): Prisma.FileAssetWhereInput {
  return {
    OR: [
      { taskAttachments: { some: {} } },
      { submissionAttachments: { some: {} } },
    ],
  };
}

/**
 * Role-scoped Documents predicate over FileAsset.
 *
 * MEMBER sees only files they uploaded. ADMIN sees their own files plus
 * files uploaded by MEMBERs whose current Team membership belongs to a Team
 * the ADMIN administers (dynamic — evaluated at query time, never
 * snapshotted). SUPER_ADMIN sees every legitimate document.
 *
 * This intentionally includes GLOBAL-origin files uploaded by a current team
 * Member. Documents access is document-level only and grants no Task,
 * Submission, review, or mutation authority.
 */
export function buildDocumentScopeWhere(
  viewer: OperixViewer,
): Prisma.FileAssetWhereInput {
  if (viewer.role === UserRole.SUPER_ADMIN) {
    return legitimateDocumentWhere();
  }

  if (viewer.role === UserRole.ADMIN) {
    return {
      AND: [
        legitimateDocumentWhere(),
        {
          OR: [
            { uploadedById: viewer.userId },
            {
              uploadedBy: {
                role: UserRole.MEMBER,
                teamMembership: {
                  team: { adminId: viewer.userId },
                },
              },
            },
          ],
        },
      ],
    };
  }

  return {
    AND: [legitimateDocumentWhere(), { uploadedById: viewer.userId }],
  };
}
