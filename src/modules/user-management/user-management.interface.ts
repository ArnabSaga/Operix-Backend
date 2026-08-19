import type { UserRole, UserStatus } from '../../../generated/prisma/enums.js';

export interface SafeUserResponse {
  id: string;
  name: string;
  email: string;
  employeeId: string | null;
  designation: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResponse<TData> {
  data: TData[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
