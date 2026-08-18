import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { UserRole } from '../../../generated/prisma/enums.js';
import type { OperixViewer, OperixViewerScope } from './auth.interface.js';

@Injectable()
export class OperixAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async getViewer(userId: string): Promise<OperixViewer> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        status: true,
        administeredTeams: {
          select: {
            id: true,
          },
        },
        teamMembership: {
          select: {
            teamId: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        message: 'Authentication required.',
        code: 'AUTH_REQUIRED',
        details: null,
      });
    }

    return {
      userId: user.id,
      role: user.role,
      status: user.status,
      scope: this.resolveScope({
        role: user.role,
        administeredTeamIds: user.administeredTeams.map((team) => team.id),
        memberTeamId: user.teamMembership?.teamId ?? null,
      }),
    };
  }

  resolveScope(input: {
    role: UserRole;
    administeredTeamIds: string[];
    memberTeamId: string | null;
  }): OperixViewerScope {
    if (input.role === UserRole.SUPER_ADMIN) {
      return { type: 'GLOBAL' };
    }

    if (input.role === UserRole.ADMIN) {
      return {
        type: 'ADMIN',
        teamIds: input.administeredTeamIds,
      };
    }

    return {
      type: 'MEMBER',
      teamId: input.memberTeamId,
    };
  }
}
