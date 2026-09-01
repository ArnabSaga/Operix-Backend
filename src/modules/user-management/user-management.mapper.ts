import type { Prisma } from '../../../generated/prisma/client.js';
import { adminSelect } from './admin/admin.select.js';
import type { SafeUserResponse } from './user-management.interface.js';

export type SelectedSafeUser = Prisma.UserGetPayload<{
  select: typeof adminSelect;
}>;

export function mapSafeUser(user: SelectedSafeUser): SafeUserResponse {
  return {
    id: user.publicId,
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    designation: user.designation,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
