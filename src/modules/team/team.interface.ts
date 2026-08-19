import type { PaginationMeta } from '../../shared/pagination/pagination.interface.js';
import type { Team } from '../../../generated/prisma/client.js';

export type SafeTeamResponse = Pick<
  Team,
  'id' | 'name' | 'adminId' | 'createdAt' | 'updatedAt'
>;

export interface PaginatedTeamResponse {
  data: SafeTeamResponse[];
  meta: PaginationMeta;
}
