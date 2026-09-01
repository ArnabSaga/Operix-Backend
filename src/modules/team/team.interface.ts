import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';
export interface SafeTeamResponse {
  id: string;
  name: string;
  adminId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedTeamResponse {
  data: SafeTeamResponse[];
  meta: PaginationMeta;
}
