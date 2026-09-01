import type { UserRole, UserStatus } from '../../../generated/prisma/enums.js';
import type { OperixViewerScope } from './scope/viewer-scope.interface.js';

export interface OperixViewer {
  userId: string;
  role: UserRole;
  status: UserStatus;
  scope: OperixViewerScope;
}

export interface OperixViewerResponse {
  userId: string;
  role: UserRole;
  status: UserStatus;
  scope:
    | { type: 'GLOBAL' }
    | { type: 'ADMIN'; teamIds: string[] }
    | { type: 'MEMBER'; teamId: string | null };
}
