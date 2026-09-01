import type { Prisma } from '../../../generated/prisma/client.js';
import type { SafeTeamResponse } from './team.interface.js';
import { teamSelect } from './team.select.js';

type SelectedTeam = Prisma.TeamGetPayload<{ select: typeof teamSelect }>;

export function mapTeamResponse(team: SelectedTeam): SafeTeamResponse {
  return {
    id: team.publicId,
    name: team.name,
    adminId: team.admin.publicId,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
}
